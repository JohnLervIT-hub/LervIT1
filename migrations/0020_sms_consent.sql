-- CASL/CTIA SMS consent evidence on leads.
--
-- server/lib/smsConsent.ts gates every outbound cold SMS. Until now the gate
-- read sourceChannel alone, which proves nothing after the fact — the column
-- is editable and the disclosure wording changes over time. These two columns
-- record WHEN consent was given and the VERBATIM text the lead agreed to.
--
-- Stamped by the two capture handlers that show the disclosure:
--   POST /api/leads/capture  and  POST /api/quotes  → sourceChannel 'quote_form'
--   POST /api/apply/mover                           → sourceChannel 'mover_application'
--
-- Nullable and backfill-free on purpose: existing rows genuinely have no
-- recorded consent, and inventing a timestamp for them would be the exact
-- thing this column exists to prevent. They keep falling back to the
-- CONSENTED_SOURCES list.
--
-- `timestamp` (not timestamptz) to match every other timestamp on this table
-- and the Drizzle `timestamp("sms_consent_at")` definition in shared/schema.ts.

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "sms_consent_at"   timestamp,
  ADD COLUMN IF NOT EXISTS "sms_consent_text" text;

-- Verification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name IN ('sms_consent_at', 'sms_consent_text')
ORDER BY column_name;
