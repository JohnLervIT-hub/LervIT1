import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import type { IdentifiedItem, InsertIdentifiedItem, InsertAiRun } from "@shared/schema";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

// Check for OpenAI API key availability
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openaiAvailable = !!OPENAI_API_KEY;

if (!openaiAvailable) {
  console.warn('[AI Identifier] OpenAI API key not configured - AI features will be disabled');
}

const openai = openaiAvailable ? new OpenAI({
  apiKey: OPENAI_API_KEY,
}) : null;

/**
 * Convert a local image file to a base64 data URL
 */
function imageToBase64DataUrl(imagePath: string): string {
  // Handle relative paths from uploads - files are in public/uploads
  let fullPath = imagePath;
  if (imagePath.startsWith('/uploads/')) {
    fullPath = path.join(process.cwd(), 'public', imagePath);
  }
  
  console.log('[AI Identifier] Reading image from:', fullPath);
  
  // Read the file and convert to base64
  const imageBuffer = fs.readFileSync(fullPath);
  const base64 = imageBuffer.toString('base64');
  
  // Determine mime type from extension
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const mimeType = mimeTypes[ext] || 'image/jpeg';
  
  console.log('[AI Identifier] Image converted to base64, size:', Math.round(base64.length / 1024), 'KB');
  
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Download image from Object Storage and convert to base64 data URL
 */
async function objectStorageImageToBase64(imagePath: string): Promise<string> {
  console.log('[AI Identifier] Downloading image from Object Storage:', imagePath);
  
  const objectStorageService = new ObjectStorageService();
  
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(imagePath);
    
    // Download the file content
    const [buffer] = await objectFile.download();
    const base64 = buffer.toString('base64');
    
    // Determine mime type from extension
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';
    
    console.log('[AI Identifier] Object Storage image converted to base64, size:', Math.round(base64.length / 1024), 'KB');
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error: any) {
    console.error('[AI Identifier] Failed to download from Object Storage:', error.message);
    throw new Error(`Failed to download image from Object Storage: ${error.message}`);
  }
}

interface ProductSpec {
  name: string;
  weight_kg?: number;
  dimensions?: {
    length_cm?: number;
    width_cm?: number;
    height_cm?: number;
  };
  material?: string;
  category?: string;
}

interface IdentificationResult {
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
}

/**
 * Use OpenAI Vision API to identify the item in a photo
 * Enhanced to get brand/model and accurate dimensions for spec lookup
 */
export async function identifyItemFromPhoto(photoUrl: string): Promise<{
  itemName: string;
  category: string;
  confidence: number;
  brand?: string;
  model?: string;
  searchQuery?: string;
  estimatedWeight?: number;
  estimatedDimensions?: { length_cm: number; width_cm: number; height_cm: number };
}> {
  const startTime = Date.now();
  
  if (!openai) {
    console.warn('[AI Identifier] OpenAI not available, returning fallback identification');
    return {
      itemName: 'Unidentified Item',
      category: 'Other',
      confidence: 0,
      estimatedWeight: 10,
      estimatedDimensions: { length_cm: 50, width_cm: 50, height_cm: 50 },
    };
  }
  
  try {
    // Convert local image to base64 data URL for OpenAI
    let imageUrl = photoUrl;
    if (photoUrl.startsWith('/objects/')) {
      console.log('[AI Identifier] Converting Object Storage image to base64...');
      imageUrl = await objectStorageImageToBase64(photoUrl);
    } else if (photoUrl.startsWith('/uploads/')) {
      console.log('[AI Identifier] Converting local image to base64...');
      imageUrl = imageToBase64DataUrl(photoUrl);
    }
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert at identifying ALL types of items for a moving company. Analyze this image carefully and identify what you see.

IDENTIFY ANY ITEM including but not limited to:
- Furniture (sofas, beds, tables, chairs, desks, dressers)
- Appliances (refrigerator, washer, dryer, microwave, oven)
- Electronics (TVs, computers, monitors, gaming consoles)
- Bags & Luggage (suitcases, duffel bags, backpacks, travel bags)
- Boxes & Containers (cardboard boxes, plastic bins, storage containers)
- Personal Items (clothing, shoes, books, toys)
- Sports & Recreation (bikes, gym equipment, sports gear)
- Kitchen Items (pots, pans, dishes, small appliances)
- Decor & Art (paintings, mirrors, lamps, rugs)

LOOK FOR:
- Brand logos/labels
- Size indicators
- Material type
- Style or model descriptors

REFERENCE DIMENSIONS:
- Large suitcase: ~75cm L x 50cm W x 30cm H, 5-8kg
- Duffel bag: ~65cm L x 35cm W x 35cm H, 2-5kg
- Backpack: ~50cm L x 30cm W x 20cm H, 1-3kg
- Medium cardboard box: ~45cm L x 45cm W x 45cm H, 5-20kg
- L-shaped sectional sofa: ~280-320cm L x 160-200cm W x 80-90cm H, 100-150kg
- 3-seat sofa: ~200-230cm L x 85-95cm W x 80-90cm H, 60-90kg
- Queen bed frame: ~160cm L x 210cm W x 40-100cm H, 40-70kg
- 65-inch TV: ~145cm L x 10cm W x 85cm H, 20-30kg
- Refrigerator: ~70-90cm L x 70-80cm W x 170-180cm H, 80-120kg

Return ONLY valid JSON:
{
  "itemName": "specific descriptive name (e.g., 'Large black rolling suitcase', 'Gray duffel bag', 'Brown cardboard moving box')",
  "category": "Furniture|Appliance|Fragile|Oversized|Bulky|Electronics|Bags|Boxes|Personal|Sports|Kitchen|Decor|Other",
  "confidence": 0.0-1.0,
  "brand": "brand if visible or null",
  "model": "model/product line if visible or null",
  "searchQuery": "best search query to find this exact product specifications online",
  "estimatedWeight": weight in kg (number),
  "estimatedDimensions": { "length_cm": number, "width_cm": number, "height_cm": number }
}`
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    let content = response.choices[0]?.message?.content || "{}";
    
    // Strip markdown code blocks if present (```json ... ```)
    content = content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    
    console.log('[AI Identifier] Parsed response:', content.substring(0, 200));
    const result = JSON.parse(content);
    
    const responseTime = Date.now() - startTime;
    
    // Log AI run for tracking
    const aiRunData: InsertAiRun = {
      provider: 'openai',
      operation: 'vision',
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      responseTime,
      status: 'success',
    };
    
    console.log('[AI Identifier] Vision detected:', result.itemName, 
      result.brand ? `(${result.brand})` : '', 
      result.estimatedDimensions ? `${result.estimatedDimensions.length_cm}x${result.estimatedDimensions.width_cm}x${result.estimatedDimensions.height_cm}cm` : '');
    
    return {
      itemName: result.itemName || 'Unknown Item',
      category: result.category || 'Other',
      confidence: result.confidence || 0.5,
      brand: result.brand || undefined,
      model: result.model || undefined,
      searchQuery: result.searchQuery || undefined,
      estimatedWeight: result.estimatedWeight || undefined,
      estimatedDimensions: result.estimatedDimensions || undefined,
    };
  } catch (error: any) {
    console.error('[AI Identifier] OpenAI Vision error:', error);
    throw new Error(`Vision API failed: ${error.message}`);
  }
}

/**
 * Search for product specifications using SerpAPI
 * Enhanced to use optimized search query and GPT for spec extraction
 */
export async function searchProductSpecs(itemName: string, searchQuery?: string): Promise<ProductSpec | null> {
  const apiKey = process.env.SERPAPI_API_KEY;
  
  if (!apiKey) {
    console.warn('[AI Identifier] SerpAPI key not configured, skipping spec lookup');
    return null;
  }
  
  try {
    // Use provided search query or generate one
    const query = searchQuery || `${itemName} specifications dimensions weight kg cm`;
    const encodedQuery = encodeURIComponent(query);
    const url = `https://serpapi.com/search.json?q=${encodedQuery}&api_key=${apiKey}&num=10`;
    
    console.log('[AI Identifier] Searching for specs:', query);
    
    const response = await fetch(url);
    const data = await response.json();
    
    // Collect all snippets for GPT analysis
    const organicResults = data.organic_results || [];
    const allSnippets: string[] = [];
    
    // First try direct regex extraction
    for (const result of organicResults) {
      const snippet = result.snippet || '';
      const title = result.title || '';
      allSnippets.push(`${title}: ${snippet}`);
      
      // Enhanced regex patterns for various formats
      // Weight patterns: "50 kg", "110 lbs", "Weight: 50kg"
      const weightPatterns = [
        /(?:weight|weighs?)[\s:]*(\d+\.?\d*)\s*(kg|lbs?|pounds?|kilograms?)/i,
        /(\d+\.?\d*)\s*(kg|lbs?)\s*(?:weight|total)/i,
        /(\d+\.?\d*)\s*(kg|lbs?|pounds?)/i,
      ];
      
      // Dimension patterns: "200 x 90 x 85 cm", "78" x 35" x 33"", "L: 200cm W: 90cm"
      const dimensionPatterns = [
        /(\d+\.?\d*)\s*(?:"|in|inches?)?\s*[x×]\s*(\d+\.?\d*)\s*(?:"|in|inches?)?\s*[x×]\s*(\d+\.?\d*)\s*("|in|inches?|cm|mm)/i,
        /(?:dimensions?)[\s:]*(\d+\.?\d*)\s*[x×]\s*(\d+\.?\d*)\s*[x×]\s*(\d+\.?\d*)\s*(cm|inches?|in|mm)/i,
        /(?:l|length)[\s:]*(\d+\.?\d*)\s*(cm|in).*?(?:w|width)[\s:]*(\d+\.?\d*)\s*(cm|in).*?(?:h|height)[\s:]*(\d+\.?\d*)\s*(cm|in)/i,
      ];
      
      let weightKg: number | undefined;
      let dimensions: { length_cm: number; width_cm: number; height_cm: number } | undefined;
      
      for (const pattern of weightPatterns) {
        const match = snippet.match(pattern);
        if (match) {
          const value = parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          weightKg = unit.includes('lb') || unit.includes('pound') ? value * 0.453592 : value;
          break;
        }
      }
      
      for (const pattern of dimensionPatterns) {
        const match = snippet.match(pattern);
        if (match) {
          const unit = match[4].toLowerCase();
          const multiplier = unit.includes('in') || unit === '"' ? 2.54 : (unit === 'mm' ? 0.1 : 1);
          dimensions = {
            length_cm: parseFloat(match[1]) * multiplier,
            width_cm: parseFloat(match[2]) * multiplier,
            height_cm: parseFloat(match[3]) * multiplier,
          };
          break;
        }
      }
      
      if (weightKg && dimensions) {
        console.log('[AI Identifier] Found exact specs from web:', weightKg, 'kg,', dimensions);
        return {
          name: itemName,
          weight_kg: weightKg,
          dimensions,
        };
      }
    }
    
    // If regex didn't find complete specs, use GPT to analyze all snippets
    if (allSnippets.length > 0) {
      console.log('[AI Identifier] Using GPT to extract specs from', allSnippets.length, 'search results');
      const specs = await extractSpecsWithGPT(itemName, allSnippets.join('\n\n'));
      if (specs && (specs.weight_kg || specs.dimensions)) {
        console.log('[AI Identifier] GPT extracted specs from web search:', specs);
        return specs;
      }
    }
    
    return null;
  } catch (error: any) {
    console.error('[AI Identifier] SerpAPI error:', error);
    return null;
  }
}

/**
 * Use GPT to extract and normalize specifications from search results
 */
async function extractSpecsWithGPT(itemName: string, searchResults: string): Promise<ProductSpec | null> {
  if (!openai) {
    console.warn('[AI Identifier] OpenAI not available for spec extraction');
    return null;
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a product specification expert. Extract exact dimensions and weight from search results. Be precise - only use values explicitly mentioned in the search results."
        },
        {
          role: "user",
          content: `Extract specifications for: ${itemName}

Search results:
${searchResults}

Find and extract EXACT weight and dimensions from the search results.
Convert all measurements to metric (kg for weight, cm for dimensions).

Return ONLY valid JSON (no markdown):
{
  "weight_kg": number or null,
  "dimensions": {
    "length_cm": number,
    "width_cm": number,
    "height_cm": number
  } or null
}`
        }
      ],
      max_tokens: 200,
    });

    let content = response.choices[0]?.message?.content || "{}";
    
    // Strip markdown code blocks if present
    content = content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    
    const parsed = JSON.parse(content);
    return {
      name: itemName,
      weight_kg: parsed.weight_kg,
      dimensions: parsed.dimensions,
    };
  } catch (error) {
    console.error('[AI Identifier] GPT spec extraction error:', error);
    return null;
  }
}

/**
 * Calculate volume in cubic feet from dimensions in cm
 */
function calculateVolumeCuft(lengthCm: number, widthCm: number, heightCm: number): number {
  const volumeCm3 = lengthCm * widthCm * heightCm;
  const volumeCuft = volumeCm3 / 28316.8; // Convert cm³ to ft³
  return Math.round(volumeCuft * 100) / 100; // Round to 2 decimals
}

/**
 * Categorize item based on specifications
 */
function categorizeItem(itemName: string, category: string, weightKg?: number, volumeCuft?: number): {
  category: IdentificationResult['category'];
  handlingComplexity: IdentificationResult['handlingComplexity'];
  vehicleType: IdentificationResult['vehicleType'];
  recommendedMovers: 1 | 2;
  insuranceLevel: IdentificationResult['insuranceLevel'];
} {
  // Normalize category
  const normalizedCategory = category.toLowerCase();
  const itemNameLower = itemName.toLowerCase();
  let finalCategory: IdentificationResult['category'] = 'Other';
  
  if (normalizedCategory.includes('furniture') || normalizedCategory.includes('sofa') || normalizedCategory.includes('bed') || normalizedCategory.includes('table') || normalizedCategory.includes('chair') || normalizedCategory.includes('desk')) {
    finalCategory = 'Furniture';
  } else if (normalizedCategory.includes('appliance') || normalizedCategory.includes('fridge') || normalizedCategory.includes('washer') || normalizedCategory.includes('dryer')) {
    finalCategory = 'Appliance';
  } else if (normalizedCategory.includes('electronics') || normalizedCategory.includes('tv') || normalizedCategory.includes('computer')) {
    finalCategory = 'Electronics';
  } else if (normalizedCategory.includes('fragile') || normalizedCategory.includes('glass') || normalizedCategory.includes('mirror')) {
    finalCategory = 'Fragile';
  } else if (normalizedCategory.includes('bag') || itemNameLower.includes('bag') || itemNameLower.includes('suitcase') || itemNameLower.includes('luggage') || itemNameLower.includes('backpack') || itemNameLower.includes('duffel')) {
    finalCategory = 'Bags' as any;
  } else if (normalizedCategory.includes('box') || itemNameLower.includes('box') || itemNameLower.includes('container') || itemNameLower.includes('bin')) {
    finalCategory = 'Boxes' as any;
  } else if (normalizedCategory.includes('personal') || normalizedCategory.includes('clothing') || normalizedCategory.includes('shoes')) {
    finalCategory = 'Personal' as any;
  } else if (normalizedCategory.includes('sport') || normalizedCategory.includes('bike') || normalizedCategory.includes('gym')) {
    finalCategory = 'Sports' as any;
  } else if (normalizedCategory.includes('kitchen') || normalizedCategory.includes('cookware')) {
    finalCategory = 'Kitchen' as any;
  } else if (normalizedCategory.includes('decor') || normalizedCategory.includes('art') || normalizedCategory.includes('lamp') || normalizedCategory.includes('rug')) {
    finalCategory = 'Decor' as any;
  }
  
  // Determine handling complexity based on weight and volume
  let handlingComplexity: IdentificationResult['handlingComplexity'] = 'low';
  let recommendedMovers: 1 | 2 = 1;
  let vehicleType: IdentificationResult['vehicleType'] = 'car';
  let insuranceLevel: IdentificationResult['insuranceLevel'] = 'standard';
  
  if (weightKg) {
    if (weightKg > 100) {
      handlingComplexity = 'very_high';
      recommendedMovers = 2;
      vehicleType = 'truck';
      insuranceLevel = 'premium';
    } else if (weightKg > 50) {
      handlingComplexity = 'high';
      recommendedMovers = 2;
      vehicleType = 'pickup';
      insuranceLevel = 'high';
    } else if (weightKg > 25) {
      handlingComplexity = 'medium';
      recommendedMovers = 1;
      vehicleType = 'van';
      insuranceLevel = 'medium';
    }
  }
  
  if (volumeCuft) {
    if (volumeCuft > 150) {
      handlingComplexity = 'very_high';
      recommendedMovers = 2;
      vehicleType = 'truck';
    } else if (volumeCuft > 50) {
      handlingComplexity = 'high';
      recommendedMovers = 2;
      vehicleType = 'pickup';
    } else if (volumeCuft > 10) {
      handlingComplexity = 'medium';
      vehicleType = 'van';
    }
  }
  
  // Fragile items always get higher insurance
  if (finalCategory === 'Fragile' || finalCategory === 'Electronics') {
    insuranceLevel = insuranceLevel === 'standard' ? 'medium' : insuranceLevel;
  }
  
  return {
    category: finalCategory,
    handlingComplexity,
    vehicleType,
    recommendedMovers,
    insuranceLevel,
  };
}

/**
 * Estimate specifications using GPT when real specs aren't available
 */
async function estimateSpecsWithGPT(itemName: string, category: string): Promise<ProductSpec> {
  if (!openai) {
    console.warn('[AI Identifier] OpenAI not available for estimation, using defaults');
    return {
      name: itemName,
      weight_kg: 10,
      dimensions: { length_cm: 50, width_cm: 50, height_cm: 50 },
    };
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a moving industry expert. Estimate typical dimensions and weight for household items."
        },
        {
          role: "user",
          content: `Estimate specifications for: ${itemName} (category: ${category})

Return ONLY valid JSON with typical/average values:
{
  "weight_kg": number,
  "dimensions": {
    "length_cm": number,
    "width_cm": number,
    "height_cm": number
  }
}`
        }
      ],
      max_tokens: 150,
    });

    let content = response.choices[0]?.message?.content || "{}";
    
    // Strip markdown code blocks if present (```json ... ```)
    content = content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    
    console.log('[AI Identifier] GPT estimation response:', content);
    const parsed = JSON.parse(content);
    
    return {
      name: itemName,
      weight_kg: parsed.weight_kg || 10,
      dimensions: parsed.dimensions || {
        length_cm: 50,
        width_cm: 50,
        height_cm: 50,
      },
    };
  } catch (error) {
    console.error('[AI Identifier] GPT estimation error:', error);
    // Fallback to default values
    return {
      name: itemName,
      weight_kg: 10,
      dimensions: {
        length_cm: 50,
        width_cm: 50,
        height_cm: 50,
      },
    };
  }
}

/**
 * Main function: Complete AI identification pipeline
 * FAST MODE: Uses Vision API estimates directly (no web search)
 * This is 3-5x faster than searching the web for specs
 */
export async function identifyAndCategorizeItem(photoUrl: string): Promise<IdentificationResult> {
  const startTime = Date.now();
  
  try {
    // Step 1: Identify item using Vision API (now includes estimates)
    const visionResult = await identifyItemFromPhoto(photoUrl);
  
  let specs: ProductSpec | null = null;
  let specSource = 'unknown';
  
  // FAST PATH: Use Vision API's estimated specs directly (skip slow web search)
  if (visionResult.estimatedDimensions && visionResult.estimatedWeight) {
    specs = {
      name: visionResult.itemName,
      weight_kg: visionResult.estimatedWeight,
      dimensions: {
        length_cm: visionResult.estimatedDimensions.length_cm,
        width_cm: visionResult.estimatedDimensions.width_cm,
        height_cm: visionResult.estimatedDimensions.height_cm,
      },
    };
    specSource = 'vision_ai';
    console.log(`[AI Identifier] ⚡ Fast path: Vision AI specs | ${specs.weight_kg}kg`);
  } else {
    // Fallback: GPT estimation (still faster than web search)
    console.log('[AI Identifier] No Vision estimates, using GPT fallback');
    specs = await estimateSpecsWithGPT(visionResult.itemName, visionResult.category);
    specSource = 'gpt_estimate';
  }
  
  // Step 5: Calculate volume
  const volumeCuft = calculateVolumeCuft(
    specs.dimensions?.length_cm || 50,
    specs.dimensions?.width_cm || 50,
    specs.dimensions?.height_cm || 50
  );
  
  // Step 6: Categorize and determine handling requirements
  const categorization = categorizeItem(
    visionResult.itemName,
    visionResult.category,
    specs.weight_kg,
    volumeCuft
  );
  
  const processingTime = Date.now() - startTime;
  console.log(`[AI Identifier] ✓ ${visionResult.itemName} | ${specs.weight_kg}kg | ${volumeCuft.toFixed(1)}ft³ | ${processingTime}ms`);
  
    return {
      itemName: visionResult.itemName,
      category: categorization.category,
      weightKg: specs.weight_kg || 10,
      dimensionsLcm: specs.dimensions?.length_cm || 50,
      dimensionsWcm: specs.dimensions?.width_cm || 50,
      dimensionsHcm: specs.dimensions?.height_cm || 50,
      volumeCuft,
      handlingComplexity: categorization.handlingComplexity,
      vehicleType: categorization.vehicleType,
      recommendedMovers: categorization.recommendedMovers,
      insuranceLevel: categorization.insuranceLevel,
      confidence: visionResult.confidence,
      sourceMetadata: JSON.stringify({
        specSource,
        brand: visionResult.brand,
        model: visionResult.model,
        visionResult,
        specs,
        searchMethod: specs ? 'serpapi' : 'gpt_estimation',
      }),
    };
  } catch (error: any) {
    console.error('[AI Identifier] Pipeline error, returning fallback:', error.message);
    
    // Return complete fallback result when pipeline fails
    return {
      itemName: 'Unidentified Item',
      category: 'Other',
      weightKg: 10,
      dimensionsLcm: 50,
      dimensionsWcm: 50,
      dimensionsHcm: 50,
      volumeCuft: 1.8,
      handlingComplexity: 'medium',
      vehicleType: 'van',
      recommendedMovers: 1,
      insuranceLevel: 'standard',
      confidence: 0,
      sourceMetadata: JSON.stringify({
        specSource: 'fallback',
        error: error.message,
      }),
    };
  }
}
