-- 24-hour customer dispute window for a piece-count-discrepancy claim.
--
-- A mover's claim records a payout off their own count plus a photo nobody
-- adjudicates. These columns give the customer a bounded chance to confirm or
-- contest it, and route a contested claim to ops instead of settling it.
--
-- piece_count_dispute_status: 'pending_customer' | 'customer_confirmed'
--   | 'customer_disputed' | 'ops_review' | 'resolved'
-- piece_count_dispute_resolution: 'auto_approved' | 'auto_approved_no_response'
--   | whatever ops records when they close a contested claim.
--
-- `timestamp` without time zone, matching the rest of this schema.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS piece_count_dispute_status             text      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS piece_count_dispute_opened_at          timestamp DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS piece_count_dispute_resolved_at        timestamp DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS piece_count_dispute_customer_photo_url text      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS piece_count_dispute_resolution         text      DEFAULT NULL;
