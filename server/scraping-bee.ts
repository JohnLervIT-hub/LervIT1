/**
 * ScrapingBee HTML proxy — used for sources whose origin blocks direct
 * scraping AND blocks rss2json's fetcher (Kijiji, RentFaster, Craigslist).
 *
 * Reddit + Google Alerts still work through rss2json, so those crawlers
 * do NOT go through this helper — cheaper and no rendering overhead.
 *
 * ScrapingBee auto-handles headless render + IP rotation; we pass
 * render_js=false because these are HTML pages, not SPAs, and JS render
 * is 5x more expensive on credits.
 *
 * Returns null on any failure; the caller decides whether that means
 * "skip this source this run" (usually yes) or "hard-fail the agent"
 * (usually no).
 */

import { logger } from './logger';

const SCRAPINGBEE_ENDPOINT = 'https://app.scrapingbee.com/api/v1/';

// ScrapingBee's median response for a non-JS fetch is < 5s; anything past
// 30s is a dead scrape credit, so we fail fast instead of blocking the
// whole crawler chain (Scout's crawls are sequential).
const SCRAPINGBEE_TIMEOUT_MS = 30_000;

export async function fetchWithScrapingBee(
  url: string,
  opts: {
    source?: string;
    // render_js=true is 5× the credits (5 vs 1) but is required for
    // SPA-style pages that render their listing list client-side
    // (RentFaster is the current use case). Default false — Kijiji and
    // Craigslist render their search results server-side.
    renderJs?: boolean;
  } = {},
): Promise<string | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY?.trim();
  const source = opts.source ?? 'unknown';
  const renderJs = opts.renderJs === true;

  if (!apiKey) {
    logger.warn({ source, url }, 'ScrapingBee: SCRAPINGBEE_API_KEY not set — fetch skipped');
    return null;
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    url,
    render_js: renderJs ? 'true' : 'false',
  });
  // wait= is only respected when render_js=true; skip it otherwise so
  // ScrapingBee doesn't reject the request with an unknown-param error.
  if (renderJs) params.set('wait', '2000');
  const proxyUrl = `${SCRAPINGBEE_ENDPOINT}?${params.toString()}`;

  // Log the request with the api_key redacted so we can confirm the
  // parameter is actually being sent (same pattern as fetchRss2Json).
  const redactedParams = new URLSearchParams(params);
  redactedParams.set('api_key', 'REDACTED');
  logger.info(
    { source, url, proxied: `${SCRAPINGBEE_ENDPOINT}?${redactedParams.toString()}` },
    'ScrapingBee fetch',
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPINGBEE_TIMEOUT_MS);

  try {
    const response = await fetch(proxyUrl, { signal: controller.signal });
    if (!response.ok) {
      logger.warn(
        { source, url, status: response.status },
        'ScrapingBee fetch non-200',
      );
      return null;
    }
    const body = await response.text();
    logger.info({ source, url, bytes: body.length }, 'ScrapingBee fetch ok');
    return body;
  } catch (err) {
    logger.error({ err, source, url }, 'ScrapingBee fetch threw');
    return null;
  } finally {
    clearTimeout(timer);
  }
}
