/**
 * LervIT Vision Engine 2.0 - Dimension Correction Rules (Layer 3)
 * 
 * When AI estimates dimensions directly (similarity < threshold), 
 * these rules normalize predictions to realistic ranges based on category.
 * This prevents crazy values caused by camera angle or distortion.
 */

import type { FurnitureCategory } from "@shared/furniture-database";

export interface DimensionLimits {
  length: { min: number; max: number };
  width: { min: number; max: number };
  height: { min: number; max: number };
  weight: { min: number; max: number };
}

/**
 * Category-specific dimension limits (in cm and kg)
 * Based on typical furniture measurements from industry standards
 */
export const CATEGORY_DIMENSION_LIMITS: Record<FurnitureCategory, DimensionLimits> = {
  // Beds: length 72-85", width 36-78", height 10-60"
  Bed: {
    length: { min: 183, max: 216 },  // 72-85 inches
    width: { min: 91, max: 198 },    // 36-78 inches (twin to king)
    height: { min: 25, max: 152 },   // 10-60 inches (low to tall headboard)
    weight: { min: 20, max: 150 },   // kg
  },
  
  // Sofas: length 60-140", depth 30-45", height 28-40"
  Sofa: {
    length: { min: 152, max: 356 },  // 60-140 inches
    width: { min: 76, max: 250 },    // 30-100 inches (for L-shaped)
    height: { min: 71, max: 102 },   // 28-40 inches
    weight: { min: 25, max: 200 },   // kg
  },
  
  // Tables: various sizes
  Table: {
    length: { min: 40, max: 300 },   // Small side table to large dining
    width: { min: 30, max: 150 },
    height: { min: 35, max: 110 },   // Coffee table low to standing desk high
    weight: { min: 5, max: 100 },
  },
  
  // Chairs: updated for realistic accent/upholstered chair proportions
  // Accent chairs are typically 24-36" deep (61-91cm), 22-32" wide (56-81cm), 32-45" tall (81-114cm)
  Chair: {
    length: { min: 45, max: 95 },    // 18-37" - dining chair depth to large recliner
    width: { min: 45, max: 90 },     // 18-35" - dining chair to wide accent
    height: { min: 70, max: 140 },   // 28-55" - Standard to gaming/office high back
    weight: { min: 5, max: 40 },     // Upholstered chairs are heavier
  },
  
  // Dressers: typical bedroom furniture
  Dresser: {
    length: { min: 50, max: 180 },   // Nightstand to wide dresser
    width: { min: 35, max: 60 },
    height: { min: 50, max: 150 },   // Nightstand to tall chest
    weight: { min: 10, max: 100 },
  },
  
  // Appliances: fridges, washers, etc.
  Appliance: {
    length: { min: 40, max: 100 },   // Microwave to large fridge width
    width: { min: 30, max: 90 },
    height: { min: 25, max: 200 },   // Microwave to tall fridge
    weight: { min: 5, max: 150 },
  },
  
  // Electronics: TVs, monitors, computers
  Electronics: {
    length: { min: 30, max: 200 },   // Monitor to 85" TV
    width: { min: 5, max: 50 },      // TVs are thin
    height: { min: 20, max: 120 },
    weight: { min: 2, max: 50 },
  },
  
  // Storage: bookcases, wardrobes, cabinets
  Storage: {
    length: { min: 40, max: 200 },
    width: { min: 25, max: 70 },
    height: { min: 50, max: 220 },   // Short shelf to tall wardrobe
    weight: { min: 15, max: 120 },
  },
  
  // Outdoor: patio furniture, grills, etc.
  Outdoor: {
    length: { min: 50, max: 250 },
    width: { min: 40, max: 150 },
    height: { min: 40, max: 150 },
    weight: { min: 5, max: 80 },
  },
  
  // Other: miscellaneous items (reduced to reasonable fallback for unknown items)
  Other: {
    length: { min: 20, max: 80 },
    width: { min: 15, max: 50 },
    height: { min: 15, max: 60 },
    weight: { min: 0.5, max: 20 },
  },
  
  // Luggage: bags, suitcases, backpacks, etc.
  Luggage: {
    length: { min: 15, max: 85 },   // Small handbag to large suitcase
    width: { min: 10, max: 55 },    // Thin to deep
    height: { min: 15, max: 80 },   // Small bag to tall suitcase
    weight: { min: 0.5, max: 30 },  // Empty bag to fully packed suitcase
  },
};

/**
 * Subcategory-specific dimension overrides for more precise corrections
 */
const SUBCATEGORY_LIMITS: Record<string, Partial<DimensionLimits>> = {
  // Beds by size
  'twin': { 
    length: { min: 188, max: 195 }, 
    width: { min: 96, max: 102 } 
  },
  'full': { 
    length: { min: 188, max: 195 }, 
    width: { min: 134, max: 140 } 
  },
  'queen': { 
    length: { min: 200, max: 210 }, 
    width: { min: 150, max: 160 } 
  },
  'king': { 
    length: { min: 200, max: 210 }, 
    width: { min: 190, max: 205 } 
  },
  'bunk': { 
    height: { min: 150, max: 190 } 
  },
  
  // Sofas by type
  'loveseat': { 
    length: { min: 130, max: 170 } 
  },
  '3-seater': { 
    length: { min: 190, max: 240 } 
  },
  'sectional': { 
    length: { min: 250, max: 400 },
    width: { min: 150, max: 280 }
  },
  'sleeper': { 
    weight: { min: 80, max: 130 } 
  },
  
  // Refrigerators
  'refrigerator': { 
    height: { min: 150, max: 190 },
    width: { min: 60, max: 95 },
    length: { min: 65, max: 95 },
    weight: { min: 70, max: 160 }
  },
  
  // TVs by size
  'tv': {
    width: { min: 3, max: 15 },  // TVs are very thin
  },
  
  // Desks
  'desk': {
    height: { min: 70, max: 130 },  // Include standing desks
    length: { min: 100, max: 200 },
  },
  
  // Accent/Upholstered chairs (larger than dining chairs)
  'accent': {
    length: { min: 61, max: 91 },   // 24-36" depth
    width: { min: 56, max: 81 },    // 22-32" width
    height: { min: 81, max: 114 },  // 32-45" height
    weight: { min: 10, max: 25 },   // Upholstered = heavier
  },
  'upholstered': {
    length: { min: 61, max: 91 },
    width: { min: 56, max: 81 },
    height: { min: 81, max: 114 },
    weight: { min: 10, max: 25 },
  },
  'lounge': {
    length: { min: 70, max: 100 },
    width: { min: 60, max: 90 },
    height: { min: 75, max: 100 },
    weight: { min: 15, max: 30 },
  },
  'recliner': {
    length: { min: 80, max: 110 },
    width: { min: 70, max: 95 },
    height: { min: 85, max: 115 },
    weight: { min: 25, max: 50 },
  },
  'wingback': {
    length: { min: 70, max: 90 },
    width: { min: 65, max: 85 },
    height: { min: 100, max: 120 },  // Wingbacks are taller
    weight: { min: 12, max: 25 },
  },
  'armchair': {
    length: { min: 61, max: 91 },
    width: { min: 56, max: 81 },
    height: { min: 81, max: 114 },
    weight: { min: 10, max: 25 },
  },
  
  // Luggage subcategories
  'handbag': {
    length: { min: 20, max: 40 },
    width: { min: 8, max: 20 },
    height: { min: 15, max: 35 },
    weight: { min: 0.3, max: 2 },
  },
  'purse': {
    length: { min: 15, max: 35 },
    width: { min: 5, max: 15 },
    height: { min: 10, max: 25 },
    weight: { min: 0.2, max: 1.5 },
  },
  'backpack': {
    length: { min: 35, max: 55 },
    width: { min: 15, max: 35 },
    height: { min: 40, max: 60 },
    weight: { min: 0.5, max: 3 },
  },
  'duffel': {
    length: { min: 45, max: 75 },
    width: { min: 25, max: 40 },
    height: { min: 25, max: 40 },
    weight: { min: 1, max: 5 },
  },
  'carry-on': {
    length: { min: 50, max: 60 },
    width: { min: 30, max: 40 },
    height: { min: 20, max: 30 },
    weight: { min: 2, max: 5 },
  },
  'suitcase': {
    length: { min: 55, max: 80 },
    width: { min: 35, max: 55 },
    height: { min: 25, max: 40 },
    weight: { min: 3, max: 8 },
  },
  'tote': {
    length: { min: 30, max: 50 },
    width: { min: 10, max: 20 },
    height: { min: 25, max: 40 },
    weight: { min: 0.3, max: 2 },
  },
  'briefcase': {
    length: { min: 35, max: 50 },
    width: { min: 8, max: 15 },
    height: { min: 25, max: 35 },
    weight: { min: 1, max: 3 },
  },
};

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Get category from string (with normalization)
 */
function normalizeCategory(category: string): FurnitureCategory {
  const categoryLower = category.toLowerCase();
  
  if (categoryLower.includes('bed') || categoryLower.includes('mattress')) return 'Bed';
  if (categoryLower.includes('sofa') || categoryLower.includes('couch') || categoryLower.includes('chair') && categoryLower.includes('arm')) return 'Sofa';
  if (categoryLower.includes('table') || categoryLower.includes('desk')) return 'Table';
  if (categoryLower.includes('chair')) return 'Chair';
  if (categoryLower.includes('dresser') || categoryLower.includes('nightstand') || categoryLower.includes('drawer')) return 'Dresser';
  if (categoryLower.includes('appliance') || categoryLower.includes('fridge') || categoryLower.includes('washer') || categoryLower.includes('dryer') || categoryLower.includes('stove') || categoryLower.includes('dishwasher')) return 'Appliance';
  if (categoryLower.includes('electronic') || categoryLower.includes('tv') || categoryLower.includes('television') || categoryLower.includes('monitor') || categoryLower.includes('computer')) return 'Electronics';
  if (categoryLower.includes('storage') || categoryLower.includes('bookshelf') || categoryLower.includes('wardrobe') || categoryLower.includes('cabinet')) return 'Storage';
  if (categoryLower.includes('outdoor') || categoryLower.includes('patio') || categoryLower.includes('grill') || categoryLower.includes('garden')) return 'Outdoor';
  if (categoryLower.includes('luggage') || categoryLower.includes('bag') || categoryLower.includes('suitcase') || categoryLower.includes('backpack') || categoryLower.includes('duffel') || categoryLower.includes('carry-on') || categoryLower.includes('briefcase') || categoryLower.includes('purse') || categoryLower.includes('handbag') || categoryLower.includes('tote')) return 'Luggage';
  
  return 'Other';
}

/**
 * Extract subcategory hints from item name
 */
function extractSubcategoryHints(itemName: string): string[] {
  const nameLower = itemName.toLowerCase();
  const hints: string[] = [];
  
  // Check for specific subcategory keywords
  const subcategories = Object.keys(SUBCATEGORY_LIMITS);
  for (const sub of subcategories) {
    if (nameLower.includes(sub)) {
      hints.push(sub);
    }
  }
  
  // Additional pattern matching
  if (nameLower.includes('l-shaped') || nameLower.includes('l shaped')) hints.push('sectional');
  if (nameLower.includes('3-seat') || nameLower.includes('three-seat')) hints.push('3-seater');
  if (nameLower.includes('2-seat') || nameLower.includes('two-seat')) hints.push('loveseat');
  if (nameLower.includes('standing') && nameLower.includes('desk')) hints.push('desk');
  if (nameLower.includes('55"') || nameLower.includes('55 inch') || nameLower.includes('55-inch')) hints.push('tv');
  if (nameLower.includes('65"') || nameLower.includes('65 inch') || nameLower.includes('65-inch')) hints.push('tv');
  if (nameLower.includes('75"') || nameLower.includes('75 inch') || nameLower.includes('75-inch')) hints.push('tv');
  
  return hints;
}

export interface CorrectedDimensions {
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  wasCorrect: boolean;  // True if no corrections were needed
  corrections: string[];  // List of what was corrected
}

/**
 * Apply dimension correction rules to AI-estimated dimensions
 * This ensures dimensions fall within realistic ranges for the item category
 */
export function correctDimensions(
  category: string,
  itemName: string,
  estimatedLength: number,
  estimatedWidth: number,
  estimatedHeight: number,
  estimatedWeight: number
): CorrectedDimensions {
  const normalizedCategory = normalizeCategory(category);
  const baseLimits = CATEGORY_DIMENSION_LIMITS[normalizedCategory];
  const corrections: string[] = [];
  
  // Start with base category limits
  let limits = { ...baseLimits };
  
  // Apply subcategory overrides if applicable
  const subcategoryHints = extractSubcategoryHints(itemName);
  for (const hint of subcategoryHints) {
    const subLimits = SUBCATEGORY_LIMITS[hint];
    if (subLimits) {
      if (subLimits.length) limits.length = { ...limits.length, ...subLimits.length };
      if (subLimits.width) limits.width = { ...limits.width, ...subLimits.width };
      if (subLimits.height) limits.height = { ...limits.height, ...subLimits.height };
      if (subLimits.weight) limits.weight = { ...limits.weight, ...subLimits.weight };
    }
  }
  
  // Apply clamp corrections
  let correctedLength = estimatedLength;
  let correctedWidth = estimatedWidth;
  let correctedHeight = estimatedHeight;
  let correctedWeight = estimatedWeight;
  
  // Correct length
  if (estimatedLength < limits.length.min) {
    correctedLength = limits.length.min;
    corrections.push(`Length increased from ${estimatedLength}cm to ${correctedLength}cm (min for ${normalizedCategory})`);
  } else if (estimatedLength > limits.length.max) {
    correctedLength = limits.length.max;
    corrections.push(`Length reduced from ${estimatedLength}cm to ${correctedLength}cm (max for ${normalizedCategory})`);
  }
  
  // Correct width
  if (estimatedWidth < limits.width.min) {
    correctedWidth = limits.width.min;
    corrections.push(`Width increased from ${estimatedWidth}cm to ${correctedWidth}cm (min for ${normalizedCategory})`);
  } else if (estimatedWidth > limits.width.max) {
    correctedWidth = limits.width.max;
    corrections.push(`Width reduced from ${estimatedWidth}cm to ${correctedWidth}cm (max for ${normalizedCategory})`);
  }
  
  // Correct height
  if (estimatedHeight < limits.height.min) {
    correctedHeight = limits.height.min;
    corrections.push(`Height increased from ${estimatedHeight}cm to ${correctedHeight}cm (min for ${normalizedCategory})`);
  } else if (estimatedHeight > limits.height.max) {
    correctedHeight = limits.height.max;
    corrections.push(`Height reduced from ${estimatedHeight}cm to ${correctedHeight}cm (max for ${normalizedCategory})`);
  }
  
  // Correct weight
  if (estimatedWeight < limits.weight.min) {
    correctedWeight = limits.weight.min;
    corrections.push(`Weight increased from ${estimatedWeight}kg to ${correctedWeight}kg (min for ${normalizedCategory})`);
  } else if (estimatedWeight > limits.weight.max) {
    correctedWeight = limits.weight.max;
    corrections.push(`Weight reduced from ${estimatedWeight}kg to ${correctedWeight}kg (max for ${normalizedCategory})`);
  }
  
  // Additional sanity checks
  // Ensure length >= width (swap if needed for consistency)
  if (correctedWidth > correctedLength) {
    const temp = correctedLength;
    correctedLength = correctedWidth;
    correctedWidth = temp;
    corrections.push('Swapped length and width for consistency');
  }
  
  return {
    length_cm: Math.round(correctedLength),
    width_cm: Math.round(correctedWidth),
    height_cm: Math.round(correctedHeight),
    weight_kg: Math.round(correctedWeight * 10) / 10,  // Round to 1 decimal
    wasCorrect: corrections.length === 0,
    corrections,
  };
}

/**
 * Validate if dimensions are within acceptable ranges
 * Returns true if all dimensions are valid
 */
export function validateDimensions(
  category: string,
  length: number,
  width: number,
  height: number,
  weight: number
): { isValid: boolean; issues: string[] } {
  const normalizedCategory = normalizeCategory(category);
  const limits = CATEGORY_DIMENSION_LIMITS[normalizedCategory];
  const issues: string[] = [];
  
  if (length < limits.length.min || length > limits.length.max) {
    issues.push(`Length ${length}cm outside range ${limits.length.min}-${limits.length.max}cm`);
  }
  if (width < limits.width.min || width > limits.width.max) {
    issues.push(`Width ${width}cm outside range ${limits.width.min}-${limits.width.max}cm`);
  }
  if (height < limits.height.min || height > limits.height.max) {
    issues.push(`Height ${height}cm outside range ${limits.height.min}-${limits.height.max}cm`);
  }
  if (weight < limits.weight.min || weight > limits.weight.max) {
    issues.push(`Weight ${weight}kg outside range ${limits.weight.min}-${limits.weight.max}kg`);
  }
  
  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Get typical/average dimensions for a category
 * Used as fallback when no better data is available
 */
export function getTypicalDimensions(category: string): {
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
} {
  const normalizedCategory = normalizeCategory(category);
  const limits = CATEGORY_DIMENSION_LIMITS[normalizedCategory];
  
  // Return midpoint of ranges as "typical"
  return {
    length_cm: Math.round((limits.length.min + limits.length.max) / 2),
    width_cm: Math.round((limits.width.min + limits.width.max) / 2),
    height_cm: Math.round((limits.height.min + limits.height.max) / 2),
    weight_kg: Math.round((limits.weight.min + limits.weight.max) / 2),
  };
}
