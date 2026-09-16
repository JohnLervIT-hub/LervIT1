/**
 * HeyGen provider — talking-avatar / presenter video generation.
 *
 * Docs: https://developers.heygen.com/avatar-iv  (v3 — POST /v3/videos)
 *
 * Migrated off the legacy v2 endpoint (/v2/video/generate) which HeyGen has
 * deprecated with removal scheduled 2026-10-31. v3 requires the newer Avatar
 * IV / Avatar V engines and uses a much flatter body shape; avatar_style,
 * per-input background, and aspect_ratio are no longer request parameters.
 *
 * Env vars (set on Railway LervIT1 service):
 *   - HEYGEN_API_KEY     (required)
 *   - HEYGEN_AVATAR_ID   (default avatar for LervIT presenter videos)
 *   - HEYGEN_VOICE_ID    (default voice for LervIT presenter videos)
 *
 * Notes:
 *   - Module import is safe without env vars set; the first API call throws.
 *   - Request/response shapes may need field tweaks once we exercise the
 *     real endpoint — response parser tolerates both `data.video_id` and
 *     top-level `video_id` for the create response.
 */

import { logger } from '../logger';

export interface AvatarVideoRequest {
  script: string;
  avatarId?: string;
  voiceId?: string;
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5';
  caption?: boolean;
  background?: {
    type: 'color' | 'image';
    value: string;
  };
  title?: string;
  engine?: 'avatar_iii' | 'avatar_iv' | 'avatar_v' | 'auto';
}

export interface VideoJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  error?: string;
}

class HeyGenProvider {
  private apiKey: string;
  private baseUrl = 'https://api.heygen.com';
  private defaultAvatarId: string;
  private defaultVoiceId: string;

  constructor() {
    this.apiKey = process.env.HEYGEN_API_KEY ?? '';
    this.defaultAvatarId = process.env.HEYGEN_AVATAR_ID ?? '';
    this.defaultVoiceId = process.env.HEYGEN_VOICE_ID ?? '';
  }

  private assertConfigured() {
    if (!this.apiKey) {
      throw new Error('HeyGen not configured: HEYGEN_API_KEY missing');
    }
  }

  async createVideo(input: AvatarVideoRequest): Promise<VideoJob> {
    this.assertConfigured();

    const url = `${this.baseUrl}/v3/videos`;

    logger.info(
      {
        url,
        apiKeyFirst8: process.env.HEYGEN_API_KEY?.slice(0, 8),
        hasScript: !!input.script,
      },
      '[HeyGen] Request details',
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'avatar',
        avatar_id: input.avatarId ?? this.defaultAvatarId,
        voice_id: input.voiceId ?? this.defaultVoiceId,
        script: input.script,
        resolution: '720p',
        aspect_ratio: input.aspectRatio ?? '9:16',
        engine: input.engine ?? 'avatar_iii',
      }),
    });

    const data: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `HeyGen error: status=${response.status} ${JSON.stringify(data)}`,
      );
    }

    return {
      jobId: data?.data?.video_id ?? data?.video_id ?? data?.data?.id ?? data?.id,
      status: 'pending',
    };
  }

  async getJobStatus(jobId: string): Promise<VideoJob> {
    this.assertConfigured();

    const response = await fetch(
      `${this.baseUrl}/v3/videos/${encodeURIComponent(jobId)}`,
      { headers: { 'X-Api-Key': this.apiKey } },
    );

    const data: any = await response.json().catch(() => ({}));
    const video = data?.data ?? data ?? {};

    return {
      jobId,
      status:
        video.status === 'completed'
          ? 'completed'
          : video.status === 'failed'
            ? 'failed'
            : 'processing',
      videoUrl: video.video_url ?? video.videoUrl,
      thumbnailUrl: video.thumbnail_url ?? video.thumbnailUrl,
      duration: video.duration,
      error: video.error,
    };
  }

  async waitForCompletion(jobId: string, maxWaitMs = 300_000): Promise<VideoJob> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const status = await this.getJobStatus(jobId);
      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }
      await new Promise((r) => setTimeout(r, 10_000));
    }
    return { jobId, status: 'failed', error: 'timeout' };
  }
}

export const heygenProvider = new HeyGenProvider();
