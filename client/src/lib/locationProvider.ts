// Location Provider abstraction for Google Places
// Uses google.maps.places.Place (new API) — migrated from deprecated PlacesService

export interface AddressPrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface GeocodedLocation {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId?: string;
}

export interface PlaceDetails {
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  name?: string;
  streetNumber?: string;
  route?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
}

export interface LocationProviderError {
  code: 'NETWORK_ERROR' | 'API_ERROR' | 'NO_RESULTS' | 'INVALID_REQUEST';
  message: string;
  originalError?: unknown;
}

/**
 * Autocomplete address search
 * Uses backend proxy to avoid CORS issues with Google Places API
 */
export async function autocompleteAddress(
  query: string,
  sessionToken?: string
): Promise<AddressPrediction[]> {
  if (!query || query.length < 3) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      input: query,
      ...(sessionToken && { sessiontoken: sessionToken }),
    });

    const response = await fetch(`/api/places/autocomplete?${params}`);
    
    if (!response.ok) {
      throw createLocationError('API_ERROR', `Failed to fetch predictions: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.predictions || data.predictions.length === 0) {
      return [];
    }

    return data.predictions.map((p: any) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text || p.description,
      secondaryText: p.structured_formatting?.secondary_text || '',
    }));
  } catch (error) {
    if (isLocationProviderError(error)) {
      throw error;
    }
    throw createLocationError('NETWORK_ERROR', 'Failed to connect to location service', error);
  }
}

/**
 * Get place details from a place ID
 * Uses the new google.maps.places.Place API (replaces deprecated PlacesService)
 */
export async function getPlaceDetails(
  placeId: string,
): Promise<PlaceDetails> {
  if (!window.google?.maps?.places) {
    throw createLocationError('API_ERROR', 'Google Maps Places library not loaded');
  }

  const PlaceClass = (window.google.maps.places as any).Place;
  if (!PlaceClass) {
    throw createLocationError('API_ERROR', 'google.maps.places.Place not available');
  }

  try {
    const place = new PlaceClass({ id: placeId });
    await place.fetchFields({
      fields: ['formattedAddress', 'location', 'addressComponents', 'id', 'displayName'],
    });

    if (!place.location) {
      throw createLocationError('NO_RESULTS', 'No location found for place');
    }

    const components: any[] = place.addressComponents || [];
    const getComponent = (type: string): string | undefined => {
      return components.find((c: any) => c.types?.includes(type))?.longText;
    };

    return {
      placeId: place.id || placeId,
      formattedAddress: place.formattedAddress || '',
      latitude: place.location.lat(),
      longitude: place.location.lng(),
      name: place.displayName,
      streetNumber: getComponent('street_number'),
      route: getComponent('route'),
      city: getComponent('locality') || getComponent('sublocality'),
      province: getComponent('administrative_area_level_1'),
      postalCode: getComponent('postal_code'),
      country: getComponent('country'),
    };
  } catch (error) {
    if (isLocationProviderError(error)) throw error;
    throw createLocationError('API_ERROR', 'Failed to fetch place details', error);
  }
}

/**
 * Geocode a place ID to coordinates
 * Wrapper around getPlaceDetails for simple coordinate lookup
 */
export async function geocodePlaceId(
  placeId: string,
): Promise<GeocodedLocation> {
  const details = await getPlaceDetails(placeId);
  return {
    latitude: details.latitude,
    longitude: details.longitude,
    formattedAddress: details.formattedAddress,
    placeId: details.placeId,
  };
}

/**
 * Reverse geocode coordinates to address
 * Uses Google Geocoder API
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeocodedLocation | null> {
  return new Promise((resolve, reject) => {
    if (!window.google?.maps?.Geocoder) {
      reject(createLocationError('API_ERROR', 'Geocoder not available'));
      return;
    }

    const geocoder = new google.maps.Geocoder();
    
    geocoder.geocode(
      { location: { lat: latitude, lng: longitude } },
      (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          resolve({
            latitude,
            longitude,
            formattedAddress: results[0].formatted_address,
            placeId: results[0].place_id,
          });
        } else if (status === google.maps.GeocoderStatus.ZERO_RESULTS) {
          resolve(null);
        } else {
          reject(createLocationError('API_ERROR', `Geocoder error: ${status}`));
        }
      }
    );
  });
}

/**
 * Generate a session token for billing optimization
 * Session tokens group autocomplete + place details calls
 */
export function generateSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Error helpers
function createLocationError(
  code: LocationProviderError['code'],
  message: string,
  originalError?: unknown
): LocationProviderError {
  return { code, message, originalError };
}

function isLocationProviderError(error: unknown): error is LocationProviderError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

export { isLocationProviderError };
