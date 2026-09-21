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
import { fetchWithScrapingBee } from '../scraping-bee';
import { searchPlacesText, getPlaceDetails } from './places-crawl';
import { JAILBREAK_PREAMBLE, sanitizeForPrompt } from '../lib/promptSanitizer';

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
// Craigslist household-services listings are a mix of moving-help wanted,
// medical/property ads, and misc chores. We used to blanket-score them 45;
// now each title is scored by Claude and only >= threshold is inserted.
const CRAIGSLIST_CREATE_THRESHOLD = 50;
// rss2json's free tier is roughly 10 req/min without an API key. All Scout
// RSS crawlers share this budget, so we pace every rss2json call by 2s.
const RSS2JSON_INTER_FEED_DELAY_MS = 2000;

// Reject signals older than this. Feeds go back weeks; anything older than a
// week is stale relative to a moving decision window and just burns Haiku
// scoring credits.
const MAX_SIGNAL_AGE_DAYS = 7;

// Reddit's public JSON API now returns 403 for unauthenticated User-Agents.
// The .rss endpoint is served without auth (with browser-friendly caching)
// and rss2json parses it identically to any other feed.
// restrict_sr=1 pins search to the named subreddit — without it, Reddit's
// search widens to the entire site, which is how we ended up scoring things
// like a San Jose Puja announcement as a moving lead.
const REDDIT_FEEDS = [
  'https://www.reddit.com/r/Calgary/search.rss?q=moving+delivery+mover&sort=new&restrict_sr=1',
  'https://www.reddit.com/r/Calgary/search.rss?q=need+mover+help+moving&sort=new&restrict_sr=1',
  'https://www.reddit.com/r/calgaryhousing/new.rss',
] as const;

// Kijiji, RentFaster, and Craigslist all block bot traffic at the origin
// (403 direct, 500 through rss2json). They now go through ScrapingBee's
// HTML proxy and we parse the search-results page ourselves. Reddit +
// Google Alerts still work through rss2json.
const KIJIJI_HTML_URL =
  'https://www.kijiji.ca/b-moving-storage/calgary/c146l1700199';
const KIJIJI_MAX_ITEMS = 15;

// RentFaster's HTML listing page renders client-side (Vue) and even with
// render_js + wait we were still capturing template shells. Their RSS
// feed serves the same items as XML with zero JS — cheaper (1 credit)
// and no template noise. We hit RSS through ScrapingBee because
// RentFaster's origin blocks non-approved fetchers (both direct and
// rss2json return 5xx/403 as of Sep 2026).
const RENTFASTER_RSS_URL = 'https://www.rentfaster.ca/rss/?city=calgary';
const RENTFASTER_MAX_ITEMS = 10;

// hss = household services. Users posting here are typically requesting
// help ("Need 2 movers Saturday", "Sublet needed"). The previous /hhh
// path was housing listings which are landlord posts, not demand.
// Scout hunts demand, so we scrape the "labor gigs / labor wanted" section
// (customers hiring movers). Ryan uses /search/hss (household services
// offered = movers advertising services) for supply. Do not swap without
// also swapping ryan.ts.
const CRAIGSLIST_HTML_URL = 'https://calgary.craigslist.org/search/lbs';
const CRAIGSLIST_MAX_ITEMS = 10;

// Google Places crawl — unhappy customers of competitor moving companies.
// Rating < 3.5 tends to be a poor customer experience; recent reviews from
// those places are exactly the moving-intent signals Alex is built for.
const GMAPS_COMPETITOR_QUERY = 'moving companies calgary';
// Loosened from 3.5 → 4.0 on 2026-09-10 — the previous cutoff was empirically
// filtering out ~all Calgary movers (most maintain 4+ stars via review
// gaming), leaving Scout with no candidates. 4.0 still excludes the
// top-rated brands and catches the "3.7-3.9, quietly unhappy customers"
// band where Alex has the best chance of a switch conversation.
const GMAPS_COMPETITOR_RATING_THRESHOLD = 4.0;
const GMAPS_MAX_COMPETITORS = 10;
const GMAPS_REVIEW_INTENT_THRESHOLD = 60;
// The lead's stored intent — reviews come in noisy, so we cap the stored
// value at 75 to keep them below organic high-intent Kijiji/Reddit signals
// that go straight to Alex.
const GMAPS_LEAD_INTENT_SCORE = 75;

interface CrawlResult {
  found: number;
  created: number;
  staleFiltered: number;
}

interface ProcessSignalsResult {
  googleAlerts: number;
  reddit: number;
  rentfaster: number;
  craigslist: number;
  kijiji: number;
  googleMaps: number;
  leadsCreated: number;
  leadsRouted: number;
  staleFiltered: number;
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
      case 'crawl_google_maps':
        return this.crawlGoogleMapsCompetitors();
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
      googleMaps: 0,
      leadsCreated: 0,
      leadsRouted: 0,
      staleFiltered: 0,
    };

    try {
      const r = await this.crawlGoogleAlerts();
      results.googleAlerts = r.found;
      results.leadsCreated += r.created;
      results.staleFiltered += r.staleFiltered;
    } catch (err) {
      logger.error({ err }, 'Scout: Google Alerts failed');
    }

    try {
      const r = await this.crawlReddit();
      results.reddit = r.found;
      results.leadsCreated += r.created;
      results.staleFiltered += r.staleFiltered;
    } catch (err) {
      logger.error({ err }, 'Scout: Reddit failed');
    }

    try {
      const r = await this.crawlRentFaster();
      results.rentfaster = r.found;
      results.leadsCreated += r.created;
      results.staleFiltered += r.staleFiltered;
    } catch (err) {
      logger.error({ err }, 'Scout: RentFaster failed');
    }

    try {
      const r = await this.crawlCraigslist();
      results.craigslist = r.found;
      results.leadsCreated += r.created;
      results.staleFiltered += r.staleFiltered;
    } catch (err) {
      logger.error({ err }, 'Scout: Craigslist failed');
    }

    try {
      const r = await this.crawlKijiji();
      results.kijiji = r.found;
      results.leadsCreated += r.created;
      results.staleFiltered += r.staleFiltered;
    } catch (err) {
      logger.warn({ err }, 'Scout: Kijiji failed');
    }

    try {
      const r = await this.crawlGoogleMapsCompetitors();
      results.googleMaps = r.found;
      results.leadsCreated += r.created;
      results.staleFiltered += r.staleFiltered;
    } catch (err) {
      logger.warn({ err }, 'Scout: Google Maps competitor crawl failed');
    }

    const highIntent = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.status, 'new'),
          gte(leads.intentScore, HIGH_INTENT_THRESHOLD),
          isNull(leads.assignedAgent),
          // Demand side only. Ryan's mover candidates (b2bm) and Sam's
          // partner prospects (b2bp) sit unassigned in this same window —
          // both crawls run at 07:00 — and must not be pitched a move quote.
          eq(leads.leadType, 'b2c'),
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

  // Google Alerts serves Atom XML, not RSS. rss2json chokes on it (500/422),
  // so we pull the feed through ScrapingBee (render_js=false, 1 credit) and
  // parse the Atom entries directly. Budget: 8 demand feeds × 1 credit/run.
  private async crawlGoogleAlerts(): Promise<CrawlResult> {
    const feeds = (process.env.GOOGLE_ALERT_FEEDS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (feeds.length === 0) {
      logger.info('Scout: GOOGLE_ALERT_FEEDS unset — skipping Google Alerts crawl');
      return { found: 0, created: 0, staleFiltered: 0 };
    }

    let found = 0;
    let created = 0;
    let staleFiltered = 0;

    for (let i = 0; i < feeds.length; i++) {
      if (i > 0) await sleep(RSS2JSON_INTER_FEED_DELAY_MS);
      const feedUrl = feeds[i];

      // Guard against env parsing corruption — a comma-split accident or an
      // HTML-entity-encoded `&` produces a string that fetch() will 400 on
      // without telling us which entry was bad.
      try {
        new URL(feedUrl);
      } catch {
        logger.warn(
          { feedUrl: feedUrl.slice(0, 50) },
          'Scout: invalid GA feed URL — skipping',
        );
        continue;
      }

      // Log the last two path segments (e.g. `feeds/1234567890123`) so we can
      // identify which alert is 400ing without leaking the query token that
      // authenticates the feed.
      const feedId = new URL(feedUrl).pathname.split('/').slice(-2).join('/');

      // ScrapingBee blocks *.google.com (400), so hit the Atom feed
      // directly with a browser UA — Google Alerts serves these publicly.
      let xml: string | null = null;
      try {
        const response = await fetch(feedUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/atom+xml,application/xml,text/xml,*/*',
            'Accept-Language': 'en-CA,en;q=0.9',
          },
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          xml = await response.text();
          logger.info(
            { source: 'google_alerts', feedId, bytes: xml.length },
            'Scout: GA direct fetch ok',
          );
        } else {
          logger.warn(
            { source: 'google_alerts', feedId, status: response.status },
            'Scout: GA direct fetch non-200',
          );
        }
      } catch (err) {
        logger.error({ err, feedId }, 'Scout: GA direct fetch error');
      }
      if (!xml) continue;

      const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];

      for (const entry of entries) {
        found++;
        const rawTitle =
          entry.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? '';
        const title = rawTitle.replace(/<[^>]+>/g, '').trim();
        const link = entry.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '';
        const summary =
          entry
            .match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1]
            ?.replace(/<[^>]+>/g, '')
            .trim() ?? '';
        const updated = entry.match(/<updated>([^<]+)<\/updated>/)?.[1] ?? '';

        if (!title) continue;
        if (!isSignalFresh(updated)) {
          staleFiltered++;
          continue;
        }
        const fingerprint = link || title;

        const score = await this.scoreSignal(`${title} ${summary}`);
        logger.info(
          { score, title: title.slice(0, 80), pubDate: updated },
          'Scout: GA signal scored',
        );
        if (score < GOOGLE_ALERTS_CREATE_THRESHOLD) continue;
        if (await this.wasSignalSeen('google_alerts', fingerprint)) continue;

        try {
          await db.insert(leads).values({
            contactName: 'Unknown',
            sourceChannel: 'google_alerts',
            utmSource: 'google_alerts',
            utmCampaign: 'scout-reid',
            leadType: 'b2c',
            intentScore: score,
            status: 'new',
            notes: `Signal: ${title}\nURL: ${link}\nDesc: ${summary.slice(0, 200)}`,
          });
          created++;
          logger.info({ score, title: title.slice(0, 50) }, 'Scout: GA lead created');
        } catch (err) {
          logger.error(
            { err: (err as Error).message, title: title.slice(0, 80) },
            'Scout: GA lead insert failed',
          );
        }
      }
    }

    return { found, created, staleFiltered };
  }

  private async crawlReddit(): Promise<CrawlResult> {
    let found = 0;
    let created = 0;
    let staleFiltered = 0;

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
        if (!isSignalFresh(item.pubDate)) {
          staleFiltered++;
          continue;
        }

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
            leadType: 'b2c',
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

    return { found, created, staleFiltered };
  }

  private async crawlRentFaster(): Promise<CrawlResult> {
    // RSS path — cheaper (renderJs off) and immune to the Vue template
    // shells the HTML page kept leaking through.
    let found = 0;
    let created = 0;
    let staleFiltered = 0;

    const xml = await fetchWithScrapingBee(RENTFASTER_RSS_URL, {
      source: 'rentfaster',
      renderJs: false,
    });
    if (!xml) return { found: 0, created: 0, staleFiltered: 0 };

    const items = parseRssItems(xml).filter(item => isRealRentFasterListing(item.title));
    if (items.length === 0) {
      logger.warn(
        { source: 'rentfaster', bytes: xml.length },
        'Scout: rentfaster parsed 0 usable RSS titles',
      );
      return { found: 0, created: 0, staleFiltered: 0 };
    }

    for (const item of items.slice(0, RENTFASTER_MAX_ITEMS)) {
      if (!isSignalFresh(item.pubDate)) {
        staleFiltered++;
        continue;
      }
      const title = item.title;
      const fingerprint = title.slice(0, 50);
      if (!fingerprint) continue;
      found++;
      if (await this.wasSignalSeen('rentfaster', fingerprint)) continue;

      try {
        await db.insert(leads).values({
          contactName: 'RentFaster Listing',
          sourceChannel: 'rentfaster',
          utmSource: 'rentfaster',
          utmCampaign: 'scout-reid',
          leadType: 'b2c',
          intentScore: RENTFASTER_STATIC_SCORE,
          status: 'new',
          notes: `New rental listing: ${title}\nURL: ${RENTFASTER_RSS_URL}`,
        });
        created++;
        logger.info(
          { source: 'rentfaster', title: title.slice(0, 60) },
          'Scout: rentfaster lead created',
        );
      } catch (err) {
        logger.error(
          { err: (err as Error).message, source: 'rentfaster', title: title.slice(0, 60) },
          'Scout: rentfaster lead insert failed',
        );
      }
    }

    return { found, created, staleFiltered };
  }

  private async crawlCraigslist(): Promise<CrawlResult> {
    // Claude-scored (was static 45) — hss mixes moving requests with
    // property/medical listings that shouldn't create leads.
    let found = 0;
    let created = 0;
    let staleFiltered = 0;

    const html = await fetchWithScrapingBee(CRAIGSLIST_HTML_URL, { source: 'craigslist', renderJs: true });
    if (!html) return { found: 0, created: 0, staleFiltered: 0 };

    const dated = parseCraigslistDatedItems(html);
    const items: Array<{ title: string; pubDate: string | null }> =
      dated.length > 0
        ? dated.map(d => ({ title: d.title, pubDate: d.pubDate }))
        : parseListingTitles(html, 'craigslist').map(t => ({ title: t, pubDate: null }));
    if (items.length === 0) {
      logger.warn(
        { source: 'craigslist', bytes: html.length },
        'Scout: craigslist parsed 0 titles — markup may have changed',
      );
      return { found: 0, created: 0, staleFiltered: 0 };
    }

    for (const item of items.slice(0, CRAIGSLIST_MAX_ITEMS)) {
      const title = item.title;
      if (!title) continue;
      if (!isSignalFresh(item.pubDate)) {
        staleFiltered++;
        continue;
      }
      found++;
      const score = await this.scoreSignal(title);
      logger.info(
        { source: 'craigslist', score, title: title.slice(0, 80) },
        'Scout: signal scored',
      );
      if (score < CRAIGSLIST_CREATE_THRESHOLD) continue;

      const fingerprint = title.slice(0, 50);
      if (!fingerprint) continue;
      if (await this.wasSignalSeen('craigslist', fingerprint)) continue;

      try {
        await db.insert(leads).values({
          contactName: 'Craigslist Poster',
          sourceChannel: 'craigslist',
          utmSource: 'craigslist',
          utmCampaign: 'scout-reid',
          leadType: 'b2c',
          intentScore: score,
          status: 'new',
          notes: `Craigslist listing: ${title}\nURL: ${CRAIGSLIST_HTML_URL}`,
        });
        created++;
        logger.info(
          { source: 'craigslist', score, title: title.slice(0, 60) },
          'Scout: craigslist lead created',
        );
      } catch (err) {
        logger.error(
          { err: (err as Error).message, source: 'craigslist', title: title.slice(0, 60) },
          'Scout: craigslist lead insert failed',
        );
      }
    }

    return { found, created, staleFiltered };
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
  ): Promise<Array<{ title?: string; description?: string; link?: string; pubDate?: string }> | null> {
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
        items?: Array<{ title?: string; description?: string; link?: string; pubDate?: string }>;
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
    // Kijiji blocks rss2json (500) and direct scrapers (403), so the search
    // page comes through ScrapingBee. We regex-parse listing titles rather
    // than pulling in a full HTML parser — the payload is small and the
    // markup change surface here is worth a WARN log, not a dependency.
    let found = 0;
    let created = 0;
    let staleFiltered = 0;

    const html = await fetchWithScrapingBee(KIJIJI_HTML_URL, { source: 'kijiji', renderJs: true });
    if (!html) return { found: 0, created: 0, staleFiltered: 0 };

    const titles = parseListingTitles(html, 'kijiji');
    if (titles.length === 0) {
      logger.warn({ source: 'kijiji', bytes: html.length }, 'Scout: kijiji parsed 0 titles — markup may have changed');
      return { found: 0, created: 0, staleFiltered: 0 };
    }

    for (const title of titles.slice(0, KIJIJI_MAX_ITEMS)) {
      const fingerprint = title;
      if (!fingerprint) continue;

      found++;
      const score = await this.scoreSignal(title);
      logger.info({ score, title: title.slice(0, 80) }, 'Scout: signal scored');
      if (score < KIJIJI_CREATE_THRESHOLD) continue;
      if (await this.wasSignalSeen('kijiji', fingerprint)) continue;

      try {
        await db.insert(leads).values({
          contactName: 'Kijiji User',
          sourceChannel: 'kijiji',
          utmSource: 'kijiji',
          utmCampaign: 'scout-reid',
          leadType: 'b2c',
          intentScore: score,
          status: 'new',
          notes: `Kijiji listing: ${title}\nURL: ${KIJIJI_HTML_URL}`,
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

    return { found, created, staleFiltered };
  }

  /**
   * Google Places crawler — pulls competitors' recent negative reviews and
   * surfaces the ones with clear moving intent. Two Places API calls per
   * competitor (list + details) so the loop is capped to
   * GMAPS_MAX_COMPETITORS to keep spend at ~$0.20/run.
   */
  private async crawlGoogleMapsCompetitors(): Promise<CrawlResult> {
    let found = 0;
    let created = 0;
    let staleFiltered = 0;

    const places = await searchPlacesText(GMAPS_COMPETITOR_QUERY, 'google_maps');
    const competitors = places
      .filter(
        p =>
          typeof p.rating === 'number' &&
          p.rating < GMAPS_COMPETITOR_RATING_THRESHOLD &&
          typeof p.user_ratings_total === 'number' &&
          p.user_ratings_total > 0,
      )
      .slice(0, GMAPS_MAX_COMPETITORS);

    // Emitted before the rating filter cuts in so we can eyeball the raw
    // distribution from prod logs and re-tune GMAPS_COMPETITOR_RATING_THRESHOLD
    // without a redeploy cycle. Sample capped at 3 so a fanout doesn't bloat
    // the log line.
    logger.info(
      {
        source: 'google_maps',
        total: places.length,
        afterRatingFilter: competitors.length,
        ratingThreshold: GMAPS_COMPETITOR_RATING_THRESHOLD,
        sample: places.slice(0, 3).map(p => ({
          name: p.name,
          rating: p.rating,
          reviews: p.user_ratings_total,
        })),
      },
      'Places: filter results',
    );

    for (const place of competitors) {
      const details = await getPlaceDetails(place.place_id, 'google_maps');
      if (!details?.reviews?.length) continue;

      // Look at the most-recent low-star reviews — those are the customers
      // most likely to still be shopping for a replacement mover.
      const recent = details.reviews
        .filter(r => typeof r.rating === 'number' && r.rating <= 3 && r.text)
        .slice(0, 3);

      for (const review of recent) {
        found++;
        const score = await this.scoreSignal(
          `${review.text}\n(review of ${place.name}, ${review.rating}★)`,
        );
        logger.info(
          {
            source: 'google_maps',
            competitor: place.name,
            reviewerRating: review.rating,
            movingIntent: score,
          },
          'Scout: Google Maps review scored',
        );
        if (score < GMAPS_REVIEW_INTENT_THRESHOLD) continue;

        const fingerprint = `${place.place_id}:${review.author_name}:${review.text.slice(0, 40)}`;
        if (await this.wasSignalSeen('google_maps', fingerprint)) continue;

        try {
          await db.insert(leads).values({
            contactName: review.author_name || 'Google reviewer',
            sourceChannel: 'google_maps',
            utmSource: 'google_maps',
            utmCampaign: 'scout-reid',
            leadType: 'b2c',
            intentScore: GMAPS_LEAD_INTENT_SCORE,
            status: 'new',
            notes:
              `Unhappy customer of ${place.name} (${place.rating}★)\n` +
              `Reviewer: ${review.author_name} — ${review.rating}★ ${review.relative_time_description ?? ''}\n` +
              `Review: ${review.text.slice(0, 400)}\n` +
              `Fingerprint: ${fingerprint}`,
          });
          created++;
          logger.info(
            { source: 'google_maps', competitor: place.name, reviewer: review.author_name },
            'Scout: Google Maps lead created',
          );
        } catch (err) {
          logger.error(
            { err: (err as Error).message, source: 'google_maps', competitor: place.name },
            'Scout: Google Maps lead insert failed',
          );
        }
      }
    }

    return { found, created, staleFiltered };
  }

  private async scoreSignal(text: string): Promise<number> {
    if (!text.trim()) return 0;
    const safeText = sanitizeForPrompt(text, 'description');
    const response = await this.callClaude(
      `${JAILBREAK_PREAMBLE}

You are Scout Reid, a lead scoring agent for LervIT, a Calgary moving and delivery platform. Score ONLY physical moving intent.

CRITICAL RULE:
If the signal is NOT from Calgary or Alberta, Canada — score it 0 regardless
of moving intent. We only serve Calgary.

Cities that score 0:
San Jose, Toronto, Vancouver, Edmonton, New York, London — any non-Calgary
location. Calgary signals only.

IMPORTANT DISTINCTION (rentals):
- Someone POSTING an apartment for rent = LANDLORD (score 20-30 — they
  may need movers for tenant turnover, but it's low priority and not the
  poster's own move). Phrases like "Available September 15", "For rent",
  "Newly renovated 2BR", "$1,850/month", "pet friendly" = landlord post.
- Someone LOOKING for an apartment to rent = FUTURE MOVER (score 60-80 —
  they will need a mover when they find a place). Phrases like "looking
  for an apartment", "hunting for a rental", "need a 2BR by October".
- Someone actively planning a move = ACTIVE MOVER (score 80-95). Phrases
  like "upcoming move", "need a mover", "moving next weekend".

IMPORTANT RULES:
- 'moving beyond', 'moving forward', 'moving past' = FIGURATIVE = score 0-5
- Someone physically relocating home/office in Calgary = 70-100
- Someone needing furniture delivery in Calgary = 60-80
- Someone selling items before a Calgary move = 50-70
- News articles about city development = 0-10
- Job postings for movers/drivers = 0 (supply side, not demand)

Return ONLY a number 0-100.`,
      `<data>
Score this signal for moving intent:
${safeText}
</data>`,
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

/**
 * Fresh iff pubDate is within MAX_SIGNAL_AGE_DAYS. Missing/unparseable dates
 * pass — we'd rather score a possibly-stale item than silently drop feeds
 * that don't publish timestamps.
 */
export function isSignalFresh(pubDate: string | null | undefined): boolean {
  if (!pubDate) return true;
  try {
    const date = new Date(pubDate);
    if (isNaN(date.getTime())) return true;
    const ageDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays <= MAX_SIGNAL_AGE_DAYS;
  } catch {
    return true;
  }
}

/**
 * Same as parseRssItemTitles but also carries the item's <pubDate> so callers
 * can filter stale entries with isSignalFresh. Added when RentFaster started
 * serving multi-week-old listings mixed in with fresh ones — filtering keeps
 * Scout from re-scoring the backlog on every run.
 */
export function parseRssItems(xml: string): Array<{ title: string; pubDate: string | null }> {
  const items: Array<{ title: string; pubDate: string | null }> = [];
  const itemRegex = /<item\b[\s\S]*?<\/item>/g;
  const titleRegex = /<title\b[^>]*>([\s\S]*?)<\/title>/;
  const pubDateRegex = /<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const inner = m[0];
    const t = titleRegex.exec(inner);
    if (!t) continue;
    let raw = t[1] ?? '';
    raw = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    const cleaned = raw
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length < 5) continue;
    const p = pubDateRegex.exec(inner);
    const pubDate = p?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() || null;
    items.push({ title: cleaned, pubDate });
  }
  return items;
}

/**
 * Extract <title> content from RSS <item> blocks. Ignores the channel-level
 * <title> (the feed title itself) by requiring the title to sit inside an
 * <item>. Handles CDATA-wrapped titles too — RentFaster wraps some.
 */
export function parseRssItemTitles(xml: string): string[] {
  const titles: string[] = [];
  const itemRegex = /<item\b[\s\S]*?<\/item>/g;
  const titleRegex = /<title\b[^>]*>([\s\S]*?)<\/title>/;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const inner = m[0];
    const t = titleRegex.exec(inner);
    if (!t) continue;
    let raw = t[1] ?? '';
    // Unwrap <![CDATA[…]]> and strip any residual tags.
    raw = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    const cleaned = raw
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 5) titles.push(cleaned);
  }
  return titles;
}

/**
 * RentFaster's listing container also contains Vue template shells and
 * navigation chrome that parseListingTitles picks up as h2/listing hits.
 * Everything real is a street address / property name; the noise is UI.
 */
function isRealRentFasterListing(title: string): boolean {
  if (title.length <= 10) return false;
  if (title.includes('{{')) return false; // unrendered Vue templates
  const chromePhrases = ['Filter', 'Want more', 'Results', 'Sign in', 'Sign up', 'Refine'];
  for (const phrase of chromePhrases) {
    if (title.includes(phrase)) return false;
  }
  return true;
}

/**
 * Craigslist search-results markup pairs each listing anchor with a
 * <time datetime="…"> tag inside the same <li class="cl-static-search-result">
 * (or <li class="result-row"> on the older layout). This parser scans those
 * containers and returns title/pubDate/url triples so callers can drop stale
 * rows before the Haiku scoring pass. Returns [] on markup drift; callers
 * should fall back to parseListingTitles.
 */
export function parseCraigslistDatedItems(
  html: string,
): Array<{ title: string; pubDate: string | null; url: string | null }> {
  const results: Array<{ title: string; pubDate: string | null; url: string | null }> = [];
  const blockRegexes = [
    /<li[^>]*class="[^"]*cl-static-search-result[^"]*"[\s\S]*?<\/li>/g,
    /<li[^>]*class="[^"]*result-row[^"]*"[\s\S]*?<\/li>/g,
  ];
  const seen = new Set<string>();
  for (const blockRegex of blockRegexes) {
    let m: RegExpExecArray | null;
    while ((m = blockRegex.exec(html)) !== null) {
      const block = m[0];
      const timeMatch = block.match(/<time[^>]*datetime="([^"]+)"/);
      const linkMatch =
        block.match(/<a[^>]*href="([^"]+)"[^>]*>[\s\S]{0,300}?<span[^>]*class="[^"]*label[^"]*"[^>]*>([^<]+)</) ??
        block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/);
      if (!linkMatch) continue;
      const url = linkMatch[1].trim();
      const title = linkMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (title.length < 5) continue;
      const key = url || title;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ title, pubDate: timeMatch?.[1] ?? null, url });
    }
  }
  return results;
}

/**
 * Best-effort HTML listing-title extractor for Kijiji / RentFaster /
 * Craigslist search pages. Tries a small ordered set of selectors and
 * returns the first non-empty match set. Regex-based (not a full parser)
 * because the payloads are small, we only care about titles, and we
 * don't want to pull in cheerio just for three sites.
 *
 * Every source is logged with the selector that hit, so if a site
 * changes its markup we can see which fallback triggered (or that
 * nothing did) in prod logs without redeploying to bisect.
 */
export function parseListingTitles(html: string, source: string): string[] {
  // Ladder is ordered most-specific to least-specific. First strategy that
  // yields >= 1 usable title wins. If none match we return [] and the
  // caller logs a "parsed 0 titles" WARN so we can bisect from prod logs.
  const strategies: Array<{ label: string; regex: RegExp }> = [
    // ─── Kijiji ─────────────────────────────────────────────────────
    // Newest QA hook: <span|a data-qa="ad-title">Title</…>
    { label: 'kijiji_data_qa_title',    regex: /data-qa="ad-title"[^>]*>([^<]+)</g },
    // Historic: <a data-testid="listing-title-…">Title</a>
    { label: 'kijiji_data_testid',      regex: /data-testid="listing-title[^"]*"[^>]*>([^<]+)</g },
    // Listing card wrapper — title is a heading/anchor within the next ~800 chars.
    { label: 'kijiji_data_listing_id',  regex: /data-listing-id="[^"]*"[\s\S]{0,800}?<(?:h\d|a|span)[^>]*>([^<]+)</g },
    // Styled-components hash Kijiji ships with card titles.
    { label: 'kijiji_sc_bdvtja',        regex: /class="[^"]*\bsc-bdVTJa\b[^"]*"[^>]*>([^<]+)</g },
    // Alt: any <a> under a class that looks like a listing card.
    { label: 'kijiji_anchor_listing',   regex: /<a[^>]*class="[^"]*listing[^"]*"[^>]*>([^<]+)</g },
    // Broader: any element whose class attribute contains "listing".
    { label: 'kijiji_listing_class',    regex: /<[a-z][a-z0-9]*[^>]*class="[^"]*listing[^"]*"[^>]*>([^<]+)</gi },
    // Alt: class-based title anchors — matches <div class="title"><a>Title</a>.
    { label: 'kijiji_title_class',      regex: /class="[^"]*title[^"]*"[^>]*>\s*<a[^>]*>([^<]+)</g },
    // Semantic: <article> container with a heading/anchor inside.
    { label: 'kijiji_article',          regex: /<article[^>]*>[\s\S]{0,800}?<(?:h\d|a)[^>]*>([^<]+)</g },

    // ─── Craigslist ─────────────────────────────────────────────────
    // Current CL grid: <a class="posting-title"><span class="label">Title</span>.
    { label: 'craigslist_label',      regex: /<span[^>]*class="[^"]*\blabel\b[^"]*"[^>]*>([^<]+)</g },
    // 2024+ CL static search result wrapper.
    { label: 'craigslist_static',     regex: /class="cl-static-search-result"[\s\S]{0,400}?<a[^>]*>([^<]+)<\/a>/g },
    // Historic posting-title span nested inside anchor.
    { label: 'craigslist_posting',    regex: /<a[^>]*class="[^"]*posting-title[^"]*"[^>]*>[\s\S]{0,200}?<span[^>]*>([^<]+)<\/span>/g },
    // Alt: titlestring span.
    { label: 'craigslist_titlestr',   regex: /<span[^>]*class="[^"]*\btitlestring\b[^"]*"[^>]*>([^<]+)</g },

    // ─── RentFaster ─────────────────────────────────────────────────
    // Vue card: <div class="listing …"> … <h1|h2|h3>Title</h1|h2|h3>.
    { label: 'rentfaster_listing_h',  regex: /<div[^>]*class="[^"]*listing[^"]*"[\s\S]{0,600}?<h\d[^>]*>([^<]+)<\/h\d>/g },
    // Alt: h2 whose class includes "listing".
    { label: 'rentfaster_h2',         regex: /<h2[^>]*class="[^"]*listing[^"]*"[^>]*>([^<]+)</g },
    // Alt: any element with class="title" — RentFaster + generic.
    { label: 'rentfaster_title',      regex: /class="[^"]*\btitle\b[^"]*"[^>]*>([^<]+)</g },

    // ─── Generic fallbacks ──────────────────────────────────────────
    { label: 'generic_h3_h4',         regex: /<h[34][^>]*>([^<]+)<\/h[34]>/g },
  ];

  for (const { label, regex } of strategies) {
    const titles: string[] = [];
    let m: RegExpExecArray | null;
    // Reset lastIndex in case someone reuses this regex — /g stores state.
    regex.lastIndex = 0;
    while ((m = regex.exec(html)) !== null) {
      const raw = m[1] ?? '';
      const cleaned = raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (cleaned.length >= 5) titles.push(cleaned);
    }
    if (titles.length > 0) {
      logger.info({ source, strategy: label, count: titles.length }, 'Scout: title parse');
      return titles;
    }
  }

  return [];
}

export const scout = new ScoutAgent();
