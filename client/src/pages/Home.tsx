import HeroSection from "@/components/HeroSection";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Truck, Shield, Clock, DollarSign } from "lucide-react";

export default function Home() {
  const features = [
    {
      icon: <Truck className="w-8 h-8" />,
      title: "500+ Verified Movers",
      description: "Connect with licensed, insured movers in Calgary instantly",
    },
    {
      icon: <DollarSign className="w-8 h-8" />,
      title: "Transparent Pricing",
      description: "Get instant quotes based on distance and load size—no hidden fees",
    },
    {
      icon: <Clock className="w-8 h-8" />,
      title: "Flexible Scheduling",
      description: "Book on-demand or schedule for later at your convenience",
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: "Secure Payments",
      description: "Pay securely through Stripe with buyer protection",
    },
  ];

  return (
    <div className="min-h-screen">
      <HeroSection />

      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why Choose MoveIt?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              The smartest, safest, and most affordable way to move in Calgary
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="hover-elevate" data-testid={`card-feature-${index}`}>
                <CardContent className="p-6 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How It Works
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
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
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent text-accent-foreground font-bold text-2xl mb-4">
                  {step.step}
                </div>
                <h3 className="font-semibold text-xl mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
