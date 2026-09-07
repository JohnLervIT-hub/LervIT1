/**
 * SLA helpers.
 *
 * Estimates job duration from distance + load and derives
 * `expectedCompletionAt` and `slaDeadlineAt` for a booking.
 * PULSE / SENTINEL use these to detect breaches.
 */

const BASE_MINUTES_BY_LOAD: Record<string, number> = {
  boxes: 45,
  small: 75,
  medium: 105,
  large: 150,
  apartment: 210,
};

const TRAVEL_MINUTES_PER_KM = 3; // ~20 km/h city driving average, both legs

/**
 * Rough estimate of how long a booking will take from mover-arrival
 * onwards (loading + travel + unloading). Deliberately conservative.
 */
export function estimateBookingMinutes(input: {
  distance?: number | string | null;
  loadSize?: string | null;
  numberOfMovers?: number | null;
}): number {
  const distanceKm = Number(input.distance ?? 0) || 0;
  const loadKey = (input.loadSize ?? 'medium').toString().toLowerCase();
  const baseMinutes = BASE_MINUTES_BY_LOAD[loadKey] ?? BASE_MINUTES_BY_LOAD.medium;
  const travelMinutes = distanceKm * TRAVEL_MINUTES_PER_KM;
  const raw = baseMinutes + travelMinutes;
  // 2 movers ≈ 30% faster on the loading portion; travel is unchanged.
  const withCrew =
    input.numberOfMovers && Number(input.numberOfMovers) >= 2
      ? Math.round(baseMinutes * 0.7 + travelMinutes)
      : Math.round(raw);
  return Math.max(60, withCrew); // never below a 1-hour job
}

/**
 * Compute expected completion + SLA deadline from a booking-shaped input.
 * Returns Date objects the caller can persist directly to
 * `bookings.expected_completion_at` / `bookings.sla_deadline_at`.
 *
 * SLA buffer: 60 min past estimated completion.
 */
export function computeBookingSla(booking: {
  preferredDate?: Date | string | null;
  distance?: number | string | null;
  loadSize?: string | null;
  numberOfMovers?: number | null;
}): { expectedCompletionAt: Date; slaDeadlineAt: Date; estimatedMinutes: number } {
  const start = booking.preferredDate ? new Date(booking.preferredDate) : new Date();
  const estimatedMinutes = estimateBookingMinutes(booking);
  const expectedCompletionAt = new Date(start.getTime() + estimatedMinutes * 60_000);
  const slaDeadlineAt = new Date(expectedCompletionAt.getTime() + 60 * 60_000);
  return { expectedCompletionAt, slaDeadlineAt, estimatedMinutes };
}
