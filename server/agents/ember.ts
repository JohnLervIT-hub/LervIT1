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
 *     - `generate_trend_post`        : social copy grounded in the last 7 days of
 *                                       real leads/bookings → social_posts (status='draft')
 *     - `generate_newsletter`        : monthly newsletter draft → newsletters (status='pending_review')
 *     - `publish_blog_post`          : flip a pending_review blog post to 'published' (public /blog picks up)
 *
 *   Phase 2 — Campaigns + video (HeyGen presenter, Higgsfield cinematic):
 *     - `create_campaign`            : plan a multi-item campaign → campaigns + content_items rows
 *     - `generate_creative_brief`    : write directorial brief onto a content_items row
 *     - `generate_video_script`      : write a video script onto a content_items row
 *     - `generate_heygen_video`      : submit script to HeyGen, wait, save video_url
 *     - `generate_higgsfield_video`  : submit prompt to Higgsfield (async — APEX polls status)
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
import { and, desc, eq, gte } from 'drizzle-orm';
import { BaseAgent, type AgentRunOptions } from './base';
import { db } from '../db';
import { blogPosts, gmbPosts, socialPosts, newsletters, reviews, googleReviews, users, bookings, leads, campaigns, contentItems } from '@shared/schema';
import { notifySitemapRegenerate } from '../utils/sitemap';
import { xavier } from './xavier';
import { logger } from '../logger';
import { emitEvent } from '../events';
import { JAILBREAK_PREAMBLE, sanitizeForPrompt } from '../lib/promptSanitizer';
import { heygenProvider } from '../providers/heygen';
import { higgsfieldProvider } from '../providers/higgsfield';
import { isGmbConfigured, replyToReview } from '../lib/gmbClient';
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
- LinkedIn: linkedin.com/company/lervit-technologies
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

// ─── Trend posts (grounded in real LervIT activity) ──────────
// generate_trend_post is the only content action that reads live operational
// data. Everything it can cite has to survive the brand QA rule "never invent
// statistics", so the numbers are computed here and the model is told it may
// only repeat figures present in the payload.

const TREND_WINDOW_DAYS = 7;

// Below this many bookings in the window, a weekly average is noise — the
// snapshot ships without figures and the prompt forbids citing any.
const TREND_MIN_BOOKINGS_FOR_STATS = 5;

// Pickup addresses are free text. Bucketing against a fixed list (rather than
// parsing whatever the customer typed) keeps customer-supplied strings out of
// the prompt entirely — an area only appears if it matches one of these.
const CALGARY_AREAS = [
  'Beltline', 'Downtown', 'Bridgeland', 'Kensington', 'Mahogany', 'Cranston',
  'Sunnyside', 'Mission', 'Inglewood', 'Marda Loop', 'Altadore', 'Tuscany',
  'Evanston', 'Auburn Bay', 'Seton', 'Sage Hill', 'Airdrie', 'Cochrane',
  'Okotoks', 'Chestermere',
] as const;

const CALGARY_QUADRANTS = ['NW', 'NE', 'SW', 'SE'] as const;

interface TrendSnapshot {
  windowDays: number;
  leadCount: number;
  leadSources: Array<{ label: string; count: number }>;
  bookingCount: number;
  topAreas: Array<{ label: string; count: number }>;
  loadSizes: Array<{ label: string; count: number }>;
  busiestDays: Array<{ label: string; count: number }>;
  averagePrice: number | null;
  /** False when the window is too thin to quote figures honestly. */
  hasStats: boolean;
}

interface GenerateTrendInput {
  platforms?: SocialPlatform[];
}

// Extra framing layered on top of SOCIAL_GUIDES for the trend angle.
const TREND_ANGLES: Record<SocialPlatform, string> = {
  linkedin: `Write about trends in the local Calgary moving market.
B2B angle for property managers, HR teams, and corporate relocation leads.
Cover neighbourhood trends, demand patterns, and one genuine insight.`,
  instagram: `Write about moving trends in Calgary this week.
Helpful, local angle — what neighbours are actually doing right now.`,
  facebook: `Write about what moving looked like across Calgary this week.
Community angle — helpful and neighbourly, not a sales pitch.`,
  tiktok: `Open on the most surprising thing in this week's Calgary moving data.
Punchy and specific.`,
};

function topCounts(values: Array<string | null | undefined>, limit: number) {
  const tally = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim();
    if (!key) continue;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

/** Bucket a free-text pickup address to a known area, or a Calgary quadrant. */
function bucketArea(address: string | null | undefined): string | null {
  if (!address) return null;
  const haystack = address.toLowerCase();

  for (const area of CALGARY_AREAS) {
    if (haystack.includes(area.toLowerCase())) return area;
  }

  const quadrant = address.match(/\b(NW|NE|SW|SE)\b/i)?.[1]?.toUpperCase();
  if (quadrant && (CALGARY_QUADRANTS as readonly string[]).includes(quadrant)) {
    return `Calgary ${quadrant}`;
  }

  return null;
}

interface GenerateBlogInput {
  topic?: string;
  category?: string;
  // When set, mirror the drafted post's excerpt/first paragraph onto this
  // campaign content_items row so the item stops reading as empty in admin.
  // The post itself still lands in blog_posts as the source of truth.
  contentItemId?: string;
}

interface GenerateSocialInput {
  platform?: SocialPlatform;
  // When set, persist the generated copy onto this campaign content_items row
  // (caption/hashtags/cta/status) instead of inserting a new social_posts row.
  contentItemId?: string;
  topic?: string;
  tone?: string;
  cta?: string;
}

interface GenerateGmbInput {
  // When set, the generated post is also written onto this campaign
  // content_items row (caption/status) so the item stops being a dead draft.
  contentItemId?: string;
  topic?: string;
}

interface RespondToReviewInput {
  /** In-app review (reviews table). Drafted and stored; not on Google. */
  reviewId?: string;
  /**
   * Synced Google review (google_reviews table). Drafted, posted to Google
   * via the GMB API, then stored. Exactly one of reviewId/googleReviewId.
   */
  googleReviewId?: string;
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
  hook?: string;
  platform?: string;
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

/**
 * Pick a blog topic that has not been written yet.
 *
 * `blog_posts.slug` is UNIQUE, so re-picking a covered topic used to surface
 * as an insert failure on the Monday cron. Claude rewrites both the title and
 * the slug ("no stopwords"), so an exact match is not guaranteed — we compare
 * the slugified topic against every stored slug AND every slugified title, and
 * generateBlogPost still guards the slug itself before inserting.
 */
async function pickTopic(): Promise<string> {
  let used = new Set<string>();

  try {
    const existing = await db
      .select({ slug: blogPosts.slug, title: blogPosts.title })
      .from(blogPosts);

    used = new Set(
      existing.flatMap((p) => [p.slug, slugify(p.title)]).filter(Boolean),
    );
  } catch (err) {
    // A read failure should not block the weekly draft — fall back to random.
    logger.error({ err }, '[Ember] blog topic dedupe query failed');
  }

  const available = BLOG_TOPICS.filter((t) => !used.has(slugify(t)));

  if (available.length === 0) {
    logger.warn(
      { topics: BLOG_TOPICS.length },
      '[Ember] all blog topics used — reusing the list (add new topics to BLOG_TOPICS)',
    );
    return BLOG_TOPICS[Math.floor(Math.random() * BLOG_TOPICS.length)];
  }

  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Return a slug that no blog post holds yet, suffixing -2, -3, ... on collision.
 * Claude picks the slug, so it can collide even when the topic is fresh.
 */
async function uniqueSlug(base: string): Promise<string> {
  const root = (base || 'lervit-post').slice(0, 76);

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const [clash] = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.slug, candidate))
      .limit(1);
    if (!clash) return candidate;
  }

  return `${root}-${Date.now().toString(36)}`;
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
        return this.generateGmbPost(input as GenerateGmbInput, options);
      case 'respond_to_review':
        return this.respondToReview(input as RespondToReviewInput, options);
      case 'generate_social_content':
        return this.generateSocialContent(input as GenerateSocialInput, options);
      case 'generate_trend_post':
        return this.generateTrendPost(input as GenerateTrendInput, options);
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
    const topic = sanitizeForPrompt(input.topic?.trim() || (await pickTopic()), 'description');
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
    const slug: string = await uniqueSlug(
      String(parsed.slug ?? slugify(title)) || slugify(title),
    );
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

    // A campaign blog item is otherwise left blank forever: nothing else writes
    // caption/script for type='blog', so admin shows it with no body text and no
    // generate button (that button is gated to video/social types).
    if (input.contentItemId) {
      const excerpt = row.excerpt ?? title;
      await db
        .update(contentItems)
        .set({
          caption: excerpt,
          script: sections[0]?.paragraphs?.[0] ?? excerpt,
          status: 'ready',
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, input.contentItemId));

      logger.info(
        { contentItemId: input.contentItemId, postId: row.id },
        '[Ember] campaign blog item populated',
      );
    }

    logger.info({ postId: row.id, title, sections: sections.length, faq: faq.length }, '[Ember] blog post drafted (pending_review)');
    return {
      postId: row.id,
      title,
      slug: row.slug,
      status: row.status,
      contentItemId: input.contentItemId ?? null,
    };
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
    notifySitemapRegenerate(`ember_publish:${row.slug}`);
    return { postId: row.id, status: row.status, publishedAt: row.publishedAt };
  }

  // ─────────────────────────────────────────────────────────
  // Google Business (GMB) — draft only until API is approved
  // ─────────────────────────────────────────────────────────
  async generateGmbPost(input: GenerateGmbInput = {}, options?: AgentRunOptions) {
    const topic = input.topic?.trim()
      ? sanitizeForPrompt(input.topic.trim(), 'description')
      : null;

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

    const userMessage = topic
      ? `Draft a LervIT Google Business post on: ${topic}.`
      : `Draft this week's LervIT Google Business post. Angle can be a moving tip, a
neighbourhood spotlight, or a booking-friendly reminder. Keep it fresh vs prior weeks.`;

    if (options?.dryRun) {
      return { dryRun: true, would: 'generate_gmb_post', topic, contentItemId: input.contentItemId ?? null };
    }

    const content = (await this.callAnthropic(systemPrompt, userMessage, 800)).trim();
    if (!content) throw new Error('Ember: GMB content was empty');

    const [row] = await db
      .insert(gmbPosts)
      .values({ content, postType: 'STANDARD', status: 'pending' })
      .returning();

    // Campaign branch: mirror the copy onto the content_items row so the
    // campaign board shows it as ready instead of an empty draft. The
    // gmb_posts row above stays the record the GMB review UI reads.
    if (input.contentItemId) {
      await db
        .update(contentItems)
        .set({ caption: content, status: 'ready', updatedAt: new Date() })
        .where(eq(contentItems.id, input.contentItemId));
    }

    logger.info(
      { gmbPostId: row.id, contentItemId: input.contentItemId ?? null },
      '[Ember] GMB post drafted (pending manual post)',
    );
    return {
      gmbPostId: row.id,
      status: row.status,
      contentItemId: input.contentItemId ?? null,
      contentPreview: content.slice(0, 120),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Reviews
  // ─────────────────────────────────────────────────────────
  async respondToReview(input: RespondToReviewInput, options?: AgentRunOptions) {
    if (!input.reviewId && !input.googleReviewId) {
      throw new Error('respond_to_review: reviewId or googleReviewId required');
    }
    if (input.reviewId && input.googleReviewId) {
      throw new Error('respond_to_review: pass reviewId OR googleReviewId, not both');
    }

    return input.googleReviewId
      ? this.respondToGoogleReview(input.googleReviewId, options)
      : this.respondToAppReview(input.reviewId!, options);
  }

  /**
   * In-app review (reviews table). These live only in our DB — there is no
   * Google review to answer — so the draft is persisted to reviews.response
   * for John to post or send manually. It used to be returned and discarded.
   */
  private async respondToAppReview(reviewId: string, options?: AgentRunOptions) {
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
      .where(eq(reviews.id, reviewId))
      .limit(1);

    const review = rows[0];
    if (!review) throw new Error(`respond_to_review: review ${reviewId} not found`);

    // Rating <= 3 → escalate to Xavier; John handles personally.
    if (review.rating <= 3) {
      if (options?.dryRun) {
        return { dryRun: true, would: 'escalate_low_rating', reviewId: review.id, rating: review.rating };
      }
      await this.escalateLowRating({
        reviewId: review.id,
        rating: review.rating,
        comment: review.comment,
        bookingId: review.bookingId,
        customerName: review.customerName,
        source: 'app',
      });
      return { escalated: true, reviewId: review.id, rating: review.rating };
    }

    if (options?.dryRun) {
      return { dryRun: true, would: 'respond', reviewId: review.id, rating: review.rating };
    }

    const reply = await this.draftReviewReply(review.customerName, review.rating, review.comment);

    await db
      .update(reviews)
      .set({ response: reply, responseAt: new Date() })
      .where(eq(reviews.id, review.id));

    logger.info({ reviewId: review.id, rating: review.rating }, '[Ember] review response drafted');
    return { reviewId: review.id, rating: review.rating, reply, posted: false, source: 'app' };
  }

  /**
   * Synced Google review (google_reviews table). Drafts the reply and posts it
   * to Google via the GMB API.
   *
   * When GMB is not configured yet (GOOGLE_GMB_REFRESH_TOKEN needs the
   * one-time OAuth flow — see server/lib/gmbClient.ts), the draft is still
   * saved and the call is skipped with a warning rather than throwing, so
   * nothing is lost and the caller does not fail.
   *
   * Called again for a review whose draft was saved but never posted, it
   * resumes that draft instead of writing a new one — see isRetry below. The
   * auto-reply sweep re-queues exactly those rows, with a three-attempt cap.
   */
  private async respondToGoogleReview(googleReviewId: string, options?: AgentRunOptions) {
    const [review] = await db
      .select()
      .from(googleReviews)
      .where(eq(googleReviews.googleReviewId, googleReviewId))
      .limit(1);

    if (!review) throw new Error(`respond_to_review: google review ${googleReviewId} not found`);

    // "Answered" means the reply is live on Google, which response_at records.
    // A stored response with no response_at is a draft whose post failed: the
    // text is already written and paid for, so it is resumed below rather than
    // skipped. responded_by='manual' is a reply adopted from Google's own
    // reviewReply during sync — live there even if it carried no updateTime.
    const isRetry = Boolean(review.response) && !review.responseAt && review.respondedBy !== 'manual';
    if (review.response && !isRetry) {
      logger.info({ googleReviewId }, '[Ember] google review already answered — skipping');
      return { googleReviewId, alreadyAnswered: true, reply: review.response };
    }

    // Same rule as in-app: <= 3 stars is John's to answer, not the model's.
    // Unrated (STAR_RATING_UNSPECIFIED) is treated as low-confidence and
    // escalated too rather than guessed at.
    if (review.rating === null || review.rating <= 3) {
      if (options?.dryRun) {
        return { dryRun: true, would: 'escalate_low_rating', googleReviewId, rating: review.rating };
      }
      await this.escalateLowRating({
        reviewId: review.googleReviewId,
        rating: review.rating,
        comment: review.comment,
        bookingId: null,
        customerName: review.reviewerName,
        source: 'google',
      });
      return { escalated: true, googleReviewId, rating: review.rating };
    }

    if (options?.dryRun) {
      return {
        dryRun: true,
        would: isRetry ? 'repost_on_google' : 'respond_on_google',
        googleReviewId,
        rating: review.rating,
      };
    }

    // A retry re-posts the existing draft verbatim — the GMB call is what
    // failed, not the writing, and redrafting would burn a model call to
    // produce different text for the same review on every attempt.
    const reply = isRetry
      ? review.response!
      : await this.draftReviewReply(review.reviewerName, review.rating, review.comment);

    let posted = false;
    if (isGmbConfigured()) {
      posted = await replyToReview(review.reviewName, reply);
    } else {
      logger.warn(
        { googleReviewId },
        '[Ember] GMB not configured (GOOGLE_GMB_REFRESH_TOKEN unset) — reply drafted but not posted',
      );
    }

    // Stored either way. On a failed/skipped post the row keeps the draft and
    // responseAt stays null, so the sync job can retry it later.
    await db
      .update(googleReviews)
      .set({
        response: reply,
        responseAt: posted ? new Date() : null,
        respondedBy: 'ember',
        updatedAt: new Date(),
      })
      .where(eq(googleReviews.id, review.id));

    logger.info(
      { googleReviewId, rating: review.rating, posted, retry: isRetry },
      isRetry ? '[Ember] google review reply re-posted' : '[Ember] google review response drafted',
    );
    return { googleReviewId, rating: review.rating, reply, posted, retry: isRetry, source: 'google' };
  }

  /** Shared Claude call for both review sources. */
  private async draftReviewReply(
    customerName: string | null,
    rating: number,
    comment: string | null,
  ): Promise<string> {
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
Customer: ${sanitizeForPrompt(customerName ?? 'a customer', 'name')}
Rating: ${rating}★
Their review: ${sanitizeForPrompt(comment ?? '(no comment)', 'review')}
</data>`;

    return (await this.callAnthropic(systemPrompt, userMessage, 400)).trim();
  }

  /** Shared Xavier escalation for <= 3 star reviews from either source. */
  private async escalateLowRating(data: {
    reviewId: string;
    rating: number | null;
    comment: string | null;
    bookingId: string | null;
    customerName: string | null;
    source: 'app' | 'google';
  }): Promise<void> {
    const where = data.source === 'google' ? 'Google review' : 'review';
    try {
      await xavier.run('escalate', {
        issue: `Low rating (${data.rating ?? 'unrated'}★) on a ${where} needs a personal response from John`,
        severity: 'high',
        agentName: 'Ember Lane',
        data,
      });
    } catch (err) {
      logger.error({ err, reviewId: data.reviewId }, '[Ember] xavier escalation failed');
    }
  }

  // ─────────────────────────────────────────────────────────
  // Social
  // ─────────────────────────────────────────────────────────
  async generateSocialContent(input: GenerateSocialInput, options?: AgentRunOptions) {
    // Campaign-item branch: when contentItemId is set, generate a single post
    // for that item's platform and persist onto the content_items row instead
    // of inserting a new social_posts draft.
    if (input.contentItemId) {
      if (options?.dryRun) {
        return { dryRun: true, would: 'generate_social_content', contentItemId: input.contentItemId };
      }

      const [item] = await db
        .select()
        .from(contentItems)
        .where(eq(contentItems.id, input.contentItemId))
        .limit(1);
      if (!item) return { error: 'item_not_found' };

      const brief = (item.creativeBrief ?? {}) as any;
      const platform = (input.platform ?? item.platform ?? 'instagram') as SocialPlatform;
      const guide = SOCIAL_GUIDES[platform] ?? SOCIAL_GUIDES.instagram;
      const topic = sanitizeForPrompt(
        input.topic ?? brief.concept ?? 'LervIT moving service in Calgary',
        'description',
      );
      const tone = sanitizeForPrompt(input.tone ?? 'casual', 'title');
      const cta = sanitizeForPrompt(input.cta ?? item.cta ?? 'Book at lervit.com', 'title');

      const systemPrompt = `You are Ember Lane, social lead for LervIT.
Write a ${platform} post following these rules:

${guide}

${LERVIT_BRAND}

Tone: ${tone}. End with this CTA: ${cta}.

CRITICAL: Respond with ONLY raw JSON.
No markdown. No code fences.
No backticks. No explanation.
Start your response with { directly.

{ "content": string, "hashtags": string[] }${CREATIVEOS_APPENDIX}`;

      const userMessage = `Draft the ${platform} post. Topic: ${topic}.`;
      const raw = await this.callAnthropic(systemPrompt, userMessage, 1200);
      const parsed = this.parseJson(raw);

      const content = String(parsed.content ?? '').trim();
      if (!content) return { error: 'empty_content' };

      const hashtags = Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map((h: any) => String(h).replace(/^#/, '').trim()).filter(Boolean)
        : null;

      await db
        .update(contentItems)
        .set({
          caption: content,
          hashtags,
          cta,
          status: 'ready',
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, input.contentItemId));

      logger.info({ contentItemId: input.contentItemId, platform }, '[Ember] campaign social generated');
      return { generated: true, contentItemId: input.contentItemId, platform, caption: content, hashtags };
    }

    const platforms: SocialPlatform[] = input.platform
      ? [input.platform]
      : SOCIAL_PLATFORMS;

    // Event- and admin-triggered calls steer the post (the booking.completed
    // subscription asks for a celebratory success story, for example). The
    // weekly cron passes a platform and nothing else, so each of these stays
    // optional and falls back to the generic Calgary angle.
    const topic = input.topic?.trim()
      ? sanitizeForPrompt(input.topic.trim(), 'description')
      : null;
    const tone = input.tone?.trim() ? sanitizeForPrompt(input.tone.trim(), 'title') : null;
    const cta = input.cta?.trim() ? sanitizeForPrompt(input.cta.trim(), 'title') : null;

    if (options?.dryRun) {
      return { dryRun: true, would: 'generate_social_content', platforms, topic, tone, cta };
    }

    const results: Array<{ id: string; platform: SocialPlatform; contentPreview: string }> = [];

    for (const platform of platforms) {
      const systemPrompt = `You are Ember Lane, social lead for LervIT.
Write a ${platform} post following these rules:

${SOCIAL_GUIDES[platform]}

${LERVIT_BRAND}
${tone ? `\nTone: ${tone}.` : ''}${cta ? `\nEnd with this CTA: ${cta}.` : ''}
CRITICAL: Respond with ONLY raw JSON.
No markdown. No code fences.
No backticks. No explanation.
Start your response with { directly.

{ "content": string, "hashtags": string[] }${CREATIVEOS_APPENDIX}`;

      const userMessage = topic
        ? `Draft the ${platform} post. Topic: ${topic}.`
        : `Draft today's ${platform} post. Angle: helpful moving content that lands with a Calgary audience.`;

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
  // Trend posts — social copy grounded in real LervIT activity
  // ─────────────────────────────────────────────────────────

  /**
   * Aggregate the last 7 days of demand into publishable buckets.
   *
   * Only derived counts leave this method: addresses are bucketed against
   * CALGARY_AREAS, and names, phones and emails are never selected. `leads`
   * carries no address or price column, so neighbourhoods and values come
   * from `bookings`.
   */
  private async gatherTrendData(): Promise<TrendSnapshot> {
    const since = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const recentLeads = await db
      .select({ sourceChannel: leads.sourceChannel })
      .from(leads)
      .where(and(gte(leads.createdAt, since), eq(leads.leadType, 'b2c')))
      .limit(500);

    const recentBookings = await db
      .select({
        pickupAddress: bookings.pickupAddress,
        loadSize: bookings.loadSize,
        preferredDate: bookings.preferredDate,
        price: bookings.price,
        status: bookings.status,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, since))
      .limit(500);

    const live = recentBookings.filter((b) => b.status !== 'cancelled');

    const prices = live
      .map((b) => Number(b.price))
      .filter((n) => Number.isFinite(n) && n > 0);

    const averagePrice = prices.length
      ? Math.round(prices.reduce((sum, n) => sum + n, 0) / prices.length)
      : null;

    const busiestDays = topCounts(
      live.map((b) =>
        b.preferredDate
          ? b.preferredDate.toLocaleDateString('en-US', {
              weekday: 'long',
              timeZone: 'America/Edmonton',
            })
          : null,
      ),
      2,
    );

    const hasStats = live.length >= TREND_MIN_BOOKINGS_FOR_STATS;

    return {
      windowDays: TREND_WINDOW_DAYS,
      leadCount: recentLeads.length,
      leadSources: topCounts(recentLeads.map((l) => l.sourceChannel), 3),
      bookingCount: live.length,
      topAreas: topCounts(live.map((b) => bucketArea(b.pickupAddress)), 3),
      loadSizes: topCounts(live.map((b) => b.loadSize), 3),
      busiestDays,
      averagePrice: hasStats ? averagePrice : null,
      hasStats,
    };
  }

  /** Render the snapshot as prompt-safe lines; omits anything we cannot back. */
  private formatTrendData(snapshot: TrendSnapshot): string {
    const lines: string[] = [`Window: last ${snapshot.windowDays} days in Calgary`];

    if (snapshot.topAreas.length) {
      lines.push(
        `Most active pickup areas: ${snapshot.topAreas
          .map((a) => `${a.label} (${a.count} moves)`)
          .join(', ')}`,
      );
    }

    if (snapshot.hasStats) {
      lines.push(`Moves booked: ${snapshot.bookingCount}`);
      lines.push(`New customer enquiries: ${snapshot.leadCount}`);

      if (snapshot.averagePrice !== null) {
        lines.push(`Average booked move: $${snapshot.averagePrice} CAD`);
      }
      if (snapshot.busiestDays.length) {
        lines.push(
          `Busiest requested move days: ${snapshot.busiestDays
            .map((d) => `${d.label} (${d.count})`)
            .join(', ')}`,
        );
      }
      if (snapshot.loadSizes.length) {
        lines.push(
          `Most common load sizes: ${snapshot.loadSizes
            .map((l) => sanitizeForPrompt(l.label, 'title'))
            .join(', ')}`,
        );
      }
      if (snapshot.leadSources.length) {
        lines.push(
          `Where enquiries came from: ${snapshot.leadSources
            .map((l) => sanitizeForPrompt(l.label, 'title'))
            .join(', ')}`,
        );
      }
    } else {
      lines.push(
        'Volume this week is too low to quote figures — describe the pattern qualitatively only.',
      );
    }

    return lines.join('\n');
  }

  async generateTrendPost(input: GenerateTrendInput, options?: AgentRunOptions) {
    const requested = Array.isArray(input.platforms) && input.platforms.length
      ? input.platforms
      : (['linkedin', 'instagram'] as SocialPlatform[]);

    const platforms = requested.filter((p): p is SocialPlatform =>
      SOCIAL_PLATFORMS.includes(p),
    );

    if (platforms.length === 0) {
      throw new Error(
        `generate_trend_post: no supported platform in [${requested.join(', ')}]`,
      );
    }

    const snapshot = await this.gatherTrendData();

    // Nothing happened this week — a "trend" post off an empty window would be
    // fabrication, so skip rather than draft.
    if (snapshot.bookingCount === 0 && snapshot.leadCount === 0) {
      logger.warn({ windowDays: snapshot.windowDays }, '[Ember] trend post skipped — no activity');
      return { skipped: true, reason: 'no_activity', snapshot };
    }

    if (options?.dryRun) {
      return { dryRun: true, would: 'generate_trend_post', platforms, snapshot };
    }

    const dataBlock = this.formatTrendData(snapshot);
    const results: Array<{
      id: string;
      platform: SocialPlatform;
      contentPreview: string;
      videoContentItemId?: string;
    }> = [];

    for (const platform of platforms) {
      const systemPrompt = `You are Ember Lane, social lead for LervIT.
Write a ${platform} post about this week's Calgary moving activity, using the
real LervIT data supplied by the user message.

${TREND_ANGLES[platform]}

${SOCIAL_GUIDES[platform]}

${LERVIT_BRAND}

DATA RULES — these override everything else:
- Only cite figures that appear in the data block. Never invent or round up a number.
- If the data block says volume is too low to quote figures, cite NO numbers at all.
- Never name an individual customer, address, or mover.
- Do not imply market-wide statistics — this is LervIT's own booking activity, and
  it must read that way (e.g. "moves we handled this week", not "Calgary moved X%").

CRITICAL: Respond with ONLY raw JSON.
No markdown. No code fences.
No backticks. No explanation.
Start your response with { directly.

{ "content": string, "hashtags": string[] }${CREATIVEOS_APPENDIX}`;

      const userMessage = `This week's LervIT activity:
<data>
${dataBlock}
</data>

Draft the ${platform} post.`;

      const raw = await this.callAnthropic(systemPrompt, userMessage, 1200);
      const parsed = this.parseJson(raw);

      const content = String(parsed.content ?? '').trim();
      if (!content) {
        logger.error({ platform }, '[Ember] trend post content was empty');
        continue;
      }

      const hashtags = Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map((h: any) => String(h).replace(/^#/, '').trim()).filter(Boolean)
        : null;

      const [row] = await db
        .insert(socialPosts)
        .values({ platform, content, hashtags, status: 'draft' })
        .returning();

      const result: (typeof results)[number] = {
        id: row.id,
        platform,
        contentPreview: content.slice(0, 100),
      };

      // Instagram trend posts get cinematic B-roll to go with the copy. The video
      // has to hang off its own content_items row: social_posts has no videoUrl
      // column, and the 30s Higgsfield poller in background-jobs only ever looks
      // at content_items (status='generating' + generator='higgsfield'). Passing a
      // social_posts id straight to generateHiggsfieldVideo would just return
      // item_not_found.
      if (platform === 'instagram') {
        try {
          const [videoItem] = await db
            .insert(contentItems)
            .values({
              type: 'higgsfield_video',
              platform,
              status: 'draft',
              caption: content,
              hashtags,
              generator: 'higgsfield',
              aspectRatio: '9:16',
            })
            .returning();

          // No campaignId: AdminCampaignsPage lists items by campaign, so this
          // row is invisible there. The video still renders and lands in `qa`,
          // where nobody can reach it to approve. Tracked separately — either
          // give trend posts a campaign or drop the content_items insert.
          logger.warn(
            { contentItemId: videoItem.id, postId: row.id },
            '[Ember] Instagram trend post created with no campaignId — will not appear in campaign board',
          );

          const submission = await this.generateHiggsfieldVideo(
            {
              contentItemId: videoItem.id,
              prompt: `Calgary moving lifestyle, urban energy, professional movers, cinematic. ${content.slice(0, 50)}`,
            },
            options,
          );

          if ('submitted' in submission && submission.submitted) {
            result.videoContentItemId = videoItem.id;
            logger.info(
              { postId: row.id, contentItemId: videoItem.id, jobId: submission.jobId },
              '[Ember] trend post video queued',
            );
          } else {
            // generateHiggsfieldVideo already marked the item failed and logged
            // the cause; the post itself still stands as a draft.
            logger.error(
              { postId: row.id, contentItemId: videoItem.id, submission },
              '[Ember] trend post video submit did not take',
            );
          }
        } catch (err) {
          // A video is an enhancement — never lose the drafted post over it.
          logger.error({ err, postId: row.id }, '[Ember] trend post video trigger failed');
        }
      }

      results.push(result);
    }

    if (results.length === 0) {
      throw new Error('Ember: trend post generation produced no content');
    }

    // Trend posts quote real figures, so flag them for review explicitly.
    try {
      await xavier.run('escalate', {
        issue: `Ember: ${results.length} data-backed trend post${results.length === 1 ? '' : 's'} ready for review (cites real booking figures)`,
        severity: 'low',
        agentName: 'Ember Lane',
        data: {
          platforms: results.map((r) => r.platform),
          bookingCount: snapshot.bookingCount,
          citedFigures: snapshot.hasStats,
        },
      });
    } catch (err) {
      logger.error({ err }, '[Ember] xavier trend nudge failed');
    }

    logger.info(
      {
        count: results.length,
        platforms,
        bookingCount: snapshot.bookingCount,
        hasStats: snapshot.hasStats,
        videosQueued: results.filter((r) => r.videoContentItemId).length,
      },
      '[Ember] trend posts drafted',
    );

    return { count: results.length, posts: results, snapshot };
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

    // Persist the draft — the monthly cron logs only the subject, so without a
    // row the generated HTML would exist nowhere John can retrieve it.
    const [row] = await db
      .insert(newsletters)
      .values({
        subject,
        preheader: preheader || null,
        html,
        status: 'pending_review',
        generatedBy: 'ember',
      })
      .returning();

    logger.info({ newsletterId: row.id, subject }, '[Ember] newsletter drafted (pending_review, not sent)');
    return {
      newsletterId: row.id,
      subject,
      preheader,
      html,
      status: row.status,
      sent: false,
      notice: 'Draft only — John sends via Resend',
    };
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

    // TikTok is out of the default: it has a voice guide but no publish path
    // (publish_to_social supports facebook | instagram | linkedin), so TikTok
    // items strand at 'approved'. LinkedIn is in — it publishes, and it owns
    // the B2B angle most campaigns target. Callers can still pass any set.
    const platformsList = input.platforms ?? ['instagram', 'facebook', 'linkedin'];
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

    let savedItems: Array<typeof contentItems.$inferSelect> = [];
    if (Array.isArray(plan.items) && plan.items.length > 0) {
      savedItems = await db
        .insert(contentItems)
        .values(
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
        )
        .returning();
    }

    // Auto-generate script/caption for each item right after insert so the
    // admin isn't staring at a wall of empty drafts. Fire-and-forget: the
    // createCampaign response returns before these complete, and the admin
    // page polls while items are `generating`.
    if (savedItems.length > 0) {
      setImmediate(() => {
        (async () => {
          for (const item of savedItems) {
            const brief = (item.creativeBrief ?? {}) as any;
            try {
              const itemPlatform = ((): SocialPlatform => {
                const p = (item.platform ?? 'instagram') as string;
                return (['facebook', 'instagram', 'tiktok', 'linkedin'] as const).includes(p as any)
                  ? (p as SocialPlatform)
                  : 'instagram';
              })();

              if (item.type === 'heygen_video') {
                // HeyGen is a presenter: the script IS the speech.
                await this.generateVideoScript({
                  contentItemId: item.id,
                  concept: brief.concept,
                  hook: brief.hook,
                  platform: item.platform ?? undefined,
                  duration: 30,
                });
              } else if (item.type === 'higgsfield_video') {
                // Higgsfield is text-to-video with its own generated audio, so a
                // spoken script is never read — it needs visual direction. The
                // brief supplies that; the caption is generated separately
                // because the feed post still needs copy.
                await this.generateCreativeBrief({
                  contentItemId: item.id,
                  concept: brief.concept,
                });
                await this.generateSocialContent({
                  contentItemId: item.id,
                  platform: itemPlatform,
                  topic: brief.concept,
                  tone: 'casual',
                  cta: item.cta ?? 'Book at lervit.com',
                });
              } else if (item.type === 'social') {
                await this.generateSocialContent({
                  contentItemId: item.id,
                  platform: itemPlatform,
                  topic: brief.concept,
                  tone: 'casual',
                  cta: item.cta ?? 'Book at lervit.com',
                });
              } else if (item.type === 'gmb' || item.platform === 'google') {
                await this.generateGmbPost({
                  contentItemId: item.id,
                  topic: brief.concept ?? campaign.objective,
                });
              } else if (item.type === 'blog') {
                await this.generateBlogPost({
                  contentItemId: item.id,
                  topic: brief.concept ?? campaign.objective ?? undefined,
                });
              }
              // newsletter items still have no campaign-aware path —
              // generate_newsletter writes its own table and takes no
              // contentItemId, so those stay draft until an admin fills them.
            } catch (err) {
              logger.error(
                { err, itemId: item.id, type: item.type },
                '[Ember] auto-generate for campaign item failed',
              );
              await db
                .update(contentItems)
                .set({ status: 'failed', updatedAt: new Date() })
                .where(eq(contentItems.id, item.id))
                .catch(() => {});
            }
          }
        })().catch((err) => logger.error({ err }, '[Ember] auto-chain crashed'));
      });
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

    const platformLabel = sanitizeForPrompt(
      input.platform ?? item.platform ?? 'social',
      'title',
    );

    const systemPrompt = `You are Ember Lane, LervIT's script writer.
Write a video script AND the accompanying social caption for LervIT Moving in Calgary.

${LERVIT_BRAND}

RULES:
- Natural, conversational language.
- Short sentences.
- No invented features, prices, testimonials, or statistics.
- End with a clear CTA.
- Paced for ~${durationSec} seconds (roughly ${Math.max(30, durationSec * 2.5)} words).
- Audience: ${audience}.
- Caption is for ${platformLabel}: 1-3 short sentences that pair with the video.
- Hashtags are lowercase, no leading '#', 5-8 items relevant to Calgary moving.

CRITICAL: Respond with ONLY raw JSON.
No markdown. No code fences.
No backticks. No explanation.
Start your response with { directly.

{
  "script": "full spoken script, one paragraph",
  "hook": "first line hook",
  "caption": "social caption for the video",
  "hashtags": ["calgarymoving", "movingtips"],
  "cta": "call to action line",
  "estimatedDuration": ${durationSec},
  "scenes": [
    { "time": "0-5s", "text": "line spoken here", "direction": "visual direction note" }
  ]
}${CREATIVEOS_APPENDIX}`;

    const userMessage = `Write a script and caption for: ${concept}`;

    const raw = await this.callAnthropic(systemPrompt, userMessage, 1000);

    let parsed: any;
    try {
      parsed = this.parseJson(raw);
    } catch {
      return { error: 'parse_failed' };
    }

    const script = String(parsed.script ?? '');
    const caption = parsed.caption ? String(parsed.caption) : null;
    const cta = parsed.cta ? String(parsed.cta) : null;
    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags
          .map((h: any) => String(h).replace(/^#/, '').trim())
          .filter(Boolean)
      : null;

    await db
      .update(contentItems)
      .set({
        script,
        caption,
        hashtags,
        cta,
        status: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, input.contentItemId));

    return {
      generated: true,
      contentItemId: input.contentItemId,
      script: parsed.script,
      hook: parsed.hook,
      caption,
      hashtags,
      cta,
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

    const aspectRatio = item.platform === 'instagram' ? '9:16' : '16:9';

    try {
      const job = await heygenProvider.createVideo({
        script,
        aspectRatio,
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

    // Seedance is text-to-video: the prompt describes what the camera SEES.
    // Compose it from the brief's visual fields rather than the 80-char plan
    // concept alone. Dialogue and on-screen text are suppressed — the model
    // renders baked-in captions poorly and generates its own audio.
    const visualPrompt = [
      brief?.concept,
      brief?.visualStyle,
      brief?.mood,
      Array.isArray(brief?.palette) && brief.palette.length
        ? `Colour palette: ${brief.palette.join(', ')}`
        : null,
      'Calgary urban environment',
      'Professional cinematography',
      'No text overlays',
      'No dialogue',
    ]
      .filter(Boolean)
      .map((part) => String(part).trim().replace(/\.$/, ''))
      .join('. ');

    const prompt =
      input.prompt ?? (visualPrompt || 'Calgary moving lifestyle, cinematic, professional');

    await db
      .update(contentItems)
      .set({ status: 'generating', updatedAt: new Date() })
      .where(eq(contentItems.id, input.contentItemId));

    try {
      const job = await higgsfieldProvider.createVideo({
        // The composed prompt already carries the cinematic/Calgary framing;
        // only a caller-supplied raw prompt still needs it appended.
        prompt: input.prompt
          ? `${prompt}. Cinematic, premium, urban Calgary. Professional lighting.`
          : prompt,
        duration: input.duration ?? 5,
        platform: item.platform ?? undefined,
      });

      await db
        .update(contentItems)
        .set({ providerJobId: job.jobId, generator: 'higgsfield', updatedAt: new Date() })
        .where(eq(contentItems.id, input.contentItemId));

      await emitEvent(
        'ember.higgsfield_video_submitted',
        'agent',
        'ember',
        { contentItemId: input.contentItemId, jobId: job.jobId },
        'agent',
      );

      return {
        submitted: true,
        contentItemId: input.contentItemId,
        jobId: job.jobId,
        status: 'processing' as const,
      };
    } catch (err: any) {
      await db
        .update(contentItems)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(contentItems.id, input.contentItemId));
      logger.error({ err }, '[Ember] Higgsfield submit failed');
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

    // Fail closed. This used to fall back to the first 200 chars of the spoken
    // script — dialogue, truncated mid-sentence, published to a public feed
    // (and for a Higgsfield item, dialogue no one ever narrated).
    const caption = item.caption ?? '';
    if (!caption) {
      logger.error(
        { itemId: item.id, platform: item.platform, type: item.type },
        '[Ember] no caption — refusing to publish',
      );
      return {
        error: 'no_caption',
        message: 'Caption required before publishing',
        contentItemId: input.contentItemId,
      };
    }

    const mediaUrl = item.videoUrl ?? item.assetUrl ?? undefined;
    const isVideo = !!item.videoUrl;
    const isPhoto = !item.videoUrl && !!item.assetUrl;

    let results: Array<{ postId: string; platform: string; url?: string; error?: string }>;

    if (platform === 'linkedin') {
      const result = await linkedInProvider.post({
        text: caption,
        // A video still goes out as a link preview — native video needs the
        // multipart Assets API, which the provider does not implement. A
        // still is uploaded and posted natively via imageUrl.
        url: item.videoUrl ? mediaUrl : undefined,
        imageUrl: item.assetUrl ?? undefined,
        title: 'LervIT Moving Calgary',
        description: caption.slice(0, 200),
        hashtags: item.hashtags ?? [],
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
      if (platform === 'instagram') {
        if (!mediaUrl) {
          throw new Error('Instagram requires photo or video');
        }
        if (item.aspectRatio && item.aspectRatio !== '9:16') {
          logger.warn(
            { itemId: item.id, aspectRatio: item.aspectRatio },
            '[Ember] IG content may not be 9:16 — Reels requires 9:16',
          );
        }
      }

      if (platform === 'facebook') {
        if (!mediaUrl && !item.caption) {
          throw new Error('Facebook requires media or caption');
        }
      }

      results = await metaProvider.publish({
        message: caption,
        videoUrl: isVideo ? mediaUrl : undefined,
        photoUrl: isPhoto ? mediaUrl : undefined,
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
