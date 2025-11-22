import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent } from "@/components/ui/card";
import { Truck, Shield, Clock, DollarSign, CheckCircle2, Users, Star } from "lucide-react";

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
      icon: <Users className="w-6 h-6 md:w-8 md:h-8" />,
      title: "500+ Verified Movers",
      description: "Connect with licensed, insured movers in Calgary instantly",
    },
    {
      icon: <DollarSign className="w-6 h-6 md:w-8 md:h-8" />,
      title: "Transparent Pricing",
      description: "Get instant quotes based on distance and load size—no hidden fees",
    },
    {
      icon: <Clock className="w-6 h-6 md:w-8 md:h-8" />,
      title: "Flexible Scheduling",
      description: "Book on-demand or schedule for later at your convenience",
    },
    {
      icon: <Shield className="w-6 h-6 md:w-8 md:h-8" />,
      title: "Secure Payments",
      description: "Pay securely through Stripe with buyer protection",
    },
  ];

  const steps = [
    {
      number: "1",
      title: "Request a Move",
      description: "Enter your pickup and dropoff locations, select load size, and get instant quotes",
      icon: <Truck className="w-6 h-6 md:w-8 md:h-8" />,
    },
    {
      number: "2",
      title: "Choose Your Mover",
      description: "Browse verified movers, compare prices and ratings, and select the best fit",
      icon: <Star className="w-6 h-6 md:w-8 md:h-8" />,
    },
    {
      number: "3",
      title: "Get Moving!",
      description: "Pay securely, communicate with your mover, and track your move in real-time",
      icon: <CheckCircle2 className="w-6 h-6 md:w-8 md:h-8" />,
    },
  ];

  return (
    <div className="min-h-screen">
      <HeroSection />

      {/* Why Choose LervIT Section */}
      <section className="py-12 md:py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-3 md:mb-4">
              Why Choose LervIT?
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              The smartest, safest, and most affordable way to move in Calgary
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="hover-elevate smooth-transition rounded-2xl border-0 shadow-md hover:shadow-lg" 
                data-testid={`card-feature-${index}`}
              >
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

      {/* How It Works Section */}
      <section id="how-it-works" className="py-12 md:py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-3 md:mb-4">
              How It Works
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              Moving made simple in three easy steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center group" data-testid={`step-${index}`}>
                <div className="relative inline-flex items-center justify-center mb-5 md:mb-6">
                  <div className="absolute w-16 h-16 md:w-20 md:h-20 rounded-full bg-accent/10 group-hover:bg-accent/20 smooth-transition" />
                  <div className="relative inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-accent text-accent-foreground font-bold text-xl md:text-2xl">
                    {step.number}
                  </div>
                  {/* Mobile: Show icon in the bottom right of the circle */}
                  <div className="absolute -bottom-1 -right-1 md:-bottom-2 md:-right-2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                    {step.icon}
                  </div>
                </div>
                <h3 className="font-semibold text-lg md:text-xl mb-2">{step.title}</h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Indicators Section */}
      <section className="py-12 md:py-16 bg-accent text-accent-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 text-center">
            <div>
              <div className="text-3xl md:text-4xl font-bold mb-1 md:mb-2">500+</div>
              <div className="text-sm md:text-base opacity-90">Verified Movers</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold mb-1 md:mb-2">10K+</div>
              <div className="text-sm md:text-base opacity-90">Completed Moves</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold mb-1 md:mb-2">4.9★</div>
              <div className="text-sm md:text-base opacity-90">Average Rating</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold mb-1 md:mb-2">24/7</div>
              <div className="text-sm md:text-base opacity-90">Customer Support</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
