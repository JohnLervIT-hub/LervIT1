/**
 * Schedule the touch 2/3/4 follow-ups and the Nova cold call for leads whose
 * touch 1 landed but whose scheduling never ran.
 *
 * onboardCandidate normally queues all four in one go. The leads this targets
 * were kicked with `kick-stranded-leads.ts --direct`, which deliberately drops
 * REDIS_URL so the run can't hang — the SMS goes out, and the follow-ups are
 * skipped with a warning. This script books the rest.
 *
 * REQUIRES REDIS. Unlike --direct in kick-stranded-leads, there is no
 * laptop-friendly mode here: enqueueing on the vetter and voice-agent queues
 * is the entire job, so with no reachable Redis there is nothing to do. Since
 * getRedisConnection sets maxRetriesPerRequest to null (BullMQ requires it),
 * an unreachable host makes queue.add wait forever rather than throw, so this
 * pings first and aborts rather than hanging.
 *
 * REDIS_URL is redis.railway.internal, which only resolves inside Railway's
 * private network. Run it there -- but NOT with tsx: the runtime image is
 * built with `npm ci --omit=dev` (no tsx) and never copies server/, so
 * `npx tsx scripts/schedule-followups.ts` cannot resolve ../server/db there.
 * `npm run build:scripts` esbuild-bundles this file into dist/scripts, which
 * inlines server/ and shared/ and leaves only prod deps external:
 *
 *   railway ssh "node dist/scripts/schedule-followups.js"                  # dry-run
 *   railway ssh "node dist/scripts/schedule-followups.js --execute"
 *   railway ssh "node dist/scripts/schedule-followups.js --execute --leadIds a,b,c"
 *
 * The dry-run reads only Postgres, so it also works from a laptop under
 * `railway run tsx scripts/schedule-followups.ts`, where tsx and server/ exist.
 */
import { and, eq, inArray, notExists, sql } from 'drizzle-orm';
import { db } from '../server/db';
import { businessEvents, leads } from '../shared/schema';
import { createAgentQueue } from '../server/agents/queue';
import { QUEUE_NAMES, getRedisConnection } from '../server/queue';
import { TOUCH_DELAY_MS } from '../server/agents/jordan';

const NOVA_DELAY_MS = 24 * 60 * 60 * 1000;
const PING_TIMEOUT_MS = 5000;

/** Mirrors the guard in Jordan's private scheduleNovaColdCallFollowUp. */
function isMoverCandidate(lead: { utmCampaign: string | null; sourceChannel: string | null }) {
  return (
    lead.utmCampaign === 'ryan-brooks' ||
    lead.sourceChannel === 'kijiji_services' ||
    lead.sourceChannel === 'kijiji_jobs'
  );
}

/** Fail fast instead of letting BullMQ's infinite retry swallow the run. */
async function assertRedisReachable(): Promise<boolean> {
  const conn = getRedisConnection();
  if (!conn) {
    console.error('REDIS_URL is unset — nothing can be enqueued.');
    return false;
  }
  try {
    await Promise.race([
      conn.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`no response in ${PING_TIMEOUT_MS}ms`)), PING_TIMEOUT_MS),
      ),
    ]);
    return true;
  } catch (err) {
    console.error(`\nRedis unreachable (${err instanceof Error ? err.message : err}).`);
    console.error('REDIS_URL points at Railway\'s private network — run this via `railway ssh`,');
    console.error('not `railway run`. Nothing was enqueued.');
    return false;
  }
}

function parseLeadIds(): string[] | null {
  const idx = process.argv.indexOf('--leadIds');
  if (idx === -1) return null;
  const raw = process.argv[idx + 1];
  if (!raw || raw.startsWith('--')) {
    console.error('--leadIds needs a comma-separated list of ids.');
    process.exit(1);
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const execute = process.argv.includes('--execute');
  const leadIds = parseLeadIds();

  const baseCols = {
    id: leads.id,
    contactName: leads.contactName,
    contactPhone: leads.contactPhone,
    sourceChannel: leads.sourceChannel,
    utmCampaign: leads.utmCampaign,
    touchpoints: leads.touchpoints,
  };

  // Explicit ids are taken at face value — they name leads whose touch 1 is
  // known to have landed. The default query has to infer that instead.
  const targets = leadIds
    ? await db.select(baseCols).from(leads).where(inArray(leads.id, leadIds))
    : await db
        .select(baseCols)
        .from(leads)
        .where(
          and(
            eq(leads.status, 'contacted'),
            eq(leads.touchpoints, 1),
            eq(leads.assignedAgent, 'jordan-hayes'),
            notExists(
              db
                .select({ id: businessEvents.id })
                .from(businessEvents)
                .where(
                  and(
                    eq(businessEvents.entityId, leads.id),
                    sql`${businessEvents.payload}->>'touchNumber' = '2'`,
                  ),
                ),
            ),
          ),
        );

  if (leadIds) {
    const found = new Set(targets.map((t) => t.id));
    for (const id of leadIds) {
      if (!found.has(id)) console.warn(`  WARNING: lead ${id} not found — skipping`);
    }
  }

  if (targets.length === 0) {
    console.log('No leads need follow-ups scheduled.');
    return;
  }

  console.log(`${targets.length} lead(s) to schedule:\n`);
  for (const lead of targets) {
    const nova = isMoverCandidate(lead) ? 'yes' : 'no (not a mover candidate)';
    console.log(
      `  ${lead.id}  ${lead.contactName ?? '(no name)'}  touches 2,3,4 at +24/+48/+72h  nova=${nova}`,
    );
  }

  if (!execute) {
    console.log('\nDry run — re-run with --execute to enqueue.');
    return;
  }

  if (!(await assertRedisReachable())) {
    process.exitCode = 1;
    return;
  }

  const vetterQueue = createAgentQueue(QUEUE_NAMES.VETTER);
  const voiceQueue = createAgentQueue(QUEUE_NAMES.VOICE_AGENT);
  if (!vetterQueue) {
    console.error('Vetter queue unavailable — nothing enqueued.');
    process.exitCode = 1;
    return;
  }

  console.log('');
  let touches = 0;
  let novaCalls = 0;

  for (const lead of targets) {
    const label = `${lead.id}  ${lead.contactName ?? '(no name)'}`;
    for (const touchNumber of [2, 3, 4] as const) {
      try {
        await vetterQueue.add(
          'send_touch',
          { leadId: lead.id, touchNumber },
          {
            delay: TOUCH_DELAY_MS[touchNumber],
            // Not in onboardCandidate, but this script can be re-run and a
            // duplicate touch is a duplicate text.
            jobId: `jordan_touch${touchNumber}_${lead.id}`,
          },
        );
        touches++;
        console.log(`  queued touch ${touchNumber}  ${label}`);
      } catch (err) {
        console.error(`  FAILED touch ${touchNumber}  ${label}:`, err instanceof Error ? err.message : err);
      }
    }

    // Same shape as Jordan's private scheduleNovaColdCallFollowUp, including
    // the jobId that makes a repeat schedule a no-op.
    if (!isMoverCandidate(lead) || !lead.contactPhone) continue;
    if (!voiceQueue) {
      console.warn(`  voice-agent queue unavailable — no Nova call for ${label}`);
      continue;
    }
    try {
      await voiceQueue.add(
        'call_mover_cold',
        {
          leadId: lead.id,
          phone: lead.contactPhone,
          name: lead.contactName,
          sourceChannel: lead.sourceChannel,
        },
        { delay: NOVA_DELAY_MS, jobId: `nova_cold_${lead.id}` },
      );
      novaCalls++;
      console.log(`  queued nova cold call  ${label}`);
    } catch (err) {
      console.error(`  FAILED nova  ${label}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nQueued ${touches} touch(es) and ${novaCalls} Nova cold call(s).`);
  await vetterQueue.close();
  await voiceQueue?.close();
  getRedisConnection()?.disconnect();
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
