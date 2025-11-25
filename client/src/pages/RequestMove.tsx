import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import LoadSizeSelector from "@/components/LoadSizeSelector";
import PriceCalculator from "@/components/PriceCalculator";
import ImageUpload from "@/components/ImageUpload";
import { CustomAddressInput } from "@/components/CustomAddressInput";
import { PricingSummary } from "@/components/PricingSummary";
import { MapPin, Calendar, FileText, CheckCircle, TrendingUp, Package, DollarSign, Weight, Users, Clock, Sparkles, Camera, Loader2, Info } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { aiPredictPrice, generatePriceExplanation, type AIEstimateResult, type PhotoAnalysisResult } from "@shared/ai";
import { calculatePrice, type PriceBreakdown, type PickupDifficultyType, type DropoffDifficultyType } from "@shared/pricing";

// Helper functions for load size validation
const loadSizeOrder = ['boxes', 'medium', 'large', 'apartment'];

function isLoadSizeSmaller(selected: string, aiRecommended: string): boolean {
  const selectedIndex = loadSizeOrder.indexOf(selected);
  const recommendedIndex = loadSizeOrder.indexOf(aiRecommended);
  return selectedIndex < recommendedIndex && selectedIndex !== -1 && recommendedIndex !== -1;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Helper function to check if items require 2 movers
function requiresTwoMovers(loadSize: string, heavyItem: boolean): boolean {
  return loadSize === 'large' || loadSize === 'apartment' || heavyItem;
}

export default function RequestMove() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [pickupDifficulty, setPickupDifficulty] = useState("ground");
  const [dropoffDifficulty, setDropoffDifficulty] = useState("ground");
  const [loadSize, setLoadSize] = useState("medium");
  const [heavyItem, setHeavyItem] = useState(false);
  const [numberOfMovers, setNumberOfMovers] = useState(1);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [createdBooking, setCreatedBooking] = useState<any>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  
  // AI Feature 1: Auto-Quote Predictor state
  const [aiEstimate, setAiEstimate] = useState<AIEstimateResult | null>(null);
  const [estimateDistance, setEstimateDistance] = useState(0);
  
  // AI Feature 2: Price Explainer state
  const [showPriceExplanation, setShowPriceExplanation] = useState(false);
  const [priceExplanation, setPriceExplanation] = useState("");
  
  // AI Feature 3: Photo Analysis state
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult | null>(null);
  const [analyzedPhotoUrl, setAnalyzedPhotoUrl] = useState<string | null>(null);
  
  // Live Pricing state
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  // Single mover warning state
  const [showSingleMoverWarning, setShowSingleMoverWarning] = useState(false);
  const [hasSingleMoverAcknowledgment, setHasSingleMoverAcknowledgment] = useState(false);

  // Pre-fill form from URL query parameters (from hero form) or sessionStorage (after login)
  useEffect(() => {
    // First, check for pending booking data from sessionStorage (user returned from login)
    const pendingBookingData = sessionStorage.getItem('pendingBooking');
    if (pendingBookingData) {
      try {
        const data = JSON.parse(pendingBookingData);
        setPickupAddress(data.pickupAddress || "");
        setDropoffAddress(data.dropoffAddress || "");
        setPickupDifficulty(data.pickupDifficulty || "ground");
        setDropoffDifficulty(data.dropoffDifficulty || "ground");
        setLoadSize(data.loadSize || "medium");
        setHeavyItem(data.heavyItem || false);
        setNumberOfMovers(data.numberOfMovers || 1);
        setDescription(data.description || "");
        setImages(data.images || []);
        setDate(data.date || "");
        setStep(3); // Jump to final step since they already filled everything
        
        sessionStorage.removeItem('pendingBooking');
        
        toast({
          title: "Welcome Back!",
          description: "Your booking details have been restored. You can now complete your request.",
        });
        return;
      } catch (error) {
        console.error("Failed to restore pending booking:", error);
        sessionStorage.removeItem('pendingBooking');
      }
    }

    // If no pending booking, check URL parameters (from hero form)
    const params = new URLSearchParams(window.location.search);
    const pickup = params.get('pickup');
    const dropoff = params.get('dropoff');
    const preferredDate = params.get('date');

    if (pickup) {
      setPickupAddress(pickup);
    }
    if (dropoff) {
      setDropoffAddress(dropoff);
    }
    if (preferredDate) {
      setDate(preferredDate);
    }

    // Show a toast if data was pre-filled from hero
    if (pickup && dropoff) {
      toast({
        title: "Quote Form Pre-filled",
        description: "Your addresses have been loaded. Complete the details below to request your move.",
      });
    }
  }, [toast]);

  const createBookingMutation = useMutation({
    mutationFn: async (bookingData: any) => {
      const res = await apiRequest("POST", "/api/bookings", bookingData);
      return await res.json();
    },
    onSuccess: (data) => {
      setCreatedBooking(data);
      setShowSuccessDialog(true);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create booking. Please try again.",
        variant: "destructive",
      });
    },
  });

  // AI Feature 1: Auto-Quote Predictor - Update estimate when form fields change
  useEffect(() => {
    if (pickupAddress && dropoffAddress && estimateDistance > 0) {
      const estimate = aiPredictPrice({
        pickupAddress,
        dropoffAddress,
        distance: estimateDistance,
        loadSize,
        pickupDifficulty,
        dropoffDifficulty,
        heavyItem,
        numberOfMovers
      });
      setAiEstimate(estimate);
    } else {
      setAiEstimate(null);
    }
  }, [pickupAddress, dropoffAddress, estimateDistance, loadSize, pickupDifficulty, dropoffDifficulty, heavyItem, numberOfMovers]);

  // Calculate real distance estimate when addresses change using geocoding
  useEffect(() => {
    const calculateDistance = async () => {
      if (pickupAddress && dropoffAddress) {
        setIsCalculatingPrice(true);
        setPricingError(null);
        try {
          // Use the backend geocoding API to calculate real distance
          const response = await fetch('/api/geocode/distance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pickupAddress,
              dropoffAddress
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            setEstimateDistance(data.distance);
          } else {
            // Fallback to estimated distance if geocoding fails
            setEstimateDistance(10);
            setPricingError("Using estimated distance - geocoding unavailable");
          }
        } catch (error) {
          // Fallback to estimated distance on error
          setEstimateDistance(10);
          setPricingError("Using estimated distance - geocoding unavailable");
        } finally {
          setIsCalculatingPrice(false);
        }
      } else {
        setPriceBreakdown(null);
        setEstimateDistance(0);
      }
    };
    
    calculateDistance();
  }, [pickupAddress, dropoffAddress]);
  
  // Calculate live pricing whenever form fields change
  useEffect(() => {
    if (estimateDistance > 0 && pickupAddress && dropoffAddress) {
      try {
        const breakdown = calculatePrice(
          estimateDistance,
          loadSize as 'boxes' | 'medium' | 'large' | 'apartment',
          pickupDifficulty as PickupDifficultyType,
          dropoffDifficulty as DropoffDifficultyType,
          heavyItem,
          numberOfMovers as 1 | 2,
          undefined // moverToPickupDistance - will be calculated after mover assignment
        );
        setPriceBreakdown(breakdown);
        setPricingError(null);
      } catch (error) {
        console.error('Pricing calculation error:', error);
        setPricingError("Error calculating price");
      }
    } else {
      setPriceBreakdown(null);
    }
  }, [estimateDistance, loadSize, pickupDifficulty, dropoffDifficulty, heavyItem, numberOfMovers, pickupAddress, dropoffAddress]);

  // Show warning when user selects 1 mover for items that require 2 movers
  useEffect(() => {
    const needsTwoMovers = requiresTwoMovers(loadSize, heavyItem);
    
    // Reset acknowledgment if customer switches to 2 movers or conditions change
    if (numberOfMovers === 2 || !needsTwoMovers) {
      setHasSingleMoverAcknowledgment(false);
    }
    
    // Show warning when selecting 1 mover for heavy loads without prior acknowledgment
    if (numberOfMovers === 1 && needsTwoMovers && !hasSingleMoverAcknowledgment) {
      setShowSingleMoverWarning(true);
    }
  }, [numberOfMovers, loadSize, heavyItem, hasSingleMoverAcknowledgment]);

  // AI Feature 2: Generate price explanation when booking is created
  useEffect(() => {
    if (createdBooking) {
      const explanation = generatePriceExplanation({
        baseFee: parseFloat(createdBooking.baseFee),
        distanceFee: parseFloat(createdBooking.distanceFee),
        loadFee: parseFloat(createdBooking.loadFee || "0"),
        pickupDifficultyFee: parseFloat(createdBooking.pickupDifficultyFee || "0"),
        dropoffDifficultyFee: parseFloat(createdBooking.dropoffDifficultyFee || "0"),
        heavyItemFee: parseFloat(createdBooking.heavyItemFee || "0"),
        moverTravelFee: parseFloat(createdBooking.moverTravelFee || "0"),
        subtotal: parseFloat(createdBooking.subtotal),
        numberOfMovers: createdBooking.numberOfMovers,
        finalTotal: parseFloat(createdBooking.price),
        distance: parseFloat(createdBooking.distance),
        loadSize: createdBooking.loadSize,
        pickupDifficulty: createdBooking.pickupDifficulty,
        dropoffDifficulty: createdBooking.dropoffDifficulty,
        heavyItem: createdBooking.heavyItem
      });
      setPriceExplanation(explanation);
    }
  }, [createdBooking]);

  // AI Feature 3: Photo Analysis Handler
  const handlePhotoAnalysis = async (file: File) => {
    setIsAnalyzingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);

      const response = await fetch('/api/ai/analyze-photo', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const result: PhotoAnalysisResult & { imageUrl: string } = await response.json();
      setPhotoAnalysis(result);
      setAnalyzedPhotoUrl(result.imageUrl);

      // Auto-fill form fields based on AI analysis
      setLoadSize(result.loadSize);
      setHeavyItem(result.heavyItem);
      setNumberOfMovers(result.recommendedMovers);

      toast({
        title: "AI Analysis Complete!",
        description: `Detected: ${result.itemType} - ${result.loadSize} load, ${result.heavyItem ? 'heavy item' : 'standard weight'}`,
      });
    } catch (error) {
      toast({
        title: "Analysis Failed",
        description: "Could not analyze photo. Please fill in details manually.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };

  const handleNext = () => {
    // Step 1: Validate addresses (MANDATORY)
    if (step === 1) {
      if (!pickupAddress || pickupAddress.trim() === "") {
        toast({
          title: "Pickup address required",
          description: "Please enter a valid pickup address to continue.",
          variant: "destructive",
        });
        return;
      }
      if (!dropoffAddress || dropoffAddress.trim() === "") {
        toast({
          title: "Dropoff address required",
          description: "Please enter a valid dropoff address to continue.",
          variant: "destructive",
        });
        return;
      }
      // Both addresses must be different
      if (pickupAddress.trim().toLowerCase() === dropoffAddress.trim().toLowerCase()) {
        toast({
          title: "Invalid addresses",
          description: "Pickup and dropoff addresses must be different.",
          variant: "destructive",
        });
        return;
      }
    }

    if (step < 3) {
      setStep(step + 1);
    } else {
      // Validate date before submission
      if (!date) {
        toast({
          title: "Date required",
          description: "Please select a preferred date and time.",
          variant: "destructive",
        });
        return;
      }

      // Check authentication before allowing booking submission
      if (!user) {
        toast({
          title: "Login Required",
          description: "Please log in or sign up to complete your booking request.",
          variant: "destructive",
        });
        // Store current form data in sessionStorage so user can resume after login
        sessionStorage.setItem('pendingBooking', JSON.stringify({
          pickupAddress,
          dropoffAddress,
          pickupDifficulty,
          dropoffDifficulty,
          loadSize,
          heavyItem,
          numberOfMovers,
          description,
          images,
          date
        }));
        // Redirect to login with return path
        setLocation('/login?redirect=/request-move');
        return;
      }

      // Check if acknowledgment is required for current booking state
      const needsAcknowledgment = numberOfMovers === 1 && requiresTwoMovers(loadSize, heavyItem);
      
      // Block submission if acknowledgment is required but not provided
      if (needsAcknowledgment && !hasSingleMoverAcknowledgment) {
        toast({
          variant: "destructive",
          title: "Acknowledgment Required",
          description: "Please acknowledge the single mover policy for heavy items before proceeding."
        });
        // Warning dialog should already be visible via useEffect
        return;
      }
      
      // Create the booking - backend will calculate distance and price
      const bookingData = {
        customerId: user.id,
        pickupAddress,
        dropoffAddress,
        pickupDifficulty,
        dropoffDifficulty,
        loadSize,
        heavyItem,
        numberOfMovers,
        acknowledgedSingleMoverPolicy: needsAcknowledgment && hasSingleMoverAcknowledgment,
        description: description || null,
        images: images.length > 0 ? images : null,
        preferredDate: new Date(date).toISOString(),
      };
      createBookingMutation.mutate(bookingData);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <>
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-2xl" data-testid="dialog-booking-success">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl">Booking Created Successfully!</DialogTitle>
                <DialogDescription>
                  We've calculated your move details and notified nearby movers
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {createdBooking && (
            <div className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Distance</span>
                  </div>
                  <span className="font-semibold" data-testid="text-calculated-distance">
                    {parseFloat(createdBooking.distance).toFixed(2)} km
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Load Size</span>
                  </div>
                  <span className="font-semibold capitalize">{createdBooking.loadSize}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Movers Notified</span>
                  </div>
                  <span className="font-semibold">{createdBooking.notifiedMovers} nearby movers</span>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Price Breakdown
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base Fee</span>
                    <span className="font-medium" data-testid="text-base-fee">
                      ${parseFloat(createdBooking.baseFee).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Distance Fee ({parseFloat(createdBooking.distance).toFixed(2)} km × $1.00/km)
                    </span>
                    <span className="font-medium" data-testid="text-distance-fee">
                      ${parseFloat(createdBooking.distanceFee).toFixed(2)}
                    </span>
                  </div>
                  {parseFloat(createdBooking.loadFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Load Size Fee ({createdBooking.loadSize})</span>
                      <span className="font-medium" data-testid="text-load-fee">
                        ${parseFloat(createdBooking.loadFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(createdBooking.pickupDifficultyFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pickup Difficulty Fee</span>
                      <span className="font-medium" data-testid="text-pickup-difficulty-fee">
                        ${parseFloat(createdBooking.pickupDifficultyFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(createdBooking.dropoffDifficultyFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dropoff Difficulty Fee</span>
                      <span className="font-medium" data-testid="text-dropoff-difficulty-fee">
                        ${parseFloat(createdBooking.dropoffDifficultyFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(createdBooking.heavyItemFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Heavy Item Fee</span>
                      <span className="font-medium" data-testid="text-heavy-item-fee">
                        ${parseFloat(createdBooking.heavyItemFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(createdBooking.moverTravelFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mover Travel Fee</span>
                      <span className="font-medium" data-testid="text-mover-travel-fee">
                        ${parseFloat(createdBooking.moverTravelFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {createdBooking.numberOfMovers === 2 && (
                    <div className="flex justify-between text-primary">
                      <span className="font-medium">2-Movers Fee (×1.30)</span>
                      <span className="font-medium">Applied</span>
                    </div>
                  )}
                  <div className="h-px bg-border my-2" />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total Price</span>
                    <span className="text-primary" data-testid="text-total-price">
                      ${parseFloat(createdBooking.price).toFixed(2)} CAD
                    </span>
                  </div>
                </div>
                
                {/* AI Feature 2: Price Explanation Button */}
                <Button
                  variant="outline"
                  onClick={() => setShowPriceExplanation(!showPriceExplanation)}
                  className="w-full mt-3"
                  data-testid="button-ai-explain-price"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {showPriceExplanation ? "Hide" : "AI Explain My Price"}
                </Button>
                
                {showPriceExplanation && priceExplanation && (
                  <div className="mt-3 p-4 bg-accent/10 border border-accent/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-accent-foreground" />
                      <h4 className="font-semibold text-sm">AI Price Explanation</h4>
                    </div>
                    <div className="text-sm whitespace-pre-line text-muted-foreground">
                      {priceExplanation}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                <p className="text-sm text-primary font-medium">
                  ⏱️ Movers have 10 minutes to accept. You'll be notified when one accepts!
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setShowSuccessDialog(false);
                    setLocation("/my-bookings");
                  }}
                  className="flex-1"
                  data-testid="button-view-bookings"
                >
                  View My Bookings
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="min-h-screen pt-24 pb-12 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Request a Move
          </h1>
          <p className="text-muted-foreground">
            Fill in the details to get matched with available movers
          </p>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((stepNum) => (
              <div key={stepNum} className="flex items-center flex-1">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${
                    step >= stepNum
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`step-indicator-${stepNum}`}
                >
                  {stepNum}
                </div>
                {stepNum < 3 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step > stepNum ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-sm">
            <span className={step >= 1 ? "font-semibold" : "text-muted-foreground"}>
              Locations
            </span>
            <span className={step >= 2 ? "font-semibold" : "text-muted-foreground"}>
              Load Details
            </span>
            <span className={step >= 3 ? "font-semibold" : "text-muted-foreground"}>
              Schedule
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold">
                  {step === 1 && "Step 1: Locations"}
                  {step === 2 && "Step 2: Load Details"}
                  {step === 3 && "Step 3: Schedule & Details"}
                </h2>
              </CardHeader>
              <CardContent className="space-y-6">
                {step === 1 && (
                  <>
                    <div>
                      <Label htmlFor="pickup" className="text-base font-semibold mb-2 block">
                        Pickup Address
                      </Label>
                      <CustomAddressInput
                        id="pickup"
                        placeholder="123 Main St SW, Calgary, AB"
                        value={pickupAddress}
                        onChange={(address) => setPickupAddress(address)}
                        data-testid="input-pickup-address"
                      />
                    </div>

                    <div>
                      <Label htmlFor="pickup-difficulty" className="text-base font-semibold mb-2 block">
                        Pickup Difficulty
                      </Label>
                      <Select value={pickupDifficulty} onValueChange={setPickupDifficulty}>
                        <SelectTrigger id="pickup-difficulty" className="h-12" data-testid="select-pickup-difficulty">
                          <SelectValue placeholder="Select pickup difficulty" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ground">Ground Floor - $0</SelectItem>
                          <SelectItem value="basement">Basement - +$10</SelectItem>
                          <SelectItem value="stairs">Stairs - +$5</SelectItem>
                          <SelectItem value="elevator">Elevator Available - +$8</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="dropoff" className="text-base font-semibold mb-2 block">
                        Dropoff Address
                      </Label>
                      <CustomAddressInput
                        id="dropoff"
                        placeholder="456 Oak Ave NW, Calgary, AB"
                        value={dropoffAddress}
                        onChange={(address) => setDropoffAddress(address)}
                        data-testid="input-dropoff-address"
                      />
                    </div>

                    <div>
                      <Label htmlFor="dropoff-difficulty" className="text-base font-semibold mb-2 block">
                        Dropoff Difficulty
                      </Label>
                      <Select value={dropoffDifficulty} onValueChange={setDropoffDifficulty}>
                        <SelectTrigger id="dropoff-difficulty" className="h-12" data-testid="select-dropoff-difficulty">
                          <SelectValue placeholder="Select dropoff difficulty" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ground">Ground Floor - $0</SelectItem>
                          <SelectItem value="basement">Basement - +$10</SelectItem>
                          <SelectItem value="stairs">Stairs - +$5</SelectItem>
                          <SelectItem value="elevator">Elevator Available - +$8</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* AI Feature 1: Auto-Quote Predictor */}
                    {aiEstimate && (
                      <div className="bg-gradient-to-r from-accent/10 to-primary/10 border border-accent/30 rounded-lg p-5 mt-6">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-accent-foreground" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">AI Estimated Cost</h3>
                            <p className="text-xs text-muted-foreground">Early prediction based on your inputs</p>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-2xl font-bold text-accent-foreground">
                              ${aiEstimate.minPrice.toFixed(2)} - ${aiEstimate.maxPrice.toFixed(2)}
                            </span>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Info className="w-3 h-3" />
                              {aiEstimate.confidence}% confidence
                            </div>
                          </div>
                          <Progress value={aiEstimate.confidence} className="h-1" />
                          <p className="text-xs text-muted-foreground">{aiEstimate.explanation}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {step === 2 && (
                  <>
                    {/* AI Feature 3: Photo Analysis */}
                    <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">AI Item Detection</h3>
                          <p className="text-sm text-muted-foreground">
                            Upload a photo and let AI auto-fill load details
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <input
                          ref={(el) => {
                            if (el) {
                              (window as any).__photoFileInput = el;
                            }
                          }}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoAnalysis(file);
                          }}
                          className="hidden"
                          disabled={isAnalyzingPhoto}
                          data-testid="input-photo-upload"
                        />
                        
                        <Button
                          type="button"
                          variant="default"
                          size="default"
                          className="w-full"
                          onClick={() => {
                            ((window as any).__photoFileInput as HTMLInputElement)?.click();
                          }}
                          disabled={isAnalyzingPhoto}
                          data-testid="button-choose-photo"
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          {analyzedPhotoUrl ? "Change Photo" : "Choose Photo"}
                        </Button>
                        
                        {isAnalyzingPhoto && (
                          <div className="flex items-center gap-2 text-sm text-primary">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>AI analyzing your item...</span>
                          </div>
                        )}
                        
                        {photoAnalysis && (
                          <Alert className="bg-primary/10 border-primary/30">
                            <Sparkles className="w-4 h-4" />
                            <AlertDescription>
                              <strong>AI detected:</strong> {photoAnalysis.itemType} •{" "}
                              {photoAnalysis.loadSize} load •{" "}
                              {photoAnalysis.heavyItem ? "Heavy" : "Standard"} •{" "}
                              {photoAnalysis.recommendedMovers} mover{photoAnalysis.recommendedMovers > 1 ? "s" : ""} recommended
                              <div className="text-xs mt-1 text-muted-foreground">
                                {photoAnalysis.explanation}
                              </div>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label className="text-base font-semibold mb-4 block">
                        Select Load Size
                      </Label>
                      <LoadSizeSelector
                        selectedSize={loadSize}
                        onSelectSize={setLoadSize}
                        aiRecommendedSize={photoAnalysis?.loadSize}
                      />
                      
                      {photoAnalysis && isLoadSizeSmaller(loadSize, photoAnalysis.loadSize) && (
                        <Alert className="mt-4 bg-yellow-500/10 border-yellow-500/30">
                          <Info className="w-4 h-4" />
                          <AlertDescription>
                            <strong>Warning:</strong> You selected "{capitalizeFirst(loadSize)}" but AI detected "{capitalizeFirst(photoAnalysis.loadSize)}". 
                            Selecting a smaller load size may result in insufficient space or additional charges.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    <div className="border-t pt-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <Weight className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <Label htmlFor="heavy-item" className="text-base font-semibold">
                              Heavy Items
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Includes: sofa beds, appliances, marble/glass, treadmills, sectionals
                            </p>
                          </div>
                        </div>
                        <Switch
                          id="heavy-item"
                          checked={heavyItem}
                          onCheckedChange={setHeavyItem}
                          data-testid="switch-heavy-item"
                        />
                      </div>
                      {heavyItem && (
                        <div className="mt-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                          <p className="text-sm font-semibold text-primary">+$15 Heavy Item Fee</p>
                        </div>
                      )}
                    </div>

                    <div className="border-t pt-6">
                      <Label className="text-base font-semibold mb-2 block flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Number of Movers
                      </Label>
                      {requiresTwoMovers(loadSize, heavyItem) && (
                        <Alert className="mb-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                          <AlertDescription className="text-sm text-amber-900 dark:text-amber-100">
                            <strong>Recommended: 2 Movers</strong> - Your load size or heavy items typically require assistance from 2 movers for safe handling.
                          </AlertDescription>
                        </Alert>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => setNumberOfMovers(1)}
                          className={`p-4 rounded-lg border-2 transition-all hover-elevate active-elevate-2 ${
                            numberOfMovers === 1
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card"
                          }`}
                          data-testid="button-1-mover"
                        >
                          <div className="text-center">
                            <p className="font-bold text-lg">1 Mover</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Customer helps with carry
                            </p>
                            <p className="text-sm font-semibold mt-2">Standard Price</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setNumberOfMovers(2)}
                          className={`p-4 rounded-lg border-2 transition-all hover-elevate active-elevate-2 ${
                            numberOfMovers === 2
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card"
                          }`}
                          data-testid="button-2-movers"
                        >
                          <div className="text-center">
                            <p className="font-bold text-lg">2 Movers</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Movers handle everything
                            </p>
                            <p className="text-sm font-semibold mt-2 text-primary">×1.30 Price</p>
                          </div>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div>
                      <Label htmlFor="date" className="text-base font-semibold mb-2 block">
                        Preferred Date & Time
                      </Label>
                      <div className="space-y-2">
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input
                            id="date"
                            type="datetime-local"
                            className="pl-10 h-12"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            data-testid="input-move-date"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            tomorrow.setHours(9, 0, 0, 0);
                            const localDateTime = tomorrow.toISOString().slice(0, 16);
                            setDate(localDateTime);
                          }}
                          data-testid="button-quick-schedule"
                          className="w-full"
                        >
                          <Clock className="w-4 h-4 mr-2" />
                          Quick Schedule: Tomorrow at 9:00 AM
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="description" className="text-base font-semibold mb-2 block">
                        Item Description (Optional)
                      </Label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                        <Textarea
                          id="description"
                          placeholder="Describe your items (e.g., 2-bedroom apartment furniture, 1 sofa, 2 beds, boxes...)"
                          className="pl-10 min-h-32"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          data-testid="input-description"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-base font-semibold mb-2 block">
                        Upload Photos of Items
                      </Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        Help movers provide accurate quotes by showing what needs to be moved
                      </p>
                      <ImageUpload onImagesChange={setImages} maxImages={10} />
                    </div>
                  </>
                )}

                <div className="flex justify-between pt-6 border-t gap-4">
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    disabled={step === 1}
                    className="hover-elevate active-elevate-2"
                    data-testid="button-back"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleNext}
                    data-testid="button-next"
                  >
                    {step === 3 ? "Find Movers" : "Next"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Live Pricing Sidebar - Desktop & Mobile */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-24">
              <PricingSummary 
                breakdown={priceBreakdown}
                isCalculating={isCalculatingPrice}
                error={pricingError}
                className="mb-6"
              />
              
              {/* Show load size info below pricing */}
              {priceBreakdown && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <p className="text-sm font-semibold text-primary">
                    Selected Load Size: {loadSize.charAt(0).toUpperCase() + loadSize.slice(1)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Price updates automatically as you fill the form
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Single Mover Warning Dialog - Cannot be dismissed without action */}
    <AlertDialog open={showSingleMoverWarning}>
      <AlertDialogContent data-testid="dialog-single-mover-warning">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-500" />
            Important: Single Mover Selection
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base space-y-3">
            <p>
              Based on your items ({loadSize === 'large' ? 'large furniture' : loadSize === 'apartment' ? 'apartment-sized load' : 'heavy items'}), 
              we recommend <strong>2 movers</strong> for safe and efficient moving.
            </p>
            
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-2">
              <p className="font-semibold text-amber-900 dark:text-amber-100">
                By choosing 1 mover, you acknowledge:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-amber-900 dark:text-amber-100">
                <li>You may need to help the mover with loading and unloading</li>
                <li>The mover can request your assistance for heavy items</li>
                <li>If you refuse to help and the mover cancels the job, you will forfeit 50% of the payment</li>
              </ul>
            </div>

            <p className="text-sm font-medium">
              This policy protects movers from unsafe working conditions and ensures fair compensation.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel
            onClick={() => {
              setNumberOfMovers(2);
              setShowSingleMoverWarning(false);
            }}
            data-testid="button-choose-two-movers"
            className="sm:flex-1"
          >
            Change to 2 Movers (Recommended)
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setHasSingleMoverAcknowledgment(true);
              setShowSingleMoverWarning(false);
            }}
            data-testid="button-accept-single-mover"
            className="sm:flex-1 bg-amber-600 hover:bg-amber-700"
          >
            I Understand - Continue with 1 Mover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
