/**
 * Google Places API helpers for Scout + Ryan.
 *
 * Scout uses text-search + place-details to surface unhappy customers of
 * competitor moving companies (rating < 3.5 → fetch reviews → score each
 * for moving intent).
 *
 * Ryan uses text-search only to surface small good-rated operators
 * (rating >= 4.0 with < 30 reviews) as recruitment candidates.
 *
 * Cost sanity (2026 Places pricing, USD):
 *   - Text Search (Basic + Contact) ..... $0.032 / call
 *   - Place Details (Basic + Reviews) ... $0.017 / call
 * Scout worst-case (1 text + 10 details) ≈ $0.20/run.
 * Ryan (1 text) ≈ $0.032/run.
 *
 * Env: GOOGLE_MAPS_API_KEY (preferred) or VITE_GOOGLE_MAPS_API_KEY as
 * fallback for local dev where only the client-side var is set.
 */

import { logger } from '../logger';

const TEXTSEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

export interface PlacesResult {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  formatted_address?: string;
}

export interface PlaceReview {
  author_name: string;
  rating: number;
  text: string;
  time?: number;
  relative_time_description?: string;
}

export interface PlaceDetails {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  reviews?: PlaceReview[];
  formatted_phone_number?: string;
  website?: string;
}

function getKey(): string | null {
  const key =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
    '';
  return key || null;
}

/**
 * Text search for a query (e.g. "moving companies calgary"). Returns up
 * to the first-page results — pagination is available via `next_page_token`
 * but we intentionally don't page since the caller trims to the top N.
 */
export async function searchPlacesText(
  query: string,
  source: string,
): Promise<PlacesResult[]> {
  const key = getKey();
  if (!key) {
    logger.warn({ source }, 'Places: GOOGLE_MAPS_API_KEY unset — text search skipped');
    return [];
  }

  const url = `${TEXTSEARCH_URL}?query=${encodeURIComponent(query)}&key=${key}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn({ source, status: response.status }, 'Places: text search non-200');
      return [];
    }
    const data = (await response.json()) as {
      status?: string;
      error_message?: string;
      results?: PlacesResult[];
    };
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      logger.warn(
        { source, status: data.status, error: data.error_message },
        'Places: text search non-OK status',
      );
      return [];
    }
    const results = Array.isArray(data.results) ? data.results : [];
    logger.info(
      { source, query, count: results.length },
      'Places: text search ok',
    );
    return results;
  } catch (err) {
    logger.error({ err, source, query }, 'Places: text search threw');
    return [];
  }
}

/**
 * Fetch reviews + basic details for a place_id. We request only the
 * fields we actually use to keep the SKU on "Basic" + "Reviews" and
 * avoid the pricier Atmosphere/Contact tiers on unused columns.
 */
export async function getPlaceDetails(
  placeId: string,
  source: string,
): Promise<PlaceDetails | null> {
  const key = getKey();
  if (!key) return null;

  const fields = 'place_id,name,rating,user_ratings_total,reviews';
  const url =
    `${DETAILS_URL}?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${encodeURIComponent(fields)}&key=${key}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn(
        { source, placeId, status: response.status },
        'Places: details non-200',
      );
      return null;
    }
    const data = (await response.json()) as {
      status?: string;
      error_message?: string;
      result?: PlaceDetails;
    };
    if (data.status !== 'OK') {
      logger.warn(
        { source, placeId, status: data.status, error: data.error_message },
        'Places: details non-OK status',
      );
      return null;
    }
    return data.result ?? null;
  } catch (err) {
    logger.error({ err, source, placeId }, 'Places: details threw');
    return null;
  }
}

/**
 * Contact-tier details for a place_id — fetches phone + website in addition
 * to the basic fields. Kept separate from `getPlaceDetails` because Contact-
 * tier fields (formatted_phone_number) sit in a pricier SKU; Scout/Ryan
 * don't need them and shouldn't pay for them. Sam (SALES) uses this to
 * populate B2B lead contact info from Google Places.
 */
export async function getPlaceContactDetails(
  placeId: string,
  source: string,
): Promise<PlaceDetails | null> {
  const key = getKey();
  if (!key) return null;

  const fields = 'place_id,name,formatted_phone_number,website,formatted_address';
  const url =
    `${DETAILS_URL}?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${encodeURIComponent(fields)}&key=${key}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn(
        { source, placeId, status: response.status },
        'Places: contact details non-200',
      );
      return null;
    }
    const data = (await response.json()) as {
      status?: string;
      error_message?: string;
      result?: PlaceDetails;
    };
    if (data.status !== 'OK') {
      logger.warn(
        { source, placeId, status: data.status, error: data.error_message },
        'Places: contact details non-OK status',
      );
      return null;
    }
    return data.result ?? null;
  } catch (err) {
    logger.error({ err, source, placeId }, 'Places: contact details threw');
    return null;
  }
}
