-- Mid-call memory for Nova's voice calls.
--
-- A cold call that drops in the first few seconds (bad cell handoff, the
-- candidate is driving, media timeout) used to be a total loss: the retry —
-- when there was one — re-dialled and replayed the intro, so a lead who had
-- already said "yes, tell me more" got pitched from scratch and hung up.
--
-- call_context records the furthest stage the last call reached plus what we
-- learned (interested / objection) and how many drop-recovery re-dials have
-- been scheduled. server/agents/nova.ts reads it at the top of
-- call_mover_cold to open with "we got disconnected" and skip the stages
-- already covered; the Telnyx call.hangup handler reads retry_count to cap
-- the retries at 3.
--
-- Nullable with no default: a lead Nova has never called has no context, and
-- NULL is exactly what "start from the intro" means to the resume path.

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "call_context" jsonb;

-- Verification
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name = 'call_context';
