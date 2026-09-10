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
import { searchPlacesText } from './places-crawl';

const RYAN_SCORING_MODEL = 'claude-haiku-4-5-20251001';

// rss2json's free tier is ~10 req/min. Ryan's Google Alerts crawl shares
// the same budget pool with Scout, so we pace every rss2json request by 2s.
// (Kijiji + Craigslist go through ScrapingBee instead — see below.)
const RSS2JSON_INTER_FEED_DELAY_MS = 2000;

// Kijiji + Craigslist block bot traffic at the origin (403 direct, 500 via
// rss2json), so we hit their HTML search pages through ScrapingBee.
//
// Category ID fix: c146 canonicalises to Kijiji's "Cleaning & Housekeeping
// Jobs" category (verified via <title> probe on 2026-09-10). The correct
// "Moving & Storage" category is c144 — the URL slug is cosmetic, only the
// trailing c{cat}l{loc} tuple selects the grid. We log the fetched page's
// <title> after every crawl so a future re-numbering is easy to spot.
const KIJIJI_SERVICES_HTML_URL =
  'https://www.kijiji.ca/b-moving-storage/calgary/c144l1700199';
const KIJIJI_BASE_URL = 'https://www.kijiji.ca';
const KIJIJI_MAX_ITEMS = 15;

// Ryan hunts supply, so we scrape the "household services offered" section
// (people advertising services). Scout uses /search/lbs (labor gigs =
// customers hiring) for demand. Do not swap without also swapping scout.ts.
const CRAIGSLIST_SERVICES_HTML_URL = 'https://calgary.craigslist.org/search/hss';
const CRAIGSLIST_BASE_URL = 'https://calgary.craigslist.org';
const CRAIGSLIST_MAX_ITEMS = 10;

// Per-run cap on how many individual listing pages we fetch through
// ScrapingBee. render_js=true costs 5 credits per fetch, so 5 pages/source
// stays inside the free tier (25 credits/source, 50/run, ~1500/month with
// daily crawls — still fits ScrapingBee's 1000/mo free tier if crawls run
// every other day, and easy to lower here without redeploying selectors).
const MAX_LISTING_PAGES_PER_SOURCE = 5;

// Google Places crawl — small good-rated operators are recruitment gold:
// they've got real customers but no critical mass, so a LervIT partnership
// is a step up rather than a competitor threat. Text-search only (no
// details fetch), keeps the run at ~$0.032.
const GMAPS_SUPPLY_QUERY = 'moving companies calgary';
const GMAPS_SMALL_OPERATOR_RATING_MIN = 4.0;
// Loosened from 30 → 100 on 2026-09-10 — the sub-30 band was empty for
// Calgary (small movers still tend to accumulate 30-80 reviews once they've
// been operating a year+). 100 keeps out the multi-truck established
// brands but includes recruitable owner-operators. Refine downward once
// the sample log shows the actual review-count distribution.
const GMAPS_SMALL_OPERATOR_REVIEW_MAX = 100;
const GMAPS_MAX_OPERATORS = 10;
const GMAPS_OPERATOR_INTENT_SCORE = 70;

// Temporarily lowered from 60 → 50 to capture more candidates while the
// scoring prompt is being tuned. Raise back once scoring stabilises.
const ROUTE_TO_JORDAN_SCORE = 50;

// Kijiji/Craigslist scraped pages include navigation chrome that the
// generic title selector picks up. Filter these out before scoring so
// we don't waste Haiku calls on "Explore", "Support", etc.
const NAV_ITEMS = new Set([
  'kijiji', 'explore', 'support', 'sign in',
  'sign up', 'post ad', 'my account', 'help',
  'safety tips', 'about', 'careers', 'contact',
  'français', 'english', 'all categories',
  'my favourites', 'my messages', 'my ads',
]);

interface CrawlResult {
  found: number;
  created: number;
}

interface ProcessSignalsResult {
  kijiji: number;
  craigslist: number;
  googleAlerts: number;
  googleMaps: number;
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
      case 'crawl_craigslist_services':
        return this.crawlCraigslistServices();
      case 'crawl_supply_alerts':
        return this.crawlGoogleAlerts();
      case 'crawl_google_maps':
        return this.crawlGoogleMapsOperators();
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
      googleMaps: 0,
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
      const r = await this.crawlCraigslistServices();
      results.craigslist = r.found;
      results.leadsCreated += r.created;
    } catch (err) {
      logger.error({ err }, 'Ryan: Craigslist services crawl failed');
    }

    try {
      const r = await this.crawlGoogleAlerts();
      results.googleAlerts = r.found;
      results.leadsCreated += r.created;
    } catch (err) {
      logger.error({ err }, 'Ryan: supply Google Alerts failed');
    }

    try {
      const r = await this.crawlGoogleMapsOperators();
      results.googleMaps = r.found;
      results.leadsCreated += r.created;
    } catch (err) {
      logger.error({ err }, 'Ryan: Google Maps operator crawl failed');
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
      baseUrl: KIJIJI_BASE_URL,
      source: 'kijiji_services',
      utmSource: 'kijiji',
      contactName: 'Kijiji Poster',
      maxItems: KIJIJI_MAX_ITEMS,
      maxListingPages: MAX_LISTING_PAGES_PER_SOURCE,
    });
  }

  private async crawlCraigslistServices(): Promise<CrawlResult> {
    return this.crawlScrapedListings({
      pageUrl: CRAIGSLIST_SERVICES_HTML_URL,
      baseUrl: CRAIGSLIST_BASE_URL,
      source: 'craigslist_services',
      utmSource: 'craigslist',
      contactName: 'Craigslist Poster',
      maxItems: CRAIGSLIST_MAX_ITEMS,
      maxListingPages: MAX_LISTING_PAGES_PER_SOURCE,
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
   * Google Places crawler — surfaces small, well-rated Calgary movers as
   * recruitment candidates. No details fetch (business name + rating +
   * review count from the text search is enough context for Jordan's
   * first-touch outreach), so the whole crawl is one Places API call.
   */
  private async crawlGoogleMapsOperators(): Promise<CrawlResult> {
    let found = 0;
    let created = 0;

    const places = await searchPlacesText(GMAPS_SUPPLY_QUERY, 'google_maps_supply');
    const smallOperators = places
      .filter(
        p =>
          typeof p.rating === 'number' &&
          p.rating >= GMAPS_SMALL_OPERATOR_RATING_MIN &&
          typeof p.user_ratings_total === 'number' &&
          p.user_ratings_total > 0 &&
          p.user_ratings_total < GMAPS_SMALL_OPERATOR_REVIEW_MAX,
      )
      .slice(0, GMAPS_MAX_OPERATORS);

    // Emitted before slicing so we can see how many raw results Google
    // returned vs. how many survived the rating/review-count gate. Sample
    // capped at 3 to keep the log line lean.
    logger.info(
      {
        source: 'google_maps_supply',
        total: places.length,
        afterRatingFilter: smallOperators.length,
        ratingMin: GMAPS_SMALL_OPERATOR_RATING_MIN,
        reviewMax: GMAPS_SMALL_OPERATOR_REVIEW_MAX,
        sample: places.slice(0, 3).map(p => ({
          name: p.name,
          rating: p.rating,
          reviews: p.user_ratings_total,
        })),
      },
      'Places: filter results',
    );

    for (const place of smallOperators) {
      found++;
      const fingerprint = `place:${place.place_id}`;
      if (await this.wasSeen('google_maps_supply', fingerprint)) continue;

      try {
        await db.insert(leads).values({
          contactName: place.name,
          sourceChannel: 'google_maps_supply',
          utmSource: 'google_maps',
          utmCampaign: 'ryan-brooks',
          intentScore: GMAPS_OPERATOR_INTENT_SCORE,
          status: 'new',
          notes:
            `Small operator: ${place.name} - ${place.rating}★ (${place.user_ratings_total} reviews)\n` +
            (place.formatted_address ? `Address: ${place.formatted_address}\n` : '') +
            `Fingerprint: ${fingerprint}`,
        });
        created++;
        logger.info(
          {
            source: 'google_maps_supply',
            name: place.name,
            rating: place.rating,
            reviews: place.user_ratings_total,
          },
          'Ryan: Google Maps operator lead created',
        );
      } catch (err) {
        logger.error(
          { err: (err as Error).message, source: 'google_maps_supply', name: place.name },
          'Ryan: Google Maps operator lead insert failed',
        );
      }
    }

    return { found, created };
  }

  /**
   * ScrapingBee-backed crawler for sources blocked at origin (Kijiji /
   * Craigslist). Fetches the HTML search page, extracts title+URL pairs,
   * scores each title with Haiku, and for the top-scoring rows visits the
   * individual listing page to pull the poster's phone/email. Leads with
   * a contact detail are immediately queued to Jordan for onboarding.
   *
   * `maxListingPages` caps the number of secondary listing fetches so we
   * stay inside the ScrapingBee free tier (each JS-rendered fetch is 5
   * credits — see MAX_LISTING_PAGES_PER_SOURCE).
   */
  private async crawlScrapedListings(opts: {
    pageUrl: string;
    baseUrl: string;
    source: string;
    utmSource: string;
    contactName: string;
    maxItems: number;
    maxListingPages: number;
  }): Promise<CrawlResult> {
    let found = 0;
    let created = 0;

    const html = await fetchWithScrapingBee(opts.pageUrl, { source: opts.source, renderJs: true });
    if (!html) return { found, created };

    // Confirms which category Kijiji actually served (slug changes tend to
    // silently redirect us to the wrong grid — cleaning vs moving).
    const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
    logger.info(
      { source: opts.source, url: opts.pageUrl, pageTitle },
      'Ryan: fetched search page',
    );

    const rawItems = parseListingLinks(html, opts.source, opts.baseUrl);
    const items = rawItems.filter(
      it => it.title.length > 15 && !NAV_ITEMS.has(it.title.toLowerCase().trim()),
    );
    if (items.length === 0) {
      // Fall back to title-only parse so we don't regress the existing
      // pipeline when the anchor selectors miss but the title ones hit.
      const rawTitles = parseListingTitles(html, opts.source);
      const titles = rawTitles.filter(
        t => t.length > 15 && !NAV_ITEMS.has(t.toLowerCase().trim()),
      );
      if (titles.length === 0) {
        logger.warn(
          { source: opts.source, bytes: html.length, rawCount: rawTitles.length },
          'Ryan: parsed 0 real listings after nav filter — markup may have changed',
        );
        return { found, created };
      }
      for (const t of titles) items.push({ title: t, url: null });
      logger.info(
        { source: opts.source, titleFallback: titles.length },
        'Ryan: URL parse empty, fell back to title-only mode',
      );
    }

    const vetterQueue = createAgentQueue(QUEUE_NAMES.VETTER);
    let listingPageFetches = 0;

    for (const item of items.slice(0, opts.maxItems)) {
      const title = item.title;
      if (!title) continue;
      found++;

      const score = await this.scoreCandidate(title);
      logger.info(
        { source: opts.source, score, title: title.slice(0, 80), hasUrl: !!item.url },
        'Ryan: signal scored',
      );
      if (score < ROUTE_TO_JORDAN_SCORE) continue;

      const fingerprint = (item.url || title).slice(0, 80);
      if (!fingerprint || fingerprint.length < 5) {
        logger.warn(
          { source: opts.source, fingerprint },
          'Ryan: skipping — empty or too-short fingerprint',
        );
        continue;
      }
      if (await this.wasSeen(opts.source, fingerprint)) continue;

      // If we have a listing URL and haven't blown the per-source budget,
      // fetch the individual page for phone/email. Every fetch costs a
      // rendered ScrapingBee credit even if the extract yields nothing.
      let phone: string | null = null;
      let email: string | null = null;
      let description: string | null = null;
      if (item.url && listingPageFetches < opts.maxListingPages) {
        listingPageFetches++;
        const listingHtml = await fetchWithScrapingBee(item.url, {
          source: `${opts.source}_listing`,
          renderJs: true,
        });
        if (listingHtml) {
          // Description first, then scope email extraction to the poster's
          // own body text. Scanning the full HTML kept surfacing Kijiji's
          // Adevinta template email; if the poster didn't put their address
          // in the ad body, we'd rather return null than a false positive.
          description = extractDescription(listingHtml);
          phone = extractPhone(listingHtml);
          email = description ? extractEmail(description) : null;
          logger.info(
            {
              source: opts.source,
              url: item.url,
              hasPhone: !!phone,
              hasEmail: !!email,
              descLen: description?.length ?? 0,
            },
            'Ryan: listing page contact scan',
          );
        }
      }

      logger.info(
        {
          fingerprint: fingerprint.slice(0, 50),
          score,
          source: opts.source,
          hasContact: !!(phone || email),
        },
        'Ryan: attempting lead insert',
      );
      try {
        const notesLines = [
          `${opts.source.replace('_', ' ')} listing: ${title}`,
          `URL: ${item.url ?? opts.pageUrl}`,
        ];
        if (description) notesLines.push(description.slice(0, 200));

        const [inserted] = await db
          .insert(leads)
          .values({
            contactName: opts.contactName,
            contactEmail: email ?? undefined,
            contactPhone: phone ? `+1${phone}` : undefined,
            sourceChannel: opts.source,
            utmSource: opts.utmSource,
            utmCampaign: 'ryan-brooks',
            intentScore: score,
            status: 'new',
            notes: notesLines.join('\n'),
          })
          .returning({ id: leads.id });
        created++;
        logger.info(
          {
            source: opts.source,
            title: title.slice(0, 60),
            score,
            hasContact: !!(phone || email),
          },
          'Ryan: lead inserted successfully (scraped)',
        );

        // Contact-bearing leads skip the batch router at end of processSignals
        // — queue Jordan immediately so first-touch happens in the same run.
        if (inserted?.id && (phone || email) && vetterQueue) {
          try {
            await vetterQueue.add('onboard_candidate', { leadId: inserted.id });
            await db
              .update(leads)
              .set({ assignedAgent: 'jordan-hayes', updatedAt: new Date() })
              .where(eq(leads.id, inserted.id));
            logger.info(
              { leadId: inserted.id, source: opts.source },
              'Ryan: contact-bearing lead routed to Jordan immediately',
            );
          } catch (err) {
            logger.error(
              { err, leadId: inserted.id },
              'Ryan: immediate Jordan route failed (batch router will retry)',
            );
          }
        }
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err), source: opts.source, fingerprint },
          'Ryan: lead insert FAILED (scraped)',
        );
      }
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
      if (!fingerprint || fingerprint.length < 5) {
        logger.warn(
          { source: opts.source, fingerprint },
          'Ryan: skipping — empty or too-short fingerprint',
        );
        continue;
      }
      if (await this.wasSeen(opts.source, fingerprint)) continue;

      logger.info(
        { fingerprint: fingerprint.slice(0, 50), score, source: opts.source },
        'Ryan: attempting lead insert',
      );
      try {
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
          'Ryan: lead inserted successfully',
        );
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err), source: opts.source, fingerprint },
          'Ryan: lead insert FAILED',
        );
      }
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
      `You are Ryan Brooks, a supply-side recruiter for LervIT, Calgary's moving and delivery platform. Ryan hunts SUPPLY only — people who want to EARN MONEY as movers/drivers. Scout is the sister agent who handles DEMAND (customers needing movers).

Score 0-100 for likelihood this person wants to EARN MONEY doing moving or delivery work in Calgary.

HIGH scores (70-100):
  "Man with truck available"
  "Offering moving/delivery services"
  "Have cargo van looking for work"
  "Moving help available"
  "Driver available for hire"
  "We do deliveries Calgary"

LOW scores (0-30):
  "Looking for movers"
  "Need help moving"
  "Looking for 2 guys to move"
  "Hiring movers" (customer side)
  News articles
  Non-Calgary signals

CRITICAL:
  Someone OFFERING services = HIGH score
  Someone NEEDING services = score 0-10
  (Scout handles demand, Ryan handles supply)

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

/**
 * Pull `{ title, url }` pairs from a Kijiji/Craigslist search-results HTML
 * blob. Runs two passes:
 *   1. Anchor patterns that co-locate title text with href (best case).
 *   2. URL-only patterns (Kijiji server-renders anchors without inline
 *      text — title lives in a sibling node). URLs from this pass get a
 *      title derived from the URL slug so scoring still works without a
 *      secondary fetch.
 * Both passes dedupe on the absolute URL. Relative Kijiji hrefs are
 * resolved against `baseUrl`.
 */
export function parseListingLinks(
  html: string,
  source: string,
  baseUrl: string,
): Array<{ title: string; url: string | null }> {
  const byKey = new Map<string, { title: string; url: string | null }>();

  const resolve = (href: string): string | null => {
    const trimmed = href.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/')) return `${baseUrl}${trimmed}`;
    return null;
  };

  const register = (rawTitle: string, rawHref: string | null) => {
    const cleanedTitle = rawTitle.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const url = rawHref ? resolve(rawHref) : null;
    const key = url ?? cleanedTitle;
    if (!key) return;
    const existing = byKey.get(key);
    // Keep the longer/richer title if we hit the same URL twice.
    if (!existing || existing.title.length < cleanedTitle.length) {
      byKey.set(key, { title: cleanedTitle, url });
    }
  };

  // ─── Pass 1: title+URL anchors ───────────────────────────────────
  const titledAnchors: RegExp[] = [
    // Kijiji: newer QA hook (<a … data-qa="ad-title" href="/v-…">Title</a>)
    /<a[^>]*data-qa="ad-title"[^>]*href="([^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi,
    // Kijiji: historic listing-link testid.
    /<a[^>]*data-testid="listing-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi,
    // Kijiji: any anchor whose href starts with /v- (listing detail path).
    /<a[^>]*href="(\/v-[^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi,
  ];
  for (const re of titledAnchors) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) register(m[2], m[1]);
  }

  // Craigslist: <a class="posting-title" href="…"><span class="label">Title</span>
  const clPosting = /<a[^>]*class="[^"]*posting-title[^"]*"[^>]*href="([^"]+)"[^>]*>[\s\S]{0,300}?<span[^>]*class="[^"]*label[^"]*"[^>]*>([^<]+)</gi;
  let m: RegExpExecArray | null;
  while ((m = clPosting.exec(html)) !== null) register(m[2], m[1]);

  // Craigslist: 2024+ static search wrapper — anchor immediately after
  // `class="cl-static-search-result"` container.
  const clStatic = /class="cl-static-search-result"[\s\S]{0,400}?<a[^>]*href="([^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi;
  while ((m = clStatic.exec(html)) !== null) register(m[2], m[1]);

  // ─── Pass 2: URL-only patterns (Kijiji) ──────────────────────────
  // Standard listing detail path with trailing numeric ad id.
  const kijijiStandard = /href="(\/v-[^"]+\/[^"]+\/[^"]+\/\d+)"/g;
  while ((m = kijijiStandard.exec(html)) !== null) register('', m[1]);
  // Absolute listing URL.
  const kijijiAbsolute = /href="(https:\/\/www\.kijiji\.ca\/v-[^"]+)"/g;
  while ((m = kijijiAbsolute.exec(html)) !== null) register('', m[1]);
  // data-vip attribute (used on some card containers).
  const kijijiDataVip = /data-vip="(https:\/\/www\.kijiji\.ca\/[^"]+)"/g;
  while ((m = kijijiDataVip.exec(html)) !== null) register('', m[1]);

  // ─── Backfill titles from URL slugs where the anchor text was empty.
  Array.from(byKey.entries()).forEach(([key, entry]) => {
    if (entry.title.length >= 5 || !entry.url) return;
    const derived = titleFromUrlSlug(entry.url);
    if (derived) byKey.set(key, { title: derived, url: entry.url });
  });

  const results = Array.from(byKey.values());

  logger.info(
    {
      source,
      htmlLength: html.length,
      extractedLinks: results.length,
      withUrl: results.filter(r => r.url).length,
      sample: html.length > 11000 ? html.slice(10000, 11000) : null,
    },
    'Ryan: Kijiji link extraction sample',
  );

  return results;
}

/**
 * Kijiji embeds the ad title as a hyphenated slug in the URL path:
 *   /v-moving-packing/calgary/big-truck-friendly-movers/1712345678
 * We use that to score without a second fetch. Craigslist URLs put a
 * shorter slug in the same position, so this works there too.
 */
function titleFromUrlSlug(url: string): string | null {
  const parts = url.split('?')[0].split('#')[0].split('/').filter(Boolean);
  if (parts.length < 2) return null;
  // Trailing segment is usually the numeric ad id — use the segment
  // before it, which is the slug.
  const trailing = parts[parts.length - 1];
  const slug = /^\d+$/.test(trailing) ? parts[parts.length - 2] : trailing;
  if (!slug) return null;
  const decoded = slug.replace(/[-_+]/g, ' ').replace(/\s+/g, ' ').trim();
  return decoded.length >= 5 ? decoded : null;
}

/**
 * Kijiji surfaces the poster's phone through a `tel:` link when the seller
 * enables "show phone number". If not present we scan for a raw NANP-shaped
 * number in the page body. Everything is normalised to a 10-digit string —
 * the caller adds the `+1` country prefix before persisting.
 */
export function extractPhone(html: string): string | null {
  const patterns: RegExp[] = [
    /tel:([+\d\s()\-.]{10,})/i,
    /data-phone-number="([^"]+)"/i,
    /(\+?1?\s*\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})/,
    /(\d{3}[-.\s]\d{3}[-.\s]\d{4})/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const digits = match[1].replace(/\D/g, '');
      if (digits.length >= 10) return digits.slice(-10);
    }
  }
  return null;
}

/**
 * Substrings that identify platform/proxy addresses we never want to
 * persist as a poster's contact email. Match is `domain.includes(entry)`
 * so anonymized subdomains (`reply-abc@sale.craigslist.org`) still hit.
 *
 * `adevinta.com` is Kijiji's parent company — their template embeds a
 * staff email in every listing's shell (`mudiaga.ejenavi.ext@adevinta.com`
 * was leaking into every Kijiji lead). Kijiji itself doesn't expose
 * seller emails in listing HTML (contact goes through their messaging
 * form), so on Kijiji this function will now correctly return null
 * instead of an Adevinta false positive.
 */
const EMAIL_BLACKLIST = [
  'adevinta.com',
  'kijiji.ca',
  'ebay.com',
  'craigslist.org',
  'rentfaster.ca',
  'wixpress.com',
  'sentry.io',
  'google-analytics.com',
] as const;

export function extractEmail(text: string): string | null {
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const email = m[0];
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    if (EMAIL_BLACKLIST.some(b => domain.includes(b))) continue;
    return email;
  }
  return null;
}

/**
 * Prefer the poster's own description (Kijiji itemprop / Craigslist
 * postingbody) over the site-level meta description, which tends to be
 * generic ("Find deals on Kijiji…"). Falls back to <meta name="description">.
 */
export function extractDescription(html: string): string | null {
  const kijiji = html.match(/itemprop="description"[^>]*>([\s\S]{0,1500}?)<\/(?:div|section|p)>/i);
  if (kijiji?.[1]) return stripHtml(kijiji[1]);

  const clBody = html.match(/id="postingbody"[^>]*>([\s\S]{0,2000}?)<\/section>/i);
  if (clBody?.[1]) return stripHtml(clBody[1]);

  const meta = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
  if (meta?.[1]) return meta[1].trim();

  return null;
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export const ryan = new RyanAgent();
