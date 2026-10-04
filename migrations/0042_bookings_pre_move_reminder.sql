-- Pre-move SMS reminder, sent once the day before a confirmed move.
--
-- Count + timestamp rather than a boolean, following
-- mover_stripe_accounts.reminder_count / last_reminder_at. The daily cron
-- selects on pre_move_reminder_count = 0, so the columns are only written
-- after Telnyx accepts the message: a failed send leaves the row untouched and
-- the next run picks it up again, while a delivered one can never re-send.
--
-- Defaulting to 0 NOT NULL backfills every existing row as "not yet sent".
-- That is correct — the feature did not exist, so nothing has been sent — and
-- harmless, because the cron also requires the move to be tomorrow, which no
-- historical booking satisfies.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pre_move_reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pre_move_reminder_sent_at timestamp;

-- Supports the daily sweep's `count = 0 AND status = ...` scan.
CREATE INDEX IF NOT EXISTS bookings_pre_move_reminder_idx
  ON bookings (pre_move_reminder_count, status)
  WHERE pre_move_reminder_count = 0;
