/**
 * Shared Google listing configuration.
 *
 * The LervIT place ID was previously duplicated two ways: /api/google-reviews
 * re-discovered it at runtime with a Places textsearch for "LervIT Calgary
 * moving" and took results[0], while Kai's review-request SMS hardcoded a
 * literal. Nothing guaranteed those resolved to the same listing, so the
 * reviews widget and the "leave us a review" link could point at different
 * places. Both now read this.
 *
 * Reads env at import but never throws — an unset var falls back to the
 * previously hardcoded ID so a deploy that forgets GOOGLE_PLACE_ID keeps the
 * public reviews widget and the SMS link working.
 */

/** Fallback: the ID that was hardcoded in server/agents/kai.ts. */
const FALLBACK_PLACE_ID = 'ChIJwfu0I0JVUqgR6kpKN2fpsQA';

export const GOOGLE_PLACE_ID = process.env.GOOGLE_PLACE_ID?.trim() || FALLBACK_PLACE_ID;

/** True when the ID came from env rather than the baked-in fallback. */
export const GOOGLE_PLACE_ID_FROM_ENV = Boolean(process.env.GOOGLE_PLACE_ID?.trim());

/** Public "write a review" link for the listing. */
export const GOOGLE_REVIEW_URL = `https://search.google.com/local/writereview?placeid=${GOOGLE_PLACE_ID}`;
