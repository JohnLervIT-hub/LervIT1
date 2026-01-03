import { Client, TravelMode, UnitSystem } from "@googlemaps/google-maps-services-js";
import { Coordinates } from "@shared/geocoding";

const GOOGLE_MAPS_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || "";

const client = new Client({});

export interface DrivingDistance {
  distanceKm: number;
  durationMinutes: number;
  success: boolean;
}

export interface GeocodingResult {
  coordinates: Coordinates;
  formattedAddress: string;
  success: boolean;
}

/**
 * Get driving distance and duration between two coordinates using Google Distance Matrix API
 * Falls back to straight-line calculation if API fails
 * 
 * Note: For best accuracy, coordinates should come from Google Geocoding API.
 * Current implementation uses deterministic mock geocoding which limits accuracy.
 */
export async function getDrivingDistance(
  origin: Coordinates,
  destination: Coordinates
): Promise<DrivingDistance> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("[Google Maps] API key not configured (VITE_GOOGLE_MAPS_API_KEY), using fallback Haversine calculation");
    return fallbackDistance(origin, destination);
  }

  try {
    const response = await client.distancematrix({
      params: {
        origins: [`${origin.lat},${origin.lng}`],
        destinations: [`${destination.lat},${destination.lng}`],
        mode: TravelMode.driving,
        units: UnitSystem.metric,
        key: GOOGLE_MAPS_API_KEY,
      },
      timeout: 5000,
    });

    if (response.data.status !== "OK") {
      console.warn(`[Google Maps] Distance Matrix API returned non-OK status: ${response.data.status}, falling back to Haversine`);
      return fallbackDistance(origin, destination);
    }

    const element = response.data.rows[0]?.elements[0];
    if (!element || element.status !== "OK") {
      console.warn(`[Google Maps] No valid driving route found (status: ${element?.status || "unknown"}), falling back to Haversine`);
      return fallbackDistance(origin, destination);
    }

    const distanceKm = element.distance.value / 1000; // Convert meters to km
    const durationMinutes = element.duration.value / 60; // Convert seconds to minutes

    console.log(`[Google Maps] ✓ Distance Matrix API success: ${distanceKm.toFixed(2)}km, ${durationMinutes.toFixed(0)}min driving time`);

    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationMinutes: Math.round(durationMinutes),
      success: true,
    };
  } catch (error) {
    console.error("[Google Maps] Distance Matrix API error (falling back to Haversine):", error instanceof Error ? error.message : String(error));
    return fallbackDistance(origin, destination);
  }
}

/**
 * Fallback: Calculate straight-line distance using Haversine formula
 * Used when Distance Matrix API is unavailable or fails
 */
function fallbackDistance(origin: Coordinates, destination: Coordinates): DrivingDistance {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(destination.lat - origin.lat);
  const dLng = toRadians(destination.lng - origin.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(origin.lat)) *
      Math.cos(toRadians(destination.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;

  // Estimate driving time: assume average speed of 40 km/h in city
  const durationMinutes = (distanceKm / 40) * 60;

  console.log(`[Google Maps] Using Haversine fallback: ${distanceKm.toFixed(2)}km (straight-line distance)`);

  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMinutes: Math.round(durationMinutes),
    success: false,
  };
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get driving distances from one origin to multiple destinations in a single API call
 * More efficient than calling getDrivingDistance multiple times
 * Distance Matrix API supports up to 25 destinations per request
 */
export async function getBatchDrivingDistances(
  origin: Coordinates,
  destinations: Array<{ id: string; coords: Coordinates }>
): Promise<Map<string, DrivingDistance>> {
  const results = new Map<string, DrivingDistance>();
  
  // Handle empty destinations
  if (destinations.length === 0) {
    return results;
  }
  
  // Filter out destinations with invalid coordinates
  const validDestinations = destinations.filter(d => 
    d.coords.lat !== null && d.coords.lng !== null && 
    !isNaN(d.coords.lat) && !isNaN(d.coords.lng)
  );
  
  if (validDestinations.length === 0) {
    return results;
  }
  
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("[Google Maps] API key not configured, using fallback for batch distances");
    validDestinations.forEach(dest => {
      results.set(dest.id, fallbackDistance(origin, dest.coords));
    });
    return results;
  }

  try {
    // Format destinations for API (max 25 per request)
    const destinationStrings = validDestinations.map(d => `${d.coords.lat},${d.coords.lng}`);
    
    const response = await client.distancematrix({
      params: {
        origins: [`${origin.lat},${origin.lng}`],
        destinations: destinationStrings,
        mode: TravelMode.driving,
        units: UnitSystem.metric,
        key: GOOGLE_MAPS_API_KEY,
      },
      timeout: 10000, // Longer timeout for batch requests
    });

    if (response.data.status !== "OK") {
      console.warn(`[Google Maps] Batch Distance Matrix API returned non-OK status: ${response.data.status}, falling back`);
      validDestinations.forEach(dest => {
        results.set(dest.id, fallbackDistance(origin, dest.coords));
      });
      return results;
    }

    const elements = response.data.rows[0]?.elements || [];
    
    validDestinations.forEach((dest, index) => {
      const element = elements[index];
      
      if (element && element.status === "OK") {
        const distanceKm = element.distance.value / 1000;
        const durationMinutes = element.duration.value / 60;
        
        results.set(dest.id, {
          distanceKm: Math.round(distanceKm * 100) / 100,
          durationMinutes: Math.round(durationMinutes),
          success: true,
        });
      } else {
        // Fallback for this specific destination
        results.set(dest.id, fallbackDistance(origin, dest.coords));
      }
    });
    
    console.log(`[Google Maps] ✓ Batch distance calculation: ${results.size} destinations processed`);
    
    return results;
  } catch (error) {
    console.error("[Google Maps] Batch Distance Matrix API error, using fallback:", error instanceof Error ? error.message : String(error));
    validDestinations.forEach(dest => {
      results.set(dest.id, fallbackDistance(origin, dest.coords));
    });
    return results;
  }
}

/**
 * Geocode an address to get coordinates using Google Geocoding API
 * Falls back to mock geocoding if API fails
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("[Google Maps] API key not configured, using mock geocoding");
    const { geocodeAddress: mockGeocode } = await import("@shared/geocoding");
    const result = mockGeocode(address);
    return {
      coordinates: result.coordinates,
      formattedAddress: result.formattedAddress,
      success: false,
    };
  }

  try {
    const response = await client.geocode({
      params: {
        address: `${address}, Calgary, AB, Canada`,
        key: GOOGLE_MAPS_API_KEY,
      },
      timeout: 5000,
    });

    if (response.data.status !== "OK" || !response.data.results[0]) {
      console.warn(`[Google Maps] Geocoding failed with status: ${response.data.status}, falling back to mock`);
      const { geocodeAddress: mockGeocode } = await import("@shared/geocoding");
      const result = mockGeocode(address);
      return {
        coordinates: result.coordinates,
        formattedAddress: result.formattedAddress,
        success: false,
      };
    }

    const result = response.data.results[0];
    const location = result.geometry.location;

    console.log(`[Google Maps] ✓ Geocoded "${address}" to ${location.lat}, ${location.lng}`);

    return {
      coordinates: {
        lat: location.lat,
        lng: location.lng,
      },
      formattedAddress: result.formatted_address,
      success: true,
    };
  } catch (error) {
    console.error("[Google Maps] Geocoding error, falling back to mock:", error instanceof Error ? error.message : String(error));
    const { geocodeAddress: mockGeocode } = await import("@shared/geocoding");
    const result = mockGeocode(address);
    return {
      coordinates: result.coordinates,
      formattedAddress: result.formattedAddress,
      success: false,
    };
  }
}
