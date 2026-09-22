// LervIT Uber-Style Live Tracking - Premium Experience
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRoute } from "wouter";
import { GoogleMap, Marker, DirectionsRenderer, OverlayView } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Phone, MessageCircle, Star, Truck, ChevronUp, ChevronDown, MapPin, Navigation2, Send, X } from "lucide-react";
import { Link } from "wouter";
import { ACTIVE_STATUSES, type BookingStatus } from "@shared/schema";
import { useResilientPolling, getConnectionStatusText } from "@/hooks/useResilientPolling";
import { useGoogleMaps } from "@/contexts/GoogleMapsContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

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
  // Server-side ETA (Distance Matrix, cached per booking). Not rendered here —
  // the page computes its own live route via DirectionsService. Kept on the
  // type because the endpoint returns it for the SMS/Mark/admin consumers.
  eta?: {
    minutes: number | null;
    arrivalTime: number | null;
    destination: "pickup" | "dropoff" | null;
    accurate: boolean;
  };
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

// Car icon SVG - Dark car on light background for visibility
const CAR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="22" fill="#1a1a2e"/>
  <circle cx="24" cy="24" r="19" fill="#2d2d44"/>
  <path d="M15 27 L15 22 L18 15 L30 15 L33 22 L33 27 L30 30 L18 30 Z" fill="#ffffff"/>
  <rect x="17" y="16" width="14" height="6" rx="1" fill="#87CEEB"/>
  <circle cx="18" cy="27" r="2" fill="#333"/>
  <circle cx="30" cy="27" r="2" fill="#333"/>
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

// Haversine distance in km between two lat/lng points
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

export default function TrackTrip() {
  const [, params] = useRoute("/track-trip/:bookingId");
  const bookingId = params?.bookingId;
  const { user } = useAuth();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  // Task 4: Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string; durationMinutes: number } | null>(null);
  const [isSheetExpanded, setIsSheetExpanded] = useState(true);
  
  // Task 4: Messages query — poll every 10 seconds while on screen
  const { data: messages = [] } = useQuery<{ id: string; senderId: string; text: string; createdAt: string }[]>({
    queryKey: ["/api/messages", bookingId],
    queryFn: () => fetch(`/api/messages?bookingId=${bookingId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!bookingId,
    refetchInterval: 10000,
    select: (data) => (Array.isArray(data) ? data.slice(-10) : []),
  });

  const sendMessageMutation = useMutation({
    mutationFn: (text: string) =>
      apiRequest("POST", "/api/messages", { bookingId, senderId: user?.id, text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/messages", bookingId] }),
  });

  useEffect(() => {
    if (isChatOpen) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isChatOpen]);

  const handleSendMessage = () => {
    const text = chatMessage.trim();
    if (!text) return;
    sendMessageMutation.mutate(text);
    setChatMessage("");
  };

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
  const hasFittedBoundsRef = useRef(false);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const lastDirectionsCalcRef = useRef<{ lat: number; lng: number; status: string } | null>(null);

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

  // Smooth animation of vehicle position
  // React state (animatedPosition) is only updated at poll time — NOT inside the RAF loop.
  // The marker moves smoothly via direct markerRef.setPosition() calls at 60fps.
  // This prevents ~60 React re-renders per second during animation.
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

    // Update React state once (at poll time) so marker mounts/ETA badge positions correctly
    setAnimatedPosition(newPosition);
    targetPositionRef.current = newPosition;

    // First position — snap immediately, no animation needed
    if (isFirstPositionRef.current || !currentAnimatedRef.current) {
      currentAnimatedRef.current = newPosition;
      isFirstPositionRef.current = false;
      if (markerRef.current) {
        markerRef.current.setPosition(newPosition);
      }
      return;
    }

    // Cancel any in-progress animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startPosition = { ...currentAnimatedRef.current };
    const startTime = performance.now();
    const duration = 2500;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const interpolated = interpolatePosition(startPosition, newPosition, easeProgress);

      // Direct DOM update only — zero React renders during animation
      if (markerRef.current) {
        markerRef.current.setPosition(interpolated);
      }
      currentAnimatedRef.current = interpolated;

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        currentAnimatedRef.current = newPosition;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [locationData?.currentLocation?.latitude, locationData?.currentLocation?.longitude]);

  // Calculate directions — throttled to avoid firing on every 3-second poll.
  // A new route is only requested when:
  //   (a) the booking status changes (en_route_to_pickup → en_route_to_dropoff, etc.), OR
  //   (b) the mover has moved more than 300 m from the last calculation origin.
  // DirectionsService is created once and stored in a ref.
  useEffect(() => {
    if (!locationData || !isLoaded) return;
    // Skip if pickup/dropoff coordinates are missing
    if (locationData.pickup.latitude == null || locationData.pickup.longitude == null) return;
    if (locationData.dropoff.latitude == null || locationData.dropoff.longitude == null) return;

    // Create service once
    if (!directionsServiceRef.current) {
      directionsServiceRef.current = new google.maps.DirectionsService();
    }

    const currentStatus = locationData.status;
    const currentLoc = locationData.currentLocation;
    const origin = (currentLoc && currentLoc.latitude != null && currentLoc.longitude != null)
      ? { lat: currentLoc.latitude, lng: currentLoc.longitude }
      : { lat: locationData.pickup.latitude, lng: locationData.pickup.longitude };

    // Throttle check — skip if status unchanged and mover moved < 300 m
    if (lastDirectionsCalcRef.current) {
      const sameStatus = lastDirectionsCalcRef.current.status === currentStatus;
      const moved = haversineKm(
        { lat: lastDirectionsCalcRef.current.lat, lng: lastDirectionsCalcRef.current.lng },
        origin
      );
      if (sameStatus && moved < 0.3) return;
    }

    lastDirectionsCalcRef.current = { lat: origin.lat, lng: origin.lng, status: currentStatus };

    const destination = { lat: locationData.dropoff.latitude, lng: locationData.dropoff.longitude };
    const routeDest =
      currentLoc && currentStatus === "en_route_to_pickup"
        ? { lat: locationData.pickup.latitude, lng: locationData.pickup.longitude }
        : destination;

    directionsServiceRef.current.route(
      { origin, destination: routeDest, travelMode: google.maps.TravelMode.DRIVING },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
          const leg = result.routes[0].legs[0];
          setRouteInfo({
            distance: leg.distance?.text || "",
            duration: leg.duration?.text || "",
            durationMinutes: Math.ceil((leg.duration?.value || 0) / 60),
          });
        }
      }
    );
  }, [locationData, isLoaded]);

  // Fit map bounds once when both map and data are ready (on mount/remount)
  useEffect(() => {
    if (!map || !locationData || hasFittedBoundsRef.current) return;
    // Skip if pickup/dropoff coordinates are missing
    if (locationData.pickup.latitude == null || locationData.pickup.longitude == null) return;
    if (locationData.dropoff.latitude == null || locationData.dropoff.longitude == null) return;
    
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: locationData.pickup.latitude, lng: locationData.pickup.longitude });
    bounds.extend({ lat: locationData.dropoff.latitude, lng: locationData.dropoff.longitude });
    
    if (locationData.currentLocation && locationData.currentLocation.latitude != null) {
      bounds.extend({ 
        lat: locationData.currentLocation.latitude, 
        lng: locationData.currentLocation.longitude 
      });
    }
    
    map.fitBounds(bounds, { top: 100, bottom: isSheetExpanded ? 380 : 200, left: 40, right: 40 });
    hasFittedBoundsRef.current = true;
  }, [map, locationData, isSheetExpanded]);
  
  // Adjust map padding when bottom sheet expands/collapses (without re-centering on every poll)
  const prevSheetExpandedRef = useRef(isSheetExpanded);
  useEffect(() => {
    if (!map || !locationData || prevSheetExpandedRef.current === isSheetExpanded) return;
    if (locationData.pickup.latitude == null || locationData.pickup.longitude == null) return;
    if (locationData.dropoff.latitude == null || locationData.dropoff.longitude == null) return;
    prevSheetExpandedRef.current = isSheetExpanded;
    
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: locationData.pickup.latitude, lng: locationData.pickup.longitude });
    bounds.extend({ lat: locationData.dropoff.latitude, lng: locationData.dropoff.longitude });
    
    if (locationData.currentLocation && locationData.currentLocation.latitude != null) {
      bounds.extend({ 
        lat: locationData.currentLocation.latitude, 
        lng: locationData.currentLocation.longitude 
      });
    }
    
    map.fitBounds(bounds, { top: 100, bottom: isSheetExpanded ? 380 : 200, left: 40, right: 40 });
  }, [map, locationData, isSheetExpanded]);

  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    hasFittedBoundsRef.current = false;
  }, []);

  const defaultCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  if (locationData && !defaultCenterRef.current) {
    const loc = locationData.currentLocation;
    if (loc && loc.latitude != null && loc.longitude != null) {
      defaultCenterRef.current = { lat: loc.latitude, lng: loc.longitude };
    } else if (
      locationData.pickup.latitude != null && locationData.pickup.longitude != null &&
      locationData.dropoff.latitude != null && locationData.dropoff.longitude != null
    ) {
      defaultCenterRef.current = {
        lat: (locationData.pickup.latitude + locationData.dropoff.latitude) / 2,
        lng: (locationData.pickup.longitude + locationData.dropoff.longitude) / 2,
      };
    }
    // else: leave null — will fall back to CALGARY_DEFAULT after early-return guards
  }

  // Check load error first — when there's an error isLoaded stays false,
  // so the loadError guard must come before the isLoaded spinner guard.
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

  const pickup = locationData.pickup;
  const dropoff = locationData.dropoff;
  const currentLocation = locationData.currentLocation;
  const statusMessage = getStatusMessage(locationData.status, locationData.mover?.name);
  const isLive = !!currentLocation && ACTIVE_STATUSES.includes(locationData.status as BookingStatus);

  // Calgary downtown as fallback if geocoding was never stored for this booking
  const CALGARY_DEFAULT = { lat: 51.0447, lng: -114.0719 };
  const pickupCoords = (pickup.latitude != null && pickup.longitude != null)
    ? { lat: pickup.latitude, lng: pickup.longitude }
    : null;
  const dropoffCoords = (dropoff.latitude != null && dropoff.longitude != null)
    ? { lat: dropoff.latitude, lng: dropoff.longitude }
    : null;

  if (!pickupCoords || !dropoffCoords) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center px-6">
          <p className="text-muted-foreground mb-2">Location data is not available for this booking.</p>
          <Link href="/my-bookings">
            <Button className="mt-4">Back to Bookings</Button>
          </Link>
        </div>
      </div>
    );
  }

  const defaultCenter = defaultCenterRef.current || pickupCoords || CALGARY_DEFAULT;

  return (
    <div className="fixed inset-0 top-16 z-40 overflow-hidden bg-gray-100">
      {/* Full-screen Google Map with light theme */}
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={defaultCenter}
        zoom={13}
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
          position={pickupCoords}
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
          position={dropoffCoords}
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
              scaledSize: new google.maps.Size(48, 48),
              anchor: new google.maps.Point(24, 24),
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

        {/* ETA bubble on map — positioned at raw server location (updates every poll, not every frame) */}
        {routeInfo && currentLocation && (
          <OverlayView
            position={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
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

      {/* Task 4: Chat panel — collapsible slide-up drawer */}
      <div
        className={`absolute left-0 right-0 z-20 transition-all duration-300 ${isChatOpen ? 'bottom-0' : 'bottom-[-340px]'}`}
        style={{ bottom: isChatOpen ? (isSheetExpanded ? '340px' : '120px') : '-340px' }}
        data-testid="chat-panel"
      >
        <div className="bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl border-t border-border mx-0">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Chat with Mover</span>
            </div>
            <button onClick={() => setIsChatOpen(false)} className="p-1 rounded-full hover:bg-muted" data-testid="button-close-chat">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Messages list */}
          <div className="h-48 overflow-y-auto px-4 py-3 space-y-2">
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No messages yet. Say hi!</p>
            ) : (
              messages.map((msg) => {
                const isOwn = msg.senderId === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
            <Input
              placeholder="Type a message…"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              className="flex-1 h-9 text-sm"
              data-testid="input-chat-message"
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleSendMessage}
              disabled={!chatMessage.trim() || sendMessageMutation.isPending}
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
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
                    <span data-testid="text-mover-rating">{(locationData.mover.rating ?? 0).toFixed(1)}</span>
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
                    variant={isChatOpen ? "default" : "outline"}
                    className="rounded-full h-10 w-10"
                    onClick={() => setIsChatOpen((o) => !o)}
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
