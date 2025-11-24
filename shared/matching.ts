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

// Vehicle type recommendations based on weight class
const VEHICLE_TYPE_COMPATIBILITY: Record<string, string[]> = {
  'Car': ['Car', 'SUV'],
  'SUV': ['SUV', 'Car', 'Pickup'],
  'Pickup': ['Pickup', 'SUV', 'Cargo Van'],
  'Cargo Van': ['Cargo Van', 'Pickup', 'Cube Truck'],
  'Cube Truck': ['Cube Truck', 'Cargo Van', 'Flatbed'],
  'Flatbed': ['Flatbed', 'Cube Truck'],
};

/**
 * Find nearest available movers to a pickup location
 * Returns movers sorted by distance, limited to top N
 * Filters by recommended vehicle type if provided
 */
export function findNearestMovers(
  pickupCoords: Coordinates,
  dropoffCoords: Coordinates,
  loadSize: 'small' | 'medium' | 'large',
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
