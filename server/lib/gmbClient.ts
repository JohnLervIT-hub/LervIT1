/**
 * Google Business Profile (GMB) API client — OAuth2 refresh-token flow.
 *
 * Covers the two Google surfaces we need, which live on different hosts:
 *   - Account discovery: mybusinessaccountmanagement.googleapis.com/v1
 *   - Reviews + replies:  mybusiness.googleapis.com/v4
 * Reviews were never migrated off the legacy v4 endpoint — there is no v1
 * reviews API — so the version split below is Google's, not ours.
 *
 * ── SETUP: GOOGLE_GMB_REFRESH_TOKEN DOES NOT EXIST YET ──────────────────
 * GOOGLE_GMB_CLIENT_ID and GOOGLE_GMB_CLIENT_SECRET come from the Google
 * Cloud console OAuth client. The refresh token does NOT — it can only be
 * produced by a one-time interactive consent flow that has not been run:
 *
 *   1. Enable "Google My Business API" + "My Business Account Management API"
 *      on the Cloud project (gated behind the GMB API allowlist — see case
 *      8-3924000041848 referenced in server/agents/ember.ts).
 *   2. Send the account owner to Google's consent screen with
 *      scope=https://www.googleapis.com/auth/business.manage,
 *      access_type=offline and prompt=consent (prompt=consent is required —
 *      without it Google returns no refresh_token on repeat authorizations).
 *   3. Exchange the returned ?code= for tokens at the token endpoint below.
 *   4. Put the refresh_token in Railway as GOOGLE_GMB_REFRESH_TOKEN.
 *
 * Until step 4 lands, every function here short-circuits with a warning and a
 * null/empty result rather than throwing — the same contract as
 * server/lib/googleVision.ts. Callers must handle the disabled case; nothing
 * in this module throws on missing configuration, and nothing reads env at
 * import time in a way that can fail a boot.
 */

import { logger } from '../logger';

const CLIENT_ID = process.env.GOOGLE_GMB_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_GMB_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_GMB_REFRESH_TOKEN;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ACCOUNT_MGMT_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BUSINESS_BASE = 'https://mybusiness.googleapis.com/v4';

/** Refresh a minute early so a token can't expire mid-request. */
const TOKEN_EXPIRY_SKEW_MS = 60_000;

/** Google caps review pages at 50; the loop below is also bounded so a bad
 *  nextPageToken can't spin forever. */
const REVIEW_PAGE_SIZE = 50;
const MAX_REVIEW_PAGES = 40;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GmbStarRating =
  | 'STAR_RATING_UNSPECIFIED'
  | 'ONE'
  | 'TWO'
  | 'THREE'
  | 'FOUR'
  | 'FIVE';

export interface GmbReview {
  /** Opaque per-review id, stable across syncs. */
  reviewId: string;
  /** Full resource path — "accounts/{a}/locations/{l}/reviews/{r}". This is
   *  what replyToReview() needs, so it is carried through to the DB. */
  name: string;
  reviewer: { displayName?: string; profilePhotoUrl?: string };
  starRating: GmbStarRating;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment: string; updateTime?: string };
}

export interface GmbLocationRating {
  averageRating: number | null;
  totalReviewCount: number;
}

/** Google's star enum → a number our schema and UI can use. */
export function starRatingToNumber(rating: GmbStarRating | undefined): number | null {
  switch (rating) {
    case 'ONE':
      return 1;
    case 'TWO':
      return 2;
    case 'THREE':
      return 3;
    case 'FOUR':
      return 4;
    case 'FIVE':
      return 5;
    default:
      return null;
  }
}

/**
 * True when all three OAuth env vars are present. Callers use this to decide
 * whether to attempt a call at all, so the "not configured yet" path stays a
 * clean skip instead of a failed request.
 */
export function isGmbConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Exchange the long-lived refresh token for a short-lived access token.
 * Cached until just before expiry — a sync pass makes several calls and
 * Google rate-limits token minting separately from the data APIs.
 *
 * Returns null (never throws) when GMB is unconfigured or Google rejects the
 * exchange, e.g. after the refresh token is revoked.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!isGmbConfigured()) {
    logger.warn('[GMB] OAuth env vars not set — skipping (needs GOOGLE_GMB_REFRESH_TOKEN)');
    return null;
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_EXPIRY_SKEW_MS) {
    return cachedToken.token;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        refresh_token: REFRESH_TOKEN!,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      // Body carries Google's error code (invalid_grant = revoked/expired
      // token) but also echoes the client_id, so log status + error only.
      const body: any = await res.json().catch(() => ({}));
      logger.error(
        { status: res.status, error: body?.error, description: body?.error_description },
        '[GMB] token refresh failed',
      );
      cachedToken = null;
      return null;
    }

    const data: any = await res.json();
    if (!data?.access_token) {
      logger.error('[GMB] token response had no access_token');
      return null;
    }

    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    };
    return cachedToken.token;
  } catch (err) {
    logger.error({ err }, '[GMB] token refresh threw');
    cachedToken = null;
    return null;
  }
}

/** Authorized GET returning parsed JSON, or null on any failure. */
async function authedGet(url: string): Promise<any | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error({ status: res.status, url, body: text.slice(0, 300) }, '[GMB] GET failed');
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.error({ err, url }, '[GMB] GET threw');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/**
 * Resolve the first GMB account this OAuth client can see, as "accounts/{id}".
 *
 * Most GMB logins have exactly one account. If this one ever manages several,
 * pin the right one with GOOGLE_GMB_ACCOUNT_ID rather than relying on order —
 * Google does not guarantee it.
 */
export async function getAccountId(): Promise<string | null> {
  const pinned = process.env.GOOGLE_GMB_ACCOUNT_ID?.trim();
  if (pinned) return pinned;

  const data = await authedGet(`${ACCOUNT_MGMT_BASE}/accounts`);
  const accounts: any[] = data?.accounts ?? [];

  if (accounts.length === 0) {
    logger.warn('[GMB] no accounts returned — check the OAuth user has access');
    return null;
  }
  if (accounts.length > 1) {
    logger.warn(
      { count: accounts.length, using: accounts[0]?.name },
      '[GMB] multiple accounts visible — set GOOGLE_GMB_ACCOUNT_ID to pin one',
    );
  }
  return accounts[0]?.name ?? null;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/** Build the "accounts/{a}/locations/{l}" parent, tolerating either bare ids
 *  or already-prefixed resource paths in env/args. */
function locationParent(accountId: string, locationId: string): string {
  const account = accountId.startsWith('accounts/') ? accountId : `accounts/${accountId}`;
  if (locationId.startsWith('accounts/')) return locationId;
  const location = locationId.startsWith('locations/') ? locationId : `locations/${locationId}`;
  return `${account}/${location}`;
}

/**
 * Every review for a location, following nextPageToken to the end.
 *
 * Returns [] when GMB is unconfigured or a page fails — callers treat that as
 * "nothing to sync" rather than "the location has no reviews", so a transient
 * failure never looks like review deletion.
 */
export async function listReviews(accountId: string, locationId: string): Promise<GmbReview[]> {
  const parent = locationParent(accountId, locationId);
  const all: GmbReview[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const url = new URL(`${BUSINESS_BASE}/${parent}/reviews`);
    url.searchParams.set('pageSize', String(REVIEW_PAGE_SIZE));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const data = await authedGet(url.toString());
    if (!data) break;

    for (const r of (data.reviews ?? []) as any[]) {
      if (!r?.reviewId || !r?.name) continue;
      all.push({
        reviewId: r.reviewId,
        name: r.name,
        reviewer: {
          displayName: r.reviewer?.displayName,
          profilePhotoUrl: r.reviewer?.profilePhotoUrl,
        },
        starRating: r.starRating,
        comment: r.comment,
        createTime: r.createTime,
        updateTime: r.updateTime,
        reviewReply: r.reviewReply
          ? { comment: r.reviewReply.comment, updateTime: r.reviewReply.updateTime }
          : undefined,
      });
    }

    pageToken = data.nextPageToken;
    pages++;
  } while (pageToken && pages < MAX_REVIEW_PAGES);

  if (pageToken) {
    logger.warn({ pages, collected: all.length }, '[GMB] hit review page cap — list truncated');
  }
  return all;
}

/**
 * Post (or overwrite) our reply to one review.
 *
 * `reviewName` is the full resource path from GmbReview.name. The v4 API uses
 * PUT for both create and update, so replying to an already-answered review
 * silently replaces the previous reply — callers that only want to answer
 * unanswered reviews must check reviewReply themselves.
 *
 * Returns false instead of throwing when GMB is unconfigured or Google
 * rejects the write, so a failed reply can't take down the caller.
 */
export async function replyToReview(reviewName: string, replyText: string): Promise<boolean> {
  const comment = replyText?.trim();
  if (!comment) {
    logger.warn({ reviewName }, '[GMB] replyToReview called with empty text — skipping');
    return false;
  }

  const token = await getAccessToken();
  if (!token) return false;

  try {
    const res = await fetch(`${BUSINESS_BASE}/${reviewName}/reply`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, reviewName, body: text.slice(0, 300) },
        '[GMB] reply failed',
      );
      return false;
    }

    logger.info({ reviewName }, '[GMB] reply posted');
    return true;
  } catch (err) {
    logger.error({ err, reviewName }, '[GMB] reply threw');
    return false;
  }
}

/**
 * Location-level averageRating + totalReviewCount.
 *
 * These are returned as top-level fields on the reviews list response — there
 * is no dedicated rating endpoint — so this asks for the smallest possible
 * page and reads the aggregates off it rather than pulling every review.
 *
 * accountId/locationId default to env so callers (e.g. the public reviews
 * endpoint) don't each have to resolve the account.
 */
export async function getLocationRating(
  accountId?: string,
  locationId?: string,
): Promise<GmbLocationRating | null> {
  const account = accountId ?? (await getAccountId());
  const location = locationId ?? process.env.GOOGLE_GMB_LOCATION_ID?.trim();

  if (!account || !location) {
    logger.warn('[GMB] getLocationRating — missing account or GOOGLE_GMB_LOCATION_ID');
    return null;
  }

  const url = new URL(`${BUSINESS_BASE}/${locationParent(account, location)}/reviews`);
  url.searchParams.set('pageSize', '1');

  const data = await authedGet(url.toString());
  if (!data) return null;

  return {
    averageRating: typeof data.averageRating === 'number' ? data.averageRating : null,
    totalReviewCount: Number(data.totalReviewCount) || 0,
  };
}
