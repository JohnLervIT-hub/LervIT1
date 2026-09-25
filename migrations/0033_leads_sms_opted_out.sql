-- Record inbound STOP on the lead.
--
-- STOP was honoured only by Telnyx: sendSMS maps error 40010 ("recipient opted
-- out") and gives up, but nothing on our side recorded it. Agents kept picking
-- the lead on every sweep and each touch spent an API call to be refused, which
-- also meant the lead never advanced and was retried indefinitely.
--
-- Set alongside sms_consent_at = NULL when the inbound webhook sees STOP:
-- clearing the stamp removes the strongest consent signal, and this flag stops
-- the sourceChannel list (or the CASL published-contact exemption) from
-- re-admitting the number afterwards.
--
-- NOT NULL DEFAULT false so existing rows read as "never opted out", which is
-- what the absence of a STOP means.

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "sms_opted_out" boolean NOT NULL DEFAULT false;

-- Verification
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name = 'sms_opted_out';
