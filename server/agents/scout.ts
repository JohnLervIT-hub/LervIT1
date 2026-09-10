/**
 * Scout Reid (HUNTER-D) — customer demand prospecting.
 *
 * Actions:
 *   - `process_signals`     : full daily run — crawls all sources, scores,
 *                             creates leads, routes high-intent to Alex.
 *   - `crawl_google_alerts` : subset — Google Alerts RSS via rss2json.
 *   - `crawl_reddit`        : subset — Reddit .rss feeds via rss2json.
 *   - `crawl_rentfaster`    : subset — RentFaster Calgary RSS via rss2json.
 *   - `crawl_craigslist`    : subset — Craigslist Calgary housing RSS via rss2json.
 *   - `crawl_kijiji`        : subset — Kijiji Calgary category RSS via rss2json.
 *   - `score_lead`          : one-off scoring of a signal string.
 *
 * All five crawl sources go through the same rss2json proxy — no browser,
 * no scraper, no system chromium. Any single crawler failure is logged
 * and swallowed so the other sources still run.
 */

import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { BaseAgent } from './base';
import { db } from '../db';
import { leads } from '@shared/schema';
import { emitEvent } from '../events';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';

const SCOUT_MODEL = 'claude-haiku-4-5-20251001';
const HIGH_INTENT_THRESHOLD = 70;
// Google Alerts carries local news / development stories which are weaker
// per-item intent signals than a Kijiji "moving sale" post. The scoring
// prompt has explicit figurative-language rules now, so 50 is a fair
// gate for creating a lead vs. logging-only.
const GOOGLE_ALERTS_CREATE_THRESHOLD = 50;
const REDDIT_CREATE_THRESHOLD = 50;
const KIJIJI_CREATE_THRESHOLD = 45;
const RENTFASTER_STATIC_SCORE = 55;
const CRAIGSLIST_STATIC_SCORE = 45;
// rss2json's free tier is roughly 10 req/min without an API key. All Scout
// RSS crawlers share this budget, so we pace every rss2json call by 2s.
const RSS2JSON_INTER_FEED_DELAY_MS = 2000;

// Reddit's public JSON API now returns 403 for unauthenticated User-Agents.
// The .rss endpoint is served without auth (with browser-friendly caching)
// and rss2json parses it identically to any other feed.
const REDDIT_FEEDS = [
  'https://www.reddit.com/r/Calgary/search.rss?q=moving+mover+delivery&sort=new',
  'https://www.reddit.com/r/Calgary/search.rss?q=need+mover+calgary&sort=new',
  'https://www.reddit.com/r/calgaryhousing/new.rss',
] as const;

// Kijiji publishes an RSS feed per category. Going through rss2json avoids
// the anti-bot fingerprinting that killed the browser-fetch and
// puppeteer-based approaches. See docs/strategies/puppeteer-scraping.md.
const KIJIJI_FEED =
  'https://www.kijiji.ca/rss-srp-moving-storage/city-of-calgary/c146l1700199';
const KIJIJI_MAX_ITEMS = 15;

const RENTFASTER_FEED = 'https://www.rentfaster.ca/rss/?city=calgary';
const RENTFASTER_MAX_ITEMS = 10;

const CRAIGSLIST_FEED = 'https://calgary.craigslist.org/search/hhh?format=rss';
const CRAIGSLIST_MAX_ITEMS = 10;

interface CrawlResult {
  found: number;
  created: number;
}

interface ProcessSignalsResult {
  googleAlerts: number;
  reddit: number;
  rentfaster: number;
  craigslist: number;
  kijiji: number;
  leadsCreated: number;
  leadsRouted: number;
}

export class ScoutAgent extends BaseAgent {
  name = 'Scout Reid';
  code = 'hunter-d';

  protected async execute(action: string, input: Record<string, any>): Promise<any> {
    switch (action) {
      case 'process_signals':
        return this.processSignals();
      case 'crawl_google_alerts':
        return this.crawlGoogleAlerts();
      case 'crawl_reddit':
        return this.crawlReddit();
      case 'crawl_rentfaster':
        return this.crawlRentFaster();
      case 'crawl_craigslist':
        return this.crawlCraigslist();
      case 'crawl_kijiji':
        return this.crawlKijiji();
      case 'score_lead':
        return this.scoreSignal(String(input?.text ?? ''));
      default:
        throw new Error(`Scout: unknown action "${action}"`);
    }
  }

  private async processSignals(): Promise<ProcessSignalsResult> {
    const results: ProcessSignalsResult = {
      googleAlerts: 0,
      reddit: 0,
      rentfaster: 0,
      craigslist: 0,
      kijiji: 0,
      leadsCreated: 0,
      leadsRouted: 0,
    };

    try {
      const r = await this.crawlGoogleAlerts();
      results.googleAlerts = r.found;
      results.leadsCreated += r.created;
    } catch (err) {
      logger.error({ err }, 'Scout: Google Alerts failed');
    }

    try {
      const r = await this.crawlReddit();
      results.reddit = r.found;
      results.leadsCreated += r.created;
    } catch (err) {
      logger.error({ err }, 'Scout: Reddit failed');
    }

    try {
      const r = await this.crawlRentFaster();
      results.rentfaster = r.found;
      results.leadsCreated += r.created;
    } catch (err) {
      logger.error({ err }, 'Scout: RentFaster failed');
    }

    try {
      const r = await this.crawlCraigslist();
      results.craigslist = r.found;
      results.leadsCreated += r.created;
    } catch (err) {
      logger.error({ err }, 'Scout: Craigslist failed');
    }

    try {
      const r = await this.crawlKijiji();
      results.kijiji = r.found;
      results.leadsCreated += r.created;
    } catch (err) {
      logger.warn({ err }, 'Scout: Kijiji failed');
    }

    const highIntent = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.status, 'new'),
          gte(leads.intentScore, HIGH_INTENT_THRESHOLD),
          isNull(leads.assignedAgent),
        ),
      );

    const alexQueue = createAgentQueue(QUEUE_NAMES.CLOSER_D);
    for (const lead of highIntent) {
      try {
        if (alexQueue) {
          await alexQueue.add('convert_lead', { leadId: lead.id });
        } else {
          logger.warn({ leadId: lead.id }, 'Scout: alex queue unavailable — routing skipped');
        }
        await db
          .update(leads)
          .set({ assignedAgent: 'alex-morgan', updatedAt: new Date() })
          .where(eq(leads.id, lead.id));
        results.leadsRouted++;
      } catch (err) {
        logger.error({ err, leadId: lead.id }, 'Scout: failed to route lead to Alex');
      }
    }

    await emitEvent('scout.daily_run_complete', 'agent', this.code, results, 'agent');
    return results;
  }

  private async crawlGoogleAlerts(): Promise<CrawlResult> {
    const feeds = (process.env.GOOGLE_ALERT_FEEDS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (feeds.length === 0) {
      logger.info('Scout: GOOGLE_ALERT_FEEDS unset — skipping Google Alerts crawl');
      return { found: 0, created: 0 };
    }

    let found = 0;
    let created = 0;

    for (let i = 0; i < feeds.length; i++) {
      if (i > 0) await sleep(RSS2JSON_INTER_FEED_DELAY_MS);
      const feedUrl = feeds[i];

      const items = await this.fetchRss2Json(feedUrl, 'google_alerts');
      if (!items) continue;

      for (const item of items) {
        found++;
        const title = (item.title ?? '').trim();
        const description = (item.description ?? '').trim();
        const link = (item.link ?? '').trim();
        const fingerprint = link || title;
        if (!fingerprint) continue;

        const score = await this.scoreSignal(`${title} ${description}`);
        logger.info({ score, title: title.slice(0, 80) }, 'Scout: signal scored');
        if (score < GOOGLE_ALERTS_CREATE_THRESHOLD) continue;
        if (await this.wasSignalSeen('google_alerts', fingerprint)) continue;

        try {
          await db.insert(leads).values({
            contactName: 'Unknown',
            sourceChannel: 'google_alerts',
            utmSource: 'google_alerts',
            utmCampaign: 'scout-reid',
            intentScore: score,
            status: 'new',
            notes: `Signal: ${title}\nURL: ${link}\nDesc: ${description.slice(0, 200)}`,
          });
          created++;
          logger.info({ score, title: title.slice(0, 50) }, 'Scout: lead created');
        } catch (err) {
          logger.error(
            { err: (err as Error).message, title: title.slice(0, 80) },
            'Scout: lead insert failed',
          );
        }
      }
    }

    return { found, created };
  }

  private async crawlReddit(): Promise<CrawlResult> {
    let found = 0;
    let created = 0;

    for (let i = 0; i < REDDIT_FEEDS.length; i++) {
      if (i > 0) await sleep(RSS2JSON_INTER_FEED_DELAY_MS);
      const feedUrl = REDDIT_FEEDS[i];

      const items = await this.fetchRss2Json(feedUrl, 'reddit');
      if (!items) continue;

      for (const item of items) {
        const title = (item.title ?? '').trim();
        const description = (item.description ?? '').trim();
        const link = (item.link ?? '').trim();
        const fingerprint = link || title;
        if (!fingerprint || !title) continue;

        found++;
        const score = await this.scoreSignal(`${title}\n${description}`);
        logger.info({ score, title: title.slice(0, 80) }, 'Scout: signal scored');
        if (score < REDDIT_CREATE_THRESHOLD) continue;
        if (await this.wasSignalSeen('reddit', fingerprint)) continue;

        try {
          await db.insert(leads).values({
            contactName: 'Reddit User',
            sourceChannel: 'reddit',
            utmSource: 'reddit',
            utmCampaign: 'scout-reid',
            intentScore: score,
            status: 'new',
            notes:
              `Title: ${title}\n` +
              `URL: ${link}\n` +
              `Body: ${description.slice(0, 300)}`,
          });
          created++;
          logger.info({ score, title: title.slice(0, 60) }, 'Scout: reddit lead created');
        } catch (err) {
          logger.error(
            { err: (err as Error).message, title: title.slice(0, 60) },
            'Scout: reddit lead insert failed',
          );
        }
      }
    }

    return { found, created };
  }

  private async crawlRentFaster(): Promise<CrawlResult> {
    return this.crawlRssWithStaticScore({
      feedUrl: RENTFASTER_FEED,
      source: 'rentfaster',
      staticScore: RENTFASTER_STATIC_SCORE,
      maxItems: RENTFASTER_MAX_ITEMS,
      contactName: 'RentFaster Listing',
    });
  }

  private async crawlCraigslist(): Promise<CrawlResult> {
    return this.crawlRssWithStaticScore({
      feedUrl: CRAIGSLIST_FEED,
      source: 'craigslist',
      staticScore: CRAIGSLIST_STATIC_SCORE,
      maxItems: CRAIGSLIST_MAX_ITEMS,
      contactName: 'Craigslist Listing',
    });
  }

  /**
   * Shared helper for RSS sources where every item gets the same static
   * intent score (rentals/housing signals = "someone will need a mover").
   * Skips per-item Anthropic scoring on high-volume static sources.
   */
  private async crawlRssWithStaticScore(opts: {
    feedUrl: string;
    source: string;
    staticScore: number;
    maxItems: number;
    contactName: string;
  }): Promise<CrawlResult> {
    let found = 0;
    let created = 0;

    const items = await this.fetchRss2Json(opts.feedUrl, opts.source);
    if (!items) return { found: 0, created: 0 };

    for (const item of items.slice(0, opts.maxItems)) {
      found++;
      const title = (item.title ?? '').trim();
      const description = (item.description ?? '').trim();
      const link = (item.link ?? '').trim();
      const fingerprint = link || title;
      if (!fingerprint || !title) continue;
      if (await this.wasSignalSeen(opts.source, fingerprint)) continue;

      try {
        await db.insert(leads).values({
          contactName: opts.contactName,
          sourceChannel: opts.source,
          utmSource: opts.source,
          utmCampaign: 'scout-reid',
          intentScore: opts.staticScore,
          status: 'new',
          notes: `Title: ${title}\nURL: ${link}\nDesc: ${description.slice(0, 200)}`,
        });
        created++;
        logger.info(
          { source: opts.source, title: title.slice(0, 60) },
          'Scout: RSS lead created',
        );
      } catch (err) {
        logger.error(
          { err: (err as Error).message, source: opts.source, title: title.slice(0, 60) },
          'Scout: RSS lead insert failed',
        );
      }
    }

    return { found, created };
  }

  /**
   * Shared rss2json proxy fetcher. All Scout RSS sources funnel through here
   * so the API key (RSS2JSON_API_KEY, with RSSBRIDGE_API_KEY fallback for
   * back-compat), the User-Agent, and the "status:ok" parsing live in one
   * place. Returns null on any failure; each caller decides how to log it.
   */
  private async fetchRss2Json(
    feedUrl: string,
    source: string,
  ): Promise<Array<{ title?: string; description?: string; link?: string }> | null> {
    try {
      const params = new URLSearchParams({ rss_url: feedUrl });
      const apiKey =
        process.env.RSS2JSON_API_KEY?.trim() || process.env.RSSBRIDGE_API_KEY?.trim();
      if (apiKey) params.set('api_key', apiKey);
      const proxyUrl = `https://api.rss2json.com/v1/api.json?${params.toString()}`;

      // Rebuild the URL with the key redacted so we can confirm in prod logs
      // that the api_key param is actually being appended (blank env vars
      // silently drop us to rss2json's ~10 req/min free tier).
      const logParams = new URLSearchParams(params);
      if (apiKey) logParams.set('api_key', 'REDACTED');
      logger.info(
        { source, url: `https://api.rss2json.com/v1/api.json?${logParams.toString()}`, keyed: !!apiKey },
        'Scout: rss2json fetch',
      );

      const response = await fetch(proxyUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!response.ok) {
        logger.warn(
          { source, status: response.status, feedUrl },
          'Scout: rss2json fetch non-200',
        );
        return null;
      }
      const data = (await response.json()) as {
        status?: string;
        message?: string;
        items?: Array<{ title?: string; description?: string; link?: string }>;
      };
      if (data.status !== 'ok' || !Array.isArray(data.items)) {
        logger.warn(
          { source, feedUrl, status: data.status, message: data.message },
          'Scout: rss2json returned non-ok',
        );
        return null;
      }
      return data.items;
    } catch (err) {
      logger.error({ err, source, feedUrl }, 'Scout: rss2json request threw');
      return null;
    }
  }

  private async crawlKijiji(): Promise<CrawlResult> {
    // RSS via rss2json. Puppeteer was tried and archived — see
    // docs/strategies/puppeteer-scraping.md. Kijiji publishes a per-category
    // RSS feed which contains the same title/description/link data the
    // headless browser was extracting, without any of the anti-bot risk.
    let found = 0;
    let created = 0;

    const items = await this.fetchRss2Json(KIJIJI_FEED, 'kijiji');
    if (!items) return { found: 0, created: 0 };

    for (const item of items.slice(0, KIJIJI_MAX_ITEMS)) {
      const title = (item.title ?? '').trim();
      const description = (item.description ?? '').trim();
      const link = (item.link ?? '').trim();
      const fingerprint = link || title;
      if (!fingerprint || !title) continue;

      found++;
      const score = await this.scoreSignal(`${title}\n${description}`);
      logger.info({ score, title: title.slice(0, 80) }, 'Scout: signal scored');
      if (score < KIJIJI_CREATE_THRESHOLD) continue;
      if (await this.wasSignalSeen('kijiji', fingerprint)) continue;

      try {
        await db.insert(leads).values({
          contactName: 'Kijiji User',
          sourceChannel: 'kijiji',
          utmSource: 'kijiji',
          utmCampaign: 'scout-reid',
          intentScore: score,
          status: 'new',
          notes:
            `Title: ${title}\n` +
            `URL: ${link}\n` +
            `Desc: ${description.slice(0, 200)}`,
        });
        created++;
        logger.info({ score, title: title.slice(0, 60) }, 'Scout: kijiji lead created');
      } catch (err) {
        logger.error(
          { err: (err as Error).message, title: title.slice(0, 60) },
          'Scout: kijiji lead insert failed',
        );
      }
    }

    return { found, created };
  }

  private async scoreSignal(text: string): Promise<number> {
    if (!text.trim()) return 0;
    const response = await this.callClaude(
      `You are Scout Reid, a lead scoring agent for LervIT, a Calgary moving and delivery platform. Score ONLY physical moving intent.

IMPORTANT RULES:
- 'moving beyond', 'moving forward', 'moving past' = FIGURATIVE = score 0-5
- Someone physically relocating home/office = 70-100
- Someone needing furniture delivery = 60-80
- Someone selling items before a move = 50-70
- News articles about city development = 0-10
- Real estate listings (for sale/rent) = 40-60 (they signal someone will need to move)
- Job postings for movers/drivers = 0 (supply side, not demand)

Return ONLY a number 0-100.`,
      `Score this signal for moving intent:\n${text}`,
      SCOUT_MODEL,
      20,
    );
    const score = parseInt(response.trim(), 10);
    if (isNaN(score)) return 0;
    return Math.min(100, Math.max(0, score));
  }

  private async wasSignalSeen(sourceChannel: string, fingerprint: string): Promise<boolean> {
    if (!fingerprint) return false;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.sourceChannel, sourceChannel),
          sql`${leads.notes} LIKE ${'%' + fingerprint.slice(0, 120) + '%'}`,
          gte(leads.createdAt, sevenDaysAgo),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const scout = new ScoutAgent();
