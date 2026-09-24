-- Google Business Profile review sync + replies.
--
-- Synced Google reviews get their OWN table rather than rows in `reviews`.
-- `reviews` is the in-app, post-booking table: booking_id and customer_id are
-- both NOT NULL foreign keys, and ~12 call sites aggregate it by mover_id /
-- partner id to compute mover ratings. A Google review has no booking, no
-- customer and no mover, so it cannot be inserted without dropping those NOT
-- NULL constraints — and once inserted it would silently skew every mover
-- rating average that reads this table.
--
-- `reviews.response` is still added below: Ember drafts replies to in-app
-- reviews and currently throws the text away, so it had nowhere to live.

CREATE TABLE IF NOT EXISTS google_reviews (
  id                  varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Upsert key. Opaque per-review id from Google, stable across syncs.
  google_review_id    text        NOT NULL UNIQUE,
  -- Full resource path "accounts/{a}/locations/{l}/reviews/{r}" — required to
  -- post a reply back, so it is stored rather than rebuilt.
  review_name         text        NOT NULL,
  location_id         text,
  reviewer_name       text,
  reviewer_photo_url  text,
  -- 1-5, or NULL when Google returns STAR_RATING_UNSPECIFIED.
  rating              integer,
  comment             text,
  -- Our reply. NULL = not answered yet (this is what the reply queue reads).
  response            text,
  response_at         timestamp,
  responded_by        text,
  google_created_at   timestamp,
  google_updated_at   timestamp,
  synced_at           timestamp   NOT NULL DEFAULT now(),
  created_at          timestamp   NOT NULL DEFAULT now(),
  updated_at          timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_reviews_rating_idx   ON google_reviews(rating);
CREATE INDEX IF NOT EXISTS google_reviews_response_idx ON google_reviews(response);
CREATE INDEX IF NOT EXISTS google_reviews_created_idx  ON google_reviews(google_created_at);

-- In-app review replies (drafted by Ember, posted manually — in-app reviews
-- are not on Google and have nothing to reply to there).
ALTER TABLE "reviews"
  ADD COLUMN IF NOT EXISTS "response"    text,
  ADD COLUMN IF NOT EXISTS "response_at" timestamp;
