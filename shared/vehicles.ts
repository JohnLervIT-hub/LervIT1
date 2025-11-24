/**
 * Expert Vehicle Recommendations for Moving Services
 * Based on 15 years of logistics industry experience
 * Calgary-specific considerations for climate, terrain, and urban access
 */

export type VehicleType = 
  | "Compact Cargo Van"
  | "Hatchback Wagon"
  | "Long-Wheelbase SUV"
  | "Short-Box Pickup"
  | "High-Roof Compact Van"
  | "3/4-Ton Cargo Van"
  | "3/4-Ton Pickup + Trailer"
  | "5-Ton Cube Truck"
  | "Large Cargo Van"
  | "Tandem-Axle Truck";

export type LoadSizeCategory = "boxes" | "medium" | "large" | "apartment";

export interface VehicleRecommendation {
  primary: VehicleType;
  secondary?: VehicleType;
  contingency?: VehicleType;
  rationale: string;
  minCargoVolumeFt3: number;
  minPayloadLbs: number;
  requiredFeatures: string[];
  calgaryConsiderations: string[];
}

export interface ItemTrigger {
  keywords: string[];
  escalation: "next_tier" | "specialty";
  reason: string;
}

/**
 * Item-level triggers that require vehicle tier escalation
 */
export const HEAVY_SPECIALTY_ITEMS: ItemTrigger[] = [
  {
    keywords: ["piano", "grand piano", "upright piano"],
    escalation: "next_tier",
    reason: "Pianos require specialized equipment and weight capacity"
  },
  {
    keywords: ["treadmill", "elliptical", "exercise equipment", "gym equipment", "weight machine"],
    escalation: "next_tier",
    reason: "Exercise equipment is extremely heavy (300-500 lbs) and requires lift-gate"
  },
  {
    keywords: ["stone countertop", "granite", "marble slab", "quartz countertop"],
    escalation: "next_tier",
    reason: "Stone materials are dense and fragile, requiring suspension-equipped vans"
  },
  {
    keywords: ["antique", "vintage furniture", "heirloom"],
    escalation: "specialty",
    reason: "Fragile antiques require suspension-equipped vans with climate control"
  },
  {
    keywords: ["safe", "gun safe", "vault"],
    escalation: "next_tier",
    reason: "Safes are extremely heavy (500-2000 lbs) and require specialized moving equipment"
  }
];

/**
 * Vehicle recommendation matrix based on load size
 */
export const VEHICLE_RECOMMENDATIONS: Record<LoadSizeCategory, VehicleRecommendation> = {
  boxes: {
    primary: "Compact Cargo Van",
    secondary: "Hatchback Wagon",
    rationale: "Compact cargo vans (RAM ProMaster City, Nissan NV200) provide enclosed protection from Calgary winters while maintaining maneuverability in residential areas. Hatchback wagons work for ultra-light loads in fair weather.",
    minCargoVolumeFt3: 10,
    minPayloadLbs: 250,
    requiredFeatures: ["Enclosed cargo area", "Tie-down points"],
    calgaryConsiderations: [
      "Winter tires mandatory Nov-Mar",
      "Heated cargo recommended for electronics",
      "Downtown parkade clearance ≤6'8\""
    ]
  },
  medium: {
    primary: "Long-Wheelbase SUV",
    secondary: "Short-Box Pickup",
    contingency: "High-Roof Compact Van",
    rationale: "Long-wheelbase SUVs (Ford Expedition, Nissan Armada) offer best balance of cargo space and maneuverability. Short-box pickups with weatherproof tonneau covers work well. High-roof vans handle oversized items.",
    minCargoVolumeFt3: 50,
    minPayloadLbs: 1500,
    requiredFeatures: ["Weather protection", "Folding rear seats", "Tie-down points"],
    calgaryConsiderations: [
      "Tonneau cover required for pickups (snow/rain protection)",
      "Consider 3/4-ton pickup for items >200 lbs",
      "Winter tires mandatory Nov-Mar"
    ]
  },
  large: {
    primary: "3/4-Ton Cargo Van",
    secondary: "3/4-Ton Pickup + Trailer",
    contingency: "5-Ton Cube Truck",
    rationale: "3/4-ton cargo vans (Mercedes Sprinter 2500, Ford Transit 250 HD) with lift-gate/ramp are ideal for large furniture. Pickups with enclosed trailers work in heavy snow. Cube trucks for combined weight >3,000 lbs or stairs.",
    minCargoVolumeFt3: 150,
    minPayloadLbs: 3500,
    requiredFeatures: ["Lift-gate or ramp", "Interior tie-downs", "Moving blankets", "Appliance dolly"],
    calgaryConsiderations: [
      "Lift-gate crucial for heavy items (sofas, fridges, washers)",
      "Insulated blankets for electronics in winter",
      "Ramp icing risk during Chinook melt/refreeze cycles",
      "Winter tires mandatory Nov-Mar"
    ]
  },
  apartment: {
    primary: "5-Ton Cube Truck",
    secondary: "Large Cargo Van",
    contingency: "Tandem-Axle Truck",
    rationale: "5-ton cube trucks (26') with power lift-gates and seasonal winter tires handle full apartment moves. Large cargo vans work for inner-city tight-clearance jobs. Tandem-axle for multi-bedroom or >8,000 lbs.",
    minCargoVolumeFt3: 400,
    minPayloadLbs: 10000,
    requiredFeatures: ["Power lift-gate", "Furniture pads", "Heavy-duty dollies", "Tie-down straps", "Floor protection"],
    calgaryConsiderations: [
      "Winter tire compliance Nov-Mar essential",
      "Verify downtown parkade clearance",
      "Seasonal winter tires for cube trucks",
      "Consider tandem-axle for multi-bedroom (>8,000 lbs)",
      "Heated cargo or insulated blankets for electronics"
    ]
  }
};

/**
 * Determine if item requires vehicle tier escalation
 */
export function checkItemEscalation(itemDescription: string): ItemTrigger | null {
  const itemLower = itemDescription.toLowerCase();
  
  for (const trigger of HEAVY_SPECIALTY_ITEMS) {
    for (const keyword of trigger.keywords) {
      if (itemLower.includes(keyword)) {
        return trigger;
      }
    }
  }
  
  return null;
}

/**
 * Get next tier vehicle for escalation
 */
export function getEscalatedVehicle(currentLoadSize: LoadSizeCategory): LoadSizeCategory {
  const tierOrder: LoadSizeCategory[] = ["boxes", "medium", "large", "apartment"];
  const currentIndex = tierOrder.indexOf(currentLoadSize);
  
  if (currentIndex < tierOrder.length - 1) {
    return tierOrder[currentIndex + 1];
  }
  
  return currentLoadSize; // Already at max tier
}

/**
 * Get comprehensive vehicle recommendation with escalation logic
 */
export function getVehicleRecommendation(
  loadSize: LoadSizeCategory,
  itemDescription: string,
  estimatedWeightLbs?: number
): {
  loadSize: LoadSizeCategory;
  vehicle: VehicleRecommendation;
  escalated: boolean;
  escalationReason?: string;
} {
  let finalLoadSize = loadSize;
  let escalated = false;
  let escalationReason: string | undefined;
  
  // Check for item-level triggers
  const trigger = checkItemEscalation(itemDescription);
  if (trigger && trigger.escalation === "next_tier") {
    finalLoadSize = getEscalatedVehicle(loadSize);
    escalated = true;
    escalationReason = trigger.reason;
  }
  
  // Check weight-based escalation
  if (estimatedWeightLbs && estimatedWeightLbs > 500 && loadSize === "medium") {
    finalLoadSize = "large";
    escalated = true;
    escalationReason = "Item weight exceeds 500 lbs, requiring heavy-duty equipment";
  }
  
  return {
    loadSize: finalLoadSize,
    vehicle: VEHICLE_RECOMMENDATIONS[finalLoadSize],
    escalated,
    escalationReason
  };
}

/**
 * Format vehicle recommendation for display
 */
export function formatVehicleDisplay(recommendation: VehicleRecommendation): string {
  const vehicles = [recommendation.primary];
  if (recommendation.secondary) vehicles.push(recommendation.secondary);
  
  if (vehicles.length === 1) {
    return vehicles[0];
  }
  
  return `${vehicles[0]} or ${vehicles[1]}`;
}

/**
 * Get required vehicle specs for mover matching
 */
export interface VehicleSpecs {
  cargoVolumeFt3: number;
  payloadCapacityLbs: number;
  hasLiftGate: boolean;
  hasRamp: boolean;
  interiorHeightInches: number;
  doorWidthInches: number;
  doorHeightInches: number;
  hasWinterTires: boolean;
  hasClimateControl: boolean;
}

/**
 * Check if mover's vehicle meets load requirements
 */
export function vehicleMeetsRequirements(
  vehicleSpecs: Partial<VehicleSpecs>,
  loadSize: LoadSizeCategory,
  monthOfYear: number // 1-12
): {
  meets: boolean;
  missingRequirements: string[];
} {
  const recommendation = VEHICLE_RECOMMENDATIONS[loadSize];
  const missingRequirements: string[] = [];
  
  // Check cargo volume
  if (vehicleSpecs.cargoVolumeFt3 && vehicleSpecs.cargoVolumeFt3 < recommendation.minCargoVolumeFt3) {
    missingRequirements.push(`Minimum ${recommendation.minCargoVolumeFt3} ft³ cargo volume`);
  }
  
  // Check payload
  if (vehicleSpecs.payloadCapacityLbs && vehicleSpecs.payloadCapacityLbs < recommendation.minPayloadLbs) {
    missingRequirements.push(`Minimum ${recommendation.minPayloadLbs} lbs payload capacity`);
  }
  
  // Check winter tires (Nov-Mar = months 11, 12, 1, 2, 3)
  const isWinterSeason = monthOfYear >= 11 || monthOfYear <= 3;
  if (isWinterSeason && vehicleSpecs.hasWinterTires === false) {
    missingRequirements.push("Winter tires (mandatory Nov-Mar)");
  }
  
  // Check lift-gate for large/apartment
  if ((loadSize === "large" || loadSize === "apartment") && 
      !vehicleSpecs.hasLiftGate && !vehicleSpecs.hasRamp) {
    missingRequirements.push("Lift-gate or ramp access");
  }
  
  return {
    meets: missingRequirements.length === 0,
    missingRequirements
  };
}
