import { useState, useEffect } from "react";
import { MapPin, X, Navigation, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface LocationPromptProps {
  onLocationGranted?: (coords: { lat: number; lng: number }) => void;
  onDismiss?: () => void;
  variant?: "banner" | "card";
  showAlways?: boolean;
  context?: "customer" | "mover";
}

type PermissionState = "prompt" | "granted" | "denied" | "unavailable" | "loading";

export function LocationPrompt({ 
  onLocationGranted, 
  onDismiss,
  variant = "banner",
  showAlways = false,
  context = "customer"
}: LocationPromptProps) {
  const isMover = context === "mover";
  const [permissionState, setPermissionState] = useState<PermissionState>("loading");
  const [isRequesting, setIsRequesting] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    if (!navigator.geolocation) {
      setPermissionState("unavailable");
      return;
    }

    try {
      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: "geolocation" });
        setPermissionState(result.state as PermissionState);
        
        result.onchange = () => {
          setPermissionState(result.state as PermissionState);
        };
      } else {
        setPermissionState("prompt");
      }
    } catch {
      setPermissionState("prompt");
    }
  };

  const requestLocation = () => {
    setIsRequesting(true);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPermissionState("granted");
        setIsRequesting(false);
        onLocationGranted?.({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        setIsRequesting(false);
        if (error.code === error.PERMISSION_DENIED) {
          setPermissionState("denied");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  if (isDismissed && !showAlways) return null;
  if (permissionState === "granted" && !showAlways) return null;
  if (permissionState === "loading") return null;

  if (variant === "card") {
    return (
      <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/40">
              <MapPin className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              {permissionState === "denied" ? (
                <>
                  <h3 className="font-semibold text-orange-800 dark:text-orange-200">
                    Location Access Blocked
                  </h3>
                  <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                    {isMover 
                      ? "To share your live location with customers during jobs, please enable location in your browser settings, then refresh the page."
                      : "To find movers near you, please enable location in your browser settings, then refresh the page."
                    }
                  </p>
                  <div className="mt-3 p-3 bg-orange-100 dark:bg-orange-900/40 rounded-lg text-xs text-orange-800 dark:text-orange-200">
                    <strong>How to enable:</strong> Click the lock/info icon in your browser's address bar → Site settings → Allow location
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-semibold text-orange-800 dark:text-orange-200">
                    {isMover ? "Enable Location for Live Tracking" : "Enable Location for Better Results"}
                  </h3>
                  <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                    {isMover 
                      ? "Allow location access so customers can track your arrival during active jobs."
                      : "See movers closest to you with accurate distance and pricing."
                    }
                  </p>
                  <Button
                    onClick={requestLocation}
                    disabled={isRequesting}
                    className="mt-3 bg-orange-500 hover:bg-orange-600 text-white"
                    size="sm"
                    data-testid="button-enable-location"
                  >
                    <Navigation className="w-4 h-4 mr-2" />
                    {isRequesting ? "Getting Location..." : "Enable Location"}
                  </Button>
                </>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-orange-600 hover:text-orange-700"
              onClick={handleDismiss}
              data-testid="button-dismiss-location"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {permissionState === "denied" ? (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <MapPin className="w-5 h-5 flex-shrink-0" />
          )}
          <div>
            {permissionState === "denied" ? (
              <span className="text-sm font-medium">
                Location blocked. Enable it in browser settings to find nearby movers.
              </span>
            ) : (
              <span className="text-sm font-medium">
                Enable location to find movers near you with accurate pricing
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {permissionState !== "denied" && (
            <Button
              onClick={requestLocation}
              disabled={isRequesting}
              variant="secondary"
              size="sm"
              className="bg-white text-orange-600 hover:bg-orange-50"
              data-testid="button-enable-location-banner"
            >
              <Navigation className="w-4 h-4 mr-1" />
              {isRequesting ? "Getting..." : "Enable"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-orange-400"
            onClick={handleDismiss}
            data-testid="button-dismiss-location-banner"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
