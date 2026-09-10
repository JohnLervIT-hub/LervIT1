/**
 * Runs scripts/sync-schema.sql against DATABASE_URL before the server starts.
 *
 * sync-schema.sql is idempotent (CREATE TABLE / ADD COLUMN / CREATE INDEX
 * IF NOT EXISTS), so it is safe to run on every deploy.
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'sync-schema.sql');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('[startup-migrate] ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const sql = readFileSync(SCHEMA_PATH, 'utf8');

  const host = process.env.DATABASE_URL?.split('@')[1]?.split('/')[0];
  console.log('Connecting to:', host);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('[startup-migrate] Connected.');

  try {
    try {
      await client.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS referral_code varchar(6) UNIQUE,
          ADD COLUMN IF NOT EXISTS referral_credits integer NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS referral_count integer NOT NULL DEFAULT 0;
      `);
      console.log('[startup-migrate] ✓ Referral columns ensured on users.');
    } catch (err) {
      console.error('[startup-migrate] ✗ Referral column migration FAILED:', err.message);
      throw err;
    }

    const verify = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name LIKE 'referral%'
    `);
    console.log('[startup-migrate] Referral columns found:',
      verify.rows.map(r => r.column_name));

    // Reviews: enforce one review per (booking, customer). Dedupe existing rows
    // first so the ALTER does not fail on prod data left behind by the review
    // dialog loop. Guarded on constraint existence so we do not re-scan the
    // table on every deploy.
    try {
      const { rows: existing } = await client.query(`
        SELECT 1 FROM pg_constraint WHERE conname = 'reviews_booking_customer_unique'
      `);
      if (existing.length === 0) {
        const dedupe = await client.query(`
          DELETE FROM reviews a USING reviews b
          WHERE a.id > b.id
            AND a.booking_id  = b.booking_id
            AND a.customer_id = b.customer_id
        `);
        await client.query(`
          ALTER TABLE reviews
            ADD CONSTRAINT reviews_booking_customer_unique UNIQUE (booking_id, customer_id)
        `);
        console.log(`[startup-migrate] ✓ Added reviews_booking_customer_unique (removed ${dedupe.rowCount} duplicate rows).`);
      } else {
        console.log('[startup-migrate] ✓ reviews_booking_customer_unique already present.');
      }
    } catch (err) {
      console.error('[startup-migrate] ✗ Reviews unique constraint FAILED:', err.message);
      throw err;
    }

    try {
      await client.query(`
        ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS missed_at timestamp;
        CREATE INDEX IF NOT EXISTS voice_calls_missed_at_idx ON voice_calls(missed_at);
      `);
      console.log('[startup-migrate] ✓ voice_calls.missed_at ensured.');
    } catch (err) {
      console.error('[startup-migrate] ✗ voice_calls.missed_at migration FAILED:', err.message);
      throw err;
    }

    // 0008 — Partner payouts + Stripe webhook dedup.
    // Mirrors mover payout tables. Guarded per-statement with IF NOT EXISTS so
    // the block is safe on every deploy.
    try {
      await client.query(`
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

        CREATE TABLE IF NOT EXISTS stripe_webhook_events (
          id             text        PRIMARY KEY,
          type           text        NOT NULL,
          received_at    timestamp   NOT NULL DEFAULT now(),
          processed_at   timestamp,
          error_message  text
        );
        CREATE INDEX IF NOT EXISTS stripe_webhook_events_type_idx        ON stripe_webhook_events(type);
        CREATE INDEX IF NOT EXISTS stripe_webhook_events_received_at_idx ON stripe_webhook_events(received_at);

        ALTER TABLE partners
          ADD COLUMN IF NOT EXISTS platform_fee_percent decimal(5, 2);

        ALTER TABLE bookings
          ADD COLUMN IF NOT EXISTS partner_stripe_transfer_id text;
      `);
      console.log('[startup-migrate] ✓ partner_earnings / partner_payouts / stripe_webhook_events ensured.');
    } catch (err) {
      console.error('[startup-migrate] ✗ partner payouts migration FAILED:', err.message);
      throw err;
    }

    // Gap 1 — Auto-dispatch columns on bookings
    await client.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS auto_routed
          boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS auto_routed_at
          timestamp,
        ADD COLUMN IF NOT EXISTS routing_attempts
          integer DEFAULT 0;
    `);
    console.log('[startup-migrate] ✓ bookings auto_routed columns ensured.');

    await client.query(`
      ALTER TABLE movers
      ADD COLUMN IF NOT EXISTS last_location_update
      timestamp;
    `);
    console.log('[startup-migrate] ✓ movers.last_location_update ensured.');

    // 0011 — One-time cleanup of seeded fake coordinates.
    // Movers who never pushed real GPS (last_location_update IS NULL) had
    // random Calgary coords seeded on signup. Reset them so the PATCH
    // /api/movers/:id geocoder can populate real coords from the profile
    // address on next save. Movers with a real GPS ping keep their coords.
    // Idempotent: after the first run, no matching rows remain.
    try {
      const reset = await client.query(`
        UPDATE movers
           SET latitude = NULL,
               longitude = NULL,
               last_location_update = NULL
         WHERE last_location_update IS NULL
           AND latitude IS NOT NULL
      `);
      console.log(`[startup-migrate] ✓ Reset ${reset.rowCount} movers with seeded fake coords.`);
    } catch (err) {
      console.error('[startup-migrate] ✗ Fake coord cleanup FAILED:', err.message);
      throw err;
    }

    // 0010 — Agent-ready operational intelligence foundation
    // (7 tables + UTM/SLA columns on bookings + analytics_events.properties -> jsonb)
    try {
      const migrationPath = join(__dirname, '..', 'migrations', '0010_agent_foundation.sql');
      const agentSql = readFileSync(migrationPath, 'utf8');
      await client.query(agentSql);
      console.log('[startup-migrate] ✓ 0010_agent_foundation applied.');
    } catch (err) {
      console.error('[startup-migrate] ✗ 0010_agent_foundation FAILED:', err.message);
      throw err;
    }

    // 0012 — Backfill saved_addresses from each customer's most recent
    // geocoded booking pickup. Gives existing customers a distance origin
    // for Browse Movers without waiting for them to add one manually.
    // Idempotent: skips customers who already have a "Recent pickup" row
    // or a saved address matching that pickup, and respects the 5-max cap.
    try {
      const backfill = await client.query(`
        INSERT INTO saved_addresses (user_id, label, address, latitude, longitude)
        SELECT b.customer_id,
               'Recent pickup',
               b.pickup_address,
               b.pickup_latitude,
               b.pickup_longitude
        FROM (
          SELECT DISTINCT ON (customer_id)
                 customer_id,
                 pickup_address,
                 pickup_latitude,
                 pickup_longitude
          FROM bookings
          WHERE pickup_latitude <> 0
            AND pickup_longitude <> 0
            AND pickup_address IS NOT NULL
            AND pickup_address <> ''
          ORDER BY customer_id, created_at DESC
        ) b
        WHERE NOT EXISTS (
          SELECT 1 FROM saved_addresses sa
          WHERE sa.user_id = b.customer_id
            AND (sa.label = 'Recent pickup' OR sa.address = b.pickup_address)
        )
        AND (
          SELECT COUNT(*) FROM saved_addresses sa2 WHERE sa2.user_id = b.customer_id
        ) < 5
      `);
      console.log(`[startup-migrate] ✓ Backfilled ${backfill.rowCount} saved_addresses from recent booking pickups.`);
    } catch (err) {
      console.error('[startup-migrate] ✗ saved_addresses backfill FAILED:', err.message);
      throw err;
    }

    console.log('[startup-migrate] Running sync-schema.sql...');
    await client.query(sql);
    console.log('Schema sync complete on:', host);
  } finally {
    await client.end();
  }
}

// Explicit exit codes are required because the container's CMD chains
// `startup-migrate && dist/index.js` — anything short of a code-0 exit
// (including a hang on an unclosed pg keep-alive handle) prevents the
// server from ever booting. Relying on Node's natural drain-and-exit
// was masking the crash as a silent "server never starts."
run()
  .then(() => {
    console.log('[startup-migrate] Complete — starting server');
    process.exit(0);
  })
  .catch(err => {
    console.error('[startup-migrate] Fatal:', err.message);
    process.exit(1);
  });
