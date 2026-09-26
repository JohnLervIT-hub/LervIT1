/**
 * Nova Clarke (VOICE) — outbound voice concierge.
 *
 * Actions:
 *   - `call_mover_dispatch`   : dial a mover to hand off a live job.
 *   - `call_lead_conversion`  : follow up on a warm lead by phone.
 *   - `call_review_request`   : post-move review nudge for the customer.
 *   - `check_call_hours`      : returns whether MT is inside 8am–9pm.
 *
 * Calls are placed through Telnyx Call Control (`.calls.dial()`) and every
 * outbound leg is logged to `voice_calls` before the call rings so webhook
 * status updates can find their row.
 */

import { eq } from 'drizzle-orm';
import Telnyx from 'telnyx';
import { BaseAgent, type AgentRunOptions } from './base';
import { db } from '../db';
import { bookings, leads, movers, users, voiceCalls } from '@shared/schema';
import { emitEvent } from '../events';
import { logger } from '../logger';
import { wasContactedToday } from './dedupe';
import { novaCallContextStore } from '../nova-webhook-routes';
import type { NovaCallContext } from '../lib/novaBridge';
import {
  buildResumeBrief,
  recordCallStage,
  startCallContext,
} from '../lib/novaCallState';
import { agentEventBus } from '../lib/agentEventBus';
import { createAgentQueue, QUEUE_NAMES } from './queue';

const NOVA_PHONE = process.env.TELNYX_PHONE_NUMBER ?? '+18889820885';
const TELNYX_CONNECTION_ID = process.env.TELNYX_CONNECTION_ID;

const CALL_HOURS_START = 8;
const CALL_HOURS_END = 21;

const VEHICLE_LABELS: Record<string, string> = {
  A: 'SUV',
  B: 'pickup truck',
  C: 'cargo van',
  E: 'moving truck',
};

interface CallHoursResult {
  allowed: boolean;
  reason?: string;
}

interface InitiateCallOpts {
  to: string;
  entityId: string;
  entityType: string;
  callType: string;
  metadata: Record<string, unknown>;
  // Extra bridge context merged over what we derive from `metadata` — used by
  // the drop-recovery path to hand the bridge its resume opening and goal.
  context?: Partial<NovaCallContext>;
}

interface InitiateCallResult {
  callControlId?: string;
  error?: string;
}

// Hour (MT) a rescheduled call is retried at — inside CALL_HOURS_START..END.
const RESCHEDULE_HOUR_MT = 9;

/**
 * Next instant at which it is RESCHEDULE_HOUR_MT in Calgary.
 *
 * Naively doing `new Date(now.toLocaleString(..., {timeZone}))` then
 * `.getTime()` returns Calgary wall-clock reinterpreted as the server's zone
 * (UTC in prod), which is off by the MT offset — a 9pm reschedule would fire
 * at 3am MT and bounce out of hours again, forever. So we measure that shift
 * and add it back.
 */
function nextCallWindowStart(now = new Date()): Date {
  const mtNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
  const zoneShiftMs = now.getTime() - mtNow.getTime();

  const target = new Date(mtNow);
  // Past the window → tomorrow morning. Before it → later the same morning.
  if (mtNow.getHours() >= CALL_HOURS_END) {
    target.setDate(target.getDate() + 1);
  }
  target.setHours(RESCHEDULE_HOUR_MT, 0, 0, 0);

  return new Date(target.getTime() + zoneShiftMs);
}

export class NovaAgent extends BaseAgent {
  name = 'Nova Clarke';
  code = 'nova';

  private telnyx: Telnyx;

  constructor() {
    super();
    this.telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY ?? '' });
  }

  protected async execute(
    action: string,
    input: Record<string, any>,
    options?: AgentRunOptions,
  ): Promise<any> {
    switch (action) {
      case 'call_mover_dispatch':
        return this.callMoverDispatch(input as any, options);
      case 'call_lead_conversion':
        return this.callLeadConversion(input as any, options);
      case 'call_mover_cold':
        return this.callMoverCold(input as any, options);
      case 'call_review_request':
        return this.callReviewRequest(input as any, options);
      case 'check_call_hours':
        return {
          ...this.checkCallHours(),
          currentTimeMT: new Date().toLocaleString('en-US', {
            timeZone: 'America/Edmonton',
          }),
        };
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  checkCallHours(): CallHoursResult {
    const mtHour = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }),
    ).getHours();

    if (mtHour < CALL_HOURS_START) return { allowed: false, reason: 'before_8am_mt' };
    if (mtHour >= CALL_HOURS_END) return { allowed: false, reason: 'after_9pm_mt' };
    return { allowed: true };
  }

  private async initiateCall(opts: InitiateCallOpts): Promise<InitiateCallResult> {
    if (!TELNYX_CONNECTION_ID) {
      logger.error('[Nova] TELNYX_CONNECTION_ID not set');
      return { error: 'no_connection_id' };
    }

    try {
      const call = await this.telnyx.calls.dial({
        connection_id: TELNYX_CONNECTION_ID,
        to: opts.to,
        from: NOVA_PHONE,
        webhook_url: `${(
          process.env.APP_BASE_URL ?? 'https://app.lervit.com'
        ).trim()}/api/nova/webhook`,
        webhook_url_method: 'POST',
        custom_headers: [
          { name: 'X-Nova-Type', value: opts.callType },
          { name: 'X-Nova-Entity-Id', value: opts.entityId },
        ],
        answering_machine_detection: 'disabled',
      });

      const callControlId = call.data?.call_control_id;
      const callLegId = call.data?.call_leg_id;

      // Seed the bridge with rich per-call context so its greeting can name
      // the customer and its prompt can reflect the callType goal. Keyed by
      // callControlId — the WS upgrade handler in routes.ts reads it back.
      if (callControlId) {
        const meta = opts.metadata as Record<string, unknown>;
        const rawName = meta.customerName ?? meta.moverName;
        const rawPrice = meta.quoteAmount ?? meta.earnings;
        novaCallContextStore.set(callControlId, {
          callType: opts.callType,
          customerName: typeof rawName === 'string' ? rawName : undefined,
          pickupAddress:
            typeof meta.pickupArea === 'string' ? meta.pickupArea : undefined,
          dropoffAddress:
            typeof meta.dropoffArea === 'string' ? meta.dropoffArea : undefined,
          price:
            typeof rawPrice === 'number' || typeof rawPrice === 'string'
              ? String(rawPrice)
              : undefined,
          leadId: typeof meta.leadId === 'string' ? meta.leadId : undefined,
          ...opts.context,
        });
      }

      const metadataBookingId =
        typeof opts.metadata.bookingId === 'string' ? opts.metadata.bookingId : null;

      const leadId =
        opts.entityType === 'lead'
          ? opts.entityId
          : typeof opts.metadata.leadId === 'string'
            ? opts.metadata.leadId
            : null;

      await db
        .insert(voiceCalls)
        .values({
          telnyxCallControlId: callControlId ?? null,
          telnyxCallLegId: callLegId ?? null,
          fromNumber: NOVA_PHONE,
          toNumber: opts.to,
          direction: 'outbound',
          status: 'initiated',
          bookingId: metadataBookingId,
          leadId,
        })
        .catch((err) => logger.warn({ err }, '[Nova] Failed to log call'));

      await emitEvent(
        'nova.call_initiated',
        opts.entityType,
        opts.entityId,
        { callControlId, callType: opts.callType, ...opts.metadata },
        'agent',
      );

      logger.info(
        { to: opts.to, callType: opts.callType, callControlId },
        '[Nova] Call initiated',
      );

      return { callControlId };
    } catch (err: any) {
      logger.error({ err, to: opts.to }, '[Nova] Call initiation failed');
      return { error: err?.message ?? 'call_failed' };
    }
  }

  async callMoverDispatch(
    input: {
      bookingId: string;
      moverId: string;
      earnings: number;
      pickupArea: string;
      dropoffArea: string;
      vehicleClass?: string;
      startTime?: string;
    },
    options?: AgentRunOptions,
  ) {
    const { allowed, reason } = this.checkCallHours();
    if (!allowed) return { skipped: true, reason };

    if (options?.dryRun) {
      return {
        dryRun: true,
        would: 'call_mover_dispatch',
        moverId: input.moverId,
        bookingId: input.bookingId,
        earnings: input.earnings,
      };
    }

    const moverData = await db
      .select({ phone: users.phone, name: users.name })
      .from(movers)
      .innerJoin(users, eq(users.id, movers.userId))
      .where(eq(movers.id, input.moverId))
      .limit(1);

    if (!moverData[0]?.phone) return { skipped: true, reason: 'no_phone' };

    const vehicleLabel = VEHICLE_LABELS[input.vehicleClass ?? 'B'] ?? 'vehicle';

    return this.initiateCall({
      to: moverData[0].phone,
      entityId: input.moverId,
      entityType: 'mover',
      callType: 'mover_dispatch',
      metadata: {
        bookingId: input.bookingId,
        moverId: input.moverId,
        moverName: moverData[0].name,
        earnings: input.earnings,
        pickupArea: input.pickupArea,
        dropoffArea: input.dropoffArea,
        vehicleLabel,
        startTime: input.startTime ?? 'soon',
      },
    });
  }

  async callLeadConversion(
    input: {
      leadId: string;
      // Callers that already hold a verified number (the DM handoff, the
      // abandoned-quote sweep) pass it rather than relying on the lead row.
      phone?: string;
      name?: string;
      quoteAmount?: number | string;
      pickupArea?: string;
      dropoffArea?: string;
      // Set when this run is itself a retry, so an out-of-hours retry gives up
      // instead of rescheduling forever.
      rescheduled?: boolean;
    },
    options?: AgentRunOptions,
  ) {
    const { allowed, reason } = this.checkCallHours();
    if (!allowed) {
      // Out of hours used to drop the lead silently with no retry.
      if (options?.dryRun || input.rescheduled) {
        return { skipped: true, reason };
      }

      const fireAt = nextCallWindowStart();
      const delayMs = Math.max(0, fireAt.getTime() - Date.now());

      // TODO: same restart-safety caveat as the rest of the chain — an
      // in-process timer does not survive a deploy. Bull queue in Sprint 5.
      setTimeout(() => {
        this.callLeadConversion({ ...input, rescheduled: true }, options).catch((err) =>
          logger.error({ err, leadId: input.leadId }, '[Nova] rescheduled call failed'),
        );
      }, delayMs);

      logger.info(
        { leadId: input.leadId, reason, scheduledFor: fireAt.toISOString() },
        '[Nova] call_lead_conversion rescheduled to next call window',
      );

      return {
        skipped: true,
        reason: 'rescheduled',
        outOfHoursReason: reason,
        scheduledFor: fireAt.toISOString(),
      };
    }

    if (options?.dryRun) return { dryRun: true, leadId: input.leadId };

    const lead = await db
      .select()
      .from(leads)
      .where(eq(leads.id, input.leadId))
      .limit(1);

    // Prefer the caller's number: a DM can capture a phone the lead row does
    // not carry yet, which used to skip the call as 'no_phone'.
    const phone = input.phone?.trim() || lead[0]?.contactPhone;
    if (!phone) return { skipped: true, reason: 'no_phone' };

    // Consent-by-inbound-contact: every channel below represents the
    // customer initiating contact (form submit, DM, voice, SMS reply), so
    // returning their call is expected, not cold outreach.
    const consentSources = [
      'quote_form',
      'manual',
      'instagram_dm',
      'messenger_dm',
      'nova_voice',
      'sms',
    ];
    if (!consentSources.includes(lead[0].sourceChannel ?? '')) {
      logger.info(
        {
          leadId: input.leadId,
          sourceChannel: lead[0].sourceChannel,
          reason: 'no_consent',
        },
        '[Nova] call_lead_conversion skipped — no consent',
      );
      return { skipped: true, reason: 'no_consent' };
    }

    const result = await this.initiateCall({
      to: phone,
      entityId: input.leadId,
      entityType: 'lead',
      callType: 'lead_conversion',
      metadata: {
        leadId: input.leadId,
        customerName: input.name ?? lead[0].contactName ?? 'there',
        quoteAmount: input.quoteAmount,
        pickupArea: input.pickupArea,
        dropoffArea: input.dropoffArea,
      },
    });

    // A failed dial returns {error} rather than throwing, so the caller's
    // .catch() never fires and the lead was dropped with nothing but a log.
    if (result.error) {
      await this.escalateCallFailure(input.leadId, phone, result.error);
    }

    return result;
  }

  /** Page Xavier when a lead call could not be placed. */
  private async escalateCallFailure(leadId: string, phone: string, error: string) {
    logger.error({ leadId, error }, '[Nova] lead call failed — escalating to Xavier');

    // agentEventBus, not emitEvent: the 'agent.escalation_needed' handler that
    // reaches Xavier is a bus subscriber. emitEvent only writes business_events,
    // which would file an audit row that pages nobody.
    await agentEventBus
      .emit(
        'agent.escalation_needed',
        {
          agentName: 'Nova Clarke',
          severity: 'medium',
          issue: `Nova could not place a lead conversion call (${error})`,
          reason: 'call_failed',
          leadId,
          phone,
        },
        'nova',
      )
      .catch((err) => logger.error({ err, leadId }, '[Nova] escalation emit failed'));
  }

  /**
   * Cold-call a mover candidate.
   *
   * Drop recovery: the Telnyx `call.hangup` handler re-enqueues this action
   * with an incremented `retryCount` when a call dies in its first seconds.
   * A retry is not a fresh call — it reads `leads.call_context` and opens by
   * acknowledging the disconnect, resuming from the furthest stage the earlier
   * call reached.
   */
  async callMoverCold(
    input: {
      leadId: string;
      phone: string;
      name?: string;
      sourceChannel?: string;
      // Set when this run is itself an out-of-hours reschedule, so it doesn't
      // reschedule itself forever.
      rescheduled?: boolean;
      // Drop-recovery attempt number, carried on the job the call.hangup
      // handler re-enqueues. Absent or 0 means this is a first dial.
      retryCount?: number;
    },
    options?: AgentRunOptions,
  ) {
    const retryCount = input.retryCount ?? 0;
    const isRetry = retryCount > 0;

    const { allowed, reason } = this.checkCallHours();
    if (!allowed) {
      if (!input.rescheduled) {
        // Re-enqueue on the BullMQ queue so the call survives deploys.
        const fireAt = nextCallWindowStart();
        const delayMs = Math.max(0, fireAt.getTime() - Date.now());
        const novaQueue = createAgentQueue(QUEUE_NAMES.VOICE_AGENT);
        if (novaQueue) {
          await novaQueue.add(
            'call_mover_cold',
            { ...input, rescheduled: true },
            // Suffix retries: a drop-recovery re-dial that lands out of hours
            // would otherwise collide with the first call's reschedule jobId
            // and be dropped as a duplicate.
            {
              delay: delayMs,
              jobId: `nova_cold_reschedule_${input.leadId}${isRetry ? `_r${retryCount}` : ''}`,
            },
          );
          logger.info(
            { leadId: input.leadId, scheduledFor: fireAt.toISOString() },
            '[Nova] call_mover_cold rescheduled to next call window',
          );
        }
      }
      return { skipped: true, reason, rescheduled: !input.rescheduled };
    }

    if (options?.dryRun) {
      return {
        dryRun: true,
        would: 'call_mover_cold',
        leadId: input.leadId,
        phone: input.phone,
        retryCount,
      };
    }

    // A drop-recovery re-dial is the same call continuing, so it has to be
    // exempt from the daily dedupe — the first leg already emitted
    // nova.cold_call_initiated minutes ago and would block every retry.
    if (!isRetry) {
      const { contacted } = await wasContactedToday({
        entityId: input.leadId,
        entityType: 'lead',
        eventTypes: ['nova.cold_call_initiated'],
      });
      if (contacted) {
        return { skipped: true, reason: 'already_called_today' };
      }
    }

    const lead = await db
      .select()
      .from(leads)
      .where(eq(leads.id, input.leadId))
      .limit(1);

    if (!lead[0]) {
      return { skipped: true, reason: 'lead_not_found' };
    }

    if (['converted', 'cold', 'lost'].includes(lead[0].status ?? '')) {
      return { skipped: true, reason: `lead_${lead[0].status}` };
    }

    const name = input.name ?? lead[0].contactName ?? 'there';

    // Mid-call memory from the leg that dropped. Only consulted on a retry: on
    // a first dial a stale context from weeks ago would have Nova open as if
    // the last call had just cut out.
    const priorContext = isRetry ? lead[0].callContext : null;

    // They already heard the pitch and turned it down before the line dropped
    // — re-dialling is the retry loop pestering someone who said no.
    if (priorContext?.interested === false) {
      logger.info(
        { leadId: input.leadId, retryCount },
        '[Nova] cold call retry skipped — lead already declined',
      );
      return { skipped: true, reason: 'declined_previously' };
    }

    const resume = priorContext ? buildResumeBrief(priorContext, name) : null;

    const script = resume
      ? `${resume.opening} ${resume.goal}`
      : `Hi ${name}, this is Nova from LervIT Moving in Calgary. I saw your listing and wanted to reach out about earning extra income with your vehicle. Do you have a quick minute?`;

    logger.info(
      {
        leadId: input.leadId,
        phone: input.phone,
        name,
        retryCount,
        resumeStage: priorContext?.stage,
      },
      isRetry
        ? '[Nova] Re-dialling dropped mover cold call'
        : '[Nova] Initiating mover cold call',
    );

    // Record the attempt before it rings: if the dial itself fails, the retry
    // budget still reflects that this attempt was spent. A first dial starts a
    // new memory; a retry keeps the stage the dropped leg reached.
    if (isRetry) {
      await recordCallStage(input.leadId, { retryCount });
    } else {
      await startCallContext(input.leadId);
    }

    const result = await this.initiateCall({
      to: input.phone,
      entityId: input.leadId,
      entityType: 'lead',
      callType: 'mover_cold_intro',
      metadata: {
        leadId: input.leadId,
        moverName: name,
        sourceChannel: input.sourceChannel,
        retryCount,
        resumeStage: priorContext?.stage,
        script,
      },
      context: resume
        ? {
            resume: {
              stage: priorContext?.stage,
              retryCount,
              opening: resume.opening,
              goal: resume.goal,
            },
          }
        : undefined,
    });

    if (result.callControlId) {
      await emitEvent(
        'nova.cold_call_initiated',
        'lead',
        input.leadId,
        {
          callControlId: result.callControlId,
          callType: 'mover_cold_intro',
          phone: input.phone,
          retryCount,
        },
        'agent',
      );
    }

    return result;
  }

  async callReviewRequest(input: { bookingId: string }, options?: AgentRunOptions) {
    const { allowed, reason } = this.checkCallHours();
    if (!allowed) return { skipped: true, reason };

    if (options?.dryRun) return { dryRun: true };

    const booking = await db
      .select({ phone: users.phone, name: users.name })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.customerId))
      .where(eq(bookings.id, input.bookingId))
      .limit(1);

    if (!booking[0]?.phone) return { skipped: true, reason: 'no_phone' };

    return this.initiateCall({
      to: booking[0].phone,
      entityId: input.bookingId,
      entityType: 'booking',
      callType: 'review_request',
      metadata: {
        bookingId: input.bookingId,
        customerName: booking[0].name,
        reviewUrl: 'https://g.page/r/lervit/review',
      },
    });
  }
}

export const nova = new NovaAgent();
