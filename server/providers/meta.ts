/**
 * Meta (Facebook + Instagram) distribution provider for Ember.
 *
 * Docs:
 *   - Facebook Graph API: https://developers.facebook.com/docs/graph-api
 *   - Instagram Content Publishing: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 *
 * Env vars (set on Railway LervIT1 service):
 *   - META_PAGE_ACCESS_TOKEN  (long-lived Page access token)
 *   - META_PAGE_ID            (Facebook Page ID; also used to resolve the linked IG Business account)
 *   - META_APP_ID             (Meta App ID)
 *   - META_APP_SECRET         (Meta App secret)
 *
 * Notes:
 *   - Instagram publishing requires an IG Business account linked to the Page.
 *   - Video posts to IG must go via the REELS container path and wait until
 *     Meta finishes processing before publishing (waitForContainer).
 *   - Module import is safe without env vars; the first API call surfaces the
 *     configuration error via the returned PostResult.error.
 */

import { logger } from '../logger';

export interface PostRequest {
  message: string;
  photoUrl?: string;
  videoUrl?: string;
  hashtags?: string[];
  platform: 'facebook' | 'instagram';
}

export interface PostResult {
  postId: string;
  platform: string;
  url?: string;
  error?: string;
}

class MetaProvider {
  private pageAccessToken: string;
  private pageId: string;
  private appId: string;
  private appSecret: string;
  private baseUrl = 'https://graph.facebook.com/v19.0';

  constructor() {
    this.pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN ?? '';
    this.pageId = process.env.META_PAGE_ID ?? '';
    this.appId = process.env.META_APP_ID ?? '';
    this.appSecret = process.env.META_APP_SECRET ?? '';
  }

  private assertConfigured() {
    if (!this.pageAccessToken || !this.pageId) {
      throw new Error(
        'Meta not configured: META_PAGE_ACCESS_TOKEN and META_PAGE_ID required',
      );
    }
  }

  private buildCaption(message: string, hashtags?: string[]): string {
    if (!hashtags?.length) return message;
    const tags = hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ');
    return `${message}\n\n${tags}`;
  }

  // Post text + optional media to Facebook
  async postToFacebook(input: PostRequest): Promise<PostResult> {
    try {
      this.assertConfigured();

      const message = this.buildCaption(input.message, input.hashtags);

      let endpoint: string;
      let body: Record<string, string>;

      if (input.videoUrl) {
        endpoint = `${this.baseUrl}/${this.pageId}/videos`;
        body = {
          file_url: input.videoUrl,
          description: message,
          access_token: this.pageAccessToken,
        };
      } else if (input.photoUrl) {
        endpoint = `${this.baseUrl}/${this.pageId}/photos`;
        body = {
          url: input.photoUrl,
          caption: message,
          access_token: this.pageAccessToken,
        };
      } else {
        endpoint = `${this.baseUrl}/${this.pageId}/feed`;
        body = {
          message,
          access_token: this.pageAccessToken,
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error?.message ?? 'Facebook post failed');
      }

      const postId: string = data.post_id ?? data.id ?? '';

      return {
        postId,
        platform: 'facebook',
        url: postId ? `https://facebook.com/${postId}` : undefined,
      };
    } catch (err: any) {
      logger.error({ err }, '[Meta] Facebook post failed');
      return {
        postId: '',
        platform: 'facebook',
        error: err?.message ?? String(err),
      };
    }
  }

  // Post to Instagram Business
  async postToInstagram(input: PostRequest): Promise<PostResult> {
    try {
      this.assertConfigured();

      // Step 1 — resolve the IG Business account linked to the Page.
      // Prefer INSTAGRAM_BUSINESS_ID env var when present to skip the Graph
      // lookup entirely; otherwise ask the Page for its linked IG account.
      let igAccountId: string | undefined = process.env.INSTAGRAM_BUSINESS_ID;

      if (!igAccountId) {
        const igResponse = await fetch(
          `${this.baseUrl}/${this.pageId}` +
            `?fields=instagram_business_account` +
            `&access_token=${this.pageAccessToken}`,
        );
        const igData = await igResponse.json();
        igAccountId = igData.instagram_business_account?.id;
      }

      if (!igAccountId) {
        return {
          postId: '',
          platform: 'instagram',
          error: 'No Instagram Business account linked to this Page',
        };
      }

      const caption = this.buildCaption(input.message, input.hashtags);

      // Step 2 — create the media container.
      const containerBody: Record<string, string> = {
        caption,
        access_token: this.pageAccessToken,
      };
      if (input.videoUrl) {
        containerBody.video_url = input.videoUrl;
        containerBody.media_type = 'REELS';
      } else if (input.photoUrl) {
        containerBody.image_url = input.photoUrl;
      } else {
        return {
          postId: '',
          platform: 'instagram',
          error: 'Instagram post requires photoUrl or videoUrl',
        };
      }

      const containerResponse = await fetch(
        `${this.baseUrl}/${igAccountId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(containerBody),
        },
      );

      const containerData = await containerResponse.json();

      if (!containerResponse.ok || containerData.error) {
        throw new Error(
          containerData.error?.message ?? 'Instagram container creation failed',
        );
      }

      const containerId: string = containerData.id;

      // Step 3 — for video/REELS, wait for Meta processing to finish.
      if (input.videoUrl) {
        await this.waitForContainer(containerId);
      }

      // Step 4 — publish the container.
      const publishResponse = await fetch(
        `${this.baseUrl}/${igAccountId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: containerId,
            access_token: this.pageAccessToken,
          }),
        },
      );

      const publishData = await publishResponse.json();

      if (!publishResponse.ok || publishData.error) {
        throw new Error(
          publishData.error?.message ?? 'Instagram publish failed',
        );
      }

      const mediaId: string = publishData.id;

      return {
        postId: mediaId,
        platform: 'instagram',
        url: mediaId ? `https://instagram.com/p/${mediaId}` : undefined,
      };
    } catch (err: any) {
      logger.error({ err }, '[Meta] Instagram post failed');
      return {
        postId: '',
        platform: 'instagram',
        error: err?.message ?? String(err),
      };
    }
  }

  // Poll IG media container until it finishes processing.
  private async waitForContainer(
    containerId: string,
    maxWaitMs = 120000,
  ): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const response = await fetch(
        `${this.baseUrl}/${containerId}` +
          `?fields=status_code` +
          `&access_token=${this.pageAccessToken}`,
      );
      const data = await response.json();

      if (data.status_code === 'FINISHED') return;
      if (data.status_code === 'ERROR') {
        throw new Error('Instagram container processing failed');
      }

      await new Promise((r) => setTimeout(r, 5000));
    }

    throw new Error('Instagram container timeout');
  }

  // Dispatch to the requested platform. Returns an array so callers can
  // extend to multi-platform fan-out later without a signature change.
  async publish(input: PostRequest): Promise<PostResult[]> {
    if (input.platform === 'facebook') {
      return [await this.postToFacebook(input)];
    }
    if (input.platform === 'instagram') {
      return [await this.postToInstagram(input)];
    }
    return [
      {
        postId: '',
        platform: input.platform,
        error: `Unsupported platform: ${input.platform}`,
      },
    ];
  }
}

export const metaProvider = new MetaProvider();
