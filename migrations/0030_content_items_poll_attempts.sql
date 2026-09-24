-- Retry budget for the 30s Higgsfield poller.
--
-- A job the status endpoint never resolves — a 5xx that persists, or a render
-- that stays `in_progress` indefinitely — would otherwise be re-polled on
-- every tick forever, holding one of the poller's ten slots and starving
-- anything submitted behind it. The 4xx path fails the item immediately; this
-- counter bounds everything else.
--
-- Bumped before each attempt, not after, so a poll that throws still spends
-- its budget. Reset to 0 whenever an item is resubmitted with a new job id
-- (see ember.generateHiggsfieldVideo), so a retry gets a full budget.
-- Existing rows start at 0.
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS higgsfield_poll_attempts integer NOT NULL DEFAULT 0;
