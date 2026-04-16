// Proximity matching algorithm for Uber-style mover assignment

import { calculateDistance, type Coordinates } from './geocoding';
import { calculatePrice, type PriceBreakdown } from './pricing';

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
}

const DEFAULT_CONFIG: MatchingConfig = {
  initialRadiusKm: 15,
  maxRadiusKm: 50,
  radiusExpansionStep: 10,
  maxMoversToNotify: 5,
};

import { VehicleType } from './furniture-database';

/**
 * Single-tier vehicle upgrade compatibility
 * Only allows upgrade to ONE tier higher to prevent extreme mismatches
 * 
 * Vehicle capacity order (smallest to largest):
 * - car → [car, pickup] (can upgrade to pickup, but not van or truck)
 * - pickup → [pickup, van] (can upgrade to van, but not truck)
 * - van → [van, truck] (can upgrade to truck)
 * - truck → [truck] (no higher tier)
 * 
 * Note: Pickup truck bed (~50-80 ft³) holds LESS than cargo van (~250-350 ft³ enclosed)
 */
const VEHICLE_PRIORITY_ORDER: VehicleType[] = ['car', 'pickup', 'van', 'truck'];

function getSingleTierCompatibility(baseType: VehicleType): VehicleType[] {
  const index = VEHICLE_PRIORITY_ORDER.indexOf(baseType);
  if (index === -1) return [VEHICLE_PRIORITY_ORDER[0]];
  
  // If already at largest tier, only that one
  if (index === VEHICLE_PRIORITY_ORDER.length - 1) {
    return [baseType];
  }
  
  // Return base type + ONE tier higher
  return [baseType, VEHICLE_PRIORITY_ORDER[index + 1]];
}

// Legacy vehicle type compatibility (kept for backward compatibility with display names)
const VEHICLE_TYPE_COMPATIBILITY: Record<string, string[]> = {
  'Car': ['car', 'pickup'],           // Single tier: Car → Pickup
  'car': ['car', 'pickup'],
  'SUV': ['car', 'pickup'],           // SUV is treated as 'car' class
  'Pickup': ['pickup', 'van'],        // Single tier: Pickup → Van
  'pickup': ['pickup', 'van'],
  'Pickup Truck': ['pickup', 'van'],
  'Van': ['van', 'truck'],            // Single tier: Van → Truck
  'van': ['van', 'truck'],
  'Cargo Van': ['van', 'truck'],
  'Truck': ['truck'],                 // Largest tier, no upgrade
  'truck': ['truck'],
  'Moving Truck': ['truck'],
  'Cube Truck': ['truck'],
  'Flatbed': ['truck'],
};

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
  // Normalize to lowercase for case-insensitive matching
  const compatibleVehicles = recommendedVehicle 
    ? (VEHICLE_TYPE_COMPATIBILITY[recommendedVehicle] || [recommendedVehicle.toLowerCase()])
    : null;
  
  // Calculate distance for each mover and enrich with earnings
  const moversWithDistance: MoverWithDistance[] = availableMovers
    .filter(m => {
      // Basic availability and location checks
      if (!m.isAvailable || m.latitude === null || m.longitude === null) {
        return false;
      }
      
      // Filter by compatible vehicle types if recommendation exists
      // Use case-insensitive comparison to handle mixed case in database
      if (compatibleVehicles && m.vehicleType) {
        const moverVehicleLower = m.vehicleType.toLowerCase();
        return compatibleVehicles.some(cv => cv.toLowerCase() === moverVehicleLower);
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

/**
 * Resolve the correct vehicle type to use for mover matching.
 * Priority: aiRecommendedVehicle (from Vision Engine) → loadSize-derived vehicle.
 * Never returns null — always produces a filterable vehicle type so the wrong
 * vehicle class is never dispatched for a job.
 *
 * loadSize mapping:
 *   'boxes'     → 'car'     (small: SUV / small vehicle)
 *   'medium'    → 'pickup'  (medium: pickup truck)
 *   'large'     → 'van'     (large: cargo van)
 *   'apartment' → 'truck'   (full: moving truck)
 */
export function resolveVehicleForBooking(
  aiRecommendedVehicle: string | null | undefined,
  loadSize: string | null | undefined
): string {
  if (aiRecommendedVehicle && aiRecommendedVehicle.trim()) {
    return aiRecommendedVehicle.trim();
  }
  switch (loadSize) {
    case 'apartment': return 'truck';
    case 'large':     return 'van';
    case 'medium':    return 'pickup';
    case 'boxes':
    default:          return 'car';
  }
}

/**
 * Result of vehicle matching with status
 */
export interface VehicleMatchingResult {
  status: 'MATCHED' | 'NO_VEHICLE_AVAILABLE';
  movers: MoverWithDistance[];
  requestedVehicle: string;
  matchedVehicle?: string;
  upgraded: boolean;
  message: string;
}

/**
 * Normalize vehicle type to lowercase for consistent matching
 * Handles legacy data with various capitalizations
 */
function normalizeVehicleType(vehicleType: string): VehicleType {
  const lower = vehicleType.toLowerCase().trim();
  
  // Map common variations to standard types
  if (lower === 'suv' || lower === 'car' || lower === 'sedan') return 'car';
  if (lower === 'van' || lower === 'cargo van' || lower === 'cargoVan') return 'van';
  if (lower === 'pickup' || lower === 'pickup truck' || lower === 'pickuptruck') return 'pickup';
  if (lower === 'truck' || lower === 'moving truck' || lower === 'cube truck' || lower === 'flatbed') return 'truck';
  
  // Default fallback based on partial matches
  if (lower.includes('van')) return 'van';
  if (lower.includes('pickup')) return 'pickup';
  if (lower.includes('truck')) return 'truck';
  
  return 'car'; // Default to smallest
}

/**
 * Find movers with single-tier upgrade logic
 * Returns MATCHED status with movers, or NO_VEHICLE_AVAILABLE if none found
 * 
 * Uses case-insensitive matching to handle legacy vehicle type data
 */
export function findMoversWithAvailabilityCheck(
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
  recommendedVehicle: string,
  config: Partial<MatchingConfig> = {}
): VehicleMatchingResult {
  // Normalize the recommended vehicle type
  const normalizedRecommended = normalizeVehicleType(recommendedVehicle);
  
  // Get single-tier compatible types
  const compatibleTypes = getSingleTierCompatibility(normalizedRecommended);
  
  // Normalize all mover vehicle types for comparison
  const normalizedMovers = availableMovers.map(m => ({
    ...m,
    normalizedVehicleType: normalizeVehicleType(m.vehicleType),
  }));
  
  // Try to find movers for each compatible type (in priority order: exact match first, then upgrade)
  for (const vehicleType of compatibleTypes) {
    const matchingMovers = normalizedMovers.filter(m => 
      m.normalizedVehicleType === vehicleType && m.isAvailable
    );
    
    if (matchingMovers.length > 0) {
      // Overwrite vehicleType with normalized value for findNearestMovers compatibility check
      const moversWithNormalizedType = matchingMovers.map(m => ({
        ...m,
        vehicleType: m.normalizedVehicleType, // Use normalized type for matching
      }));
      
      // Use existing findNearestMovers with normalized list
      const movers = findNearestMovers(
        pickupCoords,
        dropoffCoords,
        loadSize,
        moversWithNormalizedType,
        config,
        vehicleType
      );
      
      if (movers.length > 0) {
        const upgraded = vehicleType !== normalizedRecommended;
        
        return {
          status: 'MATCHED',
          movers,
          requestedVehicle: recommendedVehicle,
          matchedVehicle: vehicleType,
          upgraded,
          message: upgraded 
            ? `Upgraded to ${vehicleType} (no ${normalizedRecommended} available nearby)`
            : `Matched with ${vehicleType} movers`,
        };
      }
    }
  }
  
  // No movers available even with single-tier upgrade
  const nextTier = compatibleTypes.length > 1 ? compatibleTypes[1] : null;
  
  return {
    status: 'NO_VEHICLE_AVAILABLE',
    movers: [],
    requestedVehicle: recommendedVehicle,
    upgraded: false,
    message: nextTier
      ? `No ${normalizedRecommended} or ${nextTier} available in your area right now`
      : `No ${normalizedRecommended} available in your area right now`,
  };
}
