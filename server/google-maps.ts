import { Client, TravelMode, UnitSystem } from "@googlemaps/google-maps-services-js";
import { Coordinates } from "@shared/geocoding";

const GOOGLE_MAPS_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || "";

const client = new Client({});

export interface DrivingDistance {
  distanceKm: number;
  durationMinutes: number;
  success: boolean;
}

/**
 * Get driving distance and duration between two coordinates using Google Distance Matrix API
 * Falls back to straight-line calculation if API fails
 */
export async function getDrivingDistance(
  origin: Coordinates,
  destination: Coordinates
): Promise<DrivingDistance> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("[Google Maps] API key not configured, using fallback distance calculation");
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
      console.warn(`[Google Maps] Distance Matrix API returned status: ${response.data.status}`);
      return fallbackDistance(origin, destination);
    }

    const element = response.data.rows[0]?.elements[0];
    if (!element || element.status !== "OK") {
      console.warn(`[Google Maps] No valid route found`);
      return fallbackDistance(origin, destination);
    }

    const distanceKm = element.distance.value / 1000; // Convert meters to km
    const durationMinutes = element.duration.value / 60; // Convert seconds to minutes

    console.log(`[Google Maps] Driving distance: ${distanceKm.toFixed(2)}km, Duration: ${durationMinutes.toFixed(0)}min`);

    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationMinutes: Math.round(durationMinutes),
      success: true,
    };
  } catch (error) {
    console.error("[Google Maps] Distance Matrix API error:", error);
    return fallbackDistance(origin, destination);
  }
}

/**
 * Fallback: Calculate straight-line distance using Haversine formula
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

  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMinutes: Math.round(durationMinutes),
    success: false,
  };
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
