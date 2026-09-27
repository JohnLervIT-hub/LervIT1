-- Requested Higgsfield render length, in seconds.
--
-- Until now there was nowhere to put one. HiggsfieldVideoInput.duration was
-- optional, no call site ever supplied it, and the provider fell back to
-- `?? 5` — so every video the system has produced is 5 seconds long, and the
-- length was neither choosable nor recorded.
--
-- DEFAULT 10 matches HIGGSFIELD_DEFAULT_DURATION in shared/video.ts. That is
-- two copies of the same number, so if the default ever changes it has to
-- change in both places — the TS constant is the one the running code reads,
-- and clampDuration() there still owns the 4-15 range Seedance 2.0 accepts.
--
-- Note Postgres 11+ backfills existing rows with the DEFAULT rather than
-- leaving them NULL, so rows created before this migration will read as 10 even
-- though they were actually rendered at 5s. Nothing re-renders off that value;
-- it only sets the length a resubmit of those items would use.
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS duration_seconds integer DEFAULT 10;
