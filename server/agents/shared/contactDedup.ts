/**
 * Contact-level lead identity — "is this the same person?"
 *
 * Lifted out of RyanAgent.isContactDuplicate, which only guarded Ryan's
 * scraped-crawl insert. The `leads` table has no unique constraint on
 * contact_phone / contact_email (plain indexes only), so every insert site is
 * free to create another row for someone already in the table — and every
 * agent then works those rows independently.
 *
 * Matching is on NORMALIZED phone, not the stored string. Ryan's original
 * guard used `eq(leads.contactPhone, phone)`, and the scrape stores whatever
 * the listing showed, so `+18254880222`, `+1 403 408 6952` and
 * `+1-403-389-9595` all coexisted and exact equality never matched across
 * them. 13 of the 19 duplicate groups in production differ only by format.
 *
 * The SQL key is the last 10 digits, which is what normalizeToE164 collapses a
 * North American number to. It is an expression, so it cannot use
 * leads_contact_phone_idx — fine at this table's size, and correct regardless
 * of what format a pre-existing row was written in.
 *
 * Scoped by leadType on purpose. One phone in production belongs to both a
 * b2bm mover candidate and a b2c quote request, and another to b2bm plus
 * Sam's b2bp pool: same human, different relationship. Collapsing those would
 * fold a customer into a mover candidate.
 */

import { and, eq, isNotNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { leads } from '@shared/schema';
import { normalizeToE164 } from '../../notifications';

export type LeadType = 'b2c' | 'b2bm' | 'b2bp';

/**
 * Status written on a duplicate row that was folded into a survivor. The row is
 * kept for audit but is dead: its business_events have been reassigned and no
 * agent should work it again.
 *
 * Excluded from both lookups below. Without this, findContactDuplicate ordered
 * by created_at and could return a merged row whenever it predated its own
 * survivor — 2 of 13 production groups did, one of them a real applicant's
 * number. A re-application would then fold into the dead row, which the route's
 * UPDATE leaves at status 'merged' and therefore invisible to every sweep,
 * while the survivor keeps the history: one person, two half-rows.
 */
const MERGED_STATUS = 'merged';

/** Last 10 digits of a stored phone — the cross-format match key. */
const storedPhoneKey = sql`right(regexp_replace(${leads.contactPhone}, '[^0-9]', '', 'g'), 10)`;

/**
 * Canonical E.164 for writing to contact_phone, or null when the input can't
 * be parsed. Callers store the null rather than the raw string: an unparseable
 * number is not reachable by SMS and not matchable by dedupe, so keeping the
 * original only creates a row that looks contactable and isn't.
 */
export function canonicalPhone(raw: string | null | undefined): string | null {
  return normalizeToE164(raw ?? null);
}

/** The same 10-digit key as storedPhoneKey, for a candidate not yet inserted. */
function phoneMatchKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Email match key — lowercased and trimmed; stored casing varies. */
function emailMatchKey(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  return v.length > 0 ? v : null;
}

function contactClauses(phone: string | null, email: string | null): SQL | null {
  const clauses: SQL[] = [];
  const phoneKey = phoneMatchKey(phone);
  if (phoneKey) {
    clauses.push(sql`${storedPhoneKey} = ${phoneKey}`);
  }
  const emailKey = emailMatchKey(email);
  if (emailKey) {
    clauses.push(sql`lower(trim(${leads.contactEmail})) = ${emailKey}`);
  }
  if (clauses.length === 0) return null;
  return or(...clauses)!;
}

export interface ContactMatch {
  id: string;
  sourceChannel: string | null;
  status: string;
  touchpoints: number;
  intentScore: number;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
}

/**
 * The existing lead for this contact within `leadType`, or null.
 *
 * Oldest first: the first row we created for someone is the one every prior
 * event is already attached to, so it is the natural survivor.
 */
export async function findContactDuplicate(opts: {
  phone: string | null;
  email: string | null;
  leadType: LeadType;
}): Promise<ContactMatch | null> {
  const clause = contactClauses(opts.phone, opts.email);
  if (!clause) return null;

  const [row] = await db
    .select({
      id: leads.id,
      sourceChannel: leads.sourceChannel,
      status: leads.status,
      touchpoints: leads.touchpoints,
      intentScore: leads.intentScore,
      contactEmail: leads.contactEmail,
      contactPhone: leads.contactPhone,
      notes: leads.notes,
    })
    .from(leads)
    .where(and(eq(leads.leadType, opts.leadType), ne(leads.status, MERGED_STATUS), clause))
    .orderBy(leads.createdAt)
    .limit(1);

  return row ?? null;
}

/** True when a lead already exists for this contact. Ryan's original guard. */
export async function isContactDuplicate(opts: {
  phone: string | null;
  email: string | null;
  leadType: LeadType;
}): Promise<boolean> {
  return (await findContactDuplicate(opts)) !== null;
}

/**
 * Every lead row belonging to the same person as `leadId`, including itself.
 *
 * This is what makes the per-entity dedupe in ./dedupe see across duplicate
 * rows. Without it each row runs its own independent drip: one production
 * contact has 4 rows and 7 recruitment touch events, and because wasEverSmsed
 * is per-row, each row also believed it was sending its first SMS — which is
 * what carries the CASL s.6(6) one-message limit for published contacts.
 *
 * Falls back to [leadId] on any failure: a dedupe that cannot resolve siblings
 * must degrade to the old per-row behaviour, never to "no dedupe at all".
 */
export async function findSiblingLeadIds(leadId: string): Promise<string[]> {
  try {
    const [self] = await db
      .select({
        id: leads.id,
        leadType: leads.leadType,
        contactPhone: leads.contactPhone,
        contactEmail: leads.contactEmail,
      })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!self) return [leadId];

    const clause = contactClauses(self.contactPhone, self.contactEmail);
    if (!clause) return [leadId];

    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.leadType, self.leadType),
          ne(leads.status, MERGED_STATUS),
          or(isNotNull(leads.contactPhone), isNotNull(leads.contactEmail))!,
          clause,
        ),
      );

    const ids = rows.map((r) => r.id);
    return ids.includes(leadId) ? ids : [leadId, ...ids];
  } catch {
    return [leadId];
  }
}

/** Sibling rows other than `leadId` — what a merge marks or deletes. */
export async function findSiblingsToMerge(leadId: string): Promise<string[]> {
  const ids = await findSiblingLeadIds(leadId);
  return ids.filter((id) => id !== leadId);
}

/** Re-exported so callers don't also have to import from notifications. */
export { normalizeToE164 };
