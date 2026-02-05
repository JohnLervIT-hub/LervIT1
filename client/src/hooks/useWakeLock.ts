import { useState, useEffect, useCallback, useRef } from "react";

interface WakeLockState {
  isSupported: boolean;
  isActive: boolean;
  error: string | null;
}

export function useWakeLock(enabled: boolean = false) {
  const [state, setState] = useState<WakeLockState>({
    isSupported: false,
    isActive: false,
    error: null,
  });
  
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const enabledRef = useRef(enabled);
  
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    setState(prev => ({
      ...prev,
      isSupported: "wakeLock" in navigator,
    }));
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) {
      console.log("[WakeLock] Not supported in this browser");
      return false;
    }

    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      console.log("[WakeLock] Screen wake lock acquired");
      
      setState(prev => ({
        ...prev,
        isActive: true,
        error: null,
      }));

      wakeLockRef.current.addEventListener("release", () => {
        console.log("[WakeLock] Screen wake lock released");
        setState(prev => ({
          ...prev,
          isActive: false,
        }));
        
        if (enabledRef.current && document.visibilityState === "visible") {
          console.log("[WakeLock] Re-acquiring after release...");
          setTimeout(() => requestWakeLock(), 100);
        }
      });

      return true;
    } catch (err: any) {
      console.error("[WakeLock] Failed to acquire:", err);
      setState(prev => ({
        ...prev,
        isActive: false,
        error: err.message || "Failed to acquire wake lock",
      }));
      return false;
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log("[WakeLock] Manually released");
        setState(prev => ({
          ...prev,
          isActive: false,
        }));
      } catch (err) {
        console.error("[WakeLock] Error releasing:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && enabledRef.current) {
        console.log("[WakeLock] Page became visible, re-acquiring...");
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestWakeLock]);

  return {
    ...state,
    request: requestWakeLock,
    release: releaseWakeLock,
  };
}
