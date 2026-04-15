import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin, ShieldCheck, CreditCard, Navigation, Tag } from "lucide-react";
import { useState, Component, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import heroImage from "@assets/generated_images/moving_truck_calgary_hero.png";
import { CustomAddressInput } from "@/components/CustomAddressInput";

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
            <h1 className="font-display text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-extrabold mb-6 leading-tight tracking-tight">
              Book small moves and furniture pickup <span className="whitespace-nowrap">in Calgary — Fast.</span>
            </h1>
            <p className="text-lg md:text-xl mb-8 text-white/90">
              Get upfront pricing, book verified movers, and track your move live.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-white/90 mb-8">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold">Verified Movers</span>
              </div>
              <span className="text-white/40">·</span>
              <div className="flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold">Secure Payments</span>
              </div>
              <span className="text-white/40">·</span>
              <div className="flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold">Live Tracking</span>
              </div>
            </div>
          </div>

          <div className="bg-card/95 backdrop-blur-sm p-6 md:p-8 rounded-xl border border-card-border shadow-xl">
            <h2 className="text-2xl font-bold mb-6">Get Your Price</h2>
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
                  <CustomAddressInput
                    id="pickup"
                    value={pickupAddress}
                    onChange={(address) => setPickupAddress(address)}
                    placeholder="Enter pickup address in Calgary"
                    data-testid="input-pickup"
                  />
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
                  <CustomAddressInput
                    id="dropoff"
                    value={dropoffAddress}
                    onChange={(address) => setDropoffAddress(address)}
                    placeholder="Enter dropoff address in Calgary"
                    data-testid="input-dropoff"
                  />
                </AddressInputErrorBoundary>
              </div>

              <div>
                <Label htmlFor="date" className="text-base font-semibold mb-2 block">
                  Preferred Date
                </Label>
                <div className="relative w-full overflow-hidden">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10 pointer-events-none" />
                  <Input
                    id="date"
                    type="date"
                    className="pl-10 h-12 w-full min-w-0"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    data-testid="input-date"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2.5 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2.5" data-testid="promo-banner">
                <Tag className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-400">
                  <span className="font-bold">20% off your first 2 moves</span>
                  <span className="text-green-600/80 dark:text-green-400/80"> · Use code </span>
                  <span className="font-mono font-bold tracking-wide">LERVIT20</span>
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 py-1">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                  ))}
                </div>
                <span className="text-sm font-semibold text-foreground">4.9</span>
                <span className="text-sm text-muted-foreground">· 200+ moves completed in Calgary</span>
              </div>

              <Button
                className="w-full h-12 text-base font-semibold"
                size="lg"
                onClick={handleGetPrice}
                data-testid="button-get-price"
              >
                Check Price Now
              </Button>
              <p className="text-center text-xs text-muted-foreground mt-2">
                No signup required · Takes 30 seconds
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
