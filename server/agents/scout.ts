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
// Google Alerts often carries local news / development stories which are
// weaker per-item intent signals than a Kijiji "moving sale" post, but
// they aggregate into useful demand context. Lower threshold for this source.
const GOOGLE_ALERTS_CREATE_THRESHOLD = 50;
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
    // browser-like User-Agent and returns parsed JSON.
    for (const feedUrl of feeds) {
      try {
        const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
        const response = await fetch(proxyUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!response.ok) {
          logger.warn({ feedUrl, status: response.status }, 'Scout: rss2json fetch non-200');
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
          logger.info({ title, score }, 'Scout: signal scored');
          if (score < GOOGLE_ALERTS_CREATE_THRESHOLD) continue;

          if (await this.wasSignalSeen('google_alerts', fingerprint)) continue;

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
          logger.info({ title, score }, 'Scout: lead created from google_alerts');
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
      `You are Scout Reid, a lead scoring agent for LervIT, a Calgary moving platform.
Score moving intent 0-100.
100 = actively looking for a mover right now
70  = planning a move in next 30 days
50  = considering a move
30  = general interest
0   = no moving intent
Return ONLY a number, nothing else.`,
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

function parseRssItems(xml: string): Array<{ title: string; description: string; link: string }> {
  const items: Array<{ title: string; description: string; link: string }> = [];
  const itemMatches = xml.match(/<(?:item|entry)>[\s\S]*?<\/(?:item|entry)>/g) ?? [];
  for (const raw of itemMatches) {
    const title =
      raw.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ??
      raw.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ??
      '';
    const description =
      raw.match(/<(?:description|summary)[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/(?:description|summary)>/)?.[1] ??
      raw.match(/<(?:description|summary)[^>]*>([\s\S]*?)<\/(?:description|summary)>/)?.[1] ??
      '';
    const link =
      raw.match(/<link[^>]*href="([^"]+)"/)?.[1] ??
      raw.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] ??
      '';
    if (title.trim()) {
      items.push({ title: title.trim(), description: description.trim(), link: link.trim() });
    }
  }
  return items;
}

export const scout = new ScoutAgent();
