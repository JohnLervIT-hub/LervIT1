import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

// Generates or retrieves a stable session ID stored in localStorage
function getSessionId(): string {
  try {
    const key = "lerv_sid";
    let sid = localStorage.getItem(key);
    if (!sid) {
      sid = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(key, sid);
    }
    return sid;
  } catch {
    return "unknown";
  }
}

// Fire-and-forget event beacon — never throws, never blocks UI
export async function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    const sessionId = getSessionId();
    const page = window.location.pathname;
    await fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName, sessionId, page, properties }),
    });
  } catch {
    // silent — analytics must never break the app
  }
}

// Hook: tracks a page_view on mount and exposes a track() helper
export function useAnalytics(pageName: string) {
  const { user } = useAuth();
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    trackEvent("page_view", {
      page_name: pageName,
      user_role: user?.role ?? "anonymous",
      user_id: user?.id ?? null,
    });
  }, [pageName, user]);

  const track = useCallback(
    (event: string, props?: Record<string, unknown>) => {
      trackEvent(event, {
        page_name: pageName,
        user_role: user?.role ?? "anonymous",
        ...props,
      });
    },
    [pageName, user]
  );

  return { track };
}
