// Uber-style dynamic pricing calculator for moving services

export interface PriceBreakdown {
  baseFee: number;
  distanceFee: number;
  loadFee: number;
  moverTravelFee: number;
  totalCost: number;
}

// Pricing constants
const PRICING_CONFIG = {
  BASE_FEE: 25.00,
  DISTANCE_RATE_PER_KM: 1.50,
  MOVER_TRAVEL_RATE_PER_KM: 0.75,
  MOVER_TRAVEL_FREE_RADIUS_KM: 5,
  LOAD_FEES: {
    small: 10.00,
    medium: 25.00,
    large: 40.00,
  }
};

/**
 * Calculate the total price and breakdown for a moving job
 * 
 * @param pickupToDropoffDistance - Distance from pickup to dropoff in km
 * @param loadSize - Size of the load: 'small', 'medium', or 'large'
 * @param moverToPickupDistance - Optional: Distance from mover's location to pickup in km
 * @returns Price breakdown with all components
 */
export function calculatePrice(
  pickupToDropoffDistance: number,
  loadSize: 'small' | 'medium' | 'large',
  moverToPickupDistance?: number
): PriceBreakdown {
  // Base fee
  const baseFee = PRICING_CONFIG.BASE_FEE;
  
  // Distance fee (pickup → dropoff)
  const distanceFee = pickupToDropoffDistance * PRICING_CONFIG.DISTANCE_RATE_PER_KM;
  
  // Load fee based on size
  const loadFee = PRICING_CONFIG.LOAD_FEES[loadSize] || PRICING_CONFIG.LOAD_FEES.medium;
  
  // Mover travel fee (only if mover travels more than free radius)
  let moverTravelFee = 0;
  if (moverToPickupDistance && moverToPickupDistance > PRICING_CONFIG.MOVER_TRAVEL_FREE_RADIUS_KM) {
    const chargeableDistance = moverToPickupDistance - PRICING_CONFIG.MOVER_TRAVEL_FREE_RADIUS_KM;
    moverTravelFee = chargeableDistance * PRICING_CONFIG.MOVER_TRAVEL_RATE_PER_KM;
  }
  
  // Total cost
  const totalCost = baseFee + distanceFee + loadFee + moverTravelFee;
  
  return {
    baseFee: Math.round(baseFee * 100) / 100,
    distanceFee: Math.round(distanceFee * 100) / 100,
    loadFee: Math.round(loadFee * 100) / 100,
    moverTravelFee: Math.round(moverTravelFee * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}

/**
 * Calculate estimated earnings for a mover
 * (This would typically include platform fees, but for MVP we show full amount)
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
  return [
    `Base Fee: $${breakdown.baseFee.toFixed(2)}`,
    `Distance Fee: $${breakdown.distanceFee.toFixed(2)}`,
    `Load Fee: $${breakdown.loadFee.toFixed(2)}`,
    breakdown.moverTravelFee > 0 ? `Mover Travel Fee: $${breakdown.moverTravelFee.toFixed(2)}` : null,
    `Total: $${breakdown.totalCost.toFixed(2)}`,
  ].filter(Boolean).join('\n');
}
