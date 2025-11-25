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
  totalCost: number;
}

// Pricing constants
const PRICING_CONFIG = {
  BASE_FEE: 30.00,
  DISTANCE_RATE_PER_KM: 1.00,
  MOVER_TRAVEL_RATE_PER_KM: 0.75,
  MOVER_TRAVEL_FREE_RADIUS_KM: 5,
  LOAD_FEES: {
    boxes: 0.00,      // 1-10 ft³: No fee for smallest items
    medium: 15.00,    // 11-50 ft³: Small furniture
    large: 30.00,     // 50-150 ft³: Large furniture
    apartment: 45.00, // 150+ ft³: Full room furniture
  },
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
  HEAVY_ITEM_FEE: 15.00,
  TWO_MOVERS_MULTIPLIER: 1.30, // 1 mover gets full fee (1x) + 2nd mover gets 30%
};

export type PickupDifficultyType = keyof typeof PRICING_CONFIG.PICKUP_DIFFICULTY_FEES;
export type DropoffDifficultyType = keyof typeof PRICING_CONFIG.DROPOFF_DIFFICULTY_FEES;

/**
 * Calculate the total price and breakdown for a moving job
 * Following the exact formula from requirements
 */
export function calculatePrice(
  pickupToDropoffDistance: number,
  loadSize: 'boxes' | 'medium' | 'large' | 'apartment',
  pickupDifficulty: PickupDifficultyType,
  dropoffDifficulty: DropoffDifficultyType,
  heavyItem: boolean,
  numberOfMovers: 1 | 2,
  moverToPickupDistance?: number
): PriceBreakdown {
  // Base fee
  const baseFee = PRICING_CONFIG.BASE_FEE;
  
  // Distance fee (pickup → dropoff)
  const distanceFee = pickupToDropoffDistance * PRICING_CONFIG.DISTANCE_RATE_PER_KM;
  
  // Load fee based on size
  console.log('[calculatePrice] loadSize param:', loadSize, 'type:', typeof loadSize);
  console.log('[calculatePrice] LOAD_FEES lookup:', PRICING_CONFIG.LOAD_FEES[loadSize]);
  console.log('[calculatePrice] All LOAD_FEES:', PRICING_CONFIG.LOAD_FEES);
  const loadFee = PRICING_CONFIG.LOAD_FEES[loadSize] || PRICING_CONFIG.LOAD_FEES.medium;
  console.log('[calculatePrice] Final loadFee:', loadFee);
  
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
  const subtotal = baseFee + distanceFee + loadFee + pickupDifficultyFee + 
                   dropoffDifficultyFee + heavyItemFee + moverTravelFee;
  
  // Apply number of movers multiplier
  const numberOfMoversMultiplier = numberOfMovers === 2 ? PRICING_CONFIG.TWO_MOVERS_MULTIPLIER : 1;
  const subtotalAfterMultiplier = subtotal * numberOfMoversMultiplier;
  
  // Total cost (no urgency fee for MVP)
  const totalCost = subtotalAfterMultiplier;
  
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
    breakdown.numberOfMoversMultiplier > 1 ? `2-Movers Fee (×${breakdown.numberOfMoversMultiplier}): 1st mover full fee + 2nd mover 30%` : null,
    `Total: $${breakdown.totalCost.toFixed(2)}`,
  ];
  
  return lines.filter(Boolean).join('\n');
}

// Helper functions to get friendly labels
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
