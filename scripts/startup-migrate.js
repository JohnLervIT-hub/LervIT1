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

    console.log('[startup-migrate] Running sync-schema.sql...');
    await client.query(sql);
    console.log('Schema sync complete on:', host);
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error('[startup-migrate] Fatal:', err.message);
  process.exit(1);
});
