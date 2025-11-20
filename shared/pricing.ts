// Uber-style dynamic pricing calculator for moving services

export interface PriceBreakdown {
  baseFee: number;
  distanceFee: number;
  loadFee: number;
  moverTravelFee: number;
  pickupDifficultyFee: number;
  dropoffDifficultyFee: number;
  heavyItemFee: number;
  subtotal: number;
  numberOfMoversMultiplier: number;
  urgencyFee: number;
  totalCost: number;
}

// Pricing constants
const PRICING_CONFIG = {
  BASE_FEE: 30.00,
  DISTANCE_RATE_PER_KM: 1.00,
  MOVER_TRAVEL_RATE_PER_KM: 0.75,
  MOVER_TRAVEL_FREE_RADIUS_KM: 5,
  LOAD_FEES: {
    small: 0.00,
    medium: 15.00,
    large: 30.00,
  },
  PICKUP_DIFFICULTY_FEES: {
    ground: 0.00,
    basement: 10.00,
    elevator: 0.00,
    stairs_1: 10.00,
    stairs_2: 20.00,
    stairs_3: 30.00,
    stairs_4: 40.00,
    stairs_5: 50.00,
  },
  DROPOFF_DIFFICULTY_FEES: {
    ground: 0.00,
    basement: 10.00,
    elevator: 0.00,
    stairs_1: 10.00,
    stairs_2: 20.00,
    stairs_3: 30.00,
    stairs_4: 40.00,
    stairs_5: 50.00,
  },
  HEAVY_ITEM_FEE: 15.00,
  TWO_MOVERS_MULTIPLIER: 1.75,
  URGENCY_FEES: {
    standard: 0.00,
    within_2_hours: 20.00,
    within_1_hour: 30.00,
    within_30_minutes: 40.00,
  }
};

export type PickupDifficultyType = keyof typeof PRICING_CONFIG.PICKUP_DIFFICULTY_FEES;
export type DropoffDifficultyType = keyof typeof PRICING_CONFIG.DROPOFF_DIFFICULTY_FEES;
export type UrgencyType = keyof typeof PRICING_CONFIG.URGENCY_FEES;

/**
 * Calculate the total price and breakdown for a moving job
 * Following the exact formula from requirements
 */
export function calculatePrice(
  pickupToDropoffDistance: number,
  loadSize: 'small' | 'medium' | 'large',
  pickupDifficulty: PickupDifficultyType,
  dropoffDifficulty: DropoffDifficultyType,
  heavyItem: boolean,
  numberOfMovers: 1 | 2,
  urgency: UrgencyType,
  moverToPickupDistance?: number
): PriceBreakdown {
  // Base fee
  const baseFee = PRICING_CONFIG.BASE_FEE;
  
  // Distance fee (pickup → dropoff)
  const distanceFee = pickupToDropoffDistance * PRICING_CONFIG.DISTANCE_RATE_PER_KM;
  
  // Load fee based on size
  const loadFee = PRICING_CONFIG.LOAD_FEES[loadSize] || PRICING_CONFIG.LOAD_FEES.medium;
  
  // Pickup difficulty fee
  const pickupDifficultyFee = PRICING_CONFIG.PICKUP_DIFFICULTY_FEES[pickupDifficulty] || 0;
  
  // Dropoff difficulty fee
  const dropoffDifficultyFee = PRICING_CONFIG.DROPOFF_DIFFICULTY_FEES[dropoffDifficulty] || 0;
  
  // Heavy item fee
  const heavyItemFee = heavyItem ? PRICING_CONFIG.HEAVY_ITEM_FEE : 0;
  
  // Mover travel fee (only if mover travels more than free radius)
  let moverTravelFee = 0;
  if (moverToPickupDistance && moverToPickupDistance > PRICING_CONFIG.MOVER_TRAVEL_FREE_RADIUS_KM) {
    const chargeableDistance = moverToPickupDistance - PRICING_CONFIG.MOVER_TRAVEL_FREE_RADIUS_KM;
    moverTravelFee = chargeableDistance * PRICING_CONFIG.MOVER_TRAVEL_RATE_PER_KM;
  }
  
  // Calculate subtotal (before number of movers multiplier)
  let subtotal = baseFee + distanceFee + loadFee + pickupDifficultyFee + 
                 dropoffDifficultyFee + heavyItemFee + moverTravelFee;
  
  // Apply number of movers multiplier
  const numberOfMoversMultiplier = numberOfMovers === 2 ? PRICING_CONFIG.TWO_MOVERS_MULTIPLIER : 1;
  if (numberOfMovers === 2) {
    subtotal = subtotal * numberOfMoversMultiplier;
  }
  
  // Urgency fee (added after multiplier)
  const urgencyFee = PRICING_CONFIG.URGENCY_FEES[urgency] || 0;
  
  // Total cost
  const totalCost = subtotal + urgencyFee;
  
  return {
    baseFee: Math.round(baseFee * 100) / 100,
    distanceFee: Math.round(distanceFee * 100) / 100,
    loadFee: Math.round(loadFee * 100) / 100,
    pickupDifficultyFee: Math.round(pickupDifficultyFee * 100) / 100,
    dropoffDifficultyFee: Math.round(dropoffDifficultyFee * 100) / 100,
    heavyItemFee: Math.round(heavyItemFee * 100) / 100,
    moverTravelFee: Math.round(moverTravelFee * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    numberOfMoversMultiplier,
    urgencyFee: Math.round(urgencyFee * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}

/**
 * Calculate estimated earnings for a mover
 */
export function calculateMoverEarnings(priceBreakdown: PriceBreakdown): number {
  // In a real Uber-style platform, this would deduct platform commission
  // For MVP, movers get 100% of the price
  return priceBreakdown.totalCost;
}

/**
 * Format price breakdown for display
 */
export function formatPriceBreakdown(breakdown: PriceBreakdown): string {
  const lines = [
    `Base Fee: $${breakdown.baseFee.toFixed(2)}`,
    `Distance Fee: $${breakdown.distanceFee.toFixed(2)}`,
    breakdown.loadFee > 0 ? `Load Fee: $${breakdown.loadFee.toFixed(2)}` : null,
    breakdown.pickupDifficultyFee > 0 ? `Pickup Difficulty: $${breakdown.pickupDifficultyFee.toFixed(2)}` : null,
    breakdown.dropoffDifficultyFee > 0 ? `Dropoff Difficulty: $${breakdown.dropoffDifficultyFee.toFixed(2)}` : null,
    breakdown.heavyItemFee > 0 ? `Heavy Item: $${breakdown.heavyItemFee.toFixed(2)}` : null,
    breakdown.moverTravelFee > 0 ? `Mover Travel: $${breakdown.moverTravelFee.toFixed(2)}` : null,
    breakdown.numberOfMoversMultiplier > 1 ? `2-Movers Multiplier (×${breakdown.numberOfMoversMultiplier}): Applied` : null,
    breakdown.urgencyFee > 0 ? `Urgency Fee: $${breakdown.urgencyFee.toFixed(2)}` : null,
    `Total: $${breakdown.totalCost.toFixed(2)}`,
  ];
  
  return lines.filter(Boolean).join('\n');
}

// Helper functions to get friendly labels
export function getPickupDifficultyLabel(difficulty: PickupDifficultyType): string {
  const labels: Record<PickupDifficultyType, string> = {
    ground: 'Ground Floor',
    basement: 'Basement',
    elevator: 'Elevator Available',
    stairs_1: 'Stairs (1 Floor)',
    stairs_2: 'Stairs (2 Floors)',
    stairs_3: 'Stairs (3 Floors)',
    stairs_4: 'Stairs (4 Floors)',
    stairs_5: 'Stairs (5 Floors)',
  };
  return labels[difficulty] || difficulty;
}

export function getDropoffDifficultyLabel(difficulty: DropoffDifficultyType): string {
  const labels: Record<DropoffDifficultyType, string> = {
    ground: 'Ground Floor',
    basement: 'Basement',
    elevator: 'Elevator Available',
    stairs_1: 'Stairs (1 Floor)',
    stairs_2: 'Stairs (2 Floors)',
    stairs_3: 'Stairs (3 Floors)',
    stairs_4: 'Stairs (4 Floors)',
    stairs_5: 'Stairs (5 Floors)',
  };
  return labels[difficulty] || difficulty;
}

export function getUrgencyLabel(urgency: UrgencyType): string {
  const labels: Record<UrgencyType, string> = {
    standard: 'Standard (2+ hours)',
    within_2_hours: 'Within 2 Hours',
    within_1_hour: 'Within 1 Hour',
    within_30_minutes: 'Within 30 Minutes',
  };
  return labels[urgency] || urgency;
}
