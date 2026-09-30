-- Capture why a customer cancelled.
--
-- The cancel flow in MyBookings now asks for a reason before confirming, but
-- PATCH /api/bookings validates against a zod whitelist that strips unknown
-- keys, and there was nowhere to put the answer anyway — so the survey would
-- have collected feedback and silently discarded it.
--
-- cancellation_answers is a JSON blob (free-text comments today, structured
-- follow-ups later), stored as text like the schema's other JSON columns.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason  text,
  ADD COLUMN IF NOT EXISTS cancellation_answers text;
