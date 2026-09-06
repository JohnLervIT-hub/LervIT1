-- Gap 1: Auto-dispatch to partners
-- Adds tracking columns on bookings so we can distinguish auto-routed vs
-- manually-routed jobs and cap re-route attempts.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "auto_routed" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "auto_routed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "routing_attempts" integer NOT NULL DEFAULT 0;
