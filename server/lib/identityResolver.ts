/**
 * Nova DM identity resolver — maps a Meta senderId (Messenger / Instagram)
 * to a LervIT `users` row, backed by the `messenger_identities` DB table so
 * mappings survive server restarts.
 *
 * FLOW:
 *   1) On every inbound DM, `resolveIdentity(platform, senderId)`:
 *      - hits the 30-minute in-process read cache first
 *      - on miss, upserts a `messenger_identities` row (auto-increments
 *        total_messages, refreshes last_seen_at)
 *      - if the row already has a user_id (previously linked), returns the
 *        enriched identity in one round-trip
 *   2) Nova's Tier 2 reasoning + the DM handler regex-scan the customer's
 *      message for phone/email. On a hit, `linkIdentityFromContact` looks
 *      up the users row and permanently links the (platform, senderId) →
 *      user_id mapping. Subsequent DMs get the enriched identity for free.
 *
 * The cache is READ-THROUGH only. Every mutation invalidates the cache
 * entry so a linked identity doesn't get shadowed by a stale anonymous
 * cache row.
 */

import { and, eq, or } from 'drizzle-orm';
import { db } from '../db';
import {
  bookings,
  businessEvents,
  messengerIdentities,
  users,
} from '@shared/schema';
import { logger } from '../logger';

export type DmPlatform = 'messenger' | 'instagram';

export interface ResolvedIdentity {
  identityId: string;         // messenger_identities.id
  platform: DmPlatform;
  senderId: string;
  isKnown: boolean;           // true iff mapped to a users row
  userId?: string;
  name?: string;
  phone?: string;
  email?: string;
  isReturnCustomer: boolean;
  totalInteractions: number;  // total_messages on the row
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

interface CacheEntry {
  identity: ResolvedIdentity;
  expiresAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const cache = new Map<string, CacheEntry>();

function keyFor(platform: DmPlatform, senderId: string): string {
  return `${platform}:${senderId}`;
}

function cacheGet(key: string): ResolvedIdentity | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.identity;
}

function cacheSet(key: string, identity: ResolvedIdentity): void {
  cache.set(key, { identity, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheInvalidate(key: string): void {
  cache.delete(key);
}

function toResolved(row: typeof messengerIdentities.$inferSelect, platform: DmPlatform): ResolvedIdentity {
  return {
    identityId: row.id,
    platform,
    senderId: row.senderId,
    isKnown: row.isResolved && !!row.userId,
    userId: row.userId ?? undefined,
    name: row.name ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    isReturnCustomer: row.isReturnCustomer,
    totalInteractions: row.totalMessages,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    resolvedAt: row.resolvedAt ?? undefined,
    resolvedBy: row.resolvedBy ?? undefined,
  };
}

/**
 * Resolve — upserts a row and bumps counters. Cache-first.
 */
export async function resolveIdentity(
  platform: DmPlatform,
  senderId: string,
): Promise<ResolvedIdentity> {
  const key = keyFor(platform, senderId);
  const cached = cacheGet(key);
  if (cached) {
    // Even on cache hit we want the counter to reflect the new message.
    // Fire-and-forget the DB update; the returned identity uses the
    // cached snapshot with a locally-bumped count so the caller sees a
    // consistent value.
    const bumped: ResolvedIdentity = {
      ...cached,
      totalInteractions: cached.totalInteractions + 1,
      lastSeenAt: new Date(),
    };
    cacheSet(key, bumped);
    db.update(messengerIdentities)
      .set({
        totalMessages: bumped.totalInteractions,
        lastSeenAt: bumped.lastSeenAt,
        updatedAt: new Date(),
      })
      .where(eq(messengerIdentities.id, cached.identityId))
      .catch((err) => logger.warn({ err, key }, '[IdentityResolver] cache-hit counter update failed'));
    return bumped;
  }

  try {
    const [existing] = await db
      .select()
      .from(messengerIdentities)
      .where(
        and(eq(messengerIdentities.platform, platform), eq(messengerIdentities.senderId, senderId)),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(messengerIdentities)
        .set({
          totalMessages: existing.totalMessages + 1,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(messengerIdentities.id, existing.id))
        .returning();
      const identity = toResolved(updated, platform);
      cacheSet(key, identity);
      return identity;
    }

    const [inserted] = await db
      .insert(messengerIdentities)
      .values({
        platform,
        senderId,
        totalMessages: 1,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      })
      .returning();
    const identity = toResolved(inserted, platform);
    cacheSet(key, identity);
    return identity;
  } catch (err) {
    logger.warn({ err, platform, senderId }, '[IdentityResolver] resolve failed — returning ephemeral');
    // If the DB is unreachable we still return something so Tier 2 can run.
    const now = new Date();
    return {
      identityId: `ephemeral:${platform}:${senderId}`,
      platform,
      senderId,
      isKnown: false,
      isReturnCustomer: false,
      totalInteractions: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    };
  }
}

/**
 * Auto-link: Nova extracted a phone/email from the customer's message. Look
 * up the users row; on hit, cement the mapping.
 */
export async function linkIdentityFromContact(
  platform: DmPlatform,
  senderId: string,
  contact: { phone?: string; email?: string; name?: string },
): Promise<ResolvedIdentity> {
  const key = keyFor(platform, senderId);

  // Make sure the identity row exists before we attempt the link.
  const baseline = await resolveIdentity(platform, senderId);

  const clauses = [];
  if (contact.phone) clauses.push(eq(users.phone, contact.phone));
  if (contact.email) clauses.push(eq(users.email, contact.email));

  if (clauses.length === 0) return baseline;

  try {
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(clauses.length === 1 ? clauses[0] : or(...clauses)!)
      .limit(1);

    if (!user) {
      // No matching user yet — persist the contact strings on the identity
      // row anyway so a later signup with the same phone/email can reconcile.
      const [row] = await db
        .update(messengerIdentities)
        .set({
          phone: contact.phone ?? undefined,
          email: contact.email ?? undefined,
          name: contact.name ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(messengerIdentities.id, baseline.identityId))
        .returning();
      const identity = toResolved(row, platform);
      cacheInvalidate(key);
      cacheSet(key, identity);
      return identity;
    }

    const completedCount = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.customerId, user.id), eq(bookings.status, 'completed')))
      .limit(1);
    const isReturn = completedCount.length > 0;

    const now = new Date();
    const [row] = await db
      .update(messengerIdentities)
      .set({
        userId: user.id,
        name: user.name ?? contact.name ?? undefined,
        phone: user.phone ?? contact.phone ?? undefined,
        email: user.email ?? contact.email ?? undefined,
        isResolved: true,
        isReturnCustomer: isReturn,
        resolvedAt: now,
        resolvedBy: 'auto_dm',
        updatedAt: now,
      })
      .where(eq(messengerIdentities.id, baseline.identityId))
      .returning();

    const identity = toResolved(row, platform);
    cacheInvalidate(key);
    cacheSet(key, identity);

    await db
      .insert(businessEvents)
      .values({
        eventType: 'nova.identity_linked',
        entityType: 'agent',
        entityId: user.id,
        payload: {
          platform,
          senderId,
          identityId: identity.identityId,
          resolvedBy: 'auto_dm',
          linkedAt: now.toISOString(),
        },
        source: 'agent',
      })
      .catch(() => { /* non-fatal audit write */ });

    return identity;
  } catch (err) {
    logger.warn({ err, platform, senderId }, '[IdentityResolver] link-from-contact failed');
    return baseline;
  }
}

/**
 * Direct link when the userId is already known (e.g., admin manual link, or
 * Meta webhook payload with a page-scoped user_id we've reconciled).
 */
export async function linkIdentityToUser(
  platform: DmPlatform,
  senderId: string,
  userId: string,
  resolvedBy: string = 'admin',
): Promise<ResolvedIdentity> {
  const key = keyFor(platform, senderId);
  const baseline = await resolveIdentity(platform, senderId);

  try {
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return baseline;

    const completedCount = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.customerId, user.id), eq(bookings.status, 'completed')))
      .limit(1);

    const now = new Date();
    const [row] = await db
      .update(messengerIdentities)
      .set({
        userId: user.id,
        name: user.name ?? undefined,
        phone: user.phone ?? undefined,
        email: user.email ?? undefined,
        isResolved: true,
        isReturnCustomer: completedCount.length > 0,
        resolvedAt: now,
        resolvedBy,
        updatedAt: now,
      })
      .where(eq(messengerIdentities.id, baseline.identityId))
      .returning();

    const identity = toResolved(row, platform);
    cacheInvalidate(key);
    cacheSet(key, identity);
    return identity;
  } catch (err) {
    logger.warn({ err, platform, senderId, userId }, '[IdentityResolver] direct link failed');
    return baseline;
  }
}

// Ops helper — clears the in-process cache for a senderId so the next
// resolve hits the DB fresh (useful after an admin-side manual edit).
export function invalidateIdentityCache(platform: DmPlatform, senderId: string): void {
  cacheInvalidate(keyFor(platform, senderId));
}
