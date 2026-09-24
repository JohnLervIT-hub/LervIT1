-- Retry budget for Google review auto-replies.
--
-- `respond_to_review` drafts the reply and posts it to Google in one step. A
-- draft that posts sets response + response_at; a draft whose GMB call fails
-- keeps response and leaves response_at NULL (see ember.respondToGoogleReview).
-- The auto-reply sweep now re-queues those half-finished rows, which means it
-- needs a stop condition: a review Google keeps rejecting would otherwise be
-- retried on every tick forever.
--
-- The counter is bumped before each attempt, not after, so an attempt that
-- throws still spends its budget. Existing rows start at 0 and get the full
-- three tries.
ALTER TABLE google_reviews
  ADD COLUMN IF NOT EXISTS reply_attempts integer NOT NULL DEFAULT 0;
