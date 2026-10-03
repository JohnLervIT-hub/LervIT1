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

/**
 * Rows deliberately withheld from the reference block.
 *
 * Sectionals (subcategory 'Sectional' — the three L rows and the three U rows)
 * are reported shape-only in "itemName", so the size variant is chosen downstream
 * from the model's own estimatedDimensions. Listing their dimensions here defeated
 * that: GPT-4o copied the anchor verbatim (270×200×85) instead of measuring the
 * photo, so every sectional arrived at 162.09ft3 and matched the Medium row
 * whatever its real size. With no anchor to copy, the estimate has to come from
 * visual cues, which is the only thing that can distinguish the three sizes.
 *
 * Everything else keeps its anchor: those rows are matched by NAME, so a copied
 * dimension costs nothing and a plausibility check is worth having.
 */
function isWithheldFromReference(item: FurnitureItem): boolean {
  return item.subcategory === 'Sectional';
}

function line(item: FurnitureItem): string {
  const { length: l, width: w, height: h } = item.dimensions_cm;
  return `• ${item.name}: ~${l}×${w}×${h}cm, ${item.weight_kg}kg`;
}

function generateBlock(): { text: string; count: number; sectionCount: number } {
  const included = FURNITURE_DATABASE.filter(i => !isWithheldFromReference(i));

  const buckets = new Map<Group, FurnitureItem[]>();
  for (const g of GROUP_ORDER) buckets.set(g, []);
  for (const item of included) buckets.get(groupOf(item))!.push(item);

  const out: string[] = ['REFERENCE DIMENSIONS (plausibility anchors only — if the photo shows something different, trust the photo):'];
  let sectionCount = 0;
  for (const g of GROUP_ORDER) {
    const items = buckets.get(g)!;
    if (items.length === 0) continue;
    sectionCount++;
    out.push('');
    out.push(g + ':');
    for (const item of items) out.push(line(item));
  }
  return { text: out.join('\n'), count: included.length, sectionCount };
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

function writeBlock(block: string, count: number): void {
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
  const withheld = FURNITURE_DATABASE.length - count;
  console.log(
    `[generator] Injected ${count} items into ${TARGET_FILE}` +
    (withheld > 0 ? ` (${withheld} withheld: see isWithheldFromReference)` : ''),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { text, count, sectionCount } = generateBlock();

if (process.argv.includes('--write')) {
  writeBlock(text, count);
} else {
  process.stdout.write(text + '\n');
  process.stderr.write(`\n[generator] ${count} items grouped into ${sectionCount} sections.\n`);
}
