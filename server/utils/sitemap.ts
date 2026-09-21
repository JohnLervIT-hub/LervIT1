/**
 * Ask the marketing site to rebuild lervit.com/sitemap.xml.
 *
 * The sitemap lives in the marketing repo (JohnLervIT-hub/website-standalonezip),
 * which generates it from this app's GET /api/blog. That service also rebuilds
 * on its own TTL, so this call only shortens the window between publishing a
 * post and it appearing in the sitemap — it is a nudge, never a dependency.
 * Failures are logged and swallowed: a sitemap refresh must not fail a publish.
 *
 * Env:
 *   - MARKETING_SITE_URL (defaults to https://lervit.com)
 *   - INTERNAL_API_KEY   (must match the marketing service's value)
 */

import { logger } from '../logger';

export function notifySitemapRegenerate(reason: string): void {
  const baseUrl = process.env.MARKETING_SITE_URL ?? 'https://lervit.com';
  const internalKey = process.env.INTERNAL_API_KEY;

  if (!internalKey) {
    logger.warn(
      { reason },
      '[Sitemap] INTERNAL_API_KEY not set — skipping regenerate (marketing site will catch up on its own TTL)',
    );
    return;
  }

  void fetch(`${baseUrl}/api/sitemap/regenerate`, {
    method: 'POST',
    headers: { 'x-internal-key': internalKey },
    // Never let a slow marketing service hold a request open.
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (res) => {
      if (!res.ok) {
        logger.warn({ reason, status: res.status }, '[Sitemap] regenerate rejected');
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { urls?: number };
      logger.info({ reason, urls: body?.urls }, '[Sitemap] regenerated');
    })
    .catch((err) => logger.warn({ err, reason }, '[Sitemap] regenerate failed'));
}
