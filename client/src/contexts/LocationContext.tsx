import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Capacitor } from "@capacitor/core";

interface LocationState {
  coords: { lat: number; lng: number } | null;
  isApproximate: boolean;
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
const LOCATION_EXPIRY_MS = 15 * 60 * 1000;

export const CALGARY_FALLBACK = { lat: 51.0447, lng: -114.0719 };

const LocationContext = createContext<LocationContextValue | null>(null);

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
}

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

async function getCapacitorPosition(): Promise<{ lat: number; lng: number }> {
  const { Geolocation } = await import("@capacitor/geolocation");
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10000,
  });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

async function checkCapacitorPermission(): Promise<"granted" | "denied" | "prompt"> {
  const { Geolocation } = await import("@capacitor/geolocation");
  const status = await Geolocation.checkPermissions();
  return status.location as "granted" | "denied" | "prompt";
}

async function requestCapacitorPermission(): Promise<"granted" | "denied" | "prompt"> {
  const { Geolocation } = await import("@capacitor/geolocation");
  const status = await Geolocation.requestPermissions();
  return status.location as "granted" | "denied" | "prompt";
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LocationState>({
    coords: null,
    isApproximate: false,
    permissionState: "loading",
    lastUpdated: null,
    isRequesting: false,
  });

  const applyFallback = useCallback(
    (permissionState?: LocationState["permissionState"]) => {
      setState(prev => ({
        ...prev,
        coords: { lat: CALGARY_FALLBACK.lat, lng: CALGARY_FALLBACK.lng },
        isApproximate: true,
        isRequesting: false,
        permissionState: permissionState ?? prev.permissionState,
      }));
    },
    [],
  );

  useEffect(() => {
    initializeLocation();
  }, []);

  const initializeLocation = async () => {
    const stored = getStoredLocation();
    if (stored) {
      setState(prev => ({
        ...prev,
        coords: { lat: stored.lat, lng: stored.lng },
        isApproximate: false,
        lastUpdated: stored.timestamp,
      }));
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const permission = await checkCapacitorPermission();
        setState(prev => ({ ...prev, permissionState: permission }));
        if (permission === "granted") {
          silentRefresh();
        } else if (permission === "denied" && !stored) {
          applyFallback("denied");
        }
      } catch {
        setState(prev => ({ ...prev, permissionState: "prompt" }));
      }
      return;
    }

    if (!navigator.geolocation) {
      applyFallback("unavailable");
      return;
    }

    try {
      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: "geolocation" });
        setState(prev => ({ ...prev, permissionState: result.state as LocationState["permissionState"] }));
        result.onchange = () => {
          setState(prev => ({ ...prev, permissionState: result.state as LocationState["permissionState"] }));
          if (result.state === "granted") silentRefresh();
          else if (result.state === "denied") applyFallback("denied");
        };
        if (result.state === "granted") silentRefresh();
        else if (result.state === "denied" && !stored) applyFallback("denied");
      } else {
        setState(prev => ({ ...prev, permissionState: "prompt" }));
      }
    } catch {
      setState(prev => ({ ...prev, permissionState: "prompt" }));
    }
  };

  const silentRefresh = useCallback(() => {
    if (Capacitor.isNativePlatform()) {
      getCapacitorPosition()
        .then(coords => {
          storeLocation(coords.lat, coords.lng);
          setState(prev => ({
            ...prev,
            coords,
            isApproximate: false,
            permissionState: "granted",
            lastUpdated: Date.now(),
            isRequesting: false,
          }));
        })
        .catch(() => {
          setState(prev => (prev.coords ? { ...prev, isRequesting: false } : {
            ...prev,
            coords: { lat: CALGARY_FALLBACK.lat, lng: CALGARY_FALLBACK.lng },
            isApproximate: true,
            isRequesting: false,
          }));
        });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        storeLocation(coords.lat, coords.lng);
        setState(prev => ({
          ...prev,
          coords,
          isApproximate: false,
          permissionState: "granted",
          lastUpdated: Date.now(),
          isRequesting: false,
        }));
      },
      () => {
        setState(prev => (prev.coords ? { ...prev, isRequesting: false } : {
          ...prev,
          coords: { lat: CALGARY_FALLBACK.lat, lng: CALGARY_FALLBACK.lng },
          isApproximate: true,
          isRequesting: false,
        }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const requestLocation = useCallback(async () => {
    setState(prev => ({ ...prev, isRequesting: true }));

    if (Capacitor.isNativePlatform()) {
      try {
        const permission = await requestCapacitorPermission();
        if (permission !== "granted") {
          applyFallback("denied");
          return;
        }
        const coords = await getCapacitorPosition();
        storeLocation(coords.lat, coords.lng);
        setState(prev => ({
          ...prev,
          coords,
          isApproximate: false,
          permissionState: "granted",
          lastUpdated: Date.now(),
          isRequesting: false,
        }));
      } catch {
        applyFallback("denied");
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        storeLocation(coords.lat, coords.lng);
        setState(prev => ({
          ...prev,
          coords,
          isApproximate: false,
          permissionState: "granted",
          lastUpdated: Date.now(),
          isRequesting: false,
        }));
      },
      (error) => {
        applyFallback(error.code === error.PERMISSION_DENIED ? "denied" : undefined);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [applyFallback]);

  const refreshLocation = useCallback(() => {
    if (state.permissionState === "granted") {
      silentRefresh();
    } else {
      requestLocation();
    }
  }, [state.permissionState, silentRefresh, requestLocation]);

  const clearLocation = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(prev => ({ ...prev, coords: null, isApproximate: false, lastUpdated: null }));
  }, []);

  return (
    <LocationContext.Provider value={{ ...state, requestLocation, refreshLocation, clearLocation }}>
      {children}
    </LocationContext.Provider>
  );
}
