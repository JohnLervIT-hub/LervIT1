-- Partner payouts: mirror of the mover payout tables + Stripe webhook dedup.
-- Populated by recordPartnerEarnings at booking completion; transfers fire
-- once the partner's Stripe Connect account has payouts_enabled=true.
--
-- Safe to re-run: every statement uses IF NOT EXISTS. This file mirrors what
-- scripts/startup-migrate.js applies at boot, kept here for the drizzle-kit
-- migration trail and local dev.

CREATE TABLE IF NOT EXISTS partner_earnings (
  id                    varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id            varchar         NOT NULL REFERENCES partners(id),
  booking_id            varchar         NOT NULL UNIQUE REFERENCES bookings(id),
  gross_amount          decimal(10, 2)  NOT NULL,
  platform_fee_percent  decimal(5, 2)   NOT NULL DEFAULT 15.00,
  platform_fee_amount   decimal(10, 2)  NOT NULL,
  partner_net_amount    decimal(10, 2)  NOT NULL,
  currency              text            NOT NULL DEFAULT 'cad',
  stripe_transfer_id    text,
  status                text            NOT NULL DEFAULT 'pending',
  paid_at               timestamp,
  failure_reason        text,
  created_at            timestamp       NOT NULL DEFAULT now(),
  updated_at            timestamp       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_earnings_partner_id_idx ON partner_earnings(partner_id);
CREATE INDEX IF NOT EXISTS partner_earnings_booking_id_idx ON partner_earnings(booking_id);
CREATE INDEX IF NOT EXISTS partner_earnings_status_idx     ON partner_earnings(status);

CREATE TABLE IF NOT EXISTS partner_payouts (
  id                varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        varchar         NOT NULL REFERENCES partners(id),
  stripe_payout_id  text,
  amount            decimal(10, 2)  NOT NULL,
  currency          text            NOT NULL DEFAULT 'cad',
  status            text            NOT NULL DEFAULT 'pending',
  period_start      timestamp,
  period_end        timestamp,
  booking_count     integer         NOT NULL DEFAULT 0,
  created_at        timestamp       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_payouts_partner_id_idx ON partner_payouts(partner_id);
CREATE INDEX IF NOT EXISTS partner_payouts_status_idx     ON partner_payouts(status);

-- Webhook dedup. Primary key = Stripe event id; INSERT ... ON CONFLICT DO NOTHING
-- gives us at-most-once processing per event.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id             text        PRIMARY KEY,
  type           text        NOT NULL,
  received_at    timestamp   NOT NULL DEFAULT now(),
  processed_at   timestamp,
  error_message  text
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_type_idx        ON stripe_webhook_events(type);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_received_at_idx ON stripe_webhook_events(received_at);

-- Per-partner platform fee override (null → falls back to booking's fee, then default 15%).
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS platform_fee_percent decimal(5, 2);

-- Stripe transfer id for the partner-side leg of a booking's payout.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS partner_stripe_transfer_id text;
