/**
 * Agent event subscriptions — wires every autonomous agent to the events it
 * cares about. Called once at server startup from server/index.ts.
 */

import { agentEventBus } from '../lib/agentEventBus';
import { jordan } from './jordan';
import { riley } from './riley';
import { reid } from './reid';
import { aegis } from './aegis';
import { victor } from './victor';
import { mark } from './mark';
import { nova } from './nova';
import { kai } from './kai';
import { ember } from './ember';
import { xavier } from './xavier';
import { logger } from '../logger';

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

  // No mover accepts in 5min → Nova calls movers
  agentEventBus.subscribe(
    'booking.no_acceptance',
    async (data) => {
      logger.info(
        { bookingId: data.bookingId },
        '[EventBus] no_accept→nova',
      );

      await nova
        .run(
          'call_mover_dispatch',
          { bookingId: data.bookingId, type: 'urgent_dispatch' },
          { dryRun: false },
        )
        .catch((err) =>
          logger.error({ err }, '[EventBus] nova dispatch failed'),
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

  // Quote abandoned 48hrs → Nova call
  agentEventBus.subscribe(
    'lead.quote_abandoned',
    async (data) => {
      logger.info({ leadId: data.leadId }, '[EventBus] abandoned→nova');

      // TODO Sprint 5: replace with Bull queue delayed job for restart-safe delays
      setTimeout(
        async () => {
          await nova
            .run(
              'call_lead_conversion',
              { leadId: data.leadId },
              { dryRun: false },
            )
            .catch((err) =>
              logger.error({ err }, '[EventBus] nova conversion failed'),
            );
        },
        48 * 60 * 60 * 1000,
      );
    },
    'Nova Clarke',
  );

  // ═══════════════════════════════
  // CONTENT CHAIN
  // ═══════════════════════════════

  // Booking completed → Ember generates success content (20% sample)
  agentEventBus.subscribe(
    'booking.completed',
    async (_data) => {
      if (Math.random() > 0.2) return;

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
