/**
 * Vehicle Availability Matching System
 * Handles matching customer requests to available online vehicles
 * with single-tier upgrade logic
 */

import { VehicleType, getVehicleFromVolume, getVehicleDisplayName } from './furniture-database';

export interface OnlineMover {
  id: string;
  userId: string;
  vehicleType: VehicleType;
  distanceKm: number;
  etaMinutes: number;
  isAvailable: boolean;
}

export interface VehicleMatchResult {
  totalVolumeFt3: number;
  requestedVehicleType: VehicleType;
  requestedVehicleDisplay: string;
  matchedVehicleType?: VehicleType;
  matchedVehicleDisplay?: string;
  matchedMoverId?: string;
  upgraded: boolean;
  status: 'MATCHED' | 'NO_VEHICLE_AVAILABLE';
  message: string;
}

/**
 * Vehicle priority order from smallest to largest
 * Used for determining upgrade path
 */
const VEHICLE_PRIORITY_ORDER: VehicleType[] = ['car', 'van', 'pickup', 'truck'];

/**
 * Get only the requested vehicle type + ONE tier higher
 * This limits upgrades to prevent extreme mismatches
 * 
 * Examples:
 * - car → [car, van]
 * - van → [van, pickup]
 * - pickup → [pickup, truck]
 * - truck → [truck] (no higher tier available)
 */
function getNextTierOnly(baseType: VehicleType): VehicleType[] {
  const index = VEHICLE_PRIORITY_ORDER.indexOf(baseType);
  
  if (index === -1) {
    return [VEHICLE_PRIORITY_ORDER[0]]; // Default to smallest if unknown
  }
  
  // If already at largest tier, only check that one
  if (index === VEHICLE_PRIORITY_ORDER.length - 1) {
    return [baseType];
  }
  
  // Return base type + next tier (max 2 options)
  return [baseType, VEHICLE_PRIORITY_ORDER[index + 1]];
}

/**
 * Match a customer's volume requirement to available online movers
 * Uses single-tier upgrade logic:
 * 1. First checks for exact vehicle type match
 * 2. If not available, checks ONE tier higher
 * 3. If still not available, returns NO_VEHICLE_AVAILABLE
 * 
 * @param totalVolumeFt3 - Total volume of items in cubic feet
 * @param onlineMovers - List of currently online and available movers
 * @returns VehicleMatchResult with match status and details
 */
export function matchVehicleForVolume(
  totalVolumeFt3: number,
  onlineMovers: OnlineMover[]
): VehicleMatchResult {
  // Determine the required vehicle type based on volume
  const requestedVehicleType = getVehicleFromVolume(totalVolumeFt3);
  const requestedVehicleDisplay = getVehicleDisplayName(requestedVehicleType);
  
  // Get candidate vehicle types (requested + one tier up)
  const candidateTypes = getNextTierOnly(requestedVehicleType);
  
  // Try to find an available mover for each candidate type (in order)
  for (const vehicleType of candidateTypes) {
    // Filter movers by vehicle type and availability, then sort by distance
    // Use case-insensitive comparison to handle mixed case in database
    const candidates = onlineMovers
      .filter(mover => mover.vehicleType.toLowerCase() === vehicleType.toLowerCase() && mover.isAvailable)
      .sort((a, b) => a.distanceKm - b.distanceKm); // Closest first
    
    if (candidates.length > 0) {
      const bestMatch = candidates[0];
      const upgraded = vehicleType !== requestedVehicleType;
      const matchedVehicleDisplay = getVehicleDisplayName(vehicleType);
      
      return {
        totalVolumeFt3,
        requestedVehicleType,
        requestedVehicleDisplay,
        matchedVehicleType: vehicleType,
        matchedVehicleDisplay,
        matchedMoverId: bestMatch.id,
        upgraded,
        status: 'MATCHED',
        message: upgraded 
          ? `Upgraded to ${matchedVehicleDisplay} (no ${requestedVehicleDisplay} available nearby)`
          : `Matched with ${matchedVehicleDisplay}`,
      };
    }
  }
  
  // No suitable vehicle available (even with upgrade)
  const nextTier = candidateTypes.length > 1 
    ? getVehicleDisplayName(candidateTypes[1]) 
    : null;
  
  return {
    totalVolumeFt3,
    requestedVehicleType,
    requestedVehicleDisplay,
    upgraded: false,
    status: 'NO_VEHICLE_AVAILABLE',
    message: nextTier
      ? `No ${requestedVehicleDisplay} or ${nextTier} available in your area right now`
      : `No ${requestedVehicleDisplay} available in your area right now`,
  };
}

/**
 * Check if any compatible vehicles are online before booking
 * Useful for pre-validation before payment
 * 
 * @param totalVolumeFt3 - Total volume of items in cubic feet
 * @param onlineMovers - List of currently online and available movers
 * @returns Boolean indicating if at least one compatible mover is available
 */
export function hasCompatibleVehicleOnline(
  totalVolumeFt3: number,
  onlineMovers: OnlineMover[]
): boolean {
  const result = matchVehicleForVolume(totalVolumeFt3, onlineMovers);
  return result.status === 'MATCHED';
}

/**
 * Get available vehicle types from online movers
 * Useful for showing customers what's currently available
 * 
 * @param onlineMovers - List of currently online and available movers
 * @returns Array of unique vehicle types that are online
 */
export function getAvailableVehicleTypes(onlineMovers: OnlineMover[]): VehicleType[] {
  const availableTypes = new Set<VehicleType>();
  
  for (const mover of onlineMovers) {
    if (mover.isAvailable) {
      availableTypes.add(mover.vehicleType);
    }
  }
  
  // Return in priority order
  return VEHICLE_PRIORITY_ORDER.filter(type => availableTypes.has(type));
}

/**
 * Suggest alternative options when no vehicle is available
 * 
 * @param totalVolumeFt3 - Total volume of items in cubic feet
 * @param onlineMovers - List of currently online and available movers
 * @returns Suggestions for the customer
 */
export function getSuggestionsWhenNoMatch(
  totalVolumeFt3: number,
  onlineMovers: OnlineMover[]
): string[] {
  const suggestions: string[] = [];
  const requestedType = getVehicleFromVolume(totalVolumeFt3);
  const availableTypes = getAvailableVehicleTypes(onlineMovers);
  
  if (availableTypes.length === 0) {
    suggestions.push('No movers are currently online. Try again in a few minutes.');
    suggestions.push('Schedule your move for later today or tomorrow.');
  } else {
    // Check if a smaller vehicle could work (if customer reduces items)
    const requestedIndex = VEHICLE_PRIORITY_ORDER.indexOf(requestedType);
    const smallerAvailable = availableTypes.filter(
      type => VEHICLE_PRIORITY_ORDER.indexOf(type) < requestedIndex
    );
    
    if (smallerAvailable.length > 0) {
      const smallestAvailable = getVehicleDisplayName(smallerAvailable[0]);
      suggestions.push(`Consider reducing your load - ${smallestAvailable} movers are available.`);
    }
    
    suggestions.push('Try scheduling for a different time when more movers are online.');
    suggestions.push('Join our waitlist to be notified when a mover becomes available.');
  }
  
  return suggestions;
}
