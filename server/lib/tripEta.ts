/**
 * Live ETA for the customer tracking page.
 *
 * GET /api/bookings/:id/location is polled every 3s per viewer (TrackTrip's
 * useResilientPolling), so the Distance Matrix call behind the ETA cannot run
 * per request — that is a billed call per viewer per 3 seconds. Results are
 * cached per booking and only recomputed when something that would actually
 * change the answer has happened:
 *
 *   - the cache entry is older than CACHE_TTL_MS, or
 *   - the booking status changed (the destination flips pickup -> dropoff), or
 *   - the mover has moved more than CACHE_DIST_M from the origin we quoted from.
 *
 * Same invalidation rule TrackTrip already applies to its own client-side
 * DirectionsService call, so the two stay roughly in step.
 *
 * `arrivalTime` is an absolute epoch, not a countdown, so a cached entry does
 * not quietly get more wrong as it ages — a client can always recompute the
 * remaining minutes from it.
 *
 * `accurate` is getDrivingDistance's `success` flag passed through. It is false
 * when the Distance Matrix call failed or the key is missing, in which case the
 * duration is a straight-line Haversine divided by a flat 40 km/h. That number
 * is not an ETA and callers must not present it as one — showing "8 min" for a
 * 25-minute drive is worse than showing nothing.
 */

import { getDrivingDistance } from '../google-maps';
import { haversineMeters } from '../utils/distance';
import { logger } from '../logger';

export type EtaDestination = 'pickup' | 'dropoff';

export interface TripEta {
  minutes: number | null;
  /** Epoch ms. Absolute, so it does not drift while the entry is cached. */
  arrivalTime: number | null;
  destination: EtaDestination | null;
  /** false => Haversine fallback or no route. Do not render as a real ETA. */
  accurate: boolean;
}

export const NO_ETA: TripEta = {
  minutes: null,
  arrivalTime: null,
  destination: null,
  accurate: false,
};

interface CacheEntry {
  minutes: number | null;
  arrivalTime: number | null;
  accurate: boolean;
  cachedAt: number;
  status: string;
  originLat: number;
  originLng: number;
  destination: EtaDestination;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_DIST_M = 300;
const MAX_CACHE_ENTRIES = 500;

const etaCache = new Map<string, CacheEntry>();

// A cache miss on a 3s-polled endpoint is hit by every viewer at once — the
// customer, the mover's own app and any admin watching. Without this, one
// expiry fans out into several billed Distance Matrix calls.
const inFlight = new Map<string, Promise<CacheEntry | null>>();

// The map is keyed by bookingId and the process is long-lived, so drop expired
// entries whenever it grows past the cap.
function sweep(): void {
  if (etaCache.size <= MAX_CACHE_ENTRIES) return;
  const cutoff = Date.now() - CACHE_TTL_MS;
  const stale: string[] = [];
  etaCache.forEach((entry, key) => {
    if (entry.cachedAt < cutoff) stale.push(key);
  });
  stale.forEach((key) => etaCache.delete(key));
}

// pickupLatitude/pickupLongitude are notNull().default(0), so an ungeocoded
// booking reads as 0,0 rather than null — routing to it would put the
// destination in the Gulf of Guinea and quote a transatlantic ETA.
function coordsOrNull(
  lat: number | null,
  lng: number | null,
): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  if (lat === 0 || lng === 0) return null;
  return { lat, lng };
}

export interface ResolveTripEtaInput {
  bookingId: string;
  status: string;
  moverLat: number | null;
  moverLng: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
}

export async function resolveTripEta(input: ResolveTripEtaInput): Promise<TripEta> {
  const { bookingId, status, moverLat, moverLng } = input;

  // `in_transit` is the legacy spelling of en_route_to_pickup, still accepted
  // by PATCH /api/bookings/:id. `loading` means the mover is standing at the
  // pickup, so the next thing they are travelling to is the dropoff; quoting
  // an ETA to where they already are would read as "arriving in ~1 min".
  // `unloading` has no leg left at all.
  const heading: EtaDestination | null =
    status === 'en_route_to_pickup' || status === 'in_transit'
      ? 'pickup'
      : status === 'loading' || status === 'en_route_to_dropoff'
        ? 'dropoff'
        : null;

  if (!heading) return NO_ETA;

  const origin = coordsOrNull(moverLat, moverLng);
  const destination = coordsOrNull(
    heading === 'pickup' ? input.pickupLat : input.dropoffLat,
    heading === 'pickup' ? input.pickupLng : input.dropoffLng,
  );

  if (!origin || !destination) return NO_ETA;

  const cached = etaCache.get(bookingId);
  if (cached && isFresh(cached, status, heading, origin.lat, origin.lng)) {
    return toTripEta(cached);
  }

  let pending = inFlight.get(bookingId);
  if (!pending) {
    pending = fetchEta(bookingId, status, heading, origin, destination);
    inFlight.set(bookingId, pending);
    pending.finally(() => inFlight.delete(bookingId));
  }

  const entry = await pending;
  // A failed lookup falls back to the stale entry rather than blanking the
  // badge the customer is already looking at.
  if (!entry) return cached ? toTripEta(cached) : NO_ETA;
  return toTripEta(entry);
}

function isFresh(
  entry: CacheEntry,
  status: string,
  heading: EtaDestination,
  moverLat: number,
  moverLng: number,
): boolean {
  if (Date.now() - entry.cachedAt >= CACHE_TTL_MS) return false;
  if (entry.status !== status) return false;
  if (entry.destination !== heading) return false;
  return haversineMeters(entry.originLat, entry.originLng, moverLat, moverLng) < CACHE_DIST_M;
}

async function fetchEta(
  bookingId: string,
  status: string,
  heading: EtaDestination,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<CacheEntry | null> {
  try {
    // getDrivingDistance swallows its own failures and returns success:false,
    // so this only throws on something unexpected.
    const result = await getDrivingDistance(origin, destination);

    const entry: CacheEntry = {
      minutes: result.success ? result.durationMinutes : null,
      arrivalTime: result.success ? Date.now() + result.durationMinutes * 60000 : null,
      accurate: result.success,
      cachedAt: Date.now(),
      status,
      originLat: origin.lat,
      originLng: origin.lng,
      destination: heading,
    };

    etaCache.set(bookingId, entry);
    sweep();
    return entry;
  } catch (err) {
    logger.warn({ err, bookingId }, '[TripEta] ETA lookup failed');
    return null;
  }
}

function toTripEta(entry: CacheEntry): TripEta {
  return {
    minutes: entry.minutes,
    arrivalTime: entry.arrivalTime,
    destination: entry.destination,
    accurate: entry.accurate,
  };
}
