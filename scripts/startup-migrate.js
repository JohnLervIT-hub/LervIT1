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
