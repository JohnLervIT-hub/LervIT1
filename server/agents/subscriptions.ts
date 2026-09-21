/**
 * Agent event subscriptions — wires every autonomous agent to the events it
 * cares about. Called once at server startup from server/index.ts.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { agentEventBus } from '../lib/agentEventBus';
import { db } from '../db';
import { bookings, jobNotifications } from '@shared/schema';
import { jordan } from './jordan';
import { riley } from './riley';
import { reid } from './reid';
import { aegis } from './aegis';
import { victor } from './victor';
import { mark } from './mark';
import { nova } from './nova';
import { alex } from './alex';
import { sam } from './sam';
import { kai } from './kai';
import { ember } from './ember';
import { xavier } from './xavier';
import { logger } from '../logger';
import { buildCustomerContext } from '../lib/novaContext';
import { notificationService } from '../notifications';

export function registerAgentSubscriptions(): void {
  logger.info('[EventBus] Registering agent subscriptions...');

  // ═══════════════════════════════
  // SUPPLY CHAIN
  // ═══════════════════════════════

  // Ryan finds mover → Jordan qualifies
  agentEventBus.subscribe(
    'ryan.lead_found',
    async (data) => {
      logger.info(
        { leadId: data.leadId },
        '[EventBus] ryan→jordan: qualify',
      );

      await jordan
        .run('onboard_candidate', { leadId: data.leadId }, { dryRun: false })
        .catch((err) =>
          logger.error({ err }, '[EventBus] jordan qualify failed'),
        );
    },
    'Jordan Hayes',
  );

  // Mover uploads doc → Reid reviews
  agentEventBus.subscribe(
    'mover.document_uploaded',
    async (data) => {
      logger.info(
        {
          moverId: data.moverId,
          documentType: data.documentType,
        },
        '[EventBus] doc→reid: review',
      );

      await reid
        .run(
          'review_document',
          {
            moverId: data.moverId,
            documentType: data.documentType,
            documentUrl: data.documentUrl,
            verificationItemId: data.verificationItemId,
          },
          { dryRun: false },
        )
        .catch((err) =>
          logger.error({ err }, '[EventBus] reid review failed'),
        );
    },
    'Reid Calloway',
  );

  // Reid approves all docs → Riley welcome + Aegis activate
  agentEventBus.subscribe(
    'reid.all_documents_approved',
    async (data) => {
      logger.info(
        { moverId: data.moverId },
        '[EventBus] all_docs→riley+aegis',
      );

      await riley
        .run('mover_verified', { moverId: data.moverId }, { dryRun: false })
        .catch((err) =>
          logger.error({ err }, '[EventBus] riley welcome failed'),
        );

      await aegis
        .run(
          'scan_dispatch_eligibility',
          { moverId: data.moverId },
          { dryRun: false },
        )
        .catch((err) => logger.error({ err }, '[EventBus] aegis scan failed'));
    },
    'Riley + Aegis',
  );

  // ═══════════════════════════════
  // DEMAND CHAIN
  // ═══════════════════════════════

  // Booking created → Victor dispatch + Mark monitor
  agentEventBus.subscribe(
    'booking.created',
    async (data) => {
      logger.info(
        { bookingId: data.bookingId },
        '[EventBus] booking→victor+mark',
      );

      await victor
        .run('dispatch', { bookingId: data.bookingId }, { dryRun: false })
        .catch((err) =>
          logger.error({ err }, '[EventBus] victor dispatch failed'),
        );

      await mark
        .run('check_booking', { bookingId: data.bookingId }, { dryRun: false })
        .catch((err) =>
          logger.error({ err }, '[EventBus] mark monitor failed'),
        );
    },
    'Victor + Mark',
  );

  // No mover accepted → Nova phones the movers we already notified, closest
  // first, spaced out, stopping the moment someone takes the job.
  const NO_ACCEPTANCE_CALL_GAP_MS = 2 * 60 * 1000;
  const NO_ACCEPTANCE_MAX_CALLS = 3;

  agentEventBus.subscribe(
    'booking.no_acceptance',
    async (data) => {
      const bookingId: string | undefined = data.bookingId;
      if (!bookingId) return;

      logger.info({ bookingId }, '[EventBus] no_accept→nova');

      // Movers already notified who never took it. 'declined' is excluded —
      // they said no, so calling them back is wasted outreach. By the time
      // Victor escalates most rows have aged to 'expired'.
      const candidates = await db
        .select({
          moverId: jobNotifications.moverId,
          estimatedEarnings: jobNotifications.estimatedEarnings,
        })
        .from(jobNotifications)
        .where(
          and(
            eq(jobNotifications.bookingId, bookingId),
            inArray(jobNotifications.status, ['pending', 'expired']),
          ),
        )
        .orderBy(asc(jobNotifications.distanceToPickup))
        .limit(NO_ACCEPTANCE_MAX_CALLS);

      if (candidates.length === 0) {
        logger.info({ bookingId }, '[EventBus] no_accept: no callable movers');
        return;
      }

      // Detached on purpose: the bus awaits its handlers and Victor awaits the
      // emit, so sleeping between calls here would stall his escalation for
      // minutes. Same restart caveat as the other in-process timers.
      void (async () => {
        for (let i = 0; i < candidates.length; i++) {
          if (i > 0) {
            await new Promise((r) => setTimeout(r, NO_ACCEPTANCE_CALL_GAP_MS));
          }

          // Re-check before every dial — if someone accepted in the meantime,
          // calling the next mover would be selling a job that is already gone.
          const [booking] = await db
            .select({ moverId: bookings.moverId, status: bookings.status })
            .from(bookings)
            .where(eq(bookings.id, bookingId))
            .limit(1);

          if (!booking) return;
          if (booking.moverId) {
            logger.info(
              { bookingId, calledSoFar: i },
              '[EventBus] no_accept: booking assigned — stopping calls',
            );
            return;
          }
          if (booking.status === 'cancelled') return;

          const candidate = candidates[i];
          const result = await nova
            .run(
              'call_mover_dispatch',
              {
                bookingId,
                moverId: candidate.moverId,
                earnings: Number(candidate.estimatedEarnings ?? 0),
                pickupArea: data.pickupArea,
                dropoffArea: data.dropoffArea,
                startTime: data.preferredDate,
              },
              { dryRun: false },
            )
            .catch((err) => {
              logger.error(
                { err, bookingId, moverId: candidate.moverId },
                '[EventBus] nova dispatch failed',
              );
              return null;
            });

          // Out of hours applies to every mover equally — stop rather than
          // burning the remaining gaps on calls that will all skip.
          const reason = (result as any)?.reason;
          if (reason === 'before_8am_mt' || reason === 'after_9pm_mt') {
            logger.info({ bookingId, reason }, '[EventBus] no_accept: outside call hours');
            return;
          }
        }
      })().catch((err) =>
        logger.error({ err, bookingId }, '[EventBus] no_accept call chain crashed'),
      );
    },
    'Nova Clarke',
  );

  // Booking completed → Kai retain + Nova review call (delayed 2h)
  agentEventBus.subscribe(
    'booking.completed',
    async (data) => {
      logger.info(
        { bookingId: data.bookingId, customerId: data.customerId },
        '[EventBus] completed→kai+nova',
      );

      await kai
        .run(
          'send_customer_winback',
          { customerId: data.customerId, bookingId: data.bookingId },
          { dryRun: false },
        )
        .catch((err) => logger.error({ err }, '[EventBus] kai winback failed'));

      // Nova schedules review call 2 hours after completion.
      // TODO Sprint 5: replace with Bull queue delayed job for restart-safe delays
      setTimeout(
        async () => {
          await nova
            .run(
              'call_review_request',
              { customerId: data.customerId, bookingId: data.bookingId },
              { dryRun: false },
            )
            .catch((err) =>
              logger.error({ err }, '[EventBus] nova review failed'),
            );
        },
        2 * 60 * 60 * 1000,
      );
    },
    'Kai + Nova',
  );

  // ═══════════════════════════════
  // LEAD CHAIN
  // ═══════════════════════════════

  // DM human handoff → Nova voice close within 5 minutes.
  // Falls back to SMS if we're outside call hours; John is only notified
  // upstream when no phone was captured during the DM.
  agentEventBus.subscribe(
    'nova.call_dm_handoff',
    async (data) => {
      logger.info(
        { leadId: data.leadId, phone: data.phone },
        '[EventBus] DM handoff → Nova call',
      );

      const context = await buildCustomerContext({
        phone: data.phone,
      }).catch(() => null);

      // Customer explicitly asked for human contact → always call during
      // reasonable Calgary hours (8AM–9PM), regardless of Tier 2's downgrade.
      // Only outside that window do we fall back to SMS.
      const calgaryHour = context?.currentHourCalgary ?? 12;
      const isReasonableHour = calgaryHour >= 8 && calgaryHour < 21;

      if (!isReasonableHour) {
        await notificationService
          .sendSMS({
            to: data.phone,
            message:
              `Hi ${data.name ?? 'there'}! Nova from LervIT — you asked to chat. ` +
              `We'll call you first thing tomorrow! In the meantime: lervit.com 🚛`,
            type: 'pilot_status',
          })
          .catch(() => {});
        return;
      }

      setTimeout(
        async () => {
          await nova
            .run(
              'call_lead_conversion',
              {
                leadId: data.leadId,
                phone: data.phone,
                name: data.name,
                context:
                  `Customer came from ${data.channel === 'instagram' ? 'Instagram' : 'Messenger'} DM. ` +
                  `They asked to talk to someone.\n` +
                  `${data.pickupAddress ? 'Pickup: ' + data.pickupAddress + '\n' : ''}` +
                  `${data.dropoffAddress ? 'Dropoff: ' + data.dropoffAddress + '\n' : ''}` +
                  `Conversation:\n${data.conversationSummary ?? ''}\n\n` +
                  `Goal: Book the move live on call. Offer LERVIT10 if they hesitate.`,
              },
              { dryRun: false },
            )
            .catch((err) =>
              logger.error({ err }, '[EventBus] DM handoff call failed'),
            );
        },
        5 * 60 * 1000,
      );
    },
    'Nova Clarke',
  );

  // Quote abandoned >48hrs (sweep-enforced) → Nova call now
  agentEventBus.subscribe(
    'lead.quote_abandoned',
    async (data) => {
      logger.info({ leadId: data.leadId }, '[EventBus] abandoned→nova');

      // No delay here: the hourly sweep only emits for quotes already older
      // than 48h, so waiting again made the real delay 96h — and the dedupe
      // marker is written up front, so a restart inside that window dropped
      // the call permanently with no retry.
      await nova
        .run(
          'call_lead_conversion',
          {
            leadId: data.leadId,
            phone: data.phone,
            name: data.name,
            quoteAmount: data.price,
            pickupArea: data.pickupAddress,
          },
          { dryRun: false },
        )
        .catch((err) =>
          logger.error({ err }, '[EventBus] nova conversion failed'),
        );
    },
    'Nova Clarke',
  );

  // Scout finds a high-intent demand lead → Alex opens the conversation.
  // Only fires when Scout's Bull route is unavailable; the queue path is
  // still primary, so this never double-touches a lead.
  agentEventBus.subscribe(
    'scout.lead_found',
    async (data) => {
      if (!data.leadId) return;

      // Scout's sweep already filters to b2c at or above the high-intent
      // threshold; re-checked here so a future caller cannot pitch a move
      // quote to a mover candidate or a partner prospect.
      if (data.leadType && data.leadType !== 'b2c') {
        logger.info(
          { leadId: data.leadId, leadType: data.leadType },
          '[EventBus] scout→alex skipped — not a demand lead',
        );
        return;
      }

      if (typeof data.intentScore === 'number' && data.intentScore < 70) {
        // Alex has no nurture action today — convert_lead / send_touch /
        // recover_abandoned only. Low-intent leads stay for the next sweep.
        logger.info(
          { leadId: data.leadId, intentScore: data.intentScore },
          '[EventBus] scout→alex skipped — below conversion threshold',
        );
        return;
      }

      logger.info({ leadId: data.leadId }, '[EventBus] scout→alex: convert');

      await alex
        .run('convert_lead', { leadId: data.leadId }, { dryRun: false })
        .catch((err) =>
          logger.error({ err, leadId: data.leadId }, '[EventBus] alex convert failed'),
        );
    },
    'Alex Morgan',
  );

  // Sam creates a B2B prospect → first touch. Same shape as above: only the
  // queue-unavailable path emits, so T1 is never sent twice.
  agentEventBus.subscribe(
    'sam.prospect_found',
    async (data) => {
      if (!data.leadId) return;

      logger.info(
        { leadId: data.leadId, companyName: data.companyName },
        '[EventBus] sam prospect → T1 touch',
      );

      await sam
        .run('send_b2b_touch', { leadId: data.leadId, touchNumber: 1 }, { dryRun: false })
        .catch((err) =>
          logger.error({ err, leadId: data.leadId }, '[EventBus] sam T1 touch failed'),
        );
    },
    'Sam Carter',
  );

  // ═══════════════════════════════
  // CONTENT CHAIN
  // ═══════════════════════════════

  // Booking completed → Ember generates success content (20% sample)
  agentEventBus.subscribe(
    'booking.completed',
    async (_data) => {
      if (Math.random() > 0.2) return;

      // topic/tone/cta are honoured by generateSocialContent's single-post
      // branch — they used to be dropped, which made this a generic tip post.
      await ember
        .run(
          'generate_social_content',
          {
            platform: 'instagram',
            topic: 'Calgary moving success story',
            tone: 'celebratory',
            cta: 'Book at lervit.com',
          },
          { dryRun: false },
        )
        .catch((err) =>
          logger.error({ err }, '[EventBus] ember content failed'),
        );
    },
    'Ember Lane',
  );

  // ═══════════════════════════════
  // XAVIER INTELLIGENCE
  // ═══════════════════════════════

  // Any agent escalation → Xavier logs + alerts John
  agentEventBus.subscribe(
    'agent.escalation_needed',
    async (data) => {
      await xavier
        .run('escalate', {
          issue: data.issue,
          severity: data.severity ?? 'low',
          agentName: data.agentName,
          data,
        })
        .catch((err) =>
          logger.error({ err }, '[EventBus] xavier escalate failed'),
        );
    },
    'Xavier Cole',
  );

  const stats = agentEventBus.getStats();
  logger.info(
    {
      registeredEvents: stats.registeredEvents,
      totalHandlers: stats.totalHandlers,
    },
    '[EventBus] ✅ All subscriptions registered',
  );
}
