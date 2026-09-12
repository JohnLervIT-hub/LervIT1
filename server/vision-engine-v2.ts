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

// AUTOGEN:REF_DIMS:START — regenerate with: npm run generate:dims (source: shared/furniture-database.ts)
const REFERENCE_DIMENSIONS = `REFERENCE DIMENSIONS (use these):

BEDS:
• Twin bed frame (standard): ~191×99×40cm, 35kg
• Twin bed frame with storage drawers: ~191×99×43cm, 55kg
• Full/Double bed frame: ~191×137×40cm, 45kg
• Queen bed frame: ~203×152×40cm, 55kg
• Queen platform bed with headboard: ~210×165×110cm, 75kg
• King bed frame: ~203×193×40cm, 70kg
• Bunk bed (twin over twin): ~200×100×170cm, 80kg
• Crib / Toddler bed: ~130×70×100cm, 20kg
• Daybed with trundle: ~200×100×90cm, 55kg
• Twin mattress: ~191×99×20cm, 20kg
• Full/Double mattress: ~191×137×22cm, 30kg
• Queen mattress: ~203×152×25cm, 40kg
• King mattress: ~203×193×25cm, 50kg
• King adjustable bed base: ~203×192×40cm, 100kg
• Queen adjustable bed base: ~203×153×40cm, 75kg

SOFAS:
• 2-seater loveseat sofa: ~150×85×85cm, 45kg
• 3-seater sofa: ~210×90×85cm, 70kg
• Small L-shaped sectional sofa (2-piece, apartment-size): ~230×150×85cm, 70kg
• Medium L-shaped sectional sofa (3-piece, standard): ~300×180×85cm, 120kg
• Large L-shaped sectional sofa (4-5 piece, deep-seat, oversized): ~370×220×90cm, 170kg
• Small U-shaped sectional sofa (compact, 3-piece): ~280×200×85cm, 130kg
• Medium U-shaped sectional sofa (standard, 4-5 piece): ~350×250×85cm, 180kg
• Large U-shaped sectional sofa (oversized, 6+ piece): ~420×300×90cm, 240kg
• Twin sofa bed (loveseat sleeper, pull-out twin): ~170×90×85cm, 55kg
• Full/Double sofa bed (3-seat sleeper, pull-out double): ~200×95×85cm, 75kg
• Queen sofa bed (large sleeper, pull-out queen): ~230×100×90cm, 95kg
• Small sectional sofa bed (2-piece L-shaped with pull-out sleeper): ~250×170×85cm, 110kg
• Medium sectional sofa bed (3-piece L-shaped with pull-out sleeper and storage): ~290×200×90cm, 145kg
• Large sectional sofa bed (4+ piece L/U-shaped with pull-out sleeper and storage): ~340×220×90cm, 180kg

TABLES:
• Dining table (4-person): ~120×75×75cm, 35kg
• Dining table (6-person): ~180×90×75cm, 50kg
• Dining table (8-person): ~240×100×75cm, 70kg
• Coffee table: ~120×60×45cm, 25kg
• Side table / End table: ~50×50×55cm, 12kg
• Console table / Entry table: ~120×35×80cm, 20kg
• Office desk (standard): ~150×75×75cm, 40kg
• L-shaped desk: ~180×150×75cm, 65kg
• Standing desk (electric): ~150×75×125cm, 55kg

CHAIRS:
• Recliner sofa (3-seat): ~230×100×100cm, 110kg
• Armchair / Accent chair: ~85×85×90cm, 30kg
• Single recliner chair: ~90×85×100cm, 45kg
• Dining chair: ~45×50×90cm, 8kg
• Office chair (ergonomic): ~65×65×110cm, 18kg
• Gaming chair: ~70×70×130cm, 25kg
• Upholstered accent chair: ~75×70×95cm, 12kg
• Accent chair (wingback): ~80×75×105cm, 15kg
• Lounge chair / Club chair: ~85×80×90cm, 20kg
• Recliner chair: ~90×85×100cm, 35kg
• Barrel chair / Swivel chair: ~75×75×80cm, 14kg

STORAGE:
• 6-drawer dresser: ~150×50×85cm, 70kg
• Tall dresser / Chest of drawers: ~80×45×130cm, 55kg
• Nightstand / Bedside table: ~50×40×55cm, 15kg
• Wardrobe / Armoire: ~120×60×200cm, 100kg
• Bookshelf (5-shelf): ~80×30×180cm, 40kg
• TV stand / Entertainment center: ~150×45×55cm, 40kg

APPLIANCES:
• Refrigerator (standard top-freezer): ~75×70×170cm, 90kg
• French door refrigerator: ~90×80×180cm, 130kg
• Washing machine (front-load): ~60×65×85cm, 75kg
• Clothes dryer: ~60×65×85cm, 55kg
• Dishwasher: ~60×60×85cm, 45kg
• Stove / Range (electric): ~76×70×115cm, 70kg
• Microwave (countertop): ~50×40×30cm, 15kg
• Window air conditioner: ~60×50×40cm, 35kg
• Portable air conditioner: ~45×40×80cm, 30kg
• Chest freezer: ~110×65×85cm, 55kg
• Upright freezer: ~70×65×170cm, 80kg
• Stove / Range (gas): ~76×70×115cm, 80kg
• Washing machine (top-load): ~60×60×105cm, 65kg
• Stacked washer/dryer combo: ~65×65×180cm, 130kg
• Mini fridge / Bar fridge: ~48×45×50cm, 20kg
• Wall oven: ~60×60×90cm, 55kg
• Range hood / Exhaust hood: ~76×50×30cm, 15kg
• Water heater (tank): ~50×50×150cm, 55kg
• Space heater / Portable heater: ~40×25×55cm, 8kg
• Dehumidifier: ~40×30×60cm, 15kg
• French door refrigerator (4-door, large): ~91×84×178cm, 138kg

ELECTRONICS:
• 32-inch TV: ~73×7×44cm, 5kg
• 40-inch TV: ~92×7×54cm, 8kg
• 43-inch TV: ~97×7×57cm, 9kg
• 50-inch TV: ~113×8×66cm, 14kg
• 55-inch TV: ~125×8×72cm, 18kg
• 65-inch TV: ~145×10×85cm, 25kg
• 75-inch TV: ~168×10×97cm, 35kg
• 85-inch TV: ~191×12×110cm, 45kg
• Computer monitor (27-32 inch): ~70×25×50cm, 8kg
• Desktop computer (tower): ~50×25×50cm, 15kg
• 82-inch TV: ~185×6×105cm, 48kg
• 86-inch TV: ~191×6×109cm, 45kg
• 98-inch TV: ~219×4×125cm, 62kg

OUTDOOR:
• BBQ grill (propane): ~140×60×115cm, 50kg
• Patio furniture set (4-piece): ~150×80×90cm, 45kg
• Lawn mower (push): ~150×55×100cm, 35kg
• Bicycle (adult): ~180×60×110cm, 15kg

EXERCISE:
• Treadmill: ~180×80×150cm, 100kg
• Exercise bike / Stationary bike: ~120×55×130cm, 55kg
• Home gym / Multi-station weight machine: ~160×125×211cm, 100kg

SPECIALTY:
• Upright piano: ~150×60×130cm, 250kg
• Moving box (small): ~40×30×30cm, 15kg
• Moving box (medium): ~50×40×40cm, 20kg
• Moving box (large): ~60×50×50cm, 25kg
• Baby grand piano: ~161×149×101cm, 290kg
• Grand piano (concert / full size): ~186×149×101cm, 325kg
• Hot tub / Spa (6-person): ~213×213×90cm, 450kg
• Hot tub / Spa (4-person): ~185×185×85cm, 300kg
• Gun safe (large, 30+ gun capacity): ~107×70×184cm, 422kg
• Gun safe (medium, 12-24 gun capacity): ~90×55×150cm, 180kg
• Pool table / Billiard table (8-foot): ~257×145×81cm, 409kg
• Pool table / Billiard table (9-foot): ~284×158×81cm, 520kg
• Massage chair (zero gravity / full body): ~145×80×125cm, 105kg
• Pinball machine: ~140×69×192cm, 113kg
• Arcade game cabinet (upright): ~76×61×178cm, 80kg
• Motorcycle (standard / cruiser): ~220×80×110cm, 200kg
• Motorcycle (touring / Harley-Davidson): ~240×95×120cm, 357kg

LUGGAGE:
• Handbag / Purse: ~35×15×25cm, 2kg
• Messenger bag / Crossbody bag: ~40×12×30cm, 3kg
• Backpack: ~45×30×55cm, 5kg
• Duffel bag / Gym bag: ~60×30×35cm, 8kg
• Weekender bag / Travel bag: ~55×25×35cm, 6kg
• Carry-on suitcase / Cabin luggage: ~55×35×23cm, 10kg
• Medium suitcase: ~68×45×28cm, 15kg
• Large suitcase: ~78×52×32cm, 23kg
• Tote bag / Shopping bag: ~40×15×35cm, 3kg
• Laundry bag / Laundry basket: ~50×40×60cm, 10kg
• Garment bag / Suit bag: ~60×5×100cm, 4kg`;
// AUTOGEN:REF_DIMS:END

// In-memory result cache — two layers:
//   1. By URL  → instant hit when the exact same URL is re-analyzed
//   2. By content hash → same physical file uploaded twice (different URL) still hits cache
const visionResultCache = new Map<string, VisionEngineResult>();
const visionHashCache  = new Map<string, VisionEngineResult>();

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
  // Keyed bucket for PRICING_CONFIG.itemPremiums — populated when the item
  // qualifies for a special-handling surcharge (piano, refrigerator, hot tub…).
  // Null for standard household items.
  premiumKey?: string | null;
}

/**
 * Server-side classifier that maps a detected item to a PRICING_CONFIG.itemPremiums
 * key using pattern matching on itemName + category + subcategory. Kept close to the
 * pricing table so premium coverage stays in sync when new keys are added.
 * Returns null when the item is standard (no premium surcharge).
 */
export function derivePremiumKey(
  itemName: string,
  category: string,
  subcategory?: string,
): string | null {
  const n = (itemName || '').toLowerCase();
  const c = (category || '').toLowerCase();
  const s = (subcategory || '').toLowerCase();

  // Tier 1 — Heavy
  if (/\bgrand piano\b|\bbaby grand\b/.test(n)) return 'piano_grand';
  if (/\bpiano\b/.test(n)) return 'piano_upright';
  if (/\bhot tub\b|\bjacuzzi\b|\bspa\b/.test(n)) return 'hot_tub';
  if (/\bpool table\b|\bbilliard\b|\bsnooker\b/.test(n)) return 'pool_table';
  if (/\bsafe\b|\bvault\b|\bgun safe\b/.test(n) && !/\bunsafe\b/.test(n)) return 'safe';
  if (/\bindustrial\b|\bcnc\b|\bforge\b|\blathe\b/.test(n)) return 'industrial_equipment';

  // Tier 2 — Appliance
  if (/\bcommercial\b.*(?:fridge|freezer|oven|range|dishwasher|washer|dryer)/.test(n)) return 'commercial_appliance';
  if (/\brefrigerator\b|\bfridge\b/.test(n)) return 'refrigerator';
  if (/\bwashing machine\b|\bwasher\b/.test(n) && !/\bdisher/.test(n)) return 'washing_machine';
  if (/\bdryer\b/.test(n)) return 'dryer';
  if (/\bdishwasher\b/.test(n)) return 'dishwasher';
  if (/\bfreezer\b|\bchest freezer\b/.test(n)) return 'freezer';
  if (/\bstove\b|\brange\b|\bcooktop\b/.test(n)) return 'stove';
  if (/\boven\b/.test(n) && !/\bmicrowave\b/.test(n)) return 'oven';

  // Tier 3 — Fragile
  if (/\b(?:85|86|87|88|89|9\d|1\d\d)["\-\s]?(?:inch|in|")\b/.test(n) && /\btv\b|\btelevision\b/.test(n)) return 'tv_xlarge';
  if (/\btv\b|\btelevision\b/.test(n) && /\b(?:65|66|67|68|69|7\d|8[0-4])["\-\s]?(?:inch|in|")\b/.test(n)) return 'tv_large';
  if (/\bantique\b|\bheirloom\b/.test(n) || s.includes('antique')) return 'antique';
  if (/\bglass\b.*\btable\b/.test(n)) return 'glass_table';
  if (/\bmirror\b/.test(n) && /\b(?:large|full length|floor)\b/.test(n)) return 'mirror_large';
  if (/\bmarble\b/.test(n)) return 'marble_furniture';
  if (/\bpainting\b|\bartwork\b|\bsculpture\b|\bcanvas\b/.test(n)) return 'artwork';

  // Tier 4 — Awkward
  if (/\btreadmill\b/.test(n)) return 'treadmill';
  if (/\bexercise bike\b|\bstationary bike\b|\bpeloton\b/.test(n)) return 'exercise_bike';
  if (/\belliptical\b/.test(n)) return 'elliptical';
  if (/\bsectional\b/.test(n) || (c === 'sofa' && s.includes('sectional'))) return 'sectional_sofa';
  if (/\bking\b.*\bmattress\b|\bking mattress\b/.test(n)) return 'king_mattress';
  if (/\bkayak\b/.test(n)) return 'kayak';
  if (/\bcanoe\b/.test(n)) return 'canoe';
  if (/\bmotorcycle\b|\bmotorbike\b|\bscooter\b/.test(n)) return 'motorcycle';

  return null;
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
  
  // Pattern: Leading integer "N item(s)" — e.g. "42 moving boxes (large)", "12 boxes"
  const leadingNumberPattern = /^(\d+)\s+(.+)/;
  const leadingNumberMatch = nameLower.match(leadingNumberPattern);
  if (leadingNumberMatch) {
    const count = parseInt(leadingNumberMatch[1]);
    if (count >= 2 && count <= 500) {
      // Strip the leading number to get the single-item name
      const singleName = itemName.replace(/^\d+\s+/, '');
      console.log(`[Vision Engine 2.0] Quantity detected: ${count} (leading number) - "${itemName}" → "${singleName}"`);
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
  estimatedDimensions?: {
    length_cm: number;
    width_cm: number;
    height_cm: number;
  };
  estimatedWeight?: number;
  quantity?: number;
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

ITEM IDENTIFICATION:
Identify the PRIMARY item occupying ≥85% of the visual frame.

For FURNITURE SETS (dining table with chairs, bed with headboard, sofa with ottoman):
- Identify the DOMINANT item as the primary
- Use quantity field for counted pieces:
  e.g. dining chairs visible = quantity: 6
- Name includes set context:
  e.g. "Dining chair (from 6-person set)"

IGNORE:
- Background items not being photographed
- Decorative items (plants, lamps, artwork)
- Items at edges clearly not the subject

IDENTIFY:
1. Item type (be specific: "Small L-shaped sectional sofa", "Queen platform bed", "6-drawer dresser", "Travel backpack", "Large suitcase")
2. Category: Bed, Sofa, Table, Chair, Dresser, Appliance, Electronics, Storage, Outdoor, Luggage, Other
3. Subcategory (e.g., Twin, Queen, King for beds; Loveseat, 3-Seater, Sectional, Sofa Bed for sofas; Backpack, Suitcase, Duffel, Handbag for luggage)
4. Size indicators (Queen, King, 3-seater, L-shaped, etc.)
5. Material if visible (leather, fabric, wood, metal, glass)

SECTIONAL SOFA SIZE CLASSIFICATION (CRITICAL — use visual cues to determine size tier):
For sectional sofas, you MUST classify as Small, Medium, or Large based on these cues:
• Count the number of seat cushions visible
• Check seat depth (standard ~55cm vs deep-seat ~70cm+)
• Look for a chaise or ottoman section
• Compare to nearby objects (doors are ~200cm tall, standard doorways ~80cm wide)
• Count how many separable pieces/sections you can identify

L-SHAPED SECTIONAL TIERS:
• SMALL (2-piece, apartment-size): 2-3 seat cushions, compact chaise, fits against one wall. ~230×150×85cm, 70kg
• MEDIUM (3-piece, standard): 4-5 seat cushions, standard chaise, fills a corner. ~300×180×85cm, 120kg
• LARGE (4-5 piece, oversized/deep-seat): 6+ seat cushions, wide/deep seats, oversized chaise or ottoman. ~370×220×90cm, 170kg

U-SHAPED SECTIONAL TIERS:
• SMALL (compact, 3-piece): 5-6 seat cushions, narrow arms. ~280×200×85cm, 130kg
• MEDIUM (standard, 4-5 piece): 7-8 seat cushions, standard depth. ~350×250×85cm, 180kg
• LARGE (oversized, 6+ piece): 9+ seat cushions, theater/pit style, deep seats. ~420×300×90cm, 240kg

Include the size tier in the item name (e.g., "Small L-shaped sectional sofa", "Large U-shaped sectional sofa").

SOFA BED / SLEEPER DETECTION (CRITICAL — check for these indicators):
Before classifying any sofa, check for sofa bed / sleeper indicators:
• Pull handles or straps on the seat front (used to pull out the bed mechanism)
• Visible seams or gaps between seat cushions and base (where the bed folds out)
• Thick, boxy base with storage compartments (heavier than standard sofas)
• Visible metal frame or mechanism underneath
• Storage chaise with a lid that lifts up
• Unusually thick/heavy base panels compared to standard sofas

If ANY sofa bed indicators are detected, classify as "Sofa Bed" NOT as regular "Sofa" or "Sectional":

REGULAR SOFA BED TIERS:
• TWIN (loveseat sleeper): 2 seat cushions, compact. ~170×90×85cm, 55kg
• FULL/DOUBLE (3-seat sleeper): 3 seat cushions, standard size. ~200×95×85cm, 75kg
• QUEEN (large sleeper): 3-4 seat cushions, wider/deeper frame. ~230×100×90cm, 95kg

SECTIONAL SOFA BED TIERS:
• SMALL (2-piece L-shaped with sleeper): 3-4 cushions, pull-out + chaise. ~250×170×85cm, 110kg
• MEDIUM (3-piece L-shaped with sleeper + storage): 4-5 cushions, deep seats, storage chaise. ~290×200×90cm, 145kg
• LARGE (4+ piece L/U-shaped with sleeper + storage): 6+ cushions, oversized. ~340×220×90cm, 180kg

Include "sofa bed" in the item name (e.g., "Medium sectional sofa bed", "Queen sofa bed").

PROVIDE ACCURATE DIMENSION ESTIMATES based on item type:
- Use standard furniture dimensions for the identified type
- Be consistent: same item type = same dimensions

${REFERENCE_DIMENSIONS}

DINING & SEATING (missing from above):
- Dining chair: ~55×55×90cm, 8kg
- Bar stool (counter height): ~40×40×75cm, 5kg
- Bar stool (bar height): ~40×40×90cm, 6kg
- Armchair / Accent chair: ~85×85×90cm, 35kg
- Nightstand / Bedside table: ~50×45×60cm, 15kg
- TV stand / Media console: ~150×45×55cm, 40kg
- Bookshelf (5-tier, IKEA Billy): ~80×28×202cm, 30kg
- Filing cabinet (2-drawer): ~47×62×71cm, 25kg
- Filing cabinet (4-drawer): ~47×62×132cm, 45kg
- BBQ grill (propane): ~140×60×115cm, 50kg
- Snowblower (2-stage): ~70×55×100cm, 95kg

BOX / STORAGE SCENE COUNTING (CRITICAL — read this if you see multiple boxes):
If the image shows a scene with many cardboard moving boxes (not a single item):
• Your PRIMARY job is to COUNT every box as accurately as possible.
• Method: estimate (visible columns) × (visible rows/tiers per column) × (estimated depth layers front-to-back).
• Use door frames, walls, or furniture as scale references to judge stack depth.
• Return itemName as "N moving boxes (size)" — e.g. "42 moving boxes (large)".
• Set category to "Storage", subcategory to "Boxes".
• Set quantity to the total box count you estimated (this is the most important field).
• Dimensions should describe ONE single box (choose: small≈40×30×30cm, medium≈50×40×40cm, large≈60×50×50cm).
• If mixed sizes, use the dominant size and note it in itemName.
• estimatedWeight = quantity × kg_per_box (small=15kg, medium=20kg, large=25kg when packed).
• Example correct output: itemName="38 moving boxes (large)", quantity=38, dimensions=60×50×50, estimatedWeight=950

SIZING RULE:
When uncertain between two size estimates, always choose the LARGER option.
Moving trucks need real-world space. Underestimating causes job failures and driver disputes.

QUANTITY FIELD:
For sets or counted items, include quantity.
Example: dining chairs detected = 6

Return ONLY valid JSON (no markdown):
{
  "itemName": "detailed descriptive name",
  "category": "category from list above",
  "subcategory": "specific subcategory",
  "confidence": 0.0-1.0,
  "estimatedDimensions": { "length_cm": number, "width_cm": number, "height_cm": number },
  "estimatedWeight": number in kg,
  "quantity": number (default 1)
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
    temperature: 0,
    seed: 42,
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
    quantity: typeof result.quantity === 'number' ? result.quantity : undefined,
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

  // Return cached result for the same URL to guarantee consistency
  const cached = visionResultCache.get(photoUrl);
  if (cached) {
    console.log('[Vision Engine 2.0] Cache hit for:', photoUrl.slice(-40));
    return cached;
  }
  
  try {
    // STEP 1: Convert image to base64
    const imageBase64 = await imageToBase64(photoUrl);

    // Content-hash check: same file uploaded under a different URL still hits cache
    const { createHash } = await import('crypto');
    const contentHash = createHash('sha256').update(imageBase64).digest('hex');
    const hashCached = visionHashCache.get(contentHash);
    if (hashCached) {
      console.log('[Vision Engine 2.0] Content-hash cache hit for:', photoUrl.slice(-40));
      visionResultCache.set(photoUrl, hashCached); // also populate URL cache
      return hashCached;
    }
    
    // STEP 2: Detect item using Vision API
    const visionResult = await detectItemWithVision(imageBase64);
    
    // STEP 2.5: Apply category correction (fix AI misclassifications)
    const categoryCorrection = correctCategory(visionResult.itemName, visionResult.category);
    if (categoryCorrection.wasCorrected) {
      visionResult.category = categoryCorrection.category;
    }
    
    // STEP 2.6: Detect quantity — prefer model-provided field, fall back to string parsing
    const quantityInfo = detectQuantity(visionResult.itemName);
    const quantity = visionResult.quantity ?? quantityInfo.quantity ?? 1;

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
      const maxDim = Math.max(item.dimensions_cm.length, item.dimensions_cm.width, item.dimensions_cm.height);
      const vehicle = getVehicleRecommendationWithCategory(totalVolume, item.category, totalWeight, maxDim);
      
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
        handling_complexity: (item.handling_complexity === 'slight' ? 'low' : item.handling_complexity === 'moderate' ? 'medium' : item.handling_complexity) as 'low' | 'medium' | 'high' | 'very_high',
        insurance_level: item.insurance_level,
        confidence,
        source: 'database_match',
        matchedItem: item.item_id,
        processingTime: Date.now() - startTime,
        premiumKey: derivePremiumKey(visionResult.itemName, item.category, item.subcategory),
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
      const maxDimVision = Math.max(corrected.length_cm, corrected.width_cm, corrected.height_cm);
      const finalVehicle = getVehicleRecommendationWithCategory(totalVolume, visionResult.category, totalWeight, maxDimVision);
      
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
        premiumKey: derivePremiumKey(visionResult.itemName, visionResult.category, visionResult.subcategory),
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
    
    // Store in both caches so the same photo always returns the same result
    visionResultCache.set(photoUrl, result);
    visionHashCache.set(contentHash, result);
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
const PRICE_PER_CUFT = 0.25; // $0.25 per cubic foot

export function toIdentificationResult(v2Result: VisionEngineResult): {
  itemName: string;
  category: 'Furniture' | 'Appliance' | 'Fragile' | 'Oversized' | 'Bulky' | 'Electronics' | 'Other';
  weightKg: number;
  dimensionsLcm: number;
  dimensionsWcm: number;
  dimensionsHcm: number;
  volumeCuft: number;
  estimatedPrice: number;
  handlingComplexity: 'low' | 'medium' | 'high' | 'very_high';
  premiumKey: string | null;
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
    estimatedPrice: Math.round(v2Result.volume_ft3 * PRICE_PER_CUFT * 100) / 100,
    handlingComplexity: v2Result.handling_complexity,
    premiumKey: v2Result.premiumKey ?? null,
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
