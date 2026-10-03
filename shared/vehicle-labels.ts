/**
 * Canonical customer-facing names for the four vehicle tiers.
 *
 * There were two `getVehicleDisplayName` implementations with their own tables —
 * one in client/src/lib/utils.ts, one in shared/furniture-database.ts — plus
 * literal copies in shared/pricing.ts, MoverCandidateCard, AddMoverCandidateCard
 * and AdminLeadsPage. They had drifted: 'SUV' vs 'SUV / Car' vs
 * 'SUV / Small Vehicle', and 'Moving Truck' vs 'Moving Truck (Large)'. Both
 * functions now read this map.
 *
 * Deliberately dependency-free. client/src/lib/utils.ts is imported by nearly
 * every component (for `cn`), so this must not drag the furniture database into
 * the main bundle.
 *
 * Tables that cannot consume this directly — because they embed mover pay
 * ranges, or key on "suv" rather than "car" — carry a comment pointing here.
 */
export const VEHICLE_DISPLAY_NAMES = {
  car: "SUV",
  pickup: "Pickup Truck",
  van: "Cargo Van",
  truck: "Moving Truck",
} as const;

export type VehicleTierKey = keyof typeof VEHICLE_DISPLAY_NAMES;
