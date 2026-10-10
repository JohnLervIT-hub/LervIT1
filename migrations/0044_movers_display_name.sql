-- Mover customer-facing display name.
--
-- users.name remains the mover's LEGAL name (document verification and Stripe
-- payouts match against it). display_name is the optional business name shown
-- to customers on the job card and booking confirmation.
--
-- Nullable with no DEFAULT: NULL means "use the legal name".
ALTER TABLE movers
  ADD COLUMN IF NOT EXISTS display_name text;
