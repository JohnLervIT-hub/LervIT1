/**
 * Ember Lane (MAGNET) — content & marketing agent.
 *
 * Actions:
 *   Phase 1 — Content generation:
 *     - `generate_blog_post`         : draft a Calgary-focused blog post → blog_posts (status='pending_review')
 *     - `generate_gmb_post`          : draft a Google Business post → gmb_posts (status='pending')
 *                                       Case: 8-3924000041848 (GMB API pending approval)
 *     - `respond_to_review`          : warm response for 4-5 star; escalate to Xavier for <=3
 *     - `generate_social_content`    : per-platform social copy → social_posts (status='draft')
 *     - `generate_newsletter`        : monthly newsletter draft (subject/preheader/HTML)
 *     - `publish_blog_post`          : flip a pending_review blog post to 'published' (public /blog picks up)
 *
 *   Phase 2 — Campaigns + video (HeyGen presenter, Higgsfield cinematic):
 *     - `create_campaign`            : plan a multi-item campaign → campaigns + content_items rows
 *     - `generate_creative_brief`    : write directorial brief onto a content_items row
 *     - `generate_video_script`      : write a video script onto a content_items row
 *     - `generate_heygen_video`      : submit script to HeyGen, wait, save video_url
 *     - `generate_higgsfield_video`  : submit prompt to Higgsfield, wait, save video_url
 *     - `run_qa`                     : brand/claims/product QA over content_items row
 *     - `get_campaign_status`        : campaign + item aggregates for the admin UI
 *
 * All generated copy is pending-review-by-default. John reviews via the APEX EmberCard
 * before anything goes live. Blog is live at lervit.com/blog and reads
 * `blog_posts` where status = 'published' via the public HTTP API — the marketing
 * site (JohnLervIT-hub/website-standalonezip) fetches /api/blog and renders the
 * structured shape (sections/faq/CTAs). Schema: shared/schema.ts blogPosts.
 */

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { desc, eq } from 'drizzle-orm';
import { BaseAgent, type AgentRunOptions } from './base';
import { db } from '../db';
import { blogPosts, gmbPosts, socialPosts, reviews, users, bookings, campaigns, contentItems } from '@shared/schema';
import { xavier } from './xavier';
import { logger } from '../logger';
import { emitEvent } from '../events';
import { JAILBREAK_PREAMBLE, sanitizeForPrompt } from '../lib/promptSanitizer';
import { heygenProvider } from '../providers/heygen';
import { higgsfieldProvider } from '../providers/higgsfield';
import { metaProvider } from '../providers/meta';
import { linkedInProvider } from '../providers/linkedin';

const EMBER_MODEL = 'claude-sonnet-4-6';

// CreativeOS skill — viral hooks, HeyGen/Higgsfield rules, Calgary content, brand voice.
// Loaded once at startup; injected into content-generation system prompts.
let CREATIVEOS_SKILL = '';
try {
  const skillPath = path.join(process.cwd(), '.agents/skills/creativeos/SKILL.md');
  CREATIVEOS_SKILL = fs.readFileSync(skillPath, 'utf-8');
  logger.info('[Ember] CreativeOS skill loaded');
} catch {
  logger.warn('[Ember] CreativeOS skill not found — using base prompts');
}

const CREATIVEOS_APPENDIX = CREATIVEOS_SKILL
  ? `\n\n---\n## CREATIVEOS SKILL\n${CREATIVEOS_SKILL}`
  : '';

// For blog posts, only inject sections 5 (Calgary) and 7 (Brand Voice) to keep prompt lean.
const CREATIVEOS_BLOG_APPENDIX = (() => {
  if (!CREATIVEOS_SKILL) return '';
  const calgary = CREATIVEOS_SKILL.split('## 5.')[1]?.split('## 6.')[0] ?? '';
  const brand = CREATIVEOS_SKILL.split('## 7.')[1]?.split('## 8.')[0] ?? '';
  if (!calgary && !brand) return '';
  return `\n\n---\n## CREATIVEOS SKILL (excerpt)\n${calgary ? `## 5.${calgary}` : ''}${brand ? `## 7.${brand}` : ''}`;
})();

const LERVIT_BRAND = `
LervIT is Calgary's AI-powered moving platform connecting customers with
verified local movers.

Key facts:
- Based in Calgary, AB, Canada
- Service area: Calgary, Airdrie, Cochrane
- 5.0 Google rating
- Verified local movers
- Instant AI quote in 30 seconds
- Promo: LERVIT10 (10% off)
- Pay in 4 via Afterpay
- Website: lervit.com
- Phone: 1-888-982-0885
- Blog: lervit.com/blog
`.trim();

const BLOG_TOPICS = [
  'How to pack a kitchen for moving',
  'Moving checklist for Calgary families',
  'Best neighbourhoods in Calgary 2026',
  'How to choose a mover in Calgary',
  'Moving with kids in Calgary',
  'Same day moving tips Calgary',
  'How to move on a budget in Calgary',
  'Moving in Calgary winter guide',
  'Downsizing tips for Calgary seniors',
  'Corporate relocation guide Calgary',
  'Moving to Calgary from another city',
  'Calgary neighbourhood guide for families',
  'How to move a piano in Calgary',
  'Moving day survival guide',
  'Calgary storage unit guide for movers',
];

export type SocialPlatform = 'facebook' | 'instagram' | 'tiktok' | 'linkedin';

const SOCIAL_PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'tiktok', 'linkedin'];

const SOCIAL_GUIDES: Record<SocialPlatform, string> = {
  facebook: `
- 300-500 characters
- Helpful moving tip angle
- 1-2 emojis max
- 2-3 hashtags
- CTA to lervit.com
- Warm, community tone
`.trim(),
  instagram: `
- 150-300 characters
- Visual storytelling angle
- Openers like "Imagine moving day with zero stress"
- 5-7 hashtags (mix broad + Calgary local)
- Refer readers to link in bio
- Bright, aspirational tone
`.trim(),
  tiktok: `
- 100-150 character caption
- Hook in the first line
- Openers like "POV: your move is actually stress-free" or "Moving hack nobody tells you"
- 3-5 trending hashtags
- Energetic, punchy tone
`.trim(),
  linkedin: `
- 400-600 characters
- Professional tone (B2B angle: property managers, corporate relocation, HR teams)
- Mention the LervIT partner program
- 1-2 hashtags only
- No emojis
`.trim(),
};

interface GenerateBlogInput {
  topic?: string;
  category?: string;
}

interface GenerateSocialInput {
  platform?: SocialPlatform;
}

interface RespondToReviewInput {
  reviewId: string;
}

interface PublishBlogInput {
  postId: string;
}

// ─── Phase 2 (campaigns + video) input shapes ────────────────

interface CreateCampaignInput {
  name: string;
  objective: string;
  audience: string;
  offer?: string;
  platforms?: string[];
  durationDays?: number;
}

interface GenerateVideoScriptInput {
  contentItemId: string;
  concept?: string;
  duration?: number;
  audience?: string;
}

interface GenerateHeygenVideoInput {
  contentItemId: string;
  script?: string;
}

interface GenerateHiggsfieldVideoInput {
  contentItemId: string;
  prompt?: string;
  style?: string;
  duration?: number;
}

interface GenerateCreativeBriefInput {
  contentItemId: string;
  concept?: string;
}

interface RunQAInput {
  contentItemId: string;
}

interface GetCampaignStatusInput {
  campaignId: string;
}

interface PublishToSocialInput {
  contentItemId: string;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function pickTopic(): string {
  return BLOG_TOPICS[Math.floor(Math.random() * BLOG_TOPICS.length)];
}

export class EmberAgent extends BaseAgent {
  name = 'Ember Lane';
  code = 'ember';

  protected anthropic: Anthropic;

  constructor() {
    super();
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
  }

  protected async execute(
    action: string,
    input: Record<string, any>,
    options?: AgentRunOptions,
  ): Promise<any> {
    switch (action) {
      case 'generate_blog_post':
        return this.generateBlogPost(input as GenerateBlogInput, options);
      case 'generate_gmb_post':
        return this.generateGmbPost(options);
      case 'respond_to_review':
        return this.respondToReview(input as RespondToReviewInput, options);
      case 'generate_social_content':
        return this.generateSocialContent(input as GenerateSocialInput, options);
      case 'generate_newsletter':
        return this.generateNewsletter(options);
      case 'publish_blog_post':
        return this.publishBlogPost(input as PublishBlogInput, options);
      case 'create_campaign':
        return this.createCampaign(input as CreateCampaignInput, options);
      case 'generate_video_script':
        return this.generateVideoScript(input as GenerateVideoScriptInput, options);
      case 'generate_heygen_video':
        return this.generateHeygenVideo(input as GenerateHeygenVideoInput, options);
      case 'generate_higgsfield_video':
        return this.generateHiggsfieldVideo(input as GenerateHiggsfieldVideoInput, options);
      case 'generate_creative_brief':
        return this.generateCreativeBrief(input as GenerateCreativeBriefInput, options);
      case 'run_qa':
        return this.runQA(input as RunQAInput, options);
      case 'get_campaign_status':
        return this.getCampaignStatus(input as GetCampaignStatusInput, options);
      case 'publish_to_social':
        return this.publishToSocial(input as PublishToSocialInput, options);
      default:
        throw new Error(`Ember: unknown action "${action}"`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Blog
  // ─────────────────────────────────────────────────────────
  async generateBlogPost(input: GenerateBlogInput, options?: AgentRunOptions) {
    const topic = sanitizeForPrompt(input.topic?.trim() || pickTopic(), 'description');
    const category = sanitizeForPrompt(input.category?.trim() || 'Moving Tips', 'title');

    const systemPrompt = `You are Ember Lane, content & marketing lead for LervIT.
Write helpful, actionable, SEO-friendly blog posts for Calgary movers and customers.
Voice: warm, expert, locally-grounded, never salesy.

${LERVIT_BRAND}

CRITICAL: Respond with ONLY raw JSON.
No markdown. No code fences.
No backticks. No explanation.
Start your response with { directly.

{
  "title": string (60-70 chars, includes "Calgary" when natural),
  "slug": string (kebab-case, no stopwords, <= 60 chars),
  "excerpt": string (140-160 chars, hooks the reader),
  "category": string,
  "tags": string[] (5-8 items, lowercase),
  "seoTitle": string (<= 60 chars, SEO meta title),
  "seoDescription": string (<= 160 chars, SEO meta description),
  "readTime": string (e.g. "4 min read", estimate from word count),
  "sections": [
    { "h2": string (section heading), "paragraphs": string[] (2-5 paragraphs, ~60-100 words each) }
  ] (3-5 sections, structured body — do NOT return HTML),
  "faq": [
    { "q": string (natural question), "a": string (1-2 sentence answer) }
  ] (3-5 items covering the top objections/questions readers have)
}

Rules:
- Total body across sections should run 900-1400 words.
- No markdown, no HTML tags anywhere. Plain sentences only.
- Each section must have a distinct angle; do not repeat information across sections.
- FAQs must answer real questions, not restate section content.
- Bake in Calgary neighbourhood references and at least one mention of lervit.com or the LERVIT10 promo.${CREATIVEOS_BLOG_APPENDIX}`;

    const userMessage = `Draft a blog post on: "${topic}".
Category: ${category}.`;

    if (options?.dryRun) {
      return { dryRun: true, would: 'generate_blog_post', topic, category };
    }

    const raw = await this.callAnthropic(systemPrompt, userMessage, 6000);
    const parsed = this.parseJson(raw);

    const title: string = String(parsed.title ?? topic).slice(0, 200);
    const slug: string = String(parsed.slug ?? slugify(title)) || slugify(title);
    const sections = Array.isArray(parsed.sections)
      ? parsed.sections
          .filter((s: any) => s && typeof s.h2 === 'string' && Array.isArray(s.paragraphs))
          .map((s: any) => ({
            h2: String(s.h2),
            paragraphs: s.paragraphs.map((p: any) => String(p)).filter(Boolean),
          }))
      : [];
    if (sections.length === 0) throw new Error('Ember: blog post had no sections');

    const faq = Array.isArray(parsed.faq)
      ? parsed.faq
          .filter((f: any) => f && typeof f.q === 'string' && typeof f.a === 'string')
          .map((f: any) => ({ q: String(f.q), a: String(f.a) }))
      : [];

    // Marketing renders `sections` directly; `content` is a plaintext fallback for search/preview.
    const content = sections
      .map((s: { h2: string; paragraphs: string[] }) => `## ${s.h2}\n\n${s.paragraphs.join('\n\n')}`)
      .join('\n\n');

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const readTime = String(parsed.readTime ?? `${Math.max(1, Math.round(wordCount / 200))} min read`);

    const topCta = { text: 'Get Your Free Quote', href: 'https://app.lervit.com' };
    const bottomCta = {
      text: 'Ready to move in Calgary?',
      sub: 'Get a photo-based quote in under 2 minutes — no phone calls needed.',
      href: 'https://app.lervit.com',
    };

    const [row] = await db
      .insert(blogPosts)
      .values({
        title,
        slug,
        excerpt: parsed.excerpt ?? null,
        content,
        category: parsed.category ?? category,
        tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t)) : null,
        seoTitle: parsed.seoTitle ?? null,
        seoDescription: parsed.seoDescription ?? null,
        status: 'pending_review',
        generatedBy: 'ember',
        sections,
        faq,
        topCta,
        bottomCta,
        related: [],
        // Placeholder — admin swaps for a real image during review.
        image: '/assets/stock_images/person_packing_boxes_8b2535c7.jpg',
        readTime,
      })
      .returning();

    logger.info({ postId: row.id, title, sections: sections.length, faq: faq.length }, '[Ember] blog post drafted (pending_review)');
    return { postId: row.id, title, slug: row.slug, status: row.status };
  }

  async publishBlogPost(input: PublishBlogInput, options?: AgentRunOptions) {
    if (!input.postId) throw new Error('publish_blog_post: postId required');
    if (options?.dryRun) return { dryRun: true, would: 'publish', postId: input.postId };

    const [row] = await db
      .update(blogPosts)
      .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(blogPosts.id, input.postId))
      .returning();

    if (!row) throw new Error(`publish_blog_post: post ${input.postId} not found`);
    logger.info({ postId: row.id }, '[Ember] blog post published');
    return { postId: row.id, status: row.status, publishedAt: row.publishedAt };
  }

  // ─────────────────────────────────────────────────────────
  // Google Business (GMB) — draft only until API is approved
  // ─────────────────────────────────────────────────────────
  async generateGmbPost(options?: AgentRunOptions) {
    const systemPrompt = `You are Ember Lane, content lead for LervIT.
Write a Google Business Profile post — short, useful, locally relevant.

${LERVIT_BRAND}

Rules:
- 100-300 words
- Plain text, no markdown, no emoji fireworks (1-2 max)
- Include a soft CTA (call, quote, promo LERVIT10)
- Reference Calgary specifically

CRITICAL: Return the post body ONLY.
No markdown. No code fences.
No backticks. No preface. No JSON.`;

    const userMessage = `Draft this week's LervIT Google Business post. Angle can be a moving tip, a
neighbourhood spotlight, or a booking-friendly reminder. Keep it fresh vs prior weeks.`;

    if (options?.dryRun) return { dryRun: true, would: 'generate_gmb_post' };

    const content = (await this.callAnthropic(systemPrompt, userMessage, 800)).trim();
    if (!content) throw new Error('Ember: GMB content was empty');

    const [row] = await db
      .insert(gmbPosts)
      .values({ content, postType: 'STANDARD', status: 'pending' })
      .returning();

    logger.info({ gmbPostId: row.id }, '[Ember] GMB post drafted (pending manual post)');
    return { gmbPostId: row.id, status: row.status, contentPreview: content.slice(0, 120) };
  }

  // ─────────────────────────────────────────────────────────
  // Reviews
  // ─────────────────────────────────────────────────────────
  async respondToReview(input: RespondToReviewInput, options?: AgentRunOptions) {
    if (!input.reviewId) throw new Error('respond_to_review: reviewId required');

    const rows = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        bookingId: reviews.bookingId,
        customerName: users.name,
      })
      .from(reviews)
      .innerJoin(bookings, eq(bookings.id, reviews.bookingId))
      .innerJoin(users, eq(users.id, reviews.customerId))
      .where(eq(reviews.id, input.reviewId))
      .limit(1);

    const review = rows[0];
    if (!review) throw new Error(`respond_to_review: review ${input.reviewId} not found`);

    // Rating <= 3 → escalate to Xavier; John handles personally.
    if (review.rating <= 3) {
      if (options?.dryRun) {
        return { dryRun: true, would: 'escalate_low_rating', reviewId: review.id, rating: review.rating };
      }
      try {
        await xavier.run('escalate', {
          issue: `Low rating (${review.rating}★) needs a personal response from John`,
          severity: 'high',
          agentName: 'Ember Lane',
          data: {
            reviewId: review.id,
            rating: review.rating,
            comment: review.comment,
            bookingId: review.bookingId,
            customerName: review.customerName,
          },
        });
      } catch (err) {
        logger.error({ err, reviewId: review.id }, '[Ember] xavier escalation failed');
      }
      return { escalated: true, reviewId: review.id, rating: review.rating };
    }

    // Rating 4-5 → warm response for admin to post.
    const systemPrompt = `You are the LervIT team responding to a happy customer's Google review.
Voice: warm, gracious, specific — reference details from THEIR review so it never feels canned.
Sign off exactly: "— The LervIT Team".

${LERVIT_BRAND}

Rules:
- 40-80 words
- No promo codes, no upsell
- One reference to their specific review content
- No emojis

Return the reply text ONLY.`;

    const userMessage = `<data>
Customer: ${sanitizeForPrompt(review.customerName, 'name')}
Rating: ${review.rating}★
Their review: ${sanitizeForPrompt(review.comment ?? '(no comment)', 'review')}
</data>`;

    if (options?.dryRun) {
      return { dryRun: true, would: 'respond', reviewId: review.id, rating: review.rating };
    }

    const reply = (await this.callAnthropic(systemPrompt, userMessage, 400)).trim();
    logger.info({ reviewId: review.id, rating: review.rating }, '[Ember] review response drafted');
    return { reviewId: review.id, rating: review.rating, reply };
  }

  // ─────────────────────────────────────────────────────────
  // Social
  // ─────────────────────────────────────────────────────────
  async generateSocialContent(input: GenerateSocialInput, options?: AgentRunOptions) {
    const platforms: SocialPlatform[] = input.platform
      ? [input.platform]
      : SOCIAL_PLATFORMS;

    if (options?.dryRun) {
      return { dryRun: true, would: 'generate_social_content', platforms };
    }

    const results: Array<{ id: string; platform: SocialPlatform; contentPreview: string }> = [];

    for (const platform of platforms) {
      const systemPrompt = `You are Ember Lane, social lead for LervIT.
Write a ${platform} post following these rules:

${SOCIAL_GUIDES[platform]}

${LERVIT_BRAND}

CRITICAL: Respond with ONLY raw JSON.
No markdown. No code fences.
No backticks. No explanation.
Start your response with { directly.

{ "content": string, "hashtags": string[] }${CREATIVEOS_APPENDIX}`;

      const userMessage = `Draft today's ${platform} post. Angle: helpful moving content that lands with a Calgary audience.`;

      const raw = await this.callAnthropic(systemPrompt, userMessage, 1200);
      const parsed = this.parseJson(raw);

      const content: string = String(parsed.content ?? '').trim();
      if (!content) throw new Error(`Ember: ${platform} content was empty`);

      const hashtags = Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map((h: any) => String(h).replace(/^#/, ''))
        : null;

      const [row] = await db
        .insert(socialPosts)
        .values({ platform, content, hashtags, status: 'draft' })
        .returning();

      results.push({ id: row.id, platform, contentPreview: content.slice(0, 100) });
    }

    // Alert Xavier so John sees "Ember: N social posts ready for review".
    try {
      await xavier.run('escalate', {
        issue: `Ember: ${results.length} social post${results.length === 1 ? '' : 's'} ready for review`,
        severity: 'low',
        agentName: 'Ember Lane',
        data: { platforms: results.map((r) => r.platform), count: results.length },
      });
    } catch (err) {
      logger.error({ err }, '[Ember] xavier review nudge failed');
    }

    logger.info({ count: results.length, platforms }, '[Ember] social posts drafted');
    return { count: results.length, posts: results };
  }

  // ─────────────────────────────────────────────────────────
  // Newsletter (draft only — John sends via Resend manually)
  // ─────────────────────────────────────────────────────────
  async generateNewsletter(options?: AgentRunOptions) {
    const systemPrompt = `You are Ember Lane, newsletter editor for LervIT.
Draft this month's LervIT newsletter for Calgary customers.

${LERVIT_BRAND}

Include:
1. Moving tip of the month
2. Calgary spotlight (neighbourhood, event, or seasonal note)
3. Company update (features, mover count, milestones — you can be tasteful/vague)
4. LERVIT10 promo mention

CRITICAL: Respond with ONLY raw JSON.
No markdown. No code fences.
No backticks. No explanation.
Start your response with { directly.

{
  "subject": string (<= 60 chars, no emoji, curiosity-driven),
  "preheader": string (<= 100 chars),
  "html": string (clean transactional HTML — <h1>/<h2>/<p>/<ul>/<a> only; no styles, no <html>/<head>/<body>)
}`;

    const userMessage = `Draft the ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })} newsletter.`;

    if (options?.dryRun) return { dryRun: true, would: 'generate_newsletter' };

    const raw = await this.callAnthropic(systemPrompt, userMessage, 3500);
    const parsed = this.parseJson(raw);

    const subject = String(parsed.subject ?? '').slice(0, 200);
    const preheader = String(parsed.preheader ?? '');
    const html = String(parsed.html ?? '');
    if (!subject || !html) throw new Error('Ember: newsletter subject or html was empty');

    logger.info({ subject }, '[Ember] newsletter drafted (not sent)');
    return { subject, preheader, html, sent: false, notice: 'Draft only — John sends via Resend' };
  }

  // ─────────────────────────────────────────────────────────
  // Phase 2 — Campaigns (multi-item content strategy)
  // ─────────────────────────────────────────────────────────
  async createCampaign(input: CreateCampaignInput, options?: AgentRunOptions) {
    if (!input.name || !input.objective || !input.audience) {
      throw new Error('create_campaign: name, objective, and audience are required');
    }

    if (options?.dryRun) {
      return { dryRun: true, would: 'create_campaign', input };
    }

    const platformsList = input.platforms ?? ['instagram', 'tiktok', 'facebook'];
    const platformCount = platformsList.length;
    const minItems = Math.max(3, platformCount * 3);
    const maxItems = Math.min(12, Math.max(minItems, platformCount * 4));

    const systemPrompt = `You are Ember Lane, LervIT's creative strategist.
Create a content plan for a LervIT marketing campaign.

${LERVIT_BRAND}

CONTENT TYPES AVAILABLE:
  heygen_video     — presenter/explainer with a talking avatar
  higgsfield_video — cinematic/lifestyle B-roll style
  social           — text + caption for social feed
  blog             — SEO article on lervit.com/blog
  gmb              — Google My Business post
  newsletter       — email

CRITICAL: Your response must be ONLY
this exact JSON structure with no
other fields:

{
  "strategy": "One sentence max",
  "contentPillars": [
    "Pillar 1",
    "Pillar 2",
    "Pillar 3"
  ],
  "items": [
    {
      "type": "higgsfield_video",
      "objective": "awareness",
      "platform": "instagram",
      "concept": "Max 80 chars",
      "week": 1,
      "aspectRatio": "9:16",
      "generator": "higgsfield"
    },
    {
      "type": "heygen_video",
      "objective": "education",
      "platform": "facebook",
      "concept": "Max 80 chars",
      "week": 2,
      "aspectRatio": "16:9",
      "generator": "heygen"
    }
  ]
}

The "items" array MUST have ${minItems}-${maxItems} items.
Distribute items evenly across these platforms: ${platformsList.join(', ')}.
For a single platform, cap at ${minItems} items (avoid over-posting to one channel).
For 3+ platforms, you may use up to ${maxItems} items total.
Do NOT include campaign name, objective,
audience, or offer in the response.
Only strategy, contentPillars, items.
No newlines inside string values.
All strings under 100 characters.${CREATIVEOS_APPENDIX}`;

    const safeName = sanitizeForPrompt(input.name, 'title');
    const safeObjective = sanitizeForPrompt(input.objective, 'description');
    const safeAudience = sanitizeForPrompt(input.audience, 'description');
    const safeOffer = sanitizeForPrompt(input.offer ?? 'LERVIT10', 'title');

    const userMessage = `Create a content plan for this campaign.
Return ONLY the JSON with strategy,
contentPillars, and items fields.

Campaign details (do not repeat these
in your response):
<data>
Name: ${safeName}
Objective: ${safeObjective}
Audience: ${safeAudience}
Offer: ${safeOffer}
Platforms: ${platformsList.join(', ')}
Duration: ${input.durationDays ?? 30} days
</data>`;

    const raw = await this.callAnthropic(systemPrompt, userMessage, 2000);

    logger.info(
      {
        rawLength: raw.length,
        rawPreview: raw.slice(0, 200),
      },
      '[Ember] Campaign plan raw response',
    );

    let plan: any;
    try {
      const parsed = this.parseJson(raw);
      plan = Array.isArray(parsed) ? { items: parsed, strategy: '' } : parsed;

      // Claude sometimes wraps the whole response in a second ```json fence
      // inside the strategy field. If items came back empty but strategy
      // looks parseable, use the inner object.
      if ((!plan.items || plan.items.length === 0) && plan.strategy) {
        try {
          const inner = this.parseJson(String(plan.strategy));
          const innerObj = Array.isArray(inner) ? { items: inner } : inner;
          if (innerObj.items?.length > 0) {
            plan = { ...plan, ...innerObj };
          }
        } catch {
          // Keep outer plan
        }
      }
    } catch {
      logger.error('[Ember] Failed to parse campaign plan JSON');
      plan = { items: [], strategy: raw };
    }

    // Fallback: regex-extract items array if parsing left us empty-handed.
    if (!Array.isArray(plan.items) || plan.items.length === 0) {
      const itemsMatch = raw.match(/"items"\s*:\s*(\[[\s\S]*?\])/);
      if (itemsMatch) {
        try {
          plan.items = JSON.parse(itemsMatch[1]);
        } catch {
          // Leave plan.items as-is
        }
      }
    }

    const [campaign] = await db
      .insert(campaigns)
      .values({
        name: input.name,
        objective: input.objective,
        audience: input.audience,
        offer: input.offer ?? null,
        platforms: platformsList,
        durationDays: input.durationDays ?? 30,
        status: 'draft',
        contentPlan: plan,
        createdBy: 'ember',
      })
      .returning();

    if (Array.isArray(plan.items) && plan.items.length > 0) {
      await db.insert(contentItems).values(
        plan.items.map((item: any) => ({
          campaignId: campaign.id,
          type: String(item.type ?? 'social'),
          objective: item.objective ? String(item.objective) : null,
          platform: item.platform ? String(item.platform) : null,
          status: 'draft',
          creativeBrief: item,
          aspectRatio: item.aspectRatio ? String(item.aspectRatio) : null,
          generator: item.generator ? String(item.generator) : null,
          cta: item.cta ? String(item.cta) : null,
        })),
      );
    }

    await emitEvent(
      'ember.campaign_created',
      'agent',
      'ember',
      {
        campaignId: campaign.id,
        name: campaign.name,
        itemCount: plan.items?.length ?? 0,
      },
      'agent',
    );

    // Nudge Xavier so admins see the new campaign in the daily brief.
    await xavier
      .run('escalate', {
        issue: `New campaign draft: "${campaign.name}" — ${plan.items?.length ?? 0} content items ready for review`,
        severity: 'low',
        agentName: 'Ember Lane',
        data: { campaignId: campaign.id },
      })
      .catch(() => {});

    return {
      created: true,
      campaignId: campaign.id,
      name: campaign.name,
      itemCount: plan.items?.length ?? 0,
      strategy: plan.strategy ?? null,
    };
  }

  async generateVideoScript(input: GenerateVideoScriptInput, options?: AgentRunOptions) {
    if (!input.contentItemId) throw new Error('generate_video_script: contentItemId required');
    if (options?.dryRun) return { dryRun: true, would: 'generate_video_script', input };

    const [item] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, input.contentItemId))
      .limit(1);

    if (!item) return { error: 'item_not_found' };

    const brief = (item.creativeBrief ?? {}) as any;
    const concept = sanitizeForPrompt(
      input.concept ?? brief.concept ?? 'LervIT moving service in Calgary',
      'description',
    );
    const durationSec = input.duration ?? 30;
    const audience = sanitizeForPrompt(
      input.audience ?? 'Calgary residents planning a small or same-day move',
      'description',
    );

    const systemPrompt = `You are Ember Lane, LervIT's script writer.
Write a video script for LervIT Moving in Calgary.

${LERVIT_BRAND}

RULES:
- Natural, conversational language.
- Short sentences.
- No invented features, prices, testimonials, or statistics.
- End with a clear CTA.
- Paced for ~${durationSec} seconds (roughly ${Math.max(30, durationSec * 2.5)} words).
- Audience: ${audience}.

CRITICAL: Respond with ONLY raw JSON.
No markdown. No code fences.
No backticks. No explanation.
Start your response with { directly.

{
  "script": "full spoken script, one paragraph",
  "hook": "first line hook",
  "cta": "call to action line",
  "estimatedDuration": ${durationSec},
  "scenes": [
    { "time": "0-5s", "text": "line spoken here", "direction": "visual direction note" }
  ]
}${CREATIVEOS_APPENDIX}`;

    const userMessage = `Write a script for: ${concept}`;

    const raw = await this.callAnthropic(systemPrompt, userMessage, 800);

    let parsed: any;
    try {
      parsed = this.parseJson(raw);
    } catch {
      return { error: 'parse_failed' };
    }

    await db
      .update(contentItems)
      .set({
        script: String(parsed.script ?? ''),
        cta: parsed.cta ? String(parsed.cta) : null,
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, input.contentItemId));

    return {
      generated: true,
      contentItemId: input.contentItemId,
      script: parsed.script,
      hook: parsed.hook,
      cta: parsed.cta,
      scenes: parsed.scenes,
    };
  }

  async generateCreativeBrief(input: GenerateCreativeBriefInput, options?: AgentRunOptions) {
    if (!input.contentItemId) throw new Error('generate_creative_brief: contentItemId required');
    if (options?.dryRun) return { dryRun: true, would: 'generate_creative_brief', input };

    const [item] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, input.contentItemId))
      .limit(1);

    if (!item) return { error: 'item_not_found' };

    const existing = (item.creativeBrief ?? {}) as any;
    const concept = sanitizeForPrompt(
      input.concept ?? existing.concept ?? 'LervIT moving service in Calgary',
      'description',
    );

    const systemPrompt = `You are Ember Lane, LervIT's creative director.
Write a directorial brief for a piece of video/social content.

${LERVIT_BRAND}

Output STRICT JSON only — no prose, no markdown fence:
{
  "concept": "one-sentence creative concept",
  "mood": "adjectives describing tone",
  "palette": ["#hex1", "#hex2"],
  "visualStyle": "one sentence — camera, lighting, composition",
  "audio": "music/sfx direction",
  "textOverlays": ["on-screen text 1", "on-screen text 2"],
  "callout": "the single line viewers should remember"
}${CREATIVEOS_APPENDIX}`;

    const userMessage = `Brief the visual/tonal direction for: ${concept}
Platform: ${item.platform ?? 'social'}
Type: ${item.type}`;

    const raw = await this.callAnthropic(systemPrompt, userMessage, 800);

    let parsed: any;
    try {
      parsed = this.parseJson(raw);
    } catch {
      return { error: 'parse_failed' };
    }

    // Merge into existing brief rather than replacing (createCampaign put concept/week/etc there).
    const merged = { ...existing, ...parsed };

    await db
      .update(contentItems)
      .set({ creativeBrief: merged, updatedAt: new Date() })
      .where(eq(contentItems.id, input.contentItemId));

    return {
      generated: true,
      contentItemId: input.contentItemId,
      brief: merged,
    };
  }

  async generateHeygenVideo(input: GenerateHeygenVideoInput, options?: AgentRunOptions) {
    if (!input.contentItemId) throw new Error('generate_heygen_video: contentItemId required');
    if (options?.dryRun) return { dryRun: true, would: 'generate_heygen_video', input };

    const [item] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, input.contentItemId))
      .limit(1);

    if (!item) return { error: 'item_not_found' };

    const script = input.script ?? item.script;
    if (!script) {
      return { error: 'no_script', message: 'Generate script first via generate_video_script' };
    }

    await db
      .update(contentItems)
      .set({ status: 'generating', updatedAt: new Date() })
      .where(eq(contentItems.id, input.contentItemId));

    try {
      const job = await heygenProvider.createVideo({
        script,
        aspectRatio: (item.aspectRatio as any) ?? '9:16',
        caption: true,
        title: `LervIT - ${item.id}`,
      });

      await db
        .update(contentItems)
        .set({ providerJobId: job.jobId, generator: 'heygen', updatedAt: new Date() })
        .where(eq(contentItems.id, input.contentItemId));

      logger.info({ jobId: job.jobId, contentItemId: input.contentItemId }, '[Ember] HeyGen job started');

      const result = await heygenProvider.waitForCompletion(job.jobId);

      await db
        .update(contentItems)
        .set({
          status: result.status === 'completed' ? 'qa' : 'failed',
          videoUrl: result.videoUrl ?? null,
          thumbnailUrl: result.thumbnailUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, input.contentItemId));

      await emitEvent(
        'ember.heygen_video_complete',
        'agent',
        'ember',
        {
          contentItemId: input.contentItemId,
          jobId: job.jobId,
          videoUrl: result.videoUrl,
          status: result.status,
        },
        'agent',
      );

      return {
        generated: result.status === 'completed',
        contentItemId: input.contentItemId,
        jobId: job.jobId,
        videoUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl,
        status: result.status,
      };
    } catch (err: any) {
      await db
        .update(contentItems)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(contentItems.id, input.contentItemId));
      logger.error({ err }, '[Ember] HeyGen video failed');
      return { error: true, message: err?.message ?? String(err) };
    }
  }

  async generateHiggsfieldVideo(input: GenerateHiggsfieldVideoInput, options?: AgentRunOptions) {
    if (!input.contentItemId) throw new Error('generate_higgsfield_video: contentItemId required');
    if (options?.dryRun) return { dryRun: true, would: 'generate_higgsfield_video', input };

    const [item] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, input.contentItemId))
      .limit(1);

    if (!item) return { error: 'item_not_found' };

    const brief = (item.creativeBrief ?? {}) as any;
    const prompt = input.prompt ?? brief?.concept ?? 'Calgary moving lifestyle scene';

    await db
      .update(contentItems)
      .set({ status: 'generating', updatedAt: new Date() })
      .where(eq(contentItems.id, input.contentItemId));

    try {
      const job = await higgsfieldProvider.createVideo({
        prompt: `${prompt}. Cinematic, premium, urban Calgary. Professional lighting.`,
        aspectRatio: (item.aspectRatio as any) ?? '9:16',
        duration: input.duration ?? 5,
        style: input.style ?? 'cinematic',
      });

      await db
        .update(contentItems)
        .set({ providerJobId: job.jobId, generator: 'higgsfield', updatedAt: new Date() })
        .where(eq(contentItems.id, input.contentItemId));

      const result = await higgsfieldProvider.waitForCompletion(job.jobId);

      await db
        .update(contentItems)
        .set({
          status: result.status === 'completed' ? 'qa' : 'failed',
          videoUrl: result.videoUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, input.contentItemId));

      await emitEvent(
        'ember.higgsfield_video_complete',
        'agent',
        'ember',
        {
          contentItemId: input.contentItemId,
          videoUrl: result.videoUrl,
          status: result.status,
        },
        'agent',
      );

      return {
        generated: result.status === 'completed',
        contentItemId: input.contentItemId,
        jobId: job.jobId,
        videoUrl: result.videoUrl,
        status: result.status,
      };
    } catch (err: any) {
      await db
        .update(contentItems)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(contentItems.id, input.contentItemId));
      logger.error({ err }, '[Ember] Higgsfield video failed');
      return { error: true, message: err?.message ?? String(err) };
    }
  }

  async runQA(input: RunQAInput, options?: AgentRunOptions) {
    if (!input.contentItemId) throw new Error('run_qa: contentItemId required');

    const [item] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, input.contentItemId))
      .limit(1);

    if (!item) return { error: 'item_not_found' };

    const systemPrompt = `You are LervIT's content QA reviewer.
Review content against brand guidelines and flag anything that breaks them.

BRAND RULES:
- Tone: smart, modern, clear, reassuring, human.
- Never invent features, prices, testimonials, statistics.
- Never say "best in Calgary" without proof.
- Always use approved promo codes only (LERVIT10 is approved).
- "Snap. Book. Track." is the tagline.
- lervit.com is the website.

CRITICAL: Respond with ONLY raw JSON.
No markdown. No code fences.
No backticks. No explanation.
Start your response with { directly.

{
  "passed": true,
  "brandQA":   { "passed": true, "issues": [] },
  "claimsQA":  { "passed": true, "issues": [] },
  "productQA": { "passed": true, "issues": [] },
  "recommendation": "approve"
}
recommendation must be one of: "approve", "revise", "reject".`;

    const userMessage = `Review this content:
Script: ${item.script ?? 'N/A'}
Caption: ${item.caption ?? 'N/A'}
CTA: ${item.cta ?? 'N/A'}
Type: ${item.type}
Platform: ${item.platform ?? 'N/A'}`;

    const raw = await this.callAnthropic(systemPrompt, userMessage, 600);

    let qaResults: any;
    try {
      qaResults = this.parseJson(raw);
    } catch {
      qaResults = { passed: false, error: 'parse_failed', raw };
    }

    if (options?.dryRun) {
      return { dryRun: true, qaResults };
    }

    await db
      .update(contentItems)
      .set({
        qaResults,
        status: qaResults.passed ? 'approved' : 'draft',
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, input.contentItemId));

    return {
      contentItemId: input.contentItemId,
      qaResults,
      status: qaResults.passed ? 'approved' : 'needs_revision',
    };
  }

  async getCampaignStatus(input: GetCampaignStatusInput, _options?: AgentRunOptions) {
    if (!input.campaignId) throw new Error('get_campaign_status: campaignId required');

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, input.campaignId))
      .limit(1);

    if (!campaign) return { error: 'campaign_not_found' };

    const items = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.campaignId, input.campaignId));

    const byStatus = items.reduce<Record<string, number>>((acc, item) => {
      const key = item.status ?? 'unknown';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      campaign,
      itemCount: items.length,
      byStatus,
      items: items.map((i) => ({
        id: i.id,
        type: i.type,
        platform: i.platform,
        status: i.status,
        videoUrl: i.videoUrl,
        generator: i.generator,
      })),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Distribution — Meta (Facebook + Instagram)
  // ─────────────────────────────────────────────────────────
  async publishToSocial(input: PublishToSocialInput, options?: AgentRunOptions) {
    if (!input.contentItemId) throw new Error('publish_to_social: contentItemId required');

    const [item] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, input.contentItemId))
      .limit(1);

    if (!item) return { error: 'item_not_found' };

    if (item.status !== 'published' && item.status !== 'approved') {
      return {
        error: 'not_approved',
        message: 'Item must be approved before publishing',
        status: item.status,
      };
    }

    const platform = item.platform as 'facebook' | 'instagram' | 'linkedin';
    if (platform !== 'facebook' && platform !== 'instagram' && platform !== 'linkedin') {
      return {
        error: 'unsupported_platform',
        message: `Supported platforms: facebook | instagram | linkedin (got: ${platform ?? 'null'})`,
      };
    }

    if (options?.dryRun) {
      return {
        dryRun: true,
        would: 'publish_to_social',
        platform,
        contentItemId: input.contentItemId,
      };
    }

    const caption = item.caption ?? item.script?.slice(0, 200) ?? '';

    let results: Array<{ postId: string; platform: string; url?: string; error?: string }>;

    if (platform === 'linkedin') {
      const result = await linkedInProvider.post({
        text: caption,
        url: item.videoUrl ?? undefined,
        title: 'LervIT Moving Calgary',
        description: caption.slice(0, 200),
      });
      results = [
        {
          postId: result.postId,
          platform: 'linkedin',
          url: result.url,
          error: result.error,
        },
      ];
    } else {
      results = await metaProvider.publish({
        message: caption,
        videoUrl: item.videoUrl ?? undefined,
        hashtags: item.hashtags ?? [],
        platform,
      });
    }

    const first = results[0];
    const success = !!first && !first.error && !!first.postId;

    if (success) {
      await db
        .update(contentItems)
        .set({
          status: 'posted',
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, input.contentItemId));

      await emitEvent(
        'ember.content_posted',
        'agent',
        'ember',
        {
          contentItemId: input.contentItemId,
          platform,
          postId: first.postId,
          url: first.url,
        },
        'agent',
      );

      logger.info(
        {
          contentItemId: input.contentItemId,
          platform,
          postId: first.postId,
        },
        '[Ember] Content posted',
      );
    } else {
      logger.error(
        {
          contentItemId: input.contentItemId,
          platform,
          error: first?.error,
        },
        '[Ember] publish_to_social failed',
      );
    }

    return {
      success,
      platform,
      results,
      contentItemId: input.contentItemId,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Anthropic helpers
  // ─────────────────────────────────────────────────────────
  private async callAnthropic(
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
  ): Promise<string> {
    // Every Ember Claude call gets the jailbreak-defense preamble prepended
    // so persona hardening applies to all 9 content generators without
    // per-site edits. Individual generators still sanitize user-supplied
    // topic/concept/etc before embedding them in the user message.
    const response = await this.anthropic.messages.create({
      model: EMBER_MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      system: `${JAILBREAK_PREAMBLE}\n\n${systemPrompt}`,
      messages: [{ role: 'user', content: userMessage }],
    });
    const first = response.content[0];
    return first && first.type === 'text' ? first.text : '';
  }

  private parseJson(raw: string): any {
    // Strip ALL backtick fences anywhere (not just at line start).
    let clean = raw
      .replace(/`{3}json\s*/gi, '')
      .replace(/`{3}\s*/gi, '')
      .trim();

    const objStart = clean.indexOf('{');
    const arrStart = clean.indexOf('[');

    let jsonStr: string;

    if (arrStart !== -1 &&
        (objStart === -1 || arrStart < objStart)) {
      const end = clean.lastIndexOf(']');
      jsonStr = end !== -1
        ? clean.slice(arrStart, end + 1)
        : clean.slice(arrStart);
    } else if (objStart !== -1) {
      const end = clean.lastIndexOf('}');
      jsonStr = end !== -1
        ? clean.slice(objStart, end + 1)
        : clean.slice(objStart);
    } else {
      throw new Error('No JSON found in response');
    }

    try {
      return JSON.parse(jsonStr);
    } catch (e1) {
      try {
        const sanitized = jsonStr
          .replace(/[‘’]/g, "'")
          .replace(/[“”]/g, '"');
        return JSON.parse(sanitized);
      } catch {
        // Last resort — extract items array.
        const m = jsonStr.match(/"items"\s*:\s*(\[[\s\S]*?\])/);
        if (m) {
          try {
            return { items: JSON.parse(m[1]) };
          } catch {}
        }
        throw new Error(`Parse failed: ${(e1 as Error).message}`);
      }
    }
  }
}

export const ember = new EmberAgent();
