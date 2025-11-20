import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import LoadSizeSelector from "@/components/LoadSizeSelector";
import PriceCalculator from "@/components/PriceCalculator";
import ImageUpload from "@/components/ImageUpload";
import { MapPin, Calendar, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function RequestMove() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [loadSize, setLoadSize] = useState("medium");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [priceData, setPriceData] = useState<any>(null);

  const mockDistance = 5.2;

  const priceMutation = useMutation({
    mutationFn: async (data: { distance: number; loadSize: string }) => {
      const res = await apiRequest("POST", "/api/calculate-price", data);
      return await res.json();
    },
    onSuccess: (data) => {
      setPriceData(data);
    },
  });

  useEffect(() => {
    priceMutation.mutate({ distance: mockDistance, loadSize });
  }, [loadSize]);

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      console.log("Form submitted", { pickupAddress, dropoffAddress, loadSize, description, date });
      setLocation("/browse-movers");
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
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
            <PriceCalculator
              distance={priceData?.distance || mockDistance}
              loadSize={loadSize}
              baseRate={priceData?.baseRate || 15}
              showBreakdown={true}
              totalCost={priceData?.totalCost}
              baseCost={priceData?.baseCost}
              loadSurcharge={priceData?.loadSurcharge}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
