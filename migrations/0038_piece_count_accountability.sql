-- Piece-count accountability.
--
-- identified_items.piece_count is seeded at scan time from the matched
-- FurnitureItem.pieceCount and may then be changed by the customer, who is shown
-- the 50% cancellation warning before each change. NULL means never set: the
-- mover view shows nothing and the discrepancy rule does not apply.
--
-- On bookings, declared_piece_count is the confirmed total, and the two
-- cancellation columns record what the mover counted on arrival plus the payout
-- that earned. All DEFAULT NULL so existing rows stay exempt.
ALTER TABLE identified_items
  ADD COLUMN IF NOT EXISTS piece_count integer DEFAULT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS declared_piece_count              integer        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS actual_piece_count_on_arrival     integer        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS piece_count_discrepancy_payout    numeric(10, 2) DEFAULT NULL;
