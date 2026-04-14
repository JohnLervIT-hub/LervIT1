import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useAnalytics } from "@/hooks/use-analytics";
import { useLocation as useGeoLocation } from "@/contexts/LocationContext";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Users, Navigation, MapPin, X, Truck, Mail, MapPinIcon, ShieldCheck, Briefcase, Newspaper, HelpCircle, AlertTriangle, FileText, Lock, Phone, Tag } from "lucide-react";
import { SiFacebook, SiInstagram, SiLinkedin, SiStripe, SiGoogle } from "react-icons/si";
import { FadeIn, StaggerChildren, StaggerItem } from "@/components/PageTransition";
import { Separator } from "@/components/ui/separator";
import visionEngineIcon from "@assets/generated_images/3d_ai_eye_no_background.png";
import matchLogicIcon from "@assets/generated_images/3d_network_pins_no_background.png";
import securePayIcon from "@assets/generated_images/3d_secure_card_no_background.png";
import trustShieldIcon from "@assets/generated_images/3d_trust_shield_no_background.png";

const FOOTER_LINKS = {
  social: {
    facebook: "https://www.facebook.com/profile.php?id=61585380446312",
    instagram: "https://www.instagram.com/lervit_",
    linkedin: "https://www.linkedin.com/company/lervit/?viewAsMember=true",
  },
  company: {
    aboutUs: "https://lervit.com/about",
    careers: "https://lervit.com/careers",
    press: "https://lervit.com",
  },
  support: {
    terms: "/terms",
    privacy: "/privacy",
    moverAgreement: "/mover-agreement",
  },
};

export default function Home() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { coords, permissionState, requestLocation, isRequesting } = useGeoLocation();
  useAnalytics("home_page");

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
      title: "LervIT Vision Engine™",
      description: "Snap a photo of your items and our AI instantly identifies them, estimates dimensions, and recommends the perfect vehicle size",
    },
    {
      icon: matchLogicIcon,
      title: "LervIT MatchLogic™",
      description: "Get matched with the nearest verified movers in real-time—see ratings, ETAs, and transparent pricing before you book",
    },
    {
      icon: securePayIcon,
      title: "LervIT SecurePay™",
      description: "Pay safely with Stripe, save your cards for faster checkout, and enjoy transparent pricing with no hidden fees",
    },
    {
      icon: trustShieldIcon,
      title: "LervIT TrustShield™",
      description: "Every mover is background-checked with verified licenses, insurance, and real customer reviews you can trust",
    },
  ];

  // Only show location banner if permission not granted and not loading
  const showLocationBanner = !coords && permissionState !== "granted" && permissionState !== "loading";

  return (
    <div className="min-h-screen">
      {/* Location banner - only shows once if permission not granted */}
      {showLocationBanner && (
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {permissionState === "denied" ? (
                <MapPin className="w-5 h-5 flex-shrink-0" />
              ) : (
                <MapPin className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-sm font-medium">
                {permissionState === "denied" 
                  ? "Location blocked. Enable it in browser settings to find nearby movers."
                  : "Enable location to find movers near you with accurate pricing"
                }
              </span>
            </div>
            {permissionState !== "denied" && (
              <Button
                onClick={requestLocation}
                disabled={isRequesting}
                variant="secondary"
                size="sm"
                className="bg-white text-orange-600 hover:bg-orange-50"
                data-testid="button-enable-location-banner"
              >
                <Navigation className="w-4 h-4 mr-1" />
                {isRequesting ? "Getting..." : "Enable"}
              </Button>
            )}
          </div>
        </div>
      )}
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

      {/* Google Reviews Section */}
      <section className="py-16 md:py-20 lg:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-12 md:mb-14 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-background border text-sm font-medium">
              <SiGoogle className="w-4 h-4 text-[#4285F4]" />
              <span>Google Reviews</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">What Calgary Customers Say</h2>
            {/* Overall rating bar */}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <span className="text-5xl font-bold tabular-nums">4.9</span>
              <div className="flex flex-col items-start gap-1">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <a
                  href="https://g.page/r/lervit/review"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  data-testid="link-google-all-reviews"
                >
                  <SiGoogle className="w-3 h-3 text-[#4285F4]" />
                  Verified on Google
                </a>
              </div>
            </div>
          </div>

          {/* Review Cards */}
          <StaggerChildren className="grid md:grid-cols-3 gap-5 md:gap-6 mb-10">
            {[
              {
                name: "Tariq A.",
                initials: "TA",
                date: "March 2025",
                rating: 5,
                text: "Booked on a Tuesday morning and my mover arrived within 2 hours. The AI quote matched almost exactly what I paid — no surprises. Couldn't be easier.",
              },
              {
                name: "Jessica L.",
                initials: "JL",
                date: "February 2025",
                rating: 5,
                text: "Used LervIT for a last-minute move. The live GPS tracking is a game changer — I knew exactly when my mover was 10 minutes away. Super professional service.",
              },
              {
                name: "David K.",
                initials: "DK",
                date: "January 2025",
                rating: 5,
                text: "Took 3 photos of my boxes and furniture and got an instant quote. Movers showed up on time, handled everything carefully. Will 100% use again.",
              },
            ].map((review, i) => (
              <StaggerItem key={i}>
                <Card className="h-full" data-testid={`card-review-${i}`}>
                  <CardContent className="pt-6 pb-6 px-6 flex flex-col gap-4 h-full">
                    {/* Reviewer row */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-primary">{review.initials}</span>
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{review.name}</div>
                          <div className="text-xs text-muted-foreground">{review.date}</div>
                        </div>
                      </div>
                      <SiGoogle className="w-5 h-5 text-[#4285F4] flex-shrink-0" />
                    </div>
                    {/* Stars */}
                    <div className="flex gap-0.5">
                      {[...Array(review.rating)].map((_, j) => (
                        <svg key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    {/* Review text */}
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                      &ldquo;{review.text}&rdquo;
                    </p>
                    {/* Footer */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t">
                      <SiGoogle className="w-3 h-3 text-[#4285F4]" />
                      <span>Reviewed on Google</span>
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </StaggerChildren>

          {/* CTA */}
          <div className="text-center">
            <a
              href="https://g.page/r/lervit/review"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-google-reviews-cta"
            >
              <Button variant="outline" className="gap-2">
                <SiGoogle className="w-4 h-4 text-[#4285F4]" />
                See all reviews on Google
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black/90 text-white border-t border-white/10" data-testid="footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
            <div className="space-y-4 lg:max-w-[220px]">
              <div className="flex items-center gap-2">
                <Truck className="w-6 h-6 text-primary" />
                <span className="text-xl font-bold">LervIT</span>
              </div>
              <p className="text-sm text-white/60">
                Calgary's smartest moving platform.
              </p>
              <div className="flex items-center gap-4">
                <a href={FOOTER_LINKS.social.facebook} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors" aria-label="Facebook" data-testid="link-facebook">
                  <SiFacebook className="w-5 h-5" />
                </a>
                <a href={FOOTER_LINKS.social.instagram} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors" aria-label="Instagram" data-testid="link-instagram">
                  <SiInstagram className="w-5 h-5" />
                </a>
                <a href={FOOTER_LINKS.social.linkedin} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors" aria-label="LinkedIn" data-testid="link-linkedin">
                  <SiLinkedin className="w-5 h-5" />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-8 lg:gap-x-12 gap-y-8 flex-1">
              <div className="space-y-4">
                <h4 className="font-semibold">Company</h4>
                <ul className="space-y-3 text-sm">
                  <li>
                    <a href={FOOTER_LINKS.company.aboutUs} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors" data-testid="link-about">
                      <Users className="w-4 h-4 flex-shrink-0" />
                      <span>About Us</span>
                    </a>
                  </li>
                  <li>
                    <a href={FOOTER_LINKS.company.careers} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors" data-testid="link-careers">
                      <Briefcase className="w-4 h-4 flex-shrink-0" />
                      <span>Careers</span>
                    </a>
                  </li>
                  <li>
                    <a href={FOOTER_LINKS.company.press} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors" data-testid="link-press">
                      <Newspaper className="w-4 h-4 flex-shrink-0" />
                      <span>Press</span>
                    </a>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Contact</h4>
                <ul className="space-y-3 text-sm">
                  <li>
                    <a href="mailto:support@lervit.com" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors" data-testid="link-email">
                      <Mail className="w-4 h-4 flex-shrink-0" />
                      <span>support@lervit.com</span>
                    </a>
                  </li>
                  <li>
                    <a href="tel:+18889820885" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors" data-testid="link-phone">
                      <Phone className="w-4 h-4 flex-shrink-0" />
                      <span>(888) 982-0885</span>
                    </a>
                  </li>
                  <li className="flex items-center gap-2 text-white/60">
                    <MapPinIcon className="w-4 h-4 flex-shrink-0" />
                    <span>Calgary, AB, Canada</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Support</h4>
                <ul className="space-y-3 text-sm">
                  <li>
                    <a href="https://lervit.com/help" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors" data-testid="link-help-center">
                      <HelpCircle className="w-4 h-4 flex-shrink-0" />
                      <span>Help Center</span>
                    </a>
                  </li>
                  <li>
                    <a href="/support" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors" data-testid="link-report-issue">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>Report an Issue</span>
                    </a>
                  </li>
                  <li>
                    <a href={FOOTER_LINKS.support.terms} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors" data-testid="link-terms">
                      <FileText className="w-4 h-4 flex-shrink-0" />
                      <span>Terms of Service</span>
                    </a>
                  </li>
                  <li>
                    <a href={FOOTER_LINKS.support.privacy} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors" data-testid="link-privacy">
                      <Lock className="w-4 h-4 flex-shrink-0" />
                      <span>Privacy Policy</span>
                    </a>
                  </li>
                  <li>
                    <a href={FOOTER_LINKS.support.moverAgreement} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors" data-testid="link-mover-agreement">
                      <Briefcase className="w-4 h-4 flex-shrink-0" />
                      <span>Mover Agreement</span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 my-8" />

          <div className="flex flex-wrap items-center justify-center sm:justify-between gap-4">
            <p className="text-sm text-white/50" data-testid="text-copyright">
              &copy; 2026 LervIT Tech Corporation. All rights reserved.
            </p>
            <div className="flex items-center gap-2 text-xs text-white/50">
              <SiStripe className="w-8 h-4 text-[#635BFF]" />
              <span>Powered by Stripe</span>
              <span className="mx-1">|</span>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
