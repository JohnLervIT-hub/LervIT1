/**
 * Nova Tier 1 — customer context builder.
 *
 * Collects everything Nova (voice + DM) needs to know about a customer before
 * she opens her mouth: prior bookings, call history, preferred channel,
 * complaint history, Calgary time-of-day. Fed to Tier 2 (novaReasoning.ts) so
 * Claude can pick an appropriate opener, tone, and offer.
 *
 * All DB reads are best-effort — a missing table or schema drift returns the
 * default context rather than throwing, so Nova can still make the call.
 */

import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db';
import {
  bookings,
  users,
  voiceCalls,
  businessEvents,
} from '@shared/schema';
import { logger } from '../logger';

export interface NovaCustomerContext {
  // Identity
  customerId?: string;
  name?: string;
  email?: string;
  phone?: string;

  // History
  totalBookings: number;
  completedBookings: number;
  lastBookingDate?: Date;
  lastBookingAddress?: string;
  averageBookingValue?: number;
  isReturnCustomer: boolean;

  // Current state
  openQuotes: number;
  pendingPayments: number;
  abandonedBookings: number;

  // Behavior
  preferredChannel?: 'phone' | 'sms' | 'dm';
  bestCallTime?: string;
  previousCalls: number;
  answeredCalls: number;
  answerRate: number;

  // Sentiment
  lastNPS?: number;
  hasComplaint: boolean;

  // Calgary context
  neighborhood?: string;
  timezone: string;
  currentHourCalgary: number;
  isBusinessHours: boolean;
  isEveningHours: boolean;
}

const CALGARY_TZ = 'America/Edmonton';

// Common Calgary neighborhoods / quadrants Nova may reference in an opener.
const NEIGHBORHOOD_REGEX =
  /\b(NW|NE|SW|SE|Beltline|Kensington|Bridgeland|Sunnyside|Mission|Mahogany|Cranston|McKenzie|Inglewood|Ramsay|Hillhurst|Altadore|Marda Loop|Killarney|Auburn Bay|Seton|Tuscany|Chaparral)\b/i;

export async function buildCustomerContext(identifier: {
  userId?: string;
  phone?: string;
  email?: string;
  bookingId?: string;
}): Promise<NovaCustomerContext> {
  const timezone = CALGARY_TZ;
  const now = new Date();
  const calgaryHour = Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(now),
  );

  const isBusinessHours = calgaryHour >= 9 && calgaryHour < 18;
  const isEveningHours = calgaryHour >= 18 && calgaryHour < 21;

  const defaults: NovaCustomerContext = {
    totalBookings: 0,
    completedBookings: 0,
    openQuotes: 0,
    pendingPayments: 0,
    abandonedBookings: 0,
    isReturnCustomer: false,
    previousCalls: 0,
    answeredCalls: 0,
    answerRate: 0,
    hasComplaint: false,
    timezone,
    currentHourCalgary: calgaryHour,
    isBusinessHours,
    isEveningHours,
  };

  try {
    // Resolve userId from phone/email if not provided directly.
    let userId = identifier.userId;
    let userRow: { id: string; name: string | null; email: string; phone: string | null } | null = null;

    if (!userId && (identifier.phone || identifier.email)) {
      const found = await db
        .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
        .from(users)
        .where(
          identifier.phone
            ? eq(users.phone, identifier.phone)
            : eq(users.email, identifier.email!),
        )
        .limit(1);
      if (found.length) {
        userRow = found[0];
        userId = found[0].id;
      }
    } else if (userId) {
      const found = await db
        .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      userRow = found[0] ?? null;
    }

    if (!userId) return defaults;

    // Booking history — capped at 20 to keep the read light.
    const userBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.customerId, userId))
      .orderBy(desc(bookings.createdAt))
      .limit(20);

    const completed = userBookings.filter((b) => b.status === 'completed');
    // paymentStatus is free-text; historical values seen: 'pending' | 'succeeded'.
    // 'pending_payment' is included for forward-compat with the payment-gate flow.
    const pending = userBookings.filter(
      (b) => b.paymentStatus === 'pending' || b.paymentStatus === 'pending_payment',
    );
    // Actual cancellation surface — 'payment_abandoned' isn't wired anywhere yet
    // but included so the field is populated once that lifecycle lands.
    const abandoned = userBookings.filter(
      (b) => b.status === 'cancelled' || b.status === 'payment_abandoned',
    );

    const avgValue =
      completed.length > 0
        ? completed.reduce((sum, b) => sum + parseFloat(b.price ?? '0'), 0) /
          completed.length
        : undefined;

    // Voice call history — voiceCalls has no direct userId column; correlate
    // via matchedUserId (populated by inbound routing) rather than admin_id.
    const calls = await db
      .select()
      .from(voiceCalls)
      .where(eq(voiceCalls.matchedUserId, userId))
      .orderBy(desc(voiceCalls.createdAt))
      .limit(10)
      .catch(() => [] as (typeof voiceCalls.$inferSelect)[]);

    const answered = calls.filter(
      (c) => c.status === 'completed' || c.status === 'answered',
    );

    // Prefer channel based on past answer behavior.
    let preferredChannel: 'phone' | 'sms' | 'dm' | undefined;
    if (calls.length > 2) {
      const rate = answered.length / calls.length;
      if (rate > 0.6) preferredChannel = 'phone';
      else if (rate < 0.3) preferredChannel = 'sms';
    }

    // Complaint flag. No writer currently emits 'customer.complaint' — the
    // check is future-facing. Returns false until a producer lands.
    const complaints = await db
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(
        and(
          eq(businessEvents.entityId, userId),
          eq(businessEvents.eventType, 'customer.complaint'),
        ),
      )
      .limit(1)
      .catch(() => [] as { id: string }[]);

    const lastBooking = userBookings[0];
    const neighborhoodMatch = lastBooking?.pickupAddress?.match(NEIGHBORHOOD_REGEX);
    const neighborhood = neighborhoodMatch?.[0];

    return {
      ...defaults,
      customerId: userId,
      name: userRow?.name ?? undefined,
      email: userRow?.email,
      phone: userRow?.phone ?? undefined,
      totalBookings: userBookings.length,
      completedBookings: completed.length,
      lastBookingDate: lastBooking?.createdAt,
      lastBookingAddress: lastBooking?.pickupAddress ?? undefined,
      averageBookingValue: avgValue,
      isReturnCustomer: completed.length > 0,
      openQuotes: 0,
      pendingPayments: pending.length,
      abandonedBookings: abandoned.length,
      preferredChannel,
      previousCalls: calls.length,
      answeredCalls: answered.length,
      answerRate: calls.length > 0 ? answered.length / calls.length : 0,
      hasComplaint: complaints.length > 0,
      neighborhood,
    };
  } catch (err) {
    logger.warn({ err }, '[NovaContext] Failed to build context — returning defaults');
    return defaults;
  }
}

/**
 * Compact context string for injection into a Claude prompt. Every line is a
 * self-contained fact — no key/value pairs — so the model can lift phrasing
 * directly into its opener without the reader ever seeing "hasComplaint: true".
 */
export function formatContextForPrompt(ctx: NovaCustomerContext): string {
  const lines: string[] = [];

  if (ctx.name) lines.push(`Customer: ${ctx.name}`);

  lines.push(
    ctx.isReturnCustomer
      ? `Return customer — ${ctx.completedBookings} completed moves`
      : `New customer`,
  );

  if (ctx.averageBookingValue) {
    lines.push(`Avg booking value: $${Math.round(ctx.averageBookingValue)}`);
  }

  if (ctx.abandonedBookings > 0) {
    lines.push(`Previous abandoned bookings: ${ctx.abandonedBookings}`);
  }

  if (ctx.hasComplaint) {
    lines.push(`Prior complaint on file — lead with empathy`);
  }

  lines.push(`Calgary time: ${ctx.currentHourCalgary}:00`);
  lines.push(
    ctx.isBusinessHours
      ? `Business hours`
      : ctx.isEveningHours
        ? `Evening hours — softer approach`
        : `Outside call window — SMS/DM only`,
  );

  if (ctx.preferredChannel) {
    lines.push(`Preferred channel: ${ctx.preferredChannel}`);
  }

  if (ctx.previousCalls > 0) {
    lines.push(`Call answer rate: ${Math.round(ctx.answerRate * 100)}% (${ctx.answeredCalls}/${ctx.previousCalls})`);
  }

  if (ctx.neighborhood) {
    lines.push(`Neighborhood: ${ctx.neighborhood}`);
  }

  return lines.join('\n');
}
