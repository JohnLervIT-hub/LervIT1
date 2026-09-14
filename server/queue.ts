/**
 * BullMQ / Redis queue infrastructure.
 *
 * When REDIS_URL is set, all queues are backed by Redis (durable, survives restarts).
 * When REDIS_URL is absent (local dev without Redis), callers fall back to in-memory
 * processing and a warning is logged at startup.
 */

import IORedis from 'ioredis';
import { logger } from './logger';

export const QUEUE_NAMES = {
  VISION: 'vision-analysis',
  // Autonomous agent queues
  CLOSER_D: 'closer-d',
  APEX: 'apex',
  HUNTER_S: 'hunter-s',
  HUNTER_D: 'hunter-d',
  VETTER: 'vetter',
  RETAIN: 'retain',
  DISPATCH: 'dispatch',
  PULSE: 'pulse',
  VOICE_AGENT: 'voice-agent',
  MAGNET: 'magnet',
  COMPLIANCE: 'compliance',
  ONBOARD: 'onboard',
  SALES: 'sales',
  DOCOPS: 'docops',
} as const;

let _connection: IORedis | null = null;

export function getRedisConnection(): IORedis | null {
  if (!process.env.REDIS_URL) return null;

  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
    _connection.on('error', (err: Error) =>
      logger.error({ err }, 'Redis connection error'),
    );
    _connection.on('connect', () => logger.info('Redis connected'));
  }

  return _connection;
}
