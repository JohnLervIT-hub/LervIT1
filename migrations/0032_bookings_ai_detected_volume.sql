-- Persist the volume the vision pipeline measured for a booking.
--
-- The client already sends aiDetectedVolumeCuft and POST /api/bookings uses it
-- for pricing, but it was never stored. dispatch.ts then read
-- booking.aiDetectedVolumeCuft off the row to pick the required vehicle class —
-- a field that did not exist, so the branch was always false and class
-- filtering fell back to PRICING_CONFIG.loadSizeVolumes[loadSize] ?? 40.
-- With the column in place dispatch sizes the vehicle from the measured volume.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ai_detected_volume_cuft numeric;
