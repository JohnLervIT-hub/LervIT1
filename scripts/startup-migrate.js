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

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('[startup-migrate] Connected. Running sync-schema.sql...');

  try {
    await client.query(sql);
    console.log('[startup-migrate] Schema sync complete.');
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error('[startup-migrate] Fatal:', err.message);
  process.exit(1);
});
