-- 0022 — trace outbound lead calls back to their lead
-- voice_calls only carried booking_id, so Nova's lead-conversion and cold
-- calls logged rows with no link to the lead they were placed for.
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE voice_calls
  ADD COLUMN IF NOT EXISTS lead_id varchar;

CREATE INDEX IF NOT EXISTS voice_calls_lead_id_idx ON voice_calls(lead_id);

COMMIT;
