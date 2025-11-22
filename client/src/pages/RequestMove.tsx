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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import LoadSizeSelector from "@/components/LoadSizeSelector";
import PriceCalculator from "@/components/PriceCalculator";
import ImageUpload from "@/components/ImageUpload";
import { MapPin, Calendar, FileText, CheckCircle, TrendingUp, Package, DollarSign, Weight, Users, Clock, Sparkles, Camera, Loader2, Info, ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { aiPredictPrice, generatePriceExplanation, type AIEstimateResult, type PhotoAnalysisResult } from "@shared/ai";

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
  
  const [aiEstimate, setAiEstimate] = useState<AIEstimateResult | null>(null);
  const [estimateDistance, setEstimateDistance] = useState(0);
  const [showPriceExplanation, setShowPriceExplanation] = useState(false);
  const [priceExplanation, setPriceExplanation] = useState("");
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult | null>(null);
  const [analyzedPhotoUrl, setAnalyzedPhotoUrl] = useState<string | null>(null);

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

  useEffect(() => {
    const calculateDistance = async () => {
      if (pickupAddress && dropoffAddress) {
        try {
          const response = await fetch('/api/geocode/distance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pickupAddress, dropoffAddress })
          });
          
          if (response.ok) {
            const data = await response.json();
            setEstimateDistance(data.distance);
          } else {
            setEstimateDistance(10);
          }
        } catch (error) {
          setEstimateDistance(10);
        }
      }
    };
    
    calculateDistance();
  }, [pickupAddress, dropoffAddress]);

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
    if (step < 3) {
      setStep(step + 1);
    } else {
      if (!date) {
        toast({
          title: "Date required",
          description: "Please select a preferred date and time.",
          variant: "destructive",
        });
        return;
      }

      const bookingData = {
        customerId: user?.id,
        pickupAddress,
        dropoffAddress,
        pickupDifficulty,
        dropoffDifficulty,
        loadSize,
        heavyItem,
        numberOfMovers,
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-booking-success">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl md:text-2xl">Booking Created Successfully!</DialogTitle>
                <DialogDescription className="text-sm">
                  We've calculated your move details and notified nearby movers
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {createdBooking && (
            <div className="space-y-4 md:space-y-6">
              <div className="bg-muted/50 rounded-xl p-4 space-y-3">
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

              <div className="border rounded-xl p-4 md:p-5 space-y-3">
                <h3 className="font-semibold text-base md:text-lg flex items-center gap-2">
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
                      Distance Fee ({parseFloat(createdBooking.distance).toFixed(2)} km)
                    </span>
                    <span className="font-medium" data-testid="text-distance-fee">
                      ${parseFloat(createdBooking.distanceFee).toFixed(2)}
                    </span>
                  </div>
                  {parseFloat(createdBooking.loadFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Load Size ({createdBooking.loadSize})</span>
                      <span className="font-medium" data-testid="text-load-fee">
                        ${parseFloat(createdBooking.loadFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(createdBooking.pickupDifficultyFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pickup Difficulty</span>
                      <span className="font-medium" data-testid="text-pickup-difficulty-fee">
                        ${parseFloat(createdBooking.pickupDifficultyFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(createdBooking.dropoffDifficultyFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dropoff Difficulty</span>
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
                  <div className="flex justify-between text-base md:text-lg font-bold">
                    <span>Total Price</span>
                    <span className="text-primary" data-testid="text-total-price">
                      ${parseFloat(createdBooking.price).toFixed(2)} CAD
                    </span>
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  onClick={() => setShowPriceExplanation(!showPriceExplanation)}
                  className="w-full mt-3 min-h-11"
                  data-testid="button-ai-explain-price"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {showPriceExplanation ? "Hide" : "AI Explain My Price"}
                </Button>
                
                {showPriceExplanation && priceExplanation && (
                  <div className="mt-3 p-4 bg-accent/10 border border-accent/30 rounded-xl">
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

              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
                <p className="text-sm text-primary font-medium">
                  ⏱️ Movers have 10 minutes to accept. You'll be notified when one accepts!
                </p>
              </div>

              <Button
                onClick={() => {
                  setShowSuccessDialog(false);
                  setLocation("/my-bookings");
                }}
                className="w-full min-h-12"
                data-testid="button-view-bookings"
              >
                View My Bookings
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="min-h-screen bg-muted/30 pb-32 md:pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 md:pt-12">
          <div className="mb-6 md:mb-8">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-2">
              Request a Move
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Fill in the details to get matched with available movers
            </p>
          </div>

          {/* Mobile-first Progress Indicator */}
          <div className="mb-6 md:mb-8">
            <div className="flex items-center">
              {[1, 2, 3].map((stepNum) => (
                <div key={stepNum} className="flex items-center flex-1">
                  <div
                    className={`flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full font-semibold text-sm md:text-base smooth-transition ${
                      step >= stepNum
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted text-muted-foreground"
                    }`}
                    data-testid={`step-indicator-${stepNum}`}
                  >
                    {stepNum}
                  </div>
                  {stepNum < 3 && (
                    <div
                      className={`flex-1 h-1 mx-2 md:mx-3 rounded-full smooth-transition ${
                        step > stepNum ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3 text-xs md:text-sm">
              <span className={`smooth-transition ${step >= 1 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                Locations
              </span>
              <span className={`smooth-transition ${step >= 2 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                Load Details
              </span>
              <span className={`smooth-transition ${step >= 3 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                Schedule
              </span>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
            <div className="lg:col-span-2">
              <Card className="rounded-2xl border-0 shadow-md">
                <CardHeader className="pb-4">
                  <h2 className="text-xl md:text-2xl font-bold">
                    {step === 1 && "Step 1: Locations"}
                    {step === 2 && "Step 2: Load Details"}
                    {step === 3 && "Step 3: Schedule & Details"}
                  </h2>
                </CardHeader>
                <CardContent className="space-y-5 md:space-y-6">
                  {step === 1 && (
                    <>
                      <div>
                        <Label htmlFor="pickup" className="text-base font-semibold mb-3 block">
                          Pickup Address
                        </Label>
                        <div className="relative">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input
                            id="pickup"
                            placeholder="123 Main St SW, Calgary, AB"
                            className="pl-12 h-12 md:h-14 text-base rounded-xl"
                            value={pickupAddress}
                            onChange={(e) => setPickupAddress(e.target.value)}
                            data-testid="input-pickup-address"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="pickup-difficulty" className="text-base font-semibold mb-3 block">
                          Pickup Difficulty
                        </Label>
                        <Select value={pickupDifficulty} onValueChange={setPickupDifficulty}>
                          <SelectTrigger id="pickup-difficulty" className="h-12 md:h-14 text-base rounded-xl" data-testid="select-pickup-difficulty">
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

                      <div className="h-px bg-border" />

                      <div>
                        <Label htmlFor="dropoff" className="text-base font-semibold mb-3 block">
                          Dropoff Address
                        </Label>
                        <div className="relative">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input
                            id="dropoff"
                            placeholder="456 Oak Ave NW, Calgary, AB"
                            className="pl-12 h-12 md:h-14 text-base rounded-xl"
                            value={dropoffAddress}
                            onChange={(e) => setDropoffAddress(e.target.value)}
                            data-testid="input-dropoff-address"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="dropoff-difficulty" className="text-base font-semibold mb-3 block">
                          Dropoff Difficulty
                        </Label>
                        <Select value={dropoffDifficulty} onValueChange={setDropoffDifficulty}>
                          <SelectTrigger id="dropoff-difficulty" className="h-12 md:h-14 text-base rounded-xl" data-testid="select-dropoff-difficulty">
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

                      {aiEstimate && (
                        <div className="bg-gradient-to-r from-accent/10 to-primary/10 border border-accent/30 rounded-xl p-5 mt-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                              <Sparkles className="w-5 h-5 text-accent-foreground" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-base md:text-lg">AI Estimated Cost</h3>
                              <p className="text-xs text-muted-foreground">Early prediction based on your inputs</p>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-baseline justify-between flex-wrap gap-2">
                              <span className="text-2xl md:text-3xl font-bold text-accent-foreground">
                                ${aiEstimate.minPrice.toFixed(2)} - ${aiEstimate.maxPrice.toFixed(2)}
                              </span>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Info className="w-3 h-3" />
                                {aiEstimate.confidence}% confidence
                              </div>
                            </div>
                            <Progress value={aiEstimate.confidence} className="h-1.5" />
                            <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{aiEstimate.explanation}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {step === 2 && (
                    <>
                      <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-xl p-5 md:p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-base md:text-lg">AI Item Detection</h3>
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
                            className="w-full min-h-12"
                            onClick={() => {
                              ((window as any).__photoFileInput as HTMLInputElement)?.click();
                            }}
                            disabled={isAnalyzingPhoto}
                            data-testid="button-choose-photo"
                          >
                            <Camera className="w-5 h-5 mr-2" />
                            {analyzedPhotoUrl ? "Change Photo" : "Choose Photo"}
                          </Button>
                          
                          {isAnalyzingPhoto && (
                            <div className="flex items-center gap-2 text-sm text-primary">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>AI analyzing your item...</span>
                            </div>
                          )}
                          
                          {photoAnalysis && (
                            <Alert className="bg-primary/10 border-primary/30 rounded-xl">
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
                        />
                        <p className="text-sm text-muted-foreground mt-3">
                          Small: $0 | Medium: +$15 | Large: +$30
                        </p>
                      </div>

                      <div className="border-t pt-5 md:pt-6">
                        <div className="flex items-start md:items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <Weight className="w-5 h-5 text-muted-foreground mt-1 md:mt-0" />
                            <div>
                              <Label htmlFor="heavy-item" className="text-base font-semibold">
                                Heavy Items
                              </Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                Sofa beds, appliances, marble/glass, treadmills, sectionals
                              </p>
                            </div>
                          </div>
                          <Switch
                            id="heavy-item"
                            checked={heavyItem}
                            onCheckedChange={setHeavyItem}
                            data-testid="switch-heavy-item"
                            className="mt-1 md:mt-0"
                          />
                        </div>
                        {heavyItem && (
                          <div className="mt-3 p-3 bg-primary/10 border border-primary/20 rounded-xl">
                            <p className="text-sm font-semibold text-primary">+$15 Heavy Item Fee</p>
                          </div>
                        )}
                      </div>

                      <div className="border-t pt-5 md:pt-6">
                        <Label className="text-base font-semibold mb-4 block flex items-center gap-2">
                          <Users className="w-5 h-5" />
                          Number of Movers
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <button
                            type="button"
                            onClick={() => setNumberOfMovers(1)}
                            className={`p-5 rounded-xl border-2 smooth-transition hover-elevate active-elevate-2 ${
                              numberOfMovers === 1
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "border-border bg-card"
                            }`}
                            data-testid="button-1-mover"
                          >
                            <div className="text-center">
                              <p className="font-bold text-lg md:text-xl">1 Mover</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                Customer helps with carry
                              </p>
                              <p className="text-sm font-semibold mt-2">Standard Price</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setNumberOfMovers(2)}
                            className={`p-5 rounded-xl border-2 smooth-transition hover-elevate active-elevate-2 ${
                              numberOfMovers === 2
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "border-border bg-card"
                            }`}
                            data-testid="button-2-movers"
                          >
                            <div className="text-center">
                              <p className="font-bold text-lg md:text-xl">2 Movers</p>
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
                        <Label htmlFor="date" className="text-base font-semibold mb-3 block">
                          Preferred Date & Time
                        </Label>
                        <div className="space-y-3">
                          <div className="relative">
                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input
                              id="date"
                              type="datetime-local"
                              className="pl-12 h-12 md:h-14 text-base rounded-xl"
                              value={date}
                              onChange={(e) => setDate(e.target.value)}
                              data-testid="input-move-date"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const tomorrow = new Date();
                              tomorrow.setDate(tomorrow.getDate() + 1);
                              tomorrow.setHours(9, 0, 0, 0);
                              const localDateTime = tomorrow.toISOString().slice(0, 16);
                              setDate(localDateTime);
                            }}
                            data-testid="button-quick-schedule"
                            className="w-full min-h-11"
                          >
                            <Clock className="w-4 h-4 mr-2" />
                            Quick Schedule: Tomorrow at 9:00 AM
                          </Button>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="description" className="text-base font-semibold mb-3 block">
                          Item Description (Optional)
                        </Label>
                        <div className="relative">
                          <FileText className="absolute left-4 top-4 w-5 h-5 text-muted-foreground" />
                          <Textarea
                            id="description"
                            placeholder="Describe your items (e.g., 2-bedroom apartment furniture, 1 sofa, 2 beds, boxes...)"
                            className="pl-12 min-h-32 text-base rounded-xl"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            data-testid="input-description"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-base font-semibold mb-3 block">
                          Upload Photos of Items
                        </Label>
                        <p className="text-sm text-muted-foreground mb-3">
                          Help movers provide accurate quotes by showing what needs to be moved
                        </p>
                        <ImageUpload onImagesChange={setImages} maxImages={10} />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Desktop Sidebar - Hidden on Mobile */}
            <div className="hidden lg:block lg:col-span-1">
              <Card className="sticky top-24 rounded-2xl border-0 shadow-md">
                <CardHeader>
                  <h3 className="text-xl font-bold">What Happens Next?</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">
                        1
                      </div>
                      <div>
                        <p className="font-semibold">Distance Calculated</p>
                        <p className="text-sm text-muted-foreground">
                          We'll calculate the exact distance between your locations
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">
                        2
                      </div>
                      <div>
                        <p className="font-semibold">Dynamic Pricing</p>
                        <p className="text-sm text-muted-foreground">
                          Transparent pricing based on distance, load size, and mover travel
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">
                        3
                      </div>
                      <div>
                        <p className="font-semibold">Find Nearest Movers</p>
                        <p className="text-sm text-muted-foreground">
                          Top 5 nearest movers automatically notified
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">
                        4
                      </div>
                      <div>
                        <p className="font-semibold">10-Minute Response</p>
                        <p className="text-sm text-muted-foreground">
                          Movers have 10 minutes to accept
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
                    <p className="text-sm font-semibold text-primary">
                      Selected: {loadSize.charAt(0).toUpperCase() + loadSize.slice(1)} Load
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Mobile-only Fixed Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t shadow-lg lg:hidden z-50">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex gap-3">
              {step > 1 && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  className="min-h-12 px-6"
                  data-testid="button-back"
                >
                  <ChevronLeft className="w-5 h-5 mr-1" />
                  Back
                </Button>
              )}
              <Button
                onClick={handleNext}
                className="flex-1 min-h-12 font-semibold text-base"
                disabled={createBookingMutation.isPending}
                data-testid="button-next"
              >
                {createBookingMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  step === 3 ? "Find Movers" : "Next"
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Desktop Action Buttons - Hidden on Mobile */}
        <div className="hidden lg:block max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <Card className="rounded-2xl border-0 shadow-md">
            <CardContent className="p-6">
              <div className="flex justify-between gap-4">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={step === 1}
                  className="min-h-12 px-8"
                  data-testid="button-back-desktop"
                >
                  <ChevronLeft className="w-5 h-5 mr-1" />
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={createBookingMutation.isPending}
                  className="min-h-12 px-8 font-semibold"
                  data-testid="button-next-desktop"
                >
                  {createBookingMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    step === 3 ? "Find Movers" : "Next"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
