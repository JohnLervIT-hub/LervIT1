/**
 * Nova cross-channel identity resolver.
 *
 * `messenger_identities` stores one row per known customer with a nullable
 * column per channel handle (instagramSenderId, messengerSenderId,
 * whatsappPhone, tiktokUserId, phone). Callers pass a Channel + channelId
 * and this module resolves — or creates — the matching row, updates the
 * counter, and returns a normalized ResolvedIdentity.
 *
 * FLOW:
 *   1) Inbound touch → `resolveIdentity(channel, channelId)`. Read cache
 *      first; on miss, look the row up by the channel-specific column,
 *      upsert on absence, bump total_messages / last_seen_at, cache, return.
 *   2) Nova collects contact info → `linkIdentityFromContact(channel,
 *      channelId, { phone, email, name })`. Looks up `users` by phone or
 *      email; on hit, links user_id to the identity row + writes the
 *      nova.identity_linked audit event so subsequent touches on ANY of
 *      this customer's channels return the enriched identity.
 *
 * Cache is read-through with a 30-minute TTL and is invalidated on every
 * mutation. On DB error we return an ephemeral identity so Tier 2 still
 * runs — Nova replies, we just miss the persistence for that turn.
 */

import { and, eq, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db';
import {
  bookings,
  businessEvents,
  messengerIdentities,
  users,
} from '@shared/schema';
import { logger } from '../logger';

export type Channel = 'messenger' | 'instagram' | 'whatsapp' | 'tiktok' | 'voice' | 'sms';

// Legacy alias for DM-only callers (Messenger + Instagram handlers).
export type DmPlatform = Extract<Channel, 'messenger' | 'instagram'>;

export interface ResolvedIdentity {
  identityId: string;         // messenger_identities.id
  channel: Channel;           // channel this touch came from
  channelId: string;          // handle on that channel
  isKnown: boolean;           // true iff mapped to a users row
  userId?: string;
  name?: string;
  phone?: string;
  email?: string;
  isReturnCustomer: boolean;
  totalInteractions: number;  // total_messages
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastChannel?: Channel;
  resolvedAt?: Date;
  resolvedBy?: string;
}

// ── channel → column mapping ────────────────────────────────────

// Every channel is stored on its own column. voice + sms both live on
// `phone` since they share E.164 identifiers.
function getChannelColumn(channel: Channel): PgColumn {
  switch (channel) {
    case 'instagram': return messengerIdentities.instagramSenderId;
    case 'messenger': return messengerIdentities.messengerSenderId;
    case 'whatsapp':  return messengerIdentities.whatsappPhone;
    case 'tiktok':    return messengerIdentities.tiktokUserId;
    case 'voice':
    case 'sms':       return messengerIdentities.phone;
  }
}

// Return the (partial) insert row for creating a fresh identity on a
// given channel. Every channel column except the one in use stays null.
function insertColumnFor(channel: Channel, normalizedId: string): Record<string, unknown> {
  const row: Record<string, unknown> = { lastChannel: channel };
  switch (channel) {
    case 'instagram':
      row.instagramSenderId = normalizedId;
      break;
    case 'messenger':
      row.messengerSenderId = normalizedId;
      break;
    case 'whatsapp':
      row.whatsappPhone = normalizedId;
      break;
    case 'tiktok':
      row.tiktokUserId = normalizedId;
      break;
    case 'voice':
    case 'sms':
      row.phone = normalizedId;
      break;
  }
  return row;
}

// ── phone normalizer (E.164-ish, NA-biased) ────────────────────
// Voice/SMS/WhatsApp channelIds are phone numbers and get normalized so
// "(403) 555-1234", "+14035551234", "4035551234" all collapse to the
// same lookup key.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 0) return raw;
  return `+${digits}`;
}

function normalizeChannelId(channel: Channel, id: string): string {
  if (channel === 'voice' || channel === 'sms' || channel === 'whatsapp') {
    return normalizePhone(id);
  }
  return id;
}

// ── in-process read cache ──────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  identity: ResolvedIdentity;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function keyFor(channel: Channel, channelId: string): string {
  return `${channel}:${normalizeChannelId(channel, channelId)}`;
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

// ── row → API shape ────────────────────────────────────────────

function toResolved(
  row: typeof messengerIdentities.$inferSelect,
  channel: Channel,
  channelId: string,
): ResolvedIdentity {
  return {
    identityId: row.id,
    channel,
    channelId,
    isKnown: row.isResolved && !!row.userId,
    userId: row.userId ?? undefined,
    name: row.name ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    isReturnCustomer: row.isReturnCustomer,
    totalInteractions: row.totalMessages,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    lastChannel: (row.lastChannel as Channel | null) ?? undefined,
    resolvedAt: row.resolvedAt ?? undefined,
    resolvedBy: row.resolvedBy ?? undefined,
  };
}

// ── public API ─────────────────────────────────────────────────

/**
 * Upsert the identity row for (channel, channelId) and return the enriched
 * profile. Every call bumps total_messages and refreshes last_seen_at.
 */
export async function resolveIdentity(
  channel: Channel,
  channelId: string,
): Promise<ResolvedIdentity> {
  const normalizedId = normalizeChannelId(channel, channelId);
  const key = `${channel}:${normalizedId}`;

  const cached = cacheGet(key);
  if (cached) {
    // Cache hit: bump the local counter, return quickly, and fire-and-forget
    // the counter update so DM latency stays dominated by the LLM call.
    const bumped: ResolvedIdentity = {
      ...cached,
      totalInteractions: cached.totalInteractions + 1,
      lastSeenAt: new Date(),
      lastChannel: channel,
    };
    cacheSet(key, bumped);
    db
      .update(messengerIdentities)
      .set({
        totalMessages: bumped.totalInteractions,
        lastSeenAt: bumped.lastSeenAt,
        lastChannel: channel,
        updatedAt: new Date(),
      })
      .where(eq(messengerIdentities.id, cached.identityId))
      .catch((err) => logger.warn({ err, key }, '[IdentityResolver] cache-hit counter update failed'));
    return bumped;
  }

  try {
    const channelCol = getChannelColumn(channel);

    const [existing] = await db
      .select()
      .from(messengerIdentities)
      .where(eq(channelCol, normalizedId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(messengerIdentities)
        .set({
          totalMessages: existing.totalMessages + 1,
          lastSeenAt: new Date(),
          lastChannel: channel,
          updatedAt: new Date(),
        })
        .where(eq(messengerIdentities.id, existing.id))
        .returning();
      const identity = toResolved(updated, channel, normalizedId);
      cacheSet(key, identity);
      return identity;
    }

    const [inserted] = await db
      .insert(messengerIdentities)
      .values({
        ...insertColumnFor(channel, normalizedId),
        totalMessages: 1,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      })
      .returning();
    const identity = toResolved(inserted, channel, normalizedId);
    cacheSet(key, identity);
    return identity;
  } catch (err) {
    logger.warn({ err, channel, channelId }, '[IdentityResolver] resolve failed — returning ephemeral');
    const now = new Date();
    return {
      identityId: `ephemeral:${channel}:${normalizedId}`,
      channel,
      channelId: normalizedId,
      isKnown: false,
      isReturnCustomer: false,
      totalInteractions: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      lastChannel: channel,
    };
  }
}

/**
 * Auto-link when Nova extracts contact info from an inbound message. Looks
 * up the users row by phone or email; on hit, permanently binds user_id to
 * the identity row so subsequent touches on ANY channel this customer uses
 * (once we know them) return enriched context.
 *
 * IMPORTANT: does its OWN row lookup rather than calling resolveIdentity()
 * internally, so it never double-bumps total_messages on the same DM turn.
 */
export async function linkIdentityFromContact(
  channel: Channel,
  channelId: string,
  contact: { phone?: string; email?: string; name?: string },
): Promise<ResolvedIdentity> {
  const normalizedId = normalizeChannelId(channel, channelId);
  const key = `${channel}:${normalizedId}`;
  const contactPhone = contact.phone ? normalizePhone(contact.phone) : undefined;

  const clauses: SQL[] = [];
  if (contactPhone) clauses.push(eq(users.phone, contactPhone));
  if (contact.email) clauses.push(eq(users.email, contact.email));

  if (clauses.length === 0) {
    // Nothing to look up — fall back to a plain resolve so the caller
    // still gets a valid identity.
    return resolveIdentity(channel, channelId);
  }

  try {
    // Find (or create) the row for this channel handle. No bump here.
    const channelCol = getChannelColumn(channel);
    let [row] = await db
      .select()
      .from(messengerIdentities)
      .where(eq(channelCol, normalizedId))
      .limit(1);

    if (!row) {
      const [inserted] = await db
        .insert(messengerIdentities)
        .values({
          ...insertColumnFor(channel, normalizedId),
          totalMessages: 0,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        })
        .returning();
      row = inserted;
    }

    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(clauses.length === 1 ? clauses[0] : or(...clauses)!)
      .limit(1);

    if (!user) {
      // No matching user — persist the contact strings on the row so a
      // later signup with the same phone/email can reconcile.
      const [updated] = await db
        .update(messengerIdentities)
        .set({
          phone: contactPhone ?? row.phone ?? undefined,
          email: contact.email ?? row.email ?? undefined,
          name: contact.name ?? row.name ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(messengerIdentities.id, row.id))
        .returning();
      const identity = toResolved(updated, channel, normalizedId);
      cacheInvalidate(key);
      cacheSet(key, identity);
      return identity;
    }

    const completedCount = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.customerId, user.id), eq(bookings.status, 'completed')))
      .limit(1);

    const now = new Date();
    const [updated] = await db
      .update(messengerIdentities)
      .set({
        userId: user.id,
        name: user.name ?? contact.name ?? row.name ?? undefined,
        phone: user.phone ?? contactPhone ?? row.phone ?? undefined,
        email: user.email ?? contact.email ?? row.email ?? undefined,
        isResolved: true,
        isReturnCustomer: completedCount.length > 0,
        resolvedAt: now,
        resolvedBy: 'auto_dm',
        updatedAt: now,
      })
      .where(eq(messengerIdentities.id, row.id))
      .returning();

    const identity = toResolved(updated, channel, normalizedId);
    cacheInvalidate(key);
    cacheSet(key, identity);

    await db
      .insert(businessEvents)
      .values({
        eventType: 'nova.identity_linked',
        entityType: 'agent',
        entityId: user.id,
        payload: {
          channel,
          channelId: normalizedId,
          identityId: identity.identityId,
          resolvedBy: 'auto_dm',
          linkedAt: now.toISOString(),
        },
        source: 'agent',
      })
      .catch(() => { /* non-fatal audit write */ });

    return identity;
  } catch (err) {
    logger.warn({ err, channel, channelId }, '[IdentityResolver] link-from-contact failed');
    return resolveIdentity(channel, channelId);
  }
}

/**
 * Admin/webhook-driven direct link — when we already know the userId.
 */
export async function linkIdentityToUser(
  channel: Channel,
  channelId: string,
  userId: string,
  resolvedBy: string = 'admin',
): Promise<ResolvedIdentity> {
  const normalizedId = normalizeChannelId(channel, channelId);
  const key = `${channel}:${normalizedId}`;

  try {
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      return resolveIdentity(channel, channelId);
    }

    const channelCol = getChannelColumn(channel);
    let [row] = await db
      .select()
      .from(messengerIdentities)
      .where(eq(channelCol, normalizedId))
      .limit(1);

    if (!row) {
      const [inserted] = await db
        .insert(messengerIdentities)
        .values({
          ...insertColumnFor(channel, normalizedId),
          totalMessages: 0,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        })
        .returning();
      row = inserted;
    }

    const completedCount = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.customerId, user.id), eq(bookings.status, 'completed')))
      .limit(1);

    const now = new Date();
    const [updated] = await db
      .update(messengerIdentities)
      .set({
        userId: user.id,
        name: user.name ?? row.name ?? undefined,
        phone: user.phone ?? row.phone ?? undefined,
        email: user.email ?? row.email ?? undefined,
        isResolved: true,
        isReturnCustomer: completedCount.length > 0,
        resolvedAt: now,
        resolvedBy,
        updatedAt: now,
      })
      .where(eq(messengerIdentities.id, row.id))
      .returning();

    const identity = toResolved(updated, channel, normalizedId);
    cacheInvalidate(key);
    cacheSet(key, identity);
    return identity;
  } catch (err) {
    logger.warn({ err, channel, channelId, userId }, '[IdentityResolver] direct link failed');
    return resolveIdentity(channel, channelId);
  }
}

/**
 * Ops helper — clears the in-process cache for one identity so the next
 * touch hits the DB fresh (use after an admin edit).
 */
export function invalidateIdentityCache(channel: Channel, channelId: string): void {
  cacheInvalidate(keyFor(channel, channelId));
}
