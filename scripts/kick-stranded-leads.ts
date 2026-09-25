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
 *   tsx scripts/kick-stranded-leads.ts                      # dry-run (SELECT only)
 *   tsx scripts/kick-stranded-leads.ts --execute            # enqueue on the vetter queue
 *   tsx scripts/kick-stranded-leads.ts --execute --direct   # run Jordan in-process
 *
 * --direct skips BullMQ and calls jordan.run() here, the same way the
 * agentEventBus fallback does when REDIS_URL is unset. Use it from a laptop:
 * REDIS_URL points at redis.railway.internal, which only resolves inside
 * Railway's private network, so the queue path needs `railway ssh` while the
 * direct path works under `railway run`.
 */
import { and, eq, isNotNull, notExists } from 'drizzle-orm';
import { db } from '../server/db';
import { businessEvents, leads } from '../shared/schema';
import { createAgentQueue } from '../server/agents/queue';
import { QUEUE_NAMES } from '../server/queue';

async function main() {
  const execute = process.argv.includes('--execute');
  const direct = process.argv.includes('--direct');

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
        // Stranded means never touched. Without this a lead whose send
        // succeeded but whose event write didn't land still matches the
        // NOT EXISTS below, and re-running texts them a second time — which
        // the s.6(6) exemption does not allow.
        eq(leads.status, 'new'),
        eq(leads.touchpoints, 0),
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
    console.log('\nDry run — re-run with --execute to kick these leads.');
    console.log('Add --direct to run Jordan in-process instead of enqueueing.');
    return;
  }

  if (direct) {
    // onboardCandidate schedules touches 2-4 and Nova's cold call on BullMQ
    // after a successful send. getRedisConnection sets maxRetriesPerRequest
    // to null because BullMQ requires it, so queue.add against an unreachable
    // host never rejects — it just waits, and the run hangs mid-lead with the
    // SMS already sent and no event written. Drop REDIS_URL so both call
    // sites take their documented "queue unavailable" branch instead.
    if (process.env.REDIS_URL) {
      delete process.env.REDIS_URL;
      console.log(
        '\n--direct: REDIS_URL unset for this process. Touches 2-4 and the Nova\n' +
          'cold call will NOT be scheduled — run from inside Railway for those.',
      );
    }

    // Imported here, not at module scope: jordan.ts constructs an Anthropic
    // client at load time, so a plain dry-run shouldn't need the API key.
    const { jordan } = await import('../server/agents/jordan');

    console.log('\nRunning Jordan in-process (--direct):\n');
    let succeeded = 0;
    for (const lead of stranded) {
      const label = `${lead.id}  ${lead.contactName ?? '(no name)'}`;
      try {
        const out = await jordan.run('onboard_candidate', { leadId: lead.id }, { dryRun: false });
        if (out?.skipped) {
          console.log(`  SKIPPED  ${label} — ${out.reason}`);
        } else {
          succeeded++;
          console.log(
            `  SENT     ${label} — channel=${out?.channel} ` +
              `smsSentTouch1=${out?.smsSentTouch1} emailSent=${out?.emailSent}`,
          );
        }
      } catch (err) {
        console.error(`  ERROR    ${label}:`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`\nDelivered ${succeeded}/${stranded.length}.`);
    return;
  }

  const queue = createAgentQueue(QUEUE_NAMES.VETTER);
  if (!queue) {
    console.error('\nVETTER queue unavailable (REDIS_URL unset) — nothing enqueued.');
    console.error('Re-run with --direct to run Jordan in-process instead.');
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
