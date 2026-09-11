/**
 * Delete the four established moving-company competitors Sam created before
 * the review-count guardrail was in place (>1,000 Google reviews each).
 *
 *   Two Small Men, Best Moves, Rocky Mountain Movers, Calgary Movers Pro
 *
 * Scoped by source_channel='sam_places_moving_co' + companyName match so we
 * cannot accidentally hit an unrelated lead that happens to share a name.
 *
 * Run:
 *   tsx scripts/cleanup-sam-wrong-leads.ts             # dry-run (SELECT only)
 *   tsx scripts/cleanup-sam-wrong-leads.ts --execute   # actually delete
 */
import { db } from '../server/db';
import { leads } from '../shared/schema';
import { and, eq, inArray } from 'drizzle-orm';

const TARGET_NAMES = [
  'Two Small Men',
  'Best Moves',
  'Rocky Mountain Movers',
  'Calgary Movers Pro',
];

async function main() {
  const execute = process.argv.includes('--execute');

  const matches = await db
    .select({
      id: leads.id,
      companyName: leads.companyName,
      sourceChannel: leads.sourceChannel,
      contactPhone: leads.contactPhone,
      dealStage: leads.dealStage,
      status: leads.status,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(
      and(
        eq(leads.sourceChannel, 'sam_places_moving_co'),
        inArray(leads.companyName, TARGET_NAMES),
      ),
    );

  console.log(`Matched ${matches.length} lead(s):`);
  for (const m of matches) {
    console.log(`  - ${m.companyName} [${m.id}] stage=${m.dealStage} status=${m.status}`);
  }

  if (!execute) {
    console.log('\nDry-run only. Re-run with --execute to delete.');
    process.exit(0);
  }

  const deleted = await db
    .delete(leads)
    .where(
      and(
        eq(leads.sourceChannel, 'sam_places_moving_co'),
        inArray(leads.companyName, TARGET_NAMES),
      ),
    )
    .returning({ id: leads.id, companyName: leads.companyName });

  console.log(`\nDeleted ${deleted.length} lead(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
