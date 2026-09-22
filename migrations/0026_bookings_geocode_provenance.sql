-- Geocode provenance on bookings.
--
-- server/google-maps.ts geocodeAddress() falls back to a DETERMINISTIC MOCK
-- (@shared/geocoding) whenever the Google API key is missing or the request
-- fails, and returns success:false to say so. Every call site discarded that
-- flag, so a booking geocoded from a guess was indistinguishable from a real
-- one once written. Anything that measures against those points measures
-- against the guess:
--
--   * server/lib/arrivalGeofence.ts — a 200m radius around a mock pickup fires
--     on the wrong street, or never, and stamps an arrival nobody can trust.
--   * server/lib/tripEta.ts — quotes a confident ETA to a place the customer
--     is not.
--
-- pickup_geocoded_at / dropoff_geocoded_at are set only when the API really
-- answered FOR THE ADDRESS CURRENTLY STORED. The admin address-update path
-- keeps the old coordinates when a re-geocode fails, which leaves them
-- describing the previous address — that case clears the timestamp rather than
-- keeping a stale one.
--
-- geocode_mock is the derived "do not trust these coordinates" flag
-- (= either timestamp missing), stored rather than computed so the guard in the
-- geofence hot path is a single boolean read.
--
-- No backfill. Existing rows take the DEFAULT false, which is optimistic: any
-- booking created before this migration is treated as real even though some
-- were mock-geocoded. Backfilling honestly is not possible — the flag was never
-- recorded. Rows created from here on are accurate.
--
-- `timestamp` (not timestamptz) to match every other timestamp on this table
-- and the Drizzle `timestamp(...)` definitions in shared/schema.ts.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "pickup_geocoded_at"  timestamp,
  ADD COLUMN IF NOT EXISTS "dropoff_geocoded_at" timestamp,
  ADD COLUMN IF NOT EXISTS "geocode_mock"        boolean DEFAULT false;

-- Verification
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('pickup_geocoded_at', 'dropoff_geocoded_at', 'geocode_mock')
ORDER BY column_name;
