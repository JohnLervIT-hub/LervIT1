-- Geofence-measured arrival times on bookings.
--
-- server/lib/arrivalGeofence.ts stamps these when the mover's live GPS first
-- comes within 200m of the pickup or dropoff, evaluated on the existing
-- POST /api/bookings/:id/location ping. Detection only: the booking status
-- machine is untouched and the mover still taps "Arrived" themselves, because
-- en_route_to_pickup -> loading means loading has STARTED and drives both the
-- duration metrics and Mark's overtime check.
--
-- Deliberately NOT the same fields as mover_performance.arrived_at_pickup_at /
-- arrived_at_dropoff_at. Those are written by the status handler in routes.ts
-- from the button tap, so they record when the mover SAID they had arrived.
-- These are measured. Keeping both is the point — the gap between them is the
-- interesting number.
--
-- Nullable with no backfill: a booking whose GPS never streamed, or whose mover
-- never got within the radius, genuinely has no measured arrival, and deriving
-- one from the button tap would collapse the distinction the columns exist for.
--
-- `timestamp` (not timestamptz) to match every other timestamp on this table
-- and the Drizzle `timestamp(...)` definitions in shared/schema.ts.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "arrived_at_pickup_at"  timestamp,
  ADD COLUMN IF NOT EXISTS "arrived_at_dropoff_at" timestamp;

-- Verification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('arrived_at_pickup_at', 'arrived_at_dropoff_at')
ORDER BY column_name;
