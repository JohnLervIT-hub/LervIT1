// LervIT Uber-Style Live Tracking - Premium Experience
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRoute } from "wouter";
import { GoogleMap, Marker, DirectionsRenderer, OverlayView } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Phone, MessageCircle, Star, Truck, ChevronUp, ChevronDown, MapPin, Navigation2 } from "lucide-react";
import { Link } from "wouter";
import { ACTIVE_STATUSES, type BookingStatus } from "@shared/schema";
import { useResilientPolling, getConnectionStatusText } from "@/hooks/useResilientPolling";
import { useGoogleMaps } from "@/contexts/GoogleMapsContext";

interface LocationData {
  bookingId: string;
  status: string;
  pickup: {
    address: string;
    latitude: number;
    longitude: number;
  };
  dropoff: {
    address: string;
    latitude: number;
    longitude: number;
  };
  currentLocation: {
    latitude: number;
    longitude: number;
    updatedAt: string;
  } | null;
  mover?: {
    name: string;
    phone: string;
    vehicleType: string;
    rating: number;
  };
}

const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Clean light map theme
const LIGHT_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e0e0e0" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#c5e8c5" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
];

// Car icon SVG - Uber style black car
const CAR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="18" fill="#000000"/>
  <circle cx="20" cy="20" r="15" fill="#1a1a1a"/>
  <path d="M13 22 L13 18 L15 13 L25 13 L27 18 L27 22 L25 24 L15 24 Z" fill="#ffffff"/>
  <rect x="14" y="14" width="12" height="5" rx="1" fill="#87CEEB"/>
  <circle cx="15" cy="22" r="1.5" fill="#333"/>
  <circle cx="25" cy="22" r="1.5" fill="#333"/>
</svg>`;

const CAR_ICON_URL = `data:image/svg+xml;base64,${btoa(CAR_ICON_SVG)}`;

// Status-based messaging
function getStatusMessage(status: string, moverName?: string): { title: string; subtitle: string } {
  const name = moverName || "Your mover";
  switch (status) {
    case "en_route_to_pickup":
      return { title: `${name} is on the way`, subtitle: "Arriving at pickup location" };
    case "loading":
      return { title: "Loading in progress", subtitle: `${name} is loading your items` };
    case "en_route_to_dropoff":
      return { title: "On the way to destination", subtitle: "Your items are being transported" };
    case "unloading":
      return { title: "Almost done!", subtitle: `${name} is unloading at destination` };
    case "completed":
      return { title: "Move completed", subtitle: "Thank you for using LervIT!" };
    case "confirmed":
      return { title: "Waiting for mover", subtitle: "Your mover will start soon" };
    default:
      return { title: "Tracking your move", subtitle: "Live updates when mover starts" };
  }
}

// Smooth interpolation between positions
function interpolatePosition(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  progress: number
): { lat: number; lng: number } {
  return {
    lat: from.lat + (to.lat - from.lat) * progress,
    lng: from.lng + (to.lng - from.lng) * progress,
  };
}

export default function TrackTrip() {
  const [, params] = useRoute("/track-trip/:bookingId");
  const bookingId = params?.bookingId;
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string; durationMinutes: number } | null>(null);
  const [isSheetExpanded, setIsSheetExpanded] = useState(true);
  
  // Google Maps loading
  const { isLoaded, loadMaps, loadError } = useGoogleMaps();
  
  useEffect(() => {
    loadMaps();
  }, [loadMaps]);
  
  // Map options with Uber dark theme
  const mapOptions = useMemo(() => {
    if (!isLoaded) return {};
    return {
      disableDefaultUI: true,
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: LIGHT_MAP_STYLES,
    };
  }, [isLoaded]);
  
  // Animation state
  const [animatedPosition, setAnimatedPosition] = useState<{ lat: number; lng: number } | null>(null);
  const targetPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const currentAnimatedRef = useRef<{ lat: number; lng: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isFirstPositionRef = useRef(true);
  const markerRef = useRef<google.maps.Marker | null>(null);

  // Resilient polling - 3 second intervals for smoother tracking
  const { data: locationData, isLoading, pollingState } = useResilientPolling<LocationData>(
    ["/api/bookings", bookingId, "location"],
    {},
    { 
      baseInterval: 3000, // More frequent polling for smoother animation
      maxInterval: 15000, // Max backoff when connection issues
      enabled: autoRefresh 
    }
  );
  
  // Track time since last location update for display
  const [lastUpdateSeconds, setLastUpdateSeconds] = useState<number | null>(null);
  
  useEffect(() => {
    if (!locationData?.currentLocation?.updatedAt) {
      setLastUpdateSeconds(null);
      return;
    }
    
    const updateTimer = () => {
      const updatedAt = new Date(locationData.currentLocation!.updatedAt).getTime();
      const now = Date.now();
      const seconds = Math.floor((now - updatedAt) / 1000);
      setLastUpdateSeconds(seconds);
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [locationData?.currentLocation?.updatedAt]);

  useEffect(() => {
    if (locationData?.status === "completed" || locationData?.status === "cancelled") {
      setAutoRefresh(false);
    }
  }, [locationData?.status]);

  // Smooth animation of vehicle position - uses direct marker manipulation for reliability
  useEffect(() => {
    if (!locationData?.currentLocation) {
      setAnimatedPosition(null);
      currentAnimatedRef.current = null;
      targetPositionRef.current = null;
      isFirstPositionRef.current = true;
      return;
    }

    const newPosition = {
      lat: locationData.currentLocation.latitude,
      lng: locationData.currentLocation.longitude,
    };

    // Skip if position hasn't changed
    if (
      targetPositionRef.current &&
      Math.abs(targetPositionRef.current.lat - newPosition.lat) < 0.000001 &&
      Math.abs(targetPositionRef.current.lng - newPosition.lng) < 0.000001
    ) {
      return;
    }

    // First position - set immediately
    if (isFirstPositionRef.current || !currentAnimatedRef.current) {
      setAnimatedPosition(newPosition);
      currentAnimatedRef.current = newPosition;
      targetPositionRef.current = newPosition;
      isFirstPositionRef.current = false;
      // Also update marker directly if it exists
      if (markerRef.current) {
        markerRef.current.setPosition(newPosition);
      }
      return;
    }

    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startPosition = { ...currentAnimatedRef.current };
    targetPositionRef.current = newPosition;
    const startTime = performance.now();
    const duration = 2500; // Slightly longer for smoother animation

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Smooth ease-out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const interpolated = interpolatePosition(startPosition, newPosition, easeProgress);
      
      // Update marker directly for smoother animation
      if (markerRef.current) {
        markerRef.current.setPosition(interpolated);
      }
      
      // Also update state for React components that depend on it
      setAnimatedPosition(interpolated);
      currentAnimatedRef.current = interpolated;

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        currentAnimatedRef.current = newPosition;
        setAnimatedPosition(newPosition);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [locationData?.currentLocation?.latitude, locationData?.currentLocation?.longitude]);

  // Calculate directions
  useEffect(() => {
    if (!locationData || !isLoaded) return;

    const directionsService = new google.maps.DirectionsService();

    const origin = locationData.currentLocation 
      ? { lat: locationData.currentLocation.latitude, lng: locationData.currentLocation.longitude }
      : { lat: locationData.pickup.latitude, lng: locationData.pickup.longitude };

    const destination = { lat: locationData.dropoff.latitude, lng: locationData.dropoff.longitude };

    if (locationData.currentLocation && locationData.status === "en_route_to_pickup") {
      // Mover going to pickup
      directionsService.route(
        {
          origin: origin,
          destination: { lat: locationData.pickup.latitude, lng: locationData.pickup.longitude },
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            setDirections(result);
            const leg = result.routes[0].legs[0];
            const durationMinutes = Math.ceil((leg.duration?.value || 0) / 60);
            setRouteInfo({
              distance: leg.distance?.text || '',
              duration: leg.duration?.text || '',
              durationMinutes,
            });
          }
        }
      );
    } else if (locationData.currentLocation) {
      // Mover going to dropoff
      directionsService.route(
        {
          origin: origin,
          destination: destination,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            setDirections(result);
            const leg = result.routes[0].legs[0];
            const durationMinutes = Math.ceil((leg.duration?.value || 0) / 60);
            setRouteInfo({
              distance: leg.distance?.text || '',
              duration: leg.duration?.text || '',
              durationMinutes,
            });
          }
        }
      );
    } else {
      // No live location - show pickup to dropoff
      directionsService.route(
        {
          origin: { lat: locationData.pickup.latitude, lng: locationData.pickup.longitude },
          destination: destination,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            setDirections(result);
            const leg = result.routes[0].legs[0];
            const durationMinutes = Math.ceil((leg.duration?.value || 0) / 60);
            setRouteInfo({
              distance: leg.distance?.text || '',
              duration: leg.duration?.text || '',
              durationMinutes,
            });
          }
        }
      );
    }
  }, [locationData, isLoaded]);

  // Update map bounds
  useEffect(() => {
    if (map && locationData) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: locationData.pickup.latitude, lng: locationData.pickup.longitude });
      bounds.extend({ lat: locationData.dropoff.latitude, lng: locationData.dropoff.longitude });
      
      if (locationData.currentLocation) {
        bounds.extend({ 
          lat: locationData.currentLocation.latitude, 
          lng: locationData.currentLocation.longitude 
        });
      }
      
      map.fitBounds(bounds, { top: 100, bottom: isSheetExpanded ? 380 : 200, left: 40, right: 40 });
    }
  }, [map, locationData, isSheetExpanded]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  // Loading states
  if (!isLoaded || isLoading || !locationData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            {!isLoaded ? "Loading map..." : "Loading trip details..."}
          </p>
        </div>
      </div>
    );
  }
  
  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <p className="text-destructive">Failed to load map. Please try again.</p>
          <Link href="/my-bookings">
            <Button className="mt-4">Back to Bookings</Button>
          </Link>
        </div>
      </div>
    );
  }

  const pickup = locationData.pickup;
  const dropoff = locationData.dropoff;
  const currentLocation = locationData.currentLocation;
  const statusMessage = getStatusMessage(locationData.status, locationData.mover?.name);
  const isLive = !!currentLocation && ACTIVE_STATUSES.includes(locationData.status as BookingStatus);

  const center = currentLocation
    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
    : { lat: (pickup.latitude + dropoff.latitude) / 2, lng: (pickup.longitude + dropoff.longitude) / 2 };

  return (
    <div className="fixed inset-0 top-16 z-40 overflow-hidden bg-gray-100">
      {/* Full-screen Google Map with light theme */}
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={14}
        options={mapOptions}
        onLoad={onMapLoad}
      >
        {/* Route line - Uber cyan/teal color */}
        {directions && (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: "#276EF1",
                strokeWeight: 4,
                strokeOpacity: 1,
              },
            }}
          />
        )}

        {/* Pickup marker - White dot with black ring */}
        <Marker
          position={{ lat: pickup.latitude, lng: pickup.longitude }}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#ffffff",
            fillOpacity: 1,
            strokeColor: "#000000",
            strokeWeight: 3,
          }}
          data-testid="marker-pickup"
        />

        {/* Dropoff marker - Black square */}
        <Marker
          position={{ lat: dropoff.latitude, lng: dropoff.longitude }}
          icon={{
            path: "M -5,-5 L 5,-5 L 5,5 L -5,5 Z",
            scale: 1,
            fillColor: "#000000",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          }}
          data-testid="marker-dropoff"
        />

        {/* Vehicle marker - uses ref for direct position updates */}
        {animatedPosition && (
          <Marker
            position={animatedPosition}
            icon={{
              url: CAR_ICON_URL,
              scaledSize: new google.maps.Size(40, 40),
              anchor: new google.maps.Point(20, 20),
            }}
            zIndex={1000}
            onLoad={(marker) => {
              markerRef.current = marker;
            }}
            onUnmount={() => {
              markerRef.current = null;
            }}
            data-testid="marker-mover"
          />
        )}

        {/* ETA bubble on map */}
        {routeInfo && currentLocation && (
          <OverlayView
            position={animatedPosition || { lat: currentLocation.latitude, lng: currentLocation.longitude }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <div className="relative -translate-x-1/2 -translate-y-16">
              <div className="bg-white text-black px-3 py-1 rounded-full shadow-lg text-center font-bold text-sm">
                {routeInfo.durationMinutes} min
              </div>
            </div>
          </OverlayView>
        )}
      </GoogleMap>

      {/* Top bar - Back button and live status */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
        <Link href="/my-bookings">
          <Button 
            variant="secondary" 
            size="icon" 
            className="bg-white shadow-lg hover:bg-gray-100 rounded-full h-10 w-10"
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5 text-black" />
          </Button>
        </Link>
        
        {/* Live indicator with last update time */}
        {isLive && (
          <div className="bg-black/80 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2 shadow-lg" data-testid="live-indicator">
            <span className={`w-2 h-2 rounded-full ${lastUpdateSeconds !== null && lastUpdateSeconds < 30 ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></span>
            <span className="text-white text-sm font-medium">
              {lastUpdateSeconds !== null && lastUpdateSeconds < 10 
                ? 'LIVE' 
                : lastUpdateSeconds !== null 
                  ? `${lastUpdateSeconds}s ago`
                  : 'LIVE'}
            </span>
          </div>
        )}
      </div>

      {/* Bottom sheet - Uber style */}
      <div className={`absolute bottom-0 left-0 right-0 z-10 transition-transform duration-300 ${isSheetExpanded ? 'translate-y-0' : 'translate-y-[180px]'}`}>
        <div className="bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl">
          {/* Handle bar */}
          <button 
            onClick={() => setIsSheetExpanded(!isSheetExpanded)}
            className="w-full py-3 flex justify-center"
            data-testid="button-toggle-sheet"
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
          </button>
          
          <div className="px-6 pb-6 space-y-4">
            {/* Status header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground" data-testid="text-status-title">
                  {statusMessage.title}
                </h2>
                <p className="text-sm text-muted-foreground" data-testid="text-status-subtitle">
                  {statusMessage.subtitle}
                </p>
              </div>
              {routeInfo && (
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground" data-testid="text-eta">
                    {routeInfo.durationMinutes}
                  </p>
                  <p className="text-xs text-muted-foreground uppercase">min</p>
                </div>
              )}
            </div>

            {/* Mover card */}
            {locationData.mover && (
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-2xl">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                    {locationData.mover.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate" data-testid="text-mover-name">
                    {locationData.mover.name}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span data-testid="text-mover-rating">{locationData.mover.rating.toFixed(1)}</span>
                    <span className="mx-1">•</span>
                    <Truck className="w-4 h-4" />
                    <span className="capitalize">{locationData.mover.vehicleType}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="icon" 
                    variant="outline"
                    className="rounded-full h-10 w-10"
                    data-testid="button-call"
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="outline"
                    className="rounded-full h-10 w-10"
                    data-testid="button-message"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Trip details */}
            <div className="space-y-3">
              {/* Pickup */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center pt-1">
                  <div className="w-3 h-3 rounded-full bg-foreground border-2 border-background shadow"></div>
                  <div className="w-0.5 h-8 bg-muted-foreground/30"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Pickup</p>
                  <p className="text-sm font-medium text-foreground truncate" data-testid="text-pickup">
                    {pickup.address}
                  </p>
                </div>
              </div>

              {/* Dropoff */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center pt-1">
                  <div className="w-3 h-3 bg-foreground"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Dropoff</p>
                  <p className="text-sm font-medium text-foreground truncate" data-testid="text-dropoff">
                    {dropoff.address}
                  </p>
                </div>
              </div>
            </div>

            {/* Distance info */}
            {routeInfo && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                <Navigation2 className="w-4 h-4" />
                <span data-testid="text-distance">{routeInfo.distance}</span>
                {currentLocation && (
                  <span className="text-xs">(to destination)</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
