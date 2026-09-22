-- Actual trip start time on bookings.
--
-- Everything that reasoned about elapsed trip time measured from
-- `preferred_date`, which is when the CUSTOMER asked for the move, not when
-- the mover rolled:
--
--   * server/agents/mark.ts overtime fired at preferred_date + estimate + 30min,
--     so a trip that started 45min late burned its whole estimate before the
--     first wheel turned, and one that started early got extra slack.
--   * server/background-jobs.ts auto-complete / auto-cancel treated "no
--     location_updated_at on file" as "nobody is driving" and closed the
--     booking out from under an in-flight move (with the payout and review
--     that follow). A recent start now holds the booking open for 8h even if
--     GPS has gone quiet — dead phone, denied permission, parkade.
--
-- Stamped once, by PATCH /api/bookings/:id on the first flip into
-- 'en_route_to_pickup'. The transition table (shared/schema.ts
-- BOOKING_STATUS_TRANSITIONS) only allows that edge from 'confirmed', and the
-- handler additionally no-ops when started_at is already set.
--
-- Nullable with no backfill on purpose: bookings that ran before this column
-- existed genuinely have no recorded start, and inventing one from
-- preferred_date would re-introduce the exact error this column removes. Both
-- call sites fall back to preferred_date when it is null.
--
-- `timestamp` (not timestamptz) to match every other timestamp on this table
-- and the Drizzle `timestamp("started_at")` definition in shared/schema.ts.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "started_at" timestamp;

-- Verification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name = 'started_at';
