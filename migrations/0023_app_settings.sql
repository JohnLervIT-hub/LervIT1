-- 0023 — app_settings key/value store
-- Backs the Canva Connect OAuth tokens: Canva access tokens expire in hours
-- and refresh tokens are single-use, so the pair has to be rewritten at
-- runtime and cannot live in Railway env vars.
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS app_settings (
  key         text      PRIMARY KEY,
  value       text,
  updated_at  timestamp NOT NULL DEFAULT now()
);

COMMIT;
