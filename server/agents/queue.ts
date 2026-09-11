/**
 * Agent queue factory.
 *
 * Wraps BullMQ's `Queue` with defaults suitable for autonomous agents:
 *   - 3 attempts, exponential backoff (5s → 25s → 125s)
 *   - Keep last 100 completed jobs / last 500 failed jobs (audit trail)
 *
 * Returns `null` when REDIS_URL is unset — callers should fall back to
 * synchronous in-process execution during local dev, matching the vision
 * queue pattern (`server/vision-queue.ts`).
 */

import { Queue, type QueueOptions } from 'bullmq';
import { getRedisConnection, QUEUE_NAMES } from '../queue';
import { logger } from '../logger';

const _queues = new Map<string, Queue>();

export function createAgentQueue(name: string, opts: Partial<QueueOptions> = {}): Queue | null {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn({ queue: name }, 'createAgentQueue: REDIS_URL unset — queue not created');
    return null;
  }

  const cached = _queues.get(name);
  if (cached) return cached;

  const queue = new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
    ...opts,
  });

  _queues.set(name, queue);
  logger.info({ queue: name }, 'Agent queue created');
  return queue;
}

/**
 * Convenience: pre-create all agent queues. Safe to call at boot;
 * subsequent calls return the cached instances.
 */
export function initAgentQueues(): void {
  const agentNames = [
    QUEUE_NAMES.CLOSER_D,
    QUEUE_NAMES.APEX,
    QUEUE_NAMES.HUNTER_S,
    QUEUE_NAMES.HUNTER_D,
    QUEUE_NAMES.VETTER,
    QUEUE_NAMES.RETAIN,
    QUEUE_NAMES.DISPATCH,
    QUEUE_NAMES.PULSE,
    QUEUE_NAMES.VOICE_AGENT,
    QUEUE_NAMES.MAGNET,
    QUEUE_NAMES.COMPLIANCE,
    QUEUE_NAMES.ONBOARD,
  ];
  for (const name of agentNames) createAgentQueue(name);
}

export { QUEUE_NAMES };
