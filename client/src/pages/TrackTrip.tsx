import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { Icon, LatLngBounds } from "leaflet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Package, Navigation } from "lucide-react";
import { Link } from "wouter";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in React-Leaflet
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (Icon.Default.prototype as any)._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Custom icons
const pickupIcon = new Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const dropoffIcon = new Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const moverIcon = new Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

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

// Component to update map bounds when markers change
function MapBoundsUpdater({ 
  pickup, 
  dropoff, 
  currentLocation 
}: { 
  pickup: { latitude: number; longitude: number }; 
  dropoff: { latitude: number; longitude: number }; 
  currentLocation: { latitude: number; longitude: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    const bounds = new LatLngBounds([
      [pickup.latitude, pickup.longitude],
      [dropoff.latitude, dropoff.longitude],
    ]);

    if (currentLocation) {
      bounds.extend([currentLocation.latitude, currentLocation.longitude]);
    }

    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, pickup.latitude, pickup.longitude, dropoff.latitude, dropoff.longitude, currentLocation?.latitude, currentLocation?.longitude]);

  return null;
}

export default function TrackTrip() {
  const [, params] = useRoute("/track-trip/:bookingId");
  const bookingId = params?.bookingId;
  const [autoRefresh, setAutoRefresh] = useState(true);

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

  // Calculate map center
  const centerLat = (pickup.latitude + dropoff.latitude) / 2;
  const centerLng = (pickup.longitude + dropoff.longitude) / 2;

  // Create route line coordinates
  const routeCoordinates: [number, number][] = [
    [pickup.latitude, pickup.longitude],
  ];
  
  if (currentLocation) {
    routeCoordinates.push([currentLocation.latitude, currentLocation.longitude]);
  }
  
  routeCoordinates.push([dropoff.latitude, dropoff.longitude]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto p-4 flex items-center gap-4">
          <Link href="/my-bookings">
            <Button variant="ghost" size="icon" data-testid="button-back">
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

        {/* Map */}
        <Card>
          <CardContent className="p-0">
            <div className="h-[500px] w-full relative overflow-hidden rounded-lg">
              <MapContainer
                center={[centerLat, centerLng]}
                zoom={12}
                style={{ height: "100%", width: "100%" }}
                data-testid="map-container"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                {/* Pickup marker */}
                <Marker position={[pickup.latitude, pickup.longitude]} icon={pickupIcon}>
                  <Popup>
                    <strong>Pickup</strong><br />
                    {pickup.address}
                  </Popup>
                </Marker>

                {/* Dropoff marker */}
                <Marker position={[dropoff.latitude, dropoff.longitude]} icon={dropoffIcon}>
                  <Popup>
                    <strong>Dropoff</strong><br />
                    {dropoff.address}
                  </Popup>
                </Marker>

                {/* Current location marker */}
                {currentLocation && (
                  <Marker 
                    key={`mover-${currentLocation.latitude}-${currentLocation.longitude}`}
                    position={[currentLocation.latitude, currentLocation.longitude]} 
                    icon={moverIcon}
                  >
                    <Popup>
                      <strong>Mover Location</strong><br />
                      Updated: {new Date(currentLocation.updatedAt).toLocaleTimeString()}
                    </Popup>
                  </Marker>
                )}

                {/* Route line */}
                <Polyline 
                  positions={routeCoordinates} 
                  color="#3b82f6" 
                  weight={3} 
                  opacity={0.7}
                  dashArray="10, 10"
                />

                {/* Update map bounds when location changes */}
                <MapBoundsUpdater 
                  pickup={pickup} 
                  dropoff={dropoff} 
                  currentLocation={currentLocation} 
                />
              </MapContainer>
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
