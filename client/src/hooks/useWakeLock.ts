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
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reacquireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RETRIES = 3;

  const checkSupport = useCallback(() => {
    const supported = "wakeLock" in navigator;
    return supported;
  }, []);
  
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      retryCountRef.current = 0;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (reacquireTimerRef.current) {
        clearTimeout(reacquireTimerRef.current);
        reacquireTimerRef.current = null;
      }
    }
  }, [enabled]);

  useEffect(() => {
    setState(prev => ({
      ...prev,
      isSupported: checkSupport(),
    }));
  }, [checkSupport]);

  const requestWakeLock = useCallback(async () => {
    if (!checkSupport()) {
      console.log("[WakeLock] Not supported in this browser");
      setState(prev => ({ ...prev, isSupported: false, error: "Not supported in this browser" }));
      return false;
    }

    if (document.visibilityState !== "visible") {
      console.log("[WakeLock] Page not visible, deferring acquisition");
      return false;
    }

    try {
      if (wakeLockRef.current) {
        try { await wakeLockRef.current.release(); } catch {}
        wakeLockRef.current = null;
      }

      wakeLockRef.current = await navigator.wakeLock.request("screen");
      console.log("[WakeLock] Screen wake lock acquired successfully");
      retryCountRef.current = 0;
      
      setState(prev => ({
        ...prev,
        isSupported: true,
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
          reacquireTimerRef.current = setTimeout(() => {
            if (enabledRef.current) requestWakeLock();
          }, 200);
        }
      });

      return true;
    } catch (err: any) {
      console.error("[WakeLock] Failed to acquire:", err.name, err.message);
      const errorMsg = err.name === "NotAllowedError" 
        ? "Battery saver may be blocking screen lock"
        : err.message || "Failed to acquire wake lock";
      
      setState(prev => ({
        ...prev,
        isActive: false,
        error: errorMsg,
      }));

      if (enabledRef.current && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        const delay = retryCountRef.current * 2000;
        console.log(`[WakeLock] Retrying in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})`);
        retryTimerRef.current = setTimeout(() => {
          if (enabledRef.current) requestWakeLock();
        }, delay);
      }

      return false;
    }
  }, [checkSupport]);

  const releaseWakeLock = useCallback(async () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (reacquireTimerRef.current) {
      clearTimeout(reacquireTimerRef.current);
      reacquireTimerRef.current = null;
    }
    retryCountRef.current = 0;
    
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log("[WakeLock] Manually released");
        setState(prev => ({
          ...prev,
          isActive: false,
          error: null,
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
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (reacquireTimerRef.current) {
        clearTimeout(reacquireTimerRef.current);
        reacquireTimerRef.current = null;
      }
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
