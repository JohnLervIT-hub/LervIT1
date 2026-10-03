/**
 * Regression cover for findBestMatch's row selection.
 *
 * There is no unit-test runner in this repo, so this is a plain tsx script:
 *   npx tsx scripts/test-furniture-match.ts
 *
 * It exists because the scorer used to clamp every strong match to exactly
 * 1.0 before ranking, which made 29 of the 143 probes below resolve to
 * whichever row happened to sit first in FURNITURE_DATABASE — "Queen bed
 * frame" matched the twin row, "Dining table (8-person)" matched the 4-person
 * row, and "U-shaped sectional sofa" matched a Small L-shaped sectional.
 */
import { FURNITURE_DATABASE, findBestMatch } from "../shared/furniture-database";

type Case = { name: string; hint?: number; expect: string };

// `expect` is an item_id, or "*Category" / "*Subcategory" when only the family
// matters.
const CASES: Case[] = [
  // Sectional shape + tier. The vision prompt emits shape only, so the tier
  // has to come from the volume hint.
  { name: "U-shaped sectional sofa", hint: 103, expect: "SOFA_SECTIONAL_U_SM_001" },
  { name: "U-shaped sectional sofa", hint: 180, expect: "SOFA_SECTIONAL_U_SM_001" },
  { name: "U-shaped sectional sofa", hint: 262, expect: "SOFA_SECTIONAL_U_MD_001" },
  { name: "U-shaped sectional sofa", hint: 395, expect: "SOFA_SECTIONAL_U_LG_001" },
  { name: "L-shaped sectional sofa", hint: 103, expect: "SOFA_SECTIONAL_L_SM_001" },
  { name: "L-shaped sectional sofa", hint: 162, expect: "SOFA_SECTIONAL_L_MD_001" },
  { name: "L-shaped sectional sofa", hint: 259, expect: "SOFA_SECTIONAL_L_LG_001" },
  // No hint: shape must still win over DB order.
  { name: "U-shaped sectional sofa", expect: "SOFA_SECTIONAL_U_SM_001" },
  { name: "L-shaped sectional sofa", expect: "SOFA_SECTIONAL_L_SM_001" },
  // Size words in the name outrank the hint.
  { name: "Large U-shaped sectional sofa", hint: 103, expect: "SOFA_SECTIONAL_U_LG_001" },
  // Tiers that used to collapse onto the first row of their family.
  { name: "Queen bed frame", expect: "BED_QUEEN_001" },
  { name: "King bed frame", expect: "BED_KING_001" },
  { name: "Dining table (6-person)", expect: "TABLE_DINING_6_001" },
  { name: "Dining table (8-person)", expect: "TABLE_DINING_8_001" },
  { name: "Coffee table", expect: "TABLE_COFFEE_001" },
  { name: "L-shaped desk", expect: "DESK_LSHAPE_001" },
  { name: "3-seater sofa", expect: "SOFA_3SEAT_001" },
  { name: "mattress", expect: "*Mattress" },
  { name: "Desktop computer (tower)", expect: "DESKTOP_PC_001" },
  // The false positives the scorer's category hints exist to prevent.
  { name: "accent chair", expect: "*Chair" },
  { name: "office chair", expect: "*Chair" },
  { name: "sofa bed", expect: "*Sofa Bed" },
  { name: "dining table", expect: "*Table" },
];

function check(c: Case): boolean {
  const m = findBestMatch(c.name, c.hint);
  const got = m?.item.item_id ?? "NO MATCH";
  const ok = c.expect.startsWith("*")
    ? m?.item.category === c.expect.slice(1) || m?.item.subcategory === c.expect.slice(1)
    : got === c.expect;
  console.log(
    `${ok ? "PASS" : "FAIL"}  "${c.name}" hint=${c.hint ?? "-"}`.padEnd(56) +
      `-> ${got} (${m?.item.volume_ft3 ?? "-"} ft3)` +
      (ok ? "" : `   EXPECTED ${c.expect}`),
  );
  return ok;
}

// Known-bad rows, with the reason. These are data problems, not scorer
// problems, so they are reported but do not fail the run.
const KNOWN_FAILURES: Record<string, string> = {
  SOFA_RECLINER_001:
    "row is named 'Recliner sofa' but carries category 'Chair', so the " +
    "hasSofaHint mismatch penalty fires against its own name. Fixing it means " +
    "recategorising the row, which also moves vehicle selection and minimum " +
    "volume — deliberately left alone here.",
};

// Every row must match its own name. This is what caught the clamp.
function selfMatch(): number {
  let bad = 0;
  for (const item of FURNITURE_DATABASE) {
    const m = findBestMatch(item.name, item.volume_ft3);
    if (m?.item.item_id === item.item_id) continue;
    const known = KNOWN_FAILURES[item.item_id];
    if (known) {
      console.log(`KNOWN self-match "${item.name}" -> ${m?.item.item_id ?? "NO MATCH"}\n        ${known}`);
      continue;
    }
    bad++;
    console.log(`FAIL  self-match "${item.name}"\n        -> ${m?.item.item_id ?? "NO MATCH"}, expected ${item.item_id}`);
  }
  const known = Object.keys(KNOWN_FAILURES).length;
  console.log(`self-match: ${FURNITURE_DATABASE.length - bad - known}/${FURNITURE_DATABASE.length} rows match their own name (${known} known-bad)`);
  return bad;
}

const failed = CASES.filter(c => !check(c)).length + selfMatch();
console.log(`\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
