import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Brain, 
  MapPin, 
  CreditCard, 
  ShieldCheck,
  Camera,
  Users,
  Navigation
} from "lucide-react";

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
      icon: <Brain className="w-7 h-7" />,
      title: "Lervit Vision Engine™",
      description: "Snap a photo of your items and our AI instantly identifies them, estimates dimensions, and recommends the perfect vehicle size",
      gradient: "from-violet-500 to-purple-600",
    },
    {
      icon: <MapPin className="w-7 h-7" />,
      title: "Lervit MatchLogic™",
      description: "Get matched with the nearest verified movers in real-time—see ratings, ETAs, and transparent pricing before you book",
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      icon: <CreditCard className="w-7 h-7" />,
      title: "Lervit SecurePay™",
      description: "Pay safely with Stripe, save your cards for faster checkout, and enjoy transparent pricing with no hidden fees",
      gradient: "from-emerald-500 to-teal-500",
    },
    {
      icon: <ShieldCheck className="w-7 h-7" />,
      title: "Lervit TrustShield™",
      description: "Every mover is background-checked with verified licenses, insurance, and real customer reviews you can trust",
      gradient: "from-orange-500 to-amber-500",
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
                  <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} text-white mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-lg mb-3">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-16 md:py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-16 space-y-4">
            <span className="inline-block px-4 py-1.5 rounded-full bg-accent/80 text-accent-foreground text-sm font-medium">
              Simple 3-Step Process
            </span>
            <h2 className="text-3xl md:text-4xl font-bold">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Book your move in minutes—our AI and smart matching do the heavy lifting
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {[
              {
                step: "1",
                icon: <Camera className="w-6 h-6" />,
                title: "Vision Engine™ Scan",
                description: "Upload photos of your items—Lervit Vision Engine™ identifies them, estimates dimensions, and recommends the perfect vehicle",
                gradient: "from-violet-500 to-purple-600",
              },
              {
                step: "2",
                icon: <Users className="w-6 h-6" />,
                title: "MatchLogic™ Connect",
                description: "Lervit MatchLogic™ finds the nearest verified movers instantly—see ratings, ETAs, and transparent pricing before you book",
                gradient: "from-blue-500 to-cyan-500",
              },
              {
                step: "3",
                icon: <Navigation className="w-6 h-6" />,
                title: "SecurePay™ & Track",
                description: "Pay safely with Lervit SecurePay™, track your mover live on GPS, and relax with TrustShield™ protection",
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
    </div>
  );
}
