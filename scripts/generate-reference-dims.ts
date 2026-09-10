/**
 * Generates the REFERENCE DIMENSIONS block for the GPT-4o prompt in
 * server/vision-engine-v2.ts from the single source of truth
 * (shared/furniture-database.ts).
 *
 * Usage:
 *   npx tsx scripts/generate-reference-dims.ts           # print to stdout
 *   npx tsx scripts/generate-reference-dims.ts --write   # patch vision-engine-v2.ts
 *   npm run generate:dims                                # same as --write
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { FURNITURE_DATABASE, type FurnitureItem } from '../shared/furniture-database';

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

const EXERCISE_KEYWORDS = ['treadmill', 'exercise', 'gym', 'bike', 'stationary', 'elliptical', 'rowing'];

type Group =
  | 'BEDS' | 'SOFAS' | 'TABLES' | 'CHAIRS' | 'STORAGE'
  | 'APPLIANCES' | 'ELECTRONICS' | 'OUTDOOR'
  | 'EXERCISE' | 'SPECIALTY' | 'LUGGAGE';

const GROUP_ORDER: Group[] = [
  'BEDS', 'SOFAS', 'TABLES', 'CHAIRS', 'STORAGE',
  'APPLIANCES', 'ELECTRONICS', 'OUTDOOR',
  'EXERCISE', 'SPECIALTY', 'LUGGAGE',
];

function groupOf(item: FurnitureItem): Group {
  switch (item.category) {
    case 'Bed':         return 'BEDS';
    case 'Sofa':        return 'SOFAS';
    case 'Table':       return 'TABLES';
    case 'Chair':       return 'CHAIRS';
    case 'Dresser':     return 'STORAGE';
    case 'Storage':     return 'STORAGE';
    case 'Appliance':   return 'APPLIANCES';
    case 'Electronics': return 'ELECTRONICS';
    case 'Outdoor':     return 'OUTDOOR';
    case 'Luggage':     return 'LUGGAGE';
    case 'Other': {
      const n = item.name.toLowerCase();
      return EXERCISE_KEYWORDS.some(k => n.includes(k)) ? 'EXERCISE' : 'SPECIALTY';
    }
    default: return 'SPECIALTY';
  }
}

function line(item: FurnitureItem): string {
  const { length: l, width: w, height: h } = item.dimensions_cm;
  return `• ${item.name}: ~${l}×${w}×${h}cm, ${item.weight_kg}kg`;
}

function generateBlock(): { text: string; count: number; sectionCount: number } {
  const buckets = new Map<Group, FurnitureItem[]>();
  for (const g of GROUP_ORDER) buckets.set(g, []);
  for (const item of FURNITURE_DATABASE) buckets.get(groupOf(item))!.push(item);

  const out: string[] = ['REFERENCE DIMENSIONS (use these):'];
  let sectionCount = 0;
  for (const g of GROUP_ORDER) {
    const items = buckets.get(g)!;
    if (items.length === 0) continue;
    sectionCount++;
    out.push('');
    out.push(g + ':');
    for (const item of items) out.push(line(item));
  }
  return { text: out.join('\n'), count: FURNITURE_DATABASE.length, sectionCount };
}

// ---------------------------------------------------------------------------
// --write mode: patch vision-engine-v2.ts between sentinels
// ---------------------------------------------------------------------------

const SENTINEL_START = '// AUTOGEN:REF_DIMS:START';
const SENTINEL_END   = '// AUTOGEN:REF_DIMS:END';
const TARGET_FILE = 'server/vision-engine-v2.ts';

function escapeForTemplateLiteral(s: string): string {
  // Only backticks and ${ interpolations need escaping inside a template literal.
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function writeBlock(block: string): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const targetPath = path.resolve(here, '..', TARGET_FILE);
  const source = fs.readFileSync(targetPath, 'utf8');

  const startIdx = source.indexOf(SENTINEL_START);
  const endIdx = source.indexOf(SENTINEL_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    console.error(`[generator] ERROR: sentinels not found in ${TARGET_FILE}.`);
    console.error(`            Add both markers first:  ${SENTINEL_START} ... ${SENTINEL_END}`);
    process.exit(1);
  }

  // Preserve the entire START-sentinel line and everything before it; replace body up to (and not including) the END-sentinel line.
  const startLineEnd = source.indexOf('\n', startIdx) + 1;
  const before = source.slice(0, startLineEnd);
  const after  = source.slice(endIdx);

  const constDecl =
    `const REFERENCE_DIMENSIONS = \`${escapeForTemplateLiteral(block)}\`;\n`;

  const next = before + constDecl + after;
  if (next === source) {
    console.log(`[generator] No changes (already up-to-date).`);
    return;
  }

  fs.writeFileSync(targetPath, next, 'utf8');
  console.log(`[generator] Injected ${FURNITURE_DATABASE.length} items into ${TARGET_FILE}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { text, count, sectionCount } = generateBlock();

if (process.argv.includes('--write')) {
  writeBlock(text);
} else {
  process.stdout.write(text + '\n');
  process.stderr.write(`\n[generator] ${count} items grouped into ${sectionCount} sections.\n`);
}
