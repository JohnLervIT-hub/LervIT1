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
import { clampDuration } from '@shared/video';
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

// ─── Creative strategy: research the market, then pick an angle ───
//
// Video prompts used to be generic — every Higgsfield render got the same
// "Calgary urban environment, professional cinematography" framing regardless
// of who was actually in the market that month. This layer reads real demand
// first (gatherTrendData), decides which persuasive angle fits that context,
// and only then writes the prompt.
//
// The decision is deliberately NOT left to the model. A rule-based score is
// auditable, reproducible for the same inputs, and testable; a model asked to
// "pick the best angle" gives a different answer every call and cannot be
// regression-tested. The model's job is to render the chosen angle well.

export type MovingSeason = 'peak' | 'shoulder' | 'winter';

export type CreativeAngle =
  | 'urgency'
  | 'social_proof'
  | 'price_anchor'
  | 'local_trust';

/**
 * Calgary residential moving seasonality. Lease turnover and the school break
 * put most moves between May and August; April/September/October are shoulders;
 * November-March is thin and price-driven (snow, frozen walkways, almost nobody
 * moves in a Calgary winter by choice).
 */
function seasonFor(now: Date): MovingSeason {
  // Calgary time, not server time. A UTC host is already into the next day by
  // late evening MST, which would roll the month on the 1st and the 31st.
  const month = Number(
    now.toLocaleString('en-US', { month: 'numeric', timeZone: 'America/Edmonton' }),
  );
  if (month >= 5 && month <= 8) return 'peak';
  if (month === 4 || month === 9 || month === 10) return 'shoulder';
  return 'winter';
}

/** Service-area towns that are not Calgary — "do you even come out here" markets. */
const OFF_CALGARY_CITIES = new Set([
  'Airdrie', 'Cochrane', 'Okotoks', 'Chestermere',
]);

/** Small loads: the buyer is comparing prices, often against doing it themselves. */
const BUDGET_MOVE_TYPES = new Set(['boxes', 'small']);

/** Whole-home loads: high consideration, the buyer is looking for reassurance. */
const CONSIDERED_MOVE_TYPES = new Set(['large', 'apartment']);

/**
 * loadSize is app-controlled (shared/schema.ts uses a zod enum), but it reaches
 * here straight from a DB column, so it is mapped through a fixed table before
 * going anywhere near a prompt. An unrecognised bucket becomes null rather than
 * being interpolated — the same containment rule bucketArea() applies to
 * addresses.
 */
const MOVE_TYPE_LABELS: Record<string, string> = {
  boxes: 'a few boxes',
  small: 'a small load',
  medium: 'a mid-size home',
  large: 'a full house',
  apartment: 'a full apartment',
};

/**
 * What each angle means on screen. The prompt gets `visual`; `intent` and
 * `callout` steer the brief so the caption and the footage argue the same thing.
 */
export const ANGLE_DIRECTION: Record<
  CreativeAngle,
  { label: string; intent: string; visual: string; callout: string }
> = {
  urgency: {
    label: 'Urgency',
    intent:
      'Slots are genuinely scarce right now. Convey time running out, never a countdown gimmick or a fake discount deadline.',
    visual:
      'Brisk handheld camera, movers loading at pace, a hand checking a phone calendar, low sun dropping behind the skyline, sense of a day being beaten',
    callout: 'Book the date before it goes.',
  },
  social_proof: {
    label: 'Social proof',
    intent:
      'Lead with other Calgarians having already trusted this. Reassurance over excitement — the viewer is deciding whether to risk their belongings.',
    visual:
      'Warm natural light, a real handshake at a doorway, neighbours visible on the street, uniformed movers carrying a wrapped sofa with obvious care, steady tripod framing',
    callout: 'Calgary already moved with us.',
  },
  price_anchor: {
    label: 'Price anchor',
    intent:
      'Make the cost feel known and small before it is stated. Transparent, not cheap — no discount-bin energy.',
    visual:
      'Clean bright frames, a phone screen held up showing a simple quote, a single van loaded efficiently, uncluttered composition with lots of negative space',
    callout: 'You see the price before you book.',
  },
  local_trust: {
    label: 'Local trust',
    intent:
      'Prove this is a local operator who actually serves the viewer’s own area, not a national dispatcher. Specific place beats any adjective.',
    visual:
      'Recognisable local streetscape and low-rise residential character, van parked on a familiar-looking residential road, overcast-soft daylight, documentary framing',
    callout: 'We are from here.',
  },
};

/**
 * A weak conversion ratio (bookings per lead) reads as a trust gap rather than a
 * demand problem: people are asking and then not committing.
 */
const LOW_CONVERSION_RATIO = 0.25;

/** Share of the window's moves one area must hold before it drives the angle. */
const AREA_DOMINANCE_SHARE = 0.4;

/** Applied when scores tie, so the same inputs always yield the same angle. */
const ANGLE_TIE_BREAK: readonly CreativeAngle[] = [
  'urgency', 'local_trust', 'price_anchor', 'social_proof',
];

/**
 * Demand signals read from outside our own booking data.
 *
 * Both sources are unofficial: Google Trends' internal JSON endpoints (the ones
 * pytrends drives) and PromptHero's rendered HTML. Neither is a supported API,
 * so every field here is best-effort and the whole fetch is non-fatal — see
 * fetchExternalSignals.
 */
export interface ExternalSignals {
  /** 0-100, Google Trends interest over time, averaged over the last 7 points. */
  trendScore: number;
  /** Related rising queries, top 5. */
  trendingTerms: string[];
  /** Style keywords scraped from PromptHero, top 5 unique. */
  promptStyles: string[];
  /** True when interest is high enough that proof-led angles should win. */
  socialProofBump: boolean;
}

/**
 * `signals: null` caches a FAILURE, so a 429 from Trends doesn't make every
 * render re-pay three slow HTTP round-trips. Failures expire sooner than
 * successes.
 */
let externalSignalCache: { signals: ExternalSignals | null; expiresAt: number } | null = null;

const EXTERNAL_SIGNAL_TTL_MS = 60 * 60 * 1000;
const EXTERNAL_SIGNAL_FAILURE_TTL_MS = 10 * 60 * 1000;
/** Matches the timeout scout.ts and ryan.ts use on their outbound fetches. */
const EXTERNAL_FETCH_TIMEOUT_MS = 8_000;

const TRENDS_GEO = 'CA-AB';

/**
 * Two queries, because one can't serve both fields (all figures measured
 * 2026-09-28, CA-AB):
 *
 *   'calgary movers' / now 7-d    -> score 1/100, no rising terms. Below Trends'
 *                                    reporting threshold at hour resolution, so
 *                                    the original config scored nothing even when
 *                                    the fetch succeeded.
 *   'calgary movers' / today 12-m -> score 76/100, still no rising terms. City-level
 *                                    keywords don't populate relatedsearches.
 *   'movers' / today 3-m          -> score 26/100 AND real rising terms, including
 *                                    price-shaped ones ("cheap long distance movers").
 *   'moving' / today 12-m         -> score 89 but junk terms ("self moving chess
 *                                    board"), which would poison the brief prompt.
 *
 * So: the narrow keyword drives the score, the broader one drives the terms.
 */
const TRENDS_SCORE_QUERY = { keyword: 'calgary movers', time: 'today 12-m' };
const TRENDS_TERMS_QUERY = { keyword: 'movers', time: 'today 3-m' };

/**
 * Warmed Trends cookie. The API answers 429 to a cold client — NOT because of IP
 * reputation, which is why proxying doesn't fix it (and ScrapingBee 400s every
 * *.google.com URL anyway, see commit ad56c89). One GET of the Trends homepage
 * yields the cookie that makes the same request return 200.
 */
let trendsCookie: { value: string; expiresAt: number } | null = null;
const TRENDS_COOKIE_TTL_MS = 30 * 60 * 1000;

/** Trends and PromptHero both serve these paths to browsers, not to API clients. */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-CA,en;q=0.9',
} as const;

/** Terms in a rising query that mean the market is shopping on price. */
const PRICE_INTENT_TERMS = ['price', 'cost', 'cheap', 'affordable'];

/** Style words worth forwarding to a text-to-video prompt. */
const PROMPT_STYLE_KEYWORDS = new Set([
  'cinematic', 'dramatic', 'golden', 'aerial', 'moody', 'vibrant', 'minimal',
  'atmospheric', 'ethereal', 'gritty', 'warm', 'soft', 'backlit', 'bokeh',
  'anamorphic', 'telephoto', 'wide', 'handheld', 'documentary', 'editorial',
  'volumetric', 'overcast', 'sunlit', 'hazy', 'crisp', 'muted', 'saturated',
  'silhouette', 'reflective', 'textured',
]);

/**
 * One GET of the Trends homepage to collect the consent cookie the API requires.
 * Cached 30min. Returns '' when no cookie came back — the API calls still go out,
 * they just get the old 429, which the caller treats as a normal failure.
 */
async function warmTrendsCookie(): Promise<string> {
  if (trendsCookie && Date.now() < trendsCookie.expiresAt) return trendsCookie.value;

  const res = await fetch('https://trends.google.com/trends/?geo=CA', {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
  });
  // Node 18.14+ exposes every Set-Cookie separately; a single joined header would
  // lose all but one cookie.
  const value = res.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .filter(Boolean)
    .join('; ');

  trendsCookie = { value, expiresAt: Date.now() + TRENDS_COOKIE_TTL_MS };
  logger.info({ cookies: value ? value.split('; ').length : 0 }, '[Ember] Trends cookie warmed');
  return value;
}

/** Trends rejects API calls that don't look like they came from the explore UI. */
function trendsHeaders(cookie: string): Record<string, string> {
  return {
    ...BROWSER_HEADERS,
    Referer: 'https://trends.google.com/trends/explore',
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

/** Google Trends prefixes its JSON with `)]}'` to defeat JSON hijacking. */
function parseTrendsJson(raw: string): any {
  const start = raw.indexOf('{');
  if (start < 0) throw new Error('no JSON object in Trends response');
  return JSON.parse(raw.slice(start));
}

async function fetchTrendsWidgets(
  query: { keyword: string; time: string },
  cookie: string,
): Promise<any[]> {
  const req = {
    comparisonItem: [{ keyword: query.keyword, geo: TRENDS_GEO, time: query.time }],
    category: 0,
    property: '',
  };
  const url =
    'https://trends.google.com/trends/api/explore?hl=en-US&tz=-360&req=' +
    encodeURIComponent(JSON.stringify(req));
  const res = await fetch(url, {
    headers: trendsHeaders(cookie),
    signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
  });
  // 429 here means the cookie warmup didn't take.
  if (!res.ok) throw new Error(`Trends explore ${res.status} (${query.keyword})`);
  const widgets = parseTrendsJson(await res.text())?.widgets;
  if (!Array.isArray(widgets)) throw new Error('Trends explore returned no widgets');
  return widgets;
}

/** Fetch one widget's data. `path` differs per widget — multiline vs relatedsearches. */
async function fetchTrendsWidget(path: string, widget: any, cookie: string): Promise<any> {
  const url =
    `https://trends.google.com/trends/api/widgetdata/${path}?hl=en-US&tz=-360&req=` +
    `${encodeURIComponent(JSON.stringify(widget.request))}&token=${encodeURIComponent(widget.token)}`;
  const res = await fetch(url, {
    headers: trendsHeaders(cookie),
    signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Trends ${path} ${res.status}`);
  return parseTrendsJson(await res.text());
}

/** Mean of the last 7 timeline points, 0-100. */
function averageTrendScore(multiline: any): number {
  const timeline = multiline?.default?.timelineData;
  if (!Array.isArray(timeline) || timeline.length === 0) return 0;
  const values = timeline
    .slice(-7)
    .map((point: any) => Number(point?.value?.[0]))
    .filter((n: number) => Number.isFinite(n));
  if (values.length === 0) return 0;
  const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length;
  return Math.max(0, Math.min(100, Math.round(mean)));
}

/** Rising queries from the relatedsearches payload, top 5. */
function extractRisingQueries(related: any): string[] {
  const lists = related?.default?.rankedList;
  if (!Array.isArray(lists)) return [];
  // The rising list is usually index 1; fall back to whatever is present.
  const ranked = lists[1]?.rankedKeyword ?? lists[0]?.rankedKeyword;
  if (!Array.isArray(ranked)) return [];
  return ranked
    .map((k: any) => (typeof k?.query === 'string' ? k.query.trim() : ''))
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * The whole Trends read: one cookie warmup, then the score query and the terms
 * query. Each query's own widget fetch is independent, so a missing
 * relatedsearches payload never voids a good score.
 */
async function fetchTrendSignals(): Promise<{ trendScore: number; trendingTerms: string[] }> {
  const cookie = await warmTrendsCookie();

  const [scoreResult, termsResult] = await Promise.allSettled([
    (async () => {
      const widgets = await fetchTrendsWidgets(TRENDS_SCORE_QUERY, cookie);
      const timeseries = widgets.find((w: any) => w?.id === 'TIMESERIES');
      if (!timeseries) return 0;
      return averageTrendScore(await fetchTrendsWidget('multiline', timeseries, cookie));
    })(),
    (async () => {
      const widgets = await fetchTrendsWidgets(TRENDS_TERMS_QUERY, cookie);
      const relatedQueries = widgets.find((w: any) => w?.id === 'RELATED_QUERIES');
      if (!relatedQueries) return [];
      return extractRisingQueries(
        await fetchTrendsWidget('relatedsearches', relatedQueries, cookie),
      );
    })(),
  ]);

  // Both halves failing is a real Trends outage; the caller turns that into null.
  if (scoreResult.status === 'rejected' && termsResult.status === 'rejected') {
    throw scoreResult.reason;
  }

  return {
    trendScore: scoreResult.status === 'fulfilled' ? scoreResult.value : 0,
    trendingTerms: termsResult.status === 'fulfilled' ? termsResult.value : [],
  };
}

/**
 * Style keywords off PromptHero's search page.
 *
 * PromptHero is a Next.js app and serves no `data-prompt` attributes (verified
 * 2026-09-28: 0 matches in 1.4MB of HTML). The prompt bodies ship inside the RSC
 * flight payload as escaped `\"prompt\":\"...\"` JSON, so that is read first and
 * the `data-prompt` form is kept as a fallback in case the markup changes back.
 *
 * Either way this is a scrape of an unversioned page, so a markup change silently
 * yields an empty list rather than an error — callers must treat [] as normal.
 * Only prompt bodies are read, never the page's meta tags: those echo our own
 * search query back, which would score our input as if it were a signal.
 */
async function fetchPromptStyles(): Promise<string[]> {
  const res = await fetch('https://prompthero.com/search?q=moving+home+cinematic', {
    headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`PromptHero ${res.status}`);
  const html = await res.text();

  const styles: string[] = [];
  const seen = new Set<string>();
  // Flight payload first, then the legacy attribute form.
  const patterns = [/\\"prompt\\":\\"([^"]{0,2000})/g, /data-prompt=["']([^"']+)["']/gi];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const body = match[1];
      // Lazy RSC references ("$9b") carry no text.
      if (/^\$[0-9a-f]+\\?$/.test(body)) continue;
      for (const word of body.toLowerCase().split(/[^a-z]+/)) {
        if (!PROMPT_STYLE_KEYWORDS.has(word) || seen.has(word)) continue;
        seen.add(word);
        styles.push(word === 'golden' ? 'golden hour' : word);
        if (styles.length >= 5) return styles;
      }
    }
  }
  return styles;
}

/**
 * Best-effort market signals from Google Trends + PromptHero.
 *
 * Returns null on ANY failure — both sources are unofficial and Trends rate-limits
 * datacenter IPs hard, so null is the expected result in production more often
 * than not. Never throws; callers fall back to booking-data-only scoring.
 */
export async function fetchExternalSignals(): Promise<ExternalSignals | null> {
  if (externalSignalCache && Date.now() < externalSignalCache.expiresAt) {
    return externalSignalCache.signals;
  }

  // The two sources are fetched independently on purpose. Trends answers 429 to
  // most datacenter IPs, and nesting the PromptHero call behind it meant one
  // rate-limit threw away the style read too. Only an all-sources failure is null.
  const [trends, prompts] = await Promise.allSettled([
    fetchTrendSignals(),
    fetchPromptStyles(),
  ]);

  if (trends.status === 'rejected' && prompts.status === 'rejected') {
    logger.warn(
      {
        trendsErr: trends.reason instanceof Error ? trends.reason.message : trends.reason,
        promptsErr: prompts.reason instanceof Error ? prompts.reason.message : prompts.reason,
      },
      '[Ember] external signals unavailable — scoring on booking data alone',
    );
    externalSignalCache = {
      signals: null,
      expiresAt: Date.now() + EXTERNAL_SIGNAL_FAILURE_TTL_MS,
    };
    return null;
  }

  if (trends.status === 'rejected') {
    logger.warn(
      { err: trends.reason instanceof Error ? trends.reason.message : trends.reason },
      '[Ember] Google Trends unavailable — style signals only',
    );
  }
  if (prompts.status === 'rejected') {
    logger.warn(
      { err: prompts.reason instanceof Error ? prompts.reason.message : prompts.reason },
      '[Ember] PromptHero unavailable — trend signals only',
    );
  }

  const trendScore = trends.status === 'fulfilled' ? trends.value.trendScore : 0;
  const signals: ExternalSignals = {
    trendScore,
    trendingTerms: trends.status === 'fulfilled' ? trends.value.trendingTerms : [],
    promptStyles: prompts.status === 'fulfilled' ? prompts.value : [],
    socialProofBump: trendScore >= 50,
  };

  externalSignalCache = { signals, expiresAt: Date.now() + EXTERNAL_SIGNAL_TTL_MS };
  logger.info(
    {
      trendScore,
      trendingTerms: signals.trendingTerms.length,
      promptStyles: signals.promptStyles.length,
    },
    '[Ember] external signals fetched',
  );
  return signals;
}

export interface CreativeStrategy {
  angle: CreativeAngle;
  /** Why this angle won, in one line, for the admin UI and the audit log. */
  rationale: string;
  season: MovingSeason;
  /** Dominant pickup area from the fixed list, e.g. "Bridgeland", "Calgary SE". */
  area: string | null;
  /** The market's city, when demand centres somewhere other than Calgary. */
  city: string;
  /** Human label for the dominant load size, or null if unrecognised. */
  moveType: string | null;
  scores: Record<CreativeAngle, number>;
  windowDays: number;
  bookingCount: number;
  leadCount: number;
  /** False when the window is too thin to read anything but the season. */
  hasDemandSignal: boolean;
  /** Trends/PromptHero read, or null when those sources were unreachable. */
  externalSignals?: ExternalSignals | null;
  /** Scraped style words, prompt-ready ("cinematic, golden hour"). */
  promptStyleHint?: string;
  decidedAt: string;
}

/**
 * Score every angle against the market, highest wins.
 *
 * These weights are heuristics, not measured lift. Nothing currently records how
 * a published video performed — content_items has no impression or engagement
 * columns — so there is no per-angle conversion history to rank against. Each
 * rule below states the signal it reacts to; once content performance is
 * tracked, this function is the one place to replace with a measured ranking.
 *
 * Pure and exported so it can be tested without a database.
 */
export function selectCreativeAngle(market: {
  season: MovingSeason;
  area: string | null;
  areaShare: number;
  moveTypeKey: string | null;
  bookingCount: number;
  leadCount: number;
  hasDemandSignal: boolean;
  externalSignals?: ExternalSignals | null;
  now?: Date;
}): CreativeStrategy {
  const scores: Record<CreativeAngle, number> = {
    urgency: 0,
    // Baseline 1: the 5.0 rating is the strongest evergreen asset, so proof is
    // where this lands when there is no signal at all to read.
    social_proof: 1,
    price_anchor: 0,
    local_trust: 0,
  };
  // Reasons are filed under the angle they argue FOR, so the rationale explains
  // the angle that won rather than listing every signal seen — a price-led
  // rationale that cites a trust gap reads as self-contradicting.
  const reasons: Record<CreativeAngle, string[]> = {
    urgency: [], social_proof: [], price_anchor: [], local_trust: [],
  };

  // Season is knowable without any demand data, so it is always read — though
  // only peak and winter actually carry a score.
  if (market.season === 'peak') {
    scores.urgency += 3;
    reasons.urgency.push('peak season (May-Aug) — capacity is the real constraint');
  } else if (market.season === 'shoulder') {
    // Scores nothing on purpose. A shoulder month is not scarce, so paying it an
    // urgency point would manufacture the very deadline the urgency direction
    // forbids; with no other signal this correctly falls through to proof.
    // Filed nowhere: it argues for no angle. It still shows in the context line.

  } else {
    scores.price_anchor += 3;
    reasons.price_anchor.push('winter — demand is thin and price-led');
  }

  const isOffCalgary = !!market.area && OFF_CALGARY_CITIES.has(market.area);
  if (isOffCalgary) {
    scores.local_trust += 3;
    reasons.local_trust.push(`demand centred on ${market.area}, outside Calgary proper`);
  } else if (market.area && market.areaShare >= AREA_DOMINANCE_SHARE) {
    scores.local_trust += 2;
    reasons.local_trust.push(
      `${market.area} holds ${Math.round(market.areaShare * 100)}% of recent moves`,
    );
  }

  if (market.moveTypeKey && BUDGET_MOVE_TYPES.has(market.moveTypeKey)) {
    scores.price_anchor += 2;
    reasons.price_anchor.push('small loads dominate — buyers are comparing on price');
  } else if (market.moveTypeKey && CONSIDERED_MOVE_TYPES.has(market.moveTypeKey)) {
    scores.social_proof += 2;
    reasons.social_proof.push('whole-home moves dominate — high-consideration purchase');
  }

  // Only meaningful with enough volume; on a handful of rows the ratio is noise.
  if (market.hasDemandSignal && market.leadCount > 0) {
    const ratio = market.bookingCount / market.leadCount;
    if (ratio < LOW_CONVERSION_RATIO) {
      scores.social_proof += 3;
      reasons.social_proof.push(
        `only ${Math.round(ratio * 100)}% of enquiries converted — reads as a trust gap`,
      );
    }
  }

  // External demand. Search interest says the market is in-market NOW, which is an
  // urgency argument the booking window can't make on its own; rising price-shaped
  // queries say the same buyers are comparing on cost.
  const ext = market.externalSignals;
  if (ext) {
    if (ext.trendScore >= 60) {
      scores.urgency += 2;
      reasons.urgency.push(`Calgary moving search interest at ${ext.trendScore}/100`);
    } else if (ext.trendScore >= 30) {
      scores.urgency += 1;
      reasons.urgency.push(`Calgary moving search interest rising (${ext.trendScore}/100)`);
    }

    if (ext.socialProofBump) {
      scores.social_proof += 2;
      reasons.social_proof.push('search demand is high — crowded market, proof decides');
    }

    const priceTerm = ext.trendingTerms.find((term) => {
      const lower = term.toLowerCase();
      return PRICE_INTENT_TERMS.some((needle) => lower.includes(needle));
    });
    if (priceTerm) {
      scores.price_anchor += 2;
      reasons.price_anchor.push(`"${priceTerm}" is a rising search — buyers are costing it out`);
    }
  }

  const angle = (Object.keys(scores) as CreativeAngle[]).reduce((best, candidate) => {
    if (scores[candidate] > scores[best]) return candidate;
    if (scores[candidate] < scores[best]) return best;
    return ANGLE_TIE_BREAK.indexOf(candidate) < ANGLE_TIE_BREAK.indexOf(best)
      ? candidate
      : best;
  }, 'social_proof' as CreativeAngle);

  // Always stated, so a rationale never implies more evidence than there was.
  const context = [
    `${market.season} season`,
    market.area ?? 'no leading area',
    market.moveTypeKey ? MOVE_TYPE_LABELS[market.moveTypeKey] ?? 'mixed loads' : 'mixed loads',
    market.hasDemandSignal
      ? `${market.bookingCount} moves / ${market.leadCount} enquiries`
      : 'window too thin to read demand',
  ].join(', ');

  const picked = reasons[angle];

  return {
    angle,
    rationale: `${ANGLE_DIRECTION[angle].label}: ${
      picked.length
        ? picked.join('; ')
        : 'nothing in the window argued for a sharper angle — proof is the safe default'
    } (${context})`,
    season: market.season,
    area: market.area,
    city: isOffCalgary && market.area ? market.area : 'Calgary',
    moveType: market.moveTypeKey ? MOVE_TYPE_LABELS[market.moveTypeKey] ?? null : null,
    scores,
    windowDays: 0,
    bookingCount: market.bookingCount,
    leadCount: market.leadCount,
    hasDemandSignal: market.hasDemandSignal,
    externalSignals: ext ?? null,
    promptStyleHint: ext?.promptStyles.length
      ? ext.promptStyles.slice(0, 3).join(', ')
      : undefined,
    decidedAt: (market.now ?? new Date()).toISOString(),
  };
}

/** Quadrant codes read badly in a prompt; Seedance does better with words. */
const QUADRANT_WORDS: Record<string, string> = {
  NW: 'northwest', NE: 'northeast', SW: 'southwest', SE: 'southeast',
};

/** One prompt-safe line describing where and when this video is set. */
export function marketSetting(strategy: CreativeStrategy): string {
  const season =
    strategy.season === 'peak'
      ? 'bright high-summer daylight'
      : strategy.season === 'winter'
        ? 'crisp winter light, snow on the ground'
        : 'clear shoulder-season light, bare trees';

  // strategy.area only ever holds a value from CALGARY_AREAS or a quadrant, so
  // no customer-typed address text can reach the prompt through here.
  //
  // The three shapes have to be phrased differently: a quadrant ("Calgary SE")
  // is already a city reference, a named neighbourhood sits inside Calgary, and
  // an off-Calgary town does not.
  const quadrant = strategy.area?.startsWith('Calgary ')
    ? QUADRANT_WORDS[strategy.area.slice('Calgary '.length)]
    : undefined;

  const place = !strategy.area
    ? 'Calgary, Alberta'
    : quadrant
      ? `${quadrant} Calgary`
      : OFF_CALGARY_CITIES.has(strategy.area)
        ? `${strategy.area}, Alberta`
        : `${strategy.area}, Calgary`;

  return `Set in ${place}, ${season}`;
}

// The market read is the same for every item generated in a batch, so it is
// cached briefly rather than re-queried per video. generateTrendPost can submit
// several renders in one run.
const STRATEGY_CACHE_MS = 15 * 60 * 1000;

// Longer than TREND_WINDOW_DAYS: a weekly window is the right lens for "what
// happened this week" copy, but too jumpy to steer creative strategy on.
const STRATEGY_WINDOW_DAYS = 90;

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
  /**
   * Seconds, 4-15. Named to match content_items.duration_seconds and to keep it
   * distinct from GenerateVideoScriptInput.duration, which paces a spoken
   * script and defaults to 30. Omitted falls back to the item's stored value,
   * then to HIGGSFIELD_DEFAULT_DURATION.
   */
  durationSeconds?: number;
  /** Force an angle instead of letting the market decide. Admin override. */
  angle?: CreativeAngle;
}

interface GenerateCreativeBriefInput {
  contentItemId: string;
  concept?: string;
  /** Force an angle instead of letting the market decide. Admin override. */
  angle?: CreativeAngle;
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

  /**
   * Shared across instances: the market read is a property of the market, not of
   * an agent instance, and the queue worker constructs Ember per job.
   */
  private static strategyCache: { at: number; strategy: CreativeStrategy } | null = null;

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
  private async gatherTrendData(
    windowDays: number = TREND_WINDOW_DAYS,
  ): Promise<TrendSnapshot> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    // Ordered newest-first because of the 500-row cap below: unordered, a window
    // wider than the cap returns an arbitrary 500 rows and the tallies describe
    // whatever the planner happened to scan. The 7-day window never came close
    // to the cap, but STRATEGY_WINDOW_DAYS can.
    const recentLeads = await db
      .select({ sourceChannel: leads.sourceChannel })
      .from(leads)
      .where(and(gte(leads.createdAt, since), eq(leads.leadType, 'b2c')))
      .orderBy(desc(leads.createdAt))
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
      .orderBy(desc(bookings.createdAt))
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
      windowDays,
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

  /**
   * Research the market, then pick the angle — the step that used to be missing.
   *
   * Reuses gatherTrendData over a 90-day window rather than running a second
   * researcher, so there is one definition of "what the Calgary market is doing"
   * and the trend copy and the video creative cannot disagree about it.
   */
  private async buildCreativeStrategy(): Promise<CreativeStrategy> {
    const cached = EmberAgent.strategyCache;
    if (cached && Date.now() - cached.at < STRATEGY_CACHE_MS) {
      return cached.strategy;
    }

    const now = new Date();
    let snapshot: TrendSnapshot | null = null;
    // Our own data and the external read are independent, so they overlap rather
    // than queue. fetchExternalSignals never rejects; gatherTrendData still can.
    const [snapshotResult, externalSignals] = await Promise.all([
      this.gatherTrendData(STRATEGY_WINDOW_DAYS).then(
        (value) => ({ ok: true as const, value }),
        (err) => ({ ok: false as const, err }),
      ),
      fetchExternalSignals(),
    ]);
    if (snapshotResult.ok) {
      snapshot = snapshotResult.value;
    } else {
      // A research failure must not block the render. Season alone still beats
      // the generic prompt this replaced.
      logger.warn({ err: snapshotResult.err }, '[Ember] market research failed — season-only strategy');
    }

    const topArea = snapshot?.topAreas[0] ?? null;
    const topLoad = snapshot?.loadSizes[0] ?? null;
    const bookingCount = snapshot?.bookingCount ?? 0;

    const strategy = selectCreativeAngle({
      season: seasonFor(now),
      area: topArea?.label ?? null,
      // Share of bucketable moves, not of all moves — bucketArea returns null for
      // any address that matches no known area, and those are not in the tally.
      areaShare:
        topArea && bookingCount > 0 ? topArea.count / bookingCount : 0,
      moveTypeKey: topLoad?.label ?? null,
      bookingCount,
      leadCount: snapshot?.leadCount ?? 0,
      hasDemandSignal: snapshot?.hasStats ?? false,
      externalSignals,
      now,
    });
    strategy.windowDays = snapshot?.windowDays ?? 0;

    logger.info(
      {
        angle: strategy.angle,
        season: strategy.season,
        area: strategy.area,
        moveType: strategy.moveType,
        scores: strategy.scores,
        trendScore: strategy.externalSignals?.trendScore ?? null,
        promptStyleHint: strategy.promptStyleHint ?? null,
      },
      '[Ember] creative strategy selected',
    );

    EmberAgent.strategyCache = { at: Date.now(), strategy };
    return strategy;
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

    // Research first. The brief is where the angle is fixed, and
    // generateHiggsfieldVideo composes its prompt from these fields — so
    // deciding here is what keeps the footage, the caption and the CTA arguing
    // the same thing instead of three unrelated ideas.
    const strategy = await this.resolveStrategy(existing, input.angle);
    const direction = ANGLE_DIRECTION[strategy.angle];

    const systemPrompt = `You are Ember Lane, LervIT's creative director.
Write a directorial brief for a piece of video/social content.

${LERVIT_BRAND}

MARKET RESEARCH — this is the market this piece is for:
- City: ${strategy.city}
- Most active area: ${strategy.area ?? 'no single area leading'}
- Typical move right now: ${strategy.moveType ?? 'mixed'}
- Season: ${strategy.season}

CHOSEN ANGLE — ${direction.label}. Do not substitute a different angle.
- What it has to do: ${direction.intent}
- Visual direction: ${direction.visual}
- The line to land: ${direction.callout}${
  strategy.promptStyleHint ? `\n- Style hint: ${strategy.promptStyleHint}` : ''
}${
  strategy.externalSignals?.trendingTerms.length
    ? `\n- Trending search terms (weave in naturally): ${strategy.externalSignals.trendingTerms.join(', ')}`
    : ''
}

Every field below must serve that angle. A brief that would read the same for
any other angle is wrong.

Output STRICT JSON only — no prose, no markdown fence:
{
  "concept": "one-sentence creative concept, built on the chosen angle",
  "mood": "adjectives describing tone",
  "palette": ["#hex1", "#hex2"],
  "visualStyle": "one sentence — camera, lighting, composition",
  "audio": "music/sfx direction",
  "textOverlays": ["on-screen text 1", "on-screen text 2"],
  "callout": "the single line viewers should remember"
}${CREATIVEOS_APPENDIX}`;

    const userMessage = `Brief the visual/tonal direction for: ${concept}
Platform: ${item.platform ?? 'social'}
Type: ${item.type}
Angle: ${direction.label}
Market: ${strategy.city}${strategy.area ? ` (${strategy.area})` : ''}, ${strategy.season} season`;

    const raw = await this.callAnthropic(systemPrompt, userMessage, 800);

    let parsed: any;
    try {
      parsed = this.parseJson(raw);
    } catch {
      return { error: 'parse_failed' };
    }

    // Merge into existing brief rather than replacing (createCampaign put concept/week/etc there).
    // marketStrategy is stored alongside so the decision is auditable in the
    // admin preview, and so the render reuses this angle rather than re-deciding
    // against a market that may have moved on since the brief was written.
    const merged = { ...existing, ...parsed, marketStrategy: strategy };

    await db
      .update(contentItems)
      .set({ creativeBrief: merged, updatedAt: new Date() })
      .where(eq(contentItems.id, input.contentItemId));

    return {
      generated: true,
      contentItemId: input.contentItemId,
      angle: strategy.angle,
      rationale: strategy.rationale,
      brief: merged,
    };
  }

  /**
   * The angle for a piece, in precedence order: an explicit override, then the
   * one already recorded on the brief, then a fresh market read.
   *
   * Reusing the stored decision matters — a brief written in August under an
   * urgency angle must not be rendered in November against a price angle, which
   * is what re-deciding at render time would do.
   */
  private async resolveStrategy(
    brief: any,
    override?: CreativeAngle,
  ): Promise<CreativeStrategy> {
    if (override && ANGLE_DIRECTION[override]) {
      const strategy = await this.buildCreativeStrategy();
      return {
        ...strategy,
        angle: override,
        rationale: `${ANGLE_DIRECTION[override].label}: set explicitly by the caller`,
      };
    }

    const stored = brief?.marketStrategy as CreativeStrategy | undefined;
    if (stored?.angle && ANGLE_DIRECTION[stored.angle]) return stored;

    return this.buildCreativeStrategy();
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

    // Research the market and fix the angle before composing anything. This
    // used to go straight to a fixed "Calgary urban environment" string, so
    // every render in the system was shot in the same nowhere-in-particular
    // regardless of who was actually buying that month.
    const strategy = await this.resolveStrategy(brief, input.angle);
    const direction = ANGLE_DIRECTION[strategy.angle];

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
      // The angle's camera and action direction, and the real place/season it
      // is set in — both derived from the market read, not hardcoded.
      direction.visual,
      marketSetting(strategy),
      strategy.promptStyleHint ? `Style: ${strategy.promptStyleHint}` : null,
      'Professional cinematography',
      'No text overlays',
      'No dialogue',
    ]
      .filter(Boolean)
      .map((part) => String(part).trim().replace(/\.$/, ''))
      .join('. ');

    // Even a caller-supplied prompt gets the angle and setting appended, so an
    // ad-hoc submit is still market-aware rather than falling back to the old
    // fixed "premium, urban Calgary" tail.
    const prompt =
      input.prompt
        ? [
            input.prompt.trim().replace(/\.$/, ''),
            direction.visual,
            marketSetting(strategy),
            'Professional lighting',
            'No text overlays',
            'No dialogue',
          ].join('. ')
        : visualPrompt || 'Calgary moving lifestyle, cinematic, professional';

    // An explicit request wins; otherwise reuse whatever length this item was
    // last submitted at, so a resubmit after a failed render reproduces the
    // same video rather than silently switching to the default. Clamped here
    // with the same function the provider uses, so the row records the number
    // the API is actually given.
    const durationSeconds = clampDuration(input.durationSeconds ?? item.durationSeconds);

    // Record the angle on the brief when it came from a fresh read rather than
    // from the brief itself, so the item carries the decision its footage was
    // shot for and a later resubmit reuses it.
    await db
      .update(contentItems)
      .set({
        status: 'generating',
        durationSeconds,
        creativeBrief: { ...brief, marketStrategy: strategy },
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, input.contentItemId));

    try {
      const job = await higgsfieldProvider.createVideo({
        // Both branches above already carry the angle direction and the market
        // setting, so nothing is appended here any more.
        prompt,
        duration: durationSeconds,
        platform: item.platform ?? undefined,
      });

      await db
        .update(contentItems)
        .set({
          providerJobId: job.jobId,
          generator: 'higgsfield',
          // New job id, fresh retry budget — otherwise a resubmit inherits the
          // exhausted counter from the attempt that failed and the poller
          // gives up on it immediately.
          higgsfieldPollAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, input.contentItemId));

      await emitEvent(
        'ember.higgsfield_video_submitted',
        'agent',
        'ember',
        {
          contentItemId: input.contentItemId,
          jobId: job.jobId,
          durationSeconds,
          angle: strategy.angle,
        },
        'agent',
      );

      return {
        submitted: true,
        contentItemId: input.contentItemId,
        jobId: job.jobId,
        durationSeconds,
        angle: strategy.angle,
        rationale: strategy.rationale,
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

    // The approve route flips the item to 'published' before this runs and
    // returns {ok:true} immediately, so a failure here is the only record that
    // the post never went out. Roll the item back to 'qa' rather than leaving
    // it reading as published — from 'qa' it can be approved again.
    const rollbackToQa = async (reason: string) => {
      await db
        .update(contentItems)
        .set({ status: 'qa', publishedAt: null, updatedAt: new Date() })
        .where(eq(contentItems.id, input.contentItemId));

      logger.error(
        { contentItemId: input.contentItemId, platform, reason },
        '[Ember] publish failed — item rolled back to qa',
      );
    };

    let results: Array<{ postId: string; platform: string; url?: string; error?: string }>;

    try {
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
    } catch (err: any) {
      // The media guards above throw, and a provider can too.
      const message = err?.message ?? String(err);
      await rollbackToQa(message);
      return {
        success: false,
        platform,
        error: true,
        message,
        contentItemId: input.contentItemId,
      };
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
      await rollbackToQa(first?.error ?? 'provider returned no post id');
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
