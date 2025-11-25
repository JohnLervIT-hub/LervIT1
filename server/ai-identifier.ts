import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import type { IdentifiedItem, InsertIdentifiedItem, InsertAiRun } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  
  try {
    // Convert local image to base64 data URL for OpenAI
    let imageUrl = photoUrl;
    if (photoUrl.startsWith('/uploads/')) {
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
              text: `You are an expert at identifying household items for a moving company. Analyze this image carefully.

LOOK FOR:
- Brand logos/labels (IKEA, Ashley, West Elm, Samsung, LG, etc.)
- Model names or product lines
- Size indicators (Queen, King, 65-inch, 3-seater, L-shaped, etc.)
- Material (leather, fabric, wood, metal, glass)
- Style descriptors (sectional, modular, recliner, etc.)

PROVIDE ACCURATE DIMENSIONS based on item type:
- L-shaped sectional sofa: ~280-320cm L x 160-200cm W x 80-90cm H, 100-150kg
- 3-seat sofa: ~200-230cm L x 85-95cm W x 80-90cm H, 60-90kg
- Armchair: ~80-100cm L x 80-90cm W x 85-100cm H, 20-35kg
- Queen bed frame: ~160cm L x 210cm W x 40-100cm H, 40-70kg
- 6-drawer dresser: ~140-160cm L x 45-55cm W x 80-90cm H, 60-80kg
- Dining table (6-seat): ~180cm L x 90cm W x 75cm H, 40-60kg
- 65-inch TV: ~145cm L x 10cm W x 85cm H, 20-30kg
- Refrigerator: ~70-90cm L x 70-80cm W x 170-180cm H, 80-120kg

Return ONLY valid JSON:
{
  "itemName": "detailed name with size/style (e.g., 'Gray L-shaped sectional sofa with chaise')",
  "category": "Furniture|Appliance|Fragile|Oversized|Bulky|Electronics|Other",
  "confidence": 0.0-1.0,
  "brand": "brand if visible or null",
  "model": "model/product line if visible or null",
  "searchQuery": "best search query to find this exact product specifications online (e.g., 'IKEA KIVIK sectional sofa dimensions weight')",
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
  let finalCategory: IdentificationResult['category'] = 'Other';
  
  if (normalizedCategory.includes('furniture') || normalizedCategory.includes('sofa') || normalizedCategory.includes('bed') || normalizedCategory.includes('table')) {
    finalCategory = 'Furniture';
  } else if (normalizedCategory.includes('appliance') || normalizedCategory.includes('fridge') || normalizedCategory.includes('washer') || normalizedCategory.includes('dryer')) {
    finalCategory = 'Appliance';
  } else if (normalizedCategory.includes('electronics') || normalizedCategory.includes('tv') || normalizedCategory.includes('computer')) {
    finalCategory = 'Electronics';
  } else if (normalizedCategory.includes('fragile') || normalizedCategory.includes('glass') || normalizedCategory.includes('mirror')) {
    finalCategory = 'Fragile';
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
 * Priority: Web specs > Vision API estimates > GPT estimates
 */
export async function identifyAndCategorizeItem(photoUrl: string): Promise<IdentificationResult> {
  // Step 1: Identify item using Vision API (now includes estimates and search query)
  const visionResult = await identifyItemFromPhoto(photoUrl);
  
  let specs: ProductSpec | null = null;
  let specSource = 'unknown';
  
  // Step 2: Search for REAL specifications using optimized search query
  specs = await searchProductSpecs(visionResult.itemName, visionResult.searchQuery);
  
  if (specs && specs.weight_kg && specs.dimensions) {
    specSource = 'web_search';
    console.log('[AI Identifier] ✓ Using REAL specs from web search');
  } else {
    // Step 3: Use Vision API's estimated specs if available
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
      specSource = 'vision_estimate';
      console.log('[AI Identifier] Using Vision API estimated specs:', specs.weight_kg, 'kg');
    } else {
      // Step 4: Fall back to GPT estimation
      console.log('[AI Identifier] No specs found, estimating with GPT');
      specs = await estimateSpecsWithGPT(visionResult.itemName, visionResult.category);
      specSource = 'gpt_estimate';
    }
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
  
  console.log(`[AI Identifier] Final: ${visionResult.itemName} | ${specs.weight_kg}kg | ${volumeCuft.toFixed(1)}ft³ | Source: ${specSource}`);
  
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
}
