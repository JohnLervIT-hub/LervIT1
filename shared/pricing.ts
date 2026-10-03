// LervIT PrecisionMatch™ Dynamic Pricing Calculator
// Vehicle class-based pricing (2026) with volume-driven load fees and item premiums.

export type VehicleClass = 'A' | 'B' | 'C' | 'E';
export type PickupDifficultyType = 'ground' | 'stairs' | 'elevator' | 'basement';
export type DropoffDifficultyType = PickupDifficultyType;

export interface PriceBreakdown {
  baseFee: number;
  distanceFee: number;
  loadFee: number;
  premiumFee: number;
  accessFee: number;
  // Access fee split (persisted to legacy DB columns; UI can use accessFee)
  pickupDifficultyFee: number;
  dropoffDifficultyFee: number;
  moverAddition: number;
  subtotal: number;
  total: number;
  vehicleClass: VehicleClass;
  rawVolume: number;
  numberOfMovers: number;
  forcedTwoMovers: boolean;
  itemPremiums: { name: string; key: string | null; fee: number }[];
  // Where rawVolume came from. 'detected' means the vision engine measured the
  // load; the other two mean we guessed from the load-size dropdown (or nothing
  // at all). A guessed volume drives the vehicle class, and therefore the base
  // fee AND the per-km rate, so a quote built on one can move a long way once
  // the photos land — the UI must not present it as a firm number.
  volumeSource: VolumeSource;
  // Display helpers retained for existing UI callers
  distanceKm: number;
  perKmRate: number;
}

export type VolumeSource = 'detected' | 'load_size_fallback' | 'default';

export interface VehicleClassConfig {
  class: VehicleClass;
  name: string;
  vehicleType: string;
  volumeRangeMin: number;
  volumeRangeMax: number;
  baseFee: number;
  perKmRate: number;
  loadType: string;
  examples: string;
}

export const PRICING_CONFIG = {
  // Vehicle base fees
  vehicleBaseFees: {
    A: 20.00,  // SUV
    B: 30.00,  // Pickup Truck
    C: 35.00,  // Cargo Van
    E: 90.00,  // Moving Truck
  } as Record<VehicleClass, number>,

  // Per km rates
  kmRates: {
    A: 0.80,
    B: 1.80,
    C: 1.80,
    E: 2.50,
  } as Record<VehicleClass, number>,

  // Volume rate (raw volume × rate)
  volumeRate: 0.35,

  // Packing factor — vehicle matching ONLY (not used in price calculation).
  // Item-level volumes in the furniture DB already include bounding-box air
  // around irregular shapes, so this only adds the ~10% headroom needed for
  // load gaps when items are stacked.

  // 2-mover addition (30% of subtotal)
  twoMoverAddition: 0.30,

  // Force 2 movers when raw volume exceeds this (full apartment territory)
  // OR when any HEAVY_PREMIUM_KEYS item is present. See calculatePrice.
  forceTwoMoversRawVolumeThreshold: 200,

  // Premium keys that always require 2 movers regardless of load size —
  // pianos, safes, hot tubs, and pool tables are unsafe for a solo mover.
  forceTwoMoversHeavyKeys: [
    'piano_upright',
    'piano_grand',
    'safe',
    'hot_tub',
    'pool_table',
  ] as string[],

  // Access fees
  accessFees: {
    stairs:   12.00,
    elevator: 10.00,
    basement: 15.00,
  },

  // Item premium fees
  itemPremiums: {
    // Tier 1 — Heavy
    piano_upright:     75.00,
    piano_grand:      150.00,
    safe:              75.00,
    hot_tub:           75.00,
    pool_table:        75.00,
    industrial_equipment: 75.00,

    // Tier 2 — Appliance
    refrigerator:      20.00,
    washing_machine:   20.00,
    dryer:             20.00,
    dishwasher:        20.00,
    freezer:           20.00,
    stove:             20.00,
    oven:              20.00,
    commercial_appliance: 50.00,

    // Tier 3 — Fragile
    tv_large:          20.00,  // 65"+
    tv_xlarge:         40.00,  // 85"+
    antique:           20.00,
    glass_table:       20.00,
    mirror_large:      20.00,
    marble_furniture:  20.00,
    artwork:           20.00,

    // Tier 4 — Awkward
    treadmill:         10.00,
    exercise_bike:     10.00,
    elliptical:        10.00,
    sectional_sofa:    10.00,
    king_mattress:     10.00,
    kayak:             10.00,
    canoe:             10.00,
    motorcycle:        50.00,
  } as Record<string, number>,

  // Manual load size → estimated volume (ft³). Used when no AI detection available.
  loadSizeVolumes: {
    boxes:     15,
    small:     40,
    medium:    80,
    large:     150,
    apartment: 250,
  } as Record<string, number>,

  // Platform commission (15% for Uber-style payout)
  platformFeePercent: 15.00,
} as const;

/**
 * Ends of the load-size ladder, used to bracket an unmeasured load.
 *
 * The floor is indicative, not a guarantee: a genuinely tiny load prices below
 * it (the booking that prompted this measured 9.11 ft³, under the 15 ft³ 'boxes'
 * tier, and settled beneath the bracket). That is the safe direction to be
 * wrong — undershooting the quoted minimum is a pleasant surprise, whereas
 * exceeding the quoted maximum is the trust damage. The copy rendering the
 * bracket stays non-committal for exactly this reason.
 */
export const LOAD_SIZE_FLOOR_TIER = 'boxes';
export const LOAD_SIZE_CEILING_TIER = 'apartment';

/**
 * Class boundaries in RAW ft³ — the same unit the Recommendations card shows.
 *
 * Published ranges: SUV 0-40, Pickup 41-140, Cargo Van 141-350, Truck 351+.
 *
 * History, because the numbers look unchanged but the behaviour is not: these
 * were once 40/140/350 in "adjusted" ft³, with a packingFactor of 1.10 applied
 * inside the classifier, which put the real raw cutoffs at 36.36/127.27/318.18.
 * The card showed raw volume beside a range quoted in adjusted ft³, so a 127.6
 * ft³ load read as a Pickup while classing as a Cargo Van. The factor is gone
 * and these are now raw, which also widens every class by ~10%: a load between
 * 36.36 and 40, 127.27 and 140, or 318.18 and 350 ft³ classes one tier lower
 * than it used to, and prices accordingly.
 *
 * VEHICLE_CLASSES and VEHICLE_CAPACITY_RANGES derive from this object rather
 * than restating it, which is how the three sets drifted apart before.
 */
export const VEHICLE_CLASS_MAX_RAW_FT3 = {
  A: 40,
  B: 140,
  C: 350,
} as const;

// ===== VEHICLE CLASS CATALOG (display metadata) =====
// Volume ranges are RAW ft³, derived from VEHICLE_CLASS_MAX_RAW_FT3 and floored
// to whole numbers for the display string in getVehicleClassSummary. Flooring
// only ever understates a class's capacity, by under 1 ft³, so a quoted range
// never promises more than the classifier allows. Fees mirror PRICING_CONFIG so
// UI dropdowns and admin views stay in sync with the calculator.
export const VEHICLE_CLASSES: Record<VehicleClass, VehicleClassConfig> = {
  A: {
    class: 'A',
    name: 'SUV',
    vehicleType: 'car',
    volumeRangeMin: 0,
    volumeRangeMax: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.A),
    baseFee: PRICING_CONFIG.vehicleBaseFees.A,
    perKmRate: PRICING_CONFIG.kmRates.A,
    loadType: 'Small items, single chairs',
    examples: 'Boxes, small items',
  },
  B: {
    class: 'B',
    name: 'Pickup Truck',
    vehicleType: 'pickup',
    volumeRangeMin: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.A) + 1,
    volumeRangeMax: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.B),
    baseFee: PRICING_CONFIG.vehicleBaseFees.B,
    perKmRate: PRICING_CONFIG.kmRates.B,
    loadType: 'Medium furniture, moderate loads',
    examples: 'Sofa, mattress, bedroom furniture',
  },
  C: {
    class: 'C',
    name: 'Cargo Van',
    vehicleType: 'van',
    volumeRangeMin: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.B) + 1,
    volumeRangeMax: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.C),
    baseFee: PRICING_CONFIG.vehicleBaseFees.C,
    perKmRate: PRICING_CONFIG.kmRates.C,
    loadType: 'Large furniture, multiple rooms',
    examples: 'Full bedroom + living room, sectional sofas',
  },
  E: {
    class: 'E',
    name: 'Moving Truck',
    vehicleType: 'truck',
    volumeRangeMin: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.C) + 1,
    volumeRangeMax: 1000,
    baseFee: PRICING_CONFIG.vehicleBaseFees.E,
    perKmRate: PRICING_CONFIG.kmRates.E,
    loadType: 'Full apartment / home moves',
    examples: 'Full apartment, appliances, heavy loads',
  },
};

/**
 * Determine vehicle class from raw volume — the raw sum of item volumes, with
 * no adjustment applied.
 *   raw ≤ 36.36   → A  (SUV)
 *   raw ≤ 127.27  → B  (Pickup Truck)
 *   raw ≤ 318.18  → C  (Cargo Van)
 *   raw > 318.18  → E  (Moving Truck)
 */
export function getVehicleClassFromVolume(rawVolumeCuft: number): VehicleClass {
  if (rawVolumeCuft > VEHICLE_CLASS_MAX_RAW_FT3.C) return 'E';
  if (rawVolumeCuft > VEHICLE_CLASS_MAX_RAW_FT3.B) return 'C';
  if (rawVolumeCuft > VEHICLE_CLASS_MAX_RAW_FT3.A) return 'B';
  return 'A';
}

/**
 * Longest-side length, in cm, past which a load stops being an SUV job.
 *
 * Volume alone cannot see length: a 203cm king mattress is 34.6 raw ft³ and a
 * 219cm 98-inch TV is 3.9, so both class as A on volume while fitting in no
 * SUV. This floor only ever lifts A → B. It never touches B, C or E, so volume
 * stays decisive for every larger load, and weight never enters vehicle
 * selection at all.
 */
export const LENGTH_FLOOR_CM = 150;

/**
 * Vehicle class from raw volume, with the longest-side floor applied.
 *
 * This is the canonical mapping for anything customer-facing: both
 * calculatePrice and the booking flow's recommendation card call it, so the
 * displayed vehicle and the charged class cannot drift apart.
 */
export function getVehicleClassFromVolumeAndLength(
  rawVolumeCuft: number,
  maxLengthCm?: number | null,
): VehicleClass {
  const volumeClass = getVehicleClassFromVolume(rawVolumeCuft);
  if (volumeClass === 'A' && typeof maxLengthCm === 'number' && maxLengthCm > LENGTH_FLOOR_CM) {
    return 'B';
  }
  return volumeClass;
}

/** Map manual load size → vehicle class via the volume estimate. */
export function getVehicleClassFromLoadSize(loadSize: string): VehicleClass {
  const rawVolume = PRICING_CONFIG.loadSizeVolumes[loadSize] ?? 40;
  return getVehicleClassFromVolume(rawVolume);
}

/**
 * Map a mover's free-form `vehicleType` string → VehicleClass. Tolerates the
 * legacy label variety in the movers table ("Cargo Van", "Large Truck (26ft)",
 * "F-150", etc.). Defaults to Class A when unknown/empty so callers never crash.
 */
export function vehicleClassFromVehicleType(
  vehicleType: string | null | undefined,
): VehicleClass {
  if (!vehicleType) return 'A';

  const normalized = vehicleType.toLowerCase().trim();

  // Class E — Moving Truck
  if (
    normalized.includes('truck') ||
    normalized.includes('moving') ||
    normalized.includes('cube') ||
    normalized.includes('flatbed') ||
    normalized.includes('26ft') ||
    normalized.includes('16ft')
  ) return 'E';

  // Class C — Cargo Van
  if (
    normalized === 'van' ||
    normalized.includes('cargo') ||
    normalized.includes('transit') ||
    normalized.includes('sprinter') ||
    normalized.includes('promaster')
  ) return 'C';

  // Class B — Pickup Truck
  if (
    normalized === 'pickup' ||
    normalized.includes('pickup') ||
    normalized.includes('f-150') ||
    normalized.includes('f150') ||
    normalized.includes('silverado') ||
    normalized.includes('ram 1500') ||
    normalized.includes('tacoma')
  ) return 'B';

  // Class A — SUV / small vehicle (default)
  return 'A';
}

/** Reverse map: VehicleClass → canonical vehicleType string. */
export function vehicleTypeFromClass(vehicleClass: VehicleClass): string {
  const map: Record<VehicleClass, string> = {
    A: 'car',
    B: 'pickup',
    C: 'van',
    E: 'truck',
  };
  return map[vehicleClass];
}

/**
 * Capacity ranges per class (raw ft³), derived from the same boundaries the
 * classifier uses. These were previously an independent set (0-50, 51-120,
 * 121-250, 251-800) agreeing with neither the classifier nor the catalog above,
 * and they are surfaced in API responses as `vehicleCapacityRange`.
 */
export const VEHICLE_CAPACITY_RANGES = {
  A: { min: 0,
       max: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.A),
       typical: 25  },
  B: { min: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.A) + 1,
       max: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.B),
       typical: 80  },
  C: { min: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.B) + 1,
       max: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.C),
       typical: 200 },
  E: { min: Math.floor(VEHICLE_CLASS_MAX_RAW_FT3.C) + 1,
       max: 800,
       typical: 500 },
} as const;

/**
 * Legacy per-item handling premium, keyed by `handlingComplexity`. Only used as
 * a fallback when the vision engine emitted no keyed `premiumKey` values.
 *
 * Lives here rather than in the booking form because the server derives this
 * itself now — a client-supplied `heavyItemFeeOverride` was a price input the
 * customer controlled.
 *
 * NOTE: `toIdentificationResult` normalizes 'slight' -> 'low' and
 * 'moderate' -> 'medium' before persisting, so in practice only the 'high' and
 * 'very_high' keys are ever hit. The unreachable keys are kept so the table
 * still matches the values it was written against.
 */
export const HEAVY_ITEM_PREMIUMS_TIERED: Record<string, number> = {
  slight: 5,
  moderate: 10,
  high: 15,
  very_high: 30,
};

export const HEAVY_ITEM_PREMIUM_CAP = 150;

/** Sum the legacy handling premiums for a set of items, capped. */
export function sumHandlingPremiums(
  items: Array<{ handlingComplexity?: string | null }>,
): number {
  let total = 0;
  for (const item of items) {
    total += HEAVY_ITEM_PREMIUMS_TIERED[item.handlingComplexity || ''] ?? 0;
  }
  return Math.min(total, HEAVY_ITEM_PREMIUM_CAP);
}

export function getVehicleClassConfig(vehicleClass: VehicleClass): VehicleClassConfig {
  return VEHICLE_CLASSES[vehicleClass];
}

export function getAllVehicleClasses(): VehicleClassConfig[] {
  return Object.values(VEHICLE_CLASSES);
}

/**
 * Calculate the total price using vehicle-class + volume-based pricing.
 *
 * Steps:
 *  1. Raw volume — AI-detected `volumeCuft` if present, else map `loadSize` → volume.
 *  3. Vehicle class — from raw volume via getVehicleClassFromVolumeAndLength,
 *     so a long-but-light item (mattress, large TV) cannot class as an SUV.
 *  4a. Item premiums — sum from detectedItems[].premiumKey, or legacy heavyItem fallback.
 *  4b. Force 2 movers when rawVolume > threshold OR any always-heavy premium key present.
 *  5–7. Base + distance + load fees.
 *  8. Access fees — sum of pickup + dropoff difficulty.
 *  9–11. Subtotal → 2-mover addition (30%) → total.
 */
export function calculatePrice({
  volumeCuft,
  loadSize,
  distanceKm,
  numberOfMovers = 1,
  pickupDifficulty,
  dropoffDifficulty,
  heavyItem,
  heavyItemFeeOverride,
  detectedItems,
  maxLengthCm,
}: {
  volumeCuft?: number | null;
  loadSize?: string | null;
  /** Longest side across detected items, in cm. Applies the A→B length floor. */
  maxLengthCm?: number | null;
  distanceKm: number;
  numberOfMovers?: number;
  pickupDifficulty?: string | null;
  dropoffDifficulty?: string | null;
  heavyItem?: boolean;
  heavyItemFeeOverride?: number;
  detectedItems?: {
    itemName: string;
    premiumKey?: string | null;
  }[];
}): PriceBreakdown {
  const cfg = PRICING_CONFIG;

  // STEP 1 — Raw volume
  const hasDetectedVolume = typeof volumeCuft === 'number' && volumeCuft > 0;
  const loadSizeVolume = loadSize != null ? cfg.loadSizeVolumes[loadSize] : undefined;
  const rawVolume = hasDetectedVolume ? volumeCuft : loadSizeVolume ?? 40;
  const volumeSource: VolumeSource = hasDetectedVolume
    ? 'detected'
    : loadSizeVolume != null ? 'load_size_fallback' : 'default';

  // STEP 3 — Vehicle class (volume, with the longest-side floor)
  const vehicleClass = getVehicleClassFromVolumeAndLength(rawVolume, maxLengthCm);

  // STEP 4a — Item premiums (needed before force-2-movers so heavy items count).
  const itemPremiumsList: { name: string; key: string | null; fee: number }[] = [];
  if (detectedItems?.length) {
    for (const item of detectedItems) {
      const key = item.premiumKey;
      if (key && cfg.itemPremiums[key] != null) {
        itemPremiumsList.push({
          name: item.itemName,
          key,
          fee: cfg.itemPremiums[key],
        });
      }
    }
  }
  // Legacy heavy-item fallback fires only when no detectedItems produced premiums.
  const premiumFee = itemPremiumsList.length > 0
    ? itemPremiumsList.reduce((sum, i) => sum + i.fee, 0)
    : (heavyItemFeeOverride ?? (heavyItem ? 75 : 0));

  // STEP 4b — Force 2 movers. Fires when the raw load crosses the
  // apartment-move threshold OR when any always-heavy premium item is
  // present (pianos, safes, hot tubs, pool tables — unsafe solo).
  const volumeForcesTwoMovers = rawVolume > cfg.forceTwoMoversRawVolumeThreshold;
  const heavyForcesTwoMovers = itemPremiumsList.some(
    i => i.key !== null && cfg.forceTwoMoversHeavyKeys.includes(i.key),
  );
  const forcedTwoMovers = volumeForcesTwoMovers || heavyForcesTwoMovers;
  const effectiveMovers = forcedTwoMovers ? 2 : numberOfMovers;

  // STEP 5 — Base fee
  const baseFee = cfg.vehicleBaseFees[vehicleClass];

  // STEP 6 — Distance fee
  const perKmRate = cfg.kmRates[vehicleClass];
  const distanceFee = distanceKm * perKmRate;

  // STEP 7 — Load fee (raw volume × $0.40)
  const loadFee = rawVolume * cfg.volumeRate;

  // STEP 8 — Access fees
  const pickupDifficultyFee = pickupDifficulty && pickupDifficulty in cfg.accessFees
    ? cfg.accessFees[pickupDifficulty as keyof typeof cfg.accessFees]
    : 0;
  const dropoffDifficultyFee = dropoffDifficulty && dropoffDifficulty in cfg.accessFees
    ? cfg.accessFees[dropoffDifficulty as keyof typeof cfg.accessFees]
    : 0;
  const accessFee = pickupDifficultyFee + dropoffDifficultyFee;

  // STEP 9 — Subtotal
  const subtotal = baseFee + distanceFee + loadFee + premiumFee + accessFee;

  // STEP 10 — 2-mover addition
  const moverAddition = effectiveMovers > 1 ? subtotal * cfg.twoMoverAddition : 0;

  // STEP 11 — Total (no minimums for any class)
  const total = subtotal + moverAddition;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    baseFee: round2(baseFee),
    distanceFee: round2(distanceFee),
    loadFee: round2(loadFee),
    premiumFee: round2(premiumFee),
    accessFee: round2(accessFee),
    pickupDifficultyFee: round2(pickupDifficultyFee),
    dropoffDifficultyFee: round2(dropoffDifficultyFee),
    moverAddition: round2(moverAddition),
    subtotal: round2(subtotal),
    total: round2(total),
    vehicleClass,
    rawVolume: round2(rawVolume),
    numberOfMovers: effectiveMovers,
    forcedTwoMovers,
    itemPremiums: itemPremiumsList.map(i => ({ name: i.name, key: i.key, fee: round2(i.fee) })),
    volumeSource,
    distanceKm: Math.round(distanceKm * 10) / 10,
    perKmRate,
  };
}

export interface PriceRange {
  min: PriceBreakdown;
  max: PriceBreakdown;
  /** False when the two ends collapse to the same number — show one price. */
  isRange: boolean;
}

/**
 * Bracket a price whose volume is still a guess.
 *
 * Once the volume is measured there is nothing to bracket — both ends are the
 * real price and `isRange` is false.
 *
 * Before then the bracket spans the load-size tiers END TO END ('boxes' ->
 * 'apartment'). It deliberately does NOT bracket floor..selected-tier: the load
 * size is no longer something the customer picks, so the tier a price happens to
 * be sitting on is an internal default and carries no information about the
 * actual load. Presenting a narrow band around that default would be a
 * confident-looking number wearing a range's clothes — one real booking quoted
 * $124.79 off the 80 ft³ 'medium' default and settled at $60.76 on a measured
 * 9.11 ft³.
 *
 * Access fees still apply at both ends (they are known independently of volume).
 * Item premiums cannot be known without the photos, so neither end includes
 * them — this brackets the load, not the invoice.
 */
export function calculatePriceRange(
  params: Parameters<typeof calculatePrice>[0],
): PriceRange {
  const asGiven = calculatePrice(params);
  if (asGiven.volumeSource === 'detected') {
    return { min: asGiven, max: asGiven, isRange: false };
  }
  const withoutVolume = { ...params, volumeCuft: undefined };
  const min = calculatePrice({ ...withoutVolume, loadSize: LOAD_SIZE_FLOOR_TIER });
  const max = calculatePrice({ ...withoutVolume, loadSize: LOAD_SIZE_CEILING_TIER });
  return { min, max, isRange: min.total !== max.total };
}

/** Calculate mover earnings after platform commission. */
export function calculateMoverEarnings(priceBreakdown: PriceBreakdown): {
  gross: number;
  platformFee: number;
  net: number;
  platformFeePercent: number;
} {
  const gross = priceBreakdown.total;
  const platformFeePercent = PRICING_CONFIG.platformFeePercent;
  const platformFee = gross * (platformFeePercent / 100);
  const net = gross - platformFee;

  return {
    gross: Math.round(gross * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
    net: Math.round(net * 100) / 100,
    platformFeePercent,
  };
}

/**
 * Calculate an enterprise partner's net earnings on a booking after platform commission.
 *
 * Fee resolution order (higher precedence first):
 *   1. `partnerFeeOverride` — per-partner negotiated rate (e.g. partners.platformFeePercent)
 *   2. `platformFeeAmount`  — absolute fee already computed on the booking row (only when > 0)
 *   3. `platformFeePercent` — percentage on the booking row
 *   4. Default PRICING_CONFIG.platformFeePercent (15%)
 */
export function calculatePartnerNet(
  grossAmount: number,
  platformFeePercent?: number | null,
  partnerFeeOverride?: number | null,
  platformFeeAmount?: number | null,
): { grossAmount: number; platformFeeAmount: number; partnerNet: number; platformFeePercent: number } {
  const gross = Number.isFinite(grossAmount) ? grossAmount : 0;

  let feeAmount: number;
  let feePercent: number;

  if (partnerFeeOverride != null && Number.isFinite(partnerFeeOverride)) {
    feePercent = partnerFeeOverride;
    feeAmount = gross * (feePercent / 100);
  } else if (platformFeeAmount != null && Number.isFinite(platformFeeAmount) && platformFeeAmount > 0) {
    feeAmount = platformFeeAmount;
    feePercent = gross > 0 ? (feeAmount / gross) * 100 : PRICING_CONFIG.platformFeePercent;
  } else if (platformFeePercent != null && Number.isFinite(platformFeePercent)) {
    feePercent = platformFeePercent;
    feeAmount = gross * (feePercent / 100);
  } else {
    feePercent = PRICING_CONFIG.platformFeePercent;
    feeAmount = gross * (feePercent / 100);
  }

  const partnerNet = Math.max(0, gross - feeAmount);

  return {
    grossAmount: Math.round(gross * 100) / 100,
    platformFeeAmount: Math.round(feeAmount * 100) / 100,
    partnerNet: Math.round(partnerNet * 100) / 100,
    platformFeePercent: Math.round(feePercent * 100) / 100,
  };
}

/** Format price breakdown for display (text). */
export function formatPriceBreakdown(breakdown: PriceBreakdown): string {
  const classConfig = VEHICLE_CLASSES[breakdown.vehicleClass];
  const lines: (string | null)[] = [
    `Vehicle Class ${breakdown.vehicleClass}: ${classConfig.name}`,
    `Base Fee: $${breakdown.baseFee.toFixed(2)}`,
    `Distance ($${breakdown.perKmRate.toFixed(2)}/km × ${breakdown.distanceKm}km): $${breakdown.distanceFee.toFixed(2)}`,
    `Load (${breakdown.rawVolume.toFixed(0)} ft³): $${breakdown.loadFee.toFixed(2)}`,
  ];
  if (breakdown.itemPremiums.length > 0) {
    for (const p of breakdown.itemPremiums) {
      lines.push(`⚠ ${p.name}: $${p.fee.toFixed(2)}`);
    }
  } else if (breakdown.premiumFee > 0) {
    lines.push(`Item Premium: $${breakdown.premiumFee.toFixed(2)}`);
  }
  if (breakdown.pickupDifficultyFee > 0) lines.push(`Pickup Access: $${breakdown.pickupDifficultyFee.toFixed(2)}`);
  if (breakdown.dropoffDifficultyFee > 0) lines.push(`Dropoff Access: $${breakdown.dropoffDifficultyFee.toFixed(2)}`);
  if (breakdown.moverAddition > 0) lines.push(`2 Movers (+30%): $${breakdown.moverAddition.toFixed(2)}`);
  lines.push(`Total: $${breakdown.total.toFixed(2)} CAD`);
  return lines.filter(Boolean).join('\n');
}

/** Quick price estimate preview for a given class + distance. */
export function getQuickPriceEstimate(
  distanceKm: number,
  vehicleClass: VehicleClass
): { min: number; max: number; baseFee: number; perKmRate: number } {
  const baseFee = PRICING_CONFIG.vehicleBaseFees[vehicleClass];
  const perKmRate = PRICING_CONFIG.kmRates[vehicleClass];
  const basePrice = baseFee + (distanceKm * perKmRate);

  return {
    min: Math.round(basePrice * 0.9 * 100) / 100,
    max: Math.round(basePrice * 1.3 * 100) / 100,
    baseFee,
    perKmRate,
  };
}

// Label helpers
export function getPickupDifficultyLabel(difficulty: PickupDifficultyType): string {
  const labels: Record<PickupDifficultyType, string> = {
    ground: 'Ground Floor',
    basement: 'Basement',
    stairs: 'Stairs',
    elevator: 'Elevator',
  };
  return labels[difficulty] || difficulty;
}

export function getDropoffDifficultyLabel(difficulty: DropoffDifficultyType): string {
  return getPickupDifficultyLabel(difficulty);
}

export function getVehicleClassLabel(vehicleClass: VehicleClass): string {
  const config = VEHICLE_CLASSES[vehicleClass];
  return `Class ${vehicleClass}: ${config.name}`;
}

export function getVehicleClassDescription(vehicleClass: VehicleClass): string {
  const config = VEHICLE_CLASSES[vehicleClass];
  return `${config.volumeRangeMin}-${config.volumeRangeMax} ft³ • $${config.baseFee} base + $${config.perKmRate.toFixed(2)}/km`;
}

/** Export pricing config for admin/debug views. */
export function getPricingConfig() {
  return {
    vehicleClasses: VEHICLE_CLASSES,
    vehicleBaseFees: PRICING_CONFIG.vehicleBaseFees,
    kmRates: PRICING_CONFIG.kmRates,
    volumeRate: PRICING_CONFIG.volumeRate,
    twoMoverAddition: PRICING_CONFIG.twoMoverAddition,
    forceTwoMoversRawVolumeThreshold: PRICING_CONFIG.forceTwoMoversRawVolumeThreshold,
    forceTwoMoversHeavyKeys: PRICING_CONFIG.forceTwoMoversHeavyKeys,
    accessFees: PRICING_CONFIG.accessFees,
    itemPremiums: PRICING_CONFIG.itemPremiums,
    loadSizeVolumes: PRICING_CONFIG.loadSizeVolumes,
    platformFeePercent: PRICING_CONFIG.platformFeePercent,
  };
}
