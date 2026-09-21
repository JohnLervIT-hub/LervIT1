/**
 * LinkedIn content publishing provider for Ember.
 *
 * Docs:
 *   - Share on LinkedIn: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
 *   - UGC Posts API:     https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/ugc-post-api
 *
 * Env vars (set on Railway LervIT1 service):
 *   - LINKEDIN_ACCESS_TOKEN  (member or org access token with w_member_social scope)
 *   - LINKEDIN_CLIENT_ID     (LinkedIn app client id — reserved for future refresh flow)
 *   - LINKEDIN_CLIENT_SECRET (LinkedIn app client secret — reserved for future refresh flow)
 *
 * Notes:
 *   - Module import is safe without env vars; the first API call surfaces the
 *     configuration error via the returned LinkedInPostResult.error.
 *   - Video URLs are attached as ARTICLE media (link preview). Native video
 *     upload requires the multipart Assets API and is not implemented here.
 */

import { logger } from '../logger';

// Appended to the body of every outbound LinkedIn post. This is plain text,
// not a page mention: posts are authored as urn:li:person, so LinkedIn will
// render this as literal characters — it does not link or notify the company
// page. A real tag needs an organization author + a mention entity.
const LERVIT_SIGNOFF = '\n\n📍 LervIT Moving Calgary\nlervit.com';

interface LinkedInPostRequest {
  text: string;
  url?: string;
  imageUrl?: string;
  videoUrl?: string;
  title?: string;
  description?: string;
  /** Bare tags (no leading '#') — matches how content_items stores them. */
  hashtags?: string[];
}

interface LinkedInPostResult {
  postId: string;
  url?: string;
  error?: string;
}

class LinkedInProvider {
  private accessToken: string;
  private clientId: string;
  private clientSecret: string;
  private baseUrl = 'https://api.linkedin.com/v2';

  constructor() {
    this.accessToken = process.env.LINKEDIN_ACCESS_TOKEN ?? '';
    this.clientId = process.env.LINKEDIN_CLIENT_ID ?? '';
    this.clientSecret = process.env.LINKEDIN_CLIENT_SECRET ?? '';
  }

  private assertConfigured() {
    if (!this.accessToken) {
      throw new Error('LINKEDIN_ACCESS_TOKEN not set');
    }
  }

  // Get current member/org ID
  async getAuthorId(): Promise<string> {
    this.assertConfigured();

    const response = await fetch(`${this.baseUrl}/userinfo`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    const data = (await response.json()) as any;

    if (!response.ok) {
      throw new Error(`LinkedIn auth error: ${data.message ?? response.status}`);
    }

    return data.sub;
  }

  /**
   * Upload an image to LinkedIn and return its asset URN.
   *
   * Three legs, per the Share Media API: register the upload, PUT the bytes
   * to the URL it hands back, then reference the returned URN in ugcPosts.
   * Posting the image URL as an ARTICLE instead would render a link card,
   * not a native image.
   */
  private async uploadImage(imageUrl: string, authorUrn: string): Promise<string> {
    const registerRes = await fetch(
      `${this.baseUrl}/assets?action=registerUpload`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            // Full URN, not the bare member id — registerUpload rejects the id.
            owner: authorUrn,
            serviceRelationships: [
              {
                relationshipType: 'OWNER',
                identifier: 'urn:li:userGeneratedContent',
              },
            ],
          },
        }),
      },
    );

    const registerData = (await registerRes.json().catch(() => ({}))) as any;
    if (!registerRes.ok) {
      throw new Error(
        `LinkedIn registerUpload failed: ${registerData?.message ?? registerRes.status}`,
      );
    }

    const uploadUrl =
      registerData?.value?.uploadMechanism?.[
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
      ]?.uploadUrl;
    const assetUrn = registerData?.value?.asset;

    if (!uploadUrl || !assetUrn) {
      throw new Error('LinkedIn registerUpload returned no uploadUrl/asset');
    }

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Could not fetch image for upload: ${imageRes.status} ${imageUrl}`);
    }

    // LinkedIn's feedshare-image recipe accepts PNG, JPEG and GIF. WebP is
    // not supported — surface that here rather than letting it fail as an
    // opaque upload error.
    const contentType = imageRes.headers.get('content-type') ?? 'application/octet-stream';
    if (/webp/i.test(contentType)) {
      throw new Error('LinkedIn does not accept WebP images — upload a JPEG or PNG');
    }

    const bytes = new Uint8Array(await imageRes.arrayBuffer());

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': contentType,
      },
      body: bytes,
    });

    if (!uploadRes.ok) {
      throw new Error(`LinkedIn image upload failed: ${uploadRes.status}`);
    }

    logger.info({ assetUrn, bytes: bytes.byteLength }, '[LinkedIn] image uploaded');
    return assetUrn as string;
  }

  // Post text content to LinkedIn
  async post(input: LinkedInPostRequest): Promise<LinkedInPostResult> {
    try {
      this.assertConfigured();

      const authorId = await this.getAuthorId();
      const author = `urn:li:person:${authorId}`;

      // Hashtags are stored on the content item as bare words and were being
      // dropped here — generated, saved, shown in the admin, never posted.
      // Tags the copy already carries inline are skipped rather than repeated.
      const hashtagStr = (input.hashtags ?? [])
        .map((h) => h.trim().replace(/^#+/, ''))
        .filter((h) => h.length > 0)
        // Escape before building the probe — a tag like "c++" would otherwise
        // compile to an invalid regex and throw.
        .filter(
          (h) =>
            !new RegExp(`#${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
              input.text,
            ),
        )
        .map((h) => `#${h}`)
        .join(' ');

      const fullText = hashtagStr ? `${input.text}\n\n${hashtagStr}` : input.text;

      // Brand sign-off appended to every post. Plain text, not a LinkedIn
      // mention — see LERVIT_SIGNOFF above. Skipped when the copy already
      // carries it so a re-post does not stack two sign-offs.
      const textWithTag = fullText.includes(LERVIT_SIGNOFF.trim())
        ? fullText
        : `${fullText}${LERVIT_SIGNOFF}`;

      const shareContent: any = {
        shareCommentary: { text: textWithTag },
        shareMediaCategory: 'NONE',
      };

      // A still becomes a native IMAGE share; a link or video URL stays an
      // ARTICLE preview card. IMAGE wins when both are present.
      const mediaUrl = input.url ?? input.videoUrl;
      if (input.imageUrl) {
        const assetUrn = await this.uploadImage(input.imageUrl, author);
        shareContent.shareMediaCategory = 'IMAGE';
        shareContent.media = [
          {
            status: 'READY',
            // IMAGE references the uploaded asset; only ARTICLE uses originalUrl.
            media: assetUrn,
            title: { text: input.title ?? 'LervIT Moving Calgary' },
            description: {
              text: input.description ?? input.text.slice(0, 200),
            },
          },
        ];
      } else if (mediaUrl) {
        shareContent.shareMediaCategory = 'ARTICLE';
        shareContent.media = [
          {
            status: 'READY',
            originalUrl: mediaUrl,
            title: { text: input.title ?? 'LervIT Moving Calgary' },
            description: {
              text: input.description ?? input.text.slice(0, 200),
            },
          },
        ];
      }

      const body = {
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': shareContent,
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      const response = await fetch(`${this.baseUrl}/ugcPosts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = (await response.json()) as any;
        throw new Error(error.message ?? 'LinkedIn post failed');
      }

      const postId =
        response.headers.get('x-restli-id') ??
        response.headers.get('location')?.split('/').pop() ??
        'unknown';

      return {
        postId,
        url: `https://www.linkedin.com/feed/update/${postId}`,
      };
    } catch (err: any) {
      logger.error({ err }, '[LinkedIn] Post failed');
      return {
        postId: '',
        error: err?.message ?? String(err),
      };
    }
  }
}

export const linkedInProvider = new LinkedInProvider();
