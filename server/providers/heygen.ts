/**
 * HeyGen provider — talking-avatar / presenter video generation.
 *
 * Docs: https://docs.heygen.com/reference/generate-video (v2)
 *
 * Env vars (set on Railway LervIT1 service):
 *   - HEYGEN_API_KEY     (required)
 *   - HEYGEN_AVATAR_ID   (default avatar for LervIT presenter videos)
 *   - HEYGEN_VOICE_ID    (default voice for LervIT presenter videos)
 *
 * Notes:
 *   - Request/response shapes are per spec — first live call may need field
 *     tweaks if HeyGen's payload keys differ from what's coded here.
 *   - Module import is safe without env vars set; the first API call throws.
 */

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

    const response = await fetch(`${this.baseUrl}/v2/video/generate`, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_inputs: [
          {
            character: {
              type: 'avatar',
              avatar_id: input.avatarId ?? this.defaultAvatarId,
              avatar_style: 'normal',
            },
            voice: {
              type: 'text',
              input_text: input.script,
              voice_id: input.voiceId ?? this.defaultVoiceId,
            },
            background:
              input.background ?? {
                type: 'color',
                value: '#1e3a5f',
              },
          },
        ],
        aspect_ratio: input.aspectRatio ?? '9:16',
        caption: input.caption ?? true,
        title: input.title ?? 'LervIT Video',
      }),
    });

    const data: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg = data?.message ?? data?.error ?? `status=${response.status}`;
      throw new Error(`HeyGen error: ${msg}`);
    }

    return {
      jobId: data?.data?.video_id ?? data?.video_id,
      status: 'pending',
    };
  }

  async getJobStatus(jobId: string): Promise<VideoJob> {
    this.assertConfigured();

    const response = await fetch(
      `${this.baseUrl}/v1/video_status.get?video_id=${encodeURIComponent(jobId)}`,
      { headers: { 'X-Api-Key': this.apiKey } },
    );

    const data: any = await response.json().catch(() => ({}));
    const video = data?.data ?? {};

    return {
      jobId,
      status:
        video.status === 'completed'
          ? 'completed'
          : video.status === 'failed'
            ? 'failed'
            : 'processing',
      videoUrl: video.video_url,
      thumbnailUrl: video.thumbnail_url,
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
