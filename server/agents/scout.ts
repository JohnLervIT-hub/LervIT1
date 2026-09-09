/**
 * Scout Reid (HUNTER-D) — customer demand prospecting.
 *
 * Actions:
 *   - `process_signals`     : full daily run — crawls all sources, scores,
 *                             creates leads, routes high-intent to Alex.
 *   - `crawl_google_alerts` : subset — Google Alerts RSS feeds only.
 *   - `crawl_kijiji`        : subset — Kijiji Calgary listings only.
 *   - `score_lead`          : one-off scoring of a signal string.
 *
 * MVP crawlers are best-effort: RSS is straightforward, Kijiji HTML is
 * fragile (anti-bot + shifting selectors). Failures are logged and never
 * block downstream crawlers.
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
const RSS2JSON_INTER_FEED_DELAY_MS = 1000;
const KIJIJI_URLS = [
  'https://www.kijiji.ca/b-apartments-condos/calgary/c37l1700199',
  'https://www.kijiji.ca/b-moving-storage/calgary/c146l1700199',
] as const;
const MOVING_KEYWORDS = [
  'moving',
  'relocating',
  'must go',
  'moving sale',
  'moving out',
  'need to move',
] as const;

interface CrawlResult {
  found: number;
  created: number;
}

interface ProcessSignalsResult {
  googleAlerts: number;
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
      kijiji: 0,
      leadsCreated: 0,
      leadsRouted: 0,
    };

    try {
      const ga = await this.crawlGoogleAlerts();
      results.googleAlerts = ga.found;
      results.leadsCreated += ga.created;
    } catch (err) {
      logger.error({ err }, 'Scout: Google Alerts crawl failed');
    }

    try {
      const kj = await this.crawlKijiji();
      results.kijiji = kj.found;
      results.leadsCreated += kj.created;
    } catch (err) {
      logger.error({ err }, 'Scout: Kijiji crawl failed');
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

    // Google Alerts RSS URLs are per-Google-account private feeds — fetching
    // them from a server yields non-200 without the account cookies. Proxy
    // via rss2json.com, which fetches the RSS from its own IPs with a
    // browser-like User-Agent and returns parsed JSON. rss2json's free
    // tier is rate-limited (~10 req/min); a 1s inter-feed delay + optional
    // api_key avoid intermittent 429s on the last few feeds.
    const rss2jsonApiKey = process.env.RSSBRIDGE_API_KEY?.trim();

    for (let i = 0; i < feeds.length; i++) {
      if (i > 0) await sleep(RSS2JSON_INTER_FEED_DELAY_MS);
      const feedUrl = feeds[i];

      try {
        const params = new URLSearchParams({ rss_url: feedUrl });
        if (rss2jsonApiKey) params.set('api_key', rss2jsonApiKey);
        const proxyUrl = `https://api.rss2json.com/v1/api.json?${params.toString()}`;

        const response = await fetch(proxyUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!response.ok) {
          logger.warn(
            { feedUrl, status: response.status },
            'Scout: rss2json fetch non-200',
          );
          continue;
        }
        const data = (await response.json()) as {
          status?: string;
          message?: string;
          items?: Array<{ title?: string; description?: string; link?: string }>;
        };
        if (data.status !== 'ok' || !Array.isArray(data.items)) {
          logger.warn(
            { feedUrl, status: data.status, message: data.message },
            'Scout: rss2json returned non-ok response',
          );
          continue;
        }

        for (const item of data.items) {
          found++;
          const title = (item.title ?? '').trim();
          const description = (item.description ?? '').trim();
          const link = (item.link ?? '').trim();
          const fingerprint = link || title;
          if (!fingerprint) continue;

          const score = await this.scoreSignal(`${title} ${description}`);
          logger.info(
            { score, title: title.slice(0, 80) },
            'Scout: signal scored',
          );
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
            logger.info(
              { score, title: title.slice(0, 50) },
              'Scout: lead created',
            );
          } catch (err) {
            logger.error(
              { err: (err as Error).message, title: title.slice(0, 80) },
              'Scout: lead insert failed',
            );
          }
        }
      } catch (err) {
        logger.error({ err, feedUrl }, 'Scout: Google Alerts feed failed');
      }
    }

    return { found, created };
  }

  private async crawlKijiji(): Promise<CrawlResult> {
    let found = 0;
    let created = 0;

    for (const url of KIJIJI_URLS) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-CA,en;q=0.9',
          },
        });
        if (!response.ok) {
          logger.warn({ url, status: response.status }, 'Scout: Kijiji fetch non-200');
          continue;
        }
        const html = await response.text();

        const titleMatches = html.match(/data-testid="listing-title"[^>]*>([^<]+)</g) ?? [];
        for (const raw of titleMatches.slice(0, 20)) {
          found++;
          const title = raw.replace(/data-testid[^>]+>/, '').replace(/<[^>]+>/g, '').trim();
          const hasIntent = MOVING_KEYWORDS.some(kw => title.toLowerCase().includes(kw));
          if (!hasIntent) continue;

          if (await this.wasSignalSeen('kijiji', title)) continue;

          await db.insert(leads).values({
            contactName: 'Kijiji User',
            sourceChannel: 'kijiji',
            utmSource: 'kijiji',
            intentScore: 65,
            status: 'new',
            notes: `Kijiji listing: ${title}\nSection: ${url}`,
          });
          created++;
        }
      } catch (err) {
        logger.error({ err, url }, 'Scout: Kijiji crawl failed');
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
