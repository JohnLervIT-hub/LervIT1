/**
 * Higgsfield provider — cinematic / lifestyle AI video generation.
 *
 * API base and endpoints are per spec (https://api.higgsfield.ai/v1/video/*).
 * First live call may need field-name adjustments — Higgsfield's public API
 * shape isn't as broadly documented as HeyGen's.
 *
 * Env vars (set on Railway LervIT1 service):
 *   - HIGGSFIELD_API_KEY (required)
 *   - HIGGSFIELD_SECRET  (optional; some tenants require it)
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
  imageUrl?: string;
  error?: string;
}

class HiggsfieldProvider {
  private apiKey: string;
  private secret: string;
  private baseUrl = 'https://api.higgsfield.ai';

  constructor() {
    this.apiKey = process.env.HIGGSFIELD_API_KEY ?? '';
    this.secret = process.env.HIGGSFIELD_SECRET ?? '';
  }

  private assertConfigured() {
    if (!this.apiKey) {
      throw new Error('Higgsfield not configured: HIGGSFIELD_API_KEY missing');
    }
  }

  // Higgsfield accepts the full "client_id:secret" pair as a Bearer token —
  // Basic-auth encoding was rejected by their live API, so we send the raw
  // key (colon and all) as Bearer regardless of shape.
  private authHeader(): string {
    return `Bearer ${this.apiKey}`;
  }

  async createVideo(input: VideoGenerationRequest): Promise<GenerationJob> {
    this.assertConfigured();

    logger.info(
      {
        url: `${this.baseUrl}/v1/video/generate`,
        apiKeyFirst8: process.env.HIGGSFIELD_API_KEY?.slice(0, 8),
        authScheme: 'bearer',
      },
      '[Higgsfield] Request details',
    );

    const response = await fetch(`${this.baseUrl}/v1/video/generate`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        ...(this.secret ? { 'X-Api-Secret': this.secret } : {}),
      },
      body: JSON.stringify({
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio ?? '9:16',
        duration: input.duration ?? 5,
        style: input.style,
        reference_image_url: input.referenceImageUrl,
        motion: input.motion,
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

    return {
      jobId: data?.id ?? data?.job_id,
      status: 'pending',
    };
  }

  async getJobStatus(jobId: string): Promise<GenerationJob> {
    this.assertConfigured();

    const response = await fetch(`${this.baseUrl}/v1/video/${encodeURIComponent(jobId)}`, {
      headers: {
        Authorization: this.authHeader(),
        ...(this.secret ? { 'X-Api-Secret': this.secret } : {}),
      },
    });

    const data: any = await response.json().catch(() => ({}));

    return {
      jobId,
      status:
        data?.status === 'completed'
          ? 'completed'
          : data?.status === 'failed'
            ? 'failed'
            : 'processing',
      videoUrl: data?.video_url ?? data?.output_url,
      imageUrl: data?.image_url,
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
