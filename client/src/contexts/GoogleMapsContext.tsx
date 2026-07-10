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

    // Check if already fully loaded (google.maps.Map must be a real constructor)
    if (typeof window.google?.maps?.Map === "function") {
      setIsLoaded(true);
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setLoadError(new Error("Google Maps API key not configured"));
      return;
    }

    // Use the official `callback` parameter so we know Maps is truly ready.
    // This is more reliable than script.onload when combined with loading=async.
    const callbackName = "__lervitMapsReady";
    (window as unknown as Record<string, unknown>)[callbackName] = () => {
      setIsLoaded(true);
      delete (window as unknown as Record<string, unknown>)[callbackName];
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${GOOGLE_MAPS_LIBRARIES.join(",")}&callback=${callbackName}`;
    script.async = true;
    script.defer = true;

    script.onerror = () => {
      setLoadError(new Error("Failed to load Google Maps"));
      delete (window as unknown as Record<string, unknown>)[callbackName];
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
