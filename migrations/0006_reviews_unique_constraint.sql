-- Prevent duplicate reviews from the post-move rating loop: a customer can
-- only leave one review per booking. Existing duplicates (from before this
-- fix) are collapsed to the earliest row so the constraint can be added
-- without failure.

DELETE FROM reviews a
USING reviews b
WHERE a.id > b.id
  AND a.booking_id  = b.booking_id
  AND a.customer_id = b.customer_id;

ALTER TABLE reviews
  ADD CONSTRAINT reviews_booking_customer_unique
  UNIQUE (booking_id, customer_id);
