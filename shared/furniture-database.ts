/**
 * LervIT Vision Engine 2.0 - Ground-Truth Furniture Database (Layer 1)
 * 
 * This database contains verified furniture specifications for stable, consistent predictions.
 * Items with high similarity matches bypass estimation and use these exact values.
 */

export interface FurnitureItem {
  item_id: string;
  name: string;
  category: FurnitureCategory;
  subcategory: string;
  keywords: string[];  // Keywords for matching
  dimensions_cm: {
    length: number;
    width: number;
    height: number;
  };
  volume_ft3: number;
  weight_kg: number;
  load_size: LoadSizeCategory;
  vehicle: VehicleType;
  movers_required: 1 | 2;
  handling_complexity: 'low' | 'medium' | 'high' | 'very_high';
  insurance_level: 'standard' | 'medium' | 'high' | 'premium';
}

export type FurnitureCategory = 
  | 'Bed'
  | 'Sofa'
  | 'Table'
  | 'Chair'
  | 'Dresser'
  | 'Appliance'
  | 'Electronics'
  | 'Storage'
  | 'Outdoor'
  | 'Luggage'
  | 'Other';

/**
 * Load size categories for pricing and display
 * NOTE: These map to vehicle classes in pricing.ts:
 *   - boxes/small: 0-20 ft³    → Class A (SUV) - boxes, small items, single chair
 *   - medium:      21-165 ft³  → Class C (Cargo Van) - sofa, mattress, bedroom set
 *   - large:       166-300 ft³ → Class D (Pickup Truck / Small Moving Truck)
 *   - apartment:   >300 ft³    → Class E (Large Moving Truck) - full move
 */
export type LoadSizeCategory = 'boxes' | 'small' | 'medium' | 'large' | 'apartment';
export type VehicleType = 'car' | 'van' | 'pickup' | 'truck';

/**
 * Calculate volume in cubic feet from dimensions in cm
 */
function calcVolume(l: number, w: number, h: number): number {
  const volumeCm3 = l * w * h;
  const volumeFt3 = volumeCm3 / 28316.8;
  return Math.round(volumeFt3 * 100) / 100;
}

/**
 * Ground-Truth Furniture Database
 * Contains verified specifications for common furniture items
 */
export const FURNITURE_DATABASE: FurnitureItem[] = [
  // ===== BEDS =====
  {
    item_id: 'BED_TWIN_001',
    name: 'Twin bed frame (standard)',
    category: 'Bed',
    subcategory: 'Twin',
    keywords: ['twin', 'single', 'bed', 'frame', 'mattress'],
    dimensions_cm: { length: 191, width: 99, height: 40 },
    volume_ft3: calcVolume(191, 99, 40),
    weight_kg: 35,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },
  {
    item_id: 'BED_TWIN_STORAGE_001',
    name: 'Twin bed frame with storage drawers',
    category: 'Bed',
    subcategory: 'Twin',
    keywords: ['twin', 'single', 'bed', 'storage', 'drawers', 'captain'],
    dimensions_cm: { length: 191, width: 99, height: 43 },
    volume_ft3: calcVolume(191, 99, 43),
    weight_kg: 55,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },
  {
    item_id: 'BED_FULL_001',
    name: 'Full/Double bed frame',
    category: 'Bed',
    subcategory: 'Full',
    keywords: ['full', 'double', 'bed', 'frame'],
    dimensions_cm: { length: 191, width: 137, height: 40 },
    volume_ft3: calcVolume(191, 137, 40),
    weight_kg: 45,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },
  {
    item_id: 'BED_QUEEN_001',
    name: 'Queen bed frame',
    category: 'Bed',
    subcategory: 'Queen',
    keywords: ['queen', 'bed', 'frame'],
    dimensions_cm: { length: 203, width: 152, height: 40 },
    volume_ft3: calcVolume(203, 152, 40),
    weight_kg: 55,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'BED_QUEEN_PLATFORM_001',
    name: 'Queen platform bed with headboard',
    category: 'Bed',
    subcategory: 'Queen',
    keywords: ['queen', 'platform', 'bed', 'headboard'],
    dimensions_cm: { length: 210, width: 165, height: 110 },
    volume_ft3: calcVolume(210, 165, 110),
    weight_kg: 75,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'BED_KING_001',
    name: 'King bed frame',
    category: 'Bed',
    subcategory: 'King',
    keywords: ['king', 'bed', 'frame', 'california'],
    dimensions_cm: { length: 203, width: 193, height: 40 },
    volume_ft3: calcVolume(203, 193, 40),
    weight_kg: 70,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'BED_BUNK_001',
    name: 'Bunk bed (twin over twin)',
    category: 'Bed',
    subcategory: 'Bunk',
    keywords: ['bunk', 'bed', 'twin', 'kids', 'children'],
    dimensions_cm: { length: 200, width: 100, height: 170 },
    volume_ft3: calcVolume(200, 100, 170),
    weight_kg: 80,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'BED_CRIB_001',
    name: 'Crib / Toddler bed',
    category: 'Bed',
    subcategory: 'Crib',
    keywords: ['crib', 'toddler', 'baby', 'bed', 'infant', 'nursery'],
    dimensions_cm: { length: 130, width: 70, height: 100 },
    volume_ft3: calcVolume(130, 70, 100),
    weight_kg: 20,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },
  {
    item_id: 'BED_DAYBED_001',
    name: 'Daybed with trundle',
    category: 'Bed',
    subcategory: 'Daybed',
    keywords: ['daybed', 'trundle', 'bed', 'guest', 'pull-out'],
    dimensions_cm: { length: 200, width: 100, height: 90 },
    volume_ft3: calcVolume(200, 100, 90),
    weight_kg: 55,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },

  // ===== SOFAS =====
  {
    item_id: 'SOFA_2SEAT_001',
    name: '2-seater loveseat sofa',
    category: 'Sofa',
    subcategory: 'Loveseat',
    keywords: ['loveseat', '2-seater', 'two', 'sofa', 'couch', 'small'],
    dimensions_cm: { length: 150, width: 85, height: 85 },
    volume_ft3: calcVolume(150, 85, 85),
    weight_kg: 45,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'medium',
  },
  {
    item_id: 'SOFA_3SEAT_001',
    name: '3-seater sofa',
    category: 'Sofa',
    subcategory: '3-Seater',
    keywords: ['3-seater', 'three', 'sofa', 'couch', 'standard'],
    dimensions_cm: { length: 210, width: 90, height: 85 },
    volume_ft3: calcVolume(210, 90, 85),
    weight_kg: 70,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'SOFA_SECTIONAL_L_SM_001',
    name: 'Small L-shaped sectional sofa (2-piece, apartment-size)',
    category: 'Sofa',
    subcategory: 'Sectional',
    keywords: ['l-shaped', 'sectional', 'sofa', 'couch', 'corner', 'small', 'compact', 'apartment', '2-piece', 'two-piece', 'loveseat-chaise'],
    dimensions_cm: { length: 230, width: 150, height: 85 },
    volume_ft3: calcVolume(230, 150, 85),
    weight_kg: 70,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'SOFA_SECTIONAL_L_MD_001',
    name: 'Medium L-shaped sectional sofa (3-piece, standard)',
    category: 'Sofa',
    subcategory: 'Sectional',
    keywords: ['l-shaped', 'sectional', 'sofa', 'couch', 'corner', 'chaise', 'medium', 'standard', '3-piece', 'three-piece'],
    dimensions_cm: { length: 300, width: 180, height: 85 },
    volume_ft3: calcVolume(300, 180, 85),
    weight_kg: 120,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'SOFA_SECTIONAL_L_LG_001',
    name: 'Large L-shaped sectional sofa (4-5 piece, deep-seat, oversized)',
    category: 'Sofa',
    subcategory: 'Sectional',
    keywords: ['l-shaped', 'sectional', 'sofa', 'couch', 'corner', 'chaise', 'large', 'oversized', 'deep', '4-piece', '5-piece', 'modular', 'wide', 'deep-seat'],
    dimensions_cm: { length: 370, width: 220, height: 90 },
    volume_ft3: calcVolume(370, 220, 90),
    weight_kg: 170,
    load_size: 'large',
    vehicle: 'truck',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'SOFA_SECTIONAL_U_SM_001',
    name: 'Small U-shaped sectional sofa (compact, 3-piece)',
    category: 'Sofa',
    subcategory: 'Sectional',
    keywords: ['u-shaped', 'sectional', 'sofa', 'modular', 'small', 'compact', '3-piece', 'u-shape'],
    dimensions_cm: { length: 280, width: 200, height: 85 },
    volume_ft3: calcVolume(280, 200, 85),
    weight_kg: 130,
    load_size: 'large',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'SOFA_SECTIONAL_U_MD_001',
    name: 'Medium U-shaped sectional sofa (standard, 4-5 piece)',
    category: 'Sofa',
    subcategory: 'Sectional',
    keywords: ['u-shaped', 'sectional', 'sofa', 'modular', 'medium', 'standard', '4-piece', '5-piece', 'u-shape'],
    dimensions_cm: { length: 350, width: 250, height: 85 },
    volume_ft3: calcVolume(350, 250, 85),
    weight_kg: 180,
    load_size: 'large',
    vehicle: 'truck',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'SOFA_SECTIONAL_U_LG_001',
    name: 'Large U-shaped sectional sofa (oversized, 6+ piece)',
    category: 'Sofa',
    subcategory: 'Sectional',
    keywords: ['u-shaped', 'sectional', 'sofa', 'modular', 'large', 'oversized', '6-piece', 'theater', 'pit', 'u-shape', 'deep-seat'],
    dimensions_cm: { length: 420, width: 300, height: 90 },
    volume_ft3: calcVolume(420, 300, 90),
    weight_kg: 240,
    load_size: 'apartment',
    vehicle: 'truck',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'SOFA_BED_TWIN_001',
    name: 'Twin sofa bed (loveseat sleeper, pull-out twin)',
    category: 'Sofa',
    subcategory: 'Sofa Bed',
    keywords: ['sofa bed', 'sleeper', 'twin', 'loveseat', 'pull-out', 'pullout', 'convertible', 'small', 'compact', 'guest', 'fold-out'],
    dimensions_cm: { length: 170, width: 90, height: 85 },
    volume_ft3: calcVolume(170, 90, 85),
    weight_kg: 55,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'SOFA_BED_FULL_001',
    name: 'Full/Double sofa bed (3-seat sleeper, pull-out double)',
    category: 'Sofa',
    subcategory: 'Sofa Bed',
    keywords: ['sofa bed', 'sleeper', 'full', 'double', '3-seat', 'pull-out', 'pullout', 'convertible', 'fold-out', 'standard'],
    dimensions_cm: { length: 200, width: 95, height: 85 },
    volume_ft3: calcVolume(200, 95, 85),
    weight_kg: 75,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'SOFA_BED_QUEEN_001',
    name: 'Queen sofa bed (large sleeper, pull-out queen)',
    category: 'Sofa',
    subcategory: 'Sofa Bed',
    keywords: ['sofa bed', 'sleeper', 'queen', 'large', 'pull-out', 'pullout', 'convertible', 'fold-out', 'heavy', 'metal-frame'],
    dimensions_cm: { length: 230, width: 100, height: 90 },
    volume_ft3: calcVolume(230, 100, 90),
    weight_kg: 95,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'SOFA_BED_SECTIONAL_SM_001',
    name: 'Small sectional sofa bed (2-piece L-shaped with pull-out sleeper)',
    category: 'Sofa',
    subcategory: 'Sofa Bed',
    keywords: ['sectional', 'sofa bed', 'sleeper', 'l-shaped', 'pull-out', 'pullout', 'storage', 'small', '2-piece', 'convertible', 'chaise', 'corner'],
    dimensions_cm: { length: 250, width: 170, height: 85 },
    volume_ft3: calcVolume(250, 170, 85),
    weight_kg: 110,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'SOFA_BED_SECTIONAL_MD_001',
    name: 'Medium sectional sofa bed (3-piece L-shaped with pull-out sleeper and storage)',
    category: 'Sofa',
    subcategory: 'Sofa Bed',
    keywords: ['sectional', 'sofa bed', 'sleeper', 'l-shaped', 'pull-out', 'pullout', 'storage', 'medium', '3-piece', 'convertible', 'chaise', 'corner', 'deep-seat', 'heavy'],
    dimensions_cm: { length: 290, width: 200, height: 90 },
    volume_ft3: calcVolume(290, 200, 90),
    weight_kg: 145,
    load_size: 'large',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'SOFA_BED_SECTIONAL_LG_001',
    name: 'Large sectional sofa bed (4+ piece L/U-shaped with pull-out sleeper and storage)',
    category: 'Sofa',
    subcategory: 'Sofa Bed',
    keywords: ['sectional', 'sofa bed', 'sleeper', 'l-shaped', 'u-shaped', 'pull-out', 'pullout', 'storage', 'large', 'oversized', '4-piece', '5-piece', 'convertible', 'chaise', 'corner', 'deep-seat', 'heavy', 'modular'],
    dimensions_cm: { length: 340, width: 220, height: 90 },
    volume_ft3: calcVolume(340, 220, 90),
    weight_kg: 180,
    load_size: 'large',
    vehicle: 'truck',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'SOFA_RECLINER_001',
    name: 'Recliner sofa (3-seat)',
    category: 'Sofa',
    subcategory: 'Recliner',
    keywords: ['recliner', 'reclining', 'sofa', 'lazy', 'electric', 'power'],
    dimensions_cm: { length: 230, width: 100, height: 100 },
    volume_ft3: calcVolume(230, 100, 100),
    weight_kg: 110,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'ARMCHAIR_001',
    name: 'Armchair / Accent chair',
    category: 'Sofa',
    subcategory: 'Armchair',
    keywords: ['armchair', 'accent', 'chair', 'single', 'living room'],
    dimensions_cm: { length: 85, width: 85, height: 90 },
    volume_ft3: calcVolume(85, 85, 90),
    weight_kg: 30,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'RECLINER_SINGLE_001',
    name: 'Single recliner chair',
    category: 'Sofa',
    subcategory: 'Recliner',
    keywords: ['recliner', 'chair', 'single', 'lazy boy', 'lazyboy'],
    dimensions_cm: { length: 90, width: 85, height: 100 },
    volume_ft3: calcVolume(90, 85, 100),
    weight_kg: 45,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'medium',
  },
  
  // ===== TABLES =====
  {
    item_id: 'TABLE_DINING_4_001',
    name: 'Dining table (4-person)',
    category: 'Table',
    subcategory: 'Dining',
    keywords: ['dining', 'table', '4-person', 'four', 'kitchen'],
    dimensions_cm: { length: 120, width: 75, height: 75 },
    volume_ft3: calcVolume(120, 75, 75),
    weight_kg: 35,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'medium',
  },
  {
    item_id: 'TABLE_DINING_6_001',
    name: 'Dining table (6-person)',
    category: 'Table',
    subcategory: 'Dining',
    keywords: ['dining', 'table', '6-person', 'six', 'large'],
    dimensions_cm: { length: 180, width: 90, height: 75 },
    volume_ft3: calcVolume(180, 90, 75),
    weight_kg: 50,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'TABLE_DINING_8_001',
    name: 'Dining table (8-person)',
    category: 'Table',
    subcategory: 'Dining',
    keywords: ['dining', 'table', '8-person', 'eight', 'extendable', 'extension'],
    dimensions_cm: { length: 240, width: 100, height: 75 },
    volume_ft3: calcVolume(240, 100, 75),
    weight_kg: 70,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'TABLE_COFFEE_001',
    name: 'Coffee table',
    category: 'Table',
    subcategory: 'Coffee',
    keywords: ['coffee', 'table', 'living room', 'center'],
    dimensions_cm: { length: 120, width: 60, height: 45 },
    volume_ft3: calcVolume(120, 60, 45),
    weight_kg: 25,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'TABLE_SIDE_001',
    name: 'Side table / End table',
    category: 'Table',
    subcategory: 'Side',
    keywords: ['side', 'end', 'table', 'nightstand', 'lamp'],
    dimensions_cm: { length: 50, width: 50, height: 55 },
    volume_ft3: calcVolume(50, 50, 55),
    weight_kg: 12,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'TABLE_CONSOLE_001',
    name: 'Console table / Entry table',
    category: 'Table',
    subcategory: 'Console',
    keywords: ['console', 'entry', 'hallway', 'table', 'narrow'],
    dimensions_cm: { length: 120, width: 35, height: 80 },
    volume_ft3: calcVolume(120, 35, 80),
    weight_kg: 20,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'DESK_OFFICE_001',
    name: 'Office desk (standard)',
    category: 'Table',
    subcategory: 'Desk',
    keywords: ['desk', 'office', 'computer', 'work', 'writing'],
    dimensions_cm: { length: 150, width: 75, height: 75 },
    volume_ft3: calcVolume(150, 75, 75),
    weight_kg: 40,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },
  {
    item_id: 'DESK_LSHAPE_001',
    name: 'L-shaped desk',
    category: 'Table',
    subcategory: 'Desk',
    keywords: ['l-shaped', 'corner', 'desk', 'office', 'executive'],
    dimensions_cm: { length: 180, width: 150, height: 75 },
    volume_ft3: calcVolume(180, 150, 75),
    weight_kg: 65,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'DESK_STANDING_001',
    name: 'Standing desk (electric)',
    category: 'Table',
    subcategory: 'Desk',
    keywords: ['standing', 'adjustable', 'electric', 'desk', 'sit-stand'],
    dimensions_cm: { length: 150, width: 75, height: 125 },
    volume_ft3: calcVolume(150, 75, 125),
    weight_kg: 55,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'high',
  },
  
  // ===== CHAIRS =====
  {
    item_id: 'CHAIR_DINING_001',
    name: 'Dining chair',
    category: 'Chair',
    subcategory: 'Dining',
    keywords: ['dining', 'chair', 'kitchen', 'seat'],
    dimensions_cm: { length: 45, width: 50, height: 90 },
    volume_ft3: calcVolume(45, 50, 90),
    weight_kg: 8,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'CHAIR_OFFICE_001',
    name: 'Office chair (ergonomic)',
    category: 'Chair',
    subcategory: 'Office',
    keywords: ['office', 'chair', 'ergonomic', 'computer', 'swivel'],
    dimensions_cm: { length: 65, width: 65, height: 110 },
    volume_ft3: calcVolume(65, 65, 110),
    weight_kg: 18,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'CHAIR_GAMING_001',
    name: 'Gaming chair',
    category: 'Chair',
    subcategory: 'Gaming',
    keywords: ['gaming', 'chair', 'racing', 'computer', 'ergonomic'],
    dimensions_cm: { length: 70, width: 70, height: 130 },
    volume_ft3: calcVolume(70, 70, 130),
    weight_kg: 25,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'CHAIR_ACCENT_001',
    name: 'Upholstered accent chair',
    category: 'Chair',
    subcategory: 'Accent',
    keywords: ['accent', 'chair', 'upholstered', 'living room', 'arm chair', 'armchair', 'lounge'],
    dimensions_cm: { length: 75, width: 70, height: 95 },
    volume_ft3: 15.8,  // Verified realistic volume for accent chair
    weight_kg: 12,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'CHAIR_ACCENT_002',
    name: 'Accent chair (wingback)',
    category: 'Chair',
    subcategory: 'Accent',
    keywords: ['wingback', 'accent', 'chair', 'upholstered', 'living room', 'traditional'],
    dimensions_cm: { length: 80, width: 75, height: 105 },
    volume_ft3: 18.5,  // Larger wingback style
    weight_kg: 15,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'CHAIR_LOUNGE_001',
    name: 'Lounge chair / Club chair',
    category: 'Chair',
    subcategory: 'Lounge',
    keywords: ['lounge', 'club', 'chair', 'upholstered', 'living room', 'reading'],
    dimensions_cm: { length: 85, width: 80, height: 90 },
    volume_ft3: 17.2,
    weight_kg: 20,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'CHAIR_RECLINER_001',
    name: 'Recliner chair',
    category: 'Chair',
    subcategory: 'Recliner',
    keywords: ['recliner', 'chair', 'reclining', 'lazyboy', 'lazy boy', 'living room'],
    dimensions_cm: { length: 90, width: 85, height: 100 },
    volume_ft3: 22.0,  // Recliners are larger
    weight_kg: 35,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },
  {
    item_id: 'CHAIR_BARREL_001',
    name: 'Barrel chair / Swivel chair',
    category: 'Chair',
    subcategory: 'Accent',
    keywords: ['barrel', 'swivel', 'chair', 'round', 'accent', 'living room'],
    dimensions_cm: { length: 75, width: 75, height: 80 },
    volume_ft3: 14.8,
    weight_kg: 14,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  
  // ===== DRESSERS & STORAGE =====
  {
    item_id: 'DRESSER_6DRAWER_001',
    name: '6-drawer dresser',
    category: 'Dresser',
    subcategory: 'Dresser',
    keywords: ['dresser', '6-drawer', 'bedroom', 'storage', 'chest'],
    dimensions_cm: { length: 150, width: 50, height: 85 },
    volume_ft3: calcVolume(150, 50, 85),
    weight_kg: 70,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'DRESSER_TALL_001',
    name: 'Tall dresser / Chest of drawers',
    category: 'Dresser',
    subcategory: 'Chest',
    keywords: ['tall', 'dresser', 'chest', 'highboy', 'vertical'],
    dimensions_cm: { length: 80, width: 45, height: 130 },
    volume_ft3: calcVolume(80, 45, 130),
    weight_kg: 55,
    load_size: 'boxes',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'NIGHTSTAND_001',
    name: 'Nightstand / Bedside table',
    category: 'Dresser',
    subcategory: 'Nightstand',
    keywords: ['nightstand', 'bedside', 'table', 'night', 'lamp'],
    dimensions_cm: { length: 50, width: 40, height: 55 },
    volume_ft3: calcVolume(50, 40, 55),
    weight_kg: 15,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'WARDROBE_001',
    name: 'Wardrobe / Armoire',
    category: 'Storage',
    subcategory: 'Wardrobe',
    keywords: ['wardrobe', 'armoire', 'closet', 'clothes', 'storage'],
    dimensions_cm: { length: 120, width: 60, height: 200 },
    volume_ft3: calcVolume(120, 60, 200),
    weight_kg: 100,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'BOOKSHELF_001',
    name: 'Bookshelf (5-shelf)',
    category: 'Storage',
    subcategory: 'Bookshelf',
    keywords: ['bookshelf', 'bookcase', 'shelves', 'storage', 'display'],
    dimensions_cm: { length: 80, width: 30, height: 180 },
    volume_ft3: calcVolume(80, 30, 180),
    weight_kg: 40,
    load_size: 'boxes',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'medium',
  },
  {
    item_id: 'TV_STAND_001',
    name: 'TV stand / Entertainment center',
    category: 'Storage',
    subcategory: 'Media',
    keywords: ['tv', 'stand', 'entertainment', 'center', 'media', 'console'],
    dimensions_cm: { length: 150, width: 45, height: 55 },
    volume_ft3: calcVolume(150, 45, 55),
    weight_kg: 40,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'medium',
  },
  
  // ===== APPLIANCES =====
  {
    item_id: 'FRIDGE_STANDARD_001',
    name: 'Refrigerator (standard top-freezer)',
    category: 'Appliance',
    subcategory: 'Refrigerator',
    keywords: ['refrigerator', 'fridge', 'top-freezer', 'standard'],
    dimensions_cm: { length: 75, width: 70, height: 170 },
    volume_ft3: calcVolume(75, 70, 170),
    weight_kg: 90,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'FRIDGE_FRENCH_001',
    name: 'French door refrigerator',
    category: 'Appliance',
    subcategory: 'Refrigerator',
    keywords: ['refrigerator', 'fridge', 'french', 'door', 'side-by-side'],
    dimensions_cm: { length: 90, width: 80, height: 180 },
    volume_ft3: calcVolume(90, 80, 180),
    weight_kg: 130,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'WASHER_001',
    name: 'Washing machine (front-load)',
    category: 'Appliance',
    subcategory: 'Washer',
    keywords: ['washing', 'machine', 'washer', 'front-load', 'laundry'],
    dimensions_cm: { length: 60, width: 65, height: 85 },
    volume_ft3: calcVolume(60, 65, 85),
    weight_kg: 75,
    load_size: 'boxes',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'DRYER_001',
    name: 'Clothes dryer',
    category: 'Appliance',
    subcategory: 'Dryer',
    keywords: ['dryer', 'clothes', 'laundry', 'tumble'],
    dimensions_cm: { length: 60, width: 65, height: 85 },
    volume_ft3: calcVolume(60, 65, 85),
    weight_kg: 55,
    load_size: 'boxes',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'high',
  },
  {
    item_id: 'DISHWASHER_001',
    name: 'Dishwasher',
    category: 'Appliance',
    subcategory: 'Dishwasher',
    keywords: ['dishwasher', 'dishes', 'kitchen'],
    dimensions_cm: { length: 60, width: 60, height: 85 },
    volume_ft3: calcVolume(60, 60, 85),
    weight_kg: 45,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'high',
  },
  {
    item_id: 'STOVE_001',
    name: 'Stove / Range (electric)',
    category: 'Appliance',
    subcategory: 'Stove',
    keywords: ['stove', 'range', 'oven', 'electric', 'kitchen', 'cooktop'],
    dimensions_cm: { length: 76, width: 70, height: 115 },
    volume_ft3: calcVolume(76, 70, 115),
    weight_kg: 70,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'MICROWAVE_001',
    name: 'Microwave (countertop)',
    category: 'Appliance',
    subcategory: 'Microwave',
    keywords: ['microwave', 'countertop', 'kitchen', 'small'],
    dimensions_cm: { length: 50, width: 40, height: 30 },
    volume_ft3: calcVolume(50, 40, 30),
    weight_kg: 15,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'AC_WINDOW_001',
    name: 'Window air conditioner',
    category: 'Appliance',
    subcategory: 'AC',
    keywords: ['air', 'conditioner', 'window', 'ac', 'cooling'],
    dimensions_cm: { length: 60, width: 50, height: 40 },
    volume_ft3: calcVolume(60, 50, 40),
    weight_kg: 35,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'medium',
  },
  {
    item_id: 'AC_PORTABLE_001',
    name: 'Portable air conditioner',
    category: 'Appliance',
    subcategory: 'AC',
    keywords: ['air', 'conditioner', 'portable', 'ac', 'cooling', 'standing', 'floor'],
    dimensions_cm: { length: 45, width: 40, height: 80 },
    volume_ft3: calcVolume(45, 40, 80),
    weight_kg: 30,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'medium',
  },
  {
    item_id: 'FREEZER_CHEST_001',
    name: 'Chest freezer',
    category: 'Appliance',
    subcategory: 'Freezer',
    keywords: ['freezer', 'chest', 'deep', 'freeze', 'storage'],
    dimensions_cm: { length: 110, width: 65, height: 85 },
    volume_ft3: calcVolume(110, 65, 85),
    weight_kg: 55,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'high',
  },
  {
    item_id: 'FREEZER_UPRIGHT_001',
    name: 'Upright freezer',
    category: 'Appliance',
    subcategory: 'Freezer',
    keywords: ['freezer', 'upright', 'standing', 'deep', 'freeze'],
    dimensions_cm: { length: 70, width: 65, height: 170 },
    volume_ft3: calcVolume(70, 65, 170),
    weight_kg: 80,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'STOVE_GAS_001',
    name: 'Stove / Range (gas)',
    category: 'Appliance',
    subcategory: 'Stove',
    keywords: ['stove', 'range', 'oven', 'gas', 'kitchen', 'cooktop', 'propane'],
    dimensions_cm: { length: 76, width: 70, height: 115 },
    volume_ft3: calcVolume(76, 70, 115),
    weight_kg: 80,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'WASHER_TOPLOAD_001',
    name: 'Washing machine (top-load)',
    category: 'Appliance',
    subcategory: 'Washer',
    keywords: ['washing', 'machine', 'washer', 'top-load', 'laundry'],
    dimensions_cm: { length: 60, width: 60, height: 105 },
    volume_ft3: calcVolume(60, 60, 105),
    weight_kg: 65,
    load_size: 'boxes',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'high',
  },
  {
    item_id: 'WASHER_DRYER_COMBO_001',
    name: 'Stacked washer/dryer combo',
    category: 'Appliance',
    subcategory: 'Washer',
    keywords: ['washer', 'dryer', 'stacked', 'combo', 'laundry', 'stackable'],
    dimensions_cm: { length: 65, width: 65, height: 180 },
    volume_ft3: calcVolume(65, 65, 180),
    weight_kg: 130,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'MINI_FRIDGE_001',
    name: 'Mini fridge / Bar fridge',
    category: 'Appliance',
    subcategory: 'Refrigerator',
    keywords: ['mini', 'fridge', 'bar', 'small', 'refrigerator', 'compact', 'dorm'],
    dimensions_cm: { length: 48, width: 45, height: 50 },
    volume_ft3: calcVolume(48, 45, 50),
    weight_kg: 20,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'OVEN_WALL_001',
    name: 'Wall oven',
    category: 'Appliance',
    subcategory: 'Oven',
    keywords: ['oven', 'wall', 'built-in', 'kitchen', 'baking'],
    dimensions_cm: { length: 60, width: 60, height: 90 },
    volume_ft3: calcVolume(60, 60, 90),
    weight_kg: 55,
    load_size: 'boxes',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'high',
  },
  {
    item_id: 'HOOD_RANGE_001',
    name: 'Range hood / Exhaust hood',
    category: 'Appliance',
    subcategory: 'Hood',
    keywords: ['range', 'hood', 'exhaust', 'vent', 'kitchen', 'fan'],
    dimensions_cm: { length: 76, width: 50, height: 30 },
    volume_ft3: calcVolume(76, 50, 30),
    weight_kg: 15,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },
  {
    item_id: 'WATER_HEATER_001',
    name: 'Water heater (tank)',
    category: 'Appliance',
    subcategory: 'Water Heater',
    keywords: ['water', 'heater', 'tank', 'hot', 'boiler'],
    dimensions_cm: { length: 50, width: 50, height: 150 },
    volume_ft3: calcVolume(50, 50, 150),
    weight_kg: 55,
    load_size: 'boxes',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'SPACE_HEATER_001',
    name: 'Space heater / Portable heater',
    category: 'Appliance',
    subcategory: 'Heater',
    keywords: ['space', 'heater', 'portable', 'electric', 'radiator', 'warming'],
    dimensions_cm: { length: 40, width: 25, height: 55 },
    volume_ft3: calcVolume(40, 25, 55),
    weight_kg: 8,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'DEHUMIDIFIER_001',
    name: 'Dehumidifier',
    category: 'Appliance',
    subcategory: 'Climate',
    keywords: ['dehumidifier', 'humidity', 'moisture', 'basement'],
    dimensions_cm: { length: 40, width: 30, height: 60 },
    volume_ft3: calcVolume(40, 30, 60),
    weight_kg: 15,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'BBQ_GRILL_001',
    name: 'BBQ grill (propane)',
    category: 'Appliance',
    subcategory: 'Outdoor',
    keywords: ['bbq', 'grill', 'barbecue', 'propane', 'gas', 'outdoor', 'cooking'],
    dimensions_cm: { length: 140, width: 60, height: 115 },
    volume_ft3: calcVolume(140, 60, 115),
    weight_kg: 50,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },

  // ===== ELECTRONICS =====
  {
    item_id: 'TV_32_001',
    name: '32-inch TV',
    category: 'Electronics',
    subcategory: 'TV',
    keywords: ['tv', 'television', '32', '32-inch', 'small', 'flat', 'screen', 'bedroom'],
    dimensions_cm: { length: 73, width: 7, height: 44 },
    volume_ft3: calcVolume(73, 7, 44),
    weight_kg: 5,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'high',
  },
  {
    item_id: 'TV_40_001',
    name: '40-inch TV',
    category: 'Electronics',
    subcategory: 'TV',
    keywords: ['tv', 'television', '40', '40-inch', 'flat', 'screen'],
    dimensions_cm: { length: 92, width: 7, height: 54 },
    volume_ft3: calcVolume(92, 7, 54),
    weight_kg: 8,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'high',
  },
  {
    item_id: 'TV_43_001',
    name: '43-inch TV',
    category: 'Electronics',
    subcategory: 'TV',
    keywords: ['tv', 'television', '43', '43-inch', 'flat', 'screen'],
    dimensions_cm: { length: 97, width: 7, height: 57 },
    volume_ft3: calcVolume(97, 7, 57),
    weight_kg: 9,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'high',
  },
  {
    item_id: 'TV_50_001',
    name: '50-inch TV',
    category: 'Electronics',
    subcategory: 'TV',
    keywords: ['tv', 'television', '50', '50-inch', 'flat', 'screen'],
    dimensions_cm: { length: 113, width: 8, height: 66 },
    volume_ft3: calcVolume(113, 8, 66),
    weight_kg: 14,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'high',
    insurance_level: 'premium',
  },
  {
    item_id: 'TV_55_001',
    name: '55-inch TV',
    category: 'Electronics',
    subcategory: 'TV',
    keywords: ['tv', 'television', '55', '55-inch', 'flat', 'screen'],
    dimensions_cm: { length: 125, width: 8, height: 72 },
    volume_ft3: calcVolume(125, 8, 72),
    weight_kg: 18,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'premium',
  },
  {
    item_id: 'TV_65_001',
    name: '65-inch TV',
    category: 'Electronics',
    subcategory: 'TV',
    keywords: ['tv', 'television', '65', '65-inch', 'large', 'screen'],
    dimensions_cm: { length: 145, width: 10, height: 85 },
    volume_ft3: calcVolume(145, 10, 85),
    weight_kg: 25,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'premium',
  },
  {
    item_id: 'TV_75_001',
    name: '75-inch TV',
    category: 'Electronics',
    subcategory: 'TV',
    keywords: ['tv', 'television', '75', '75-inch', 'extra large', 'screen'],
    dimensions_cm: { length: 168, width: 10, height: 97 },
    volume_ft3: calcVolume(168, 10, 97),
    weight_kg: 35,
    load_size: 'boxes',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'TV_85_001',
    name: '85-inch TV',
    category: 'Electronics',
    subcategory: 'TV',
    keywords: ['tv', 'television', '85', '85-inch', 'extra large', 'screen', 'huge'],
    dimensions_cm: { length: 191, width: 12, height: 110 },
    volume_ft3: calcVolume(191, 12, 110),
    weight_kg: 45,
    load_size: 'boxes',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'MONITOR_LARGE_001',
    name: 'Computer monitor (27-32 inch)',
    category: 'Electronics',
    subcategory: 'Monitor',
    keywords: ['monitor', 'computer', 'screen', '27', '32', 'gaming'],
    dimensions_cm: { length: 70, width: 25, height: 50 },
    volume_ft3: calcVolume(70, 25, 50),
    weight_kg: 8,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'high',
  },
  {
    item_id: 'DESKTOP_PC_001',
    name: 'Desktop computer (tower)',
    category: 'Electronics',
    subcategory: 'Computer',
    keywords: ['desktop', 'computer', 'tower', 'pc', 'gaming'],
    dimensions_cm: { length: 50, width: 25, height: 50 },
    volume_ft3: calcVolume(50, 25, 50),
    weight_kg: 15,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'high',
  },
  
  // ===== OUTDOOR =====
  {
    item_id: 'PATIO_SET_001',
    name: 'Patio furniture set (4-piece)',
    category: 'Outdoor',
    subcategory: 'Patio',
    keywords: ['patio', 'outdoor', 'furniture', 'set', 'chairs', 'table'],
    dimensions_cm: { length: 150, width: 80, height: 90 },
    volume_ft3: calcVolume(150, 80, 90),
    weight_kg: 45,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },
  {
    item_id: 'GRILL_001',
    name: 'BBQ grill (propane)',
    category: 'Outdoor',
    subcategory: 'Grill',
    keywords: ['bbq', 'grill', 'barbecue', 'propane', 'gas', 'outdoor'],
    dimensions_cm: { length: 140, width: 60, height: 120 },
    volume_ft3: calcVolume(140, 60, 120),
    weight_kg: 50,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'LAWNMOWER_001',
    name: 'Lawn mower (push)',
    category: 'Outdoor',
    subcategory: 'Garden',
    keywords: ['lawn', 'mower', 'push', 'garden', 'grass'],
    dimensions_cm: { length: 150, width: 55, height: 100 },
    volume_ft3: calcVolume(150, 55, 100),
    weight_kg: 35,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },
  {
    item_id: 'BICYCLE_001',
    name: 'Bicycle (adult)',
    category: 'Outdoor',
    subcategory: 'Sports',
    keywords: ['bicycle', 'bike', 'cycling', 'sports'],
    dimensions_cm: { length: 180, width: 60, height: 110 },
    volume_ft3: calcVolume(180, 60, 110),
    weight_kg: 15,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 1,
    handling_complexity: 'medium',
    insurance_level: 'medium',
  },
  
  // ===== MISC =====
  {
    item_id: 'PIANO_UPRIGHT_001',
    name: 'Upright piano',
    category: 'Other',
    subcategory: 'Piano',
    keywords: ['piano', 'upright', 'music', 'instrument', 'heavy'],
    dimensions_cm: { length: 150, width: 60, height: 130 },
    volume_ft3: calcVolume(150, 60, 130),
    weight_kg: 250,
    load_size: 'medium',
    vehicle: 'truck',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'premium',
  },
  {
    item_id: 'TREADMILL_001',
    name: 'Treadmill',
    category: 'Other',
    subcategory: 'Fitness',
    keywords: ['treadmill', 'exercise', 'fitness', 'gym', 'running'],
    dimensions_cm: { length: 180, width: 80, height: 150 },
    volume_ft3: calcVolume(180, 80, 150),
    weight_kg: 100,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'very_high',
    insurance_level: 'high',
  },
  {
    item_id: 'EXERCISE_BIKE_001',
    name: 'Exercise bike / Stationary bike',
    category: 'Other',
    subcategory: 'Fitness',
    keywords: ['exercise', 'bike', 'stationary', 'cycling', 'peloton', 'spin'],
    dimensions_cm: { length: 120, width: 55, height: 130 },
    volume_ft3: calcVolume(120, 55, 130),
    weight_kg: 55,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'medium',
  },
  {
    item_id: 'MATTRESS_TWIN_001',
    name: 'Twin mattress',
    category: 'Bed',
    subcategory: 'Mattress',
    keywords: ['mattress', 'twin', 'single', 'bed', 'foam', 'spring'],
    dimensions_cm: { length: 191, width: 99, height: 20 },
    volume_ft3: calcVolume(191, 99, 20),
    weight_kg: 20,
    load_size: 'boxes',
    vehicle: 'van',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'MATTRESS_FULL_001',
    name: 'Full/Double mattress',
    category: 'Bed',
    subcategory: 'Mattress',
    keywords: ['mattress', 'full', 'double', 'bed', 'foam', 'spring'],
    dimensions_cm: { length: 191, width: 137, height: 22 },
    volume_ft3: calcVolume(191, 137, 22),
    weight_kg: 30,
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'MATTRESS_QUEEN_001',
    name: 'Queen mattress',
    category: 'Bed',
    subcategory: 'Mattress',
    keywords: ['mattress', 'queen', 'bed', 'foam', 'spring'],
    dimensions_cm: { length: 203, width: 152, height: 25 },
    volume_ft3: calcVolume(203, 152, 25),
    weight_kg: 40,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },
  {
    item_id: 'MATTRESS_KING_001',
    name: 'King mattress',
    category: 'Bed',
    subcategory: 'Mattress',
    keywords: ['mattress', 'king', 'bed', 'california', 'foam'],
    dimensions_cm: { length: 203, width: 193, height: 25 },
    volume_ft3: calcVolume(203, 193, 25),
    weight_kg: 50,
    load_size: 'medium',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'high',
    insurance_level: 'standard',
  },
  {
    item_id: 'BOXES_SMALL_001',
    name: 'Moving boxes (small, set of 10)',
    category: 'Other',
    subcategory: 'Boxes',
    keywords: ['boxes', 'small', 'moving', 'cardboard', 'packing'],
    dimensions_cm: { length: 40, width: 30, height: 30 },
    volume_ft3: calcVolume(40, 30, 30) * 10,  // 10 boxes
    weight_kg: 50,  // Assuming filled boxes
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'BOXES_MEDIUM_001',
    name: 'Moving boxes (medium, set of 10)',
    category: 'Other',
    subcategory: 'Boxes',
    keywords: ['boxes', 'medium', 'moving', 'cardboard', 'packing'],
    dimensions_cm: { length: 50, width: 40, height: 40 },
    volume_ft3: calcVolume(50, 40, 40) * 10,  // 10 boxes
    weight_kg: 80,  // Assuming filled boxes
    load_size: 'medium',
    vehicle: 'van',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'BOXES_LARGE_001',
    name: 'Moving boxes (large, set of 10)',
    category: 'Other',
    subcategory: 'Boxes',
    keywords: ['boxes', 'large', 'moving', 'cardboard', 'packing'],
    dimensions_cm: { length: 60, width: 50, height: 50 },
    volume_ft3: calcVolume(60, 50, 50) * 10,  // 10 boxes
    weight_kg: 100,  // Assuming filled boxes
    load_size: 'large',
    vehicle: 'pickup',
    movers_required: 2,
    handling_complexity: 'medium',
    insurance_level: 'standard',
  },
  
  // ===== LUGGAGE & BAGS =====
  {
    item_id: 'BAG_HANDBAG_001',
    name: 'Handbag / Purse',
    category: 'Luggage',
    subcategory: 'Bag',
    keywords: ['bag', 'handbag', 'purse', 'shoulder bag', 'tote', 'carry'],
    dimensions_cm: { length: 35, width: 15, height: 25 },
    volume_ft3: 0.5,
    weight_kg: 2,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'BAG_MESSENGER_001',
    name: 'Messenger bag / Crossbody bag',
    category: 'Luggage',
    subcategory: 'Bag',
    keywords: ['bag', 'messenger', 'crossbody', 'shoulder', 'laptop bag', 'satchel'],
    dimensions_cm: { length: 40, width: 12, height: 30 },
    volume_ft3: 0.5,
    weight_kg: 3,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'BAG_BACKPACK_001',
    name: 'Backpack',
    category: 'Luggage',
    subcategory: 'Backpack',
    keywords: ['backpack', 'bag', 'rucksack', 'school bag', 'daypack', 'knapsack'],
    dimensions_cm: { length: 45, width: 30, height: 55 },
    volume_ft3: 2.6,
    weight_kg: 5,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'BAG_DUFFEL_001',
    name: 'Duffel bag / Gym bag',
    category: 'Luggage',
    subcategory: 'Duffel',
    keywords: ['duffel', 'duffle', 'gym bag', 'sports bag', 'travel bag', 'holdall'],
    dimensions_cm: { length: 60, width: 30, height: 35 },
    volume_ft3: 2.2,
    weight_kg: 8,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'BAG_WEEKENDER_001',
    name: 'Weekender bag / Travel bag',
    category: 'Luggage',
    subcategory: 'Travel',
    keywords: ['weekender', 'travel bag', 'overnight bag', 'carry-on', 'cabin bag'],
    dimensions_cm: { length: 55, width: 25, height: 35 },
    volume_ft3: 1.7,
    weight_kg: 6,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'SUITCASE_CABIN_001',
    name: 'Carry-on suitcase / Cabin luggage',
    category: 'Luggage',
    subcategory: 'Suitcase',
    keywords: ['suitcase', 'carry-on', 'cabin', 'luggage', 'trolley', 'roller bag', 'small'],
    dimensions_cm: { length: 55, width: 35, height: 23 },
    volume_ft3: 1.6,
    weight_kg: 10,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'SUITCASE_MEDIUM_001',
    name: 'Medium suitcase',
    category: 'Luggage',
    subcategory: 'Suitcase',
    keywords: ['suitcase', 'medium', 'luggage', 'trolley', 'roller bag', 'checked'],
    dimensions_cm: { length: 68, width: 45, height: 28 },
    volume_ft3: 3.0,
    weight_kg: 15,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'SUITCASE_LARGE_001',
    name: 'Large suitcase',
    category: 'Luggage',
    subcategory: 'Suitcase',
    keywords: ['suitcase', 'large', 'luggage', 'trolley', 'roller bag', 'checked', 'big'],
    dimensions_cm: { length: 78, width: 52, height: 32 },
    volume_ft3: 4.6,
    weight_kg: 23,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'BAG_TOTE_001',
    name: 'Tote bag / Shopping bag',
    category: 'Luggage',
    subcategory: 'Bag',
    keywords: ['tote', 'shopping bag', 'bag', 'canvas bag', 'reusable bag'],
    dimensions_cm: { length: 40, width: 15, height: 35 },
    volume_ft3: 0.7,
    weight_kg: 3,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'BAG_LAUNDRY_001',
    name: 'Laundry bag / Laundry basket',
    category: 'Luggage',
    subcategory: 'Bag',
    keywords: ['laundry', 'bag', 'basket', 'hamper', 'clothes bag'],
    dimensions_cm: { length: 50, width: 40, height: 60 },
    volume_ft3: 4.2,
    weight_kg: 10,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
  {
    item_id: 'BAG_GARMENT_001',
    name: 'Garment bag / Suit bag',
    category: 'Luggage',
    subcategory: 'Bag',
    keywords: ['garment', 'suit bag', 'dress bag', 'clothing bag', 'travel suit'],
    dimensions_cm: { length: 60, width: 5, height: 100 },
    volume_ft3: 1.1,
    weight_kg: 4,
    load_size: 'boxes',
    vehicle: 'car',
    movers_required: 1,
    handling_complexity: 'low',
    insurance_level: 'standard',
  },
];

/**
 * Get all items by category
 */
export function getItemsByCategory(category: FurnitureCategory): FurnitureItem[] {
  return FURNITURE_DATABASE.filter(item => item.category === category);
}

/**
 * Get item by ID
 */
export function getItemById(itemId: string): FurnitureItem | undefined {
  return FURNITURE_DATABASE.find(item => item.item_id === itemId);
}

/**
 * Search items by keywords
 */
export function searchItemsByKeywords(keywords: string[]): FurnitureItem[] {
  const normalizedKeywords = keywords.map(k => k.toLowerCase());
  
  return FURNITURE_DATABASE.filter(item => {
    const itemKeywords = item.keywords.map(k => k.toLowerCase());
    const nameWords = item.name.toLowerCase().split(' ');
    const allItemWords = [...itemKeywords, ...nameWords];
    
    // Check if any search keyword matches any item keyword
    return normalizedKeywords.some(searchKey => 
      allItemWords.some(itemKey => itemKey.includes(searchKey) || searchKey.includes(itemKey))
    );
  });
}

/**
 * Find best matching item based on item name
 * Returns match with similarity score
 * 
 * IMPROVED: Prevents false positives like "accent chair" → "AC (air conditioner)"
 * by requiring longer word matches and prioritizing exact category matches.
 */
export function findBestMatch(itemName: string): { item: FurnitureItem; similarity: number } | null {
  const nameLower = itemName.toLowerCase();
  const nameWords = nameLower.split(/\s+/).filter(w => w.length > 2);
  
  const hasChairHint = nameLower.includes('chair');
  const hasSofaHint = nameLower.includes('sofa') || nameLower.includes('couch');
  const hasBedHint = nameLower.includes('bed');
  const hasTableHint = nameLower.includes('table') || nameLower.includes('desk');
  
  const SUBCATEGORY_KEYWORDS: Record<string, string[]> = {
    'Sectional': ['sectional', 'l-shaped', 'u-shaped', 'corner'],
    'Loveseat': ['loveseat', '2-seater'],
    '3-Seater': ['3-seater', 'three-seater'],
    'Sofa Bed': ['sofa bed', 'sleeper', 'pull-out', 'pullout', 'convertible'],
    'Recliner': ['recliner', 'reclining'],
  };
  
  let inputSubcategory: string | null = null;
  for (const [subcat, keywords] of Object.entries(SUBCATEGORY_KEYWORDS)) {
    if (keywords.some(kw => nameLower.includes(kw))) {
      inputSubcategory = subcat;
      break;
    }
  }
  
  const SIZE_KEYWORDS = ['small', 'medium', 'large', 'oversized', 'compact', 'standard', 'mini', 'king', 'queen', 'twin', 'full', 'double', 'single'];
  const inputSize = SIZE_KEYWORDS.find(s => nameLower.includes(s)) || null;
  
  let bestMatch: FurnitureItem | null = null;
  let bestScore = 0;
  
  for (const item of FURNITURE_DATABASE) {
    const itemNameLower = item.name.toLowerCase();
    const itemKeywords = [...item.keywords, item.subcategory.toLowerCase()];
    const allItemWords = [...itemNameLower.split(/\s+/), ...itemKeywords];
    
    let categoryMismatchPenalty = 0;
    if (hasChairHint && item.category !== 'Chair') categoryMismatchPenalty = 0.5;
    if (hasSofaHint && item.category !== 'Sofa') categoryMismatchPenalty = 0.5;
    if (hasBedHint && item.category !== 'Bed') categoryMismatchPenalty = 0.5;
    if (hasTableHint && item.category !== 'Table') categoryMismatchPenalty = 0.5;
    
    let matchCount = 0;
    let totalWeight = 0;
    
    for (const word of nameWords) {
      if (allItemWords.some(iw => iw === word)) {
        matchCount += 3;
        totalWeight += 3;
      } else if (allItemWords.some(iw => {
        const minLen = Math.min(iw.length, word.length);
        if (minLen < 4) return false;
        return (iw.includes(word) || word.includes(iw));
      })) {
        matchCount += 1;
        totalWeight += 3;
      } else {
        totalWeight += 3;
      }
    }
    
    for (const keyword of itemKeywords) {
      if (keyword.length >= 4 && nameLower.includes(keyword)) {
        matchCount += 1;
      }
    }
    
    if (hasChairHint && item.category === 'Chair') matchCount += 2;
    if (hasSofaHint && item.category === 'Sofa') matchCount += 2;
    if (hasBedHint && item.category === 'Bed') matchCount += 2;
    if (hasTableHint && item.category === 'Table') matchCount += 2;
    
    let similarity = totalWeight > 0 ? Math.min(matchCount / totalWeight, 1) : 0;
    
    similarity = similarity * (1 - categoryMismatchPenalty);
    
    if (inputSubcategory) {
      if (item.subcategory === inputSubcategory) {
        similarity *= 1.5;
      } else {
        similarity *= 0.3;
      }
      similarity = Math.min(similarity, 1);
    }
    
    if (inputSize) {
      const itemAllText = itemNameLower + ' ' + item.keywords.join(' ');
      const itemSize = SIZE_KEYWORDS.find(s => itemAllText.includes(s)) || null;
      if (itemSize && inputSize !== itemSize) {
        similarity *= 0.4;
      } else if (itemSize && inputSize === itemSize) {
        similarity *= 1.3;
        similarity = Math.min(similarity, 1);
      }
    }
    
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = item;
    }
  }
  
  if (bestMatch && bestScore > 0.3) {
    return { item: bestMatch, similarity: bestScore };
  }
  
  return null;
}

/**
 * ===== VEHICLE SELECTION THRESHOLDS =====
 * Single source of truth for volume-to-vehicle mapping
 * 
 * Updated thresholds (2025):
 *   0-20 ft³   → SUV / Small Vehicle (car)   - Single chair, few boxes
 *   21-165 ft³  → Cargo Van (van)             - Sofa, mattress, bedroom set, multiple furniture
 *   166-300 ft³ → Pickup Truck (pickup)       - Full bedroom + living room, multiple rooms
 *   >300 ft³    → Moving Truck (truck)        - Apartment move, large loads
 */
export const VEHICLE_VOLUME_THRESHOLDS = {
  CAR_MAX: 20,       // 0-20 ft³ → SUV/Small Vehicle
  VAN_MAX: 165,      // 21-165 ft³ → Cargo Van
  PICKUP_MAX: 300,   // 166-300 ft³ → Pickup Truck / Small Moving Truck
  // Above 300 ft³ → Large Moving Truck
};

/**
 * Get load size from total volume (using new thresholds)
 * Note: This uses TOTAL volume including quantity
 */
export function getLoadSizeFromVolume(volumeFt3: number): LoadSizeCategory {
  if (volumeFt3 <= VEHICLE_VOLUME_THRESHOLDS.CAR_MAX) return 'boxes';     // 0-20 ft³ → SUV
  if (volumeFt3 <= VEHICLE_VOLUME_THRESHOLDS.VAN_MAX) return 'medium';    // 21-165 ft³ → Cargo Van
  if (volumeFt3 <= VEHICLE_VOLUME_THRESHOLDS.PICKUP_MAX) return 'large';  // 166-300 ft³ → Pickup / Small Moving Truck
  return 'apartment';  // >300 ft³ → Large Moving Truck
}

/**
 * Get vehicle recommendation from TOTAL volume (primary method)
 * This is the preferred method - uses volume directly without load size
 */
export function getVehicleFromVolume(totalVolumeFt3: number): VehicleType {
  if (totalVolumeFt3 <= VEHICLE_VOLUME_THRESHOLDS.CAR_MAX) return 'car';       // 0-20 ft³ → SUV
  if (totalVolumeFt3 <= VEHICLE_VOLUME_THRESHOLDS.VAN_MAX) return 'van';       // 21-165 ft³ → Cargo Van
  if (totalVolumeFt3 <= VEHICLE_VOLUME_THRESHOLDS.PICKUP_MAX) return 'pickup'; // 166-300 ft³ → Pickup
  return 'truck';  // >300 ft³ → Moving Truck
}

/**
 * Category-aware vehicle recommendation
 * Applies category-specific overrides for more accurate recommendations
 * 
 * UPGRADE RULES (can only upgrade, never downgrade):
 * - Weight > 150kg → truck
 * - Weight > 100kg → pickup
 * - Weight > 50kg → van
 * - Max dimension > 200cm → pickup (won't fit in smaller vehicles)
 * - Max dimension > 150cm → van
 * 
 * @param totalVolumeFt3 - TOTAL volume including quantity
 * @param category - Furniture category (for future overrides)
 * @param totalWeightKg - Optional weight for heavy item override
 * @param maxDimensionCm - Optional largest dimension for oversized item override
 */
export function getVehicleRecommendationWithCategory(
  totalVolumeFt3: number,
  category: string,
  totalWeightKg?: number,
  maxDimensionCm?: number
): VehicleType {
  // Start with volume-based vehicle
  let vehicleRank = 0; // 0=car, 1=van, 2=pickup, 3=truck
  if (totalVolumeFt3 <= VEHICLE_VOLUME_THRESHOLDS.CAR_MAX) vehicleRank = 0;
  else if (totalVolumeFt3 <= VEHICLE_VOLUME_THRESHOLDS.VAN_MAX) vehicleRank = 1;
  else if (totalVolumeFt3 <= VEHICLE_VOLUME_THRESHOLDS.PICKUP_MAX) vehicleRank = 2;
  else vehicleRank = 3;

  // WEIGHT UPGRADES: Heavy items need bigger vehicles (can only upgrade, never downgrade)
  if (totalWeightKg) {
    if (totalWeightKg > 150) vehicleRank = Math.max(vehicleRank, 3);
    else if (totalWeightKg > 100) vehicleRank = Math.max(vehicleRank, 2);
    else if (totalWeightKg > 50) vehicleRank = Math.max(vehicleRank, 1);
  }

  // DIMENSION UPGRADES: Oversized items won't fit in smaller vehicles
  if (maxDimensionCm) {
    if (maxDimensionCm > 200) vehicleRank = Math.max(vehicleRank, 2);
    else if (maxDimensionCm > 150) vehicleRank = Math.max(vehicleRank, 1);
  }

  const vehicles: VehicleType[] = ['car', 'van', 'pickup', 'truck'];
  return vehicles[vehicleRank];
}

/**
 * Get vehicle recommendation from load size and weight (LEGACY)
 * Kept for backward compatibility - prefer getVehicleRecommendationWithCategory
 */
export function getVehicleRecommendation(loadSize: LoadSizeCategory, weightKg: number): VehicleType {
  if (loadSize === 'apartment' || weightKg > 150) return 'truck';
  if (loadSize === 'large' || weightKg > 100) return 'pickup';
  if (loadSize === 'medium' || weightKg > 50) return 'van';
  return 'car';
}

/**
 * Human-readable vehicle name for UI display
 */
export function getVehicleDisplayName(vehicle: VehicleType): string {
  switch (vehicle) {
    case 'car': return 'SUV / Small Vehicle';
    case 'van': return 'Cargo Van';
    case 'pickup': return 'Pickup Truck';
    case 'truck': return 'Moving Truck (Large)';
    default: return 'Vehicle';
  }
}
