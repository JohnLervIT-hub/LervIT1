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

/**
 * Find nearest available movers to a pickup location
 * Returns movers sorted by distance, limited to top N
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
  config: Partial<MatchingConfig> = {}
): MoverWithDistance[] {
  const matchingConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Calculate pickup to dropoff distance
  const jobDistance = calculateDistance(pickupCoords, dropoffCoords);
  
  // Calculate distance for each mover and enrich with earnings
  const moversWithDistance: MoverWithDistance[] = availableMovers
    .filter(m => m.isAvailable && m.latitude !== null && m.longitude !== null)
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
