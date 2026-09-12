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
  adjustedVolume: number;
  rawVolume: number;
  numberOfMovers: number;
  forcedTwoMovers: boolean;
  itemPremiums: { name: string; fee: number }[];
  // Display helpers retained for existing UI callers
  distanceKm: number;
  perKmRate: number;
}

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
  volumeRate: 0.40,

  // Packing factor — vehicle matching ONLY (not used in price calculation)
  packingFactor: 1.35,

  // 2-mover addition (30% of subtotal)
  twoMoverAddition: 0.30,

  // Force 2 movers above this adjusted volume
  forceTwoMoversVolumeThreshold: 200,

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

// ===== VEHICLE CLASS CATALOG (display metadata) =====
// Volume ranges use *adjusted* ft³ (raw × packingFactor) to line up with
// getVehicleClassFromVolume's thresholds. Fees mirror PRICING_CONFIG so UI
// dropdowns and admin views stay in sync with the calculator.
export const VEHICLE_CLASSES: Record<VehicleClass, VehicleClassConfig> = {
  A: {
    class: 'A',
    name: 'SUV / Small Vehicle',
    vehicleType: 'car',
    volumeRangeMin: 0,
    volumeRangeMax: 40,
    baseFee: PRICING_CONFIG.vehicleBaseFees.A,
    perKmRate: PRICING_CONFIG.kmRates.A,
    loadType: 'Small items, single chairs',
    examples: 'Boxes, small items',
  },
  B: {
    class: 'B',
    name: 'Pickup Truck',
    vehicleType: 'pickup',
    volumeRangeMin: 41,
    volumeRangeMax: 100,
    baseFee: PRICING_CONFIG.vehicleBaseFees.B,
    perKmRate: PRICING_CONFIG.kmRates.B,
    loadType: 'Medium furniture, moderate loads',
    examples: 'Sofa, mattress, bedroom furniture',
  },
  C: {
    class: 'C',
    name: 'Cargo Van',
    vehicleType: 'van',
    volumeRangeMin: 101,
    volumeRangeMax: 200,
    baseFee: PRICING_CONFIG.vehicleBaseFees.C,
    perKmRate: PRICING_CONFIG.kmRates.C,
    loadType: 'Large furniture, multiple rooms',
    examples: 'Full bedroom + living room, sectional sofas',
  },
  E: {
    class: 'E',
    name: 'Moving Truck (Large)',
    vehicleType: 'truck',
    volumeRangeMin: 201,
    volumeRangeMax: 1000,
    baseFee: PRICING_CONFIG.vehicleBaseFees.E,
    perKmRate: PRICING_CONFIG.kmRates.E,
    loadType: 'Full apartment / home moves',
    examples: 'Full apartment, appliances, heavy loads',
  },
};

/**
 * Determine vehicle class from raw volume. Applies packing factor internally.
 *   adjusted ≤ 40  → A
 *   adjusted ≤ 100 → B
 *   adjusted ≤ 200 → C
 *   adjusted > 200 → E
 */
export function getVehicleClassFromVolume(rawVolumeCuft: number): VehicleClass {
  const adjusted = rawVolumeCuft * PRICING_CONFIG.packingFactor;
  if (adjusted > 200) return 'E';
  if (adjusted > 100) return 'C';
  if (adjusted > 40)  return 'B';
  return 'A';
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

/** Capacity ranges per class (raw ft³). */
export const VEHICLE_CAPACITY_RANGES = {
  A: { min: 0,   max: 50,  typical: 30  },
  B: { min: 51,  max: 120, typical: 80  },
  C: { min: 121, max: 250, typical: 180 },
  E: { min: 251, max: 800, typical: 500 },
} as const;

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
 *  2. Adjusted volume — raw × packingFactor (for vehicle matching + force-2-movers).
 *  3. Vehicle class — from raw volume via getVehicleClassFromVolume.
 *  4. Force 2 movers when adjustedVolume > forceTwoMoversVolumeThreshold.
 *  5–7. Base + distance + load fees.
 *  8. Item premiums — sum from detectedItems[].premiumKey, or legacy heavyItem fallback.
 *  9. Access fees — sum of pickup + dropoff difficulty.
 *  10–12. Subtotal → 2-mover addition (30%) → total.
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
}: {
  volumeCuft?: number | null;
  loadSize?: string | null;
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
  const rawVolume = (typeof volumeCuft === 'number' && volumeCuft > 0)
    ? volumeCuft
    : (loadSize != null ? cfg.loadSizeVolumes[loadSize] : undefined) ?? 40;

  // STEP 2 — Adjusted volume (packing factor)
  const adjustedVolume = rawVolume * cfg.packingFactor;

  // STEP 3 — Vehicle class
  const vehicleClass = getVehicleClassFromVolume(rawVolume);

  // STEP 4 — Force 2 movers
  const forcedTwoMovers = adjustedVolume > cfg.forceTwoMoversVolumeThreshold;
  const effectiveMovers = forcedTwoMovers ? 2 : numberOfMovers;

  // STEP 5 — Base fee
  const baseFee = cfg.vehicleBaseFees[vehicleClass];

  // STEP 6 — Distance fee
  const perKmRate = cfg.kmRates[vehicleClass];
  const distanceFee = distanceKm * perKmRate;

  // STEP 7 — Load fee (raw volume × $0.40)
  const loadFee = rawVolume * cfg.volumeRate;

  // STEP 8 — Item premiums
  const itemPremiumsList: { name: string; fee: number }[] = [];
  if (detectedItems?.length) {
    for (const item of detectedItems) {
      const key = item.premiumKey;
      if (key && cfg.itemPremiums[key] != null) {
        itemPremiumsList.push({ name: item.itemName, fee: cfg.itemPremiums[key] });
      }
    }
  }
  // Legacy heavy-item fallback fires only when no detectedItems produced premiums.
  const premiumFee = itemPremiumsList.length > 0
    ? itemPremiumsList.reduce((sum, i) => sum + i.fee, 0)
    : (heavyItemFeeOverride ?? (heavyItem ? 75 : 0));

  // STEP 9 — Access fees
  const pickupDifficultyFee = pickupDifficulty && pickupDifficulty in cfg.accessFees
    ? cfg.accessFees[pickupDifficulty as keyof typeof cfg.accessFees]
    : 0;
  const dropoffDifficultyFee = dropoffDifficulty && dropoffDifficulty in cfg.accessFees
    ? cfg.accessFees[dropoffDifficulty as keyof typeof cfg.accessFees]
    : 0;
  const accessFee = pickupDifficultyFee + dropoffDifficultyFee;

  // STEP 10 — Subtotal
  const subtotal = baseFee + distanceFee + loadFee + premiumFee + accessFee;

  // STEP 11 — 2-mover addition
  const moverAddition = effectiveMovers > 1 ? subtotal * cfg.twoMoverAddition : 0;

  // STEP 12 — Total (no minimums for any class)
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
    adjustedVolume: round2(adjustedVolume),
    rawVolume: round2(rawVolume),
    numberOfMovers: effectiveMovers,
    forcedTwoMovers,
    itemPremiums: itemPremiumsList.map(i => ({ name: i.name, fee: round2(i.fee) })),
    distanceKm: Math.round(distanceKm * 10) / 10,
    perKmRate,
  };
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
    packingFactor: PRICING_CONFIG.packingFactor,
    twoMoverAddition: PRICING_CONFIG.twoMoverAddition,
    forceTwoMoversVolumeThreshold: PRICING_CONFIG.forceTwoMoversVolumeThreshold,
    accessFees: PRICING_CONFIG.accessFees,
    itemPremiums: PRICING_CONFIG.itemPremiums,
    loadSizeVolumes: PRICING_CONFIG.loadSizeVolumes,
    platformFeePercent: PRICING_CONFIG.platformFeePercent,
  };
}
