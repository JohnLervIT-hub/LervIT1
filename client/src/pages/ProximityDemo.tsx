import { useState, useCallback, useEffect } from "react";
import { GoogleMap, Marker, Polyline, InfoWindow } from "@react-google-maps/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { MapPin, Navigation, DollarSign, Clock, Zap, TrendingUp, ShieldCheck, Star, Truck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Location = {
  name: string;
  lat: number;
  lng: number;
};

type Mover = {
  id: string;
  name: string;
  quadrant: string;
  lat: number;
  lng: number;
  color: string;
  verified: boolean;
  rating: number;
  tripCount: number;
  vehicle: string;
  vehicleType: string;
};

const CALGARY_LOCATIONS: Location[] = [
  { name: "Downtown", lat: 51.0447, lng: -114.0719 },
  { name: "Kensington", lat: 51.0536, lng: -114.0869 },
  { name: "Mission", lat: 51.0342, lng: -114.0836 },
  { name: "Brentwood", lat: 51.0861, lng: -114.1311 },
  { name: "Inglewood", lat: 51.0383, lng: -114.0406 },
  { name: "17 Ave", lat: 51.0375, lng: -114.0719 },
  { name: "Chinook Centre", lat: 50.9978, lng: -114.0711 },
  { name: "University", lat: 51.0792, lng: -114.1311 },
];

const DEMO_MOVERS: Mover[] = [
  { 
    id: "1", 
    name: "John Doe", 
    quadrant: "SW Calgary",
    lat: 50.9805, 
    lng: -114.1319, 
    color: "#3b82f6",
    verified: true,
    rating: 4.9,
    tripCount: 212,
    vehicle: "Ford Transit",
    vehicleType: "Large Van"
  },
  { 
    id: "2", 
    name: "Sarah Chen", 
    quadrant: "NW Calgary",
    lat: 51.0859, 
    lng: -114.1439, 
    color: "#8b5cf6",
    verified: true,
    rating: 4.8,
    tripCount: 187,
    vehicle: "RAM ProMaster",
    vehicleType: "Cargo Van"
  },
  { 
    id: "3", 
    name: "Mike Johnson", 
    quadrant: "NE Calgary",
    lat: 51.1116, 
    lng: -113.9622, 
    color: "#ec4899",
    verified: true,
    rating: 4.7,
    tripCount: 156,
    vehicle: "Chevy Express",
    vehicleType: "Large Van"
  },
  { 
    id: "4", 
    name: "David Park", 
    quadrant: "SE Calgary",
    lat: 50.9874, 
    lng: -113.9596, 
    color: "#f59e0b",
    verified: false,
    rating: 4.6,
    tripCount: 94,
    vehicle: "Ford F-150",
    vehicleType: "Pickup Truck"
  },
  { 
    id: "5", 
    name: "Lisa Wong", 
    quadrant: "Downtown",
    lat: 51.0547, 
    lng: -114.0669, 
    color: "#10b981",
    verified: true,
    rating: 5.0,
    tripCount: 243,
    vehicle: "Mercedes Sprinter",
    vehicleType: "Large Van"
  },
];

export default function ProximityDemo() {
  const [pickup, setPickup] = useState<Location | null>(null);
  const [dropoff, setDropoff] = useState<Location | null>(null);
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [loadSize, setLoadSize] = useState<"small" | "medium" | "large">("medium");
  const [showMatching, setShowMatching] = useState(false);
  const [matchedMovers, setMatchedMovers] = useState<any[]>([]);
  const [priceBreakdown, setPriceBreakdown] = useState<any>(null);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  // Map configuration
  const mapContainerStyle = {
    width: '100%',
    height: '500px'
  };

  const calgaryCenter = {
    lat: 51.0447,
    lng: -114.0719
  };

  const mapOptions: google.maps.MapOptions = {
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    styles: [
      {
        featureType: "poi",
        elementType: "labels",
        stylers: [{ visibility: "off" }]
      }
    ]
  };

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  // Auto-center map when locations change
  useEffect(() => {
    if (!map || (!pickup && !dropoff)) return;

    const bounds = new google.maps.LatLngBounds();
    
    if (pickup) bounds.extend({ lat: pickup.lat, lng: pickup.lng });
    if (dropoff) bounds.extend({ lat: dropoff.lat, lng: dropoff.lng });
    
    // Add some padding to the bounds
    if (pickup || dropoff) {
      map.fitBounds(bounds);
      
      // Set a maximum zoom level
      const listener = google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        const currentZoom = map.getZoom();
        if (currentZoom && currentZoom > 13) {
          map.setZoom(13);
        }
      });
    }
  }, [map, pickup, dropoff]);

  // Handle pickup address selection
  const handlePickupChange = (address: string, placeDetails?: google.maps.places.PlaceResult) => {
    setPickupAddress(address);
    
    if (placeDetails?.geometry?.location) {
      const lat = placeDetails.geometry.location.lat();
      const lng = placeDetails.geometry.location.lng();
      setPickup({
        name: placeDetails.formatted_address || address,
        lat,
        lng
      });
    }
  };

  // Handle dropoff address selection
  const handleDropoffChange = (address: string, placeDetails?: google.maps.places.PlaceResult) => {
    setDropoffAddress(address);
    
    if (placeDetails?.geometry?.location) {
      const lat = placeDetails.geometry.location.lat();
      const lng = placeDetails.geometry.location.lng();
      setDropoff({
        name: placeDetails.formatted_address || address,
        lat,
        lng
      });
    }
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const runMatchingDemo = () => {
    if (!pickup || !dropoff) return;

    const tripDistance = calculateDistance(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    
    const loadFees = { small: 10, medium: 25, large: 40 };
    const baseFee = 25;
    const distanceFee = tripDistance * 1.5;
    const loadFee = loadFees[loadSize];

    const moversWithDistance = DEMO_MOVERS.map(mover => {
      const distanceToPickup = calculateDistance(mover.lat, mover.lng, pickup.lat, pickup.lng);
      const travelFee = distanceToPickup > 5 ? (distanceToPickup - 5) * 0.75 : 0;
      const earnings = baseFee + distanceFee + loadFee + travelFee;
      
      return {
        ...mover,
        distanceToPickup,
        travelFee,
        earnings,
      };
    }).sort((a, b) => a.distanceToPickup - b.distanceToPickup);

    setPriceBreakdown({
      baseFee,
      distanceFee,
      loadFee,
      tripDistance,
      total: baseFee + distanceFee + loadFee,
    });

    setMatchedMovers(moversWithDistance.slice(0, 5));
    setShowMatching(true);
  };

  const reset = () => {
    setPickup(null);
    setDropoff(null);
    setPickupAddress("");
    setDropoffAddress("");
    setShowMatching(false);
    setMatchedMovers([]);
    setPriceBreakdown(null);
  };

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-4 md:pt-24 md:px-8 md:pb-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-3">
            <Zap className="w-10 h-10 text-primary" />
            Uber-Style Proximity Matching
          </h1>
          <p className="text-muted-foreground text-lg">
            Watch how LervIT finds and notifies the nearest movers in real-time
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Calgary Map
              </CardTitle>
              <CardDescription>Movers and booking locations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg overflow-hidden border-2 border-border">
                <GoogleMap
                    mapContainerStyle={mapContainerStyle}
                    center={calgaryCenter}
                    zoom={11}
                    options={mapOptions}
                    onLoad={onMapLoad}
                  >
                    {/* Mover Markers */}
                    {DEMO_MOVERS.map((mover, i) => {
                      const isMatched = matchedMovers.some(m => m.id === mover.id);
                      const matchRank = matchedMovers.findIndex(m => m.id === mover.id);
                      
                      return (
                        <Marker
                          key={mover.id}
                          position={{ lat: mover.lat, lng: mover.lng }}
                          icon={{
                            path: google.maps.SymbolPath.CIRCLE,
                            fillColor: mover.color,
                            fillOpacity: isMatched ? 1 : 0.8,
                            strokeColor: '#ffffff',
                            strokeWeight: 3,
                            scale: isMatched ? 12 : 8,
                          }}
                          onClick={() => setSelectedMarker(`mover-${mover.id}`)}
                          zIndex={isMatched ? 1000 + i : 1}
                          data-testid={`marker-mover-${mover.id}`}
                        />
                      );
                    })}

                    {/* Pickup Marker (Green) */}
                    {pickup && (
                      <Marker
                        position={{ lat: pickup.lat, lng: pickup.lng }}
                        icon={{
                          url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
                        }}
                        onClick={() => setSelectedMarker('pickup')}
                        data-testid="marker-pickup"
                      />
                    )}

                    {/* Dropoff Marker (Red) */}
                    {dropoff && (
                      <Marker
                        position={{ lat: dropoff.lat, lng: dropoff.lng }}
                        icon={{
                          url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
                        }}
                        onClick={() => setSelectedMarker('dropoff')}
                        data-testid="marker-dropoff"
                      />
                    )}

                    {/* Route Line */}
                    {pickup && dropoff && (
                      <Polyline
                        path={[
                          { lat: pickup.lat, lng: pickup.lng },
                          { lat: dropoff.lat, lng: dropoff.lng }
                        ]}
                        options={{
                          strokeColor: "#22c55e",
                          strokeOpacity: 0.8,
                          strokeWeight: 4,
                          geodesic: true,
                        }}
                      />
                    )}

                    {/* Info Windows */}
                    {selectedMarker === 'pickup' && pickup && (
                      <InfoWindow
                        position={{ lat: pickup.lat, lng: pickup.lng }}
                        onCloseClick={() => setSelectedMarker(null)}
                      >
                        <div>
                          <strong className="text-green-600">Pickup Location</strong><br />
                          {pickup.name}
                        </div>
                      </InfoWindow>
                    )}

                    {selectedMarker === 'dropoff' && dropoff && (
                      <InfoWindow
                        position={{ lat: dropoff.lat, lng: dropoff.lng }}
                        onCloseClick={() => setSelectedMarker(null)}
                      >
                        <div>
                          <strong className="text-red-600">Dropoff Location</strong><br />
                          {dropoff.name}
                        </div>
                      </InfoWindow>
                    )}

                    {DEMO_MOVERS.map((mover) => {
                      const isMatched = matchedMovers.some(m => m.id === mover.id);
                      const matchRank = matchedMovers.findIndex(m => m.id === mover.id);
                      const moverData = matchedMovers.find(m => m.id === mover.id);

                      return selectedMarker === `mover-${mover.id}` && (
                        <InfoWindow
                          key={`info-${mover.id}`}
                          position={{ lat: mover.lat, lng: mover.lng }}
                          onCloseClick={() => setSelectedMarker(null)}
                        >
                          <div>
                            <strong style={{ color: mover.color }}>{mover.name}</strong><br />
                            {isMatched && moverData && (
                              <>
                                <span className="text-sm">Rank: #{matchRank + 1}</span><br />
                                <span className="text-sm">Distance to pickup: {moverData.distanceToPickup.toFixed(2)} km</span><br />
                                <span className="text-sm">Potential earnings: ${moverData.earnings.toFixed(2)}</span>
                              </>
                            )}
                          </div>
                        </InfoWindow>
                      );
                    })}
                  </GoogleMap>
                </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {DEMO_MOVERS.map(mover => (
                  <div key={mover.id} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: mover.color }} />
                    <span className="text-muted-foreground">
                      {mover.name} - {mover.quadrant}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Navigation className="w-5 h-5" />
                  Create Demo Booking
                </CardTitle>
                <CardDescription>Select locations and load size</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Pickup Location</label>
                  <AddressAutocomplete
                    value={pickupAddress}
                    onChange={handlePickupChange}
                    placeholder="Search and select pickup address..."
                    data-testid="input-pickup"
                  />
                  {pickup ? (
                    <p className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1">
                      ✓ {pickup.name}
                    </p>
                  ) : pickupAddress ? (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      Please select an address from the dropdown
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Dropoff Location</label>
                  <AddressAutocomplete
                    value={dropoffAddress}
                    onChange={handleDropoffChange}
                    placeholder="Search and select dropoff address..."
                    data-testid="input-dropoff"
                  />
                  {dropoff ? (
                    <p className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1">
                      ✓ {dropoff.name}
                    </p>
                  ) : dropoffAddress ? (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      Please select an address from the dropdown
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Load Size</label>
                  <Select value={loadSize} onValueChange={(val: any) => setLoadSize(val)}>
                    <SelectTrigger data-testid="select-loadsize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small (+$10)</SelectItem>
                      <SelectItem value="medium">Medium (+$25)</SelectItem>
                      <SelectItem value="large">Large (+$40)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={runMatchingDemo}
                    disabled={!pickup || !dropoff}
                    className="flex-1"
                    data-testid="button-run-matching"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Run Proximity Matching
                  </Button>
                  <Button onClick={reset} variant="outline" data-testid="button-reset">
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            {priceBreakdown && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
                      Dynamic Pricing
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Base Fee</span>
                      <span className="font-medium">${priceBreakdown.baseFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Distance ({priceBreakdown.tripDistance.toFixed(2)} km × $1.50)
                      </span>
                      <span className="font-medium">${priceBreakdown.distanceFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Load Fee ({loadSize})</span>
                      <span className="font-medium">${priceBreakdown.loadFee.toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-3 flex justify-between font-bold text-lg">
                      <span>Total Base Price</span>
                      <span className="text-primary">${priceBreakdown.total.toFixed(2)}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showMatching && matchedMovers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Matched Movers (Top {matchedMovers.length})
                  </CardTitle>
                  <CardDescription>
                    Ranked by proximity to pickup location • Auto-notified with 10-minute timeout
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {matchedMovers.map((mover, index) => {
                      const eta = Math.ceil(mover.distanceToPickup * 2.2); // ~2.2 min per km in Calgary traffic
                      
                      return (
                        <motion.div
                          key={mover.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.2 }}
                          className="p-6 bg-card rounded-lg border shadow-sm hover-elevate"
                          data-testid={`mover-match-${index}`}
                        >
                          <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-lg shrink-0">
                                #{index + 1}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-bold text-base">{mover.name}</span>
                                  <span className="text-sm text-muted-foreground">{mover.quadrant}</span>
                                  {mover.verified && (
                                    <Badge variant="default" className="text-xs gap-1">
                                      <ShieldCheck className="w-3 h-3" />
                                      Verified
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="text-right shrink-0">
                              <div className="text-2xl font-bold text-primary leading-tight">
                                ${mover.earnings.toFixed(2)}
                              </div>
                              {mover.travelFee > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  (${mover.travelFee.toFixed(2)} travel fee included)
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground mt-2">
                                Expires in 10 min
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-2.5 text-sm">
                            <div className="flex items-center gap-2">
                              <Star className="w-4 h-4 fill-amber-500 text-amber-500 shrink-0" />
                              <span className="font-medium">{mover.rating.toFixed(1)}</span>
                              <span className="text-muted-foreground">({mover.tripCount} trips)</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">
                                {mover.vehicle} ({mover.vehicleType})
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">
                                {mover.distanceToPickup.toFixed(2)} km away
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">
                                ETA: {eta} min
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="mt-6 p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="flex items-start gap-3">
                      <Zap className="w-5 h-5 text-primary mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold text-sm">Matching Algorithm Summary</p>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>✓ Searched 15km radius from pickup location</li>
                          <li>✓ Ranked {DEMO_MOVERS.length} movers by distance</li>
                          <li>✓ Notified top {matchedMovers.length} nearest movers</li>
                          <li>✓ Added travel fees for movers &gt;5km away</li>
                          <li>✓ Set 10-minute acceptance timeout</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
