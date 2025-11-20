import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import heroImage from "@assets/generated_images/moving_truck_calgary_hero.png";

export default function HeroSection() {
  const [, setLocation] = useLocation();
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");

  const handleGetPrice = () => {
    console.log("Get price clicked", { pickupAddress, dropoffAddress });
    setLocation("/request-move");
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
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="pickup"
                    placeholder="Enter pickup address"
                    className="pl-10 h-12"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    data-testid="input-pickup"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="dropoff" className="text-base font-semibold mb-2 block">
                  Dropoff Location
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="dropoff"
                    placeholder="Enter dropoff address"
                    className="pl-10 h-12"
                    value={dropoffAddress}
                    onChange={(e) => setDropoffAddress(e.target.value)}
                    data-testid="input-dropoff"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="date" className="text-base font-semibold mb-2 block">
                  Preferred Date
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="date"
                    type="date"
                    className="pl-10 h-12"
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
