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
      icon: <img src={truckIcon} alt="Moving truck" className="w-14 h-14" />,
      title: "500+ Verified Movers",
      description: "Connect with licensed, insured movers in Calgary instantly",
    },
    {
      icon: <img src={dollarIcon} alt="Pricing" className="w-14 h-14" />,
      title: "Transparent Pricing",
      description: "Get instant quotes based on distance and load size—no hidden fees",
    },
    {
      icon: <img src={clockIcon} alt="Schedule" className="w-14 h-14" />,
      title: "Flexible Scheduling",
      description: "Book on-demand or schedule for later at your convenience",
    },
    {
      icon: <img src={shieldIcon} alt="Security" className="w-14 h-14" />,
      title: "Secure Payments",
      description: "Pay securely through Stripe with buyer protection",
    },
  ];

  return (
    <div className="min-h-screen">
      <HeroSection />

      <section className="py-12 md:py-16 lg:py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 md:mb-12 lg:mb-16 space-y-3 md:space-y-4">
            <h2 className="mb-3 md:mb-4">
              Why Choose LervIT?
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              The smartest, safest, and most affordable way to move in Calgary
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 lg:gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="hover-elevate" data-testid={`card-feature-${index}`}>
                <CardContent className="p-5 md:p-6 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-primary/10 text-primary mb-3 md:mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-base md:text-lg mb-2">{feature.title}</h3>
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
