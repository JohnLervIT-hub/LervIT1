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
}

interface InitiateCallResult {
  callControlId?: string;
  error?: string;
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
        webhook_url: `${process.env.APP_BASE_URL ?? 'https://app.lervit.com'}/api/nova/webhook`,
        webhook_url_method: 'POST',
        custom_headers: [
          { name: 'X-Nova-Type', value: opts.callType },
          { name: 'X-Nova-Entity-Id', value: opts.entityId },
        ],
        answering_machine_detection: 'disabled',
      });

      const callControlId = call.data?.call_control_id;
      const callLegId = call.data?.call_leg_id;

      const metadataBookingId =
        typeof opts.metadata.bookingId === 'string' ? opts.metadata.bookingId : null;

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
      quoteAmount?: number;
      pickupArea?: string;
      dropoffArea?: string;
    },
    options?: AgentRunOptions,
  ) {
    const { allowed, reason } = this.checkCallHours();
    if (!allowed) return { skipped: true, reason };

    if (options?.dryRun) return { dryRun: true, leadId: input.leadId };

    const lead = await db
      .select()
      .from(leads)
      .where(eq(leads.id, input.leadId))
      .limit(1);

    if (!lead[0]?.contactPhone) return { skipped: true, reason: 'no_phone' };

    const consentSources = ['quote_form', 'manual'];
    if (!consentSources.includes(lead[0].sourceChannel ?? '')) {
      return { skipped: true, reason: 'no_consent' };
    }

    return this.initiateCall({
      to: lead[0].contactPhone,
      entityId: input.leadId,
      entityType: 'lead',
      callType: 'lead_conversion',
      metadata: {
        leadId: input.leadId,
        customerName: lead[0].contactName ?? 'there',
        quoteAmount: input.quoteAmount,
        pickupArea: input.pickupArea,
        dropoffArea: input.dropoffArea,
      },
    });
  }

  async callMoverCold(
    input: {
      leadId: string;
      phone: string;
      name?: string;
      sourceChannel?: string;
    },
    options?: AgentRunOptions,
  ) {
    const { allowed, reason } = this.checkCallHours();
    if (!allowed) return { skipped: true, reason };

    if (options?.dryRun) {
      return {
        dryRun: true,
        would: 'call_mover_cold',
        leadId: input.leadId,
        phone: input.phone,
      };
    }

    const { contacted } = await wasContactedToday({
      entityId: input.leadId,
      entityType: 'lead',
      eventTypes: ['nova.cold_call_initiated'],
    });
    if (contacted) {
      return { skipped: true, reason: 'already_called_today' };
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

    logger.info(
      { leadId: input.leadId, phone: input.phone, name },
      '[Nova] Initiating mover cold call',
    );

    const result = await this.initiateCall({
      to: input.phone,
      entityId: input.leadId,
      entityType: 'lead',
      callType: 'mover_cold_intro',
      metadata: {
        leadId: input.leadId,
        moverName: name,
        sourceChannel: input.sourceChannel,
        script: `Hi ${name}, this is Nova from LervIT Moving in Calgary. I saw your listing and wanted to reach out about earning extra income with your vehicle. Do you have a quick minute?`,
      },
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
