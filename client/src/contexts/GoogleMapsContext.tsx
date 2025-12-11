import { createContext, useContext, useState, useEffect, useCallback } from "react";

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: Error | null;
  loadMaps: () => void;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  isLoaded: false,
  loadError: null,
  loadMaps: () => {},
});

export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}

const GOOGLE_MAPS_LIBRARIES = ["places", "geometry"];

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loadStarted, setLoadStarted] = useState(false);

  const loadMaps = useCallback(() => {
    if (loadStarted || isLoaded) return;
    setLoadStarted(true);
  }, [loadStarted, isLoaded]);

  useEffect(() => {
    if (!loadStarted) return;

    // Check if already loaded
    if (window.google?.maps) {
      setIsLoaded(true);
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setLoadError(new Error("Google Maps API key not configured"));
      return;
    }

    // Create script element
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${GOOGLE_MAPS_LIBRARIES.join(",")}`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      setIsLoaded(true);
    };

    script.onerror = () => {
      setLoadError(new Error("Failed to load Google Maps"));
    };

    document.head.appendChild(script);

    return () => {
      // Don't remove the script on unmount - keep it loaded
    };
  }, [loadStarted]);

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError, loadMaps }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}
