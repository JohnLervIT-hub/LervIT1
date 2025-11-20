// Mock geocoding utility for Calgary addresses
// Uses predefined coordinates for common Calgary locations

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GeocodedAddress {
  address: string;
  coordinates: Coordinates;
  formattedAddress: string;
}

// Mock Calgary coordinates database
const CALGARY_LOCATIONS: Record<string, Coordinates> = {
  // Downtown Calgary
  "downtown": { lat: 51.0447, lng: -114.0719 },
  "17 ave": { lat: 51.0375, lng: -114.0719 },
  "stephen avenue": { lat: 51.0466, lng: -114.0703 },
  
  // Neighborhoods - NW
  "brentwood": { lat: 51.0861, lng: -114.1311 },
  "university heights": { lat: 51.0789, lng: -114.1386 },
  "kensington": { lat: 51.0536, lng: -114.0869 },
  "hillhurst": { lat: 51.0547, lng: -114.0922 },
  "hounsfield heights": { lat: 51.0594, lng: -114.0886 },
  "capitol hill": { lat: 51.0633, lng: -114.0836 },
  "mount pleasant": { lat: 51.0572, lng: -114.0803 },
  "rosedale": { lat: 51.0594, lng: -114.0672 },
  "tuxedo park": { lat: 51.0678, lng: -114.0783 },
  "banff trail": { lat: 51.0792, lng: -114.1144 },
  
  // Neighborhoods - NE
  "bridgeland": { lat: 51.0594, lng: -114.0425 },
  "renfrew": { lat: 51.0619, lng: -114.0283 },
  "marlborough": { lat: 51.0589, lng: -113.9639 },
  "temple": { lat: 51.0808, lng: -113.9886 },
  "falconridge": { lat: 51.1094, lng: -113.9544 },
  "taradale": { lat: 51.1333, lng: -113.9639 },
  
  // Neighborhoods - SW
  "beltline": { lat: 51.0375, lng: -114.0719 },
  "mission": { lat: 51.0342, lng: -114.0836 },
  "cliff bungalow": { lat: 51.0328, lng: -114.0719 },
  "bankview": { lat: 51.0289, lng: -114.1022 },
  "south calgary": { lat: 50.9850, lng: -114.0719 },
  "marda loop": { lat: 51.0167, lng: -114.1089 },
  "killarney": { lat: 51.0147, lng: -114.1311 },
  "glenmore": { lat: 50.9950, lng: -114.1189 },
  "lakeview": { lat: 51.0083, lng: -114.1519 },
  "altadore": { lat: 51.0203, lng: -114.1144 },
  
  // Neighborhoods - SE
  "inglewood": { lat: 51.0383, lng: -114.0406 },
  "forest lawn": { lat: 51.0431, lng: -113.9656 },
  "dover": { lat: 50.9992, lng: -113.9800 },
  "legacy": { lat: 50.8878, lng: -113.9611 },
  "mahogany": { lat: 50.8869, lng: -113.9214 },
  "cranston": { lat: 50.9108, lng: -113.9569 },
  "auburn bay": { lat: 50.8647, lng: -113.9403 },
  "sundance": { lat: 50.8928, lng: -114.0319 },
  
  // Common landmarks
  "yyc": { lat: 51.1311, lng: -114.0131 },
  "airport": { lat: 51.1311, lng: -114.0131 },
  "university": { lat: 51.0792, lng: -114.1311 },
  "sait": { lat: 51.0644, lng: -114.0953 },
  "chinook centre": { lat: 50.9978, lng: -114.0711 },
  "market mall": { lat: 51.0839, lng: -114.1486 },
  "crossiron": { lat: 51.2069, lng: -113.9808 },
  "core shopping": { lat: 51.0475, lng: -114.0703 },
  "stampede grounds": { lat: 51.0386, lng: -114.0522 },
  "mcmahon stadium": { lat: 51.0703, lng: -114.1311 },
};

/**
 * Haversine formula to calculate distance between two coordinates
 * Returns distance in kilometers
 */
export function calculateDistance(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLng = toRadians(coord2.lng - coord1.lng);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.lat)) *
      Math.cos(toRadians(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Simple deterministic hash function for strings
 * Returns a number between 0 and 1 based on string input
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Normalize to 0-1 range
  return Math.abs(hash) / 2147483647;
}

/**
 * Mock geocoding function
 * Attempts to match the address to known Calgary locations
 * Falls back to generating DETERMINISTIC coordinates based on address hash
 */
export function geocodeAddress(address: string): GeocodedAddress {
  const normalized = address.toLowerCase().trim();
  
  // Try to find a matching location
  for (const [key, coords] of Object.entries(CALGARY_LOCATIONS)) {
    if (normalized.includes(key)) {
      return {
        address,
        coordinates: coords,
        formattedAddress: `${address}, Calgary, AB`,
      };
    }
  }
  
  // If no match, generate DETERMINISTIC coordinates based on address hash
  // Calgary bounds: roughly 50.84 to 51.18 lat, -114.27 to -113.87 lng
  const latHash = hashString(normalized + "_lat");
  const lngHash = hashString(normalized + "_lng");
  
  const deterministicCoords: Coordinates = {
    lat: 50.84 + latHash * 0.34, // Range: 50.84 - 51.18
    lng: -114.27 + lngHash * 0.40, // Range: -114.27 to -113.87
  };
  
  return {
    address,
    coordinates: deterministicCoords,
    formattedAddress: `${address}, Calgary, AB`,
  };
}

/**
 * Generate random coordinates within Calgary for testing
 */
export function generateRandomCalgaryCoordinates(): Coordinates {
  return {
    lat: 50.84 + Math.random() * 0.34,
    lng: -114.27 + Math.random() * 0.40,
  };
}

/**
 * Get a specific test location by name
 */
export function getTestLocation(name: string): Coordinates | null {
  return CALGARY_LOCATIONS[name.toLowerCase()] || null;
}
