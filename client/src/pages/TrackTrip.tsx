import { useEffect, useState, useCallback } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GoogleMap, Marker, InfoWindow, TrafficLayer, DirectionsRenderer } from "@react-google-maps/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Package, Navigation, Clock, Route } from "lucide-react";
import { Link } from "wouter";
import MoveProgressIndicator from "@/components/MoveProgressIndicator";
import { BOOKING_STATUSES, ACTIVE_STATUSES, BOOKING_STATUS_INFO, type BookingStatus } from "@shared/schema";

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
}

const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
};

export default function TrackTrip() {
  const [, params] = useRoute("/track-trip/:bookingId");
  const bookingId = params?.bookingId;
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<'pickup' | 'dropoff' | 'mover' | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);

  // Google Maps API is loaded globally in App.tsx
  // No need to load it again here

  const { data: locationData, isLoading } = useQuery<LocationData>({
    queryKey: ["/api/bookings", bookingId, "location"],
    refetchInterval: autoRefresh ? 5000 : false,
  });

  useEffect(() => {
    if (locationData?.status === "completed" || locationData?.status === "cancelled") {
      setAutoRefresh(false);
    }
  }, [locationData?.status]);

  // Calculate driving directions when location data changes
  useEffect(() => {
    if (!locationData) return;

    const directionsService = new google.maps.DirectionsService();

    // Determine origin based on mover's current location or pickup
    const origin = locationData.currentLocation 
      ? { lat: locationData.currentLocation.latitude, lng: locationData.currentLocation.longitude }
      : { lat: locationData.pickup.latitude, lng: locationData.pickup.longitude };

    // If mover has current location, route from mover to pickup to dropoff
    // Otherwise, route from pickup to dropoff
    if (locationData.currentLocation) {
      // Mover is on the way - show route from mover to dropoff via pickup
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
            // Calculate total distance and duration
            let totalDistance = 0;
            let totalDuration = 0;
            result.routes[0].legs.forEach(leg => {
              totalDistance += leg.distance?.value || 0;
              totalDuration += leg.duration?.value || 0;
            });
            setRouteInfo({
              distance: (totalDistance / 1000).toFixed(1) + ' km',
              duration: Math.ceil(totalDuration / 60) + ' min',
            });
          }
        }
      );
    } else {
      // No mover location yet - show route from pickup to dropoff
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
            setRouteInfo({
              distance: leg.distance?.text || '',
              duration: leg.duration?.text || '',
            });
          }
        }
      );
    }
  }, [locationData]);

  // Update map bounds when location changes
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
      
      map.fitBounds(bounds, 50);
    }
  }, [map, locationData]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  // Google Maps API is loaded globally in App.tsx, so no need to check loadError here

  if (isLoading || !locationData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
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

  const center = {
    lat: (pickup.latitude + dropoff.latitude) / 2,
    lng: (pickup.longitude + dropoff.longitude) / 2,
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto p-4 flex items-center gap-4">
          <Link href="/my-bookings">
            <Button variant="ghost" size="icon" className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20" data-testid="button-back" aria-label="Go back to bookings">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Track Your Move</h1>
            <p className="text-sm text-muted-foreground">Live location tracking</p>
          </div>
          <Badge 
            variant={ACTIVE_STATUSES.includes(locationData.status as BookingStatus) || locationData.status === "in_transit" ? "default" : "secondary"} 
            data-testid={`badge-status-${locationData.status}`}
          >
            {BOOKING_STATUS_INFO[locationData.status as BookingStatus]?.label || locationData.status}
          </Badge>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* Move Progress Indicator */}
        <Card>
          <CardContent className="pt-6">
            <MoveProgressIndicator currentStatus={locationData.status} />
          </CardContent>
        </Card>

        {/* Route Info Card */}
        {routeInfo && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-around">
                <div className="flex items-center gap-2">
                  <Route className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Distance</p>
                    <p className="font-semibold text-lg" data-testid="text-route-distance">{routeInfo.distance}</p>
                  </div>
                </div>
                <div className="w-px h-10 bg-border" />
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">ETA</p>
                    <p className="font-semibold text-lg" data-testid="text-route-duration">{routeInfo.duration}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Location Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-green-600" />
                Pickup Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm" data-testid="text-pickup-address">{pickup.address}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-red-600" />
                Dropoff Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm" data-testid="text-dropoff-address">{dropoff.address}</p>
            </CardContent>
          </Card>
        </div>

        {/* Current Location Status */}
        {currentLocation && (
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="bg-green-500/20 p-2 rounded-full">
                  <Navigation className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-green-800 dark:text-green-200">Mover is on the way!</p>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Last updated: {new Date(currentLocation.updatedAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" data-testid="indicator-live"></div>
                  <span className="text-sm font-medium text-green-600">LIVE</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Google Map with Driving Directions */}
        <Card>
          <CardContent className="p-0">
            <div className="h-[500px] w-full relative overflow-hidden rounded-lg" data-testid="map-container">
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={center}
                zoom={12}
                options={mapOptions}
                onLoad={onMapLoad}
              >
                {/* Render driving directions */}
                {directions && (
                  <DirectionsRenderer
                    directions={directions}
                    options={{
                      suppressMarkers: true,
                      polylineOptions: {
                        strokeColor: "#3b82f6",
                        strokeWeight: 5,
                        strokeOpacity: 0.8,
                      },
                    }}
                  />
                )}

                {/* Pickup marker (green) */}
                <Marker
                  position={{ lat: pickup.latitude, lng: pickup.longitude }}
                  icon={{
                    url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
                  }}
                  onClick={() => setSelectedMarker('pickup')}
                  data-testid="marker-pickup"
                />
                {selectedMarker === 'pickup' && (
                  <InfoWindow
                    position={{ lat: pickup.latitude, lng: pickup.longitude }}
                    onCloseClick={() => setSelectedMarker(null)}
                  >
                    <div>
                      <strong>Pickup</strong><br />
                      {pickup.address}
                    </div>
                  </InfoWindow>
                )}

                {/* Dropoff marker (red) */}
                <Marker
                  position={{ lat: dropoff.latitude, lng: dropoff.longitude }}
                  icon={{
                    url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
                  }}
                  onClick={() => setSelectedMarker('dropoff')}
                  data-testid="marker-dropoff"
                />
                {selectedMarker === 'dropoff' && (
                  <InfoWindow
                    position={{ lat: dropoff.latitude, lng: dropoff.longitude }}
                    onCloseClick={() => setSelectedMarker(null)}
                  >
                    <div>
                      <strong>Dropoff</strong><br />
                      {dropoff.address}
                    </div>
                  </InfoWindow>
                )}

                {/* Current mover location marker (blue truck icon) */}
                {currentLocation && (
                  <>
                    <Marker
                      key={`mover-${currentLocation.latitude}-${currentLocation.longitude}`}
                      position={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
                      icon={{
                        url: "https://maps.google.com/mapfiles/ms/icons/truck.png",
                        scaledSize: new google.maps.Size(40, 40),
                      }}
                      onClick={() => setSelectedMarker('mover')}
                      data-testid="marker-mover"
                    />
                    {selectedMarker === 'mover' && (
                      <InfoWindow
                        position={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
                        onCloseClick={() => setSelectedMarker(null)}
                      >
                        <div>
                          <strong>Mover Location</strong><br />
                          Updated: {new Date(currentLocation.updatedAt).toLocaleTimeString()}
                        </div>
                      </InfoWindow>
                    )}
                  </>
                )}

                {/* Real-time traffic layer */}
                <TrafficLayer />
              </GoogleMap>
            </div>
          </CardContent>
        </Card>

        {/* Status Info - Only show for non-active statuses */}
        {!ACTIVE_STATUSES.includes(locationData.status as BookingStatus) && locationData.status !== "in_transit" && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground" data-testid="text-status-info">
                {BOOKING_STATUS_INFO[locationData.status as BookingStatus]?.description || `Status: ${locationData.status}`}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
