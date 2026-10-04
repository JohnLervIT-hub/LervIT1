/**
 * Service area gate — the one definition of where LervIT will take a job.
 *
 * Imported by both the server (POST /api/bookings and PATCH
 * /api/bookings/:id/edit, which are the actual gate) and the booking form
 * (which only surfaces the same answer early). Keep them reading this file
 * rather than re-listing municipalities, or the two will drift and the form
 * will promise a move the API then refuses.
 *
 * Matching is deliberately conservative: a comma-separated part has to BE a
 * listed municipality, not merely contain one. "123 Calgary Trail, Edmonton,
 * AB" is a real Edmonton address, and a substring test would have accepted it.
 */

/** Lower-case municipality names accepted anywhere in an address. */
export const SERVICE_AREA_CITIES = [
  'calgary',
  'chestermere',
  'airdrie',
  'rocky view county',
  'rockyview',
  'okotoks',
  'cochrane',
];

/** Human-readable list, so every message spells the area the same way. */
export const SERVICE_AREA_LABEL =
  'Calgary, Chestermere, Airdrie, Rocky View County, Okotoks, and Cochrane';

/**
 * Forward sortation areas (the first three characters of a postal code) that
 * sit inside the service area, used when an address carries a postal code but
 * no municipality we recognise.
 *
 *   T1S            Okotoks
 *   T1X            Chestermere + the Rocky View land around it
 *   T1Y, T2*, T3*  Calgary
 *   T1Z            Rocky View County
 *   T4A, T4B       Airdrie
 *   T4C            Cochrane
 *
 * Note this is narrower than "T4A etc. counts as Calgary": T4A/T4B are Airdrie
 * and T4C is Cochrane, which are separately in the area, so the gate's answer
 * is the same. It matters that the rule stays an explicit list — a blanket
 * "T4" would admit Red Deer (T4N/T4P/T4R), and T1P (Strathmore) and T1V (High
 * River) sit next to the allowed T1 codes and must stay out.
 */
const SERVICE_AREA_FSA = /^(?:T1[SXYZ]|T2[A-Z]|T3[A-Z]|T4[ABC])$/;

/**
 * Tokens that are never a municipality and are dropped off the end of a part.
 * Every province is listed, not just Alberta: an out-of-area address still has
 * to yield a readable city name for the message, and without "on" here
 * "Ottawa, ON" was reported back to the customer as "On".
 */
const NON_CITY_TOKENS = new Set([
  'canada', 'ca',
  'ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'nt', 'nu', 'on', 'pe', 'qc', 'sk', 'yt',
  'alberta', 'british', 'columbia', 'manitoba', 'brunswick', 'newfoundland',
  'labrador', 'scotia', 'nova', 'northwest', 'territories', 'nunavut',
  'ontario', 'prince', 'edward', 'island', 'quebec', 'saskatchewan', 'yukon',
]);

const CITY_KEYS = new Set(SERVICE_AREA_CITIES.map(c => c.replace(/\s+/g, '')));

/**
 * Split one comma-separated part into the tokens that could name a city, with
 * any trailing province, country or postal code removed.
 *
 *   "Calgary"            -> ['calgary']
 *   "Calgary AB T2P 1A1" -> ['calgary']
 *   "AB"                 -> []
 *   "123 Main St SW"     -> ['123', 'main', 'st', 'sw']
 */
function cityTokens(part: string): string[] {
  const tokens = part
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    const isProvinceOrCountry = NON_CITY_TOKENS.has(last);
    const isFsa = /^[a-z]\d[a-z]$/.test(last);
    const isLocalDeliveryUnit = /^\d[a-z]\d$/.test(last);
    if (!isProvinceOrCountry && !isFsa && !isLocalDeliveryUnit) break;
    tokens.pop();
  }
  return tokens;
}

/** Whitespace-stripped so "Rocky View" and "rockyview" are the same key. */
function cityKey(part: string): string {
  return cityTokens(part).join('');
}

/** First forward sortation area in the address, if it carries one. */
function forwardSortationArea(address: string): string | null {
  const upper = address.toUpperCase();
  const full = upper.match(/\b([A-Z]\d[A-Z])\s*\d[A-Z]\d\b/);
  if (full) return full[1];
  const bare = upper.match(/\bT\d[A-Z]\b/);
  return bare ? bare[0] : null;
}

/**
 * True when the address names a municipality we serve, or carries a postal
 * code inside the area. An address we cannot place is treated as outside —
 * the gate fails closed.
 */
export function isInServiceArea(address: string): boolean {
  if (!address || !address.trim()) return false;

  for (const part of address.split(',')) {
    const key = cityKey(part);
    if (key && CITY_KEYS.has(key)) return true;
  }

  const fsa = forwardSortationArea(address);
  return fsa !== null && SERVICE_AREA_FSA.test(fsa);
}

/**
 * Best-effort municipality name, for telling someone which place we turned
 * down. Returns null when the address has no part that reads like a city.
 */
export function extractCity(address: string): string | null {
  if (!address) return null;
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);

  // A served municipality wins wherever it appears, so the name we echo back
  // matches the one we matched on.
  for (const part of parts) {
    const tokens = cityTokens(part);
    if (tokens.length > 0 && CITY_KEYS.has(tokens.join(''))) return titleCase(tokens);
  }

  // Otherwise the last part that still reads like a name once province,
  // country and postal code are gone, skipping the street line.
  for (let i = parts.length - 1; i >= 0; i--) {
    const tokens = cityTokens(parts[i]);
    if (tokens.length === 0) continue;
    if (/^\d/.test(tokens[0])) continue;
    return titleCase(tokens);
  }
  return null;
}

function titleCase(tokens: string[]): string {
  return tokens.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
}

/** Message for the API's 400. */
export function serviceAreaApiMessage(address: string): string {
  const city = extractCity(address);
  return `We currently serve ${SERVICE_AREA_LABEL}. ${city ?? 'That address'} is outside our service area.`;
}

/** Message for the inline error under an address field. */
export function serviceAreaFieldMessage(address: string): string {
  const city = extractCity(address);
  return `We don't currently serve ${city ?? 'that area'}. We serve ${SERVICE_AREA_LABEL}.`;
}
