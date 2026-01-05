import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface LocationState {
  coords: { lat: number; lng: number } | null;
  permissionState: "prompt" | "granted" | "denied" | "unavailable" | "loading";
  lastUpdated: number | null;
  isRequesting: boolean;
}

interface LocationContextValue extends LocationState {
  requestLocation: () => void;
  refreshLocation: () => void;
  clearLocation: () => void;
}

const STORAGE_KEY = "lervit:lastLocation";
const LOCATION_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

const LocationContext = createContext<LocationContextValue | null>(null);

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
}

// Safe hook that doesn't throw - for components that may render outside provider
export function useLocationSafe() {
  return useContext(LocationContext);
}

interface StoredLocation {
  lat: number;
  lng: number;
  timestamp: number;
}

function getStoredLocation(): StoredLocation | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored) as StoredLocation;
    // Check if expired
    if (Date.now() - parsed.timestamp > LOCATION_EXPIRY_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeLocation(lat: number, lng: number): void {
  try {
    const data: StoredLocation = { lat, lng, timestamp: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage not available
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LocationState>({
    coords: null,
    permissionState: "loading",
    lastUpdated: null,
    isRequesting: false,
  });

  // Check permission and auto-request if previously granted
  useEffect(() => {
    initializeLocation();
  }, []);

  const initializeLocation = async () => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, permissionState: "unavailable" }));
      return;
    }

    // First, try to load from storage for immediate use
    const stored = getStoredLocation();
    if (stored) {
      setState(prev => ({
        ...prev,
        coords: { lat: stored.lat, lng: stored.lng },
        lastUpdated: stored.timestamp,
      }));
    }

    // Check permission status
    try {
      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: "geolocation" });
        
        setState(prev => ({ ...prev, permissionState: result.state as LocationState["permissionState"] }));
        
        // Listen for permission changes
        result.onchange = () => {
          setState(prev => ({ ...prev, permissionState: result.state as LocationState["permissionState"] }));
          // Auto-request if permission just changed to granted
          if (result.state === "granted") {
            silentRefresh();
          }
        };

        // If permission was previously granted, silently refresh location
        if (result.state === "granted") {
          silentRefresh();
        }
      } else {
        // Permissions API not available - try to get location directly
        setState(prev => ({ ...prev, permissionState: "prompt" }));
      }
    } catch {
      setState(prev => ({ ...prev, permissionState: "prompt" }));
    }
  };

  const silentRefresh = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        storeLocation(coords.lat, coords.lng);
        setState(prev => ({
          ...prev,
          coords,
          permissionState: "granted",
          lastUpdated: Date.now(),
          isRequesting: false,
        }));
      },
      () => {
        // Silent failure - don't update permission state on error
        setState(prev => ({ ...prev, isRequesting: false }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const requestLocation = useCallback(() => {
    setState(prev => ({ ...prev, isRequesting: true }));
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        storeLocation(coords.lat, coords.lng);
        setState(prev => ({
          ...prev,
          coords,
          permissionState: "granted",
          lastUpdated: Date.now(),
          isRequesting: false,
        }));
      },
      (error) => {
        setState(prev => ({
          ...prev,
          isRequesting: false,
          permissionState: error.code === error.PERMISSION_DENIED ? "denied" : prev.permissionState,
        }));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const refreshLocation = useCallback(() => {
    if (state.permissionState === "granted") {
      silentRefresh();
    } else {
      requestLocation();
    }
  }, [state.permissionState, silentRefresh, requestLocation]);

  const clearLocation = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(prev => ({
      ...prev,
      coords: null,
      lastUpdated: null,
    }));
  }, []);

  return (
    <LocationContext.Provider
      value={{
        ...state,
        requestLocation,
        refreshLocation,
        clearLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}
