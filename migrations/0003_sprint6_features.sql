-- Sprint 6: Mover availability calendar and referral program

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "referral_code" varchar(6) UNIQUE,
  ADD COLUMN IF NOT EXISTS "referral_credits" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "mover_availability" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "available_date" date NOT NULL,
  "start_time" time,
  "end_time" time,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "mover_availability_user_date_uniq" UNIQUE ("user_id", "available_date")
);
CREATE INDEX IF NOT EXISTS "mover_availability_user_id_idx" ON "mover_availability" ("user_id");
CREATE INDEX IF NOT EXISTS "mover_availability_date_idx" ON "mover_availability" ("available_date");

CREATE TABLE IF NOT EXISTS "referrals" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "referrer_id" varchar NOT NULL REFERENCES "users"("id"),
  "referred_id" varchar NOT NULL UNIQUE REFERENCES "users"("id"),
  "code" varchar(6) NOT NULL,
  "credit_awarded" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "referrals_referrer_id_idx" ON "referrals" ("referrer_id");
CREATE INDEX IF NOT EXISTS "referrals_code_idx" ON "referrals" ("code");
