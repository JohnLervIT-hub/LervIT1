/**
 * Higgsfield provider — Bytedance Seedance 2.0 text-to-video.
 *
 * Verified against https://docs.higgsfield.ai (2026-09-24):
 *
 * Create:  POST https://api.higgsfield.ai/bytedance/seedance-2.0/text-to-video
 *          Response: { status, request_id, status_url }
 * Status:  GET  ${status_url}   (defaults to
 *          https://api.higgsfield.ai/requests/${request_id}/status)
 *          Response: { status, request_id, error, video: { url }, ... }
 *          status ∈ queued | in_progress | completed | failed | nsfw | canceled
 * Auth:    Authorization: Key ${key_id}:${key_secret}
 *
 * Credentials are a PAIR, not a single token. Supply them either as
 * HIGGSFIELD_API_KEY="<key_id>:<key_secret>" or as the separate
 * HIGGSFIELD_API_KEY_ID / HIGGSFIELD_API_KEY_SECRET.
 *
 * They are resolved per call, not at module load. This file used to run the
 * SDK's config() at import time, which throws BadInputError on a key without
 * a colon — and since server/index.ts imports background-jobs, which imports
 * this file, that took down the whole process at boot rather than failing one
 * video. The SDK was never actually called; every request here is raw fetch.
 *
 * createVideo/getJobStatus submit async and return immediately — the 30s
 * poller in background-jobs advances the job.
 */

import { logger } from '../logger';

/**
 * Builds the `key_id:key_secret` pair the Authorization header needs.
 * Throws at call time (recoverable — the item is marked failed) rather than
 * at import time (fatal — the server never boots).
 */
function higgsfieldCredentials(): string {
  const id = process.env.HIGGSFIELD_API_KEY_ID?.trim();
  const secret = process.env.HIGGSFIELD_API_KEY_SECRET?.trim();
  if (id && secret) return `${id}:${secret}`;

  const combined = process.env.HIGGSFIELD_API_KEY?.trim() ?? '';
  const parts = combined.split(':');
  if (parts.length === 2 && parts[0] && parts[1]) return combined;

  throw new Error(
    'Higgsfield not configured: set HIGGSFIELD_API_KEY to "<key_id>:<key_secret>", ' +
      'or set HIGGSFIELD_API_KEY_ID and HIGGSFIELD_API_KEY_SECRET. ' +
      (combined
        ? 'The current HIGGSFIELD_API_KEY is not a colon-separated pair.'
        : 'No credentials are set.'),
  );
}

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
          Authorization: `Key ${higgsfieldCredentials()}`,
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
    // The create response's status_url is authoritative; the fallback is the
    // documented shape and is what a process restart falls back to, since the
    // cache is in memory. This used to point at platform.higgsfield.ai, which
    // is the SDK's internal base URL, not the public API host.
    const statusUrl =
      statusUrlCache.get(jobId) ??
      `https://api.higgsfield.ai/requests/${jobId}/status`;

    const response = await fetch(statusUrl, {
      headers: {
        Authorization: `Key ${higgsfieldCredentials()}`,
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
      completed: 'completed',
      failed: 'failed',
      nsfw: 'failed',
      canceled: 'failed',
      // Not in the documented enum. Kept as a defensive alias so a synonym
      // would not trip the unknown-status fail-fast below.
      processing: 'processing',
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
