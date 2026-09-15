/**
 * DM identity resolver — maps a Meta senderId (Messenger / Instagram) to a
 * LervIT `users` row when the DM sender has been previously identified.
 *
 * TWO-PHASE FLOW:
 *   1) On every inbound DM, `resolveIdentity(platform, senderId)` returns any
 *      existing mapping. Anonymous senderIds return { isKnown: false } and
 *      Nova's Tier 2 responder decides what to ask for (usually name + phone
 *      + move context).
 *   2) When Nova collects a phone or email in-conversation, call
 *      `linkIdentityFromContact(platform, senderId, { phone?, email? })`. That
 *      does a users-table lookup and, on hit, caches the mapping so subsequent
 *      DMs get personalized (name, return-customer status, prior interactions).
 *
 * STORAGE:
 *   In-process Map for now — mappings do NOT survive server restart. This is
 *   fine for the DM MVP (Messenger + IG conversations are short) but should
 *   be swapped for a `messenger_identities` DB table before scale-out. The
 *   Map key is `${platform}:${senderId}` so keys never collide across
 *   platforms.
 */

import { and, eq, or } from 'drizzle-orm';
import { db } from '../db';
import { bookings, users, businessEvents } from '@shared/schema';
import { logger } from '../logger';

export type DmPlatform = 'messenger' | 'instagram';

export interface ResolvedIdentity {
  identityId: string;       // stable synthetic id: `${platform}:${senderId}`
  isKnown: boolean;         // true iff mapped to a users row
  userId?: string;
  name?: string;
  phone?: string;
  email?: string;
  isReturnCustomer: boolean; // true if the linked user has any completed booking
  totalInteractions: number; // how many DMs from this senderId we've seen
  lastSeenAt?: Date;
  linkedAt?: Date;
}

interface IdentityRecord extends ResolvedIdentity {}

const memory = new Map<string, IdentityRecord>();

function keyFor(platform: DmPlatform, senderId: string): string {
  return `${platform}:${senderId}`;
}

/**
 * Fast in-memory lookup. Increments totalInteractions on every call so DMs
 * accumulate an interaction count even when the sender is still anonymous.
 */
export async function resolveIdentity(
  platform: DmPlatform,
  senderId: string,
): Promise<ResolvedIdentity> {
  const key = keyFor(platform, senderId);
  const existing = memory.get(key);

  if (existing) {
    existing.totalInteractions += 1;
    existing.lastSeenAt = new Date();
    memory.set(key, existing);
    return { ...existing };
  }

  const fresh: IdentityRecord = {
    identityId: key,
    isKnown: false,
    isReturnCustomer: false,
    totalInteractions: 1,
    lastSeenAt: new Date(),
  };
  memory.set(key, fresh);
  return { ...fresh };
}

/**
 * Called when Nova collects contact info in a DM ("Hey I'm Kyle, phone
 * 403-555-1234"). Looks up the users table; on hit, caches the mapping so
 * subsequent DMs from this senderId return the enriched identity.
 *
 * Returns the resolved identity (updated if a user was found, unchanged
 * otherwise).
 */
export async function linkIdentityFromContact(
  platform: DmPlatform,
  senderId: string,
  contact: { phone?: string; email?: string; name?: string },
): Promise<ResolvedIdentity> {
  const key = keyFor(platform, senderId);
  const existing = memory.get(key) ?? {
    identityId: key,
    isKnown: false,
    isReturnCustomer: false,
    totalInteractions: 0,
    lastSeenAt: new Date(),
  };

  const clauses = [];
  if (contact.phone) clauses.push(eq(users.phone, contact.phone));
  if (contact.email) clauses.push(eq(users.email, contact.email));

  if (clauses.length === 0) {
    memory.set(key, existing);
    return { ...existing };
  }

  try {
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(clauses.length === 1 ? clauses[0] : or(...clauses)!)
      .limit(1);

    if (!user) {
      memory.set(key, existing);
      return { ...existing };
    }

    // Return-customer signal — one completed booking is enough to count.
    const completed = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.customerId, user.id), eq(bookings.status, 'completed')))
      .limit(1);

    const linked: IdentityRecord = {
      ...existing,
      isKnown: true,
      userId: user.id,
      name: user.name ?? contact.name ?? undefined,
      phone: user.phone ?? contact.phone ?? undefined,
      email: user.email ?? contact.email ?? undefined,
      isReturnCustomer: completed.length > 0,
      linkedAt: new Date(),
      lastSeenAt: new Date(),
    };
    memory.set(key, linked);

    // Audit trail so ops can trace when a DM sender got tied to a customer.
    await db.insert(businessEvents).values({
      eventType: 'nova.identity_linked',
      entityType: 'agent',
      entityId: user.id,
      payload: { platform, senderId, linkedAt: linked.linkedAt?.toISOString() },
      source: 'agent',
    }).catch(() => { /* non-fatal */ });

    return { ...linked };
  } catch (err) {
    logger.warn({ err, platform, senderId }, '[IdentityResolver] link lookup failed');
    memory.set(key, existing);
    return { ...existing };
  }
}

/**
 * Explicit link when the senderId → userId mapping is known from a webhook
 * payload (e.g., Meta sends a page-scoped user_id we later reconcile).
 */
export async function linkIdentityToUser(
  platform: DmPlatform,
  senderId: string,
  userId: string,
): Promise<ResolvedIdentity> {
  const key = keyFor(platform, senderId);
  try {
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error(`user ${userId} not found`);

    const existing = memory.get(key) ?? {
      identityId: key,
      isKnown: false,
      isReturnCustomer: false,
      totalInteractions: 0,
      lastSeenAt: new Date(),
    };
    const linked: IdentityRecord = {
      ...existing,
      isKnown: true,
      userId: user.id,
      name: user.name ?? undefined,
      phone: user.phone ?? undefined,
      email: user.email ?? undefined,
      isReturnCustomer: existing.isReturnCustomer,
      linkedAt: new Date(),
      lastSeenAt: new Date(),
    };
    memory.set(key, linked);
    return { ...linked };
  } catch (err) {
    logger.warn({ err, platform, senderId, userId }, '[IdentityResolver] direct link failed');
    return resolveIdentity(platform, senderId);
  }
}

// Ops helper — inspect the in-memory table (for admin debug only).
export function _debugSnapshot(): ResolvedIdentity[] {
  return Array.from(memory.values()).map((r) => ({ ...r }));
}
