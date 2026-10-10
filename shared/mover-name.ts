/**
 * Mover legal name vs. customer-facing display name.
 *
 * `users.name` is a single field and is the mover's LEGAL name: document
 * verification and Stripe payouts both match against it, so a mover registered
 * as "Calgary Junk Removal Ltd" fails both. `movers.displayName` is the
 * optional business name shown to customers instead.
 *
 * Shared so the signup warning (client) and the correction script (server)
 * cannot drift apart on what counts as a business name.
 */

export const BUSINESS_NAME_KEYWORDS = [
  'Inc',
  'Ltd',
  'LLC',
  'Co',
  'Removal',
  'Moving',
  'Services',
  'Solutions',
  'Junk',
  'Hauling',
  'Transport',
  'Logistics',
  'Group',
  'Bros',
  'Brothers',
] as const;

// Whole-word, case-insensitive, with an optional trailing "s" so the natural
// plurals ("Removals", "Solutions", "Groups") are caught by the singular
// keyword. Word boundaries keep "Co" from firing on "Cole" and "Inc" from
// firing on "Vincent"; a trailing period still matches, since \b sits between
// the letter and the dot ("Ltd." → hit).
const BUSINESS_NAME_RE = new RegExp(
  `\\b(?:${BUSINESS_NAME_KEYWORDS.join('|')})s?\\b`,
  'i',
);

/** True when a name looks like a business rather than a person's legal name. */
export function looksLikeBusinessName(name: string | null | undefined): boolean {
  if (!name) return false;
  return BUSINESS_NAME_RE.test(name);
}

/** Which keywords matched — for the audit log, so a false positive is obvious. */
export function matchedBusinessKeywords(name: string | null | undefined): string[] {
  if (!name) return [];
  return BUSINESS_NAME_KEYWORDS.filter((kw) =>
    new RegExp(`\\b${kw}s?\\b`, 'i').test(name),
  );
}

/**
 * True when a name is a single word after trimming.
 *
 * Deliberately a WARNING signal, never a hard block: mononyms are legitimate
 * legal names in several naming traditions (Indonesian and Tamil among
 * others), and `users.name` is shared by customers and admins, who have no
 * verification or payout requirement at all.
 */
export function isSingleWordName(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.trim().split(/\s+/).filter(Boolean).length < 2;
}

export const SINGLE_NAME_WARNING = 'Please enter both your first and last name.';

export const BUSINESS_NAME_WARNING =
  'This looks like a business name. Please enter your legal first and last name — you can set your business display name separately.';

/**
 * The name customers should see. Falls back to the legal name when no display
 * name is set. Deliberately NOT used on admin or payout surfaces, which must
 * keep showing the legal name.
 */
export function customerFacingMoverName(
  mover: { displayName?: string | null } | null | undefined,
  moverUser: { name?: string | null } | null | undefined,
  fallback = 'Your mover',
): string {
  const display = mover?.displayName?.trim();
  if (display) return display;
  return moverUser?.name?.trim() || fallback;
}
