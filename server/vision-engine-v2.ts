/**
 * LervIT Vision Engine 2.0 - Complete AI Identification Pipeline
 * 
 * A 3-layer system for stable, consistent, and accurate furniture identification:
 * 
 * LAYER 1: Ground-Truth Furniture Database
 *   - 50+ common furniture items with verified specifications
 *   - Exact dimensions, weight, load_size, and vehicle recommendations
 * 
 * LAYER 2: Embedding Similarity Matching (Stabilization Layer)
 *   - Matches uploaded photos against database using text-based similarity
 *   - If similarity > threshold, uses database values (no estimation)
 *   - Ensures consistent results for the same item type
 * 
 * LAYER 3: Dimension Correction Rules
 *   - When estimation is needed (similarity < threshold)
 *   - Applies category-specific clamp rules to normalize predictions
 *   - Prevents unrealistic values from camera angle distortion
 * 
 * PIPELINE FLOW:
 * 1. Upload image → 2. Category detection (GPT-4o Vision)
 * 3. Database matching → 4. If match: use ground-truth
 * 5. If no match: estimate with Vision AI → 6. Apply dimension corrections
 * 7. Calculate volume → 8. Classify load size → 9. Recommend vehicle
 * 10. Return structured result with confidence and source metadata
 */

import OpenAI from "openai";
import * as path from "path";
import sharp from "sharp";
import { 
  FURNITURE_DATABASE, 
  findBestMatch, 
  getLoadSizeFromVolume,
  getVehicleRecommendation,
  getVehicleRecommendationWithCategory,
  getVehicleFromVolume,
  type FurnitureItem,
  type LoadSizeCategory,
  type VehicleType
} from "@shared/furniture-database";
import { 
  correctDimensions, 
  validateDimensions,
  getTypicalDimensions 
} from "./dimension-corrector";
import { ObjectStorageService } from "./objectStorage";
import { logEvent } from "./logger";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const SIMILARITY_THRESHOLD = 0.70;  // Match threshold for using database values
const HIGH_CONFIDENCE_THRESHOLD = 0.85;  // When to fully trust database match

export interface VisionEngineResult {
  itemName: string;
  category: string;
  subcategory: string;
  quantity: number;  // Number of identical items (e.g., 2 for "pair of chairs")
  dimensions: {
    length_cm: number;  // Per-item dimensions
    width_cm: number;
    height_cm: number;
  };
  perItemVolumeFt3: number;  // Volume for a single item
  perItemWeightKg: number;   // Weight for a single item
  volume_ft3: number;        // TOTAL volume (perItemVolumeFt3 * quantity)
  weight_kg: number;         // TOTAL weight (perItemWeightKg * quantity)
  load_size: LoadSizeCategory;  // Based on TOTAL volume
  vehicle: VehicleType;         // Based on TOTAL volume/weight
  movers_required: 1 | 2;
  handling_complexity: 'low' | 'medium' | 'high' | 'very_high';
  insurance_level: 'standard' | 'medium' | 'high' | 'premium';
  confidence: number;
  source: 'database_match' | 'vision_estimate' | 'fallback';
  matchedItem?: string;  // Database item ID if matched
  corrections?: string[];  // Any corrections applied
  processingTime: number;
}

/**
 * Download image from Object Storage and convert to base64 data URL
 * Automatically converts HEIC/HEIF (iPhone format) to JPEG for OpenAI compatibility
 */
async function imageToBase64(imagePath: string): Promise<string> {
  console.log('[Vision Engine 2.0] Converting image to base64:', imagePath);
  
  if (imagePath.startsWith('/objects/')) {
    const objectStorageService = new ObjectStorageService();
    const objectFile = await objectStorageService.getObjectEntityFile(imagePath);
    const [buffer] = await objectFile.download();
    
    const ext = path.extname(imagePath).toLowerCase();
    
    // Check if HEIC/HEIF format (iPhone) - needs conversion
    if (ext === '.heic' || ext === '.heif') {
      console.log('[Vision Engine 2.0] Converting HEIC/HEIF to JPEG for OpenAI compatibility');
      try {
        const jpegBuffer = await sharp(buffer)
          .jpeg({ quality: 90 })
          .toBuffer();
        const base64 = jpegBuffer.toString('base64');
        return `data:image/jpeg;base64,${base64}`;
      } catch (conversionError) {
        console.error('[Vision Engine 2.0] HEIC conversion failed:', conversionError);
        throw new Error('Failed to convert HEIC image. Please upload a JPEG, PNG, or WebP image.');
      }
    }
    
    const base64 = buffer.toString('base64');
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';
    
    return `data:${mimeType};base64,${base64}`;
  }
  
  // For URLs, return as-is
  return imagePath;
}

/**
 * Calculate volume in cubic feet from dimensions in cm
 */
function calculateVolumeFt3(lengthCm: number, widthCm: number, heightCm: number): number {
  const volumeCm3 = lengthCm * widthCm * heightCm;
  const volumeFt3 = volumeCm3 / 28316.8;
  return Math.round(volumeFt3 * 100) / 100;
}

/**
 * MINIMUM VOLUME ENFORCEMENT
 * Prevents unrealistically small volumes for specific categories
 * E.g., Accent chairs should never be 4.2 ft³ - they're typically 15-16 ft³
 */
const CATEGORY_MIN_VOLUMES: Record<string, number> = {
  'Chair': 7,        // Absolute minimum for any chair (dining chairs)
  'Sofa': 25,        // Minimum for loveseats
  'Bed': 20,         // Minimum for twin bed frames
  'Dresser': 10,     // Minimum for nightstands
  'Appliance': 5,    // Minimum for small appliances
  'Storage': 10,     // Minimum for small shelves
};

/**
 * Subcategory-specific minimum volumes (override category minimum)
 */
const SUBCATEGORY_MIN_VOLUMES: Record<string, number> = {
  'accent': 12,       // Upholstered accent chairs ~15-16 ft³
  'upholstered': 12,
  'lounge': 14,
  'recliner': 18,
  'wingback': 14,
  'armchair': 12,
  'office': 14,       // Office chairs with arms ~16+ ft³
  'gaming': 16,       // Gaming chairs are larger
  'sectional': 100,   // Sectional sofas are huge
  'sleeper': 60,      // Sleeper sofas with mechanisms
};

/**
 * Enforce minimum realistic volume for a category/subcategory
 * Returns corrected volume and whether correction was applied
 */
function enforceMinimumVolume(
  category: string,
  itemName: string,
  calculatedVolume: number
): { volume: number; wasEnforced: boolean; minApplied?: number } {
  const categoryLower = category.toLowerCase();
  const nameLower = itemName.toLowerCase();
  
  // First, check subcategory-specific minimums
  for (const [subcat, minVol] of Object.entries(SUBCATEGORY_MIN_VOLUMES)) {
    if (nameLower.includes(subcat) && calculatedVolume < minVol) {
      console.log(`[Vision Engine 2.0] Volume enforcement: ${calculatedVolume}ft³ → ${minVol}ft³ (min for ${subcat})`);
      return { volume: minVol, wasEnforced: true, minApplied: minVol };
    }
  }
  
  // Fall back to category minimum
  const categoryMin = CATEGORY_MIN_VOLUMES[category] || 0;
  if (calculatedVolume < categoryMin) {
    console.log(`[Vision Engine 2.0] Volume enforcement: ${calculatedVolume}ft³ → ${categoryMin}ft³ (min for ${category})`);
    return { volume: categoryMin, wasEnforced: true, minApplied: categoryMin };
  }
  
  return { volume: calculatedVolume, wasEnforced: false };
}

/**
 * CATEGORY CORRECTION
 * Fixes AI misclassifications by detecting furniture keywords in item names
 * E.g., "pair of accent chairs" should be Chair category, not Appliance
 */
function correctCategory(itemName: string, detectedCategory: string): { 
  category: string; 
  wasCorrected: boolean;
  originalCategory?: string;
} {
  const nameLower = itemName.toLowerCase();
  
  // Check if item name contains chair keywords but was misclassified
  const chairKeywords = ['chair', 'armchair', 'recliner', 'seat', 'stool'];
  const sofaKeywords = ['sofa', 'couch', 'loveseat', 'sectional', 'futon'];
  const bedKeywords = ['bed', 'mattress', 'bunk', 'crib'];
  const tableKeywords = ['table', 'desk', 'stand', 'nightstand'];
  const dresserKeywords = ['dresser', 'chest', 'drawer', 'wardrobe', 'cabinet'];
  
  if (chairKeywords.some(kw => nameLower.includes(kw)) && detectedCategory !== 'Chair') {
    console.log(`[Vision Engine 2.0] Category correction: ${detectedCategory} → Chair (detected "${itemName}")`);
    return { category: 'Chair', wasCorrected: true, originalCategory: detectedCategory };
  }
  
  if (sofaKeywords.some(kw => nameLower.includes(kw)) && detectedCategory !== 'Sofa') {
    console.log(`[Vision Engine 2.0] Category correction: ${detectedCategory} → Sofa (detected "${itemName}")`);
    return { category: 'Sofa', wasCorrected: true, originalCategory: detectedCategory };
  }
  
  if (bedKeywords.some(kw => nameLower.includes(kw)) && detectedCategory !== 'Bed') {
    console.log(`[Vision Engine 2.0] Category correction: ${detectedCategory} → Bed (detected "${itemName}")`);
    return { category: 'Bed', wasCorrected: true, originalCategory: detectedCategory };
  }
  
  if (tableKeywords.some(kw => nameLower.includes(kw)) && detectedCategory !== 'Table') {
    // Don't correct if it's actually a nightstand (which is a Dresser)
    if (!nameLower.includes('nightstand')) {
      console.log(`[Vision Engine 2.0] Category correction: ${detectedCategory} → Table (detected "${itemName}")`);
      return { category: 'Table', wasCorrected: true, originalCategory: detectedCategory };
    }
  }
  
  if (dresserKeywords.some(kw => nameLower.includes(kw)) && detectedCategory !== 'Dresser') {
    console.log(`[Vision Engine 2.0] Category correction: ${detectedCategory} → Dresser (detected "${itemName}")`);
    return { category: 'Dresser', wasCorrected: true, originalCategory: detectedCategory };
  }
  
  // Luggage keywords - bags, suitcases, backpacks, etc.
  const luggageKeywords = ['bag', 'suitcase', 'backpack', 'duffel', 'luggage', 'carry-on', 'briefcase', 'purse', 'handbag', 'tote', 'messenger', 'gym bag', 'travel bag', 'duffle'];
  if (luggageKeywords.some(kw => nameLower.includes(kw)) && detectedCategory !== 'Luggage') {
    console.log(`[Vision Engine 2.0] Category correction: ${detectedCategory} → Luggage (detected "${itemName}")`);
    return { category: 'Luggage', wasCorrected: true, originalCategory: detectedCategory };
  }
  
  return { category: detectedCategory, wasCorrected: false };
}

/**
 * QUANTITY DETECTION
 * Detects when multiple identical items are described (e.g., "pair of chairs", "2 tables")
 * Returns the quantity and a normalized single-item name for database matching
 */
function detectQuantity(itemName: string): { quantity: number; singleItemName: string } {
  const nameLower = itemName.toLowerCase();
  
  // Pattern: "pair of X" or "pair X"
  if (nameLower.includes('pair of') || nameLower.startsWith('pair ')) {
    const singleName = itemName
      .replace(/pair of /i, '')
      .replace(/^pair /i, '')
      .replace(/chairs/i, 'chair')
      .replace(/tables/i, 'table')
      .replace(/lamps/i, 'lamp')
      .replace(/nightstands/i, 'nightstand')
      .replace(/dressers/i, 'dresser');
    console.log(`[Vision Engine 2.0] Quantity detected: 2 (pair) - "${itemName}" → "${singleName}"`);
    return { quantity: 2, singleItemName: singleName };
  }
  
  // Pattern: "two X", "2 X", "two of X"
  const twoPattern = /^(two|2)\s+(of\s+)?(.+)/i;
  const twoMatch = nameLower.match(twoPattern);
  if (twoMatch) {
    const singleName = twoMatch[3]
      .replace(/chairs/i, 'chair')
      .replace(/tables/i, 'table')
      .replace(/lamps/i, 'lamp');
    console.log(`[Vision Engine 2.0] Quantity detected: 2 - "${itemName}" → "${singleName}"`);
    return { quantity: 2, singleItemName: singleName };
  }
  
  // Pattern: "three X", "3 X"
  const threePattern = /^(three|3)\s+(of\s+)?(.+)/i;
  const threeMatch = nameLower.match(threePattern);
  if (threeMatch) {
    const singleName = threeMatch[3]
      .replace(/chairs/i, 'chair')
      .replace(/tables/i, 'table');
    console.log(`[Vision Engine 2.0] Quantity detected: 3 - "${itemName}" → "${singleName}"`);
    return { quantity: 3, singleItemName: singleName };
  }
  
  // Pattern: "four X", "4 X"
  const fourPattern = /^(four|4)\s+(of\s+)?(.+)/i;
  const fourMatch = nameLower.match(fourPattern);
  if (fourMatch) {
    const singleName = fourMatch[3]
      .replace(/chairs/i, 'chair')
      .replace(/tables/i, 'table');
    console.log(`[Vision Engine 2.0] Quantity detected: 4 - "${itemName}" → "${singleName}"`);
    return { quantity: 4, singleItemName: singleName };
  }
  
  // Pattern: "set of X chairs/tables" (common for dining sets)
  const setPattern = /set of (\d+|two|three|four|five|six)\s+(.+)/i;
  const setMatch = nameLower.match(setPattern);
  if (setMatch) {
    const numWords: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6 };
    const count = numWords[setMatch[1].toLowerCase()] || parseInt(setMatch[1]) || 1;
    const singleName = setMatch[2]
      .replace(/chairs/i, 'chair')
      .replace(/tables/i, 'table');
    console.log(`[Vision Engine 2.0] Quantity detected: ${count} (set) - "${itemName}" → "${singleName}"`);
    return { quantity: count, singleItemName: singleName };
  }
  
  // Pattern: Plural form at end suggesting multiple (e.g., "upholstered accent chairs")
  // Only apply if no explicit quantity, but name ends in plural furniture
  const pluralEndings = [
    { plural: /accent chairs$/i, singular: 'accent chair', qty: 2 },
    { plural: /dining chairs$/i, singular: 'dining chair', qty: 2 },
    { plural: /office chairs$/i, singular: 'office chair', qty: 2 },
    { plural: /bar stools$/i, singular: 'bar stool', qty: 2 },
  ];
  
  for (const { plural, singular, qty } of pluralEndings) {
    if (plural.test(nameLower)) {
      const singleName = itemName.replace(plural, singular);
      console.log(`[Vision Engine 2.0] Quantity detected: ${qty} (plural) - "${itemName}" → "${singleName}"`);
      return { quantity: qty, singleItemName: singleName };
    }
  }
  
  // Default: single item
  return { quantity: 1, singleItemName: itemName };
}

interface VisionDetectionResult {
  itemName: string;
  category: string;
  subcategory: string;
  confidence: number;
  estimatedDimensions?: {
    length_cm: number;
    width_cm: number;
    height_cm: number;
  };
  estimatedWeight?: number;
}

/**
 * STEP 1-2: Use GPT-4o Vision to detect and categorize item
 */
async function detectItemWithVision(imageBase64: string): Promise<VisionDetectionResult> {
  if (!openai) {
    console.warn('[Vision Engine 2.0] OpenAI not available, using fallback detection');
    return {
      itemName: 'Unidentified Item',
      category: 'Other',
      subcategory: 'Unknown',
      confidence: 0,
    };
  }
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are the LervIT Vision Engine 2.0, an expert at identifying furniture and household items for a moving company.

Analyze this image and identify the item with maximum detail.

IDENTIFY:
1. Item type (be specific: "L-shaped sectional sofa", "Queen platform bed", "6-drawer dresser", "Travel backpack", "Large suitcase")
2. Category: Bed, Sofa, Table, Chair, Dresser, Appliance, Electronics, Storage, Outdoor, Luggage, Other
3. Subcategory (e.g., Twin, Queen, King for beds; Loveseat, 3-Seater, Sectional for sofas; Backpack, Suitcase, Duffel, Handbag for luggage)
4. Size indicators (Queen, King, 3-seater, L-shaped, etc.)
5. Material if visible (leather, fabric, wood, metal, glass)

PROVIDE ACCURATE DIMENSION ESTIMATES based on item type:
- Use standard furniture dimensions for the identified type
- Be consistent: same item type = same dimensions

REFERENCE DIMENSIONS (use these):
• Twin bed frame: ~191×99×40cm, 35kg
• Queen bed frame: ~203×152×40cm, 55kg
• King bed frame: ~203×193×40cm, 70kg
• 2-seater loveseat: ~150×85×85cm, 45kg
• 3-seater sofa: ~210×90×85cm, 70kg
• L-shaped sectional: ~300×180×85cm, 120kg
• U-shaped sectional: ~350×250×85cm, 180kg
• 4-person dining table: ~120×75×75cm, 35kg
• 6-person dining table: ~180×90×75cm, 50kg
• Coffee table: ~120×60×45cm, 25kg
• Office desk: ~150×75×75cm, 40kg
• 6-drawer dresser: ~150×50×85cm, 70kg
• Standard refrigerator: ~75×70×170cm, 90kg
• French door fridge: ~90×80×180cm, 130kg
• 55" TV: ~125×8×72cm, 18kg
• 65" TV: ~145×10×85cm, 25kg
• Washing machine: ~60×65×85cm, 75kg
• Small handbag/purse: ~30×15×20cm, 0.5kg
• Backpack: ~45×30×20cm, 1kg
• Duffel bag: ~60×35×30cm, 1.5kg
• Carry-on suitcase: ~55×35×25cm, 3kg
• Medium suitcase: ~65×45×30cm, 4kg
• Large suitcase: ~75×50×35cm, 5kg
• Travel bag: ~50×30×25cm, 1kg

Return ONLY valid JSON (no markdown):
{
  "itemName": "detailed descriptive name",
  "category": "category from list above",
  "subcategory": "specific subcategory",
  "confidence": 0.0-1.0,
  "estimatedDimensions": { "length_cm": number, "width_cm": number, "height_cm": number },
  "estimatedWeight": number in kg
}`
          },
          {
            type: "image_url",
            image_url: { url: imageBase64 },
          },
        ],
      },
    ],
    max_tokens: 500,
  });
  
  let content = response.choices[0]?.message?.content || "{}";
  content = content.trim();
  if (content.startsWith('```')) {
    content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  
  const result = JSON.parse(content);
  
  console.log('[Vision Engine 2.0] Vision detected:', result.itemName, 
    `(${result.category}/${result.subcategory})`,
    `confidence: ${result.confidence}`);
  
  return {
    itemName: result.itemName || 'Unknown Item',
    category: result.category || 'Other',
    subcategory: result.subcategory || 'Unknown',
    confidence: result.confidence || 0.5,
    estimatedDimensions: result.estimatedDimensions,
    estimatedWeight: result.estimatedWeight,
  };
}

/**
 * STEP 3-4: Attempt to match with furniture database
 */
function matchWithDatabase(visionResult: VisionDetectionResult): {
  matched: boolean;
  item?: FurnitureItem;
  similarity: number;
} {
  // Use the item name to find best match
  const match = findBestMatch(visionResult.itemName);
  
  if (match && match.similarity >= SIMILARITY_THRESHOLD) {
    console.log('[Vision Engine 2.0] Database match found:', 
      match.item.name, 
      `(similarity: ${(match.similarity * 100).toFixed(1)}%)`);
    return {
      matched: true,
      item: match.item,
      similarity: match.similarity,
    };
  }
  
  // Try matching with subcategory + category
  const searchTerms = [
    visionResult.subcategory,
    visionResult.category,
    ...visionResult.itemName.split(' ').filter(w => w.length > 3)
  ];
  
  for (const item of FURNITURE_DATABASE) {
    const itemLower = item.name.toLowerCase();
    const matchedTerms = searchTerms.filter(term => 
      itemLower.includes(term.toLowerCase())
    );
    
    if (matchedTerms.length >= 2) {
      const similarity = matchedTerms.length / searchTerms.length;
      if (similarity >= SIMILARITY_THRESHOLD) {
        console.log('[Vision Engine 2.0] Secondary match found:', 
          item.name, 
          `(similarity: ${(similarity * 100).toFixed(1)}%)`);
        return {
          matched: true,
          item: item,
          similarity,
        };
      }
    }
  }
  
  console.log('[Vision Engine 2.0] No database match found (best similarity:', 
    match ? (match.similarity * 100).toFixed(1) + '%' : 'N/A', ')');
  
  return {
    matched: false,
    similarity: match?.similarity || 0,
  };
}

/**
 * MAIN PIPELINE: Vision Engine 2.0 Item Identification
 * 
 * Processes an uploaded photo through the 3-layer system:
 * 1. Vision detection
 * 2. Database matching
 * 3. Dimension correction (if estimation needed)
 */
export async function identifyItemV2(photoUrl: string): Promise<VisionEngineResult> {
  const startTime = Date.now();
  
  try {
    // STEP 1: Convert image to base64
    const imageBase64 = await imageToBase64(photoUrl);
    
    // STEP 2: Detect item using Vision API
    const visionResult = await detectItemWithVision(imageBase64);
    
    // STEP 2.5: Apply category correction (fix AI misclassifications)
    const categoryCorrection = correctCategory(visionResult.itemName, visionResult.category);
    if (categoryCorrection.wasCorrected) {
      visionResult.category = categoryCorrection.category;
    }
    
    // STEP 2.6: Detect quantity (e.g., "pair of chairs" = 2)
    const quantityInfo = detectQuantity(visionResult.itemName);
    const quantity = quantityInfo.quantity;
    
    // Use single-item name for database matching if quantity > 1
    const matchName = quantity > 1 ? quantityInfo.singleItemName : visionResult.itemName;
    const modifiedVisionResult = { ...visionResult, itemName: matchName };
    
    // STEP 3: Attempt database match (using single-item name)
    const dbMatch = matchWithDatabase(modifiedVisionResult);
    
    let result: VisionEngineResult;
    
    if (dbMatch.matched && dbMatch.item) {
      // LAYER 1 PATH: Use ground-truth database values
      const item = dbMatch.item;
      const confidence = Math.min(
        visionResult.confidence * dbMatch.similarity * 1.2,  // Boost for DB match
        0.99
      );
      
      // Calculate per-item and total values
      const perItemVolume = item.volume_ft3;
      const perItemWeight = item.weight_kg;
      const totalVolume = Math.round(perItemVolume * quantity * 100) / 100;
      const totalWeight = Math.round(perItemWeight * quantity * 10) / 10;
      
      // Use TOTAL volume for load size and vehicle with CATEGORY OVERRIDE
      const loadSize = getLoadSizeFromVolume(totalVolume);
      const vehicle = getVehicleRecommendationWithCategory(totalVolume, item.category, totalWeight);
      
      // Adjust movers based on total weight
      let movers: 1 | 2 = item.movers_required;
      if (totalWeight > 50) movers = 2;
      
      result = {
        itemName: visionResult.itemName,  // Keep original name with quantity
        category: item.category,
        subcategory: item.subcategory,
        quantity,
        dimensions: {
          length_cm: item.dimensions_cm.length,  // Per-item dimensions
          width_cm: item.dimensions_cm.width,
          height_cm: item.dimensions_cm.height,
        },
        perItemVolumeFt3: perItemVolume,
        perItemWeightKg: perItemWeight,
        volume_ft3: totalVolume,  // TOTAL volume
        weight_kg: totalWeight,   // TOTAL weight
        load_size: loadSize,      // Based on TOTAL
        vehicle: vehicle,         // Based on TOTAL
        movers_required: movers,
        handling_complexity: item.handling_complexity,
        insurance_level: item.insurance_level,
        confidence,
        source: 'database_match',
        matchedItem: item.item_id,
        processingTime: Date.now() - startTime,
      };
      
      logEvent.vision('database_match', {
        itemName: result.itemName,
        matchedItem: item.item_id,
        quantity,
        perItemWeightKg: perItemWeight,
        totalWeightKg: totalWeight,
        perItemVolumeFt3: perItemVolume,
        totalVolumeFt3: totalVolume,
        loadSize: result.load_size,
        vehicle: result.vehicle,
        confidence: confidence,
        processingTimeMs: result.processingTime,
      });
    } else {
      // LAYER 2-3 PATH: Use Vision estimates with dimension corrections
      const estimated = visionResult.estimatedDimensions || getTypicalDimensions(visionResult.category);
      const estimatedWeight = visionResult.estimatedWeight || 20;
      
      // Apply dimension corrections
      const corrected = correctDimensions(
        visionResult.category,
        visionResult.itemName,
        estimated.length_cm || 100,
        estimated.width_cm || 50,
        estimated.height_cm || 50,
        estimatedWeight
      );
      
      // Calculate volume
      let volume = calculateVolumeFt3(
        corrected.length_cm,
        corrected.width_cm,
        corrected.height_cm
      );
      
      // Apply minimum volume enforcement to prevent unrealistic small values
      const volumeEnforcement = enforceMinimumVolume(
        visionResult.category,
        visionResult.itemName,
        volume
      );
      if (volumeEnforcement.wasEnforced) {
        volume = volumeEnforcement.volume;
        corrected.corrections.push(`Volume increased to ${volume}ft³ (minimum for category)`);
      }
      
      // Determine load size and vehicle (used for per-item, will be recalculated with total)
      const loadSize = getLoadSizeFromVolume(volume);
      // Note: vehicle calculated per-item here, will be recalculated with totalVolume below
      
      // Determine handling complexity
      let handling: 'low' | 'medium' | 'high' | 'very_high' = 'low';
      let movers: 1 | 2 = 1;
      let insurance: 'standard' | 'medium' | 'high' | 'premium' = 'standard';
      
      if (corrected.weight_kg > 100 || volume > 150) {
        handling = 'very_high';
        movers = 2;
        insurance = 'premium';
      } else if (corrected.weight_kg > 50 || volume > 50) {
        handling = 'high';
        movers = 2;
        insurance = 'high';
      } else if (corrected.weight_kg > 25 || volume > 10) {
        handling = 'medium';
        movers = corrected.weight_kg > 35 ? 2 : 1;
        insurance = 'medium';
      }
      
      // Fragile/electronics get higher insurance
      if (visionResult.category === 'Electronics' || visionResult.category === 'Fragile') {
        insurance = insurance === 'standard' ? 'medium' : insurance;
      }
      
      // Calculate per-item and total values with quantity
      const perItemVolume = volume;
      const perItemWeight = corrected.weight_kg;
      const totalVolume = Math.round(perItemVolume * quantity * 100) / 100;
      const totalWeight = Math.round(perItemWeight * quantity * 10) / 10;
      
      // Re-calculate load size and vehicle based on TOTAL volume/weight with CATEGORY OVERRIDE
      const finalLoadSize = getLoadSizeFromVolume(totalVolume);
      const finalVehicle = getVehicleRecommendationWithCategory(totalVolume, visionResult.category, totalWeight);
      
      // Adjust movers based on total weight
      if (totalWeight > 50) movers = 2;
      
      result = {
        itemName: visionResult.itemName,
        category: visionResult.category,
        subcategory: visionResult.subcategory,
        quantity,
        dimensions: {
          length_cm: corrected.length_cm,  // Per-item dimensions
          width_cm: corrected.width_cm,
          height_cm: corrected.height_cm,
        },
        perItemVolumeFt3: perItemVolume,
        perItemWeightKg: perItemWeight,
        volume_ft3: totalVolume,   // TOTAL volume
        weight_kg: totalWeight,    // TOTAL weight
        load_size: finalLoadSize,  // Based on TOTAL
        vehicle: finalVehicle,     // Based on TOTAL
        movers_required: movers,
        handling_complexity: handling,
        insurance_level: insurance,
        confidence: visionResult.confidence * (corrected.wasCorrect ? 1 : 0.9),
        source: 'vision_estimate',
        corrections: corrected.corrections.length > 0 ? corrected.corrections : undefined,
        processingTime: Date.now() - startTime,
      };
      
      logEvent.vision('estimate_with_corrections', {
        itemName: result.itemName,
        quantity,
        perItemWeightKg: perItemWeight,
        totalWeightKg: totalWeight,
        perItemVolumeFt3: perItemVolume,
        totalVolumeFt3: totalVolume,
        loadSize: result.load_size,
        vehicle: result.vehicle,
        confidence: result.confidence,
        correctionsApplied: corrected.corrections.length,
        processingTimeMs: result.processingTime,
      });
    }
    
    return result;
    
  } catch (error: any) {
    logEvent.error('vision_engine', error, { photoUrl });
    
    // Return fallback result
    const fallbackDims = getTypicalDimensions('Other');
    const fallbackVolume = calculateVolumeFt3(fallbackDims.length_cm, fallbackDims.width_cm, fallbackDims.height_cm);
    return {
      itemName: 'Unidentified Item',
      category: 'Other',
      subcategory: 'Unknown',
      quantity: 1,
      dimensions: {
        length_cm: fallbackDims.length_cm,
        width_cm: fallbackDims.width_cm,
        height_cm: fallbackDims.height_cm,
      },
      perItemVolumeFt3: fallbackVolume,
      perItemWeightKg: fallbackDims.weight_kg,
      volume_ft3: fallbackVolume,
      weight_kg: fallbackDims.weight_kg,
      load_size: 'medium',
      vehicle: 'van',
      movers_required: 1,
      handling_complexity: 'medium',
      insurance_level: 'standard',
      confidence: 0,
      source: 'fallback',
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Convert Vision Engine 2.0 result to legacy format for backward compatibility
 */
export function toIdentificationResult(v2Result: VisionEngineResult): {
  itemName: string;
  category: 'Furniture' | 'Appliance' | 'Fragile' | 'Oversized' | 'Bulky' | 'Electronics' | 'Other';
  weightKg: number;
  dimensionsLcm: number;
  dimensionsWcm: number;
  dimensionsHcm: number;
  volumeCuft: number;
  handlingComplexity: 'low' | 'medium' | 'high' | 'very_high';
  vehicleType: 'car' | 'van' | 'pickup' | 'truck';
  recommendedMovers: 1 | 2;
  insuranceLevel: 'standard' | 'medium' | 'high' | 'premium';
  confidence: number;
  sourceMetadata: string;
} {
  // Map category to legacy format
  let legacyCategory: 'Furniture' | 'Appliance' | 'Fragile' | 'Oversized' | 'Bulky' | 'Electronics' | 'Other' = 'Other';
  
  switch (v2Result.category) {
    case 'Bed':
    case 'Sofa':
    case 'Table':
    case 'Chair':
    case 'Dresser':
    case 'Storage':
      legacyCategory = 'Furniture';
      break;
    case 'Appliance':
      legacyCategory = 'Appliance';
      break;
    case 'Electronics':
      legacyCategory = 'Electronics';
      break;
    case 'Outdoor':
      legacyCategory = 'Bulky';
      break;
    default:
      legacyCategory = 'Other';
  }
  
  return {
    itemName: v2Result.itemName,
    category: legacyCategory,
    weightKg: v2Result.weight_kg,
    dimensionsLcm: v2Result.dimensions.length_cm,
    dimensionsWcm: v2Result.dimensions.width_cm,
    dimensionsHcm: v2Result.dimensions.height_cm,
    volumeCuft: v2Result.volume_ft3,
    handlingComplexity: v2Result.handling_complexity,
    vehicleType: v2Result.vehicle,
    recommendedMovers: v2Result.movers_required,
    insuranceLevel: v2Result.insurance_level,
    confidence: v2Result.confidence,
    sourceMetadata: JSON.stringify({
      visionEngine: '2.0',
      source: v2Result.source,
      matchedItem: v2Result.matchedItem,
      corrections: v2Result.corrections,
      processingTime: v2Result.processingTime,
      subcategory: v2Result.subcategory,
      quantity: v2Result.quantity,
      perItemVolumeFt3: v2Result.perItemVolumeFt3,
      perItemWeightKg: v2Result.perItemWeightKg,
    }),
  };
}

/**
 * Example outputs for testing
 */
export const EXAMPLE_OUTPUTS = {
  twinBedWithStorage: {
    itemName: "Twin bed frame with storage drawers",
    category: "Bed",
    subcategory: "Twin",
    dimensions: { length_cm: 191, width_cm: 99, height_cm: 43 },
    volume_ft3: 28.88,
    weight_kg: 55,
    load_size: "medium" as LoadSizeCategory,
    vehicle: "van" as VehicleType,
    movers_required: 2 as const,
    handling_complexity: "medium" as const,
    insurance_level: "standard" as const,
    confidence: 0.95,
    source: "database_match" as const,
    matchedItem: "BED_TWIN_STORAGE_001",
    processingTime: 2500,
  },
  
  threeSeatSofa: {
    itemName: "3-seater upholstered sofa",
    category: "Sofa",
    subcategory: "3-Seater",
    dimensions: { length_cm: 210, width_cm: 90, height_cm: 85 },
    volume_ft3: 56.78,
    weight_kg: 70,
    load_size: "large" as LoadSizeCategory,
    vehicle: "pickup" as VehicleType,
    movers_required: 2 as const,
    handling_complexity: "high" as const,
    insurance_level: "medium" as const,
    confidence: 0.92,
    source: "database_match" as const,
    matchedItem: "SOFA_3SEAT_001",
    processingTime: 2800,
  },
  
  diningTableWith4Chairs: {
    itemName: "Dining table with 4 chairs set",
    category: "Table",
    subcategory: "Dining",
    dimensions: { length_cm: 120, width_cm: 75, height_cm: 75 },
    volume_ft3: 23.86,
    weight_kg: 67,  // Table (35kg) + 4 chairs (8kg each)
    load_size: "medium" as LoadSizeCategory,
    vehicle: "van" as VehicleType,
    movers_required: 2 as const,
    handling_complexity: "medium" as const,
    insurance_level: "medium" as const,
    confidence: 0.88,
    source: "vision_estimate" as const,
    corrections: [],
    processingTime: 3200,
  },
  
  refrigerator: {
    itemName: "Standard top-freezer refrigerator",
    category: "Appliance",
    subcategory: "Refrigerator",
    dimensions: { length_cm: 75, width_cm: 70, height_cm: 170 },
    volume_ft3: 31.52,
    weight_kg: 90,
    load_size: "large" as LoadSizeCategory,
    vehicle: "truck" as VehicleType,
    movers_required: 2 as const,
    handling_complexity: "very_high" as const,
    insurance_level: "premium" as const,
    confidence: 0.94,
    source: "database_match" as const,
    matchedItem: "FRIDGE_STANDARD_001",
    processingTime: 2400,
  },
};
