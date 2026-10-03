/**
 * Vision Engine Background Queue
 *
 * When REDIS_URL is set: jobs are enqueued in BullMQ (Redis-backed, durable).
 * When REDIS_URL is absent: falls back to the original in-memory queue with a warning.
 *
 * Public API is identical in both modes: visionQueue.enqueue(id, bookingId, photoUrl)
 */

import { Queue, Worker } from 'bullmq';
import { getRedisConnection, QUEUE_NAMES } from './queue';
import { identifyItemV2 } from './vision-engine-v2';
import { storage } from './storage';
import { logEvent, logger } from './logger';

interface JobData {
  identifiedItemId: string;
  bookingId: string;
  photoUrl: string;
}

// ---------------------------------------------------------------------------
// Shared processing logic (used by both BullMQ worker and in-memory fallback)
// ---------------------------------------------------------------------------

async function processVisionJob(
  identifiedItemId: string,
  _bookingId: string,
  photoUrl: string,
): Promise<void> {
  await storage.updateIdentifiedItem(identifiedItemId, { processingStatus: 'processing' });
  logEvent.vision('processing_start', { identifiedItemId, photoUrl });

  const startTime = Date.now();
  const result = await identifyItemV2(photoUrl);
  const processingTime = Date.now() - startTime;

  await storage.updateIdentifiedItem(identifiedItemId, {
    processingStatus: 'completed',
    itemName: result.itemName,
    category: result.category,
    weightKg: result.weight_kg.toString(),
    dimensionsLcm: result.dimensions.length_cm.toString(),
    dimensionsWcm: result.dimensions.width_cm.toString(),
    dimensionsHcm: result.dimensions.height_cm.toString(),
    volumeCuft: result.volume_ft3.toString(),
    handlingComplexity: result.handling_complexity,
    premiumKey: result.premiumKey ?? null,
    vehicleType: result.vehicle,
    recommendedMovers: result.movers_required,
    insuranceLevel: result.insurance_level,
    confidence: result.confidence.toString(),
    sourceMetadata: JSON.stringify({
      source: result.source,
      matchedItem: result.matchedItem,
      corrections: result.corrections,
      processingTime: result.processingTime,
    }),
    errorMessage: null,
  });

  logEvent.vision('processing_complete', {
    identifiedItemId,
    itemName: result.itemName,
    confidence: result.confidence,
    processingTime,
  });
}

// ---------------------------------------------------------------------------
// BullMQ setup (only when REDIS_URL is configured)
// ---------------------------------------------------------------------------

const redisConn = getRedisConnection();

const bullQueue = redisConn
  ? new Queue<JobData>(QUEUE_NAMES.VISION, {
      connection: redisConn,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    })
  : null;

if (redisConn && bullQueue) {
  // Worker runs in the same process as the queue producer.
  // For production scale, move to server/worker.ts for process isolation.
  const worker = new Worker<JobData>(
    QUEUE_NAMES.VISION,
    async (job) => {
      const { identifiedItemId, bookingId, photoUrl } = job.data;
      await processVisionJob(identifiedItemId, bookingId, photoUrl);
    },
    { connection: redisConn, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Vision BullMQ job failed after all retries');
    if (job?.data.identifiedItemId) {
      storage
        .updateIdentifiedItem(job.data.identifiedItemId, {
          processingStatus: 'failed',
          errorMessage: err.message,
        })
        .catch(() => {});
    }
  });

  logger.info('Vision queue: BullMQ / Redis mode active');
} else {
  logger.warn(
    'REDIS_URL not set — vision queue running in-memory. Jobs will be lost on process restart.',
  );
}

// ---------------------------------------------------------------------------
// In-memory fallback (used when Redis is unavailable)
// ---------------------------------------------------------------------------

class InMemoryVisionQueue {
  private queue: Array<JobData & { retries: number }> = [];
  private processing = false;
  private readonly maxRetries = 2;

  async enqueue(identifiedItemId: string, bookingId: string, photoUrl: string): Promise<void> {
    this.queue.push({ identifiedItemId, bookingId, photoUrl, retries: 0 });
    logEvent.vision('queue_enqueue', { identifiedItemId, bookingId, queueLength: this.queue.length });
    if (!this.processing) this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        await processVisionJob(item.identifiedItemId, item.bookingId, item.photoUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logEvent.vision('processing_error', {
          identifiedItemId: item.identifiedItemId,
          error: msg,
          retries: item.retries,
        });
        if (item.retries < this.maxRetries) {
          item.retries++;
          this.queue.push(item);
        } else {
          await storage.updateIdentifiedItem(item.identifiedItemId, {
            processingStatus: 'failed',
            errorMessage: msg,
          });
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    this.processing = false;
  }

  getStatus(): { queueLength: number; processing: boolean } {
    return { queueLength: this.queue.length, processing: this.processing };
  }
}

// ---------------------------------------------------------------------------
// Public adapter — same API regardless of backend
// ---------------------------------------------------------------------------

class VisionQueueAdapter {
  private inMemory: InMemoryVisionQueue | null = bullQueue ? null : new InMemoryVisionQueue();

  async enqueue(identifiedItemId: string, bookingId: string, photoUrl: string): Promise<void> {
    if (bullQueue) {
      await bullQueue.add('identify', { identifiedItemId, bookingId, photoUrl });
      logEvent.vision('queue_enqueue', { identifiedItemId, bookingId, engine: 'bullmq' });
    } else {
      await this.inMemory!.enqueue(identifiedItemId, bookingId, photoUrl);
    }
  }

  getStatus(): { queueLength: number; processing: boolean } {
    return this.inMemory ? this.inMemory.getStatus() : { queueLength: 0, processing: false };
  }
}

export const visionQueue = new VisionQueueAdapter();
