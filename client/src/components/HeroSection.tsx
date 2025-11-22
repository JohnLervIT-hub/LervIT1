import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin, Star } from "lucide-react";
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
    <section className="relative min-h-[calc(100vh-4rem)] md:min-h-[700px] flex items-center overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-black/90 via-black/70 to-black/50" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-20 w-full">
        <div className="grid lg:grid-cols-2 gap-6 md:gap-12 items-center">
          <div className="text-white text-center lg:text-left">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 md:mb-6 leading-tight">
              Calgary's Smartest Way to Move
            </h1>
            <p className="text-base md:text-lg lg:text-xl mb-6 md:mb-8 text-white/90 max-w-xl mx-auto lg:mx-0">
              Connect with trusted freelance movers in minutes. Get instant quotes, book on-demand, and track your move in real-time.
            </p>
            <div className="flex items-center justify-center lg:justify-start gap-2 text-white/90 mb-6 md:mb-0">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className="w-4 h-4 md:w-5 md:h-5 fill-primary text-primary" />
                ))}
              </div>
              <span className="font-semibold text-sm md:text-base">500+ Movers in Calgary</span>
            </div>
          </div>

          <div className="bg-white dark:bg-card p-5 md:p-8 rounded-2xl shadow-2xl">
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Get Your Free Quote</h2>
            <div className="space-y-3 md:space-y-4">
              <div>
                <Label htmlFor="pickup" className="text-sm md:text-base font-semibold mb-2 block">
                  Pickup Location
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                  <Input
                    id="pickup"
                    placeholder="Enter pickup address"
                    className="pl-10 h-12 md:h-14 text-base rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    data-testid="input-pickup"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="dropoff" className="text-sm md:text-base font-semibold mb-2 block">
                  Dropoff Location
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                  <Input
                    id="dropoff"
                    placeholder="Enter dropoff address"
                    className="pl-10 h-12 md:h-14 text-base rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    value={dropoffAddress}
                    onChange={(e) => setDropoffAddress(e.target.value)}
                    data-testid="input-dropoff"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="date" className="text-sm md:text-base font-semibold mb-2 block">
                  Preferred Date
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                  <Input
                    id="date"
                    type="date"
                    className="pl-10 h-12 md:h-14 text-base rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    data-testid="input-date"
                  />
                </div>
              </div>

              <Button
                className="w-full h-12 md:h-14 text-base md:text-lg font-semibold rounded-xl touch-target btn-press bg-primary hover:bg-primary/90"
                size="lg"
                onClick={handleGetPrice}
                data-testid="button-get-price"
              >
                Get Instant Quote
              </Button>

              <p className="text-xs md:text-sm text-center text-muted-foreground">
                No credit card required • Free instant quote
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
