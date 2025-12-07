import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent } from "@/components/ui/card";
import visionEngineIcon from "@assets/generated_images/3d_ai_vision_eye_icon.png";
import matchLogicIcon from "@assets/generated_images/3d_matching_network_icon.png";
import securePayIcon from "@assets/generated_images/3d_secure_payment_icon.png";
import trustShieldIcon from "@assets/generated_images/3d_trust_shield_icon.png";

export default function Home() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
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

  const features = [
    {
      icon: visionEngineIcon,
      title: "Lervit Vision Engine™",
      description: "Snap a photo of your items and our AI instantly identifies them, estimates dimensions, and recommends the perfect vehicle size",
    },
    {
      icon: matchLogicIcon,
      title: "Lervit MatchLogic™",
      description: "Get matched with the nearest verified movers in real-time—see ratings, ETAs, and transparent pricing before you book",
    },
    {
      icon: securePayIcon,
      title: "Lervit SecurePay™",
      description: "Pay safely with Stripe, save your cards for faster checkout, and enjoy transparent pricing with no hidden fees",
    },
    {
      icon: trustShieldIcon,
      title: "Lervit TrustShield™",
      description: "Every mover is background-checked with verified licenses, insurance, and real customer reviews you can trust",
    },
  ];

  return (
    <div className="min-h-screen">
      <HeroSection />

      <section className="py-16 md:py-20 lg:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-16 space-y-4">
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
              Why Customers Love Us
            </span>
            <h2 className="text-3xl md:text-4xl font-bold">
              Why Choose LervIT?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Calgary's smartest moving platform—powered by AI, backed by trust
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="hover-elevate group overflow-visible border-0 shadow-md" data-testid={`card-feature-${index}`}>
                <CardContent className="p-6 text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 mb-5 group-hover:scale-110 transition-transform duration-300">
                    <img src={feature.icon} alt={feature.title} className="w-full h-full object-contain drop-shadow-lg" />
                  </div>
                  <h3 className="font-semibold text-lg mb-3">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-12 md:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 md:mb-12 lg:mb-16 space-y-3 md:space-y-4">
            <h2 className="mb-0">
              How It Works
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8 lg:gap-10">
            {[
              {
                step: "1",
                title: "Request a Move",
                description: "Enter your pickup and dropoff locations, select load size, and get instant quotes",
              },
              {
                step: "2",
                title: "Choose Your Mover",
                description: "Browse verified movers, compare prices and ratings, and select the best fit",
              },
              {
                step: "3",
                title: "Get Moving!",
                description: "Pay securely, communicate with your mover, and track your move in real-time",
              },
            ].map((step, index) => (
              <div key={index} className="text-center" data-testid={`step-${index}`}>
                <div className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-accent text-accent-foreground font-bold text-xl md:text-2xl mb-3 md:mb-4">
                  {step.step}
                </div>
                <h3 className="font-semibold text-lg md:text-xl mb-2 md:mb-3">{step.title}</h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
