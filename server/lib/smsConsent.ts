/**
 * Shared SMS consent gate (CASL / CTIA A2P 10DLC).
 *
 * A lead may only be texted when it reached us through a channel that implies
 * express consent — i.e. a human handed us the number. Leads scraped from
 * public listings (Kijiji, Craigslist, RentFaster, Google Alerts, Google
 * Places) never qualify and are email-only.
 *
 * Single source of truth for Alex (CLOSER-D) and Jordan (VETTER). Do not
 * re-declare this list inside an agent — the two copies drift.
 */
export const CONSENTED_SOURCES = [
  'quote_form',
  'manual',
  'contact_form',
  'signup',
  'instagram_dm',
  'messenger_dm',
  'mover_application',
  'nova_voice',
  'personal',
];

/**
 * CASL s.6(6) publicly-available exemption — recipient conspicuously published
 * their number for business contact on Kijiji. First message only; no repeat if
 * no response.
 *
 * Deliberately a separate list from CONSENTED_SOURCES: "first message only" is
 * a condition of the exemption, so it has to be enforced rather than described.
 * hasSmsConsent() clears these sources only when the caller passes
 * isFirstSms — i.e. has checked that no SMS has ever gone to this lead.
 */
export const PUBLISHED_CONTACT_SOURCES = [
  'kijiji_services',
];

export function hasSmsConsent(
  lead: {
    sourceChannel?: string | null;
    utmSource?: string | null;
    smsConsentAt?: Date | null;
    smsOptedOut?: boolean | null;
  },
  opts: { isFirstSms?: boolean } = {},
): boolean {
  // An inbound STOP overrides everything below it, including a recorded
  // consent stamp: consent given on Monday is revoked by a STOP on Tuesday.
  if (lead.smsOptedOut === true) return false;
  // A recorded consent timestamp is the strongest evidence we have and wins
  // outright — sourceChannel can be edited or re-classified after the fact,
  // the stamp cannot.
  if (lead.smsConsentAt) return true;
  // UTM-based consent removed — re-add only when ad landing pages include
  // a CTIA-compliant SMS disclosure. A click on an ad is not consent to be
  // texted; the consent has to come from the form the click leads to, which
  // now stamps smsConsentAt above.
  const source = lead.sourceChannel ?? '';
  if (CONSENTED_SOURCES.includes(source)) return true;
  // Published-contact exemption: one message, and only if this is it.
  return opts.isFirstSms === true && PUBLISHED_CONTACT_SOURCES.includes(source);
}
