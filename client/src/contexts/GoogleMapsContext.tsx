import { createContext, useContext, useState, useCallback, useEffect } from "react";

/**
 * GoogleMapsContext - TRUE lazy loading for Google Maps API
 * API is NOT loaded on initial render - only when a component requests it
 * This prevents blocking FCP/LCP with external API loading
 */

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: Error | undefined;
  requestMaps: () => void;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  isLoaded: false,
  loadError: undefined,
  requestMaps: () => {},
});

// CRITICAL: Libraries array MUST be defined outside component
const GOOGLE_MAPS_LIBRARIES = ["places", "geometry"];

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  const [mapsRequested, setMapsRequested] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | undefined>(undefined);

  // Components call this when they need Google Maps
  const requestMaps = useCallback(() => {
    if (!mapsRequested) {
      setMapsRequested(true);
    }
  }, [mapsRequested]);

  // Load Google Maps script manually when requested
  useEffect(() => {
    if (!mapsRequested) return;
    
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setLoadError(new Error("Google Maps API key not configured"));
      return;
    }

    // Check if already loaded (including places library)
    if (window.google?.maps?.places) {
      setIsLoaded(true);
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Wait for existing script to load (including places library)
      const checkLoaded = setInterval(() => {
        if (window.google?.maps?.places) {
          setIsLoaded(true);
          clearInterval(checkLoaded);
        }
      }, 100);
      return () => clearInterval(checkLoaded);
    }

    // Create and append script
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${GOOGLE_MAPS_LIBRARIES.join(",")}&loading=async`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      // Wait for places library to be available (async loading)
      const checkPlaces = setInterval(() => {
        if (window.google?.maps?.places) {
          setIsLoaded(true);
          clearInterval(checkPlaces);
        }
      }, 50);
      // Timeout after 10 seconds
      setTimeout(() => clearInterval(checkPlaces), 10000);
    };
    
    script.onerror = () => {
      setLoadError(new Error("Failed to load Google Maps"));
    };
    
    document.head.appendChild(script);
  }, [mapsRequested]);

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError, requestMaps }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

/**
 * Hook for components that need Google Maps
 * Call requestMaps() in useEffect to trigger lazy loading
 */
export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}

export { GoogleMapsContext };
