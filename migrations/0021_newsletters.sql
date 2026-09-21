-- 0021 — Ember newsletter drafts
-- generate_newsletter previously returned its draft to the caller and
-- persisted nothing, so the monthly cron left no retrievable copy.
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS newsletters (
  id            varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  subject       text      NOT NULL,
  preheader     text,
  html          text      NOT NULL,
  status        text      NOT NULL DEFAULT 'pending_review', -- pending_review | approved | sent
  generated_by  text      DEFAULT 'ember',
  sent_at       timestamp,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS newsletters_status_idx ON newsletters(status);

COMMIT;
