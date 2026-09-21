/**
 * Calgary-local time helpers.
 *
 * Railway runs UTC while the business runs on America/Edmonton, so anything
 * that slices data "by month" has to convert wall-clock boundaries to real
 * instants. Building a Date from `toLocaleString(..., { timeZone })` does not
 * do that — it re-parses Calgary wall time in the *server's* zone, which is
 * off by the UTC offset on Railway and silently correct on a Calgary laptop.
 * These helpers use Intl parts instead, so they behave the same everywhere.
 */

export const CALGARY_TZ = 'America/Edmonton';

/** Offset of `timeZone` from UTC at a given instant, in ms (negative for MT). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;

  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );

  return asUtc - instant.getTime();
}

/** The instant at which it is `y-m-d 00:00` in Calgary. */
export function calgaryWallTimeToUtc(year: number, monthIndex: number, day: number): Date {
  const naive = Date.UTC(year, monthIndex, day);
  // Second pass settles the two days a year when the offset changes between
  // the guess and the real instant.
  const firstPass = naive - zoneOffsetMs(new Date(naive), CALGARY_TZ);
  return new Date(naive - zoneOffsetMs(new Date(firstPass), CALGARY_TZ));
}

/**
 * Half-open [start, end) covering a calendar month in Calgary.
 * `month` is 1-12.
 */
export function calgaryMonthRangeUtc(year: number, month: number): { start: Date; end: Date } {
  return {
    start: calgaryWallTimeToUtc(year, month - 1, 1),
    end: calgaryWallTimeToUtc(year, month, 1),
  };
}
