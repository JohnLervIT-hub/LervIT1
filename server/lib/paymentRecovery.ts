/**
 * Payment recovery — staged customer nudges for bookings stuck at
 * pending_payment. Runs as a 5-minute sweep from background-jobs.ts.
 *
 * Stages (minutes since booking created):
 *   ≥5m    — Soft SMS with payment link
 *   ≥15m   — Nova outbound (Tier 2 strategy → SMS with warm/urgent opener)
 *   ≥60m   — Urgent SMS (last-chance framing)
 *   ≥120m  — Mark payment abandoned (business event only — the existing
 *            expireStaleBookings job at background-jobs.ts owns the actual
 *            status flip to payment_failed)
 *   ≥1440m — Hard cancel any still-pending row as a 24h safety net
 *
 * Idempotency: each stage records a `payment_recovery.<stage>` event on
 * business_events. Subsequent sweeps check that dedupe tag and skip. This
 * is more reliable than the 1-minute-window trick — a 5-minute sweep would
 * otherwise miss any window it doesn't happen to hit dead-on, and every
 * stage stays fireable exactly once per booking regardless of when the
 * server was last restarted.
 *
 * TODO Sprint 5 — replace the cron sweep with a Bull delayed-job chain
 * scheduled at booking creation, so recovery survives Redis restarts by
 * mechanism rather than sweep polling.
 */

import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  bookings,
  businessEvents,
  users,
  BOOKING_STATUSES,
} from '@shared/schema';
import { emitEvent } from '../events';
import { logger } from '../logger';
import { notificationService } from '../notifications';
import { buildCustomerContext } from './novaContext';
import { decideRecoveryStrategy } from './novaReasoning';

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.lervit.com';

const SWEEP_LOOKBACK_HOURS = 24;

const STAGES = {
  soft_sms: { minMinutes: 5, event: 'payment_recovery.soft_sms' },
  nova_call: { minMinutes: 15, event: 'payment_recovery.nova_call' },
  urgent_sms: { minMinutes: 60, event: 'payment_recovery.urgent_sms' },
  abandoned: { minMinutes: 120, event: 'payment_recovery.abandoned' },
  cancelled: { minMinutes: 1440, event: 'payment_recovery.cancelled' },
} as const;

type StageName = keyof typeof STAGES;

// Statuses that mean "customer already resolved this booking one way or
// another" — recovery skips them.
const TERMINAL_STATUSES: string[] = [
  BOOKING_STATUSES.CANCELLED,
  BOOKING_STATUSES.COMPLETED,
  BOOKING_STATUSES.PAYMENT_FAILED,
  BOOKING_STATUSES.PENDING, // moved past payment
  BOOKING_STATUSES.CONFIRMED,
  BOOKING_STATUSES.EN_ROUTE_TO_PICKUP,
  BOOKING_STATUSES.LOADING,
  BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF,
  BOOKING_STATUSES.UNLOADING,
];

// Paid statuses — anything here means recovery should immediately halt.
const PAID_PAYMENT_STATUSES = ['succeeded', 'paid', 'captured'];

interface RecoveryBookingRow {
  id: string;
  customerId: string;
  status: string;
  paymentStatus: string | null;
  price: string;
  pickupAddress: string;
  createdAt: Date;
  customerPhone: string | null;
  customerEmail: string;
  customerName: string | null;
}

/**
 * Main sweep. Call from a 5-minute cron in background-jobs.ts.
 */
export async function paymentRecoverySweep(): Promise<{
  scanned: number;
  actions: Record<StageName, number>;
}> {
  const cutoff = new Date(
    Date.now() - SWEEP_LOOKBACK_HOURS * 60 * 60 * 1000,
  );

  const rows = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      status: bookings.status,
      paymentStatus: bookings.paymentStatus,
      price: bookings.price,
      pickupAddress: bookings.pickupAddress,
      createdAt: bookings.createdAt,
      customerPhone: users.phone,
      customerEmail: users.email,
      customerName: users.name,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.customerId))
    .where(
      and(
        inArray(bookings.paymentStatus, ['pending', 'pending_payment']),
        // Only bookings still in the payment window; anything that moved on
        // is filtered here rather than after fetch to keep the read cheap.
        eq(bookings.status, BOOKING_STATUSES.PENDING_PAYMENT),
        gte(bookings.createdAt, cutoff),
      ),
    );

  const actions: Record<StageName, number> = {
    soft_sms: 0,
    nova_call: 0,
    urgent_sms: 0,
    abandoned: 0,
    cancelled: 0,
  };

  for (const row of rows as RecoveryBookingRow[]) {
    const minutesSince = Math.floor(
      (Date.now() - new Date(row.createdAt).getTime()) / 60000,
    );

    // Pick the highest-numbered stage the booking is eligible for that
    // hasn't fired yet. Firing only one stage per sweep keeps the customer
    // from getting two SMS in the same minute if a sweep lands between
    // stages.
    const eligible: StageName[] = (
      Object.entries(STAGES) as [StageName, (typeof STAGES)[StageName]][]
    )
      .filter(([, cfg]) => minutesSince >= cfg.minMinutes)
      .map(([name]) => name);

    for (const stage of eligible.reverse()) {
      const alreadyFired = await stageAlreadyFired(row.id, stage);
      if (alreadyFired) continue;

      const executed = await runStage(stage, row, minutesSince);
      if (executed) actions[stage]++;
      break; // one stage per sweep per booking
    }
  }

  if (rows.length > 0) {
    logger.info({ scanned: rows.length, actions }, '[PaymentRecovery] Sweep complete');
  }
  return { scanned: rows.length, actions };
}

async function stageAlreadyFired(bookingId: string, stage: StageName): Promise<boolean> {
  const existing = await db
    .select({ id: businessEvents.id })
    .from(businessEvents)
    .where(
      and(
        eq(businessEvents.entityId, bookingId),
        eq(businessEvents.eventType, STAGES[stage].event),
      ),
    )
    .limit(1);
  return existing.length > 0;
}

async function runStage(
  stage: StageName,
  row: RecoveryBookingRow,
  minutesSince: number,
): Promise<boolean> {
  // Re-check status right before firing — the sweep row is a few ms stale
  // and a webhook may have flipped the booking to paid in the meantime.
  const [fresh] = await db
    .select({ status: bookings.status, paymentStatus: bookings.paymentStatus })
    .from(bookings)
    .where(eq(bookings.id, row.id))
    .limit(1);

  if (!fresh) return false;
  if (PAID_PAYMENT_STATUSES.includes(fresh.paymentStatus ?? '')) return false;
  if (TERMINAL_STATUSES.includes(fresh.status)) return false;

  switch (stage) {
    case 'soft_sms':
      return sendPaymentLinkSMS(row.id, false);
    case 'nova_call':
      return triggerNovaPaymentCall(row.id);
    case 'urgent_sms':
      return sendPaymentLinkSMS(row.id, true);
    case 'abandoned':
      return markPaymentAbandoned(row.id);
    case 'cancelled':
      return autoCancelBooking(row.id, minutesSince);
  }
}

export async function sendPaymentLinkSMS(
  bookingId: string,
  urgent: boolean,
): Promise<boolean> {
  const row = await getRecoveryRow(bookingId);
  if (!row) return false;
  if (!row.customerPhone) {
    logger.info({ bookingId }, '[PaymentRecovery] No phone on file — skipping SMS');
    return false;
  }

  const paymentUrl = `${APP_BASE_URL}/payment?bookingId=${bookingId}`;
  const firstName = (row.customerName ?? 'there').split(/\s+/)[0];

  const message = urgent
    ? `${firstName}, this is your last reminder — your LervIT booking will be released soon. Complete payment: ${paymentUrl}`
    : `Hi ${firstName}! Your LervIT booking is reserved — complete payment to lock in your mover: ${paymentUrl}`;

  try {
    await notificationService.sendSMS({
      to: row.customerPhone,
      message,
      type: 'booking_update',
    });
    await emitEvent(
      urgent ? STAGES.urgent_sms.event : STAGES.soft_sms.event,
      'booking',
      bookingId,
      { customerId: row.customerId, urgent, price: row.price },
      'system',
    );
    logger.info({ bookingId, urgent }, '[PaymentRecovery] Payment SMS sent');
    return true;
  } catch (err) {
    logger.error({ err, bookingId }, '[PaymentRecovery] SMS send failed');
    return false;
  }
}

export async function triggerNovaPaymentCall(bookingId: string): Promise<boolean> {
  const row = await getRecoveryRow(bookingId);
  if (!row) return false;

  const context = await buildCustomerContext({
    userId: row.customerId,
    phone: row.customerPhone ?? undefined,
    email: row.customerEmail,
  });

  const minutesSince = Math.floor(
    (Date.now() - new Date(row.createdAt).getTime()) / 60000,
  );

  const strategy = await decideRecoveryStrategy(context, {
    bookingId,
    price: parseFloat(row.price ?? '0'),
    pickupAddress: row.pickupAddress,
    minutesSinceCreated: minutesSince,
    smsSent: true, // soft SMS at 5m has fired by 15m
    smsOpened: undefined,
  });

  // Log the decision regardless of action so John can audit strategy quality.
  await emitEvent(
    STAGES.nova_call.event,
    'booking',
    bookingId,
    {
      customerId: row.customerId,
      strategy,
      minutesSince,
    },
    'agent',
  );

  if (strategy.action === 'skip') {
    logger.info(
      { bookingId, reason: strategy.skipReason },
      '[PaymentRecovery] Nova strategy = skip',
    );
    return true;
  }

  // MVP: strategy comes back with a warm opener and key points — send those
  // via SMS. Live Telnyx dial for the "call" branch is wired separately
  // through the agent event bus once a payment-recovery subscription lands.
  if (row.customerPhone && (strategy.action === 'sms' || strategy.action === 'both' || strategy.action === 'call')) {
    const paymentUrl = `${APP_BASE_URL}/payment?bookingId=${bookingId}`;
    try {
      await notificationService.sendSMS({
        to: row.customerPhone,
        message: `${strategy.openingLine} ${paymentUrl}`.slice(0, 300),
        type: 'booking_update',
      });
    } catch (err) {
      logger.error({ err, bookingId }, '[PaymentRecovery] Nova SMS send failed');
    }
  }

  logger.info(
    { bookingId, action: strategy.action, tone: strategy.tone },
    '[PaymentRecovery] Nova recovery fired',
  );
  return true;
}

export async function markPaymentAbandoned(bookingId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: bookings.status, paymentStatus: bookings.paymentStatus })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return false;
  if (PAID_PAYMENT_STATUSES.includes(row.paymentStatus ?? '')) return false;

  // Informational tag only. expireStaleBookings (background-jobs.ts) owns
  // the actual status flip to payment_failed at the same 120-minute mark.
  await emitEvent(
    STAGES.abandoned.event,
    'booking',
    bookingId,
    { status: row.status, paymentStatus: row.paymentStatus },
    'system',
  );
  logger.info({ bookingId }, '[PaymentRecovery] Marked payment abandoned');
  return true;
}

export async function autoCancelBooking(
  bookingId: string,
  minutesSince: number,
): Promise<boolean> {
  const [row] = await db
    .select({ status: bookings.status, paymentStatus: bookings.paymentStatus })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return false;
  if (PAID_PAYMENT_STATUSES.includes(row.paymentStatus ?? '')) return false;
  if (TERMINAL_STATUSES.includes(row.status)) return false;

  await db
    .update(bookings)
    .set({
      status: BOOKING_STATUSES.CANCELLED,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));

  await emitEvent(
    STAGES.cancelled.event,
    'booking',
    bookingId,
    { minutesSince, reason: 'payment_never_completed' },
    'system',
  );
  logger.info({ bookingId, minutesSince }, '[PaymentRecovery] Auto-cancelled');
  return true;
}

async function getRecoveryRow(bookingId: string): Promise<RecoveryBookingRow | null> {
  const [row] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      status: bookings.status,
      paymentStatus: bookings.paymentStatus,
      price: bookings.price,
      pickupAddress: bookings.pickupAddress,
      createdAt: bookings.createdAt,
      customerPhone: users.phone,
      customerEmail: users.email,
      customerName: users.name,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.customerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return (row as RecoveryBookingRow | undefined) ?? null;
}

// Reads intentionally unused in normal flow — kept exported so ops scripts
// can prune the dedupe tag if a stage needs a manual re-fire.
export async function clearRecoveryStage(
  bookingId: string,
  stage: StageName,
): Promise<void> {
  await db
    .delete(businessEvents)
    .where(
      and(
        eq(businessEvents.entityId, bookingId),
        eq(businessEvents.eventType, STAGES[stage].event),
      ),
    );
}
