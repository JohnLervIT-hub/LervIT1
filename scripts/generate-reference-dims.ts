/**
 * Generates the REFERENCE DIMENSIONS block for the GPT-4o prompt in
 * server/vision-engine-v2.ts from the single source of truth
 * (shared/furniture-database.ts). Prints to stdout.
 *
 * Usage:  npx tsx scripts/generate-reference-dims.ts
 */

import { FURNITURE_DATABASE, type FurnitureItem } from '../shared/furniture-database';

// User-requested display groups. The DB's `category` field is the primary key;
// the 'Other' bucket is split into EXERCISE vs SPECIALTY by keyword.
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

const buckets = new Map<Group, FurnitureItem[]>();
for (const g of GROUP_ORDER) buckets.set(g, []);
for (const item of FURNITURE_DATABASE) buckets.get(groupOf(item))!.push(item);

const out: string[] = ['REFERENCE DIMENSIONS (use these):'];
for (const g of GROUP_ORDER) {
  const items = buckets.get(g)!;
  if (items.length === 0) continue;
  out.push('');
  out.push(g + ':');
  for (const item of items) out.push(line(item));
}

process.stdout.write(out.join('\n') + '\n');
process.stderr.write(`\n[generator] ${FURNITURE_DATABASE.length} items grouped into ${GROUP_ORDER.filter(g => (buckets.get(g)!.length > 0)).length} sections.\n`);
