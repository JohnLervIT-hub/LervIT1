import { VEHICLE_VOLUME_THRESHOLDS } from "@shared/furniture-database";
import type { IdentifiedItem } from "@shared/schema";

/**
 * The single derivation of "what does this load need".
 *
 * This cascade existed in three byte-for-byte copies in RequestMove
 * (handleIdentifyItems, recalcFromItems, handleApplyAIRecommendations — the
 * `VEHICLE_TIER_RANK`/`RANK2`/`RANK3` and `volumeTierIndex1/2/3` naming was the
 * tell), plus a fourth, *divergent* one in `maxVehicleTier` that read only the
 * raw database tag and skipped the cascade entirely. The copies had already
 * drifted in their comments: one still documented CAR_MAX 20 / PICKUP_MAX 165 /
 * VAN_MAX 300 against actual values of 54 / 136 / 318.
 *
 * Everything that needs a vehicle, load size or mover count calls this, so the
 * price, the summary card and the lead email cannot disagree.
 */

export const LOAD_SIZE_TIERS = ["boxes", "medium", "large", "apartment"] as const;
export const VEHICLE_TIERS = ["car", "pickup", "van", "truck"] as const;

export type LoadSizeTier = (typeof LOAD_SIZE_TIERS)[number];
export type VehicleTier = (typeof VEHICLE_TIERS)[number];

const VEHICLE_TIER_RANK: Record<string, number> = { car: 0, pickup: 1, van: 2, truck: 3 };

/**
 * Longest-side limits, in cm, for the dimension bump.
 *
 * VAN_MIN_CM is the length past which a load stops being a pickup job. It is
 * the 8-foot bed (244cm) with the tailgate down, which is how furniture
 * actually travels, NOT the 6.5ft (198cm) bed measured closed. The former
 * value of 200cm sat just under a 203cm queen mattress, so a 27 ft³, 40 kg
 * mattress was billed a cargo van — and it overrode the ground-truth database
 * tag ('pickup') to do it.
 */
export const DIMENSION_LIMITS = {
  VAN_MIN_CM: 244,
  PICKUP_MIN_CM: 150,
};

export interface LoadPlan {
  tierIndex: number;
  loadSize: LoadSizeTier;
  vehicle: VehicleTier;
  movers: number;
  totalVolumeFt3: number;
  totalWeightKg: number;
  maxDimensionCm: number;
  hasHeavyItems: boolean;
  /** Tier the volume alone implied, before any bump. Useful for diagnostics. */
  volumeTierIndex: number;
}

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/**
 * `items` must already be filtered to completed rows; an empty list yields null
 * so callers can fall back to their manual defaults rather than publishing a
 * "car" recommendation for a load nobody has measured.
 */
export function deriveLoadPlan(items: IdentifiedItem[]): LoadPlan | null {
  if (items.length === 0) return null;

  const totalVolumeFt3 = items.reduce((sum, i) => sum + num(i.volumeCuft), 0);
  const totalWeightKg = items.reduce((sum, i) => sum + num(i.weightKg), 0);

  let tierIndex = 0;
  if (totalVolumeFt3 > VEHICLE_VOLUME_THRESHOLDS.VAN_MAX) tierIndex = 3;
  else if (totalVolumeFt3 > VEHICLE_VOLUME_THRESHOLDS.PICKUP_MAX) tierIndex = 2;
  else if (totalVolumeFt3 > VEHICLE_VOLUME_THRESHOLDS.CAR_MAX) tierIndex = 1;
  const volumeTierIndex = tierIndex;

  // Weight bumps: capped at +1 tier above the volume-based tier.
  // Real payload limits: pickup ~600 kg, van ~900 kg, truck 2000+ kg.
  // Prevents single/dual heavy items from jumping straight to "Moving Truck".
  if (totalWeightKg > 600 && tierIndex < 3) tierIndex = Math.min(volumeTierIndex + 1, 3);
  else if (totalWeightKg > 300 && tierIndex < 2) tierIndex = Math.min(volumeTierIndex + 1, 2);
  else if (totalWeightKg > 100 && tierIndex < 1) tierIndex = Math.min(volumeTierIndex + 1, 1);

  const maxDimensionCm = Math.max(
    ...items.map((i) =>
      Math.max(num(i.dimensionsLcm), num(i.dimensionsWcm), num(i.dimensionsHcm)),
    ),
  );
  if (maxDimensionCm > DIMENSION_LIMITS.VAN_MIN_CM && tierIndex < 2) tierIndex = 2;
  else if (maxDimensionCm > DIMENSION_LIMITS.PICKUP_MIN_CM && tierIndex < 1) tierIndex = 1;

  const hasHeavyItems = items.some(
    (i) =>
      i.handlingComplexity === "high" ||
      i.handlingComplexity === "very_high" ||
      num(i.weightKg) > 30,
  );
  if (hasHeavyItems && tierIndex < 1) tierIndex = 1;

  // DATABASE VEHICLE FLOOR: honour the per-item vehicle assignment from the
  // ground-truth database. A 450 kg hot tub, a 520 kg pool table and a 422 kg
  // gun safe are tagged 'truck' there; volume and longest-side cannot express
  // that, so the load never lands below the highest tag it contains. This is
  // also what makes the 244cm dimension limit safe: anything that genuinely
  // needs a van despite being shorter than 8ft is tagged for one.
  const maxDbTier = items.reduce(
    (max, i) => Math.max(max, VEHICLE_TIER_RANK[i.vehicleType || "car"] ?? 0),
    0,
  );
  if (maxDbTier > tierIndex) tierIndex = maxDbTier;

  const movers = Math.max(...items.map((i) => i.recommendedMovers || 1));

  return {
    tierIndex,
    loadSize: LOAD_SIZE_TIERS[tierIndex],
    vehicle: VEHICLE_TIERS[tierIndex],
    movers,
    totalVolumeFt3,
    totalWeightKg,
    maxDimensionCm,
    hasHeavyItems,
    volumeTierIndex,
  };
}
