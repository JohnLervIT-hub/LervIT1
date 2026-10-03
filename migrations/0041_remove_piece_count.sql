-- Remove the piece-count and dispute-resolution feature (0038-0040).
--
-- NOT APPLIED AUTOMATICALLY. scripts/startup-migrate.js runs only
-- scripts/sync-schema.sql, and the ADD COLUMN blocks for these have been deleted
-- from it, so nothing will re-create the columns. The DROPs below are deliberate
-- and destructive — any declared piece count or dispute record captured while
-- the feature was live is lost — so run this by hand once that is intended.
ALTER TABLE identified_items DROP COLUMN IF EXISTS piece_count;
ALTER TABLE bookings DROP COLUMN IF EXISTS declared_piece_count;
ALTER TABLE bookings DROP COLUMN IF EXISTS actual_piece_count_on_arrival;
ALTER TABLE bookings DROP COLUMN IF EXISTS piece_count_discrepancy_payout;
ALTER TABLE bookings DROP COLUMN IF EXISTS piece_count_evidence_photo_url;
ALTER TABLE bookings DROP COLUMN IF EXISTS piece_count_evidence_uploaded_at;
ALTER TABLE bookings DROP COLUMN IF EXISTS piece_count_dispute_status;
ALTER TABLE bookings DROP COLUMN IF EXISTS piece_count_dispute_opened_at;
ALTER TABLE bookings DROP COLUMN IF EXISTS piece_count_dispute_resolved_at;
ALTER TABLE bookings DROP COLUMN IF EXISTS piece_count_dispute_customer_photo_url;
ALTER TABLE bookings DROP COLUMN IF EXISTS piece_count_dispute_resolution;
