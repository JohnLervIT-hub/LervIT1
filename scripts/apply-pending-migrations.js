/**
 * Applies migrations 0001–0003 against DATABASE_URL.
 * Safe to run multiple times — all DDL uses IF NOT EXISTS.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/apply-pending-migrations.js
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

// Migrations to apply, in order.
// 0001 uses raw CREATE TABLE (no IF NOT EXISTS guard) — wrapped in DO block below.
// 0002 and 0003 already use IF NOT EXISTS — safe to re-run as-is.
const migrations = [
  {
    name: '0001_promo_code_uses',
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS "promo_code_uses" (
          "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "promo_code_id" text NOT NULL,
          "user_id" varchar NOT NULL,
          "booking_id" varchar NOT NULL,
          "used_at" timestamp DEFAULT now() NOT NULL,
          "discount_amount" numeric(10, 2) NOT NULL,
          CONSTRAINT "promo_code_uses_booking_id_unique" UNIQUE("booking_id")
        );
      EXCEPTION WHEN duplicate_table THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE "promo_code_uses" ADD CONSTRAINT "promo_code_uses_user_id_users_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE "promo_code_uses" ADD CONSTRAINT "promo_code_uses_booking_id_bookings_id_fk"
          FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE INDEX IF NOT EXISTS "promo_code_uses_user_id_idx" ON "promo_code_uses" ("user_id");
      CREATE INDEX IF NOT EXISTS "promo_code_uses_promo_code_id_idx" ON "promo_code_uses" ("promo_code_id");
      CREATE INDEX IF NOT EXISTS "promo_code_uses_used_at_idx" ON "promo_code_uses" ("used_at");
    `,
  },
  {
    name: '0002_sprint5_features',
    file: join(__dirname, '../migrations/0002_sprint5_features.sql'),
  },
  {
    name: '0003_sprint6_features',
    file: join(__dirname, '../migrations/0003_sprint6_features.sql'),
  },
];

async function run() {
  await client.connect();
  console.log('Connected to database.\n');

  for (const migration of migrations) {
    const sql = migration.sql ?? readFileSync(migration.file, 'utf8');
    console.log(`Applying ${migration.name}...`);
    try {
      await client.query(sql);
      console.log(`  ✓ ${migration.name} applied.\n`);
    } catch (err) {
      console.error(`  ✗ ${migration.name} FAILED:`, err.message);
      await client.end();
      process.exit(1);
    }
  }

  console.log('All migrations applied. Production should be back up.');
  await client.end();
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
