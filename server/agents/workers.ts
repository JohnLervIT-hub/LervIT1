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

  logger.info(
    'Agent workers started: Alex Morgan (closer-d), Scout Reid (hunter-d), Ryan Brooks (hunter-s), Jordan Hayes (vetter), Victor Nash (dispatch), Mark Shaw (pulse), Riley Morgan (onboard), Kai Bennett (retain), Sam Carter (sales), Aegis Ford (compliance)',
  );
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
