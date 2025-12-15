/**
 * Vision Engine Background Queue
 * 
 * Processes photo analysis asynchronously to prevent blocking API requests.
 * Photos are queued and processed in the background while the user gets
 * immediate feedback that their upload was received.
 */

import { identifyItemV2, VisionEngineResult } from "./vision-engine-v2";
import { storage } from "./storage";
import { logEvent } from "./logger";

interface QueuedItem {
  identifiedItemId: string;
  bookingId: string;
  photoUrl: string;
  retries: number;
  addedAt: Date;
}

class VisionQueue {
  private queue: QueuedItem[] = [];
  private processing = false;
  private maxRetries = 2;
  private processingDelay = 100; // ms between items

  /**
   * Add a photo to the processing queue
   * Returns immediately so the API can respond quickly
   */
  async enqueue(identifiedItemId: string, bookingId: string, photoUrl: string): Promise<void> {
    this.queue.push({
      identifiedItemId,
      bookingId,
      photoUrl,
      retries: 0,
      addedAt: new Date(),
    });

    logEvent.vision("queue_enqueue", {
      identifiedItemId,
      bookingId,
      queueLength: this.queue.length,
    });

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process items in the queue one at a time
   * This runs in the background without blocking the main thread
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      
      try {
        // Update status to processing
        await storage.updateIdentifiedItem(item.identifiedItemId, {
          processingStatus: "processing",
        });

        logEvent.vision("processing_start", {
          identifiedItemId: item.identifiedItemId,
          photoUrl: item.photoUrl,
        });

        const startTime = Date.now();

        // Run the Vision Engine analysis
        const result = await identifyItemV2(item.photoUrl);

        const processingTime = Date.now() - startTime;

        // Update the identified item with results
        await storage.updateIdentifiedItem(item.identifiedItemId, {
          processingStatus: "completed",
          itemName: result.itemName,
          category: result.category,
          weightKg: result.weight_kg.toString(),
          dimensionsLcm: result.dimensions.length_cm.toString(),
          dimensionsWcm: result.dimensions.width_cm.toString(),
          dimensionsHcm: result.dimensions.height_cm.toString(),
          volumeCuft: result.volume_ft3.toString(),
          handlingComplexity: result.handling_complexity,
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

        logEvent.vision("processing_complete", {
          identifiedItemId: item.identifiedItemId,
          itemName: result.itemName,
          confidence: result.confidence,
          processingTime,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        
        logEvent.vision("processing_error", {
          identifiedItemId: item.identifiedItemId,
          error: errorMessage,
          retries: item.retries,
        });

        if (item.retries < this.maxRetries) {
          // Retry later
          item.retries++;
          this.queue.push(item);
        } else {
          // Max retries reached, mark as failed
          await storage.updateIdentifiedItem(item.identifiedItemId, {
            processingStatus: "failed",
            errorMessage: errorMessage,
          });
        }
      }

      // Small delay between processing items to prevent CPU spikes
      await new Promise(resolve => setTimeout(resolve, this.processingDelay));
    }

    this.processing = false;
  }

  /**
   * Get the current queue status
   */
  getStatus(): { queueLength: number; processing: boolean } {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
    };
  }
}

// Singleton instance
export const visionQueue = new VisionQueue();
