import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import HeroSection from "@/components/HeroSection";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import truckIcon from "@assets/generated_images/borderless_3d_truck_icon.png";
import dollarIcon from "@assets/generated_images/borderless_3d_dollar_icon.png";
import clockIcon from "@assets/generated_images/borderless_3d_clock_icon.png";
import shieldIcon from "@assets/generated_images/borderless_3d_shield_icon.png";

export default function Home() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users to their role-specific dashboard
  useEffect(() => {
    // Wait for auth to finish loading before redirecting
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
      icon: truckIcon,
      alt: "Moving truck",
      title: "500+ Verified Movers",
      description: "Connect with licensed, insured movers in Calgary instantly",
    },
    {
      icon: dollarIcon,
      alt: "Pricing",
      title: "Transparent Pricing",
      description: "Get instant quotes based on distance and load size—no hidden fees",
    },
    {
      icon: clockIcon,
      alt: "Schedule",
      title: "Flexible Scheduling",
      description: "Book on-demand or schedule for later at your convenience",
    },
    {
      icon: shieldIcon,
      alt: "Security",
      title: "Secure Payments",
      description: "Pay securely through Stripe with buyer protection",
    },
  ];

  return (
    <div className="min-h-screen">
      <HeroSection />

      <section className="py-12 md:py-16 lg:py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8 md:mb-12 space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold">
              Why Choose LervIT?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              The smartest way to move in Calgary
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="hover-elevate overflow-visible" data-testid={`card-feature-${index}`}>
                <CardContent className="p-5 md:p-6 text-center pt-8">
                  <div className="mb-4 flex justify-center">
                    <img 
                      src={feature.icon} 
                      alt={feature.alt} 
                      className="w-20 h-20 md:w-24 md:h-24 object-contain drop-shadow-lg" 
                    />
                  </div>
                  <h3 className="font-semibold text-base md:text-lg mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-12 md:py-16 lg:py-20 bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 md:mb-12 space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold">
              How It Works
            </h2>
            <p className="text-muted-foreground">Three simple steps to get moving</p>
          </div>

          <div className="space-y-6 md:space-y-0 md:grid md:grid-cols-3 md:gap-8">
            {[
              {
                step: "1",
                title: "Request a Move",
                description: "Enter locations, upload photos, and get instant AI-powered quotes",
              },
              {
                step: "2",
                title: "Choose Your Mover",
                description: "Compare verified movers by price, ratings, and availability",
              },
              {
                step: "3",
                title: "Get Moving!",
                description: "Pay securely and track your move in real-time",
              },
            ].map((step, index) => (
              <div key={index} className="flex md:flex-col items-start md:items-center gap-4 md:gap-3 md:text-center" data-testid={`step-${index}`}>
                <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-full bg-primary text-primary-foreground font-bold text-lg md:text-xl flex items-center justify-center shadow-md">
                  {step.step}
                </div>
                <div className="flex-1 md:flex-none">
                  <h3 className="font-semibold text-base md:text-lg mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
