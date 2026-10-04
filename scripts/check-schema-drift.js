#!/usr/bin/env node
/**
 * Fails the build when a column exists in shared/schema.ts but not in
 * scripts/sync-schema.sql.
 *
 * startup-migrate.js runs sync-schema.sql and nothing else, so a column that
 * lives only in schema.ts (or only in a migrations/ file) ships against a
 * database that lacks it. That is what broke the pre-move reminder sweep in
 * production: migration 0042 was never mirrored here.
 *
 * Comparison is per table, not across a flat set of names. Half these tables
 * have a `status` or a `created_at`, so a global set would let a column
 * missing from bookings pass because some other table happens to have one by
 * the same name.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(__dirname, 'sync-schema.sql');
const TS_PATH = join(__dirname, '..', 'shared', 'schema.ts');
const BASELINE_PATH = join(__dirname, 'schema-drift-baseline.json');

/**
 * Blanks out comments in one pass, tracking string state as it goes.
 *
 * A regex cannot do this: `-- Mark's overtime check` and `// another's booking`
 * both put an apostrophe inside a comment, and a comment-blind string matcher
 * treats it as an opening quote and swallows the rest of the file. That
 * desyncs the brace matcher and files columns under the wrong table.
 *
 * Comment bodies become spaces so every byte offset stays put.
 */
function blankComments(src, lang) {
  const out = src.split('');
  const lineComment = lang === 'sql' ? '--' : '//';
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === lineComment) {
      let j = src.indexOf('\n', i);
      if (j === -1) j = src.length;
      blank(i, j);
      i = j;
      continue;
    }
    if (two === '/*') {
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? src.length : j + 2;
      blank(i, j);
      i = j;
      continue;
    }
    const ch = src[i];
    if (ch === "'" || ch === '"' || (lang === 'ts' && ch === '`')) {
      i++;
      while (i < src.length) {
        if (lang === 'ts' && src[i] === '\\') { i += 2; continue; }
        if (src[i] === ch) {
          // SQL escapes a quote by doubling it.
          if (lang === 'sql' && src[i + 1] === ch) { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

const SQL_CONSTRAINT_TOKENS = new Set([
  'primary', 'foreign', 'unique', 'check', 'constraint', 'exclude', 'like',
]);

/** table -> Set(column) from CREATE TABLE bodies and ALTER TABLE ... ADD COLUMN. */
function parseSyncSchema(raw) {
  const sql = blankComments(raw, 'sql');
  const tables = new Map();
  const add = (table, column) => {
    const t = table.toLowerCase();
    if (!tables.has(t)) tables.set(t, new Set());
    tables.get(t).add(column.toLowerCase());
  };

  // CREATE TABLE [IF NOT EXISTS] name ( ...body... )
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  for (let m; (m = createRe.exec(sql)); ) {
    const table = m[1];
    const body = readBalanced(sql, m.index + m[0].length - 1);
    if (body === null) continue;
    for (const entry of splitTopLevel(body)) {
      const first = entry.trim().split(/[\s(]+/)[0];
      if (!first) continue;
      const bare = first.replace(/"/g, '');
      if (SQL_CONSTRAINT_TOKENS.has(bare.toLowerCase())) continue;
      if (!/^[a-z_][a-z0-9_]*$/i.test(bare)) continue;
      add(table, bare);
    }
  }

  // ALTER TABLE name ... ADD COLUMN [IF NOT EXISTS] col   (quoted or bare)
  const alterRe = /ALTER\s+TABLE\s+(?:ONLY\s+)?"?([a-z_][a-z0-9_]*)"?([\s\S]*?);/gi;
  for (let m; (m = alterRe.exec(sql)); ) {
    const table = m[1];
    const colRe = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
    for (let c; (c = colRe.exec(m[2])); ) add(table, c[1]);
  }

  return tables;
}

/** Returns the text inside the parens/braces starting at `openIdx`. */
function readBalanced(src, openIdx) {
  const open = src[openIdx];
  const close = open === '(' ? ')' : '}';
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  return null;
}

/** Split on commas that are not inside parens or quotes. */
function splitTopLevel(body) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < body.length && body[i] !== quote) i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  out.push(body.slice(start));
  return out;
}

/** table -> Set(column) from each pgTable("name", { ... }) definition. */
function parseDrizzleSchema(raw) {
  const src = blankComments(raw, 'ts');
  const tables = new Map();
  const tableRe = /pgTable\s*\(\s*"([^"]+)"\s*,\s*\{/g;
  for (let m; (m = tableRe.exec(src)); ) {
    const table = m[1].toLowerCase();
    // Only the second argument — the third is the index/constraint callback,
    // whose index("...") names are not columns.
    const body = readBalanced(src, m.index + m[0].length - 1);
    if (body === null) continue;
    const cols = new Set();
    // `  propName: type("column_name")` — the type call is always first.
    const colRe = /^[ \t]*([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$]*\s*\(\s*"([^"]+)"/gm;
    for (let c; (c = colRe.exec(body)); ) cols.add(c[2].toLowerCase());
    if (!tables.has(table)) tables.set(table, new Set());
    for (const c of cols) tables.get(table).add(c);
  }
  return tables;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return { tables: [], columns: {} };
  const raw = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  return { tables: raw.tables ?? [], columns: raw.columns ?? {} };
}

/** Everything in schema.ts that sync-schema.sql does not create. */
function findDrift() {
  const sqlTables = parseSyncSchema(readFileSync(SQL_PATH, 'utf8'));
  const tsTables = parseDrizzleSchema(readFileSync(TS_PATH, 'utf8'));

  const tables = [];
  const columns = [];
  let verified = 0;

  for (const [table, cols] of tsTables) {
    const sqlCols = sqlTables.get(table);
    if (!sqlCols) {
      tables.push({ table, count: cols.size });
      continue;
    }
    for (const col of [...cols].sort()) {
      if (sqlCols.has(col)) verified++;
      else columns.push({ table, col });
    }
  }
  return { tables, columns, verified, tableCount: tsTables.size };
}

function writeBaseline(drift) {
  const columns = {};
  for (const { table, col } of drift.columns) {
    (columns[table] ??= []).push(col);
  }
  const body = {
    _comment:
      'Schema drift that predates scripts/check-schema-drift.js. These tables ' +
      'and columns live in shared/schema.ts but not in scripts/sync-schema.sql; ' +
      'they reached existing databases via `npm run db:push`. The check fails ' +
      'only on drift NOT listed here, so new columns cannot repeat 0042. ' +
      'Shrink this file; do not grow it. Regenerate with ' +
      '`node scripts/check-schema-drift.js --update-baseline`.',
    tables: drift.tables.map((t) => t.table).sort(),
    columns: Object.fromEntries(
      Object.entries(columns).sort(([a], [b]) => a.localeCompare(b))
    ),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(body, null, 2) + '\n');
}

function main() {
  const drift = findDrift();

  if (process.argv.includes('--update-baseline')) {
    writeBaseline(drift);
    console.log(
      `Baseline written: ${drift.tables.length} tables, ` +
        `${drift.columns.length} columns.`
    );
    return 0;
  }

  const baseline = loadBaseline();
  const baselinedTables = new Set(baseline.tables);
  const isBaselined = (table, col) =>
    (baseline.columns[table] ?? []).includes(col);

  const newTables = drift.tables.filter((t) => !baselinedTables.has(t.table));
  const newColumns = drift.columns.filter((c) => !isBaselined(c.table, c.col));

  const baselinedCount =
    baseline.tables.length +
    Object.values(baseline.columns).reduce((n, a) => n + a.length, 0);

  if (newTables.length === 0 && newColumns.length === 0) {
    console.log(
      `Schema drift check passed — ${drift.verified} columns verified across ` +
        `${drift.tableCount} tables.`
    );
    if (baselinedCount) {
      // Surfaced on every green run so the debt stays visible rather than
      // quietly permanent.
      const stale =
        drift.tables.length +
          drift.columns.length -
          (newTables.length + newColumns.length) <
        baselinedCount;
      console.log(
        `${baselinedCount} known pre-existing drift items ignored ` +
          `(scripts/schema-drift-baseline.json).`
      );
      if (stale) {
        console.log(
          'Some baselined drift is now fixed — prune it with ' +
            '`node scripts/check-schema-drift.js --update-baseline`.'
        );
      }
    }
    return 0;
  }

  console.error('Schema drift detected: shared/schema.ts declares database');
  console.error('objects that scripts/sync-schema.sql does not create.');
  console.error('');
  console.error('startup-migrate.js runs only sync-schema.sql on boot, so these');
  console.error('would ship against a database that lacks them.');
  console.error('');
  if (newTables.length) {
    console.error(`Tables absent from sync-schema.sql (${newTables.length}):`);
    for (const { table, count } of newTables) {
      console.error(`  ${table}  (${count} columns)`);
    }
    console.error('');
  }
  if (newColumns.length) {
    console.error(`Columns absent from sync-schema.sql (${newColumns.length}):`);
    for (const { table, col } of newColumns) {
      console.error(`  ${table}.${col}`);
    }
    console.error('');
  }
  console.error('Add them to scripts/sync-schema.sql, mirroring the migration');
  console.error('in migrations/ (indexes included). Adding a column to');
  console.error('shared/schema.ts and migrations/ alone does not deploy it.');
  return 1;
}

process.exit(main());
