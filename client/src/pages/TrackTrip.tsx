import { useEffect, useState, useCallback } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GoogleMap, Marker, Polyline, InfoWindow, TrafficLayer, useJsApiLoader } from "@react-google-maps/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Package, Navigation } from "lucide-react";
import { Link } from "wouter";

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

  // Google Maps is already loaded globally in App.tsx
  // Still use useJsApiLoader to handle loading state properly
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  });

  // Fetch location data with auto-refresh
  const { data: locationData, isLoading } = useQuery<LocationData>({
    queryKey: ["/api/bookings", bookingId, "location"],
    refetchInterval: autoRefresh ? 5000 : false, // Refresh every 5 seconds
  });

  // Stop auto-refresh when trip is completed
  useEffect(() => {
    if (locationData?.status === "completed" || locationData?.status === "cancelled") {
      setAutoRefresh(false);
    }
  }, [locationData?.status]);

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
      
      map.fitBounds(bounds, 50); // 50px padding
    }
  }, [map, locationData]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load Google Maps</p>
          <p className="text-sm text-muted-foreground">Please check your API key configuration</p>
        </div>
      </div>
    );
  }

  if (!isLoaded || isLoading || !locationData) {
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

  // Calculate map center
  const center = {
    lat: (pickup.latitude + dropoff.latitude) / 2,
    lng: (pickup.longitude + dropoff.longitude) / 2,
  };

  // Create route line coordinates
  const routeCoordinates: google.maps.LatLngLiteral[] = [
    { lat: pickup.latitude, lng: pickup.longitude },
  ];
  
  if (currentLocation) {
    routeCoordinates.push({ lat: currentLocation.latitude, lng: currentLocation.longitude });
  }
  
  routeCoordinates.push({ lat: dropoff.latitude, lng: dropoff.longitude });

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto p-4 flex items-center gap-4">
          <Link href="/my-bookings">
            <Button variant="ghost" size="icon" className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Track Your Move</h1>
            <p className="text-sm text-muted-foreground">Live location tracking</p>
          </div>
          <Badge variant={locationData.status === "in_transit" ? "default" : "secondary"} data-testid={`badge-status-${locationData.status}`}>
            {locationData.status === "in_transit" ? "In Transit" : locationData.status}
          </Badge>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-4">
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
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-full">
                  <Navigation className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Mover is on the way</p>
                  <p className="text-sm text-muted-foreground">
                    Last updated: {new Date(currentLocation.updatedAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" data-testid="indicator-live"></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Google Map */}
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

                {/* Current location marker (blue) */}
                {currentLocation && (
                  <>
                    <Marker
                      key={`mover-${currentLocation.latitude}-${currentLocation.longitude}`}
                      position={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
                      icon={{
                        url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
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

                {/* Route line */}
                <Polyline
                  path={routeCoordinates}
                  options={{
                    strokeColor: "#3b82f6",
                    strokeOpacity: 0.7,
                    strokeWeight: 3,
                    icons: [{
                      icon: {
                        path: "M 0,-1 0,1",
                        strokeOpacity: 1,
                        scale: 3,
                      },
                      offset: "0",
                      repeat: "20px",
                    }],
                  }}
                />

                {/* Real-time traffic layer */}
                <TrafficLayer />
              </GoogleMap>
            </div>
          </CardContent>
        </Card>

        {/* Status Info */}
        {locationData.status !== "in_transit" && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                {locationData.status === "completed" 
                  ? "Your move has been completed!" 
                  : locationData.status === "pending"
                  ? "Waiting for mover to accept..."
                  : locationData.status === "accepted"
                  ? "Mover has accepted. Trip will start soon."
                  : "Trip status: " + locationData.status}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
