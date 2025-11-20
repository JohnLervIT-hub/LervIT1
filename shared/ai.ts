import { toDecimalString } from "./utils";

// AI Feature 1: Auto-Quote Predictor Types
export interface AIEstimateInput {
  pickupAddress: string;
  dropoffAddress: string;
  distance: number;
  loadSize?: string;
  pickupDifficulty?: string;
  dropoffDifficulty?: string;
  heavyItem?: boolean;
  numberOfMovers?: number;
}

export interface AIEstimateResult {
  minPrice: number;
  maxPrice: number;
  confidence: number;
  explanation: string;
}

// AI Feature 2: Price Breakdown Explainer Types
export interface PriceBreakdown {
  baseFee: number;
  distanceFee: number;
  loadFee: number;
  pickupDifficultyFee: number;
  dropoffDifficultyFee: number;
  heavyItemFee: number;
  moverTravelFee: number;
  subtotal: number;
  numberOfMovers: number;
  finalTotal: number;
  distance: number;
  loadSize: string;
  pickupDifficulty: string;
  dropoffDifficulty: string;
  heavyItem: boolean;
}

// AI Feature 3: Item Detection Types
export interface PhotoAnalysisResult {
  loadSize: "small" | "medium" | "large";
  heavyItem: boolean;
  recommendedMovers: 1 | 2;
  itemType: string;
  estimatedWeight: string;
  confidence: number;
  explanation: string;
}

/**
 * AI Feature 1: Predict price range based on partial booking information
 * Uses heuristics and historical averages to provide early estimate
 */
export function aiPredictPrice(input: AIEstimateInput): AIEstimateResult {
  const { distance, loadSize, pickupDifficulty, dropoffDifficulty, heavyItem, numberOfMovers } = input;
  
  // Base calculation
  let minPrice = 30; // Base fee
  let maxPrice = 30;
  
  // Distance fee (always present)
  const distanceFee = distance * 1.0;
  minPrice += distanceFee;
  maxPrice += distanceFee;
  
  // Load size (if known, use exact; otherwise estimate range)
  if (loadSize) {
    const loadFees = { small: 0, medium: 15, large: 30 };
    const fee = loadFees[loadSize as keyof typeof loadFees] || 15;
    minPrice += fee;
    maxPrice += fee;
  } else {
    minPrice += 0; // Assume small
    maxPrice += 30; // Assume large
  }
  
  // Pickup difficulty (if known, use exact; otherwise estimate)
  if (pickupDifficulty) {
    const difficultyFees = { ground: 0, stairs: 5, elevator: 8, basement: 10 };
    const fee = difficultyFees[pickupDifficulty as keyof typeof difficultyFees] || 0;
    minPrice += fee;
    maxPrice += fee;
  } else {
    minPrice += 0; // Assume ground
    maxPrice += 10; // Assume basement
  }
  
  // Dropoff difficulty
  if (dropoffDifficulty) {
    const difficultyFees = { ground: 0, stairs: 5, elevator: 8, basement: 10 };
    const fee = difficultyFees[dropoffDifficulty as keyof typeof difficultyFees] || 0;
    minPrice += fee;
    maxPrice += fee;
  } else {
    minPrice += 0;
    maxPrice += 10;
  }
  
  // Heavy item
  if (heavyItem !== undefined) {
    const fee = heavyItem ? 15 : 0;
    minPrice += fee;
    maxPrice += fee;
  } else {
    minPrice += 0; // Assume not heavy
    maxPrice += 15; // Assume heavy
  }
  
  // Mover travel fee (distance > 5km)
  if (distance > 5) {
    const travelFee = (distance - 5) * 0.75;
    minPrice += travelFee;
    maxPrice += travelFee;
  }
  
  // Number of movers multiplier
  const movers = numberOfMovers || 1;
  if (movers === 2) {
    minPrice *= 1.75;
    maxPrice *= 1.75;
  }
  
  // Calculate confidence based on how many fields are filled
  const totalFields = 5; // loadSize, pickupDifficulty, dropoffDifficulty, heavyItem, numberOfMovers
  let filledFields = 0;
  if (loadSize) filledFields++;
  if (pickupDifficulty) filledFields++;
  if (dropoffDifficulty) filledFields++;
  if (heavyItem !== undefined) filledFields++;
  if (numberOfMovers) filledFields++;
  
  const confidence = Math.round((filledFields / totalFields) * 100);
  
  // Generate explanation
  let explanation = "Estimate based on";
  if (distance > 0) explanation += ` ${distance.toFixed(1)}km distance`;
  if (filledFields > 0) {
    explanation += ` and ${filledFields} confirmed detail${filledFields > 1 ? 's' : ''}`;
  }
  explanation += `. Fill in more details for accurate pricing.`;
  
  return {
    minPrice: Math.round(minPrice * 100) / 100,
    maxPrice: Math.round(maxPrice * 100) / 100,
    confidence,
    explanation
  };
}

/**
 * AI Feature 2: Generate natural language explanation of price breakdown
 * Uses the 7-component pricing system (no urgency)
 */
export function generatePriceExplanation(breakdown: PriceBreakdown): string {
  const parts: string[] = [];
  
  // Start with friendly intro
  parts.push(`Your move costs $${breakdown.finalTotal.toFixed(2)}. Here's how we calculated it:`);
  parts.push("");
  
  // Base fee
  parts.push(`• **Base Fee**: $${breakdown.baseFee.toFixed(2)} (flat rate for all moves)`);
  
  // Distance fee
  if (breakdown.distanceFee > 0) {
    parts.push(`• **Distance Fee**: $${breakdown.distanceFee.toFixed(2)} (${breakdown.distance.toFixed(1)} km × $1.00/km)`);
  }
  
  // Load size fee
  if (breakdown.loadFee > 0) {
    const loadSizeMap: Record<string, string> = {
      small: "small load",
      medium: "medium load",
      large: "large load"
    };
    parts.push(`• **Load Size Fee**: $${breakdown.loadFee.toFixed(2)} (${loadSizeMap[breakdown.loadSize] || breakdown.loadSize})`);
  }
  
  // Pickup difficulty
  if (breakdown.pickupDifficultyFee > 0) {
    const difficultyMap: Record<string, string> = {
      stairs: "stairs at pickup",
      elevator: "elevator at pickup",
      basement: "basement pickup"
    };
    parts.push(`• **Pickup Difficulty**: $${breakdown.pickupDifficultyFee.toFixed(2)} (${difficultyMap[breakdown.pickupDifficulty] || breakdown.pickupDifficulty})`);
  }
  
  // Dropoff difficulty
  if (breakdown.dropoffDifficultyFee > 0) {
    const difficultyMap: Record<string, string> = {
      stairs: "stairs at dropoff",
      elevator: "elevator at dropoff",
      basement: "basement dropoff"
    };
    parts.push(`• **Dropoff Difficulty**: $${breakdown.dropoffDifficultyFee.toFixed(2)} (${difficultyMap[breakdown.dropoffDifficulty] || breakdown.dropoffDifficulty})`);
  }
  
  // Heavy item
  if (breakdown.heavyItem && breakdown.heavyItemFee > 0) {
    parts.push(`• **Heavy Item Fee**: $${breakdown.heavyItemFee.toFixed(2)} (extra care required)`);
  }
  
  // Mover travel fee
  if (breakdown.moverTravelFee > 0) {
    parts.push(`• **Mover Travel Fee**: $${breakdown.moverTravelFee.toFixed(2)} (travel to pickup location)`);
  }
  
  // Subtotal before multiplier
  parts.push("");
  parts.push(`**Subtotal**: $${breakdown.subtotal.toFixed(2)}`);
  
  // Two movers multiplier
  if (breakdown.numberOfMovers === 2) {
    parts.push("");
    parts.push(`• **2-Movers Multiplier**: 1.75× (doubles efficiency and safety)`);
    parts.push(`• **Final Total**: $${breakdown.subtotal.toFixed(2)} × 1.75 = $${breakdown.finalTotal.toFixed(2)}`);
  } else {
    parts.push("");
    parts.push(`**Final Total**: $${breakdown.finalTotal.toFixed(2)}`);
  }
  
  return parts.join("\n");
}
