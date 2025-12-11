import { createContext, useContext } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

/**
 * GoogleMapsContext - Lazy loading for Google Maps API using @react-google-maps/api
 * Loads the API only when components that need it are mounted
 * Prevents blocking initial page render with external API loading
 */

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: Error | undefined;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  isLoaded: false,
  loadError: undefined,
});

// CRITICAL: Libraries array MUST be defined outside component to prevent reloads
const GOOGLE_MAPS_LIBRARIES: ("places" | "drawing" | "geometry" | "visualization")[] = ["places", "geometry"];

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  // Use the @react-google-maps/api loader for consistent behavior
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

/**
 * Hook for components that need Google Maps
 * Returns loading state - API is loaded when GoogleMapsProvider mounts
 */
export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}

export { GoogleMapsContext };
