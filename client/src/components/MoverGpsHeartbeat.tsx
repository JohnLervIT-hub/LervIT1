import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";

const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;

async function getPositionOnce(): Promise<{ lat: number; lng: number } | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (err) {
      console.warn("[GPS heartbeat] Capacitor unavailable:", err);
      return null;
    }
  }

  if (!("geolocation" in navigator)) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        console.warn("[GPS heartbeat] GPS unavailable:", err);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

async function sendLocation() {
  const coords = await getPositionOnce();
  if (!coords) return;
  try {
    await apiRequest("PATCH", "/api/movers/me/location", {
      latitude: coords.lat,
      longitude: coords.lng,
    });
  } catch (err) {
    console.warn("[GPS heartbeat] Failed to push location:", err);
  }
}

export function MoverGpsHeartbeat() {
  const { user } = useAuth();
  const isMover = user?.role === "mover";

  const { data: mover } = useQuery<any>({
    queryKey: [`/api/movers?userId=${user?.id}`],
    enabled: !!user?.id && isMover,
    select: (data) => (Array.isArray(data) ? data[0] : data),
  });

  const isAvailable = !!mover?.isAvailable;

  useEffect(() => {
    if (!isMover || !isAvailable) return;

    sendLocation();
    const interval = setInterval(sendLocation, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isMover, isAvailable]);

  return null;
}
