/**
 * One-time backfill: re-kick the phone-only Kijiji mover candidates that Ryan
 * routed to Jordan but Jordan never touched.
 *
 * Before `d164c1e` ("Text phone-only mover candidates on touch 1") Jordan's
 * onboardCandidate had no SMS fallback, so a lead with a phone and no email
 * returned 'no reachable channel' and emitted nothing. Ryan had already
 * stamped assignedAgent='jordan-hayes', and Ryan's routable query requires
 * `assignedAgent IS NULL` — so those leads can never be re-routed by the
 * normal sweep. They are invisible to both agents.
 *
 * Identified by the absence of ANY business_event: a lead Jordan actually
 * worked always leaves a mover_contacted / mover_touched row behind.
 *
 * Enqueueing these sends real SMS to real people, so this is dry-run by
 * default — same convention as cleanup-sam-wrong-leads.ts.
 *
 * Run:
 *   tsx scripts/kick-stranded-leads.ts             # dry-run (SELECT only)
 *   tsx scripts/kick-stranded-leads.ts --execute   # actually enqueue
 */
import { and, eq, isNotNull, notExists } from 'drizzle-orm';
import { db } from '../server/db';
import { businessEvents, leads } from '../shared/schema';
import { createAgentQueue } from '../server/agents/queue';
import { QUEUE_NAMES } from '../server/queue';

async function main() {
  const execute = process.argv.includes('--execute');

  const stranded = await db
    .select({
      id: leads.id,
      contactName: leads.contactName,
      contactPhone: leads.contactPhone,
      status: leads.status,
      touchpoints: leads.touchpoints,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(
      and(
        eq(leads.sourceChannel, 'kijiji_services'),
        eq(leads.assignedAgent, 'jordan-hayes'),
        isNotNull(leads.contactPhone),
        notExists(
          db
            .select({ id: businessEvents.id })
            .from(businessEvents)
            .where(
              and(
                eq(businessEvents.entityId, leads.id),
                eq(businessEvents.entityType, 'lead'),
              ),
            ),
        ),
      ),
    );

  if (stranded.length === 0) {
    console.log('No stranded leads found — nothing to kick.');
    return;
  }

  console.log(`Found ${stranded.length} stranded lead(s):\n`);
  for (const lead of stranded) {
    console.log(
      `  ${lead.id}  ${lead.contactName ?? '(no name)'}  ${lead.contactPhone}  ` +
        `status=${lead.status} touchpoints=${lead.touchpoints} created=${lead.createdAt?.toISOString()}`,
    );
  }

  if (!execute) {
    console.log('\nDry run — re-run with --execute to enqueue onboard_candidate jobs.');
    return;
  }

  const queue = createAgentQueue(QUEUE_NAMES.VETTER);
  if (!queue) {
    console.error('\nVETTER queue unavailable (REDIS_URL unset) — nothing enqueued.');
    process.exitCode = 1;
    return;
  }

  console.log('');
  let kicked = 0;
  for (const lead of stranded) {
    try {
      await queue.add('onboard_candidate', { leadId: lead.id });
      kicked++;
      console.log(`  kicked ${lead.id}  ${lead.contactName ?? '(no name)'}`);
    } catch (err) {
      console.error(`  FAILED ${lead.id}:`, err);
    }
  }

  console.log(`\nEnqueued ${kicked}/${stranded.length} onboard_candidate job(s).`);
  await queue.close();
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
