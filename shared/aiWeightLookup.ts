import { DetectedItem } from "./ai";
import { findStandardItem, getSuggestions, StandardItem, SizeClassification } from "./itemWeightDatabase";

/**
 * Interface for AI detection result before database lookup
 */
export interface AIDetectionResult {
  itemType: string; // Detected item name (e.g., "Queen bed", "Sofa")
  sizeClassification: SizeClassification; // AI-detected size
  category: DetectedItem["category"];
  confidence: number;
  imageUrl?: string;
}

/**
 * Convert AI detection result to DetectedItem using Standard Weight Database
 */
export function aiDetectionToItem(
  detection: AIDetectionResult,
  generateId: () => string
): DetectedItem {
  const { itemType, sizeClassification, category, confidence, imageUrl } = detection;
  
  // Attempt to find matching standard item
  const matchedItem = findStandardItem(itemType, sizeClassification);
  
  // If AI confidence is low (<70%) or no exact match, get suggestions
  const isUncertain = confidence < 70 || !matchedItem;
  const suggestions = isUncertain ? getSuggestions(itemType, category, 3) : [];
  
  // Use matched item or fallback to generic values
  const standardItem = matchedItem || createFallbackItem(itemType, sizeClassification, category);
  
  return {
    id: generateId(),
    name: matchedItem ? matchedItem.name : itemType,
    category: category,
    quantity: 1,
    estimatedWeightLbs: standardItem.weightLbs,
    estimatedCubicFeet: standardItem.cubicFeet,
    loadSize: mapSizeToLoadSize(standardItem.size),
    requiresSpecialCare: standardItem.requiresSpecialCare,
    imageUrl: imageUrl,
    confidence: confidence,
    sizeClassification: sizeClassification,
    alternativeSuggestions: suggestions.map(s => ({
      name: s.name,
      category: s.category,
      size: s.size,
      weightLbs: s.weightLbs,
      cubicFeet: s.cubicFeet,
      moversNeeded: s.moversNeeded,
      difficultyLevel: s.difficultyLevel,
      requiresSpecialCare: s.requiresSpecialCare,
      confidence: 90, // High confidence for database-matched suggestions
      matchReason: `Suggested ${s.category} item`
    })),
    isUncertain: isUncertain,
    databaseMatchedItem: matchedItem ? matchedItem.name : null
  };
}

/**
 * Map XL size classification to loadSize (small/medium/large)
 */
function mapSizeToLoadSize(size: SizeClassification): "small" | "medium" | "large" {
  if (size === "small") return "small";
  if (size === "medium") return "medium";
  return "large"; // Both "large" and "XL" map to "large"
}

/**
 * Create fallback item when no database match is found
 */
function createFallbackItem(
  itemName: string,
  size: SizeClassification,
  category: DetectedItem["category"]
): StandardItem {
  // Conservative fallback estimates based on size
  const fallbackWeights: Record<SizeClassification, number> = {
    small: 15,
    medium: 50,
    large: 120,
    XL: 200
  };
  
  const fallbackVolumes: Record<SizeClassification, number> = {
    small: 5,
    medium: 20,
    large: 50,
    XL: 80
  };
  
  return {
    name: itemName,
    category: category,
    size: size,
    weightLbs: fallbackWeights[size],
    cubicFeet: fallbackVolumes[size],
    moversNeeded: size === "XL" || size === "large" ? 2 : 1,
    difficultyLevel: size === "XL" ? "difficult" : size === "large" ? "moderate" : "easy",
    requiresSpecialCare: category === "heavy_item" || category === "fragile" || category === "appliance",
    keywords: [itemName.toLowerCase()]
  };
}

/**
 * Update DetectedItem with user's confirmed selection from suggestions
 */
export function updateItemWithSelection(
  item: DetectedItem,
  selectedSuggestion: StandardItem
): DetectedItem {
  return {
    ...item,
    name: selectedSuggestion.name,
    category: selectedSuggestion.category,
    estimatedWeightLbs: selectedSuggestion.weightLbs,
    estimatedCubicFeet: selectedSuggestion.cubicFeet,
    loadSize: mapSizeToLoadSize(selectedSuggestion.size),
    requiresSpecialCare: selectedSuggestion.requiresSpecialCare,
    sizeClassification: selectedSuggestion.size,
    isUncertain: false, // User confirmed
    databaseMatchedItem: selectedSuggestion.name,
    confidence: 100, // User-confirmed items have 100% confidence
    alternativeSuggestions: [] // Clear suggestions after confirmation
  };
}
