/**
 * Unified business-event emitter.
 *
 * Every business event of interest to admins or autonomous agents is
 * written to `business_events`. Agents poll this table with a cursor
 * on `created_at` / `id` instead of tailing pino stdout.
 *
 * Emission is non-blocking — a failed insert must never crash the
 * calling flow (payment, booking creation, etc).
 */

import { db } from './db';
import { businessEvents } from '@shared/schema';
import { logger } from './logger';

export type BusinessEntityType =
  | 'booking'
  | 'mover'
  | 'customer'
  | 'partner'
  | 'payment'
  | 'lead'
  | 'agent'
  | 'review';

export type BusinessEventSource = 'system' | 'webhook' | 'agent' | 'admin';

export async function emitEvent(
  eventType: string,
  entityType: BusinessEntityType | string,
  entityId: string | null | undefined,
  payload: Record<string, any> = {},
  source: BusinessEventSource = 'system',
): Promise<void> {
  try {
    await db.insert(businessEvents).values({
      eventType,
      entityType,
      entityId: entityId ?? null,
      payload,
      source,
    });
  } catch (err) {
    // Non-blocking — event emission never crashes the main flow.
    logger.error({ err, eventType, entityType, entityId }, 'Failed to emit business event');
  }
}
