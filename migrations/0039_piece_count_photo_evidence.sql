-- Photo evidence for a piece-count discrepancy payout.
--
-- The mover-cancel branch for reason 'piece_count_discrepancy' records 50% of
-- the booking price. Without evidence that is the mover's uncorroborated count
-- deciding a payout, so the photo is now required before the amount is stored.
--
-- `timestamp` without time zone, matching every other timestamp column in this
-- schema (the spec said TIMESTAMPTZ; mixing the two in one table invites the
-- off-by-an-offset bugs this file has so far avoided).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS piece_count_evidence_photo_url   text      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS piece_count_evidence_uploaded_at timestamp DEFAULT NULL;
