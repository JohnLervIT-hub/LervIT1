import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Users, Navigation, Package, Armchair, Sofa, Building2 } from "lucide-react";
import { Link } from "wouter";
import { FadeIn, StaggerChildren, StaggerItem } from "@/components/PageTransition";
import visionEngineIcon from "@assets/generated_images/3d_ai_eye_no_background.png";
import matchLogicIcon from "@assets/generated_images/3d_network_pins_no_background.png";
import securePayIcon from "@assets/generated_images/3d_secure_card_no_background.png";
import trustShieldIcon from "@assets/generated_images/3d_trust_shield_no_background.png";

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

          <StaggerChildren className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
            {features.map((feature, index) => (
              <StaggerItem key={index}>
                <div className="group text-center p-6" data-testid={`card-feature-${index}`}>
                  <div className="inline-flex items-center justify-center w-24 h-24 mb-5 group-hover:scale-110 transition-transform duration-300">
                    <img src={feature.icon} alt={feature.title} className="w-full h-full object-contain" style={{ background: 'none' }} />
                  </div>
                  <h3 className="font-semibold text-lg mb-3">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </div>
      </section>

      <section id="how-it-works" className="py-16 md:py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-16 space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From booking to mover at your door—in minutes, not hours
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {[
              {
                step: "1",
                icon: <Camera className="w-6 h-6" />,
                title: "Book & Quote",
                description: "Enter your locations, upload photos of your items, and get an instant AI-powered price estimate",
                gradient: "from-violet-500 to-purple-600",
              },
              {
                step: "2",
                icon: <Users className="w-6 h-6" />,
                title: "Pay Securely",
                description: "Review your AI-powered quote, pay securely with SecurePay™, and confirm your booking",
                gradient: "from-blue-500 to-cyan-500",
              },
              {
                step: "3",
                icon: <Navigation className="w-6 h-6" />,
                title: "Match & Track",
                description: "We match you with verified movers, track them live on GPS, and rate your experience when complete",
                gradient: "from-emerald-500 to-teal-500",
              },
            ].map((step, index) => (
              <div key={index} className="relative text-center group" data-testid={`step-${index}`}>
                <div className="relative inline-block mb-6">
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${step.gradient} text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {step.icon}
                  </div>
                  <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-background border-2 border-primary flex items-center justify-center text-sm font-bold text-primary shadow-sm">
                    {step.step}
                  </div>
                </div>
                <h3 className="font-semibold text-xl mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                
                {index < 2 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-muted-foreground/20 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 md:py-20 lg:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-16 space-y-4">
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
              Transparent Pricing
            </span>
            <h2 className="text-3xl md:text-4xl font-bold">
              No Hidden Fees, Ever
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our AI calculates exact pricing based on your items. What you see is what you pay.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                name: "Boxes",
                volume: "Up to 10 ft³",
                description: "Small items, boxes, bags",
                starting: "$49",
                icon: Package,
              },
              {
                name: "Medium",
                volume: "11-50 ft³",
                description: "Small furniture, appliances",
                starting: "$89",
                icon: Armchair,
              },
              {
                name: "Large",
                volume: "50-170 ft³",
                description: "Full room, large furniture",
                starting: "$159",
                popular: true,
                icon: Sofa,
              },
              {
                name: "Apartment",
                volume: "170+ ft³",
                description: "Full apartment moves",
                starting: "$299",
                icon: Building2,
              },
            ].map((tier, index) => (
              <Card 
                key={index} 
                className={`relative ${tier.popular ? 'border-primary shadow-lg' : ''}`}
                data-testid={`card-pricing-${tier.name.toLowerCase()}`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                  </div>
                )}
                <CardContent className="pt-8 pb-6 px-6 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-primary/10 flex items-center justify-center">
                    <tier.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">{tier.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{tier.volume}</p>
                  <div className="mb-4">
                    <span className="text-3xl font-bold">{tier.starting}</span>
                    <span className="text-sm text-muted-foreground"> CAD</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-6">{tier.description}</p>
                  <Link href="/request-move">
                    <Button className="w-full" variant={tier.popular ? "default" : "outline"} data-testid={`button-quote-${tier.name.toLowerCase()}`}>
                      Get Quote
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Final price includes distance and access conditions. No surprises.
          </p>
        </div>
      </section>
    </div>
  );
}
