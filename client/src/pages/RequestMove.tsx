import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import LoadSizeSelector from "@/components/LoadSizeSelector";
import PriceCalculator from "@/components/PriceCalculator";
import ImageUpload from "@/components/ImageUpload";
import { MapPin, Calendar, FileText, CheckCircle, TrendingUp, Package, DollarSign } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export default function RequestMove() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [loadSize, setLoadSize] = useState("medium");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [createdBooking, setCreatedBooking] = useState<any>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

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

  const handleNext = () => {
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

      // Create the booking - backend will calculate distance and price
      const bookingData = {
        customerId: user?.id,
        pickupAddress,
        dropoffAddress,
        loadSize,
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
                      Distance Fee ({parseFloat(createdBooking.distance).toFixed(2)} km × $1.50/km)
                    </span>
                    <span className="font-medium" data-testid="text-distance-fee">
                      ${parseFloat(createdBooking.distanceFee).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Load Size Fee ({createdBooking.loadSize})</span>
                    <span className="font-medium" data-testid="text-load-fee">
                      ${parseFloat(createdBooking.loadFee).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mover Travel Fee</span>
                    <span className="font-medium" data-testid="text-mover-travel-fee">
                      ${parseFloat(createdBooking.moverTravelFee || "0").toFixed(2)}
                    </span>
                  </div>
                  <div className="h-px bg-border my-2" />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total Price</span>
                    <span className="text-primary" data-testid="text-total-price">
                      ${parseFloat(createdBooking.price).toFixed(2)} CAD
                    </span>
                  </div>
                </div>
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
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="pickup"
                          placeholder="123 Main St SW, Calgary, AB"
                          className="pl-10 h-12"
                          value={pickupAddress}
                          onChange={(e) => setPickupAddress(e.target.value)}
                          data-testid="input-pickup-address"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="dropoff" className="text-base font-semibold mb-2 block">
                        Dropoff Address
                      </Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="dropoff"
                          placeholder="456 Oak Ave NW, Calgary, AB"
                          className="pl-10 h-12"
                          value={dropoffAddress}
                          onChange={(e) => setDropoffAddress(e.target.value)}
                          data-testid="input-dropoff-address"
                        />
                      </div>
                    </div>
                  </>
                )}

                {step === 2 && (
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

                {step === 3 && (
                  <>
                    <div>
                      <Label htmlFor="date" className="text-base font-semibold mb-2 block">
                        Preferred Date & Time
                      </Label>
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

          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <h3 className="text-xl font-bold">What Happens Next?</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
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
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <p className="text-sm font-semibold text-primary">Selected Load Size: {loadSize.charAt(0).toUpperCase() + loadSize.slice(1)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
