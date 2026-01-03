// LervIT Uber-Style Live Tracking with smooth animations
import { useEffect, useState, useCallback, useRef } from "react";
import { useRoute } from "wouter";
import { GoogleMap, Marker, DirectionsRenderer, OverlayView } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Navigation, Wifi, WifiOff, Phone, MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { BOOKING_STATUSES, ACTIVE_STATUSES, BOOKING_STATUS_INFO, type BookingStatus } from "@shared/schema";
import { useResilientPolling, getConnectionStatusText } from "@/hooks/useResilientPolling";

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

// Uber-style dark map options
const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  styles: [
    { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e0e0e0" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#c5e8c5" }] },
  ],
};

// Custom car SVG icon (Uber-style) - simple version without comments
const createCarIcon = (rotation: number = 0) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><g transform="rotate(${rotation} 20 20)"><ellipse cx="20" cy="32" rx="10" ry="2" fill="rgba(0,0,0,0.15)"/><rect x="10" y="8" width="20" height="22" rx="4" fill="#1a1a1a"/><rect x="12" y="12" width="16" height="8" rx="2" fill="#333"/><rect x="13" y="6" width="14" height="5" rx="2" fill="#5599dd"/><rect x="13" y="24" width="14" height="4" rx="1" fill="#5599dd"/><circle cx="13" cy="5" r="2" fill="#ffeb3b"/><circle cx="27" cy="5" r="2" fill="#ffeb3b"/><rect x="12" y="28" width="4" height="2" rx="1" fill="#ff4444"/><rect x="24" y="28" width="4" height="2" rx="1" fill="#ff4444"/></g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

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

// Calculate bearing between two points
function calculateBearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

export default function TrackTrip() {
  const [, params] = useRoute("/track-trip/:bookingId");
  const bookingId = params?.bookingId;
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string; durationMinutes: number } | null>(null);
  
  // Animation state - use refs to avoid re-render dependency issues
  const [animatedPosition, setAnimatedPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [vehicleRotation, setVehicleRotation] = useState(0);
  const targetPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const currentAnimatedRef = useRef<{ lat: number; lng: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isFirstPositionRef = useRef(true);

  // Use resilient polling with exponential backoff
  const { data: locationData, isLoading, pollingState } = useResilientPolling<LocationData>(
    ["/api/bookings", bookingId, "location"],
    {},
    { 
      baseInterval: 5000, 
      maxInterval: 30000,
      enabled: autoRefresh 
    }
  );

  useEffect(() => {
    if (locationData?.status === "completed" || locationData?.status === "cancelled") {
      setAutoRefresh(false);
    }
  }, [locationData?.status]);

  // Smooth animation of vehicle position
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
      targetPositionRef.current.lat === newPosition.lat &&
      targetPositionRef.current.lng === newPosition.lng
    ) {
      return;
    }

    // Calculate rotation based on movement direction
    if (currentAnimatedRef.current) {
      const bearing = calculateBearing(currentAnimatedRef.current, newPosition);
      setVehicleRotation(bearing);
    }

    // First position - snap immediately
    if (isFirstPositionRef.current || !currentAnimatedRef.current) {
      setAnimatedPosition(newPosition);
      currentAnimatedRef.current = newPosition;
      targetPositionRef.current = newPosition;
      isFirstPositionRef.current = false;
      return;
    }

    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Store the start and target positions
    const startPosition = { ...currentAnimatedRef.current };
    targetPositionRef.current = newPosition;
    const startTime = performance.now();
    const duration = 2000; // 2 second smooth transition

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const interpolated = interpolatePosition(startPosition, newPosition, easeProgress);
      setAnimatedPosition(interpolated);
      currentAnimatedRef.current = interpolated;

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete - update refs
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

  // Calculate driving directions
  useEffect(() => {
    if (!locationData) return;

    const directionsService = new google.maps.DirectionsService();

    const origin = locationData.currentLocation 
      ? { lat: locationData.currentLocation.latitude, lng: locationData.currentLocation.longitude }
      : { lat: locationData.pickup.latitude, lng: locationData.pickup.longitude };

    if (locationData.currentLocation) {
      directionsService.route(
        {
          origin: origin,
          destination: { lat: locationData.dropoff.latitude, lng: locationData.dropoff.longitude },
          waypoints: [
            { location: { lat: locationData.pickup.latitude, lng: locationData.pickup.longitude }, stopover: true }
          ],
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: false,
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            setDirections(result);
            let totalDistance = 0;
            let totalDuration = 0;
            result.routes[0].legs.forEach(leg => {
              totalDistance += leg.distance?.value || 0;
              totalDuration += leg.duration?.value || 0;
            });
            const durationMinutes = Math.ceil(totalDuration / 60);
            setRouteInfo({
              distance: (totalDistance / 1000).toFixed(1) + ' km',
              duration: durationMinutes + ' min',
              durationMinutes,
            });
          }
        }
      );
    } else {
      directionsService.route(
        {
          origin: { lat: locationData.pickup.latitude, lng: locationData.pickup.longitude },
          destination: { lat: locationData.dropoff.latitude, lng: locationData.dropoff.longitude },
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
  }, [locationData]);

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
      
      map.fitBounds(bounds, { top: 120, bottom: 280, left: 40, right: 40 });
    }
  }, [map, locationData]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  if (isLoading || !locationData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading trip details...</p>
        </div>
      </div>
    );
  }

  const pickup = locationData.pickup;
  const dropoff = locationData.dropoff;
  const currentLocation = locationData.currentLocation;

  const center = currentLocation
    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
    : { lat: (pickup.latitude + dropoff.latitude) / 2, lng: (pickup.longitude + dropoff.longitude) / 2 };

  return (
    <div className="h-screen w-full relative overflow-hidden bg-background">
      {/* Full-screen Google Map */}
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={14}
        options={mapOptions}
        onLoad={onMapLoad}
      >
        {/* Dark route line (Uber-style) */}
        {directions && (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: "#1a1a1a",
                strokeWeight: 5,
                strokeOpacity: 1,
              },
            }}
          />
        )}

        {/* Pickup marker - Custom black dot with white ring */}
        <Marker
          position={{ lat: pickup.latitude, lng: pickup.longitude }}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#ffffff",
            fillOpacity: 1,
            strokeColor: "#1a1a1a",
            strokeWeight: 3,
          }}
          data-testid="marker-pickup"
        />

        {/* Dropoff marker - Black square */}
        <Marker
          position={{ lat: dropoff.latitude, lng: dropoff.longitude }}
          icon={{
            path: "M -6,-6 L 6,-6 L 6,6 L -6,6 Z",
            scale: 1,
            fillColor: "#1a1a1a",
            fillOpacity: 1,
            strokeColor: "#1a1a1a",
            strokeWeight: 1,
          }}
          data-testid="marker-dropoff"
        />

        {/* Animated vehicle marker */}
        {animatedPosition && (
          <Marker
            position={animatedPosition}
            icon={{
              url: createCarIcon(vehicleRotation),
              scaledSize: new google.maps.Size(40, 40),
              anchor: new google.maps.Point(20, 20),
            }}
            data-testid="marker-mover"
          />
        )}

        {/* ETA Overlay on map (Uber-style floating badge) */}
        {routeInfo && currentLocation && (
          <OverlayView
            position={animatedPosition || { lat: currentLocation.latitude, lng: currentLocation.longitude }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <div className="relative -translate-x-1/2 -translate-y-20">
              <div className="bg-black text-white px-3 py-1.5 rounded-lg shadow-lg text-center min-w-[60px]">
                <div className="text-lg font-bold" data-testid="text-eta-badge">{routeInfo.durationMinutes}</div>
                <div className="text-xs opacity-80">MIN</div>
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-black"></div>
            </div>
          </OverlayView>
        )}
      </GoogleMap>

      {/* Top navigation bar */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 pointer-events-none">
        <div className="flex items-center justify-between pointer-events-auto">
          <Link href="/my-bookings">
            <Button 
              variant="secondary" 
              size="icon" 
              className="bg-white shadow-lg hover:bg-gray-50 rounded-full h-10 w-10"
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5 text-gray-800" />
            </Button>
          </Link>
          
          <div className="flex items-center gap-2">
            {/* Connection status */}
            <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full shadow-lg" data-testid="connection-status">
              {pollingState.status === 'connected' ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-gray-400" />
              )}
              <span className="text-xs font-medium text-gray-700">
                {pollingState.status === 'connected' ? 'LIVE' : getConnectionStatusText(pollingState.status)}
              </span>
              {pollingState.status === 'connected' && (
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              )}
            </div>
            
            {/* Status badge */}
            <Badge 
              variant={ACTIVE_STATUSES.includes(locationData.status as BookingStatus) ? "default" : "secondary"}
              className="bg-white text-gray-800 shadow-lg"
              data-testid={`badge-status-${locationData.status}`}
            >
              {BOOKING_STATUS_INFO[locationData.status as BookingStatus]?.label || locationData.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Bottom card with trip details (Uber-style) */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl p-6 space-y-4">
          {/* ETA Header */}
          {routeInfo && (
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {currentLocation ? "Arriving in" : "Estimated trip time"}
                </p>
                <p className="text-3xl font-bold" data-testid="text-eta-large">{routeInfo.duration}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Distance</p>
                <p className="text-xl font-semibold" data-testid="text-distance">{routeInfo.distance}</p>
              </div>
            </div>
          )}

          {/* Trip route visualization */}
          <div className="space-y-3">
            {/* Pickup */}
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-gray-800 border-2 border-white shadow"></div>
                <div className="w-0.5 h-8 bg-gray-300"></div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Pickup</p>
                <p className="text-sm font-medium truncate" data-testid="text-pickup-address">{pickup.address}</p>
              </div>
            </div>

            {/* Dropoff */}
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 bg-gray-800"></div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Dropoff</p>
                <p className="text-sm font-medium truncate" data-testid="text-dropoff-address">{dropoff.address}</p>
              </div>
            </div>
          </div>

          {/* Live status indicator */}
          {currentLocation && (
            <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/30 p-3 rounded-xl">
              <div className="bg-green-500/20 p-2 rounded-full">
                <Navigation className="h-4 w-4 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-green-800 dark:text-green-200 text-sm">Mover is on the way</p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  Updated {new Date(currentLocation.updatedAt).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-xs font-bold text-green-600">LIVE</span>
              </div>
            </div>
          )}

          {/* Contact mover buttons */}
          {currentLocation && (
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                className="flex-1"
                data-testid="button-call-mover"
              >
                <Phone className="w-4 h-4 mr-2" />
                Call Mover
              </Button>
              <Button 
                variant="outline" 
                className="flex-1"
                data-testid="button-message-mover"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Message
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
