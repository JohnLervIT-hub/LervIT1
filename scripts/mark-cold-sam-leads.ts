/**
 * One-time cleanup: mark sam_places delivery_driver and cargo_van leads as cold.
 *
 * These channels query Google Places for courier/van businesses. The phone
 * numbers returned are business landlines, not personal mobiles — Telnyx error
 * 40021 ("destination not mobile") confirmed on every send attempt 2026-09-25.
 *
 * delivery_driver and cargo_van have been removed from SOLE_OPERATOR_CHANNELS
 * (sam.ts) and PUBLISHED_CONTACT_SOURCES (smsConsent.ts). This script
 * terminally marks the existing leads so they don't accumulate in dashboards.
 *
 * Dry-run by default. Pass --execute to apply changes.
 *
 * Usage (local, needs DATABASE_URL):
 *   npx tsx scripts/mark-cold-sam-leads.ts [--execute]
 *
 * Usage (Railway):
 *   railway run node dist/scripts/mark-cold-sam-leads.js [--execute]
 */

import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../server/db';
import { businessEvents, leads } from '../shared/schema';
import { emitEvent } from '../server/events';

const DRY_RUN = !process.argv.includes('--execute');
const CHANNELS = ['sam_places_delivery_driver', 'sam_places_cargo_van'] as const;

async function main() {
  console.log(`\n=== mark-cold-sam-leads [${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}] ===\n`);

  const targets = await db
    .select({
      id: leads.id,
      contactName: leads.contactName,
      companyName: leads.companyName,
      contactPhone: leads.contactPhone,
      sourceChannel: leads.sourceChannel,
      status: leads.status,
    })
    .from(leads)
    .where(
      sql`${leads.sourceChannel} = ANY(ARRAY[${sql.join(CHANNELS.map(c => sql`${c}`), sql`, `)}]) AND ${leads.status} != 'cold'`,
    );

  if (targets.length === 0) {
    console.log('No leads to update — all already cold or none found.');
    return;
  }

  console.log(`Found ${targets.length} lead(s):\n`);
  for (const lead of targets) {
    const label = lead.companyName ?? lead.contactName ?? '(unnamed)';
    console.log(`  ${lead.id}  ${label}  [${lead.sourceChannel}]  status=${lead.status}  phone=${lead.contactPhone ?? 'none'}`);
  }

  if (DRY_RUN) {
    console.log('\nDry run — no changes made. Pass --execute to apply.');
    return;
  }

  console.log('\nApplying changes…');
  let updated = 0;
  for (const lead of targets) {
    const label = lead.companyName ?? lead.contactName ?? '(unnamed)';
    try {
      await db
        .update(leads)
        .set({
          status: 'cold',
          notes: sql`COALESCE(${leads.notes}, '') || ${'\n[auto 2026-09-25] corporate landline — Telnyx 40021 on all send attempts; channel removed from SOLE_OPERATOR_CHANNELS'}`,
        })
        .where(eq(leads.id, lead.id));

      await emitEvent('lead.disqualified', 'lead', lead.id, {
        reason: 'corporate_landline',
        channel: lead.sourceChannel,
        note: 'Telnyx 40021 — destination not mobile; business landline confirmed',
      });

      console.log(`  ✓ ${label} → cold`);
      updated++;
    } catch (err) {
      console.error(`  ✗ ${label}:`, err);
    }
  }

  console.log(`\nDone: ${updated}/${targets.length} leads marked cold.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
