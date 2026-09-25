/**
 * One-time backfill: re-kick the phone-only mover candidates that were claimed
 * by an agent and then never touched. Two cohorts, one shape.
 *
 * 1. Kijiji (`kijiji_services`, assignedAgent='jordan-hayes'). Before `d164c1e`
 *    ("Text phone-only mover candidates on touch 1") Jordan's onboardCandidate
 *    had no SMS fallback, so a lead with a phone and no email returned 'no
 *    reachable channel' and emitted nothing. Ryan had already stamped
 *    assignedAgent='jordan-hayes'.
 *
 * 2. Google Places sole operators (`sam_places_cargo_van`,
 *    `sam_places_delivery_driver`, `sam_places_man_with_truck`,
 *    assignedAgent='Sam Carter'). Before `cb5329f` these went to Sam's B2B
 *    cadence, which is email-only, and a Places lead never has an email — so
 *    send_b2b_touch could only skip. cb5329f routes NEW ones to Jordan; the
 *    ones already in the table stay untouched, because Sam only enqueues at
 *    insert time.
 *
 * Both cohorts are invisible to the normal sweep: Ryan's routable query
 * requires `assignedAgent IS NULL` and neither cohort has it.
 *
 * Identified by the absence of ANY business_event: a lead Jordan actually
 * worked always leaves a mover_contacted / mover_touched row behind.
 *
 * Places leads carry no contactName — the operator's name is in companyName —
 * so both columns are printed.
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
 *
 * Inside the container the tsx invocations above do NOT work -- the runtime
 * image has no tsx (`npm ci --omit=dev`) and no server/ directory. Use the
 * esbuild bundle that `npm run build:scripts` emits into dist/scripts:
 *
 *   railway ssh "node dist/scripts/kick-stranded-leads.js --execute"
 */
import { and, eq, inArray, isNotNull, notExists } from 'drizzle-orm';
import { db } from '../server/db';
import { businessEvents, leads } from '../shared/schema';
import { createAgentQueue } from '../server/agents/queue';
import { QUEUE_NAMES } from '../server/queue';

/**
 * Channels this backfill covers. `kijiji_services` is the original phone-only
 * Kijiji cohort; the three `sam_places_*` entries are the Google Places
 * sole-operator queries that `cb5329f` re-routed from Sam's email cadence to
 * Jordan. Listed explicitly rather than imported from PUBLISHED_CONTACT_SOURCES
 * in server/lib/smsConsent.ts: that list is the CASL s.6(6) allowlist and will
 * grow, and a one-time backfill must not silently widen with it.
 */
const STRANDED_CHANNELS = [
  'kijiji_services',
  'sam_places_cargo_van',
  'sam_places_delivery_driver',
  'sam_places_man_with_truck',
];

/**
 * Both stamps that can leave a lead claimed-but-untouched, and why matching
 * only 'jordan-hayes' misses the Places cohort: Ryan writes 'jordan-hayes'
 * when it routes a Kijiji lead, but Sam writes 'Sam Carter' on every Places
 * insert (sam.ts) and hands sole operators to the vetter queue WITHOUT
 * restamping. Either value plus a missing business_event means nobody worked
 * the lead; Ryan's routable sweep skips both, since it needs assignedAgent
 * IS NULL.
 */
const STRANDED_AGENTS = ['jordan-hayes', 'Sam Carter'];

/** Kijiji leads have a contactName; Places leads only ever have a companyName. */
function displayName(lead: { contactName: string | null; companyName: string | null }) {
  return lead.contactName ?? lead.companyName ?? '(no name)';
}

async function main() {
  const execute = process.argv.includes('--execute');
  const direct = process.argv.includes('--direct');

  const stranded = await db
    .select({
      id: leads.id,
      contactName: leads.contactName,
      companyName: leads.companyName,
      contactPhone: leads.contactPhone,
      sourceChannel: leads.sourceChannel,
      status: leads.status,
      touchpoints: leads.touchpoints,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(
      and(
        inArray(leads.sourceChannel, STRANDED_CHANNELS),
        inArray(leads.assignedAgent, STRANDED_AGENTS),
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
      `  ${lead.id}  ${displayName(lead)}  ${lead.contactPhone}  ` +
        `source=${lead.sourceChannel} status=${lead.status} ` +
        `touchpoints=${lead.touchpoints} created=${lead.createdAt?.toISOString()}`,
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
      const label = `${lead.id}  ${displayName(lead)}`;
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
      console.log(`  kicked ${lead.id}  ${displayName(lead)}`);
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
