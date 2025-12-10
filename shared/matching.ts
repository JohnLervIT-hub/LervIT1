// Proximity matching algorithm for Uber-style mover assignment
// Implements SmartMatch™ cascading fallback with auto-upgrade pricing

import { calculateDistance, type Coordinates } from './geocoding';
import { 
  calculatePrice, 
  type PriceBreakdown,
  type VehicleClass,
  VEHICLE_CLASSES,
  getVehicleClassFromVolume,
  getVehicleClassFromLoadSize,
  getVehicleClassConfig
} from './pricing';

export interface MoverWithDistance {
  moverId: string;
  userId: string;
  name: string;
  vehicleType: string;
  rating: string;
  totalMoves: number;
  isAvailable: boolean;
  latitude: number;
  longitude: number;
  distanceToPickup: number; // in km
  estimatedEarnings: number;
  priceBreakdown: PriceBreakdown;
}

export interface MatchingConfig {
  initialRadiusKm: number;
  maxRadiusKm: number;
  radiusExpansionStep: number;
  maxMoversToNotify: number;
  enableTwoSmallMovers: boolean; // Allow "Two Small Movers" fallback option
}

const DEFAULT_CONFIG: MatchingConfig = {
  initialRadiusKm: 15,
  maxRadiusKm: 50,
  radiusExpansionStep: 10,
  maxMoversToNotify: 5,
  enableTwoSmallMovers: true,
};

// Vehicle type recommendations based on weight class
const VEHICLE_TYPE_COMPATIBILITY: Record<string, string[]> = {
  'Car': ['Car', 'SUV'],
  'SUV': ['SUV', 'Car', 'Pickup'],
  'Pickup': ['Pickup', 'SUV', 'Cargo Van'],
  'Cargo Van': ['Cargo Van', 'Pickup', 'Cube Truck'],
  'Cube Truck': ['Cube Truck', 'Cargo Van', 'Flatbed'],
  'Flatbed': ['Flatbed', 'Cube Truck'],
};

// ========== SMARTMATCH™ CASCADING FALLBACK SYSTEM ==========
// Maps vehicle class to compatible vehicle types (for mover filtering)
const VEHICLE_CLASS_TO_TYPES: Record<VehicleClass, string[]> = {
  'A': ['Car', 'SUV'],
  'B': ['SUV', 'Cargo Van'],
  'C': ['Cargo Van'],
  'D': ['Pickup', 'Pickup Truck', 'Small Moving Truck'],
  'E': ['Moving Truck', 'Cube Truck', 'Flatbed', 'Large Moving Truck'],
};

// Vehicle class upgrade hierarchy (for cascading fallback)
const CLASS_UPGRADE_ORDER: VehicleClass[] = ['A', 'B', 'C', 'D', 'E'];

// Get the next higher class for upgrade fallback
function getNextHigherClass(currentClass: VehicleClass): VehicleClass | null {
  const currentIndex = CLASS_UPGRADE_ORDER.indexOf(currentClass);
  if (currentIndex === -1 || currentIndex >= CLASS_UPGRADE_ORDER.length - 1) {
    return null; // Already at highest class or invalid
  }
  return CLASS_UPGRADE_ORDER[currentIndex + 1];
}

// Check if a mover's vehicle type is compatible with a given class
function isVehicleCompatibleWithClass(moverVehicleType: string, targetClass: VehicleClass): boolean {
  const compatibleTypes = VEHICLE_CLASS_TO_TYPES[targetClass] || [];
  // Normalize vehicle type for comparison
  const normalizedType = moverVehicleType.toLowerCase().trim();
  return compatibleTypes.some(t => normalizedType.includes(t.toLowerCase()));
}

// Get vehicle capacity from mover's vehicle type
function getVehicleCapacity(vehicleType: string): number {
  const normalized = vehicleType.toLowerCase();
  if (normalized.includes('truck') || normalized.includes('cube')) return 300; // ~300 ft³
  if (normalized.includes('pickup')) return 170; // ~170 ft³
  if (normalized.includes('cargo') || normalized.includes('van')) return 80; // ~80 ft³
  if (normalized.includes('suv')) return 40; // ~40 ft³
  if (normalized.includes('car')) return 20; // ~20 ft³
  return 50; // Default to medium capacity
}

/**
 * SmartMatch™ Result with upgrade information
 */
export interface SmartMatchResult {
  movers: MoverWithDistance[];
  matchType: 'exact' | 'upgraded' | 'two_small_movers' | 'none';
  preferredClass: VehicleClass;
  actualClass: VehicleClass | null;
  isUpgraded: boolean;
  upgradedFare: number | null;
  originalFare: number | null;
  twoSmallMoversOption: TwoSmallMoversOption | null;
  message: string;
}

/**
 * Two Small Movers option for large loads
 */
export interface TwoSmallMoversOption {
  mover1: MoverWithDistance;
  mover2: MoverWithDistance;
  combinedCapacity: number;
  combinedFare: number;
  message: string;
}

/**
 * Find nearest available movers to a pickup location
 * Returns movers sorted by distance, limited to top N
 * Filters by recommended vehicle type if provided
 */
export function findNearestMovers(
  pickupCoords: Coordinates,
  dropoffCoords: Coordinates,
  loadSize: 'boxes' | 'medium' | 'large' | 'apartment',
  availableMovers: Array<{
    moverId: string;
    userId: string;
    name: string;
    vehicleType: string;
    rating: string;
    totalMoves: number;
    isAvailable: boolean;
    latitude: number | null;
    longitude: number | null;
  }>,
  config: Partial<MatchingConfig> = {},
  recommendedVehicle?: string | null
): MoverWithDistance[] {
  const matchingConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Calculate pickup to dropoff distance
  const jobDistance = calculateDistance(pickupCoords, dropoffCoords);
  
  // Get compatible vehicle types if recommendation provided
  const compatibleVehicles = recommendedVehicle 
    ? (VEHICLE_TYPE_COMPATIBILITY[recommendedVehicle] || [recommendedVehicle])
    : null;
  
  // Calculate distance for each mover and enrich with earnings
  const moversWithDistance: MoverWithDistance[] = availableMovers
    .filter(m => {
      // Basic availability and location checks
      if (!m.isAvailable || m.latitude === null || m.longitude === null) {
        return false;
      }
      
      // Filter by compatible vehicle types if recommendation exists
      if (compatibleVehicles && m.vehicleType) {
        return compatibleVehicles.includes(m.vehicleType);
      }
      
      return true;
    })
    .map(mover => {
      const moverCoords: Coordinates = {
        lat: mover.latitude!,
        lng: mover.longitude!,
      };
      
      const distanceToPickup = calculateDistance(moverCoords, pickupCoords);
      
      // Calculate price breakdown including mover travel fee
      // Use default values for difficulty and heavy item since they're booking-specific
      const priceBreakdown = calculatePrice(
        jobDistance,
        loadSize,
        'ground', // default pickup difficulty
        'ground', // default dropoff difficulty
        false,    // default heavy item
        1,        // default number of movers
        distanceToPickup // mover to pickup distance
      );
      
      return {
        ...mover,
        latitude: mover.latitude!,
        longitude: mover.longitude!,
        distanceToPickup,
        estimatedEarnings: priceBreakdown.totalCost,
        priceBreakdown,
      };
    })
    .sort((a, b) => a.distanceToPickup - b.distanceToPickup);
  
  // Apply radius filtering with automatic expansion
  let radius = matchingConfig.initialRadiusKm;
  let matchedMovers: MoverWithDistance[] = [];
  
  while (matchedMovers.length < matchingConfig.maxMoversToNotify && radius <= matchingConfig.maxRadiusKm) {
    matchedMovers = moversWithDistance.filter(m => m.distanceToPickup <= radius);
    
    if (matchedMovers.length < matchingConfig.maxMoversToNotify) {
      radius += matchingConfig.radiusExpansionStep;
    }
  }
  
  // Return top N movers
  return matchedMovers.slice(0, matchingConfig.maxMoversToNotify);
}

/**
 * SmartMatch™ - Cascading Fallback Mover Matching Algorithm
 * 
 * Algorithm:
 * 1. Determine preferred vehicle class from load volume
 * 2. Try to match movers of preferred class
 * 3. If no preferred class available, cascade up:
 *    - Class C → D → E (auto-upgrade with fare adjustment)
 * 4. If no higher class available, check "Two Small Movers" option
 * 5. If nothing available, return "no drivers available"
 * 
 * @param loadVolumeFt3 - Total load volume in cubic feet
 * @param pickupCoords - Pickup location coordinates
 * @param dropoffCoords - Dropoff location coordinates  
 * @param availableMovers - List of available movers with location
 * @param config - Optional matching configuration
 * @returns SmartMatchResult with matched movers and upgrade info
 */
export function smartMatchMovers(
  loadVolumeFt3: number,
  pickupCoords: Coordinates,
  dropoffCoords: Coordinates,
  availableMovers: Array<{
    moverId: string;
    userId: string;
    name: string;
    vehicleType: string;
    rating: string;
    totalMoves: number;
    isAvailable: boolean;
    latitude: number | null;
    longitude: number | null;
  }>,
  config: Partial<MatchingConfig> = {}
): SmartMatchResult {
  const matchingConfig = { ...DEFAULT_CONFIG, ...config };
  const jobDistance = calculateDistance(pickupCoords, dropoffCoords);
  
  // Step 1: Determine preferred vehicle class from load volume
  const preferredClass = getVehicleClassFromVolume(loadVolumeFt3);
  const preferredClassConfig = getVehicleClassConfig(preferredClass);
  
  console.log(`[SmartMatch] Load volume: ${loadVolumeFt3} ft³ → Preferred class: ${preferredClass} (${preferredClassConfig.name})`);
  
  // Calculate original fare for the preferred class
  const originalFare = calculatePrice(
    jobDistance,
    'medium', // Will be overridden by volumeCuft
    'ground',
    'ground', 
    false,
    1,
    0,
    loadVolumeFt3
  ).totalCost;
  
  // Filter movers by availability and location
  const eligibleMovers = availableMovers.filter(m => 
    m.isAvailable && m.latitude !== null && m.longitude !== null
  );
  
  if (eligibleMovers.length === 0) {
    return {
      movers: [],
      matchType: 'none',
      preferredClass,
      actualClass: null,
      isUpgraded: false,
      upgradedFare: null,
      originalFare,
      twoSmallMoversOption: null,
      message: 'No drivers available for this load right now'
    };
  }
  
  // Helper function to find movers for a specific class
  const findMoversForClass = (targetClass: VehicleClass): MoverWithDistance[] => {
    const classConfig = getVehicleClassConfig(targetClass);
    
    return eligibleMovers
      .filter(m => {
        const moverCapacity = getVehicleCapacity(m.vehicleType);
        const isCompatible = isVehicleCompatibleWithClass(m.vehicleType, targetClass);
        const hasCapacity = moverCapacity >= loadVolumeFt3;
        return isCompatible || hasCapacity;
      })
      .map(mover => {
        const moverCoords: Coordinates = {
          lat: mover.latitude!,
          lng: mover.longitude!,
        };
        const distanceToPickup = calculateDistance(moverCoords, pickupCoords);
        
        // Calculate fare for this class
        const fareForClass = calculatePrice(
          jobDistance,
          'medium',
          'ground',
          'ground',
          false,
          1,
          distanceToPickup,
          classConfig.volumeRangeMax // Use class max volume for fare
        );
        
        return {
          ...mover,
          latitude: mover.latitude!,
          longitude: mover.longitude!,
          distanceToPickup,
          estimatedEarnings: fareForClass.totalCost,
          priceBreakdown: fareForClass,
        };
      })
      .filter(m => m.distanceToPickup <= matchingConfig.maxRadiusKm)
      .sort((a, b) => a.distanceToPickup - b.distanceToPickup);
  };
  
  // Step 2: Try to find movers of preferred class
  let matchedMovers = findMoversForClass(preferredClass);
  
  if (matchedMovers.length > 0) {
    console.log(`[SmartMatch] Found ${matchedMovers.length} movers for preferred class ${preferredClass}`);
    return {
      movers: matchedMovers.slice(0, matchingConfig.maxMoversToNotify),
      matchType: 'exact',
      preferredClass,
      actualClass: preferredClass,
      isUpgraded: false,
      upgradedFare: null,
      originalFare,
      twoSmallMoversOption: null,
      message: `Found ${matchedMovers.length} ${preferredClassConfig.name} mover(s) available`
    };
  }
  
  // Step 3: Cascade up to higher classes
  let currentClass: VehicleClass | null = preferredClass;
  let actualClass: VehicleClass | null = null;
  
  while (currentClass) {
    const nextClass = getNextHigherClass(currentClass);
    if (!nextClass) break;
    
    console.log(`[SmartMatch] No class ${currentClass} movers, trying class ${nextClass}...`);
    matchedMovers = findMoversForClass(nextClass);
    
    if (matchedMovers.length > 0) {
      actualClass = nextClass;
      const upgradedClassConfig = getVehicleClassConfig(nextClass);
      const upgradedFare = matchedMovers[0].estimatedEarnings;
      
      console.log(`[SmartMatch] Auto-upgraded to class ${nextClass} (${upgradedClassConfig.name}), fare: $${upgradedFare.toFixed(2)}`);
      
      return {
        movers: matchedMovers.slice(0, matchingConfig.maxMoversToNotify),
        matchType: 'upgraded',
        preferredClass,
        actualClass,
        isUpgraded: true,
        upgradedFare,
        originalFare,
        twoSmallMoversOption: null,
        message: `Auto-upgraded to ${upgradedClassConfig.name} (no ${preferredClassConfig.name} available)`
      };
    }
    
    currentClass = nextClass;
  }
  
  // Step 4: Check "Two Small Movers" option
  if (matchingConfig.enableTwoSmallMovers && preferredClass !== 'A' && preferredClass !== 'B') {
    // Find Class B movers (SUV/Small Cargo Van)
    const smallMovers = findMoversForClass('B');
    
    if (smallMovers.length >= 2) {
      const mover1 = smallMovers[0];
      const mover2 = smallMovers[1];
      const combinedCapacity = getVehicleCapacity(mover1.vehicleType) + getVehicleCapacity(mover2.vehicleType);
      
      if (combinedCapacity >= loadVolumeFt3) {
        const combinedFare = mover1.estimatedEarnings + mover2.estimatedEarnings;
        
        console.log(`[SmartMatch] Offering "Two Small Movers" option: combined capacity ${combinedCapacity} ft³, fare: $${combinedFare.toFixed(2)}`);
        
        return {
          movers: [],
          matchType: 'two_small_movers',
          preferredClass,
          actualClass: 'B',
          isUpgraded: false,
          upgradedFare: combinedFare,
          originalFare,
          twoSmallMoversOption: {
            mover1,
            mover2,
            combinedCapacity,
            combinedFare,
            message: `Two Small Movers can handle your ${loadVolumeFt3} ft³ load together`
          },
          message: `Two Small Movers option available (combined capacity: ${combinedCapacity} ft³)`
        };
      }
    }
  }
  
  // Step 5: No drivers available
  console.log(`[SmartMatch] No drivers available for ${loadVolumeFt3} ft³ load`);
  return {
    movers: [],
    matchType: 'none',
    preferredClass,
    actualClass: null,
    isUpgraded: false,
    upgradedFare: null,
    originalFare,
    twoSmallMoversOption: null,
    message: 'No drivers available for this load right now'
  };
}

/**
 * Calculate if a job notification has expired (10 minute timeout)
 */
export function isNotificationExpired(notifiedAt: Date, timeoutMinutes: number = 10): boolean {
  const now = new Date();
  const expiryTime = new Date(notifiedAt.getTime() + timeoutMinutes * 60 * 1000);
  return now > expiryTime;
}

/**
 * Generate expiry timestamp for a new notification
 */
export function calculateExpiryTime(timeoutMinutes: number = 10): Date {
  return new Date(Date.now() + timeoutMinutes * 60 * 1000);
}
