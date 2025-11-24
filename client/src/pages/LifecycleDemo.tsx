import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomAddressInput } from "@/components/CustomAddressInput";
import { 
  MapPin, Navigation, DollarSign, Clock, Zap, TrendingUp, 
  User, CheckCircle, Package, MessageCircle, Star, Truck,
  Bell, ArrowRight, RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";

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
  avatar: string;
};

type Step = 
  | "setup" 
  | "geocoding" 
  | "pricing" 
  | "matching" 
  | "notifying" 
  | "waiting" 
  | "accepted" 
  | "in_progress" 
  | "completed" 
  | "reviewed";

const CALGARY_LOCATIONS: Location[] = [
  { name: "Downtown", lat: 51.0447, lng: -114.0719 },
  { name: "Kensington", lat: 51.0536, lng: -114.0869 },
  { name: "Mission", lat: 51.0342, lng: -114.0836 },
  { name: "Brentwood", lat: 51.0861, lng: -114.1311 },
  { name: "Inglewood", lat: 51.0383, lng: -114.0406 },
];

const DEMO_MOVERS: Mover[] = [
  { id: "1", name: "Alex Turner", lat: 51.0859, lng: -114.1139, color: "#3b82f6", avatar: "AT" },
  { id: "2", name: "Sarah Chen", lat: 51.0474, lng: -113.9796, color: "#8b5cf6", avatar: "SC" },
  { id: "3", name: "Mike Rodriguez", lat: 51.1316, lng: -114.1022, color: "#ec4899", avatar: "MR" },
  { id: "4", name: "Emma Wilson", lat: 50.9805, lng: -113.8919, color: "#f59e0b", avatar: "EW" },
];

const STEP_INFO = {
  setup: { title: "Customer Creates Booking", icon: User, color: "bg-blue-500" },
  geocoding: { title: "System Geocodes Addresses", icon: MapPin, color: "bg-purple-500" },
  pricing: { title: "Dynamic Pricing Calculated", icon: DollarSign, color: "bg-green-500" },
  matching: { title: "Finding Nearest Movers", icon: Navigation, color: "bg-orange-500" },
  notifying: { title: "Notifying Top Movers", icon: Bell, color: "bg-pink-500" },
  waiting: { title: "Waiting for Acceptance", icon: Clock, color: "bg-yellow-500" },
  accepted: { title: "Booking Accepted", icon: CheckCircle, color: "bg-emerald-500" },
  in_progress: { title: "Move in Progress", icon: Truck, color: "bg-blue-600" },
  completed: { title: "Move Completed", icon: Package, color: "bg-green-600" },
  reviewed: { title: "Customer Reviews", icon: Star, color: "bg-amber-500" },
};

export default function LifecycleDemo() {
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

  const [currentStep, setCurrentStep] = useState<Step>("setup");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [pickup, setPickup] = useState<Location | null>(null);
  const [dropoff, setDropoff] = useState<Location | null>(null);
  const [loadSize, setLoadSize] = useState<"small" | "medium" | "large">("medium");
  const [distance, setDistance] = useState(0);
  const [priceBreakdown, setPriceBreakdown] = useState<any>(null);
  const [matchedMovers, setMatchedMovers] = useState<any[]>([]);
  const [selectedMover, setSelectedMover] = useState<any>(null);
  const [timer, setTimer] = useState(600);
  const [rating, setRating] = useState(0);

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

  const geocodeAddress = async (address: string): Promise<Location | null> => {
    try {
      const geocoder = new google.maps.Geocoder();
      const result = await geocoder.geocode({ address: address + ", Calgary, AB" });
      
      if (result.results[0]) {
        const location = result.results[0].geometry.location;
        return {
          name: result.results[0].formatted_address,
          lat: location.lat(),
          lng: location.lng(),
        };
      }
      return null;
    } catch (error) {
      console.error("Geocoding error:", error);
      return null;
    }
  };

  const handlePickupChange = async (address: string) => {
    setPickupAddress(address);
    if (address) {
      const location = await geocodeAddress(address);
      setPickup(location);
    } else {
      setPickup(null);
    }
  };

  const handleDropoffChange = async (address: string) => {
    setDropoffAddress(address);
    if (address) {
      const location = await geocodeAddress(address);
      setDropoff(location);
    } else {
      setDropoff(null);
    }
  };

  const startDemo = async () => {
    if (!pickup || !dropoff) return;

    setCurrentStep("geocoding");
    await sleep(2500);

    const tripDistance = calculateDistance(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    setDistance(tripDistance);
    setCurrentStep("pricing");
    await sleep(2500);

    const loadFees = { small: 10, medium: 25, large: 40 };
    const baseFee = 25;
    const distanceFee = tripDistance * 1.5;
    const loadFee = loadFees[loadSize];
    
    setPriceBreakdown({
      baseFee,
      distanceFee,
      loadFee,
      tripDistance,
      total: baseFee + distanceFee + loadFee,
    });

    setCurrentStep("matching");
    await sleep(3000);

    const moversWithDistance = DEMO_MOVERS.map(mover => {
      const distanceToPickup = calculateDistance(mover.lat, mover.lng, pickup.lat, pickup.lng);
      const travelFee = distanceToPickup > 5 ? (distanceToPickup - 5) * 0.75 : 0;
      const earnings = baseFee + distanceFee + loadFee + travelFee;
      
      return {
        ...mover,
        distanceToPickup,
        travelFee,
        earnings,
        notified: false,
      };
    }).sort((a, b) => a.distanceToPickup - b.distanceToPickup).slice(0, 4);

    setMatchedMovers(moversWithDistance);
    setCurrentStep("notifying");
    
    for (let i = 0; i < moversWithDistance.length; i++) {
      await sleep(1200);
      setMatchedMovers(prev => prev.map((m, idx) => 
        idx === i ? { ...m, notified: true } : m
      ));
    }

    await sleep(1500);
    setCurrentStep("waiting");
    setTimer(600);
    
    const countdown = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          clearInterval(countdown);
          return 0;
        }
        return prev - 1;
      });
    }, 100);

    await sleep(4500);
    clearInterval(countdown);
    
    setSelectedMover(moversWithDistance[0]);
    setCurrentStep("accepted");
    await sleep(3000);

    setCurrentStep("in_progress");
    await sleep(4500);

    setCurrentStep("completed");
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const reset = () => {
    setCurrentStep("setup");
    setPickupAddress("");
    setDropoffAddress("");
    setPickup(null);
    setDropoff(null);
    setDistance(0);
    setPriceBreakdown(null);
    setMatchedMovers([]);
    setSelectedMover(null);
    setTimer(600);
    setRating(0);
  };

  const stepIndex = Object.keys(STEP_INFO).indexOf(currentStep);
  const progress = ((stepIndex + 1) / Object.keys(STEP_INFO).length) * 100;

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-4 md:pt-24 md:px-8 md:pb-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-3">
            <Zap className="w-10 h-10 text-primary" />
            Full Lifecycle Demo
          </h1>
          <p className="text-muted-foreground text-lg">
            Watch a complete booking journey from creation to completion
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                {(() => {
                  const StepIcon = STEP_INFO[currentStep].icon;
                  return <StepIcon className="w-5 h-5" />;
                })()}
                {STEP_INFO[currentStep].title}
              </span>
              <Badge className={STEP_INFO[currentStep].color}>
                Step {stepIndex + 1} of {Object.keys(STEP_INFO).length}
              </Badge>
            </CardTitle>
            <Progress value={progress} className="h-2" />
          </CardHeader>
        </Card>

        {currentStep === "setup" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid md:grid-cols-2 gap-6"
          >
            <Card>
              <CardHeader>
                <CardTitle>Customer Information</CardTitle>
                <CardDescription>Demo customer creating a booking</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                    JD
                  </div>
                  <div>
                    <p className="font-semibold">John Doe</p>
                    <p className="text-sm text-muted-foreground">john.doe@email.com</p>
                    <p className="text-sm text-muted-foreground">403-555-1234</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Booking Details</CardTitle>
                <CardDescription>Configure the move</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Pickup Location</label>
                  <CustomAddressInput
                    value={pickupAddress}
                    onChange={handlePickupChange}
                    placeholder="Search and select pickup address..."
                    data-testid="input-pickup-lifecycle"
                  />
                  {pickup && (
                    <p className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {pickup.name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Dropoff Location</label>
                  <CustomAddressInput
                    value={dropoffAddress}
                    onChange={handleDropoffChange}
                    placeholder="Search and select dropoff address..."
                    data-testid="input-dropoff-lifecycle"
                  />
                  {dropoff && (
                    <p className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {dropoff.name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Load Size</label>
                  <Select value={loadSize} onValueChange={(val: any) => setLoadSize(val)}>
                    <SelectTrigger data-testid="select-loadsize-lifecycle">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small (+$10)</SelectItem>
                      <SelectItem value="medium">Medium (+$25)</SelectItem>
                      <SelectItem value="large">Large (+$40)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={startDemo}
                  disabled={!pickup || !dropoff}
                  className="w-full"
                  size="lg"
                  data-testid="button-start-lifecycle"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Start Booking Journey
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {currentStep === "geocoding" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 animate-pulse" />
                  Geocoding Addresses...
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                      <span className="font-semibold">Pickup: {pickup?.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">
                      → ({pickup?.lat.toFixed(4)}°N, {pickup?.lng.toFixed(4)}°W)
                    </p>
                  </div>
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                      <span className="font-semibold">Dropoff: {dropoff?.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">
                      → ({dropoff?.lat.toFixed(4)}°N, {dropoff?.lng.toFixed(4)}°W)
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Using Calgary geocoding database...</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {currentStep === "pricing" && priceBreakdown && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 animate-pulse" />
                  Calculating Dynamic Pricing...
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-sm text-muted-foreground">Distance Calculated</p>
                  <p className="text-3xl font-bold text-primary">{distance.toFixed(2)} km</p>
                </div>
                <div className="space-y-3">
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex justify-between p-3 bg-muted rounded-lg"
                  >
                    <span>Base Fee</span>
                    <span className="font-bold">${priceBreakdown.baseFee.toFixed(2)}</span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex justify-between p-3 bg-muted rounded-lg"
                  >
                    <span>Distance Fee ({distance.toFixed(2)} km × $1.50)</span>
                    <span className="font-bold">${priceBreakdown.distanceFee.toFixed(2)}</span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                    className="flex justify-between p-3 bg-muted rounded-lg"
                  >
                    <span>Load Fee ({loadSize})</span>
                    <span className="font-bold">${priceBreakdown.loadFee.toFixed(2)}</span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.8 }}
                    className="flex justify-between p-4 bg-primary/10 border-2 border-primary rounded-lg"
                  >
                    <span className="font-bold text-lg">Total Price</span>
                    <span className="font-bold text-2xl text-primary">${priceBreakdown.total.toFixed(2)}</span>
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {(currentStep === "matching" || currentStep === "notifying" || currentStep === "waiting") && matchedMovers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {currentStep === "matching" && <><Navigation className="w-5 h-5 animate-pulse" /> Finding Nearest Movers...</>}
                  {currentStep === "notifying" && <><Bell className="w-5 h-5 animate-pulse" /> Sending Job Notifications...</>}
                  {currentStep === "waiting" && <><Clock className="w-5 h-5" /> Waiting for Mover Response</>}
                </CardTitle>
                {currentStep === "waiting" && (
                  <CardDescription>
                    Time remaining: {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')} minutes
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {matchedMovers.map((mover, index) => (
                  <motion.div
                    key={mover.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.15 }}
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 ${
                      mover.notified 
                        ? 'bg-primary/5 border-primary/30' 
                        : 'bg-muted/50 border-border'
                    }`}
                  >
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold">
                      #{index + 1}
                    </div>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg"
                         style={{ backgroundColor: mover.color, color: 'white' }}>
                      {mover.avatar}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{mover.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {mover.distanceToPickup.toFixed(2)} km away • ${mover.earnings.toFixed(2)}
                      </p>
                    </div>
                    {mover.notified && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <Badge className="bg-green-500">
                          <Bell className="w-3 h-3 mr-1" />
                          Notified
                        </Badge>
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {(currentStep === "accepted" || currentStep === "in_progress" || currentStep === "completed") && selectedMover && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid md:grid-cols-2 gap-6"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {currentStep === "accepted" && <><CheckCircle className="w-5 h-5 text-green-500" /> Booking Accepted!</>}
                  {currentStep === "in_progress" && <><Truck className="w-5 h-5 animate-pulse" /> Move in Progress</>}
                  {currentStep === "completed" && <><Package className="w-5 h-5 text-green-500" /> Move Completed!</>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl"
                       style={{ backgroundColor: selectedMover.color, color: 'white' }}>
                    {selectedMover.avatar}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-lg">{selectedMover.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedMover.distanceToPickup.toFixed(2)} km away
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star key={star} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      ))}
                      <span className="text-sm text-muted-foreground ml-1">(4.9)</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pickup</span>
                    <span className="font-medium">{pickup?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Dropoff</span>
                    <span className="font-medium">{dropoff?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Distance</span>
                    <span className="font-medium">{distance.toFixed(2)} km</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t">
                    <span>Total</span>
                    <span className="text-primary">${selectedMover.earnings.toFixed(2)}</span>
                  </div>
                </div>

                {currentStep === "in_progress" && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Move Progress</span>
                      <span>65%</span>
                    </div>
                    <Progress value={65} className="h-2" />
                    <p className="text-sm text-muted-foreground">Estimated arrival in 15 minutes</p>
                  </div>
                )}

                {currentStep === "completed" && (
                  <Button 
                    onClick={() => setCurrentStep("reviewed")} 
                    className="w-full"
                    data-testid="button-leave-review"
                  >
                    <Star className="w-4 h-4 mr-2" />
                    Leave a Review
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Live Updates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex gap-3 p-3 bg-muted rounded-lg"
                >
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Booking Created</p>
                    <p className="text-xs text-muted-foreground">System geocoded addresses and calculated pricing</p>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex gap-3 p-3 bg-muted rounded-lg"
                >
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Top 4 Movers Notified</p>
                    <p className="text-xs text-muted-foreground">Job offers sent with 10-minute timeout</p>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="flex gap-3 p-3 bg-muted rounded-lg"
                >
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">{selectedMover.name} Accepted</p>
                    <p className="text-xs text-muted-foreground">Closest mover accepted in 2 minutes</p>
                  </div>
                </motion.div>
                {currentStep === "in_progress" && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                    className="flex gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg"
                  >
                    <Truck className="w-5 h-5 text-primary mt-0.5 animate-pulse" />
                    <div>
                      <p className="font-semibold text-sm">On the Way</p>
                      <p className="text-xs text-muted-foreground">Mover is en route to pickup location</p>
                    </div>
                  </motion.div>
                )}
                {currentStep === "completed" && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                    className="flex gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg"
                  >
                    <Package className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm">Delivery Complete</p>
                      <p className="text-xs text-muted-foreground">All items delivered successfully</p>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {currentStep === "reviewed" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500" />
                  Review Complete!
                </CardTitle>
                <CardDescription>Full lifecycle demonstration finished</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center p-8 bg-gradient-to-br from-primary/10 to-green-500/10 rounded-lg border-2 border-primary/20">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500 text-white flex items-center justify-center">
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Journey Complete!</h3>
                  <p className="text-muted-foreground mb-4">
                    You've witnessed the complete LervIT booking lifecycle
                  </p>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star key={star} className="w-8 h-8 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      What You Saw
                    </h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>✓ Customer created booking</li>
                      <li>✓ System geocoded addresses</li>
                      <li>✓ Dynamic pricing calculated</li>
                      <li>✓ Top 4 movers found & notified</li>
                      <li>✓ Nearest mover accepted</li>
                      <li>✓ Move completed successfully</li>
                      <li>✓ Customer left 5-star review</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Key Metrics
                    </h4>
                    <ul className="text-sm space-y-1">
                      <li><strong>Response Time:</strong> 2 minutes</li>
                      <li><strong>Match Accuracy:</strong> Nearest mover</li>
                      <li><strong>Distance:</strong> {distance.toFixed(2)} km</li>
                      <li><strong>Total Earned:</strong> ${selectedMover?.earnings.toFixed(2)}</li>
                      <li><strong>Movers Notified:</strong> 4</li>
                      <li><strong>Customer Rating:</strong> ⭐⭐⭐⭐⭐</li>
                    </ul>
                  </div>
                </div>

                <Button onClick={reset} className="w-full" size="lg" data-testid="button-restart-lifecycle">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Start New Demo
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
