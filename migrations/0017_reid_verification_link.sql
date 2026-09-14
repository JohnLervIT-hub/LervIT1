-- Reid Calloway (DOCOPS) — link audits to verification_items so the
-- verification dashboard can show Reid's per-item findings inline.
BEGIN;

ALTER TABLE document_audits
  ADD COLUMN IF NOT EXISTS verification_item_id varchar;

CREATE INDEX IF NOT EXISTS idx_doc_audits_verification_item
  ON document_audits(verification_item_id);

COMMIT;

SELECT 'Migration 0017 complete' AS result;
