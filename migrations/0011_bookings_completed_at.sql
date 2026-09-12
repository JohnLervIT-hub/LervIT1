-- 0011 — bookings.completed_at
-- Authoritative completion timestamp for RETAIN dormancy scans.
-- Backfills from updated_at where status='completed' so historical rows are
-- immediately queryable. Idempotent: safe to re-run.

BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill: for every completed row without a completed_at, use updated_at as
-- the best available proxy. New completions from routes.ts / background-jobs
-- will set this directly going forward.
UPDATE bookings
SET completed_at = updated_at
WHERE status = 'completed'
  AND completed_at IS NULL;

-- Partial index — Kai's dormancy scan filters on status='completed' AND
-- MAX(completed_at) < cutoff, so we only need to index rows where the column
-- is populated.
CREATE INDEX IF NOT EXISTS bookings_completed_at_idx
  ON bookings(completed_at)
  WHERE completed_at IS NOT NULL;

COMMIT;
