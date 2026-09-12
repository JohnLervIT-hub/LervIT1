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
import { and, eq, gte, inArray } from 'drizzle-orm';

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
  const conds = [
    inArray(businessEvents.eventType, opts.eventTypes),
    eq(businessEvents.entityId, opts.entityId),
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
