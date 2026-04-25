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
import heicConvert from "heic-convert";
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

/** Per-item breakdown entry in a multi-item scene result */
export interface DetectedItemSummary {
  itemName: string;
  category: string;
  subcategory: string;
  quantity: number;
  perItemVolumeFt3: number;
  totalVolumeFt3: number;
  perItemWeightKg: number;
  totalWeightKg: number;
  source: 'database_match' | 'vision_estimate';
  matchedItem?: string;
  confidence: number;
}

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
  volume_ft3: number;        // TOTAL volume across ALL detected items
  weight_kg: number;         // TOTAL weight across ALL detected items
  load_size: LoadSizeCategory;  // Based on TOTAL volume
  vehicle: VehicleType;         // Based on TOTAL volume/weight
  movers_required: 1 | 2;
  handling_complexity: 'low' | 'medium' | 'high' | 'very_high';
  insurance_level: 'standard' | 'medium' | 'high' | 'premium';
  confidence: number;
  source: 'database_match' | 'vision_estimate' | 'fallback';
  matchedItem?: string;  // Database item ID if matched (single-item path)
  corrections?: string[];  // Any corrections applied
  processingTime: number;
  // Multi-item scene fields
  isMultiItem?: boolean;          // True when multiple distinct items were detected
  detectedItems?: DetectedItemSummary[];  // Per-item breakdown
}

/**
 * Download image from Object Storage or local disk and convert to base64 data URL
 * Automatically converts HEIC/HEIF (iPhone format) to JPEG for OpenAI compatibility
 */
async function imageToBase64(imagePath: string): Promise<string> {
  console.log('[Vision Engine 2.0] Converting image to base64:', imagePath);
  
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/jpeg', // Will be converted
    '.heif': 'image/jpeg', // Will be converted
  };
  
  let buffer: Buffer;
  
  // Handle Object Storage paths
  if (imagePath.startsWith('/objects/')) {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(imagePath);
      const [downloadedBuffer] = await objectFile.download();
      buffer = Buffer.from(downloadedBuffer);
    } catch (error) {
      console.error('[Vision Engine 2.0] Object Storage download failed:', error);
      throw new Error('Failed to download image from storage. Please try uploading again.');
    }
  }
  // Handle local /uploads/ paths (fallback when Object Storage fails)
  else if (imagePath.startsWith('/uploads/')) {
    try {
      const fs = await import('fs');
      // Remove leading slash to properly join with public directory
      const relativePath = imagePath.replace(/^\/+/, '');
      const localPath = path.join(process.cwd(), 'public', relativePath);
      console.log('[Vision Engine 2.0] Reading local file:', localPath);
      if (!fs.existsSync(localPath)) {
        throw new Error(`Image file not found: ${localPath}`);
      }
      buffer = fs.readFileSync(localPath);
    } catch (error) {
      console.error('[Vision Engine 2.0] Local file read failed:', error);
      throw new Error('Failed to read uploaded image. Please try uploading again.');
    }
  }
  // Handle full URLs (http/https)
  else if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  // Unknown path format
  else {
    console.error('[Vision Engine 2.0] Unknown image path format:', imagePath);
    throw new Error('Invalid image path format. Please upload a valid image.');
  }
  
  // Check if HEIC/HEIF format (iPhone) - needs conversion
  if (ext === '.heic' || ext === '.heif') {
    console.log('[Vision Engine 2.0] Converting HEIC/HEIF to JPEG for OpenAI compatibility');
    try {
      const jpegBuffer = await heicConvert({
        buffer: buffer,
        format: 'JPEG',
        quality: 0.9
      });
      const base64 = Buffer.from(jpegBuffer).toString('base64');
      return `data:image/jpeg;base64,${base64}`;
    } catch (conversionError) {
      console.error('[Vision Engine 2.0] HEIC conversion failed:', conversionError);
      throw new Error('Failed to convert HEIC image. Please upload a JPEG, PNG, or WebP image.');
    }
  }
  
  const base64 = buffer.toString('base64');
  const mimeType = mimeTypes[ext] || 'image/jpeg';
  
  return `data:${mimeType};base64,${base64}`;
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

  // Boxes are counted individually — never apply a category floor to them
  // (a single small box is legitimately 1-2 ft³; the quantity multiplier handles the total)
  if (nameLower.includes('box') || nameLower.includes('cardboard') || nameLower.includes('packing box')) {
    return { volume: calculatedVolume, wasEnforced: false };
  }
  
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
  const sofaKeywords = ['sofa', 'couch', 'loveseat', 'sectional', 'futon', 'sofa bed', 'sleeper'];
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
  
  // Pattern: any explicit number 5 or above (e.g., "25 moving boxes", "approximately 30 boxes", "10 cardboard boxes")
  const largeNumPattern = /^(?:approximately\s+)?(\d{1,3})\s+(?:of\s+)?(.+)/i;
  const largeNumMatch = nameLower.match(largeNumPattern);
  if (largeNumMatch) {
    const count = parseInt(largeNumMatch[1], 10);
    if (count >= 5) {
      const singleName = largeNumMatch[2]
        .replace(/boxes/i, 'box')
        .replace(/chairs$/i, 'chair')
        .replace(/tables$/i, 'table')
        .replace(/items$/i, 'item')
        .replace(/bags$/i, 'bag');
      console.log(`[Vision Engine 2.0] Quantity detected: ${count} (numeric) - "${itemName}" → "${singleName}"`);
      return { quantity: count, singleItemName: singleName };
    }
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
  quantity?: number;  // Optional explicit quantity from GPT-4o (for multi-item detection)
  estimatedDimensions?: {
    length_cm: number;
    width_cm: number;
    height_cm: number;
  };
  estimatedWeight?: number;
}

/** Shared reference dimensions and instructions injected into the GPT-4o prompt */
const VISION_PROMPT_INSTRUCTIONS = `
CATEGORIES: Bed, Sofa, Table, Chair, Dresser, Appliance, Electronics, Storage, Outdoor, Luggage, Other

SECTIONAL SOFA SIZE (count seat cushions + compare to doorways ~200cm tall):
• SMALL L-shaped (2-piece): 2-3 cushions. ~230×150×85cm, 70kg
• MEDIUM L-shaped (3-piece): 4-5 cushions. ~300×180×85cm, 120kg
• LARGE L-shaped (4-5 piece): 6+ cushions. ~370×220×90cm, 170kg
• SMALL U-shaped (3-piece): 5-6 cushions. ~280×200×85cm, 130kg
• MEDIUM U-shaped (4-5 piece): 7-8 cushions. ~350×250×85cm, 180kg
• LARGE U-shaped (6+ piece): 9+ cushions. ~420×300×90cm, 240kg
Name examples: "Small L-shaped sectional sofa", "Large U-shaped sectional sofa"

SOFA BED — check for: pull handles/straps on seat front, seams between cushion/base, thick boxy base.
• Twin sofa bed: ~170×90×85cm, 55kg
• Full/Double sofa bed: ~200×95×85cm, 75kg
• Queen sofa bed: ~230×100×90cm, 95kg
• Small sectional sofa bed: ~250×170×85cm, 110kg
• Medium sectional sofa bed: ~290×200×90cm, 145kg
• Large sectional sofa bed: ~340×220×90cm, 180kg

MOVING BOXES (CRITICAL):
• COUNT every visible box including stacked/background ones. Use depth cues.
• Use quantity field for the count (do NOT encode count in itemName).
• itemName = "Moving box (small|medium|large)"
• estimatedDimensions = single box dims. estimatedWeight = single box weight (5-12 kg).
• SMALL (~40×30×30 cm), MEDIUM (~50×40×40 cm), LARGE (~60×50×50 cm)
• Category: Storage, Subcategory: Boxes

REFERENCE DIMENSIONS:
• Twin bed: ~191×99×40cm, 35kg  | Queen bed: ~203×152×40cm, 55kg  | King bed: ~203×193×40cm, 70kg
• Loveseat: ~150×85×85cm, 45kg  | 3-seater sofa: ~210×90×85cm, 70kg
• 4-person dining table: ~120×75×75cm, 35kg  | 6-person dining table: ~180×90×75cm, 50kg
• Coffee table: ~120×60×45cm, 25kg  | Office desk: ~150×75×75cm, 40kg
• 6-drawer dresser: ~150×50×85cm, 70kg
• Standard fridge: ~75×70×170cm, 90kg  | French door fridge: ~90×80×180cm, 130kg
• 55" TV: ~125×8×72cm, 18kg  | 65" TV: ~145×10×85cm, 25kg
• Washing machine: ~60×65×85cm, 75kg
• Backpack: ~45×30×20cm, 1kg  | Carry-on suitcase: ~55×35×25cm, 3kg
• Medium suitcase: ~65×45×30cm, 4kg  | Large suitcase: ~75×50×35cm, 5kg`;

/**
 * STEP 1: Use GPT-4o Vision to detect ALL distinct items in the photo (multi-item scene analysis)
 * Returns an array — one entry per distinct item/group visible in the image.
 */
async function detectAllItemsWithVision(imageBase64: string): Promise<VisionDetectionResult[]> {
  if (!openai) {
    console.warn('[Vision Engine 2.0] OpenAI not available, using fallback detection');
    return [{
      itemName: 'Unidentified Item',
      category: 'Other',
      subcategory: 'Unknown',
      confidence: 0,
      quantity: 1,
    }];
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are the LervIT Vision Engine 2.0 — an expert at identifying furniture and household items for a moving company.

Analyze this image and identify EVERY distinct moveable item or group of identical items visible.

RULES:
1. List each distinct item type separately (sofa, bed, dresser = 3 entries).
2. Group identical items using the "quantity" field (e.g., 4 dining chairs = 1 entry with quantity:4).
3. Use "quantity" for moving boxes — count ALL boxes visible including stacked/background ones.
4. Do NOT merge different item types. Do NOT list decorative/built-in fixtures (curtains, flooring, walls).
5. Be specific in itemName: "Queen platform bed", "3-seater fabric sofa", "6-drawer dresser".
6. For single unique items set quantity:1.
7. Max 12 entries. Min confidence 0.3 to include an item.
${VISION_PROMPT_INSTRUCTIONS}

Return ONLY valid JSON (no markdown):
{
  "items": [
    {
      "itemName": "descriptive name",
      "category": "from category list",
      "subcategory": "specific subcategory",
      "quantity": 1,
      "confidence": 0.0-1.0,
      "estimatedDimensions": { "length_cm": number, "width_cm": number, "height_cm": number },
      "estimatedWeight": number
    }
  ]
}`,
          },
          {
            type: "image_url",
            image_url: { url: imageBase64 },
          },
        ],
      },
    ],
    max_tokens: 1500,
  });

  let content = response.choices[0]?.message?.content || '{"items":[]}';
  content = content.trim();
  if (content.startsWith('```')) {
    content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  let parsed: { items?: any[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error('[Vision Engine 2.0] Failed to parse multi-item JSON, falling back to single-item');
    // Attempt to recover a single item if the model returned old format
    try {
      const single = JSON.parse(content);
      if (single.itemName) parsed = { items: [single] };
      else parsed = { items: [] };
    } catch {
      parsed = { items: [] };
    }
  }

  const items: VisionDetectionResult[] = (parsed.items || [])
    .filter((it: any) => it && typeof it.itemName === 'string' && it.itemName.trim())
    .slice(0, 12)
    .map((it: any) => ({
      itemName: String(it.itemName).trim(),
      category: String(it.category || 'Other').trim(),
      subcategory: String(it.subcategory || 'Unknown').trim(),
      confidence: typeof it.confidence === 'number' ? it.confidence : 0.5,
      quantity: typeof it.quantity === 'number' && it.quantity >= 1 ? Math.round(it.quantity) : 1,
      estimatedDimensions: it.estimatedDimensions,
      estimatedWeight: it.estimatedWeight,
    }));

  if (items.length === 0) {
    console.warn('[Vision Engine 2.0] No items returned by multi-item detection, using fallback');
    return [{
      itemName: 'Unidentified Item',
      category: 'Other',
      subcategory: 'Unknown',
      confidence: 0.3,
      quantity: 1,
    }];
  }

  console.log(`[Vision Engine 2.0] Detected ${items.length} item(s):`,
    items.map(i => `${i.quantity}× ${i.itemName}`).join(', '));

  return items;
}

/**
 * COMPLEXITY ranking helper for aggregation
 */
const COMPLEXITY_RANK: Record<string, number> = {
  low: 0, medium: 1, high: 2, very_high: 3,
};
const INSURANCE_RANK: Record<string, number> = {
  standard: 0, medium: 1, high: 2, premium: 3,
};

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
 * Process a single detected item through database matching + dimension correction.
 * Returns a DetectedItemSummary with resolved volume and weight for aggregation.
 */
function processSingleDetectedItem(visionResult: VisionDetectionResult): DetectedItemSummary & {
  dimensions: { length_cm: number; width_cm: number; height_cm: number };
  handling_complexity: 'low' | 'medium' | 'high' | 'very_high';
  insurance_level: 'standard' | 'medium' | 'high' | 'premium';
  movers_required: 1 | 2;
  corrections?: string[];
} {
  // Apply category correction
  const categoryCorrection = correctCategory(visionResult.itemName, visionResult.category);
  const category = categoryCorrection.wasCorrected ? categoryCorrection.category : visionResult.category;

  // Resolve quantity — prefer GPT-4o's explicit quantity field (multi-item path),
  // fall back to name-parsing for legacy single-item path.
  let quantity: number;
  let matchName: string;

  if (typeof visionResult.quantity === 'number' && visionResult.quantity >= 1) {
    quantity = visionResult.quantity;
    matchName = visionResult.itemName;
  } else {
    const qInfo = detectQuantity(visionResult.itemName);
    quantity = qInfo.quantity;
    matchName = quantity > 1 ? qInfo.singleItemName : visionResult.itemName;
  }

  // Database match attempt
  const dbMatch = matchWithDatabase({ ...visionResult, category, itemName: matchName });

  if (dbMatch.matched && dbMatch.item) {
    const item = dbMatch.item;
    const perItemVolume = item.volume_ft3;
    const perItemWeight = item.weight_kg;
    const totalVolume = Math.round(perItemVolume * quantity * 100) / 100;
    const totalWeight = Math.round(perItemWeight * quantity * 10) / 10;
    const confidence = Math.min(visionResult.confidence * dbMatch.similarity * 1.2, 0.99);

    let movers: 1 | 2 = item.movers_required;
    if (totalWeight > 50) movers = 2;

    console.log(`[Vision Engine 2.0] ✓ DB match: ${visionResult.itemName} → ${item.name} (qty:${quantity}, vol:${totalVolume}ft³)`);

    return {
      itemName: visionResult.itemName,
      category: item.category,
      subcategory: item.subcategory,
      quantity,
      perItemVolumeFt3: perItemVolume,
      totalVolumeFt3: totalVolume,
      perItemWeightKg: perItemWeight,
      totalWeightKg: totalWeight,
      source: 'database_match',
      matchedItem: item.item_id,
      confidence,
      dimensions: {
        length_cm: item.dimensions_cm.length,
        width_cm: item.dimensions_cm.width,
        height_cm: item.dimensions_cm.height,
      },
      handling_complexity: item.handling_complexity,
      insurance_level: item.insurance_level,
      movers_required: movers,
    };
  }

  // Vision estimate path — apply dimension corrections
  const estimated = visionResult.estimatedDimensions || getTypicalDimensions(category);
  const estimatedWeight = visionResult.estimatedWeight || 20;

  const corrected = correctDimensions(
    category,
    visionResult.itemName,
    estimated.length_cm || 100,
    estimated.width_cm || 50,
    estimated.height_cm || 50,
    estimatedWeight
  );

  let volume = calculateVolumeFt3(corrected.length_cm, corrected.width_cm, corrected.height_cm);

  const volumeEnforcement = enforceMinimumVolume(category, visionResult.itemName, volume);
  if (volumeEnforcement.wasEnforced) {
    volume = volumeEnforcement.volume;
    corrected.corrections.push(`Volume increased to ${volume}ft³ (minimum for category)`);
  }

  const perItemVolume = volume;
  const perItemWeight = corrected.weight_kg;
  const totalVolume = Math.round(perItemVolume * quantity * 100) / 100;
  const totalWeight = Math.round(perItemWeight * quantity * 10) / 10;

  let handling: 'low' | 'medium' | 'high' | 'very_high' = 'low';
  let movers: 1 | 2 = 1;
  let insurance: 'standard' | 'medium' | 'high' | 'premium' = 'standard';

  if (corrected.weight_kg > 100 || volume > 150) {
    handling = 'very_high'; movers = 2; insurance = 'premium';
  } else if (corrected.weight_kg > 50 || volume > 50) {
    handling = 'high'; movers = 2; insurance = 'high';
  } else if (corrected.weight_kg > 25 || volume > 10) {
    handling = 'medium';
    movers = corrected.weight_kg > 35 ? 2 : 1;
    insurance = 'medium';
  }
  if (category === 'Electronics') insurance = insurance === 'standard' ? 'medium' : insurance;
  if (totalWeight > 50) movers = 2;

  console.log(`[Vision Engine 2.0] ~ Estimate: ${visionResult.itemName} (qty:${quantity}, vol:${totalVolume}ft³)`);

  return {
    itemName: visionResult.itemName,
    category,
    subcategory: visionResult.subcategory,
    quantity,
    perItemVolumeFt3: perItemVolume,
    totalVolumeFt3: totalVolume,
    perItemWeightKg: perItemWeight,
    totalWeightKg: totalWeight,
    source: 'vision_estimate',
    confidence: visionResult.confidence * (corrected.wasCorrect ? 1 : 0.9),
    dimensions: {
      length_cm: corrected.length_cm,
      width_cm: corrected.width_cm,
      height_cm: corrected.height_cm,
    },
    handling_complexity: handling,
    insurance_level: insurance,
    movers_required: movers,
    corrections: corrected.corrections.length > 0 ? corrected.corrections : undefined,
  };
}

/**
 * MAIN PIPELINE: Vision Engine 2.0 — Multi-Item Scene Analysis
 *
 * Detects ALL distinct items in the photo, matches each against the
 * ground-truth database, sums volumes/weights, and returns a composite result.
 */
export async function identifyItemV2(photoUrl: string): Promise<VisionEngineResult> {
  const startTime = Date.now();

  try {
    // STEP 1: Convert image to base64
    const imageBase64 = await imageToBase64(photoUrl);

    // STEP 2: Detect all items in the scene (multi-item GPT-4o call)
    const detectedItems = await detectAllItemsWithVision(imageBase64);

    // STEP 3: Process each item through DB matching + dimension correction
    const processed = detectedItems.map(item => processSingleDetectedItem(item));

    // STEP 4: Aggregate across all items
    const totalVolume = Math.round(processed.reduce((s, i) => s + i.totalVolumeFt3, 0) * 100) / 100;
    const totalWeight = Math.round(processed.reduce((s, i) => s + i.totalWeightKg, 0) * 10) / 10;
    const avgConfidence = processed.reduce((s, i) => s + i.confidence, 0) / processed.length;

    // Highest complexity and insurance across all items
    const handling = processed.reduce((best, i) =>
      COMPLEXITY_RANK[i.handling_complexity] > COMPLEXITY_RANK[best] ? i.handling_complexity : best,
      'low' as 'low' | 'medium' | 'high' | 'very_high'
    );
    const insurance = processed.reduce((best, i) =>
      INSURANCE_RANK[i.insurance_level] > INSURANCE_RANK[best] ? i.insurance_level : best,
      'standard' as 'standard' | 'medium' | 'high' | 'premium'
    );
    const movers: 1 | 2 = totalWeight > 50 || processed.some(i => i.movers_required === 2) ? 2 : 1;

    // Determine final load size and vehicle from TOTAL volume
    const finalLoadSize = getLoadSizeFromVolume(totalVolume);
    const finalVehicle = getVehicleRecommendationWithCategory(totalVolume, 'Other', totalWeight);

    // Source: database_match if all items matched, vision_estimate if any needed estimation
    const source = processed.every(i => i.source === 'database_match')
      ? 'database_match'
      : 'vision_estimate';

    const isMultiItem = processed.length > 1;

    // Build summary itemName
    const itemName = isMultiItem
      ? processed.map(i => i.quantity > 1 ? `${i.quantity}× ${i.itemName}` : i.itemName).join(', ')
      : (processed[0]?.itemName ?? 'Unidentified Item');

    // Primary item (largest volume) for top-level dimensions
    const primaryItem = processed.reduce((a, b) => a.totalVolumeFt3 >= b.totalVolumeFt3 ? a : b);

    const detectedItemsSummary: DetectedItemSummary[] = processed.map(i => ({
      itemName: i.itemName,
      category: i.category,
      subcategory: i.subcategory,
      quantity: i.quantity,
      perItemVolumeFt3: i.perItemVolumeFt3,
      totalVolumeFt3: i.totalVolumeFt3,
      perItemWeightKg: i.perItemWeightKg,
      totalWeightKg: i.totalWeightKg,
      source: i.source,
      matchedItem: i.matchedItem,
      confidence: i.confidence,
    }));

    const result: VisionEngineResult = {
      itemName,
      category: primaryItem.category,
      subcategory: primaryItem.subcategory,
      quantity: processed.reduce((s, i) => s + i.quantity, 0),
      dimensions: primaryItem.dimensions,
      perItemVolumeFt3: primaryItem.perItemVolumeFt3,
      perItemWeightKg: primaryItem.perItemWeightKg,
      volume_ft3: totalVolume,
      weight_kg: totalWeight,
      load_size: finalLoadSize,
      vehicle: finalVehicle,
      movers_required: movers,
      handling_complexity: handling,
      insurance_level: insurance,
      confidence: Math.round(avgConfidence * 100) / 100,
      source,
      matchedItem: !isMultiItem ? processed[0]?.matchedItem : undefined,
      corrections: processed.flatMap(i => i.corrections ?? []),
      processingTime: Date.now() - startTime,
      isMultiItem,
      detectedItems: isMultiItem ? detectedItemsSummary : undefined,
    };

    logEvent.vision(isMultiItem ? 'multi_item_scene' : 'database_match', {
      itemName: result.itemName,
      itemCount: processed.length,
      totalVolumeFt3: totalVolume,
      totalWeightKg: totalWeight,
      loadSize: result.load_size,
      vehicle: result.vehicle,
      source: result.source,
      confidence: result.confidence,
      processingTimeMs: result.processingTime,
    });

    return result;

  } catch (error: any) {
    logEvent.error('vision_engine', error, { photoUrl });

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
