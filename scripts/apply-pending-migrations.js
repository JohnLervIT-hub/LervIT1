/**
 * Migration runner for LervIT.
 *
 * Tracks applied migrations in a `_migrations` table in the database itself —
 * not in the Drizzle journal file — so the source of truth is always the DB.
 *
 * Behaviour on first run:
 *   - Fresh DB (no `users` table)   → applies ALL migration files from 0000 up.
 *   - Existing DB (users table exists, _migrations empty)
 *                                   → seeds _migrations from _journal.json
 *                                     (marks those as applied without re-running them)
 *                                     then applies any files not yet in the journal.
 *   - Already using this script     → skips anything already in _migrations,
 *                                     applies the rest.
 *
 * Flags:
 *   --dry-run            Show which migrations would run without executing them.
 *   --force NAME         Re-run a specific migration even if already tracked.
 *                        E.g.: node scripts/apply-pending-migrations.js --force 0003_sprint6_features
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/apply-pending-migrations.js
 *   DATABASE_URL=postgresql://... node scripts/apply-pending-migrations.js --dry-run
 */

import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../migrations');
const JOURNAL_PATH   = join(MIGRATIONS_DIR, 'meta/_journal.json');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const FORCE_IDX = args.indexOf('--force');
const FORCE_NAME = FORCE_IDX !== -1 ? args[FORCE_IDX + 1] : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a drizzle-generated migration SQL into individual statements. */
function splitStatements(sql) {
  return sql
    .split(/--> statement-breakpoint\r?\n?/g)
    .map(s => s.trim())
    .filter(Boolean);
}

/** Read all .sql migration files from the migrations dir, sorted by name. */
function getMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort() // lexicographic — relies on zero-padded numeric prefix
    .map(f => ({ file: f, name: f.replace(/\.sql$/, '') }));
}

/** Read the drizzle _journal.json and return the set of tracked migration names. */
function getJournalNames() {
  try {
    const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8'));
    return new Set((journal.entries ?? []).map(e => e.tag));
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  if (DRY_RUN) console.log('[DRY RUN] No SQL will be executed.\n');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('Connected to database.\n');

  // 1. Create tracking table (idempotent).
  if (!DRY_RUN) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `);
  }

  // 2. Read which migrations are already tracked in the DB.
  const appliedResult = DRY_RUN
    ? { rows: [] }
    : await client.query('SELECT name FROM _migrations');
  const applied = new Set(appliedResult.rows.map(r => r.name));

  // 3. On first run against an existing DB: auto-seed from the Drizzle journal.
  //    We detect "existing DB" by checking whether the `users` table exists.
  if (!DRY_RUN && applied.size === 0) {
    const { rows } = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
      LIMIT 1
    `);
    const dbAlreadySetUp = rows.length > 0;

    if (dbAlreadySetUp) {
      const journalNames = getJournalNames();
      if (journalNames.size > 0) {
        console.log(
          `Existing database detected. Seeding _migrations from Drizzle journal` +
          ` (${journalNames.size} entr${journalNames.size === 1 ? 'y' : 'ies'})...\n`,
        );
        for (const name of journalNames) {
          await client.query(
            'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
            [name],
          );
          applied.add(name);
          console.log(`  ↩ seeded  ${name}`);
        }
        console.log();
      }
    }
  }

  // 4. Get all migration files and decide what to apply.
  const files = getMigrationFiles();

  const pending = files.filter(({ name }) => {
    if (FORCE_NAME === name) return true; // --force override
    return !applied.has(name);
  });

  if (pending.length === 0) {
    console.log('Nothing to apply — database is up to date.');
    await client.end();
    return;
  }

  console.log(
    `${DRY_RUN ? 'Would apply' : 'Applying'} ${pending.length} migration${pending.length === 1 ? '' : 's'}:\n`,
  );

  // 5. Apply each pending migration inside a transaction.
  for (const { file, name } of pending) {
    console.log(`  → ${name}`);

    if (DRY_RUN) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const stmts = splitStatements(sql);
      console.log(`     (${stmts.length} statement${stmts.length === 1 ? '' : 's'})\n`);
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const statements = splitStatements(sql);

    await client.query('BEGIN');
    try {
      for (const stmt of statements) {
        await client.query(stmt);
      }
      // Record as applied inside the same transaction.
      await client.query(
        'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET applied_at = now()',
        [name],
      );
      await client.query('COMMIT');
      console.log(`     ✓ applied (${statements.length} statement${statements.length === 1 ? '' : 's'})\n`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`     ✗ FAILED — rolled back.\n`);
      console.error(`     Error: ${err.message}\n`);
      console.error(
        `  Tip: if this migration was already applied manually, run:\n` +
        `       node scripts/apply-pending-migrations.js --force ${name}\n` +
        `  or seed it:\n` +
        `       psql $DATABASE_URL -c "INSERT INTO _migrations (name) VALUES ('${name}') ON CONFLICT DO NOTHING"\n`,
      );
      await client.end();
      process.exit(1);
    }
  }

  if (!DRY_RUN) {
    console.log('All pending migrations applied successfully.');
  }

  await client.end();
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
