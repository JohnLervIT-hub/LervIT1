import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bell, MapPin, Navigation, DollarSign, Clock, CheckCircle, 
  Truck, Package, Star, User, Phone, MessageCircle, 
  ArrowRight, RefreshCw, Zap, TrendingUp, AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

type MoverStep = 
  | "idle" 
  | "notification" 
  | "reviewing" 
  | "accepted" 
  | "heading_to_pickup" 
  | "arrived_pickup" 
  | "loading" 
  | "in_transit" 
  | "arrived_dropoff" 
  | "unloading" 
  | "completed" 
  | "paid";

const STEP_INFO = {
  idle: { title: "Waiting for Jobs", icon: Clock, color: "bg-gray-500", desc: "Mover is available and waiting" },
  notification: { title: "New Job Notification!", icon: Bell, color: "bg-blue-500", desc: "Job offer received" },
  reviewing: { title: "Reviewing Job Details", icon: AlertCircle, color: "bg-yellow-500", desc: "Deciding whether to accept" },
  accepted: { title: "Job Accepted", icon: CheckCircle, color: "bg-green-500", desc: "Booking confirmed" },
  heading_to_pickup: { title: "Heading to Pickup", icon: Navigation, color: "bg-blue-600", desc: "Driving to customer location" },
  arrived_pickup: { title: "Arrived at Pickup", icon: MapPin, color: "bg-purple-500", desc: "Met with customer" },
  loading: { title: "Loading Items", icon: Package, color: "bg-orange-500", desc: "Loading items into vehicle" },
  in_transit: { title: "In Transit", icon: Truck, color: "bg-blue-700", desc: "Driving to dropoff location" },
  arrived_dropoff: { title: "Arrived at Dropoff", icon: MapPin, color: "bg-purple-600", desc: "Ready to unload" },
  unloading: { title: "Unloading Items", icon: Package, color: "bg-orange-600", desc: "Delivering items" },
  completed: { title: "Job Completed", icon: CheckCircle, color: "bg-green-600", desc: "All items delivered" },
  paid: { title: "Payment Received", icon: DollarSign, color: "bg-emerald-500", desc: "Earnings added to account" },
};

const JOB_DATA = {
  id: "BK-12345",
  customer: {
    name: "Sarah Johnson",
    avatar: "SJ",
    phone: "403-555-7890",
    rating: 4.8,
  },
  pickup: {
    address: "123 Kensington Road NW",
    neighborhood: "Kensington",
    lat: 51.0536,
    lng: -114.0869,
  },
  dropoff: {
    address: "456 Mission Street SW",
    neighborhood: "Mission",
    lat: 51.0342,
    lng: -114.0836,
  },
  distance: 2.17,
  loadSize: "Medium",
  pricing: {
    baseFee: 25.00,
    distanceFee: 3.26,
    loadFee: 25.00,
    moverTravel: 0.00,
    total: 53.26,
  },
  distanceFromMover: 3.4,
  expiresIn: 600,
};

export default function MoverLifecycleDemo() {
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

  const [currentStep, setCurrentStep] = useState<MoverStep>("idle");
  const [timer, setTimer] = useState(600);
  const [showNotification, setShowNotification] = useState(false);
  const [earnings, setEarnings] = useState(285.50);
  const [completedJobs, setCompletedJobs] = useState(47);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (currentStep === "notification" || currentStep === "reviewing") {
      interval = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 100);
    }

    return () => clearInterval(interval);
  }, [currentStep]);

  const startDemo = async () => {
    setCurrentStep("notification");
    setShowNotification(true);
    setTimer(600);
    await sleep(3000);

    setCurrentStep("reviewing");
    await sleep(3000);

    setCurrentStep("accepted");
    setShowNotification(false);
    await sleep(2000);

    setCurrentStep("heading_to_pickup");
    await sleep(3000);

    setCurrentStep("arrived_pickup");
    await sleep(2000);

    setCurrentStep("loading");
    await sleep(3000);

    setCurrentStep("in_transit");
    await sleep(3000);

    setCurrentStep("arrived_dropoff");
    await sleep(2000);

    setCurrentStep("unloading");
    await sleep(3000);

    setCurrentStep("completed");
    await sleep(2000);

    setCurrentStep("paid");
    setEarnings(prev => prev + JOB_DATA.pricing.total);
    setCompletedJobs(prev => prev + 1);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const reset = () => {
    setCurrentStep("idle");
    setTimer(600);
    setShowNotification(false);
  };

  const stepIndex = Object.keys(STEP_INFO).indexOf(currentStep);
  const progress = ((stepIndex + 1) / Object.keys(STEP_INFO).length) * 100;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-3">
            <Truck className="w-10 h-10 text-primary" />
            Mover's Journey
          </h1>
          <p className="text-muted-foreground text-lg">
            Experience the complete job lifecycle from a mover's perspective
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Today's Earnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-500">
                ${earnings.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {completedJobs} jobs completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Current Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge className={STEP_INFO[currentStep].color}>
                {STEP_INFO[currentStep].title}
              </Badge>
              <p className="text-xs text-muted-foreground mt-2">
                {STEP_INFO[currentStep].desc}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Step {stepIndex + 1} of {Object.keys(STEP_INFO).length}</span>
                  <span>{progress.toFixed(0)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </div>

        <AnimatePresence mode="wait">
          {currentStep === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Ready for Jobs
                  </CardTitle>
                  <CardDescription>Alex Turner - Professional Mover</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-4 p-6 bg-muted rounded-lg">
                    <div className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-2xl">
                      AT
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold">Alex Turner</h3>
                      <p className="text-muted-foreground">Professional Mover</p>
                      <div className="flex items-center gap-1 mt-2">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star key={star} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        ))}
                        <span className="text-sm text-muted-foreground ml-1">(4.9 • 47 jobs)</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bell className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Waiting for Job Notifications</h3>
                    <p className="text-muted-foreground mb-6">
                      You're online and available. Jobs will appear automatically when customers book nearby.
                    </p>
                    <Button 
                      onClick={startDemo} 
                      size="lg" 
                      className="gap-2"
                      data-testid="button-start-mover-demo"
                    >
                      <Zap className="w-4 h-4" />
                      Simulate Incoming Job
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {(currentStep === "notification" || currentStep === "reviewing") && (
            <motion.div
              key="notification"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <Alert className="border-primary bg-primary/5">
                <Bell className="h-4 w-4 animate-pulse" />
                <AlertDescription className="flex items-center justify-between">
                  <span className="font-semibold">New job notification! Review and accept within 10 minutes.</span>
                  <Badge variant="outline" className="ml-2">
                    {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                  </Badge>
                </AlertDescription>
              </Alert>

              <Card className="border-2 border-primary">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-primary animate-pulse" />
                      Job Offer #{JOB_DATA.id}
                    </span>
                    <Badge className="bg-green-500 text-lg px-4 py-2">
                      ${JOB_DATA.pricing.total.toFixed(2)}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {JOB_DATA.distanceFromMover.toFixed(1)} km from your location
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground mb-2">Customer</h4>
                        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                          <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                            {JOB_DATA.customer.avatar}
                          </div>
                          <div>
                            <p className="font-semibold">{JOB_DATA.customer.name}</p>
                            <div className="flex items-center gap-1 text-xs">
                              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                              <span>{JOB_DATA.customer.rating}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground mb-2">Pickup Location</h4>
                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-green-500 mt-0.5" />
                            <div>
                              <p className="font-semibold text-sm">{JOB_DATA.pickup.neighborhood}</p>
                              <p className="text-xs text-muted-foreground">{JOB_DATA.pickup.address}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground mb-2">Dropoff Location</h4>
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <div className="flex items-start gap-2">
                            <Navigation className="w-4 h-4 text-red-500 mt-0.5" />
                            <div>
                              <p className="font-semibold text-sm">{JOB_DATA.dropoff.neighborhood}</p>
                              <p className="text-xs text-muted-foreground">{JOB_DATA.dropoff.address}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground mb-2">Job Details</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm p-2 bg-muted rounded">
                            <span className="text-muted-foreground">Load Size</span>
                            <span className="font-medium">{JOB_DATA.loadSize}</span>
                          </div>
                          <div className="flex justify-between text-sm p-2 bg-muted rounded">
                            <span className="text-muted-foreground">Distance</span>
                            <span className="font-medium">{JOB_DATA.distance.toFixed(2)} km</span>
                          </div>
                          <div className="flex justify-between text-sm p-2 bg-muted rounded">
                            <span className="text-muted-foreground">Travel to Pickup</span>
                            <span className="font-medium">{JOB_DATA.distanceFromMover.toFixed(1)} km</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground mb-2">Your Earnings</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Base Fee</span>
                            <span>${JOB_DATA.pricing.baseFee.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Distance Fee</span>
                            <span>${JOB_DATA.pricing.distanceFee.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Load Fee</span>
                            <span>${JOB_DATA.pricing.loadFee.toFixed(2)}</span>
                          </div>
                          {JOB_DATA.pricing.moverTravel > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Travel Bonus</span>
                              <span className="text-green-500">+${JOB_DATA.pricing.moverTravel.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-lg pt-2 border-t">
                            <span>Total</span>
                            <span className="text-green-500">${JOB_DATA.pricing.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {currentStep === "reviewing" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3"
                    >
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={reset}
                        data-testid="button-decline-job"
                      >
                        Decline
                      </Button>
                      <Button 
                        className="flex-1 bg-green-500 hover:bg-green-600"
                        onClick={() => setCurrentStep("accepted")}
                        data-testid="button-accept-job"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Accept Job
                      </Button>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {(currentStep === "accepted" || currentStep === "heading_to_pickup" || currentStep === "arrived_pickup") && (
            <motion.div
              key="accepted"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="border-2 border-green-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    {STEP_INFO[currentStep].title}
                  </CardTitle>
                  <CardDescription>{STEP_INFO[currentStep].desc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert className="bg-green-500/10 border-green-500/20">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertDescription>
                      Job confirmed! Customer has been notified you're on the way.
                    </AlertDescription>
                  </Alert>

                  <div className="grid md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Customer Contact</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                            {JOB_DATA.customer.avatar}
                          </div>
                          <div>
                            <p className="font-semibold">{JOB_DATA.customer.name}</p>
                            <p className="text-sm text-muted-foreground">{JOB_DATA.customer.phone}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1">
                            <Phone className="w-3 h-3 mr-2" />
                            Call
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1">
                            <MessageCircle className="w-3 h-3 mr-2" />
                            Message
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Navigation</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="p-3 bg-primary/10 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">Pickup Location</span>
                              <Badge variant="secondary">{JOB_DATA.distanceFromMover.toFixed(1)} km</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{JOB_DATA.pickup.address}</p>
                          </div>
                          <Button className="w-full" size="sm">
                            <Navigation className="w-3 h-3 mr-2" />
                            Start Navigation
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {currentStep === "heading_to_pickup" && (
                    <div className="text-center py-4">
                      <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Navigation className="w-8 h-8 text-blue-500 animate-pulse" />
                      </div>
                      <p className="font-semibold">En route to pickup location</p>
                      <p className="text-sm text-muted-foreground">ETA: 8 minutes</p>
                    </div>
                  )}

                  {currentStep === "arrived_pickup" && (
                    <Alert className="bg-purple-500/10 border-purple-500/20">
                      <MapPin className="h-4 w-4 text-purple-500" />
                      <AlertDescription>
                        You've arrived! Meet the customer and begin loading.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {(currentStep === "loading" || currentStep === "in_transit" || currentStep === "arrived_dropoff" || currentStep === "unloading") && (
            <motion.div
              key="in_progress"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {(() => {
                        const Icon = STEP_INFO[currentStep].icon;
                        return <Icon className="w-5 h-5 animate-pulse" />;
                      })()}
                      {STEP_INFO[currentStep].title}
                    </span>
                    <Badge className={STEP_INFO[currentStep].color}>
                      In Progress
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        currentStep === "loading" || currentStep === "arrived_dropoff" || currentStep === "unloading" 
                          ? 'bg-green-500' 
                          : 'bg-muted'
                      }`}>
                        <MapPin className={`w-6 h-6 ${
                          currentStep === "loading" || currentStep === "arrived_dropoff" || currentStep === "unloading"
                            ? 'text-white' 
                            : 'text-muted-foreground'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">Pickup - {JOB_DATA.pickup.neighborhood}</p>
                        <p className="text-sm text-muted-foreground">{JOB_DATA.pickup.address}</p>
                      </div>
                      {(currentStep === "loading" || currentStep === "in_transit" || currentStep === "arrived_dropoff" || currentStep === "unloading") && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                    </div>

                    {currentStep === "in_transit" && (
                      <div className="flex items-center gap-4 pl-6">
                        <div className="w-1 h-12 bg-primary" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Truck className="w-5 h-5 text-primary animate-pulse" />
                            <span className="font-semibold">In Transit</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {JOB_DATA.distance.toFixed(2)} km • ETA 12 minutes
                          </p>
                          <Progress value={65} className="h-2 mt-2" />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        currentStep === "arrived_dropoff" || currentStep === "unloading"
                          ? 'bg-red-500' 
                          : 'bg-muted'
                      }`}>
                        <Navigation className={`w-6 h-6 ${
                          currentStep === "arrived_dropoff" || currentStep === "unloading"
                            ? 'text-white' 
                            : 'text-muted-foreground'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">Dropoff - {JOB_DATA.dropoff.neighborhood}</p>
                        <p className="text-sm text-muted-foreground">{JOB_DATA.dropoff.address}</p>
                      </div>
                      {currentStep === "unloading" && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                    </div>
                  </div>

                  {currentStep === "loading" && (
                    <Alert className="bg-orange-500/10 border-orange-500/20">
                      <Package className="h-4 w-4 text-orange-500 animate-pulse" />
                      <AlertDescription>
                        Loading items into vehicle. Take care with fragile items.
                      </AlertDescription>
                    </Alert>
                  )}

                  {currentStep === "unloading" && (
                    <Alert className="bg-orange-600/10 border-orange-600/20">
                      <Package className="h-4 w-4 text-orange-600 animate-pulse" />
                      <AlertDescription>
                        Unloading items at destination. Almost done!
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {(currentStep === "completed" || currentStep === "paid") && (
            <motion.div
              key="completed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card className="border-2 border-green-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    Job Complete!
                  </CardTitle>
                  <CardDescription>
                    Excellent work! Payment has been processed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-center p-8 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-lg border-2 border-green-500/20">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500 text-white flex items-center justify-center">
                      <DollarSign className="w-10 h-10" />
                    </div>
                    <h3 className="text-3xl font-bold mb-2 text-green-500">
                      +${JOB_DATA.pricing.total.toFixed(2)}
                    </h3>
                    <p className="text-muted-foreground mb-4">Payment received</p>
                    <div className="flex justify-center gap-2 mb-4">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star key={star} className="w-6 h-6 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Customer left you a 5-star review!
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Job Summary</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Job ID</span>
                          <span className="font-mono">{JOB_DATA.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Distance</span>
                          <span>{JOB_DATA.distance.toFixed(2)} km</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Duration</span>
                          <span>42 minutes</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Load Size</span>
                          <span>{JOB_DATA.loadSize}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Your Stats Today</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Earnings</span>
                          <span className="font-bold text-green-500">${earnings.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Jobs Completed</span>
                          <span className="font-bold">{completedJobs}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Avg Rating</span>
                          <span className="font-bold">4.9 ⭐</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Acceptance Rate</span>
                          <span className="font-bold">92%</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex gap-3">
                    <Button onClick={reset} className="flex-1" data-testid="button-restart-mover-demo">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Start New Demo
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setCurrentStep("idle")}>
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Back to Dashboard
                    </Button>
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
