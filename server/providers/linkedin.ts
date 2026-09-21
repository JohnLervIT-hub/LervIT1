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

  // Post text content to LinkedIn
  async post(input: LinkedInPostRequest): Promise<LinkedInPostResult> {
    try {
      this.assertConfigured();

      const authorId = await this.getAuthorId();
      const author = `urn:li:person:${authorId}`;

      // Brand sign-off appended to every post. Plain text, not a LinkedIn
      // mention — see LERVIT_SIGNOFF above. Skipped when the copy already
      // carries it so a re-post does not stack two sign-offs.
      const textWithTag = input.text.includes(LERVIT_SIGNOFF.trim())
        ? input.text
        : `${input.text}${LERVIT_SIGNOFF}`;

      const shareContent: any = {
        shareCommentary: { text: textWithTag },
        shareMediaCategory: 'NONE',
      };

      // Attach as ARTICLE (link preview) when a URL is provided.
      const mediaUrl = input.url ?? input.videoUrl ?? input.imageUrl;
      if (mediaUrl) {
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
