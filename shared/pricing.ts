// LervIT PrecisionMatch™ Dynamic Pricing Calculator
// Vehicle class-based pricing system for moving services

export interface PriceBreakdown {
  baseFee: number;
  distanceFee: number;
  distanceKm: number;  // Distance in kilometers for display
  perKmRate: number;   // Price per km for the vehicle class
  loadFee: number;
  loadSizeFee: number;  // New: Load Size Fee (Boxes: $0, Medium: $15, Large: $30, Apartment: $45)
  apartmentPremium: number;  // $50 premium for 300+ ft³ apartment moves
  moverTravelFee: number;
  pickupDifficultyFee: number;
  dropoffDifficultyFee: number;
  heavyItemFee: number;  // Kept for backwards compatibility
  subtotal: number;
  numberOfMoversMultiplier: number;
  totalCost: number;
  vehicleClass?: VehicleClass;
  loadSize?: string;  // Store the load size for display
  volumeCuft?: number;  // AI-detected volume for volume-based pricing
}

// ===== GLOBAL VEHICLE CLASS CONFIGURATION =====
// This is the single source of truth for all pricing across the platform

export type VehicleClass = 'A' | 'B' | 'C' | 'D' | 'E';

export interface VehicleClassConfig {
  class: VehicleClass;
  name: string;
  vehicleType: string;
  volumeRangeMin: number;  // ft³
  volumeRangeMax: number;  // ft³
  baseFee: number;         // CAD
  perKmRate: number;       // CAD per km
  loadType: string;        // Description of typical loads
  examples: string;        // Real-world examples
}

/**
 * ===== VEHICLE CLASS CONFIGURATION =====
 * 
 * IMPORTANT: These thresholds are synced with furniture-database.ts
 * Volume thresholds (2026):
 *   0-20 ft³    → Class A (SUV/Small Vehicle)
 *   21-165 ft³  → Class B (Pickup Truck)
 *   166-300 ft³ → Class C (Cargo Van)
 *   >300 ft³    → Class E (Large Moving Truck)
 * 
 * Note: Class D is deprecated. Kept in type for backward compatibility.
 */
export const VEHICLE_CLASSES: Record<VehicleClass, VehicleClassConfig> = {
  A: {
    class: 'A',
    name: 'SUV / Small Vehicle',
    vehicleType: 'car',
    volumeRangeMin: 0,
    volumeRangeMax: 20,
    baseFee: 12.00,
    perKmRate: 1.08,
    loadType: 'Small items, single chairs',
    examples: '1-4 boxes, single chair, small items',
  },
  B: {
    class: 'B',
    name: 'Pickup Truck',
    vehicleType: 'pickup',
    volumeRangeMin: 21,
    volumeRangeMax: 165,
    baseFee: 30.00,
    perKmRate: 1.92,
    loadType: 'Medium furniture, moderate loads',
    examples: 'Sofa, mattress, bedroom furniture, multiple boxes',
  },
  C: {
    class: 'C',
    name: 'Cargo Van',
    vehicleType: 'van',
    volumeRangeMin: 166,
    volumeRangeMax: 300,
    baseFee: 30.00,
    perKmRate: 1.50,
    loadType: 'Large furniture loads, multiple rooms',
    examples: 'Full bedroom + living room, sectional sofas, large sets',
  },
  D: {
    class: 'D',
    name: 'Cargo Van (Legacy)',
    vehicleType: 'van',
    volumeRangeMin: 181,
    volumeRangeMax: 300,
    baseFee: 50.00,
    perKmRate: 1.50,
    loadType: 'Deprecated - use Class C',
    examples: 'Deprecated - merged into Class C',
  },
  E: {
    class: 'E',
    name: 'Moving Truck (Large)',
    vehicleType: 'truck',
    volumeRangeMin: 301,
    volumeRangeMax: 600,
    baseFee: 50.00,
    perKmRate: 2.40,
    loadType: 'Full apartment / home moves',
    examples: 'Full apartment, appliances, heavy loads',
  },
};

// Map loadSize values to vehicle classes (synced with furniture-database.ts)
export const LOAD_SIZE_TO_CLASS: Record<string, VehicleClass> = {
  'boxes': 'A',        // 0-20 ft³ → Class A (SUV) - boxes, small items
  'small': 'A',        // Alias for boxes
  'medium': 'B',       // 21-180 ft³ → Class B (Pickup Truck)
  'large': 'C',        // 181-300 ft³ → Class C (Cargo Van)
  'apartment': 'E',    // >300 ft³ → Class E (Large Moving Truck)
};

/**
 * Determine vehicle class from total volume
 * Synced with furniture-database.ts VEHICLE_VOLUME_THRESHOLDS:
 *   0-20 ft³    → A (SUV)
 *   21-165 ft³  → B (Pickup Truck)
 *   166-300 ft³ → C (Cargo Van)
 *   >300 ft³    → E (Large Moving Truck)
 */
export function getVehicleClassFromVolume(volumeCuft: number): VehicleClass {
  if (volumeCuft <= 20) return 'A';
  if (volumeCuft <= 165) return 'B';
  if (volumeCuft <= 300) return 'C';
  return 'E';
}

// Get vehicle class from load size
export function getVehicleClassFromLoadSize(loadSize: string): VehicleClass {
  return LOAD_SIZE_TO_CLASS[loadSize] || 'C';
}

// Get vehicle class config
export function getVehicleClassConfig(vehicleClass: VehicleClass): VehicleClassConfig {
  return VEHICLE_CLASSES[vehicleClass];
}

// Get all vehicle classes as array (for UI dropdowns)
export function getAllVehicleClasses(): VehicleClassConfig[] {
  return Object.values(VEHICLE_CLASSES);
}

// ===== ADDITIONAL PRICING CONFIGURATION =====

const PRICING_CONFIG = {
  MOVER_TRAVEL_RATE_PER_KM: 0.90,
  MOVER_TRAVEL_FREE_RADIUS_KM: 5,
  
  PICKUP_DIFFICULTY_FEES: {
    ground: 0.00,
    basement: 12.00,
    stairs: 6.00,
    elevator: 9.60,
  },
  DROPOFF_DIFFICULTY_FEES: {
    ground: 0.00,
    basement: 12.00,
    stairs: 6.00,
    elevator: 9.60,
  },
  // Load Size Fees (flat tier fees - used when no AI volume data)
  // Aligned to $0.19/ft³ at representative midpoints for each tier
  LOAD_SIZE_FEES: {
    boxes: 6.00,      // Class A (SUV) - minimum load fee for 0-20 ft³
    small: 6.00,      // Alias for boxes - minimum load fee
    medium: 23.00,    // Pickup Truck loads — ~93 ft³ midpoint × $0.25
    large: 58.00,     // Cargo Van loads — ~233 ft³ midpoint × $0.25
    apartment: 75.00, // Moving Truck loads — 300 ft³ minimum × $0.25
  } as Record<string, number>,
  // Volume-based load fee rate (used when AI provides exact volume)
  // $0.20/ft³: 100ft³=$20, 200ft³=$40, 300ft³=$60, 400ft³=$80
  VOLUME_LOAD_FEE_PER_CUFT: 0.20,
  VOLUME_LOAD_FEE_MINIMUM: 6.00,  // Minimum load fee regardless of volume
  APARTMENT_MOVE_PREMIUM: 60.00, // $60 premium for 300+ ft³ loads (apartment moves)
  HEAVY_ITEM_FEE: 15.00, // Kept for backwards compatibility
  HEAVY_ITEM_PREMIUM_PER_ITEM: 10.00, // Kept for backwards compatibility (flat rate)
  // Tiered handling premiums by complexity (2025)
  // high: large appliances, massage chairs, gym equipment — specialist care needed
  // very_high: pianos, hot tubs, pool tables, safes, motorcycles — rigging/specialist required
  HEAVY_ITEM_PREMIUMS_BY_COMPLEXITY: { high: 15, very_high: 30 } as Record<string, number>,
  HEAVY_ITEM_PREMIUM_CAP: 150, // total heavy-item fee never exceeds $150 per booking
  TWO_MOVERS_MULTIPLIER: 1.30,
  
  // Platform commission (15% for Uber-style payout)
  PLATFORM_FEE_PERCENT: 15.00,
};

export const VOLUME_LOAD_FEE_PER_CUFT = PRICING_CONFIG.VOLUME_LOAD_FEE_PER_CUFT;
export const VOLUME_LOAD_FEE_MINIMUM = PRICING_CONFIG.VOLUME_LOAD_FEE_MINIMUM;

export type PickupDifficultyType = keyof typeof PRICING_CONFIG.PICKUP_DIFFICULTY_FEES;
export type DropoffDifficultyType = keyof typeof PRICING_CONFIG.DROPOFF_DIFFICULTY_FEES;

/**
 * Calculate the total price using vehicle class-based pricing
 * New formula: total = baseFee + distanceFee + loadSizeFee + accessFees
 * Load Size Fees: Boxes: $6 (Class A), Medium: $18, Large: $36, Apartment: $54
 * Class A Distance Rate: $1.08/km
 */
export const HEAVY_ITEM_PREMIUM_PER_ITEM = PRICING_CONFIG.HEAVY_ITEM_PREMIUM_PER_ITEM;
export const HEAVY_ITEM_PREMIUMS_BY_COMPLEXITY = PRICING_CONFIG.HEAVY_ITEM_PREMIUMS_BY_COMPLEXITY;
export const HEAVY_ITEM_PREMIUM_CAP = PRICING_CONFIG.HEAVY_ITEM_PREMIUM_CAP;

export function calculatePrice(
  pickupToDropoffDistance: number,
  loadSize: 'boxes' | 'small' | 'medium' | 'large' | 'apartment',
  pickupDifficulty: PickupDifficultyType,
  dropoffDifficulty: DropoffDifficultyType,
  heavyItem: boolean,
  numberOfMovers: 1 | 2,
  moverToPickupDistance?: number,
  volumeCuft?: number,  // Optional: use volume directly for more accurate class determination
  heavyItemCount?: number,  // Number of heavy items detected by AI (flat-rate fallback)
  heavyItemFeeOverride?: number  // Tiered pre-computed fee — takes priority over heavyItemCount
): PriceBreakdown {
  // Determine vehicle class: take the higher of volume-based and loadSize-based.
  // This ensures weight-bumped tiers (e.g. 110 kg sofa forces 'large'/van even if
  // the physical volume alone would only imply a pickup) get the right vehicle class.
  const VEHICLE_CLASS_RANK: Record<string, number> = { A: 1, B: 2, C: 3, D: 3, E: 4 };
  const classFromLoadSize = getVehicleClassFromLoadSize(loadSize);
  const classFromVolume = volumeCuft ? getVehicleClassFromVolume(volumeCuft) : null;
  const vehicleClass = classFromVolume && VEHICLE_CLASS_RANK[classFromVolume] >= VEHICLE_CLASS_RANK[classFromLoadSize]
    ? classFromVolume
    : classFromLoadSize;
  
  const classConfig = VEHICLE_CLASSES[vehicleClass];
  
  // Base fee from vehicle class
  const baseFee = classConfig.baseFee;
  
  // Distance fee based on vehicle class per-km rate
  const distanceFee = pickupToDropoffDistance * classConfig.perKmRate;
  
  // Load fee is now included in base fee (class-based pricing)
  // Keeping loadFee = 0 for backwards compatibility in breakdown display
  const loadFee = 0;
  
  // Load Size Fee: Use volume-based scaling when AI provides exact volume,
  // otherwise fall back to flat tier fee
  let loadSizeFee: number;
  if (volumeCuft && volumeCuft > 0) {
    loadSizeFee = Math.max(
      volumeCuft * PRICING_CONFIG.VOLUME_LOAD_FEE_PER_CUFT,
      PRICING_CONFIG.VOLUME_LOAD_FEE_MINIMUM
    );
  } else {
    loadSizeFee = PRICING_CONFIG.LOAD_SIZE_FEES[loadSize] || 0;
  }
  
  // Pickup difficulty fee
  const pickupDifficultyFee = PRICING_CONFIG.PICKUP_DIFFICULTY_FEES[pickupDifficulty] || 0;
  
  // Dropoff difficulty fee
  const dropoffDifficultyFee = PRICING_CONFIG.DROPOFF_DIFFICULTY_FEES[dropoffDifficulty] || 0;
  
  // Apartment move premium: $50 for loads 300+ ft³
  const isApartmentMove = volumeCuft ? volumeCuft >= 300 : loadSize === 'apartment';
  const apartmentPremium = isApartmentMove ? PRICING_CONFIG.APARTMENT_MOVE_PREMIUM : 0;

  // Heavy item fee: use tiered override when provided (frontend sends pre-computed tiered fee),
  // otherwise fall back to flat $10 × count, then to the boolean flag.
  let heavyItemFee: number;
  if (heavyItemFeeOverride !== undefined) {
    heavyItemFee = heavyItemFeeOverride;
  } else {
    const effectiveHeavyCount = heavyItemCount ?? (heavyItem ? 1 : 0);
    heavyItemFee = effectiveHeavyCount * PRICING_CONFIG.HEAVY_ITEM_PREMIUM_PER_ITEM;
  }
  
  // Mover travel fee (only if mover travels more than free radius)
  let moverTravelFee = 0;
  if (moverToPickupDistance && moverToPickupDistance > PRICING_CONFIG.MOVER_TRAVEL_FREE_RADIUS_KM) {
    const chargeableDistance = moverToPickupDistance - PRICING_CONFIG.MOVER_TRAVEL_FREE_RADIUS_KM;
    moverTravelFee = chargeableDistance * PRICING_CONFIG.MOVER_TRAVEL_RATE_PER_KM;
  }
  
  // Calculate subtotal: baseFee + distanceFee + loadSizeFee + apartmentPremium + accessFees + heavyItemFee
  const subtotal = baseFee + distanceFee + loadSizeFee + apartmentPremium + pickupDifficultyFee + 
                   dropoffDifficultyFee + moverTravelFee + heavyItemFee;
  
  // Apply number of movers multiplier
  const numberOfMoversMultiplier = numberOfMovers === 2 ? PRICING_CONFIG.TWO_MOVERS_MULTIPLIER : 1;
  const totalCost = subtotal * numberOfMoversMultiplier;
  
  return {
    baseFee: Math.round(baseFee * 100) / 100,
    distanceFee: Math.round(distanceFee * 100) / 100,
    distanceKm: Math.round(pickupToDropoffDistance * 10) / 10,  // Round to 1 decimal
    perKmRate: classConfig.perKmRate,
    loadFee: Math.round(loadFee * 100) / 100,
    loadSizeFee: Math.round(loadSizeFee * 100) / 100,
    apartmentPremium: Math.round(apartmentPremium * 100) / 100,
    pickupDifficultyFee: Math.round(pickupDifficultyFee * 100) / 100,
    dropoffDifficultyFee: Math.round(dropoffDifficultyFee * 100) / 100,
    heavyItemFee: Math.round(heavyItemFee * 100) / 100,
    moverTravelFee: Math.round(moverTravelFee * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    numberOfMoversMultiplier,
    totalCost: Math.round(totalCost * 100) / 100,
    vehicleClass,
    loadSize,
    volumeCuft: volumeCuft || undefined,
  };
}

/**
 * Calculate mover earnings after platform commission
 */
export function calculateMoverEarnings(priceBreakdown: PriceBreakdown): { 
  gross: number; 
  platformFee: number; 
  net: number;
  platformFeePercent: number;
} {
  const gross = priceBreakdown.totalCost;
  const platformFeePercent = PRICING_CONFIG.PLATFORM_FEE_PERCENT;
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
 * Format price breakdown for display (includes vehicle class)
 */
export function formatPriceBreakdown(breakdown: PriceBreakdown): string {
  const classConfig = breakdown.vehicleClass ? VEHICLE_CLASSES[breakdown.vehicleClass] : null;
  const lines = [
    classConfig ? `Vehicle Class ${breakdown.vehicleClass}: ${classConfig.name}` : null,
    `Base Fee: $${breakdown.baseFee.toFixed(2)}`,
    `Distance Fee (${classConfig ? `$${classConfig.perKmRate.toFixed(2)}/km` : 'per km'}): $${breakdown.distanceFee.toFixed(2)}`,
    breakdown.apartmentPremium > 0 ? `Apartment Move Premium: $${breakdown.apartmentPremium.toFixed(2)}` : null,
    breakdown.pickupDifficultyFee > 0 ? `Pickup Difficulty: $${breakdown.pickupDifficultyFee.toFixed(2)}` : null,
    breakdown.dropoffDifficultyFee > 0 ? `Dropoff Difficulty: $${breakdown.dropoffDifficultyFee.toFixed(2)}` : null,
    breakdown.heavyItemFee > 0 ? `Heavy Item: $${breakdown.heavyItemFee.toFixed(2)}` : null,
    breakdown.moverTravelFee > 0 ? `Mover Travel: $${breakdown.moverTravelFee.toFixed(2)}` : null,
    breakdown.numberOfMoversMultiplier > 1 ? `2-Movers Fee (×${breakdown.numberOfMoversMultiplier}): +30%` : null,
    `Total: $${breakdown.totalCost.toFixed(2)} CAD`,
  ];
  
  return lines.filter(Boolean).join('\n');
}

/**
 * Get price estimate preview (for quick quotes)
 */
export function getQuickPriceEstimate(
  distanceKm: number, 
  vehicleClass: VehicleClass
): { min: number; max: number; baseFee: number; perKmRate: number } {
  const config = VEHICLE_CLASSES[vehicleClass];
  const basePrice = config.baseFee + (distanceKm * config.perKmRate);
  
  return {
    min: Math.round(basePrice * 0.9 * 100) / 100,  // -10% for simple moves
    max: Math.round(basePrice * 1.3 * 100) / 100,  // +30% for complex moves
    baseFee: config.baseFee,
    perKmRate: config.perKmRate,
  };
}

// Helper functions for labels
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
  const labels: Record<DropoffDifficultyType, string> = {
    ground: 'Ground Floor',
    basement: 'Basement',
    stairs: 'Stairs',
    elevator: 'Elevator',
  };
  return labels[difficulty] || difficulty;
}

export function getVehicleClassLabel(vehicleClass: VehicleClass): string {
  const config = VEHICLE_CLASSES[vehicleClass];
  return `Class ${vehicleClass}: ${config.name}`;
}

export function getVehicleClassDescription(vehicleClass: VehicleClass): string {
  const config = VEHICLE_CLASSES[vehicleClass];
  return `${config.volumeRangeMin}-${config.volumeRangeMax} ft³ • $${config.baseFee} base + $${config.perKmRate.toFixed(2)}/km`;
}

// Export pricing config for admin/debug purposes
export function getPricingConfig() {
  return {
    vehicleClasses: VEHICLE_CLASSES,
    additionalFees: {
      moverTravelRatePerKm: PRICING_CONFIG.MOVER_TRAVEL_RATE_PER_KM,
      moverTravelFreeRadiusKm: PRICING_CONFIG.MOVER_TRAVEL_FREE_RADIUS_KM,
      pickupDifficultyFees: PRICING_CONFIG.PICKUP_DIFFICULTY_FEES,
      dropoffDifficultyFees: PRICING_CONFIG.DROPOFF_DIFFICULTY_FEES,
      heavyItemFee: PRICING_CONFIG.HEAVY_ITEM_FEE,
      twoMoversMultiplier: PRICING_CONFIG.TWO_MOVERS_MULTIPLIER,
    },
    platformFeePercent: PRICING_CONFIG.PLATFORM_FEE_PERCENT,
  };
}
