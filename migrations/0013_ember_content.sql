-- 0013 — Ember Lane (MAGNET) content & marketing tables
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS blog_posts (
  id              varchar        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text           NOT NULL,
  slug            text           NOT NULL UNIQUE,
  excerpt         text,
  content         text           NOT NULL,
  category        text,
  tags            text[],
  seo_title       text,
  seo_description text,
  status          text           NOT NULL DEFAULT 'draft',
  published_at    timestamp,
  generated_by    text           DEFAULT 'ember',
  created_at      timestamp      NOT NULL DEFAULT now(),
  updated_at      timestamp      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON blog_posts(status);
CREATE INDEX IF NOT EXISTS blog_posts_slug_idx   ON blog_posts(slug);

CREATE TABLE IF NOT EXISTS gmb_posts (
  id            varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  content       text      NOT NULL,
  post_type     text      DEFAULT 'STANDARD',
  status        text      DEFAULT 'pending',
  gmb_post_id   text,
  published_at  timestamp,
  created_at    timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_posts (
  id           varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  platform     text      NOT NULL,          -- facebook | instagram | tiktok | linkedin
  content      text      NOT NULL,
  hashtags     text[],
  status       text      DEFAULT 'draft',   -- draft | approved | posted
  approved_by  text,
  posted_at    timestamp,
  created_at   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_posts_platform_idx ON social_posts(platform);

COMMIT;
