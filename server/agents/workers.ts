/**
 * BullMQ workers for autonomous agents.
 *
 * Each worker pulls jobs from its named queue (matching QUEUE_NAMES) and
 * dispatches them through the agent's `run(action, input)` method — which
 * gives us the BaseAgent guarantees (agent_logs row, business_events
 * emit, timing).
 *
 * Skips silently when Redis is unavailable. Skips when
 * DISABLE_AGENT_WORKERS=1 (matches DISABLE_BACKGROUND_JOBS convention).
 */

import { Worker, type Job } from 'bullmq';
import { getRedisConnection, QUEUE_NAMES } from '../queue';
import { createAgentQueue } from './queue';
import { logger } from '../logger';
import { alex } from './alex';
import { scout } from './scout';
import { ryan } from './ryan';
import { jordan } from './jordan';
import { victor } from './victor';
import { mark } from './mark';
import { riley } from './riley';
import { kai } from './kai';
import { sam } from './sam';
import { aegis } from './aegis';
import { nova } from './nova';
import { ember } from './ember';
import { reid } from './reid';
import type { BaseAgent } from './base';

let workersStarted = false;

export function startAgentWorkers(): void {
  if (workersStarted) {
    logger.warn('startAgentWorkers: already initialized in this process');
    return;
  }
  if (process.env.DISABLE_AGENT_WORKERS === '1') {
    logger.info('startAgentWorkers: disabled via DISABLE_AGENT_WORKERS=1');
    return;
  }

  const connection = getRedisConnection();
  if (!connection) {
    logger.warn('startAgentWorkers: REDIS_URL unset — agent workers not started');
    return;
  }
  workersStarted = true;

  spawnWorker(QUEUE_NAMES.CLOSER_D, alex, 3);
  spawnWorker(QUEUE_NAMES.HUNTER_D, scout, 1);
  spawnWorker(QUEUE_NAMES.HUNTER_S, ryan, 1);
  spawnWorker(QUEUE_NAMES.VETTER, jordan, 3);
  spawnWorker(QUEUE_NAMES.DISPATCH, victor, 3);
  spawnWorker(QUEUE_NAMES.PULSE, mark, 1);
  spawnWorker(QUEUE_NAMES.ONBOARD, riley, 3);
  spawnWorker(QUEUE_NAMES.RETAIN, kai, 3);
  spawnWorker(QUEUE_NAMES.SALES, sam, 3);
  spawnWorker(QUEUE_NAMES.COMPLIANCE, aegis, 2);
  spawnWorker(QUEUE_NAMES.VOICE_AGENT, nova, 5);
  spawnWorker(QUEUE_NAMES.MAGNET, ember, 2);
  spawnWorker(QUEUE_NAMES.DOCOPS, reid, 3);

  logger.info(
    'Agent workers started: Alex Morgan (closer-d), Scout Reid (hunter-d), Ryan Brooks (hunter-s), Jordan Hayes (vetter), Victor Nash (dispatch), Mark Shaw (pulse), Riley Morgan (onboard), Kai Bennett (retain), Sam Carter (sales), Aegis Ford (compliance), Nova Clarke (voice), Ember Lane (magnet), Reid Calloway (docops)',
  );

  scheduleHunterSweeps();
}

/**
 * Self-scheduling hunter sweeps.
 *
 * Scout and Ryan also run `process_signals` once a day at 07:00 Calgary from
 * `initBackgroundJobs` (in-process, node-cron). These queue-backed sweeps add
 * the intra-day cadence and a startup run, so signals already sitting in the
 * DB get processed on deploy instead of waiting for the next 07:00.
 */
const HUNTER_SWEEPS = [
  {
    label: 'Scout Reid',
    queueName: QUEUE_NAMES.HUNTER_D,
    jobId: 'scout-scheduled-sweep',
    everyMs: 6 * 60 * 60 * 1000,
  },
  {
    label: 'Ryan Brooks',
    queueName: QUEUE_NAMES.HUNTER_S,
    jobId: 'ryan-scheduled-sweep',
    everyMs: 4 * 60 * 60 * 1000,
  },
] as const;

// Long enough for the workers above to attach before the first job lands.
const SWEEP_STARTUP_DELAY_MS = 30_000;

type HunterSweep = (typeof HUNTER_SWEEPS)[number];

function scheduleHunterSweeps(): void {
  for (const sweep of HUNTER_SWEEPS) {
    setTimeout(() => void enqueueHunterSweep(sweep), SWEEP_STARTUP_DELAY_MS);
    setInterval(() => void enqueueHunterSweep(sweep), sweep.everyMs);
    logger.info(
      { queue: sweep.queueName, everyMs: sweep.everyMs },
      `${sweep.label} scheduled sweep armed`,
    );
  }
}

async function enqueueHunterSweep(sweep: HunterSweep): Promise<void> {
  try {
    const queue = createAgentQueue(sweep.queueName);
    if (!queue) return; // No Redis — nothing to enqueue onto.

    // Fixed jobId is the dedup key: BullMQ silently ignores add() while a job
    // with that ID still exists, so a redeploy can't stack sweeps. That cuts
    // both ways — a job left behind in the failed set would make every later
    // add() a permanent no-op, so this clears on failure as well as success
    // (the queue default keeps the last 500 failures for the audit trail).
    const job = await queue.add(
      'process_signals',
      {},
      { jobId: sweep.jobId, removeOnComplete: true, removeOnFail: true },
    );
    logger.info(
      { queue: sweep.queueName, jobId: job.id },
      `${sweep.label} scheduled sweep enqueued`,
    );
  } catch (err) {
    logger.error(
      { queue: sweep.queueName, err },
      `${sweep.label} scheduled sweep enqueue failed`,
    );
  }
}

function spawnWorker(queueName: string, agent: BaseAgent, concurrency: number): Worker {
  const connection = getRedisConnection();
  if (!connection) throw new Error('spawnWorker called without Redis');

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      // Extract dry-run from job payload if present — set at enqueue time by
      // trigger endpoints that pass dry_run through.
      const data = (job.data ?? {}) as Record<string, any> & { _dryRun?: boolean };
      const { _dryRun, ...input } = data;
      return agent.run(job.name, input, { dryRun: _dryRun === true });
    },
    { connection, concurrency },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { queue: queueName, jobId: job?.id, jobName: job?.name, err },
      'Agent worker job failed',
    );
  });
  worker.on('error', err => {
    logger.error({ queue: queueName, err }, 'Agent worker errored');
  });

  return worker;
}
