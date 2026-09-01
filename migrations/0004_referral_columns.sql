-- Referral programme columns on the users table.
-- referral_code:    6-char unique code each user shares to invite others.
-- referral_credits: running balance of credits earned from successful referrals.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "referral_code"    varchar(6) UNIQUE,
  ADD COLUMN IF NOT EXISTS "referral_credits" integer NOT NULL DEFAULT 0;
