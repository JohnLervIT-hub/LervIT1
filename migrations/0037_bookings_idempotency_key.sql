-- Collapse double-submitted bookings onto one row.
--
-- Two bookings were created 40 seconds apart for the same move: the submit
-- button only guards on React Query's isPending, which is clear again the
-- moment the first request resolves, so a second submit after the first
-- succeeded created a twin. The client now mints a per-attempt UUID and sends
-- it as X-Idempotency-Key; POST /api/bookings returns the existing unpaid
-- booking for a repeat key instead of inserting again.
--
-- The unique index is partial: every historical row has a NULL key and NULLs
-- would otherwise be the only thing colliding. It is also the race guard —
-- two concurrent submits both pass the SELECT, and the loser's INSERT is
-- rejected here rather than becoming a second twin.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_customer_idempotency_key_unique
  ON bookings (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
