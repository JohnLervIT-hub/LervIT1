import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Navigation, DollarSign, Clock, Zap, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Location = {
  name: string;
  lat: number;
  lng: number;
};

type Mover = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
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
  { id: "1", name: "North Calgary Mover", lat: 50.9805, lng: -113.8919, color: "#3b82f6" },
  { id: "2", name: "South Calgary Mover", lat: 51.0859, lng: -114.1139, color: "#8b5cf6" },
  { id: "3", name: "Downtown Mover", lat: 51.1316, lng: -114.1022, color: "#ec4899" },
  { id: "4", name: "Central Mover", lat: 51.0474, lng: -113.9796, color: "#f59e0b" },
];

export default function ProximityDemo() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users to their role-specific dashboard
  useEffect(() => {
    // Wait for auth to finish loading before redirecting
    if (!isLoading && user) {
      if (user.role === "customer") {
        setLocation("/dashboard");
      } else if (user.role === "mover") {
        setLocation("/mover-dashboard");
      } else if (user.role === "admin") {
        setLocation("/admin");
      }
    }
  }, [user, isLoading, setLocation]);

  const [pickup, setPickup] = useState<Location | null>(null);
  const [dropoff, setDropoff] = useState<Location | null>(null);
  const [loadSize, setLoadSize] = useState<"small" | "medium" | "large">("medium");
  const [showMatching, setShowMatching] = useState(false);
  const [matchedMovers, setMatchedMovers] = useState<any[]>([]);
  const [priceBreakdown, setPriceBreakdown] = useState<any>(null);

  const latToY = (lat: number) => {
    const minLat = 50.95;
    const maxLat = 51.15;
    return ((maxLat - lat) / (maxLat - minLat)) * 100;
  };

  const lngToX = (lng: number) => {
    const minLng = -114.15;
    const maxLng = -113.85;
    return ((lng - minLng) / (maxLng - minLng)) * 100;
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

    setMatchedMovers(moversWithDistance.slice(0, 4));
    setShowMatching(true);
  };

  const reset = () => {
    setPickup(null);
    setDropoff(null);
    setShowMatching(false);
    setMatchedMovers([]);
    setPriceBreakdown(null);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
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
              <div className="relative w-full aspect-square bg-muted rounded-lg border-2 border-border overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-green-50/50 dark:from-blue-950/20 dark:to-green-950/20" />
                
                {DEMO_MOVERS.map((mover, i) => {
                  const isMatched = matchedMovers.some(m => m.id === mover.id);
                  const matchRank = matchedMovers.findIndex(m => m.id === mover.id);
                  
                  return (
                    <motion.div
                      key={mover.id}
                      className="absolute flex flex-col items-center gap-1"
                      style={{
                        left: `${lngToX(mover.lng)}%`,
                        top: `${latToY(mover.lat)}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      initial={{ scale: 1 }}
                      animate={{
                        scale: isMatched ? [1, 1.3, 1.1] : 1,
                        zIndex: isMatched ? 10 : 1,
                      }}
                      transition={{ duration: 0.5, delay: i * 0.1 }}
                    >
                      <div
                        className={`w-4 h-4 rounded-full border-2 border-white shadow-lg ${
                          isMatched ? 'ring-4 ring-primary/50' : ''
                        }`}
                        style={{ backgroundColor: mover.color }}
                      />
                      {isMatched && (
                        <Badge className="text-xs" data-testid={`badge-rank-${matchRank + 1}`}>
                          #{matchRank + 1}
                        </Badge>
                      )}
                    </motion.div>
                  );
                })}

                <AnimatePresence>
                  {pickup && (
                    <motion.div
                      className="absolute"
                      style={{
                        left: `${lngToX(pickup.lng)}%`,
                        top: `${latToY(pickup.lat)}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-6 h-6 bg-green-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
                          <MapPin className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-xs font-semibold bg-background px-2 py-0.5 rounded border">
                          {pickup.name}
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {dropoff && (
                    <motion.div
                      className="absolute"
                      style={{
                        left: `${lngToX(dropoff.lng)}%`,
                        top: `${latToY(dropoff.lat)}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
                          <Navigation className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-xs font-semibold bg-background px-2 py-0.5 rounded border">
                          {dropoff.name}
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {pickup && dropoff && (
                    <motion.svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <defs>
                        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="rgb(34, 197, 94)" />
                          <stop offset="100%" stopColor="rgb(239, 68, 68)" />
                        </linearGradient>
                      </defs>
                      <motion.line
                        x1={`${lngToX(pickup.lng)}%`}
                        y1={`${latToY(pickup.lat)}%`}
                        x2={`${lngToX(dropoff.lng)}%`}
                        y2={`${latToY(dropoff.lat)}%`}
                        stroke="url(#lineGradient)"
                        strokeWidth="3"
                        strokeDasharray="5,5"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 1 }}
                      />
                    </motion.svg>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {DEMO_MOVERS.map(mover => (
                  <div key={mover.id} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: mover.color }} />
                    <span className="text-muted-foreground">{mover.name.split(' ')[0]}</span>
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
                  <Select
                    value={pickup?.name || ""}
                    onValueChange={(name) => {
                      const loc = CALGARY_LOCATIONS.find(l => l.name === name);
                      setPickup(loc || null);
                    }}
                  >
                    <SelectTrigger data-testid="select-pickup">
                      <SelectValue placeholder="Select pickup location" />
                    </SelectTrigger>
                    <SelectContent>
                      {CALGARY_LOCATIONS.map(loc => (
                        <SelectItem key={loc.name} value={loc.name}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Dropoff Location</label>
                  <Select
                    value={dropoff?.name || ""}
                    onValueChange={(name) => {
                      const loc = CALGARY_LOCATIONS.find(l => l.name === name);
                      setDropoff(loc || null);
                    }}
                  >
                    <SelectTrigger data-testid="select-dropoff">
                      <SelectValue placeholder="Select dropoff location" />
                    </SelectTrigger>
                    <SelectContent>
                      {CALGARY_LOCATIONS.map(loc => (
                        <SelectItem key={loc.name} value={loc.name}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <div className="space-y-3">
                    {matchedMovers.map((mover, index) => (
                      <motion.div
                        key={mover.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.15 }}
                        className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg border"
                        data-testid={`mover-match-${index}`}
                      >
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-xl">
                          #{index + 1}
                        </div>
                        
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: mover.color }}
                            />
                            <span className="font-semibold">{mover.name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {mover.distanceToPickup.toFixed(2)} km to pickup
                            </span>
                            {mover.travelFee > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                +${mover.travelFee.toFixed(2)} travel fee
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-2xl font-bold text-primary">
                            ${mover.earnings.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Expires in 10 min
                          </div>
                        </div>
                      </motion.div>
                    ))}
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
