-- Missed inbound calls. Ring-timeout without a voicemail service and
-- caller-hangup-before-answer are recorded as status='missed' with
-- missed_at set, so the voice center can surface them separately from
-- 'voicemail' and 'completed'.
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS missed_at timestamp;
CREATE INDEX IF NOT EXISTS voice_calls_missed_at_idx ON voice_calls(missed_at);
