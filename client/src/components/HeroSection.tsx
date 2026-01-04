import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin } from "lucide-react";
import { useState, Component, lazy, Suspense, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import heroImage from "@assets/generated_images/moving_truck_calgary_hero.png";

// Lazy load CustomAddressInput to avoid initialization issues
const CustomAddressInput = lazy(() => import("@/components/CustomAddressInput").then(m => ({ default: m.CustomAddressInput })));

// Error boundary for address inputs
class AddressInputErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error('[AddressInput] Error caught:', error);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// Simple fallback input for when CustomAddressInput fails
function FallbackAddressInput({ value, onChange, placeholder, id, "data-testid": testId }: {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
  id?: string;
  "data-testid"?: string;
}) {
  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10 pointer-events-none" />
      <Input
        id={id}
        placeholder={placeholder}
        className="pl-10 h-12"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
    </div>
  );
}

export default function HeroSection() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [preferredDate, setPreferredDate] = useState("");

  const handleGetPrice = () => {
    if (!pickupAddress.trim()) {
      toast({
        title: "Pickup Address Required",
        description: "Please enter a pickup address to get a quote.",
        variant: "destructive",
      });
      return;
    }

    if (!dropoffAddress.trim()) {
      toast({
        title: "Dropoff Address Required",
        description: "Please enter a dropoff address to get a quote.",
        variant: "destructive",
      });
      return;
    }

    const params = new URLSearchParams({
      pickup: pickupAddress,
      dropoff: dropoffAddress,
      ...(preferredDate && { date: preferredDate }),
    });
    setLocation(`/request-move?${params.toString()}`);
  };

  return (
    <section className="relative min-h-[600px] lg:min-h-[700px] flex items-center overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-white">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Calgary's Smartest Way to Move
            </h1>
            <p className="text-lg md:text-xl mb-8 text-white/90">
              Connect with trusted freelance movers in minutes. Get instant quotes, book on-demand, and track your move in real-time.
            </p>
            <div className="flex items-center gap-2 text-white/80 mb-8">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg key={star} className="w-5 h-5 fill-accent text-accent" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                  </svg>
                ))}
              </div>
              <span className="font-semibold">500+ Movers in Calgary</span>
            </div>
          </div>

          <div className="bg-card/95 backdrop-blur-sm p-6 md:p-8 rounded-xl border border-card-border shadow-xl">
            <h2 className="text-2xl font-bold mb-6">Get Your Free Quote</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="pickup" className="text-base font-semibold mb-2 block">
                  Pickup Location
                </Label>
                <AddressInputErrorBoundary 
                  fallback={
                    <FallbackAddressInput 
                      id="pickup"
                      value={pickupAddress}
                      onChange={setPickupAddress}
                      placeholder="Enter pickup address in Calgary"
                      data-testid="input-pickup"
                    />
                  }
                >
                  <Suspense fallback={
                    <FallbackAddressInput 
                      id="pickup"
                      value={pickupAddress}
                      onChange={setPickupAddress}
                      placeholder="Enter pickup address in Calgary"
                      data-testid="input-pickup"
                    />
                  }>
                    <CustomAddressInput
                      id="pickup"
                      value={pickupAddress}
                      onChange={(address) => setPickupAddress(address)}
                      placeholder="Enter pickup address in Calgary"
                      data-testid="input-pickup"
                    />
                  </Suspense>
                </AddressInputErrorBoundary>
              </div>

              <div>
                <Label htmlFor="dropoff" className="text-base font-semibold mb-2 block">
                  Dropoff Location
                </Label>
                <AddressInputErrorBoundary 
                  fallback={
                    <FallbackAddressInput 
                      id="dropoff"
                      value={dropoffAddress}
                      onChange={setDropoffAddress}
                      placeholder="Enter dropoff address in Calgary"
                      data-testid="input-dropoff"
                    />
                  }
                >
                  <Suspense fallback={
                    <FallbackAddressInput 
                      id="dropoff"
                      value={dropoffAddress}
                      onChange={setDropoffAddress}
                      placeholder="Enter dropoff address in Calgary"
                      data-testid="input-dropoff"
                    />
                  }>
                    <CustomAddressInput
                      id="dropoff"
                      value={dropoffAddress}
                      onChange={(address) => setDropoffAddress(address)}
                      placeholder="Enter dropoff address in Calgary"
                      data-testid="input-dropoff"
                    />
                  </Suspense>
                </AddressInputErrorBoundary>
              </div>

              <div>
                <Label htmlFor="date" className="text-base font-semibold mb-2 block">
                  Preferred Date
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                  <Input
                    id="date"
                    type="date"
                    className="pl-10 h-12"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    data-testid="input-date"
                  />
                </div>
              </div>

              <Button
                className="w-full h-12 text-base font-semibold"
                size="lg"
                onClick={handleGetPrice}
                data-testid="button-get-price"
              >
                Get Instant Quote
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
