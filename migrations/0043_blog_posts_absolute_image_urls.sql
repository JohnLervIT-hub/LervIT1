-- Blog image paths were stored relative ('/assets/stock_images/x.jpg'). The
-- files are served by the marketing site (website-standalonezip/public/assets)
-- and 404 on the app host, so a relative path only resolves for a reader
-- already browsing lervit.com. Every other consumer of /api/blog — email, the
-- app itself, a partner feed — renders a broken image.
--
-- Ember now writes absolute URLs (server/agents/ember.ts, MARKETING_SITE_URL).
-- This backfills the rows written before that.
--
-- Idempotent by construction: once a row is rewritten it starts with 'https://'
-- and no longer matches LIKE '/%'. Safe to re-run on every boot, which
-- scripts/sync-schema.sql does.
--
-- The host is literal here because SQL cannot read MARKETING_SITE_URL. If that
-- env var is ever pointed somewhere else, this statement needs the same edit.
UPDATE blog_posts
   SET image = 'https://lervit.com' || image
 WHERE image LIKE '/%';
