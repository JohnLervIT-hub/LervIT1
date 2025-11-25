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
  // Handle relative paths from uploads
  let fullPath = imagePath;
  if (imagePath.startsWith('/uploads/')) {
    fullPath = path.join(process.cwd(), imagePath);
  }
  
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
 */
export async function identifyItemFromPhoto(photoUrl: string): Promise<{
  itemName: string;
  category: string;
  confidence: number;
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
              text: `Identify the main item in this image for a moving service. Provide:
1. Item name (be specific, include brand/model if visible)
2. Category (Furniture, Appliance, Fragile, Oversized, Bulky, Electronics, or Other)
3. Confidence score (0-1)

Return ONLY valid JSON with this exact structure:
{
  "itemName": "specific item name",
  "category": "category name",
  "confidence": 0.95
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
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content || "{}";
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
    
    return {
      itemName: result.itemName || 'Unknown Item',
      category: result.category || 'Other',
      confidence: result.confidence || 0.5,
    };
  } catch (error: any) {
    console.error('[AI Identifier] OpenAI Vision error:', error);
    throw new Error(`Vision API failed: ${error.message}`);
  }
}

/**
 * Search for product specifications using SerpAPI
 */
export async function searchProductSpecs(itemName: string): Promise<ProductSpec | null> {
  const apiKey = process.env.SERPAPI_API_KEY;
  
  if (!apiKey) {
    console.warn('[AI Identifier] SerpAPI key not configured, skipping spec lookup');
    return null;
  }
  
  try {
    const searchQuery = encodeURIComponent(`${itemName} specifications dimensions weight`);
    const url = `https://serpapi.com/search.json?q=${searchQuery}&api_key=${apiKey}&num=5`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    // Extract specifications from search results
    const organicResults = data.organic_results || [];
    
    // Look for product specification pages
    for (const result of organicResults) {
      const snippet = result.snippet || '';
      const title = result.title || '';
      
      // Try to extract dimensions and weight from snippets
      const weightMatch = snippet.match(/(\d+\.?\d*)\s*(kg|lbs?|pounds?)/i);
      const dimensionsMatch = snippet.match(/(\d+\.?\d*)\s*x\s*(\d+\.?\d*)\s*x\s*(\d+\.?\d*)\s*(cm|inches?|in)/i);
      
      if (weightMatch || dimensionsMatch) {
        return {
          name: itemName,
          weight_kg: weightMatch ? parseFloat(weightMatch[1]) * (weightMatch[2].toLowerCase().includes('lb') ? 0.453592 : 1) : undefined,
          dimensions: dimensionsMatch ? {
            length_cm: parseFloat(dimensionsMatch[1]) * (dimensionsMatch[4].toLowerCase().includes('in') ? 2.54 : 1),
            width_cm: parseFloat(dimensionsMatch[2]) * (dimensionsMatch[4].toLowerCase().includes('in') ? 2.54 : 1),
            height_cm: parseFloat(dimensionsMatch[3]) * (dimensionsMatch[4].toLowerCase().includes('in') ? 2.54 : 1),
          } : undefined,
        };
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
          content: "You are a product specification expert. Extract dimensions and weight from search results."
        },
        {
          role: "user",
          content: `Extract specifications for: ${itemName}

Search results: ${searchResults}

Return ONLY valid JSON:
{
  "weight_kg": number or null,
  "dimensions": {
    "length_cm": number,
    "width_cm": number,
    "height_cm": number
  } or null,
  "material": "string" or null,
  "category": "string" or null
}`
        }
      ],
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || "{}";
    return JSON.parse(content);
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

    const content = response.choices[0]?.message?.content || "{}";
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
 */
export async function identifyAndCategorizeItem(photoUrl: string): Promise<IdentificationResult> {
  // Step 1: Identify item using Vision API
  const visionResult = await identifyItemFromPhoto(photoUrl);
  
  // Step 2: Search for real specifications
  let specs = await searchProductSpecs(visionResult.itemName);
  
  // Step 3: If no specs found, estimate using GPT
  if (!specs || !specs.weight_kg || !specs.dimensions) {
    console.log('[AI Identifier] No real specs found, estimating with GPT');
    specs = await estimateSpecsWithGPT(visionResult.itemName, visionResult.category);
  }
  
  // Step 4: Calculate volume
  const volumeCuft = calculateVolumeCuft(
    specs.dimensions?.length_cm || 50,
    specs.dimensions?.width_cm || 50,
    specs.dimensions?.height_cm || 50
  );
  
  // Step 5: Categorize and determine handling requirements
  const categorization = categorizeItem(
    visionResult.itemName,
    visionResult.category,
    specs.weight_kg,
    volumeCuft
  );
  
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
      visionResult,
      specs,
      searchMethod: specs ? 'serpapi' : 'gpt_estimation',
    }),
  };
}
