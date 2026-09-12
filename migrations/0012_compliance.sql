-- 0012 — verification_items reminder tracking (Aegis Ford / COMPLIANCE)
-- One-shot flags per warning window (30d / 14d / 7d before expiry) so the
-- daily scan doesn't email the same mover twice. Idempotent: safe to re-run.

BEGIN;

ALTER TABLE verification_items
  ADD COLUMN IF NOT EXISTS reminded_30d boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminded_14d boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminded_7d  boolean NOT NULL DEFAULT false;

COMMIT;
