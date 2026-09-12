// Proximity matching algorithm for Uber-style mover assignment

import { calculateDistance, type Coordinates } from './geocoding';
import {
  calculatePrice,
  getVehicleClassFromVolume,
  vehicleClassFromVehicleType,
  VEHICLE_CAPACITY_RANGES,
  PRICING_CONFIG,
  type PriceBreakdown,
  type VehicleClass,
} from './pricing';

const CLASS_HIERARCHY: Record<VehicleClass, number> = { A: 1, B: 2, C: 3, E: 4 };

/**
 * True when the mover's vehicle class ≥ the class required for the booking's
 * volume. A bigger vehicle can always carry a smaller load. When rawVolumeCuft
 * is null/undefined, no restriction is applied (caller-driven default).
 */
export function moverCanHandleBooking(
  moverVehicleType: string | null | undefined,
  bookingRawVolumeCuft: number | null | undefined,
): boolean {
  if (bookingRawVolumeCuft == null || !Number.isFinite(bookingRawVolumeCuft)) return true;
  const moverClass = vehicleClassFromVehicleType(moverVehicleType);
  const requiredClass = getVehicleClassFromVolume(bookingRawVolumeCuft);
  return CLASS_HIERARCHY[moverClass] >= CLASS_HIERARCHY[requiredClass];
}

/** Convenience: mover → its VehicleClass. */
export function getMoverVehicleClass(
  moverVehicleType: string | null | undefined,
): VehicleClass {
  return vehicleClassFromVehicleType(moverVehicleType);
}

/** Convenience: expose the class-hierarchy rank for callers that need it. */
export function getVehicleClassRank(cls: VehicleClass): number {
  return CLASS_HIERARCHY[cls];
}

/**
 * Resolve the raw volume to use for capacity filtering. AI-detected volume
 * wins; otherwise fall back to the load-size volume estimate.
 */
function resolveRawVolumeForFilter(
  bookingRawVolumeCuft: number | null | undefined,
  loadSize: string | null | undefined,
): number | null {
  if (typeof bookingRawVolumeCuft === 'number' && bookingRawVolumeCuft > 0) {
    return bookingRawVolumeCuft;
  }
  if (loadSize && PRICING_CONFIG.loadSizeVolumes[loadSize] != null) {
    return PRICING_CONFIG.loadSizeVolumes[loadSize];
  }
  return null;
}

// Re-export so callers importing from '@shared/matching' can get the range table.
export { VEHICLE_CAPACITY_RANGES };

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
  recommendedVehicle?: string | null,
  bookingRawVolumeCuft?: number | null,
): MoverWithDistance[] {
  const matchingConfig = { ...DEFAULT_CONFIG, ...config };

  // Calculate pickup to dropoff distance
  const jobDistance = calculateDistance(pickupCoords, dropoffCoords);

  // Get compatible vehicle types if recommendation provided
  // Normalize to lowercase for case-insensitive matching
  const compatibleVehicles = recommendedVehicle
    ? (VEHICLE_TYPE_COMPATIBILITY[recommendedVehicle] || [recommendedVehicle.toLowerCase()])
    : null;

  // Class-hierarchy floor: mover must have ≥ the required class for this
  // booking's volume. AI-detected volume wins; otherwise infer from loadSize.
  const rawVolumeForCapacity = resolveRawVolumeForFilter(bookingRawVolumeCuft, loadSize);

  // Calculate distance for each mover and enrich with earnings
  const moversWithDistance: MoverWithDistance[] = availableMovers
    .filter(m => {
      // Basic availability and location checks
      if (!m.isAvailable || m.latitude === null || m.longitude === null) {
        return false;
      }

      // Filter by compatible vehicle types if recommendation exists.
      // Normalize both sides so "Moving Truck", "Large Truck (26ft)" etc. all
      // resolve to the canonical 'truck' tier before comparison.
      if (compatibleVehicles && m.vehicleType) {
        const moverNormalized = normalizeVehicleType(m.vehicleType);
        if (!compatibleVehicles.some(cv => normalizeVehicleType(cv) === moverNormalized)) {
          return false;
        }
      }

      // Class-based capacity check: a mover's vehicle class must be ≥ the
      // required class for this booking's volume. Prevents e.g. a Class B
      // pickup accepting a Class E full-apartment job even if the string
      // tier compatibility would have allowed it.
      if (!moverCanHandleBooking(m.vehicleType, rawVolumeForCapacity)) {
        return false;
      }

      return true;
    })
    .map(mover => {
      const moverCoords: Coordinates = {
        lat: mover.latitude!,
        lng: mover.longitude!,
      };
      
      const distanceToPickup = calculateDistance(moverCoords, pickupCoords);
      
      // Calculate price breakdown for mover-facing earnings estimate.
      // Difficulty / heavy-item / mover count are booking-specific and default.
      // Mover-to-pickup travel fee is no longer part of the pricing model.
      void distanceToPickup;
      const priceBreakdown = calculatePrice({
        distanceKm: jobDistance,
        loadSize,
        pickupDifficulty: 'ground',
        dropoffDifficulty: 'ground',
        heavyItem: false,
        numberOfMovers: 1,
      });

      return {
        ...mover,
        latitude: mover.latitude!,
        longitude: mover.longitude!,
        distanceToPickup,
        estimatedEarnings: priceBreakdown.total,
        priceBreakdown,
      };
    })
    .sort((a, b) => a.distanceToPickup - b.distanceToPickup);
  
  // Apply radius filtering with automatic expansion (distance-based, for
  // the candidate pool — see AC-2 in dispatch.ts).
  let radius = matchingConfig.initialRadiusKm;
  let matchedMovers: MoverWithDistance[] = [];

  while (matchedMovers.length < matchingConfig.maxMoversToNotify && radius <= matchingConfig.maxRadiusKm) {
    matchedMovers = moversWithDistance.filter(m => m.distanceToPickup <= radius);

    if (matchedMovers.length < matchingConfig.maxMoversToNotify) {
      radius += matchingConfig.radiusExpansionStep;
    }
  }

  // Re-rank the candidate pool by combined score: 60% proximity, 40% rating.
  // A high-rated mover slightly farther away can beat a low-rated closer one,
  // but the radius cap above already prevents "5-star mover 100 km away".
  const scoreMaxKm = matchingConfig.maxRadiusKm;
  const scored = matchedMovers.map(m => ({
    mover: m,
    score: computeDispatchScore(m.distanceToPickup, m.rating, scoreMaxKm),
  }));
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, matchingConfig.maxMoversToNotify).map(s => s.mover);
}

// Combined dispatch score: 60% distance (closer = higher), 40% rating.
// Unrated movers (rating <= 0) get neutral 3/5 so they aren't buried.
export function computeDispatchScore(distanceKm: number, ratingStr: string, maxKm: number): number {
  const rating = parseFloat(ratingStr || '0');
  const effectiveRating = rating > 0 ? rating : 3;
  const ratingScore = Math.min(1, Math.max(0, effectiveRating / 5));
  const distanceScore = maxKm > 0
    ? Math.min(1, Math.max(0, 1 - distanceKm / maxKm))
    : 0;
  return distanceScore * 0.6 + ratingScore * 0.4;
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
  config: Partial<MatchingConfig> = {},
  bookingRawVolumeCuft?: number | null,
): VehicleMatchingResult {
  // Normalize the recommended vehicle type
  const normalizedRecommended = normalizeVehicleType(recommendedVehicle);

  // Get single-tier compatible types
  const compatibleTypes = getSingleTierCompatibility(normalizedRecommended);

  // Class-based capacity gate applied before per-tier iteration — prunes
  // movers whose class is below the required class regardless of tier upgrade.
  const rawVolumeForCapacity = resolveRawVolumeForFilter(bookingRawVolumeCuft, loadSize);

  // Normalize all mover vehicle types for comparison
  const normalizedMovers = availableMovers
    .filter(m => moverCanHandleBooking(m.vehicleType, rawVolumeForCapacity))
    .map(m => ({
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
        vehicleType,
        bookingRawVolumeCuft,
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
