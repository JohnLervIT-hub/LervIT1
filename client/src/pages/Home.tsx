import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";
import visionEngineIcon from "@assets/generated_images/3d_ai_eye_no_background.png";
import matchLogicIcon from "@assets/generated_images/3d_network_pins_no_background.png";
import securePayIcon from "@assets/generated_images/3d_secure_card_no_background.png";
import trustShieldIcon from "@assets/generated_images/3d_trust_shield_no_background.png";

// ---- Types ----
interface GoogleReview {
  authorName: string;
  rating: number;
  text: string;
  relativeTime: string;
  profilePhoto: string | null;
}
interface GoogleReviewsData {
  rating: number;
  totalRatings: number;
  mapsUrl: string;
  reviews: GoogleReview[];
}

// ---- Star helper ----
function Stars({ count, size = "sm" }: { count: number; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "w-6 h-6" : size === "md" ? "w-5 h-5" : "w-4 h-4";
  return (
    <div className="flex gap-0.5">
      {[...Array(5)].map((_, i) => (
        <svg key={i} className={`${cls} ${i < count ? "fill-yellow-400 text-yellow-400" : "fill-muted-foreground/20 text-muted-foreground/20"}`} viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// ---- Google Reviews Section component ----
function GoogleReviewsSection() {
  const { data, isLoading, isError } = useQuery<GoogleReviewsData>({
    queryKey: ["/api/google-reviews"],
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const mapsUrl = data?.mapsUrl ?? "https://www.google.com/maps/search/LervIT+Calgary";
  const rating = data?.rating ?? null;
  const reviews = data?.reviews ?? [];
  const totalRatings = data?.totalRatings ?? 0;

  return (
    <section className="relative py-20 md:py-28 overflow-hidden bg-gray-950 dark:bg-gray-950">
      {/* Subtle radial glow in background */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Two-column layout on desktop ── */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-12 lg:gap-20">

          {/* ── LEFT: Rating panel ── */}
          <div className="lg:w-64 lg:flex-shrink-0">
            {/* Google badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-white/70 mb-6">
              <SiGoogle className="w-3.5 h-3.5 text-[#4285F4]" />
              Google Reviews
            </div>

            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Loved by Calgary customers
            </h2>

            {/* Big rating */}
            {isLoading ? (
              <div className="flex flex-col gap-3 mb-6">
                <Skeleton className="h-16 w-24 bg-white/10" />
                <Skeleton className="h-5 w-32 bg-white/10" />
                <Skeleton className="h-4 w-40 bg-white/10" />
              </div>
            ) : (
              <div className="mb-8">
                <div className="flex items-end gap-3 mb-2">
                  <span className="text-7xl font-bold tabular-nums leading-none text-white">
                    {rating !== null ? rating.toFixed(1) : "—"}
                  </span>
                </div>
                <Stars count={Math.round(rating ?? 5)} size="lg" />
                <p className="text-sm text-white/50 mt-2">
                  {totalRatings > 0 ? `${totalRatings} verified reviews` : "Verified reviews"} · Google
                </p>
              </div>
            )}

            {/* CTAs */}
            <div className="flex flex-col gap-3">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" data-testid="link-google-reviews-cta">
                <Button className="w-full gap-2 bg-white text-gray-900 hover:bg-white/90">
                  <SiGoogle className="w-4 h-4 text-[#4285F4]" />
                  See all reviews
                </Button>
              </a>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" data-testid="link-google-write-review">
                <Button variant="outline" className="w-full gap-2 border-white/20 text-white/80 hover:text-white hover:border-white/40 bg-transparent">
                  Write a review
                </Button>
              </a>
            </div>
          </div>

          {/* ── RIGHT: Review cards ── */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              /* Skeleton */
              <div className="flex gap-4 overflow-hidden">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex-shrink-0 w-[85vw] sm:w-80 lg:w-auto lg:flex-1 rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col gap-4">
                    <Skeleton className="h-4 w-24 bg-white/10" />
                    <Skeleton className="h-20 w-full bg-white/10" />
                    <div className="flex items-center gap-3 mt-auto">
                      <Skeleton className="w-10 h-10 rounded-full bg-white/10" />
                      <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3 w-24 bg-white/10" />
                        <Skeleton className="h-3 w-16 bg-white/10" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : isError || reviews.length === 0 ? (
              <div className="flex items-center justify-center h-48 rounded-2xl border border-white/10 bg-white/5">
                <p className="text-white/40 text-sm text-center px-6">
                  {isError ? "Could not load reviews right now." : "No reviews yet — be the first on Google!"}
                </p>
              </div>
            ) : (
              /* Mobile: horizontal scroll carousel · Desktop: stacked column */
              <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory
                              [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                              lg:grid lg:grid-cols-1 lg:overflow-visible lg:pb-0 lg:gap-4">
                {reviews.slice(0, 3).map((review, i) => (
                  <div
                    key={i}
                    data-testid={`card-review-${i}`}
                    className="group relative flex-shrink-0 snap-center
                               w-[85vw] sm:w-[360px]
                               lg:w-auto lg:flex-shrink lg:snap-none
                               rounded-2xl border border-white/10 bg-white/[0.04]
                               hover:bg-white/[0.07] hover:border-white/20
                               transition-all duration-300 p-6 flex flex-col gap-4"
                  >
                    {/* Decorative quote mark */}
                    <span className="absolute top-4 right-5 text-6xl font-serif text-white/5 leading-none select-none">"</span>

                    {/* Stars */}
                    <Stars count={review.rating} size="sm" />

                    {/* Review text */}
                    <p className="text-white/80 text-sm leading-relaxed flex-1">
                      "{review.text}"
                    </p>

                    {/* Reviewer row */}
                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10 mt-auto">
                      <div className="flex items-center gap-3">
                        {review.profilePhoto ? (
                          <img
                            src={review.profilePhoto}
                            alt={review.authorName}
                            className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-1 ring-white/20"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 ring-1 ring-white/20">
                            <span className="text-sm font-bold text-primary">
                              {review.authorName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-sm text-white/90">{review.authorName}</div>
                          <div className="text-xs text-white/40">{review.relativeTime}</div>
                        </div>
                      </div>
                      <SiGoogle className="w-4 h-4 text-[#4285F4] flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Mobile swipe hint */}
            {!isLoading && reviews.length > 1 && (
              <p className="text-center text-white/30 text-xs mt-4 lg:hidden">
                Swipe to see more
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

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
      <GoogleReviewsSection />

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
