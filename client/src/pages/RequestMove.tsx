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
import { IdentifiedItemsList } from "@/components/IdentifiedItemsList";
import { MapPin, Calendar, FileText, CheckCircle, TrendingUp, Package, DollarSign, Weight, Users, Clock, Sparkles, Camera, Loader2, Info, Scan, CreditCard } from "lucide-react";
import type { IdentifiedItem } from "@shared/schema";
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
  
  /* ARCHIVED: AI Feature 3 - Photo Analysis state (Future Development)
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult | null>(null);
  const [analyzedPhotoUrl, setAnalyzedPhotoUrl] = useState<string | null>(null);
  */
  
  // Live Pricing state
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  // Single mover warning state
  const [showSingleMoverWarning, setShowSingleMoverWarning] = useState(false);
  const [hasSingleMoverAcknowledgment, setHasSingleMoverAcknowledgment] = useState(false);
  
  // AI Product Identifier state
  const [isIdentifyingItems, setIsIdentifyingItems] = useState(false);
  const [identifiedItems, setIdentifiedItems] = useState<IdentifiedItem[]>([]);
  const [hasAutoAnalyzed, setHasAutoAnalyzed] = useState(false);

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
      console.log('[Booking] Submitting booking data:', JSON.stringify(bookingData, null, 2));
      const res = await apiRequest("POST", "/api/bookings", bookingData);
      const data = await res.json();
      if (!res.ok) {
        console.error('[Booking] Server returned error:', data);
        throw new Error(data.error || 'Failed to create booking');
      }
      console.log('[Booking] Booking created successfully:', data.id);
      return data;
    },
    onSuccess: (data) => {
      setCreatedBooking(data);
      setShowSuccessDialog(true);
    },
    onError: (error: Error) => {
      console.error('[Booking] Mutation error:', error);
      toast({
        title: "Booking Failed",
        description: error.message || "Failed to create booking. Please try again.",
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
        console.log('[Pricing] Calculating with loadSize:', loadSize);
        const breakdown = calculatePrice(
          estimateDistance,
          loadSize as 'boxes' | 'medium' | 'large' | 'apartment',
          pickupDifficulty as PickupDifficultyType,
          dropoffDifficulty as DropoffDifficultyType,
          heavyItem,
          numberOfMovers as 1 | 2,
          undefined // moverToPickupDistance - will be calculated after mover assignment
        );
        console.log('[Pricing] New breakdown:', breakdown);
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

  /* ============================================================
     ARCHIVED: AI Photo Analysis Handler (Future Development)
     ============================================================
     This function handles photo upload and AI analysis for auto-filling load details.
     It has been archived for future development.
     To restore: Uncomment this function and the related UI section in Step 2.
  
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
  ============================================================ */

  // AI Product Identifier - Identify items from uploaded photos
  // This function can be called manually or automatically after photo upload
  const handleIdentifyItems = async (photoUrls?: string[]) => {
    const urlsToAnalyze = photoUrls || images;
    console.log('[ItemDetection] Starting identification, images:', urlsToAnalyze);
    
    if (urlsToAnalyze.length === 0) {
      toast({
        title: "No photos to analyze",
        description: "Please upload at least one photo first.",
        variant: "destructive",
      });
      return;
    }
    
    setIsIdentifyingItems(true);
    setIdentifiedItems([]);
    
    try {
      console.log('[ItemDetection] Sending API request...');
      const response = await apiRequest("POST", "/api/ai/items/identify", {
        photoUrls: urlsToAnalyze,
      });
      
      console.log('[ItemDetection] Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ItemDetection] API error:', response.status, errorText);
        throw new Error(`Failed to identify items: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('[ItemDetection] Result:', result);
      const items = result.items || [];
      setIdentifiedItems(items);
      
      const completedItems = items.filter((item: IdentifiedItem) => item.processingStatus === 'completed');
      
      if (completedItems.length > 0) {
        // AUTO-APPLY AI recommendations based on total volume
        const totalVolume = completedItems.reduce((sum: number, item: IdentifiedItem) => 
          sum + parseFloat(item.volumeCuft || '0'), 0);
        
        // Determine load size based on total volume thresholds
        // Boxes: 1-10 ft³, Medium: 11-50 ft³, Large: 50-170 ft³, Apartment: 170+ ft³
        let recommendedLoadSize = 'boxes';
        let recommendedVehicle = 'car';
        if (totalVolume > 170) {
          recommendedLoadSize = 'apartment';
          recommendedVehicle = 'truck';
        } else if (totalVolume > 50) {
          recommendedLoadSize = 'large';
          recommendedVehicle = 'pickup';
        } else if (totalVolume > 10) {
          recommendedLoadSize = 'medium';
          recommendedVehicle = 'van';
        }
        
        // Get max recommended movers from all items
        const maxMovers = Math.max(...completedItems.map((item: IdentifiedItem) => item.recommendedMovers || 1));
        
        // Check for heavy/complex items
        const hasHeavyItems = completedItems.some((item: IdentifiedItem) => 
          item.handlingComplexity === 'high' || 
          item.handlingComplexity === 'very_high' ||
          parseFloat(item.weightKg || '0') > 30
        );
        
        // Auto-apply all recommendations
        setLoadSize(recommendedLoadSize);
        setNumberOfMovers(maxMovers > 1 ? 2 : 1);
        setHeavyItem(hasHeavyItems);
        setHasAutoAnalyzed(true);
        
        toast({
          title: "AI Auto-Applied Recommendations!",
          description: `Total: ${totalVolume.toFixed(1)} ft³ → ${capitalizeFirst(recommendedLoadSize)} load (${recommendedVehicle}), ${maxMovers} mover${maxMovers !== 1 ? 's' : ''}${hasHeavyItems ? ', Heavy items' : ''}`,
        });
      } else {
        toast({
          title: "Identification Complete",
          description: "AI could not identify items. Please select load details manually.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("AI identification error:", error);
      toast({
        title: "Identification Failed",
        description: "Could not analyze photos. Please select load details manually.",
        variant: "destructive",
      });
    } finally {
      setIsIdentifyingItems(false);
    }
  };
  
  // Auto-analyze callback for ImageUpload - runs in background after photo upload
  const handleAutoAnalyze = (photoUrls: string[]) => {
    console.log('[AutoAnalyze] Triggered with', photoUrls.length, 'photos');
    // Run analysis in background - don't await to keep UI responsive
    handleIdentifyItems(photoUrls);
  };

  // Apply AI recommendations to booking form
  const handleApplyAIRecommendations = () => {
    const completedItems = identifiedItems.filter(item => item.processingStatus === 'completed');
    if (completedItems.length === 0) return;
    
    // Calculate total volume and determine load size
    // Boxes: 1-10 ft³, Medium: 11-50 ft³, Large: 50-170 ft³, Apartment: 170+ ft³
    const totalVolume = completedItems.reduce((sum, item) => sum + parseFloat(item.volumeCuft || '0'), 0);
    let recommendedLoadSize = 'boxes';
    if (totalVolume > 170) recommendedLoadSize = 'apartment';
    else if (totalVolume > 50) recommendedLoadSize = 'large';
    else if (totalVolume > 10) recommendedLoadSize = 'medium';
    
    // Get max recommended movers
    const maxMovers = Math.max(...completedItems.map(item => item.recommendedMovers || 1));
    
    // Check for heavy/complex items
    const hasHeavyItems = completedItems.some(item => 
      item.handlingComplexity === 'high' || 
      item.handlingComplexity === 'very_high' ||
      parseFloat(item.weightKg || '0') > 30
    );
    
    // Apply recommendations
    setLoadSize(recommendedLoadSize);
    setNumberOfMovers(maxMovers > 1 ? 2 : 1);
    setHeavyItem(hasHeavyItems);
    
    toast({
      title: "Recommendations Applied!",
      description: `Load size: ${capitalizeFirst(recommendedLoadSize)}, ${maxMovers} mover${maxMovers !== 1 ? 's' : ''}, Heavy items: ${hasHeavyItems ? 'Yes' : 'No'}`,
    });
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

    // Step 2: Validate photos (MANDATORY)
    if (step === 2) {
      if (!images || images.length === 0) {
        toast({
          title: "Photos required",
          description: "Please upload at least one photo of your items to continue.",
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
                <DialogTitle className="text-2xl">Booking Created!</DialogTitle>
                <DialogDescription>
                  Complete payment to notify nearby movers and get matched
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

              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                <p className="text-sm text-orange-600 font-medium">
                  Complete payment now to notify movers. After payment, movers have 10 minutes to accept your job!
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSuccessDialog(false);
                    setLocation("/my-bookings");
                  }}
                  className="flex-1"
                  data-testid="button-view-bookings"
                >
                  Pay Later
                </Button>
                <Button
                  onClick={() => {
                    setShowSuccessDialog(false);
                    setLocation(`/payment/${createdBooking.id}`);
                  }}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  data-testid="button-proceed-payment"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Proceed to Payment
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
                    {/* ============================================================
                        ARCHIVED: Item Detection Feature (Future Development)
                        ============================================================
                        This section contains photo analysis that auto-fills load details.
                        It has been archived for future development.
                        To restore: Uncomment this section and the related handlePhotoAnalysis function.
                    
                    <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">Item Detection</h3>
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
                    ============================================================ */}

                    <div>
                      <Label className="text-base font-semibold mb-2 block">
                        Upload Photos of Your Items
                      </Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        At least one photo required - Our AI will automatically analyze your items
                      </p>
                      <ImageUpload 
                        onImagesChange={setImages} 
                        onAnalyze={handleAutoAnalyze}
                        maxImages={10} 
                      />
                      
                      {/* Show analyzing status when AI is processing in background */}
                      {isIdentifyingItems && (
                        <div className="mt-4 bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-xl p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                              <Loader2 className="w-6 h-6 text-primary animate-spin" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-base">Analyzing Your Items...</h4>
                              <p className="text-sm text-muted-foreground">
                                AI is identifying items and calculating load requirements
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Show results after analysis completes */}
                      {!isIdentifyingItems && identifiedItems.length > 0 && (
                        <div className="mt-4">
                          <IdentifiedItemsList
                            items={identifiedItems}
                            isLoading={false}
                          />
                        </div>
                      )}
                    </div>

                    {/* Load details - show manual selection only when AI hasn't detected items */}
                    {!isIdentifyingItems && (
                      <>
                        {/* Only show load size selector if AI hasn't recommended one */}
                        {identifiedItems.length === 0 && (
                          <div>
                            <Label className="text-base font-semibold mb-4 block">
                              Select Load Size
                            </Label>
                            <LoadSizeSelector
                              selectedSize={loadSize}
                              onSelectSize={setLoadSize}
                            />
                          </div>
                        )}
                        
                        {/* Show heavy items toggle only when AI hasn't detected items */}
                        {identifiedItems.length === 0 && (
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
                        )}

                        {/* Number of Movers Section with Animated Person Visuals */}
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
                          {/* Animated Mover Selection Cards */}
                          <div className="grid grid-cols-2 gap-4">
                            {/* 1 Mover Card with animated person icon */}
                            <button
                              type="button"
                              onClick={() => setNumberOfMovers(1)}
                              className={`group relative p-5 rounded-lg border-2 transition-all duration-300 ease-out
                                ${numberOfMovers === 1
                                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                                  : "border-border bg-card hover:border-primary/50 hover:shadow-md"
                                }
                                transform hover:scale-[1.03] active:scale-[0.98]
                                animate-in fade-in slide-in-from-bottom-2 duration-500
                              `}
                              style={{ animationDelay: '0ms' }}
                              data-testid="button-1-mover"
                            >
                              <div className="flex flex-col items-center text-center">
                                {/* Single Person Icon with animation */}
                                <div className={`mb-3 transition-all duration-300 ${numberOfMovers === 1 ? 'scale-110' : 'group-hover:scale-105'}`}>
                                  <svg 
                                    viewBox="0 0 64 80" 
                                    className={`w-16 h-20 transition-colors duration-300 ${
                                      numberOfMovers === 1 ? 'text-primary' : 'text-muted-foreground group-hover:text-primary/70'
                                    }`}
                                    fill="currentColor"
                                  >
                                    {/* Person body with subtle gradient effect */}
                                    <circle cx="32" cy="16" r="12" className="drop-shadow-sm" />
                                    <path d="M32 32c-12 0-22 8-22 18v8c0 2 2 4 4 4h36c2 0 4-2 4-4v-8c0-10-10-18-22-18z" className="drop-shadow-sm" />
                                    {/* Carrying box detail */}
                                    <rect x="20" y="44" width="24" height="16" rx="2" className="fill-amber-500/80" />
                                    <line x1="26" y1="44" x2="26" y2="60" stroke="currentColor" strokeWidth="1" strokeOpacity="0.3" />
                                    <line x1="38" y1="44" x2="38" y2="60" stroke="currentColor" strokeWidth="1" strokeOpacity="0.3" />
                                  </svg>
                                </div>
                                <p className="font-bold text-lg">1 Mover</p>
                                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                                  Customer helps with carry
                                </p>
                                <p className={`text-sm font-semibold mt-2 ${numberOfMovers === 1 ? 'text-primary' : ''}`}>
                                  Standard Price
                                </p>
                              </div>
                              {/* Selection indicator */}
                              {numberOfMovers === 1 && (
                                <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center animate-in zoom-in duration-200">
                                  <CheckCircle className="w-4 h-4 text-primary-foreground" />
                                </div>
                              )}
                            </button>

                            {/* 2 Movers Card with animated person icons */}
                            <button
                              type="button"
                              onClick={() => setNumberOfMovers(2)}
                              className={`group relative p-5 rounded-lg border-2 transition-all duration-300 ease-out
                                ${numberOfMovers === 2
                                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                                  : "border-border bg-card hover:border-primary/50 hover:shadow-md"
                                }
                                transform hover:scale-[1.03] active:scale-[0.98]
                                animate-in fade-in slide-in-from-bottom-2 duration-500
                              `}
                              style={{ animationDelay: '100ms' }}
                              data-testid="button-2-movers"
                            >
                              <div className="flex flex-col items-center text-center">
                                {/* Two Person Icons with animation */}
                                <div className={`mb-3 flex items-end gap-1 transition-all duration-300 ${numberOfMovers === 2 ? 'scale-110' : 'group-hover:scale-105'}`}>
                                  {/* First person */}
                                  <svg 
                                    viewBox="0 0 48 64" 
                                    className={`w-10 h-14 transition-colors duration-300 ${
                                      numberOfMovers === 2 ? 'text-primary' : 'text-muted-foreground group-hover:text-primary/70'
                                    }`}
                                    fill="currentColor"
                                  >
                                    <circle cx="24" cy="12" r="9" className="drop-shadow-sm" />
                                    <path d="M24 24c-10 0-18 6-18 14v6c0 1.5 1.5 3 3 3h30c1.5 0 3-1.5 3-3v-6c0-8-8-14-18-14z" className="drop-shadow-sm" />
                                  </svg>
                                  {/* Second person */}
                                  <svg 
                                    viewBox="0 0 48 64" 
                                    className={`w-10 h-14 transition-colors duration-300 ${
                                      numberOfMovers === 2 ? 'text-primary' : 'text-muted-foreground group-hover:text-primary/70'
                                    }`}
                                    fill="currentColor"
                                  >
                                    <circle cx="24" cy="12" r="9" className="drop-shadow-sm" />
                                    <path d="M24 24c-10 0-18 6-18 14v6c0 1.5 1.5 3 3 3h30c1.5 0 3-1.5 3-3v-6c0-8-8-14-18-14z" className="drop-shadow-sm" />
                                  </svg>
                                </div>
                                {/* Shared carrying item indicator */}
                                <div className={`-mt-5 mb-2 transition-all duration-300 ${numberOfMovers === 2 ? 'opacity-100' : 'opacity-70 group-hover:opacity-90'}`}>
                                  <svg viewBox="0 0 60 24" className="w-14 h-6">
                                    <rect x="5" y="4" width="50" height="16" rx="3" className={`transition-colors duration-300 ${numberOfMovers === 2 ? 'fill-amber-500' : 'fill-amber-500/60'}`} />
                                    <line x1="20" y1="4" x2="20" y2="20" stroke="white" strokeWidth="1" strokeOpacity="0.4" />
                                    <line x1="40" y1="4" x2="40" y2="20" stroke="white" strokeWidth="1" strokeOpacity="0.4" />
                                  </svg>
                                </div>
                                <p className="font-bold text-lg">2 Movers</p>
                                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                                  Movers handle everything
                                </p>
                                <p className={`text-sm font-semibold mt-2 ${numberOfMovers === 2 ? 'text-primary' : 'text-primary/80'}`}>
                                  ×1.30 Price
                                </p>
                              </div>
                              {/* Selection indicator */}
                              {numberOfMovers === 2 && (
                                <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center animate-in zoom-in duration-200">
                                  <CheckCircle className="w-4 h-4 text-primary-foreground" />
                                </div>
                              )}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
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
