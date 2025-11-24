export type ItemCategory = "furniture" | "appliance" | "box" | "heavy_item" | "fragile" | "other";
export type SizeClassification = "small" | "medium" | "large" | "XL";

export interface StandardItem {
  name: string;
  category: ItemCategory;
  size: SizeClassification;
  weightLbs: number;
  cubicFeet: number;
  moversNeeded: 1 | 2;
  difficultyLevel: "easy" | "moderate" | "difficult" | "very_difficult";
  requiresSpecialCare: boolean;
  keywords: string[]; // For matching AI detection
}

export const STANDARD_ITEMS: StandardItem[] = [
  // FURNITURE - Seating
  {
    name: "Dining chair",
    category: "furniture",
    size: "small",
    weightLbs: 25,
    cubicFeet: 8,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["chair", "dining chair", "kitchen chair"]
  },
  {
    name: "Office chair",
    category: "furniture",
    size: "small",
    weightLbs: 35,
    cubicFeet: 12,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["office chair", "desk chair", "swivel chair"]
  },
  {
    name: "Armchair",
    category: "furniture",
    size: "medium",
    weightLbs: 75,
    cubicFeet: 30,
    moversNeeded: 1,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["armchair", "accent chair", "lounge chair"]
  },
  {
    name: "Recliner",
    category: "furniture",
    size: "medium",
    weightLbs: 95,
    cubicFeet: 40,
    moversNeeded: 1,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["recliner", "reclining chair", "lazy boy"]
  },
  {
    name: "Loveseat",
    category: "furniture",
    size: "large",
    weightLbs: 150,
    cubicFeet: 60,
    moversNeeded: 2,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["loveseat", "love seat", "2-seater sofa"]
  },
  {
    name: "Sofa (3-seater)",
    category: "furniture",
    size: "large",
    weightLbs: 200,
    cubicFeet: 80,
    moversNeeded: 2,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["sofa", "couch", "3-seater", "three seater"]
  },
  {
    name: "Sectional sofa",
    category: "furniture",
    size: "XL",
    weightLbs: 350,
    cubicFeet: 150,
    moversNeeded: 2,
    difficultyLevel: "difficult",
    requiresSpecialCare: true,
    keywords: ["sectional", "sectional sofa", "l-shaped sofa", "corner sofa"]
  },

  // FURNITURE - Tables
  {
    name: "Coffee table",
    category: "furniture",
    size: "small",
    weightLbs: 40,
    cubicFeet: 15,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["coffee table", "living room table", "center table"]
  },
  {
    name: "End table / Nightstand",
    category: "furniture",
    size: "small",
    weightLbs: 30,
    cubicFeet: 10,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["end table", "side table", "nightstand", "bedside table"]
  },
  {
    name: "Dining table (4-seater)",
    category: "furniture",
    size: "medium",
    weightLbs: 100,
    cubicFeet: 35,
    moversNeeded: 2,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["dining table", "4-seater", "kitchen table", "small dining table"]
  },
  {
    name: "Dining table (6-seater)",
    category: "furniture",
    size: "large",
    weightLbs: 150,
    cubicFeet: 50,
    moversNeeded: 2,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["dining table", "6-seater", "large dining table"]
  },
  {
    name: "Dining table (8+ seater)",
    category: "furniture",
    size: "XL",
    weightLbs: 250,
    cubicFeet: 80,
    moversNeeded: 2,
    difficultyLevel: "difficult",
    requiresSpecialCare: false,
    keywords: ["dining table", "8-seater", "large table", "banquet table"]
  },
  {
    name: "Desk",
    category: "furniture",
    size: "medium",
    weightLbs: 80,
    cubicFeet: 30,
    moversNeeded: 1,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["desk", "office desk", "computer desk", "writing desk"]
  },

  // FURNITURE - Beds
  {
    name: "Twin bed frame",
    category: "furniture",
    size: "medium",
    weightLbs: 60,
    cubicFeet: 25,
    moversNeeded: 1,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["twin bed", "single bed", "twin frame"]
  },
  {
    name: "Twin mattress",
    category: "furniture",
    size: "medium",
    weightLbs: 40,
    cubicFeet: 30,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["twin mattress", "single mattress"]
  },
  {
    name: "Full/Double bed frame",
    category: "furniture",
    size: "medium",
    weightLbs: 80,
    cubicFeet: 35,
    moversNeeded: 2,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["full bed", "double bed", "full frame", "double frame"]
  },
  {
    name: "Full/Double mattress",
    category: "furniture",
    size: "medium",
    weightLbs: 55,
    cubicFeet: 40,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["full mattress", "double mattress"]
  },
  {
    name: "Queen bed frame",
    category: "furniture",
    size: "large",
    weightLbs: 100,
    cubicFeet: 45,
    moversNeeded: 2,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["queen bed", "queen frame"]
  },
  {
    name: "Queen mattress",
    category: "furniture",
    size: "large",
    weightLbs: 70,
    cubicFeet: 50,
    moversNeeded: 2,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["queen mattress"]
  },
  {
    name: "King bed frame",
    category: "furniture",
    size: "XL",
    weightLbs: 140,
    cubicFeet: 60,
    moversNeeded: 2,
    difficultyLevel: "difficult",
    requiresSpecialCare: false,
    keywords: ["king bed", "king frame", "california king"]
  },
  {
    name: "King mattress",
    category: "furniture",
    size: "XL",
    weightLbs: 90,
    cubicFeet: 65,
    moversNeeded: 2,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["king mattress", "california king mattress"]
  },

  // FURNITURE - Storage
  {
    name: "Bookshelf (small)",
    category: "furniture",
    size: "small",
    weightLbs: 50,
    cubicFeet: 20,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["bookshelf", "small bookcase", "shelf"]
  },
  {
    name: "Bookshelf (large)",
    category: "furniture",
    size: "medium",
    weightLbs: 100,
    cubicFeet: 40,
    moversNeeded: 2,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["large bookshelf", "bookcase", "tall shelf"]
  },
  {
    name: "Dresser (3-4 drawers)",
    category: "furniture",
    size: "medium",
    weightLbs: 120,
    cubicFeet: 35,
    moversNeeded: 2,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["dresser", "chest of drawers", "drawer"]
  },
  {
    name: "Dresser (6+ drawers)",
    category: "furniture",
    size: "large",
    weightLbs: 180,
    cubicFeet: 50,
    moversNeeded: 2,
    difficultyLevel: "difficult",
    requiresSpecialCare: false,
    keywords: ["large dresser", "tall dresser", "wardrobe dresser"]
  },
  {
    name: "Wardrobe / Armoire",
    category: "furniture",
    size: "XL",
    weightLbs: 250,
    cubicFeet: 80,
    moversNeeded: 2,
    difficultyLevel: "difficult",
    requiresSpecialCare: true,
    keywords: ["wardrobe", "armoire", "closet"]
  },

  // APPLIANCES - Kitchen
  {
    name: "Microwave",
    category: "appliance",
    size: "small",
    weightLbs: 40,
    cubicFeet: 3,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["microwave", "microwave oven"]
  },
  {
    name: "Mini fridge",
    category: "appliance",
    size: "small",
    weightLbs: 60,
    cubicFeet: 10,
    moversNeeded: 1,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["mini fridge", "small fridge", "compact fridge", "dorm fridge"]
  },
  {
    name: "Standard refrigerator",
    category: "appliance",
    size: "XL",
    weightLbs: 250,
    cubicFeet: 80,
    moversNeeded: 2,
    difficultyLevel: "very_difficult",
    requiresSpecialCare: true,
    keywords: ["refrigerator", "fridge", "full size fridge"]
  },
  {
    name: "Stove / Range",
    category: "appliance",
    size: "XL",
    weightLbs: 200,
    cubicFeet: 40,
    moversNeeded: 2,
    difficultyLevel: "very_difficult",
    requiresSpecialCare: true,
    keywords: ["stove", "range", "oven", "cooktop"]
  },
  {
    name: "Dishwasher",
    category: "appliance",
    size: "large",
    weightLbs: 150,
    cubicFeet: 30,
    moversNeeded: 2,
    difficultyLevel: "difficult",
    requiresSpecialCare: true,
    keywords: ["dishwasher"]
  },

  // APPLIANCES - Laundry
  {
    name: "Washing machine",
    category: "appliance",
    size: "XL",
    weightLbs: 200,
    cubicFeet: 35,
    moversNeeded: 2,
    difficultyLevel: "very_difficult",
    requiresSpecialCare: true,
    keywords: ["washing machine", "washer", "laundry machine"]
  },
  {
    name: "Dryer",
    category: "appliance",
    size: "XL",
    weightLbs: 180,
    cubicFeet: 35,
    moversNeeded: 2,
    difficultyLevel: "very_difficult",
    requiresSpecialCare: true,
    keywords: ["dryer", "clothes dryer", "laundry dryer"]
  },

  // BOXES & CONTAINERS
  {
    name: "Small box (1.5 cu ft)",
    category: "box",
    size: "small",
    weightLbs: 30,
    cubicFeet: 1.5,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["small box", "book box", "1.5"]
  },
  {
    name: "Medium box (3 cu ft)",
    category: "box",
    size: "small",
    weightLbs: 40,
    cubicFeet: 3,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["medium box", "3 cu ft", "standard box"]
  },
  {
    name: "Large box (4.5 cu ft)",
    category: "box",
    size: "medium",
    weightLbs: 50,
    cubicFeet: 4.5,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["large box", "4.5 cu ft", "big box"]
  },
  {
    name: "Wardrobe box",
    category: "box",
    size: "large",
    weightLbs: 60,
    cubicFeet: 10,
    moversNeeded: 1,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["wardrobe box", "hanging box", "closet box"]
  },

  // HEAVY ITEMS / GYM EQUIPMENT
  {
    name: "Treadmill",
    category: "heavy_item",
    size: "XL",
    weightLbs: 250,
    cubicFeet: 60,
    moversNeeded: 2,
    difficultyLevel: "very_difficult",
    requiresSpecialCare: true,
    keywords: ["treadmill", "running machine"]
  },
  {
    name: "Elliptical machine",
    category: "heavy_item",
    size: "XL",
    weightLbs: 200,
    cubicFeet: 55,
    moversNeeded: 2,
    difficultyLevel: "very_difficult",
    requiresSpecialCare: true,
    keywords: ["elliptical", "elliptical machine"]
  },
  {
    name: "Weight bench",
    category: "heavy_item",
    size: "medium",
    weightLbs: 80,
    cubicFeet: 25,
    moversNeeded: 1,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["weight bench", "bench press", "workout bench"]
  },
  {
    name: "Piano (upright)",
    category: "heavy_item",
    size: "XL",
    weightLbs: 500,
    cubicFeet: 100,
    moversNeeded: 2,
    difficultyLevel: "very_difficult",
    requiresSpecialCare: true,
    keywords: ["piano", "upright piano"]
  },
  {
    name: "Safe",
    category: "heavy_item",
    size: "medium",
    weightLbs: 300,
    cubicFeet: 8,
    moversNeeded: 2,
    difficultyLevel: "very_difficult",
    requiresSpecialCare: true,
    keywords: ["safe", "vault", "gun safe"]
  },

  // FRAGILE ITEMS
  {
    name: "TV (32-42 inch)",
    category: "fragile",
    size: "medium",
    weightLbs: 25,
    cubicFeet: 10,
    moversNeeded: 1,
    difficultyLevel: "moderate",
    requiresSpecialCare: true,
    keywords: ["tv", "television", "32 inch", "40 inch", "small tv"]
  },
  {
    name: "TV (50-65 inch)",
    category: "fragile",
    size: "large",
    weightLbs: 50,
    cubicFeet: 20,
    moversNeeded: 2,
    difficultyLevel: "difficult",
    requiresSpecialCare: true,
    keywords: ["tv", "television", "50 inch", "55 inch", "60 inch", "65 inch", "large tv"]
  },
  {
    name: "Mirror (wall)",
    category: "fragile",
    size: "medium",
    weightLbs: 20,
    cubicFeet: 5,
    moversNeeded: 1,
    difficultyLevel: "moderate",
    requiresSpecialCare: true,
    keywords: ["mirror", "wall mirror", "hanging mirror"]
  },
  {
    name: "Lamp (table)",
    category: "fragile",
    size: "small",
    weightLbs: 8,
    cubicFeet: 3,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: true,
    keywords: ["lamp", "table lamp", "desk lamp"]
  },
  {
    name: "Lamp (floor)",
    category: "fragile",
    size: "small",
    weightLbs: 15,
    cubicFeet: 6,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: true,
    keywords: ["floor lamp", "standing lamp", "tall lamp"]
  },

  // OTHER - Personal Items
  {
    name: "Suitcase / Luggage",
    category: "other",
    size: "small",
    weightLbs: 20,
    cubicFeet: 4,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["suitcase", "luggage", "travel bag", "roller bag"]
  },
  {
    name: "Backpack / Bag",
    category: "other",
    size: "small",
    weightLbs: 10,
    cubicFeet: 2,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["backpack", "bag", "duffel", "gym bag"]
  },
  {
    name: "Shoes (pair)",
    category: "other",
    size: "small",
    weightLbs: 2,
    cubicFeet: 0.5,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["shoes", "sneakers", "boots", "footwear"]
  },
  {
    name: "Bicycle",
    category: "other",
    size: "medium",
    weightLbs: 30,
    cubicFeet: 15,
    moversNeeded: 1,
    difficultyLevel: "moderate",
    requiresSpecialCare: false,
    keywords: ["bicycle", "bike", "mountain bike", "road bike"]
  },
  {
    name: "Mattress topper / Rug",
    category: "other",
    size: "medium",
    weightLbs: 15,
    cubicFeet: 8,
    moversNeeded: 1,
    difficultyLevel: "easy",
    requiresSpecialCare: false,
    keywords: ["rug", "carpet", "mat", "mattress topper", "area rug"]
  }
];

/**
 * Find best matching standard item based on detected item name and optional size
 */
export function findStandardItem(
  detectedName: string,
  sizeHint?: SizeClassification
): StandardItem | null {
  const normalized = detectedName.toLowerCase().trim();
  
  // First pass: Look for exact keyword matches
  for (const item of STANDARD_ITEMS) {
    for (const keyword of item.keywords) {
      if (normalized === keyword.toLowerCase() || 
          normalized.includes(keyword.toLowerCase())) {
        // If size hint provided, prefer matching size
        if (sizeHint && item.size === sizeHint) {
          return item;
        }
        // Otherwise return first match
        if (!sizeHint) {
          return item;
        }
      }
    }
  }
  
  // Second pass: If size hint provided but no exact match, find any match
  if (sizeHint) {
    for (const item of STANDARD_ITEMS) {
      for (const keyword of item.keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          return item;
        }
      }
    }
  }
  
  // No match found
  return null;
}

/**
 * Get alternative suggestions for uncertain detections
 */
export function getSuggestions(
  detectedName: string,
  category?: ItemCategory,
  maxSuggestions: number = 3
): StandardItem[] {
  const normalized = detectedName.toLowerCase().trim();
  const suggestions: { item: StandardItem; score: number }[] = [];
  
  for (const item of STANDARD_ITEMS) {
    let score = 0;
    
    // Category match bonus
    if (category && item.category === category) {
      score += 10;
    }
    
    // Keyword matching
    for (const keyword of item.keywords) {
      if (normalized.includes(keyword.toLowerCase()) || 
          keyword.toLowerCase().includes(normalized)) {
        score += 5;
      }
    }
    
    // Word overlap
    const detectedWords = normalized.split(/\s+/);
    const itemWords = item.name.toLowerCase().split(/\s+/);
    for (const word of detectedWords) {
      if (itemWords.includes(word)) {
        score += 2;
      }
    }
    
    if (score > 0) {
      suggestions.push({ item, score });
    }
  }
  
  // Sort by score descending and return top N
  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions)
    .map(s => s.item);
}
