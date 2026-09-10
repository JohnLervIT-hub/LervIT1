/**
 * Ryan Brooks (HUNTER-S) — supply-side lead crawler.
 *
 * Sister agent to Scout Reid (HUNTER-D). Where Scout hunts customers looking
 * to hire movers, Ryan hunts *suppliers* — people offering moving/delivery
 * labour or vehicles, whom LervIT can recruit onto the platform.
 *
 * Sources (all Calgary-scoped, all RSS via rss2json for the same anti-bot
 * reasons documented in scout.ts):
 *   - Kijiji "Moving & Storage" services listings
 *   - Craigslist Calgary "labor / moving" (`lbs`) category
 *   - Google Alerts feeds targeted at supply-side keywords
 *     (env: GOOGLE_ALERT_SUPPLY_FEEDS — separate from GOOGLE_ALERT_FEEDS)
 *
 * Candidates scoring >= 60 get routed onto the `vetter` BullMQ queue where
 * Jordan Hayes handles first-touch recruitment.
 */

import { and, eq, gte, isNull, like } from 'drizzle-orm';
import { BaseAgent } from './base';
import { db } from '../db';
import { leads } from '@shared/schema';
import { emitEvent } from '../events';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';
import { fetchWithScrapingBee } from '../scraping-bee';
import { parseListingTitles } from './scout';

const RYAN_SCORING_MODEL = 'claude-haiku-4-5-20251001';

// rss2json's free tier is ~10 req/min. Ryan's Google Alerts crawl shares
// the same budget pool with Scout, so we pace every rss2json request by 2s.
// (Kijiji + Craigslist go through ScrapingBee instead — see below.)
const RSS2JSON_INTER_FEED_DELAY_MS = 2000;

// Kijiji + Craigslist block bot traffic at the origin (403 direct, 500 via
// rss2json), so we hit their HTML search pages through ScrapingBee.
const KIJIJI_SERVICES_HTML_URL =
  'https://www.kijiji.ca/b-moving-storage/calgary/c146l1700199';
const KIJIJI_MAX_ITEMS = 15;

const CRAIGSLIST_LABOR_HTML_URL = 'https://calgary.craigslist.org/search/lbs';
const CRAIGSLIST_MAX_ITEMS = 10;

const ROUTE_TO_JORDAN_SCORE = 60;

interface CrawlResult {
  found: number;
  created: number;
}

interface ProcessSignalsResult {
  kijiji: number;
  craigslist: number;
  googleAlerts: number;
  leadsCreated: number;
  leadsRouted: number;
}

export class RyanAgent extends BaseAgent {
  name = 'Ryan Brooks';
  code = 'hunter-s';

  protected async execute(action: string, input: Record<string, any>): Promise<any> {
    switch (action) {
      case 'process_signals':
        return this.processSignals();
      case 'crawl_kijiji_services':
        return this.crawlKijijiServices();
      case 'crawl_craigslist_labor':
        return this.crawlCraigslistLabor();
      case 'crawl_supply_alerts':
        return this.crawlGoogleAlerts();
      case 'score_candidate':
        return this.scoreCandidate(String(input?.text ?? ''));
      default:
        throw new Error(`Ryan: unknown action "${action}"`);
    }
  }

  private async processSignals(): Promise<ProcessSignalsResult> {
    const results: ProcessSignalsResult = {
      kijiji: 0,
      craigslist: 0,
      googleAlerts: 0,
      leadsCreated: 0,
      leadsRouted: 0,
    };

    try {
      const r = await this.crawlKijijiServices();
      results.kijiji = r.found;
      results.leadsCreated += r.created;
    } catch (err) {
      logger.error({ err }, 'Ryan: Kijiji Services crawl failed');
    }

    try {
      const r = await this.crawlCraigslistLabor();
      results.craigslist = r.found;
      results.leadsCreated += r.created;
    } catch (err) {
      logger.error({ err }, 'Ryan: Craigslist labor crawl failed');
    }

    try {
      const r = await this.crawlGoogleAlerts();
      results.googleAlerts = r.found;
      results.leadsCreated += r.created;
    } catch (err) {
      logger.error({ err }, 'Ryan: supply Google Alerts failed');
    }

    // Route high-intent unrouted candidates to Jordan on the vetter queue.
    const routable = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.status, 'new'),
          eq(leads.utmCampaign, 'ryan-brooks'),
          gte(leads.intentScore, ROUTE_TO_JORDAN_SCORE),
          isNull(leads.assignedAgent),
        ),
      );

    const queue = createAgentQueue(QUEUE_NAMES.VETTER);
    if (!queue) {
      logger.warn(
        { candidates: routable.length },
        'Ryan: vetter queue unavailable (REDIS_URL unset) — candidates left unrouted',
      );
    } else {
      for (const candidate of routable) {
        try {
          await queue.add('onboard_candidate', { leadId: candidate.id });
          await db
            .update(leads)
            .set({ assignedAgent: 'jordan-hayes', updatedAt: new Date() })
            .where(eq(leads.id, candidate.id));
          results.leadsRouted++;
        } catch (err) {
          logger.error({ err, leadId: candidate.id }, 'Ryan: failed to route candidate to Jordan');
        }
      }
    }

    logger.info({ results }, 'Ryan Brooks daily crawl complete');
    return results;
  }

  private async crawlKijijiServices(): Promise<CrawlResult> {
    return this.crawlScrapedListings({
      pageUrl: KIJIJI_SERVICES_HTML_URL,
      source: 'kijiji_services',
      utmSource: 'kijiji',
      contactName: 'Kijiji Poster',
      maxItems: KIJIJI_MAX_ITEMS,
    });
  }

  private async crawlCraigslistLabor(): Promise<CrawlResult> {
    return this.crawlScrapedListings({
      pageUrl: CRAIGSLIST_LABOR_HTML_URL,
      source: 'craigslist_labor',
      utmSource: 'craigslist',
      contactName: 'Craigslist Poster',
      maxItems: CRAIGSLIST_MAX_ITEMS,
    });
  }

  private async crawlGoogleAlerts(): Promise<CrawlResult> {
    const raw = process.env.GOOGLE_ALERT_SUPPLY_FEEDS?.trim();
    if (!raw) {
      logger.info('Ryan: GOOGLE_ALERT_SUPPLY_FEEDS unset — supply-alert crawl skipped');
      return { found: 0, created: 0 };
    }
    const feedUrls = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    let found = 0;
    let created = 0;
    for (let i = 0; i < feedUrls.length; i++) {
      if (i > 0) await sleep(RSS2JSON_INTER_FEED_DELAY_MS);
      const r = await this.crawlRss2JsonFeed({
        feedUrl: feedUrls[i],
        source: 'google_alerts_supply',
        utmSource: 'google_alerts',
        contactName: 'Unknown',
        maxItems: 25,
      });
      found += r.found;
      created += r.created;
    }
    return { found, created };
  }

  /**
   * ScrapingBee-backed crawler for sources blocked at origin (Kijiji /
   * Craigslist). Fetches the HTML search page, extracts titles via the
   * shared parseListingTitles helper, scores each with Haiku, dedups and
   * inserts high-scoring rows.
   */
  private async crawlScrapedListings(opts: {
    pageUrl: string;
    source: string;
    utmSource: string;
    contactName: string;
    maxItems: number;
  }): Promise<CrawlResult> {
    let found = 0;
    let created = 0;

    const html = await fetchWithScrapingBee(opts.pageUrl, { source: opts.source });
    if (!html) return { found, created };

    const titles = parseListingTitles(html, opts.source);
    if (titles.length === 0) {
      logger.warn(
        { source: opts.source, bytes: html.length },
        'Ryan: parsed 0 titles — markup may have changed',
      );
      return { found, created };
    }

    for (const title of titles.slice(0, opts.maxItems)) {
      if (!title) continue;
      found++;

      const score = await this.scoreCandidate(title);
      logger.info(
        { source: opts.source, score, title: title.slice(0, 80) },
        'Ryan: signal scored',
      );
      if (score < ROUTE_TO_JORDAN_SCORE) continue;

      const fingerprint = title.slice(0, 80);
      if (!fingerprint) continue;
      if (await this.wasSeen(opts.source, fingerprint)) continue;

      await db.insert(leads).values({
        contactName: opts.contactName,
        sourceChannel: opts.source,
        utmSource: opts.utmSource,
        utmCampaign: 'ryan-brooks',
        intentScore: score,
        status: 'new',
        notes: `${opts.source.replace('_', ' ')} listing: ${title}\nURL: ${opts.pageUrl}`,
      });
      created++;
      logger.info(
        { source: opts.source, title: title.slice(0, 60), score },
        'Ryan: supply candidate created (scraped)',
      );
    }

    return { found, created };
  }

  private async crawlRss2JsonFeed(opts: {
    feedUrl: string;
    source: string;
    utmSource: string;
    contactName: string;
    maxItems: number;
  }): Promise<CrawlResult> {
    let found = 0;
    let created = 0;

    const items = await this.fetchRss2Json(opts.feedUrl, opts.source);
    if (!items) return { found, created };

    for (const item of items.slice(0, opts.maxItems)) {
      found++;
      const title = String(item.title ?? '').trim();
      const description = String(item.description ?? '').trim();
      const link = String(item.link ?? '').trim();
      const text = `${title}\n${description}`;
      if (!text.trim()) continue;

      const score = await this.scoreCandidate(text);
      logger.info(
        { source: opts.source, score, title: title.slice(0, 80) },
        'Ryan: signal scored',
      );
      if (score < ROUTE_TO_JORDAN_SCORE) continue;

      const fingerprint = (link || title).slice(0, 80);
      if (!fingerprint) continue;
      if (await this.wasSeen(opts.source, fingerprint)) continue;

      await db.insert(leads).values({
        contactName: opts.contactName,
        sourceChannel: opts.source,
        utmSource: opts.utmSource,
        utmCampaign: 'ryan-brooks',
        intentScore: score,
        status: 'new',
        notes: `Title: ${title}\nURL: ${link}\nDesc: ${description.slice(0, 300)}`,
      });
      created++;
      logger.info(
        { source: opts.source, title: title.slice(0, 60), score },
        'Ryan: supply candidate created',
      );
    }

    return { found, created };
  }

  /**
   * Shared rss2json proxy fetcher. Mirrors Scout's helper — same headers,
   * same key fallback (RSS2JSON_API_KEY → RSSBRIDGE_API_KEY), same redacted
   * URL log so we can confirm keyed calls in prod.
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

      const logParams = new URLSearchParams(params);
      if (apiKey) logParams.set('api_key', 'REDACTED');
      logger.info(
        { source, url: `https://api.rss2json.com/v1/api.json?${logParams.toString()}`, keyed: !!apiKey },
        'Ryan: rss2json fetch',
      );

      const response = await fetch(proxyUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!response.ok) {
        logger.warn(
          { source, status: response.status, feedUrl },
          'Ryan: rss2json fetch non-200',
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
          'Ryan: rss2json returned non-ok',
        );
        return null;
      }
      return data.items;
    } catch (err) {
      logger.error({ err, source, feedUrl }, 'Ryan: rss2json request threw');
      return null;
    }
  }

  private async wasSeen(sourceChannel: string, fingerprint: string): Promise<boolean> {
    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.sourceChannel, sourceChannel),
          like(leads.notes, `%${fingerprint.slice(0, 50)}%`),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  private async scoreCandidate(text: string): Promise<number> {
    if (!text.trim()) return 0;
    const response = await this.callClaude(
      `You are Ryan Brooks, a mover recruitment agent for LervIT, Calgary's moving and delivery platform. Score signals for likelihood the poster wants to earn money doing moving or delivery work in Calgary.

SCORING RULES:
90-100: Actively offering moving / truck / delivery services in Calgary, has vehicle
70-89:  Has cargo van/truck, looking for gig work or offering occasional moving help
50-69:  Driver/labour seeking flexible work; general handyman with vehicle
30-49:  Vague work interest, unclear vehicle situation
0-29:   Not relevant, no vehicle, not Calgary, or is a CUSTOMER seeking services
        (we want suppliers, not customers)

CRITICAL RULES:
- Score 0 if the poster is LOOKING FOR a mover (they are a customer, not supply).
- Score 0 if the signal is not from Calgary or Alberta, Canada.
- Score 0 if there is no indication of vehicle ownership or physical-labour availability.

Return ONLY a number 0-100.`,
      `Score this signal:\n${text.slice(0, 500)}`,
      RYAN_SCORING_MODEL,
      20,
    );
    const score = parseInt(response.trim(), 10);
    if (isNaN(score)) return 0;
    return Math.min(100, Math.max(0, score));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const ryan = new RyanAgent();
