// LervIT PrecisionMatch™ Dynamic Pricing Calculator
// Vehicle class-based pricing system for moving services

export interface PriceBreakdown {
  baseFee: number;
  distanceFee: number;
  loadFee: number;
  loadSizeFee: number;  // New: Load Size Fee (Boxes: $0, Medium: $15, Large: $30, Apartment: $45)
  moverTravelFee: number;
  pickupDifficultyFee: number;
  dropoffDifficultyFee: number;
  heavyItemFee: number;  // Kept for backwards compatibility
  subtotal: number;
  numberOfMoversMultiplier: number;
  totalCost: number;
  vehicleClass?: VehicleClass;
  loadSize?: string;  // Store the load size for display
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
 * Volume thresholds:
 *   0-20 ft³   → Class A (SUV/Small Vehicle)
 *   21-80 ft³  → Class B/C (Cargo Van)
 *   81-170 ft³ → Class D (Pickup Truck)
 *   >170 ft³   → Class E (Moving Truck)
 */
export const VEHICLE_CLASSES: Record<VehicleClass, VehicleClassConfig> = {
  A: {
    class: 'A',
    name: 'SUV / Small Vehicle',
    vehicleType: 'car',
    volumeRangeMin: 0,
    volumeRangeMax: 20,
    baseFee: 10.00,
    perKmRate: 0.90,
    loadType: 'Small items, single chairs',
    examples: '1-4 boxes, single chair, small items',
  },
  B: {
    class: 'B',
    name: 'Large SUV / Small Cargo Van',
    vehicleType: 'van',
    volumeRangeMin: 20,
    volumeRangeMax: 50,
    baseFee: 12.00,
    perKmRate: 1.00,
    loadType: 'Small furniture, pair of chairs',
    examples: 'Pair of chairs, small table, 6+ boxes',
  },
  C: {
    class: 'C',
    name: 'Cargo Van',
    vehicleType: 'van',
    volumeRangeMin: 50,
    volumeRangeMax: 80,
    baseFee: 15.00,
    perKmRate: 1.25,
    loadType: 'Medium furniture loads',
    examples: 'Small sofa, mattress, bedroom items',
  },
  D: {
    class: 'D',
    name: 'Pickup Truck / Small Moving Truck',
    vehicleType: 'pickup',
    volumeRangeMin: 80,
    volumeRangeMax: 170,
    baseFee: 20.00,
    perKmRate: 1.60,
    loadType: 'Full bedroom / large items',
    examples: 'Bed frame + mattress, dresser, multiple furniture',
  },
  E: {
    class: 'E',
    name: 'Moving Truck (Large)',
    vehicleType: 'truck',
    volumeRangeMin: 170,
    volumeRangeMax: 500,
    baseFee: 40.00,
    perKmRate: 2.00,
    loadType: 'Full apartment / home moves',
    examples: 'Full apartment, appliances, heavy loads',
  },
};

// Map loadSize values to vehicle classes (synced with furniture-database.ts)
export const LOAD_SIZE_TO_CLASS: Record<string, VehicleClass> = {
  'boxes': 'A',        // 0-20 ft³ → Class A (SUV) - boxes, small items
  'small': 'A',        // Alias for boxes
  'medium': 'C',       // 21-80 ft³ → Class C (Cargo Van)
  'large': 'D',        // 81-170 ft³ → Class D (Pickup Truck)
  'apartment': 'E',    // >170 ft³ → Class E (Moving Truck)
};

/**
 * Determine vehicle class from total volume
 * Synced with furniture-database.ts thresholds:
 *   0-20 ft³   → A (SUV)
 *   21-50 ft³  → B (Large SUV/Small Van)
 *   51-80 ft³  → C (Cargo Van)
 *   81-170 ft³ → D (Pickup Truck)
 *   >170 ft³   → E (Moving Truck)
 */
export function getVehicleClassFromVolume(volumeCuft: number): VehicleClass {
  if (volumeCuft <= 20) return 'A';
  if (volumeCuft <= 50) return 'B';
  if (volumeCuft <= 80) return 'C';
  if (volumeCuft <= 170) return 'D';
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
  MOVER_TRAVEL_RATE_PER_KM: 0.75,
  MOVER_TRAVEL_FREE_RADIUS_KM: 5,
  
  PICKUP_DIFFICULTY_FEES: {
    ground: 0.00,
    basement: 10.00,
    stairs: 5.00,
    elevator: 8.00,
  },
  DROPOFF_DIFFICULTY_FEES: {
    ground: 0.00,
    basement: 10.00,
    stairs: 5.00,
    elevator: 8.00,
  },
  // Load Size Fees (replaces heavy item fee in pricing calculation)
  LOAD_SIZE_FEES: {
    boxes: 5.00,     // Class A (SUV) - $5 mandatory load fee for 0-20 ft³
    small: 5.00,     // Alias for boxes - $5 mandatory load fee
    medium: 15.00,   // Cargo Van loads
    large: 30.00,    // Pickup Truck loads
    apartment: 45.00, // Moving Truck loads
  } as Record<string, number>,
  HEAVY_ITEM_FEE: 15.00, // Kept for backwards compatibility but not used in new pricing
  TWO_MOVERS_MULTIPLIER: 1.30,
  
  // Platform commission (15% for Uber-style payout)
  PLATFORM_FEE_PERCENT: 15.00,
};

export type PickupDifficultyType = keyof typeof PRICING_CONFIG.PICKUP_DIFFICULTY_FEES;
export type DropoffDifficultyType = keyof typeof PRICING_CONFIG.DROPOFF_DIFFICULTY_FEES;

/**
 * Calculate the total price using vehicle class-based pricing
 * New formula: total = baseFee + distanceFee + loadSizeFee + accessFees
 * Load Size Fees: Boxes: $5 (Class A), Medium: $15, Large: $30, Apartment: $45
 * Class A Distance Rate: $0.90/km
 */
export function calculatePrice(
  pickupToDropoffDistance: number,
  loadSize: 'boxes' | 'small' | 'medium' | 'large' | 'apartment',
  pickupDifficulty: PickupDifficultyType,
  dropoffDifficulty: DropoffDifficultyType,
  heavyItem: boolean,
  numberOfMovers: 1 | 2,
  moverToPickupDistance?: number,
  volumeCuft?: number  // Optional: use volume directly for more accurate class determination
): PriceBreakdown {
  // Determine vehicle class (prefer volume if provided, otherwise use loadSize)
  const vehicleClass = volumeCuft 
    ? getVehicleClassFromVolume(volumeCuft)
    : getVehicleClassFromLoadSize(loadSize);
  
  const classConfig = VEHICLE_CLASSES[vehicleClass];
  
  // Base fee from vehicle class
  const baseFee = classConfig.baseFee;
  
  // Distance fee based on vehicle class per-km rate
  const distanceFee = pickupToDropoffDistance * classConfig.perKmRate;
  
  // Load fee is now included in base fee (class-based pricing)
  // Keeping loadFee = 0 for backwards compatibility in breakdown display
  const loadFee = 0;
  
  // NEW: Load Size Fee (Boxes: $0, Medium: $15, Large: $30, Apartment: $45)
  const loadSizeFee = PRICING_CONFIG.LOAD_SIZE_FEES[loadSize] || 0;
  
  // Pickup difficulty fee
  const pickupDifficultyFee = PRICING_CONFIG.PICKUP_DIFFICULTY_FEES[pickupDifficulty] || 0;
  
  // Dropoff difficulty fee
  const dropoffDifficultyFee = PRICING_CONFIG.DROPOFF_DIFFICULTY_FEES[dropoffDifficulty] || 0;
  
  // Heavy item fee - kept in form but NOT included in pricing calculation anymore
  // (User can still toggle it but it doesn't affect the price)
  const heavyItemFee = 0;  // Previously: heavyItem ? PRICING_CONFIG.HEAVY_ITEM_FEE : 0;
  
  // Mover travel fee (only if mover travels more than free radius)
  let moverTravelFee = 0;
  if (moverToPickupDistance && moverToPickupDistance > PRICING_CONFIG.MOVER_TRAVEL_FREE_RADIUS_KM) {
    const chargeableDistance = moverToPickupDistance - PRICING_CONFIG.MOVER_TRAVEL_FREE_RADIUS_KM;
    moverTravelFee = chargeableDistance * PRICING_CONFIG.MOVER_TRAVEL_RATE_PER_KM;
  }
  
  // Calculate subtotal: baseFee + distanceFee + loadSizeFee + accessFees
  const subtotal = baseFee + distanceFee + loadSizeFee + pickupDifficultyFee + 
                   dropoffDifficultyFee + moverTravelFee;
  
  // Apply number of movers multiplier
  const numberOfMoversMultiplier = numberOfMovers === 2 ? PRICING_CONFIG.TWO_MOVERS_MULTIPLIER : 1;
  const totalCost = subtotal * numberOfMoversMultiplier;
  
  return {
    baseFee: Math.round(baseFee * 100) / 100,
    distanceFee: Math.round(distanceFee * 100) / 100,
    loadFee: Math.round(loadFee * 100) / 100,
    loadSizeFee: Math.round(loadSizeFee * 100) / 100,
    pickupDifficultyFee: Math.round(pickupDifficultyFee * 100) / 100,
    dropoffDifficultyFee: Math.round(dropoffDifficultyFee * 100) / 100,
    heavyItemFee: Math.round(heavyItemFee * 100) / 100,
    moverTravelFee: Math.round(moverTravelFee * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    numberOfMoversMultiplier,
    totalCost: Math.round(totalCost * 100) / 100,
    vehicleClass,
    loadSize,
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
