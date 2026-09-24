/**
 * Higgsfield provider — Bytedance Seedance 2.0 text-to-video.
 *
 * Create:  POST https://api.higgsfield.ai/bytedance/seedance-2.0/text-to-video
 *          Response: { status, request_id, status_url }
 * Status:  GET  ${status_url}   (defaults to
 *          https://platform.higgsfield.ai/requests/${request_id}/status)
 * Auth:    Authorization: Key ${HIGGSFIELD_API_KEY}
 *
 * The SDK is configured at module load so future calls into
 * @higgsfield/client share credentials; the createVideo/getJobStatus
 * pair here submits async and returns immediately — pollers advance
 * the job separately.
 */

import { config } from '@higgsfield/client/v2';
import { logger } from '../logger';

config({
  credentials: process.env.HIGGSFIELD_API_KEY ?? '',
});

export interface HiggsfieldVideoInput {
  prompt: string;
  duration?: number;
  resolution?: '480p' | '720p' | '1080p' | '4k';
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  generateAudio?: boolean;
  platform?: string;
}

/**
 * Carries the HTTP status so a caller can tell a permanent rejection (4xx —
 * bad key, unknown request id, invalid input) from a transient one (5xx,
 * network). The poller fails the item on the former and retries the latter.
 */
export class HiggsfieldApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HiggsfieldApiError';
  }

  get permanent(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export interface HiggsfieldVideoResult {
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}

const statusUrlCache = new Map<string, string>();

export class HiggsfieldProvider {
  async createVideo(input: HiggsfieldVideoInput): Promise<{ jobId: string }> {
    const aspectRatio =
      input.platform === 'instagram'
        ? '9:16'
        : input.platform === 'facebook'
          ? '16:9'
          : (input.aspectRatio ?? '9:16');

    logger.info(
      {
        prompt: input.prompt.slice(0, 50),
        aspectRatio,
        duration: input.duration ?? 5,
        resolution: '720p',
      },
      '[Higgsfield] Submitting Seedance 2.0',
    );

    const response = await fetch(
      'https://api.higgsfield.ai/bytedance/seedance-2.0/text-to-video',
      {
        method: 'POST',
        headers: {
          Authorization: `Key ${process.env.HIGGSFIELD_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: input.prompt,
          duration: input.duration ?? 5,
          resolution: '720p',
          aspect_ratio: aspectRatio,
          generate_audio: true,
        }),
      },
    );

    const data: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new HiggsfieldApiError(
        `Higgsfield create failed: status=${response.status} ${JSON.stringify(data)}`,
        response.status,
      );
    }

    if (typeof data?.status_url === 'string') {
      statusUrlCache.set(data.request_id, data.status_url);
    }

    logger.info(
      { requestId: data.request_id, status: data.status },
      '[Higgsfield] Video queued',
    );

    return { jobId: data.request_id };
  }

  async getJobStatus(jobId: string): Promise<HiggsfieldVideoResult> {
    const statusUrl =
      statusUrlCache.get(jobId) ??
      `https://platform.higgsfield.ai/requests/${jobId}/status`;

    const response = await fetch(statusUrl, {
      headers: {
        Authorization: `Key ${process.env.HIGGSFIELD_API_KEY}`,
      },
    });

    const data: any = await response.json().catch(() => ({}));

    // A non-2xx used to fall through to `?? 'pending'`, which pinned the item
    // in `generating` and re-polled it every 30s forever. Throw instead and
    // let the poller decide: 4xx is terminal, 5xx is worth another tick.
    if (!response.ok) {
      throw new HiggsfieldApiError(
        `Higgsfield status failed: status=${response.status} ${JSON.stringify(data)}`,
        response.status,
      );
    }

    const statusMap: Record<string, HiggsfieldVideoResult['status']> = {
      queued: 'pending',
      in_progress: 'processing',
      processing: 'processing',
      completed: 'completed',
      failed: 'failed',
      nsfw: 'failed',
      canceled: 'failed',
    };

    return {
      requestId: jobId,
      // Unknown or absent status fails fast rather than idling as 'pending'.
      status: statusMap[data.status] ?? 'failed',
      videoUrl: data.video?.url,
      error: data.error ?? (statusMap[data.status] ? undefined : `unrecognized status: ${data.status ?? 'none'}`),
    };
  }
}

export const higgsfieldProvider = new HiggsfieldProvider();
