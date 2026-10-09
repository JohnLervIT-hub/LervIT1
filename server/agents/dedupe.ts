/**
 * Outreach dedupe — prevent duplicate agent contact when cron + a manual
 * admin trigger fire the same action, or when two touches queue up back-to-back.
 *
 * Backed by the `business_events` table: every outreach send emits an event
 * (e.g. `lead.contacted`, `kai.customer_winback_touch1`). Dedupe checks look
 * for one of those events on a given entity within a cooldown window.
 *
 * Two window shapes:
 *   - wasContactedToday      : since 00:00 local time  (daily-cadence agents)
 *   - wasContactedWithinDays : last N days             (weekly / monthly cadence)
 */

import { db } from '../db';
import { businessEvents } from '@shared/schema';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { findSiblingLeadIds } from './shared/contactDedup';

type EntityType = 'lead' | 'mover' | 'booking' | 'partner' | 'customer' | 'agent';

interface CheckOptions {
  entityId: string;
  entityType?: EntityType;
  eventTypes: string[];
}

export interface DedupeResult {
  contacted: boolean;
  lastEvent?: string;
  daysAgo?: number;
}

/** Check if this entity received any of the listed event types since midnight. */
export async function wasContactedToday(opts: CheckOptions): Promise<DedupeResult> {
  if (opts.eventTypes.length === 0) return { contacted: false };
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return queryDedupe(opts, startOfDay);
}

/** Check if this entity received any of the listed event types in the last N days. */
export async function wasContactedWithinDays(
  opts: CheckOptions & { days: number },
): Promise<DedupeResult> {
  if (opts.eventTypes.length === 0) return { contacted: false };
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - opts.days);
  cutoff.setHours(0, 0, 0, 0);
  return queryDedupe(opts, cutoff);
}

async function queryDedupe(opts: CheckOptions, since: Date): Promise<DedupeResult> {
  return queryDedupeAcross([opts.entityId], opts, since);
}

async function queryDedupeAcross(
  entityIds: string[],
  opts: Omit<CheckOptions, 'entityId'>,
  since: Date,
): Promise<DedupeResult> {
  if (entityIds.length === 0) return { contacted: false };
  const conds = [
    inArray(businessEvents.eventType, opts.eventTypes),
    inArray(businessEvents.entityId, entityIds),
    gte(businessEvents.createdAt, since),
  ];
  if (opts.entityType) {
    conds.push(eq(businessEvents.entityType, opts.entityType));
  }

  const [row] = await db
    .select({
      eventType: businessEvents.eventType,
      createdAt: businessEvents.createdAt,
    })
    .from(businessEvents)
    .where(and(...conds))
    .limit(1);

  if (!row) return { contacted: false };

  const daysAgo = Math.floor(
    (Date.now() - row.createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  return { contacted: true, lastEvent: row.eventType, daysAgo };
}

// ── contact-aware variants ─────────────────────────────────
//
// The checks above are keyed on a single entityId. `leads` has no unique
// constraint on contact_phone / contact_email, so one person can own several
// rows, and a per-row check cannot see what the siblings were sent: one
// production contact has 4 rows and 7 recruitment touch events between them.
//
// These resolve the sibling set first (see ./shared/contactDedup) and check
// events across all of it. Deliberately added as separate functions rather
// than widening the originals — those have ~37 call sites across six agents,
// many on entityType 'mover' or 'booking' where contact identity is
// meaningless, and silently broadening all of them would change dedupe
// behaviour well outside the mover pipeline.

/** wasContactedToday, across every lead row belonging to the same person. */
export async function wasContactedTodayForContact(opts: {
  leadId: string;
  eventTypes: string[];
}): Promise<DedupeResult> {
  if (opts.eventTypes.length === 0) return { contacted: false };
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const ids = await findSiblingLeadIds(opts.leadId);
  return queryDedupeAcross(ids, { eventTypes: opts.eventTypes, entityType: 'lead' }, startOfDay);
}

/** wasContactedWithinDays, across every lead row belonging to the same person. */
export async function wasContactedWithinDaysForContact(opts: {
  leadId: string;
  eventTypes: string[];
  days: number;
}): Promise<DedupeResult> {
  if (opts.eventTypes.length === 0) return { contacted: false };
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - opts.days);
  cutoff.setHours(0, 0, 0, 0);
  const ids = await findSiblingLeadIds(opts.leadId);
  return queryDedupeAcross(ids, { eventTypes: opts.eventTypes, entityType: 'lead' }, cutoff);
}

/**
 * wasEverSmsed, across every lead row belonging to the same person.
 *
 * This is the CASL fix. The s.6(6) published-contact exemption allows exactly
 * one message, and the per-row version let each duplicate row believe its send
 * was the first one — so the limit was exceeded by construction wherever a
 * contact had siblings.
 */
export async function wasEverSmsedForContact(opts: { leadId: string }): Promise<boolean> {
  const ids = await findSiblingLeadIds(opts.leadId);
  if (ids.length === 0) return false;
  const [row] = await db
    .select({ id: businessEvents.id })
    .from(businessEvents)
    .where(
      and(
        inArray(businessEvents.entityId, ids),
        eq(businessEvents.entityType, 'lead'),
        sql`${businessEvents.payload}->>'channel' = 'sms'`,
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Has this entity ever been sent an SMS, by any agent, on any date?
 *
 * Every outreach send records its channel in the event payload, so a single
 * `payload->>'channel' = 'sms'` lookup answers it without a per-agent event
 * list. Used by the CASL published-contact exemption, which permits one
 * message and no repeat — see PUBLISHED_CONTACT_SOURCES in ../lib/smsConsent.
 */
export async function wasEverSmsed(opts: {
  entityId: string;
  entityType?: EntityType;
}): Promise<boolean> {
  const conds = [
    eq(businessEvents.entityId, opts.entityId),
    sql`${businessEvents.payload}->>'channel' = 'sms'`,
  ];
  if (opts.entityType) {
    conds.push(eq(businessEvents.entityType, opts.entityType));
  }
  const [row] = await db
    .select({ id: businessEvents.id })
    .from(businessEvents)
    .where(and(...conds))
    .limit(1);
  return !!row;
}
