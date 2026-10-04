/**
 * Cover for the service area gate (shared/serviceArea.ts).
 *
 *   npx tsx scripts/test-service-area.ts     # or: npm run test:service-area
 *
 * This decides whether a booking is accepted at all, so the cases that matter
 * most are the ones that must stay OUT: the towns that border the zone
 * (Strathmore, High River) and the substring trap — Calgary Trail is a street
 * in Edmonton, and a `address.includes('calgary')` gate would have let it in.
 */
import { isInServiceArea, extractCity } from "../shared/serviceArea";

const CASES: { address: string; allowed: boolean; note?: string }[] = [
  // The four from the spec.
  { address: "123 Main St, Strathmore, AB", allowed: false },
  { address: "456 West Ave, Calgary, AB", allowed: true },
  { address: "789 Chestermere Blvd, Chestermere, AB", allowed: true },
  { address: "321 Big Hill Springs Rd, Cochrane, AB", allowed: true },

  // The shapes Google Places actually returns.
  { address: "123 Main St SW, Calgary, AB T2P 1A1, Canada", allowed: true },
  { address: "100 Rainbow Rd, Chestermere, AB T1X 0A1, Canada", allowed: true },
  { address: "50 Main St S, Airdrie, AB T4B 3C8, Canada", allowed: true },
  { address: "1 Elma St W, Okotoks, AB T1S 1J7, Canada", allowed: true },
  { address: "Rocky View County, AB, Canada", allowed: true },
  { address: "Rocky View, AB", allowed: true, note: "no 'County' suffix" },
  { address: "rockyview, ab", allowed: true, note: "lower case, no space" },

  // Postal code carries it when the municipality is unfamiliar.
  { address: "260168 Writing Creek Cres, AB T4A 0M8", allowed: true, note: "Balzac, Airdrie FSA" },

  // Must stay out.
  { address: "123 Main St, Strathmore, AB T1P 1A1, Canada", allowed: false },
  { address: "100 Centre St, High River, AB T1V 1A1", allowed: false },
  { address: "200 Gaetz Ave, Red Deer, AB T4N 1A1", allowed: false, note: "T4N must not pass as T4" },
  { address: "50 Ave, Edmonton, AB T6E 1A1", allowed: false },
  { address: "1 Wellington St, Ottawa, ON K1A 0A6", allowed: false },

  // Substring traps.
  { address: "1234 Calgary Trail NW, Edmonton, AB T6E 1A1, Canada", allowed: false, note: "real Edmonton street" },
  { address: "Calgary Place, Strathmore, AB", allowed: false },
  { address: "Cochrane Street, Winnipeg, MB R3B 1A1", allowed: false },

  // Degenerate input fails closed.
  { address: "", allowed: false },
  { address: "   ", allowed: false },
  { address: ",,,", allowed: false },
];

let failed = 0;
for (const c of CASES) {
  const got = isInServiceArea(c.address);
  const ok = got === c.allowed;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${got ? "allow" : "block"}  ${JSON.stringify(c.address).slice(0, 54).padEnd(56)}` +
      `city=${extractCity(c.address) ?? "-"}` +
      (c.note ? `  (${c.note})` : "") +
      (ok ? "" : `   EXPECTED ${c.allowed ? "allow" : "block"}`),
  );
}
console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
process.exit(failed === 0 ? 0 : 1);
