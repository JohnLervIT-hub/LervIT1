import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Users, Navigation, Sparkles } from "lucide-react";
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

      <section className="py-20 md:py-28 lg:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-muted/40 via-muted/20 to-background" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16 md:mb-20 space-y-5">
            <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold tracking-wide uppercase border border-primary/20">
              <Sparkles className="w-4 h-4" />
              Why Customers Love Us
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              Why Choose <span className="bg-gradient-to-r from-primary via-violet-500 to-primary bg-clip-text text-transparent">LervIT</span>?
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Calgary's smartest moving platform—powered by AI, backed by trust
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="group relative text-center p-8 rounded-3xl bg-background/60 backdrop-blur-sm border border-border/50 hover:border-primary/30 hover:bg-background/80 transition-all duration-500 hover:shadow-xl hover:shadow-primary/5"
                data-testid={`card-feature-${index}`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div className="relative inline-flex items-center justify-center w-28 h-28 mb-6 group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-500">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-violet-500/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <img src={feature.icon} alt={feature.title} className="w-full h-full object-contain relative z-10 drop-shadow-lg" style={{ background: 'none' }} />
                </div>
                
                <h3 className="relative font-bold text-lg md:text-xl mb-4 tracking-tight">{feature.title}</h3>
                <p className="relative text-sm md:text-base text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-20 md:py-28 lg:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-muted/30 via-transparent to-transparent" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16 md:mb-20 space-y-5">
            <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-semibold tracking-wide uppercase border border-emerald-500/20">
              Simple Process
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              How It <span className="bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 bg-clip-text text-transparent">Works</span>
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              From photo to mover at your door—in minutes, not hours
            </p>
          </div>

          <div className="relative">
            <div className="hidden md:block absolute top-20 left-[20%] right-[20%] h-1 bg-gradient-to-r from-violet-500/20 via-blue-500/40 to-emerald-500/20 rounded-full" />
            <div className="hidden md:block absolute top-20 left-[20%] right-[20%] h-1 bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500 rounded-full opacity-30 blur-sm" />
            
            <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
              {[
                {
                  step: "1",
                  icon: <Camera className="w-7 h-7" />,
                  title: "Snap & Quote",
                  description: "Upload photos of your items, enter your locations, and get an instant AI-powered price estimate",
                  gradient: "from-violet-500 to-purple-600",
                  shadowColor: "shadow-violet-500/25",
                  glowColor: "bg-violet-500/20",
                },
                {
                  step: "2",
                  icon: <Users className="w-7 h-7" />,
                  title: "Match & Book",
                  description: "We find nearby verified movers for you—compare ratings, ETAs, and prices, then book with one tap",
                  gradient: "from-blue-500 to-cyan-500",
                  shadowColor: "shadow-blue-500/25",
                  glowColor: "bg-blue-500/20",
                },
                {
                  step: "3",
                  icon: <Navigation className="w-7 h-7" />,
                  title: "Track & Pay",
                  description: "Track your mover live on GPS, pay securely when complete, and rate your experience",
                  gradient: "from-emerald-500 to-teal-500",
                  shadowColor: "shadow-emerald-500/25",
                  glowColor: "bg-emerald-500/20",
                },
              ].map((step, index) => (
                <div 
                  key={index} 
                  className="relative text-center group"
                  data-testid={`step-${index}`}
                >
                  <div className="relative inline-block mb-8">
                    <div className={`absolute inset-0 ${step.glowColor} rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                    <div className={`relative inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br ${step.gradient} text-white shadow-2xl ${step.shadowColor} group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-500`}>
                      {step.icon}
                    </div>
                    <div className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-background border-2 border-primary flex items-center justify-center text-base font-bold text-primary shadow-lg group-hover:scale-110 transition-transform duration-300">
                      {step.step}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-bold text-xl md:text-2xl tracking-tight">{step.title}</h3>
                    <p className="text-muted-foreground leading-relaxed text-base md:text-lg max-w-xs mx-auto">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
