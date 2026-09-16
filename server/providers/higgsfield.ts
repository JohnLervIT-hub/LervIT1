/**
 * Higgsfield provider — Kling Video v3.0 (pro) text-to-video.
 *
 * Create:  POST https://api.higgsfield.ai/kling-video/v3.0/pro/text-to-video
 *          Body: { prompt, duration, aspect_ratio, sound, cfg_scale }
 *          Response: { status, request_id, status_url, cancel_url }
 *
 * Status:  GET  ${status_url}   (defaults to
 *          https://platform.higgsfield.ai/requests/${request_id}/status)
 *
 * Auth:    Authorization: Key ${HIGGSFIELD_API_KEY}   (literal "Key" prefix)
 *
 * Env vars (set on Railway LervIT1 service):
 *   - HIGGSFIELD_API_KEY (required)
 */

import { logger } from '../logger';

export interface VideoGenerationRequest {
  prompt: string;
  aspectRatio?: '9:16' | '16:9' | '1:1';
  duration?: number;
  style?: string;
  referenceImageUrl?: string;
  motion?: string;
}

export interface GenerationJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

class HiggsfieldProvider {
  private apiKey: string;
  private createUrl = 'https://api.higgsfield.ai/kling-video/v3.0/pro/text-to-video';
  private statusUrls = new Map<string, string>();

  constructor() {
    this.apiKey = process.env.HIGGSFIELD_API_KEY ?? '';
  }

  private assertConfigured() {
    if (!this.apiKey) {
      throw new Error('Higgsfield not configured: HIGGSFIELD_API_KEY missing');
    }
  }

  private authHeader(): string {
    return `Key ${this.apiKey}`;
  }

  private mapStatus(raw: unknown): GenerationJob['status'] {
    const statusMap: Record<string, GenerationJob['status']> = {
      queued: 'pending',
      in_progress: 'processing',
      processing: 'processing',
      completed: 'completed',
      failed: 'failed',
    };
    return (typeof raw === 'string' && statusMap[raw]) || 'pending';
  }

  private extractVideoUrl(data: any): string | undefined {
    return data?.video?.url ?? data?.images?.[0]?.url;
  }

  async createVideo(input: VideoGenerationRequest): Promise<GenerationJob> {
    this.assertConfigured();

    logger.info(
      {
        url: this.createUrl,
        apiKeyFirst8: this.apiKey.slice(0, 8),
        authScheme: 'key',
      },
      '[Higgsfield] Request details',
    );

    const response = await fetch(this.createUrl, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt,
        duration: input.duration ?? 5,
        aspect_ratio: input.aspectRatio ?? '9:16',
        sound: 'on',
        cfg_scale: 0.5,
      }),
    });

    const data: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `Higgsfield error: status=${response.status} ${
          typeof data === 'string' ? data : JSON.stringify(data)
        }`,
      );
    }

    const requestId: string | undefined = data?.request_id;
    if (!requestId) {
      throw new Error(
        `Higgsfield error: missing request_id in response ${JSON.stringify(data)}`,
      );
    }

    if (typeof data?.status_url === 'string') {
      this.statusUrls.set(requestId, data.status_url);
    }

    return {
      jobId: requestId,
      status: this.mapStatus(data?.status ?? 'queued'),
    };
  }

  async getJobStatus(jobIdOrStatusUrl: string): Promise<GenerationJob> {
    this.assertConfigured();

    const isUrl = /^https?:\/\//i.test(jobIdOrStatusUrl);
    const jobId = isUrl
      ? jobIdOrStatusUrl.match(/requests\/([^/]+)\/status/)?.[1] ?? jobIdOrStatusUrl
      : jobIdOrStatusUrl;

    const url = isUrl
      ? jobIdOrStatusUrl
      : this.statusUrls.get(jobIdOrStatusUrl) ??
        `https://platform.higgsfield.ai/requests/${encodeURIComponent(jobIdOrStatusUrl)}/status`;

    const response = await fetch(url, {
      headers: { Authorization: this.authHeader() },
    });

    const data: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        jobId,
        status: 'failed',
        error: `status=${response.status} ${
          typeof data === 'string' ? data : JSON.stringify(data)
        }`,
      };
    }

    return {
      jobId,
      status: this.mapStatus(data?.status),
      videoUrl: this.extractVideoUrl(data),
      thumbnailUrl: undefined,
      error: data?.error,
    };
  }

  async waitForCompletion(jobId: string, maxWaitMs = 600_000): Promise<GenerationJob> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const status = await this.getJobStatus(jobId);
      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }
      await new Promise((r) => setTimeout(r, 15_000));
    }
    return { jobId, status: 'failed', error: 'timeout' };
  }
}

export const higgsfieldProvider = new HiggsfieldProvider();
