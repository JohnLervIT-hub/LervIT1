-- 0015 — Ember Phase 2: campaigns + content_items
-- HeyGen (presenter) and Higgsfield (cinematic) video jobs land here as content_items.
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS campaigns (
  id             varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  objective      text        NOT NULL,
  audience       text        NOT NULL,
  offer          text,
  platforms      text[],
  duration_days  integer     DEFAULT 30,
  status         text        DEFAULT 'draft',        -- draft | active | completed | paused
  content_plan   jsonb,
  start_date     timestamp,
  end_date       timestamp,
  created_by     text        DEFAULT 'ember',
  created_at     timestamp   NOT NULL DEFAULT now(),
  updated_at     timestamp   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_items (
  id                varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       varchar     REFERENCES campaigns(id),
  type              text        NOT NULL,             -- blog | social | heygen_video | higgsfield_video | newsletter | gmb
  objective         text,
  platform          text,
  status            text        DEFAULT 'draft',      -- draft | generating | qa | approved | published | failed
  script            text,
  creative_brief    jsonb,
  caption           text,
  hashtags          text[],
  cta               text,
  aspect_ratio      text,
  generator         text,                             -- heygen | higgsfield | ember | manual
  provider_job_id   text,
  video_url         text,
  thumbnail_url     text,
  asset_url         text,
  qa_results        jsonb,
  approved_by       text,
  approved_at       timestamp,
  published_at      timestamp,
  cost_estimate     text,
  created_at        timestamp   NOT NULL DEFAULT now(),
  updated_at        timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status       ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_content_items_campaign ON content_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_items_status   ON content_items(status);

COMMIT;
