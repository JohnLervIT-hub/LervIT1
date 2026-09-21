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

export function hasSmsConsent(lead: {
  sourceChannel?: string | null;
  utmSource?: string | null;
  smsConsentAt?: Date | null;
}): boolean {
  // A recorded consent timestamp is the strongest evidence we have and wins
  // outright — sourceChannel can be edited or re-classified after the fact,
  // the stamp cannot.
  if (lead.smsConsentAt) return true;
  // UTM-based consent removed — re-add only when ad landing pages include
  // a CTIA-compliant SMS disclosure. A click on an ad is not consent to be
  // texted; the consent has to come from the form the click leads to, which
  // now stamps smsConsentAt above.
  return CONSENTED_SOURCES.includes(lead.sourceChannel ?? '');
}
