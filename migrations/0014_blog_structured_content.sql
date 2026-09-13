-- 0014 — Structured blog content columns for lervit.com/blog consumption
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS sections    jsonb;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS faq         jsonb;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS top_cta     jsonb;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS bottom_cta  jsonb;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS related     text[];
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS image       text;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS read_time   text;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS old_path    text;

CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_old_path_uniq ON blog_posts(old_path) WHERE old_path IS NOT NULL;

COMMIT;
