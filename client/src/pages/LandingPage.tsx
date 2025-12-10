import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Camera,
  Cpu,
  MapPin,
  Shield,
  CreditCard,
  Clock,
  Truck,
  Star,
  ChevronRight,
  CheckCircle2,
  Zap,
  Target,
  Users,
  TrendingUp,
  Phone,
  Mail,
  ArrowRight,
  Package,
  Eye,
  Brain,
  Sparkles,
  Menu,
  X,
  Calendar,
} from "lucide-react";
import { SiLinkedin, SiX, SiInstagram, SiFacebook } from "react-icons/si";
import heroImage from "@assets/generated_images/calgary_mover_loading_furniture.png";

export default function LandingPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Truck className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">LervIT</span>
            </div>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                How It Works
              </a>
              <a href="#ai-technology" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                AI Technology
              </a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Pricing
              </a>
              <a href="#for-movers" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                For Movers
              </a>
            </div>
            
            {/* Desktop Auth Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" size="sm" data-testid="button-login">
                  Log In
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" data-testid="button-get-started">
                  Get Started
                </Button>
              </Link>
            </div>
            
            {/* Mobile: Book a Move CTA + Hamburger */}
            <div className="flex md:hidden items-center gap-2">
              <Link href="/request-move">
                <Button size="sm" data-testid="button-mobile-book">
                  Book a Move
                </Button>
              </Link>
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-mobile-menu" aria-label="Open navigation menu">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                        <Truck className="w-4 h-4 text-primary-foreground" />
                      </div>
                      LervIT
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-8 space-y-6">
                    <div className="space-y-4">
                      <a 
                        href="#how-it-works" 
                        className="block text-lg font-medium hover:text-primary transition-colors"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        How It Works
                      </a>
                      <a 
                        href="#ai-technology" 
                        className="block text-lg font-medium hover:text-primary transition-colors"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        AI Technology
                      </a>
                      <a 
                        href="#pricing" 
                        className="block text-lg font-medium hover:text-primary transition-colors"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Pricing
                      </a>
                      <a 
                        href="#for-movers" 
                        className="block text-lg font-medium hover:text-primary transition-colors"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        For Movers
                      </a>
                    </div>
                    <div className="border-t pt-6 space-y-3">
                      <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                        <Button variant="outline" className="w-full">
                          Log In
                        </Button>
                      </Link>
                      <Link href="/signup" onClick={() => setMobileMenuOpen(false)}>
                        <Button className="w-full">
                          Get Started
                        </Button>
                      </Link>
                    </div>
                    <div className="border-t pt-6">
                      <p className="text-sm text-muted-foreground mb-2">Join 500+ Calgary movers</p>
                      <Link href="/signup?role=mover" onClick={() => setMobileMenuOpen(false)}>
                        <Button variant="secondary" className="w-full gap-2">
                          <Truck className="w-4 h-4" /> Become a Mover
                        </Button>
                      </Link>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
        {/* Background Image - All Breakpoints */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Gradient overlay for text readability - stronger on mobile */}
          <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/90 to-background/80 lg:bg-gradient-to-r lg:from-background lg:via-background/95 lg:to-background/40" />
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          {/* Asymmetric Layout: 60% content, 40% form */}
          <div className="grid lg:grid-cols-5 gap-12 items-center">
            {/* Left Content - 60% on desktop */}
            <div className="lg:col-span-3 text-center lg:text-left">
              <Badge className="mb-6 px-4 py-2" variant="secondary">
                <Sparkles className="w-4 h-4 mr-2" />
                AI-Powered Moving Platform
              </Badge>
              <h1 className="mb-6 leading-tight">
                Moving Made <span className="text-primary">Intelligent</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0">
                Just snap a photo of your items. Our AI identifies everything, calculates exact dimensions, 
                and connects you with verified movers nearby. No guesswork, no surprises.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link href="/request-move">
                  <Button size="lg" className="w-full sm:w-auto gap-2" data-testid="button-book-move">
                    Book a Move <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <a href="#ai-technology">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2" data-testid="button-see-ai">
                    See AI in Action <Eye className="w-5 h-5" />
                  </Button>
                </a>
              </div>
              <div className="flex items-center justify-center lg:justify-start gap-8 mt-10">
                <div className="text-center">
                  <div className="text-2xl font-bold">500+</div>
                  <div className="text-sm text-muted-foreground">Moves Completed</div>
                </div>
                <div className="w-px h-10 bg-border" />
                <div className="text-center">
                  <div className="text-2xl font-bold">50+</div>
                  <div className="text-sm text-muted-foreground">Verified Movers</div>
                </div>
                <div className="w-px h-10 bg-border" />
                <div className="text-center">
                  <div className="flex items-center gap-1 text-2xl font-bold">
                    4.9 <Star className="w-5 h-5 fill-yellow-500 text-yellow-500" />
                  </div>
                  <div className="text-sm text-muted-foreground">Average Rating</div>
                </div>
              </div>
            </div>
            
            {/* Hero Right - Quick Booking Form - 40% on desktop */}
            <div className="lg:col-span-2 relative">
              {/* Quick Booking Form Card */}
              <div className="relative bg-card rounded-2xl border shadow-xl p-6 md:p-8">
                <div className="absolute -top-3 -right-3">
                  <Badge className="bg-primary text-primary-foreground px-3 py-1">
                    <Zap className="w-3 h-3 mr-1" /> Get Instant Quote
                  </Badge>
                </div>
                
                <h3 className="text-xl font-semibold mb-6">Book Your Move</h3>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="pickup" className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" /> Pickup Location
                    </Label>
                    <Input 
                      id="pickup"
                      placeholder="Enter pickup address in Calgary"
                      className="h-12"
                      data-testid="input-hero-pickup"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="dropoff" className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-destructive" /> Dropoff Location
                    </Label>
                    <Input 
                      id="dropoff"
                      placeholder="Enter dropoff address"
                      className="h-12"
                      data-testid="input-hero-dropoff"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="date" className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" /> Moving Date
                    </Label>
                    <Input 
                      id="date"
                      type="date"
                      className="h-12"
                      data-testid="input-hero-date"
                    />
                  </div>
                  
                  <Link href="/request-move">
                    <Button size="lg" className="w-full gap-2 mt-2" data-testid="button-hero-get-price">
                      Get Price <ArrowRight className="w-5 h-5" />
                    </Button>
                  </Link>
                </div>
                
                {/* AI Feature Highlight */}
                <div className="mt-6 pt-4 border-t">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Camera className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">AI Photo Detection</div>
                      <div className="text-xs text-muted-foreground">Upload photos for exact pricing</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Floating Elements */}
              <div className="absolute -bottom-4 -left-4 bg-card rounded-xl border shadow-lg p-4 hidden md:block">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">98% AI Accuracy</div>
                    <div className="text-xs text-muted-foreground">Precise Quotes</div>
                  </div>
                </div>
              </div>
              
              {/* Floating Mover Badge */}
              <div className="absolute -top-2 -left-2 bg-card rounded-xl border shadow-lg p-3 hidden lg:block">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-xs font-bold">JD</div>
                    <div className="w-8 h-8 rounded-full bg-accent/20 border-2 border-background flex items-center justify-center text-xs font-bold">MK</div>
                    <div className="w-8 h-8 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-xs font-bold">+8</div>
                  </div>
                  <div className="text-xs">
                    <div className="font-medium">10 movers</div>
                    <div className="text-muted-foreground">near you</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted By Section */}
      <section className="py-12 border-y bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
              Trusted by Calgary's Best
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 opacity-60">
            <div className="text-2xl font-bold text-muted-foreground">RBC</div>
            <div className="text-2xl font-bold text-muted-foreground">SAIT</div>
            <div className="text-2xl font-bold text-muted-foreground">U of C</div>
            <div className="text-2xl font-bold text-muted-foreground">Telus</div>
            <div className="text-2xl font-bold text-muted-foreground">Shaw</div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4" variant="secondary">Simple Process</Badge>
            <h2 className="mb-4">How LervIT Works</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Book your move in minutes, not hours. Our AI handles the hard work.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                step: "01",
                icon: Camera,
                title: "Snap Photos",
                description: "Take photos of items you need moved. Our AI identifies everything automatically.",
              },
              {
                step: "02",
                icon: Cpu,
                title: "AI Analysis",
                description: "Get instant size estimates, weight calculations, and vehicle recommendations.",
              },
              {
                step: "03",
                icon: CreditCard,
                title: "Pay Securely",
                description: "Review your quote and pay online with SecurePay™. Your payment is held until move completion.",
              },
              {
                step: "04",
                icon: Truck,
                title: "Match & Track",
                description: "We instantly match you with nearby verified movers. Track them live on GPS until delivery.",
              },
            ].map((item, index) => (
              <div
                key={index}
                className="relative group"
                onMouseEnter={() => setActiveStep(index)}
              >
                {index < 3 && (
                  <div className="hidden md:block absolute top-12 left-full w-full h-px bg-border z-0" />
                )}
                <Card className={`relative z-10 h-full transition-all duration-300 ${activeStep === index ? 'border-primary shadow-lg' : ''}`}>
                  <CardContent className="pt-8 pb-6 px-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${activeStep === index ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        <item.icon className="w-6 h-6" />
                      </div>
                      <span className="text-3xl font-bold text-muted-foreground/30">{item.step}</span>
                    </div>
                    <h3 className="mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Technology Showcase */}
      <section id="ai-technology" className="py-20 md:py-32 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <Badge className="mb-4" variant="secondary">
                <Brain className="w-3 h-3 mr-1" /> Advanced AI
              </Badge>
              <h2 className="mb-6">AI-Powered Item Detection</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Our proprietary computer vision AI identifies furniture, appliances, and household items 
                from a single photo. No more guessing load sizes or getting surprise fees.
              </p>
              
              <div className="space-y-6">
                {[
                  {
                    icon: Eye,
                    title: "Visual Recognition",
                    description: "Identifies 1000+ item types including furniture, electronics, and appliances",
                  },
                  {
                    icon: Target,
                    title: "Precise Measurements",
                    description: "Calculates dimensions and weight using real product specifications from manufacturers",
                  },
                  {
                    icon: Truck,
                    title: "Smart Recommendations",
                    description: "Automatically suggests vehicle type and number of movers needed",
                  },
                  {
                    icon: CreditCard,
                    title: "Accurate Pricing",
                    description: "Generates exact quotes based on actual item data - what you see is what you pay",
                  },
                ].map((feature, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">{feature.title}</h4>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="bg-card rounded-2xl border shadow-xl overflow-hidden">
                {/* AI Process Visualization */}
                <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-8">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-card/80 backdrop-blur rounded-lg p-4 border">
                      <div className="flex items-center gap-2 text-sm mb-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="font-medium">Processing Image...</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full w-full bg-primary rounded-full animate-pulse" />
                      </div>
                    </div>
                    
                    <div className="bg-card/80 backdrop-blur rounded-lg p-4 border">
                      <code className="text-xs text-muted-foreground block mb-2">// AI Output</code>
                      <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto">
{`{
  "item_name": "IKEA KIVIK Sofa",
  "category": "Furniture",
  "weight_kg": 48,
  "dimensions": {
    "L": 228, "W": 95, "H": 83
  },
  "volume_cuft": 65.2,
  "vehicle_type": "Large Van",
  "movers_needed": 2,
  "handling": "Standard"
}`}
                      </pre>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Detection Confidence</div>
                      <div className="text-2xl font-bold text-primary">98.5%</div>
                    </div>
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Verified
                    </Badge>
                  </div>
                </div>
              </div>
              
              {/* Stats Floating Card */}
              <div className="absolute -bottom-6 -right-6 bg-card rounded-xl border shadow-lg p-5 hidden lg:block">
                <div className="text-3xl font-bold text-primary mb-1">10,000+</div>
                <div className="text-sm text-muted-foreground">Items Analyzed</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4" variant="secondary">Why Choose Us</Badge>
            <h2 className="mb-4">Built for Modern Moving</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Every feature designed to make your move stress-free and transparent.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: "AI-Powered Quotes",
                description: "No more guessing. Get accurate pricing based on actual item specifications and dimensions.",
                highlight: true,
              },
              {
                icon: MapPin,
                title: "GPS Tracking",
                description: "Track your mover in real-time with live location updates and ETA.",
              },
              {
                icon: Shield,
                title: "Verified Movers",
                description: "Every mover is background-checked, licensed, and insured for your peace of mind.",
              },
              {
                icon: CreditCard,
                title: "Secure Payments",
                description: "Pay online with Stripe. Your payment is protected until the job is complete.",
              },
              {
                icon: Clock,
                title: "Instant Matching",
                description: "Our algorithm matches you with the nearest available movers within minutes.",
              },
              {
                icon: Star,
                title: "Rated & Reviewed",
                description: "Choose movers based on real customer reviews and ratings.",
              },
            ].map((feature, index) => (
              <Card key={index} className={`hover-elevate ${feature.highlight ? 'border-primary' : ''}`}>
                <CardContent className="pt-8 pb-6 px-6">
                  <div className={`w-12 h-12 rounded-xl mb-4 flex items-center justify-center ${feature.highlight ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 md:py-32 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4" variant="secondary">Transparent Pricing</Badge>
            <h2 className="mb-4">No Hidden Fees, Ever</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our AI calculates exact pricing based on your items. What you see is what you pay.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                name: "Boxes",
                volume: "Up to 10 ft³",
                description: "Small items, boxes, bags",
                starting: "$49",
                icon: "📦",
              },
              {
                name: "Medium",
                volume: "11-50 ft³",
                description: "Small furniture, appliances",
                starting: "$89",
                icon: "🪑",
              },
              {
                name: "Large",
                volume: "50-170 ft³",
                description: "Full room, large furniture",
                starting: "$159",
                popular: true,
                icon: "🛋️",
              },
              {
                name: "Apartment",
                volume: "170+ ft³",
                description: "Full apartment moves",
                starting: "$299",
                icon: "🏠",
              },
            ].map((tier, index) => (
              <Card key={index} className={`relative ${tier.popular ? 'border-primary shadow-lg' : ''}`}>
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                  </div>
                )}
                <CardContent className="pt-8 pb-6 px-6 text-center">
                  <div className="text-4xl mb-4">{tier.icon}</div>
                  <h3 className="mb-1">{tier.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{tier.volume}</p>
                  <div className="mb-4">
                    <span className="text-3xl font-bold">{tier.starting}</span>
                    <span className="text-sm text-muted-foreground"> CAD</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-6">{tier.description}</p>
                  <Link href="/request-move">
                    <Button className="w-full" variant={tier.popular ? "default" : "outline"}>
                      Get Quote
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              Final pricing includes: Base fare + Distance ($/km) + Load size + Time of day adjustments
            </p>
          </div>
        </div>
      </section>

      {/* For Movers Section */}
      <section id="for-movers" className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1">
              <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-8 md:p-12 text-primary-foreground">
                <h3 className="text-3xl font-bold mb-6">Earn on Your Schedule</h3>
                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                    <span>Choose your own hours - work when you want</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                    <span>Weekly direct deposits to your bank account</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                    <span>Pick jobs near you - no long drives</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                    <span>Keep 85% of every job - transparent pay</span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="/signup?role=mover">
                    <Button size="lg" variant="secondary" className="w-full sm:w-auto gap-2" data-testid="button-become-mover">
                      Become a Mover <ArrowRight className="w-5 h-5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
            
            <div className="order-1 lg:order-2">
              <Badge className="mb-4" variant="secondary">
                <Users className="w-3 h-3 mr-1" /> Join Our Team
              </Badge>
              <h2 className="mb-6">Drive & Earn with LervIT</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Turn your truck or van into a money-making machine. Join Calgary's fastest-growing 
                moving platform and start earning today.
              </p>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center p-6 bg-muted/50 rounded-xl">
                  <div className="text-3xl font-bold text-primary mb-2">$25-40</div>
                  <div className="text-sm text-muted-foreground">Per Hour Average</div>
                </div>
                <div className="text-center p-6 bg-muted/50 rounded-xl">
                  <div className="text-3xl font-bold text-primary mb-2">$2,000+</div>
                  <div className="text-sm text-muted-foreground">Weekly Top Earner</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 md:py-32 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4" variant="secondary">Testimonials</Badge>
            <h2 className="mb-4">What Our Customers Say</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Sarah M.",
                role: "Customer",
                content: "The AI photo feature is incredible! I just took pictures of my stuff and it gave me an exact quote. No more back-and-forth calls with moving companies.",
                rating: 5,
              },
              {
                name: "James T.",
                role: "Customer",
                content: "Moved my entire apartment in 3 hours. The GPS tracking was great - I knew exactly when my mover would arrive. Will definitely use again!",
                rating: 5,
              },
              {
                name: "Mike R.",
                role: "Mover Partner",
                content: "I've been driving for LervIT for 6 months now. The app makes it easy to pick up jobs, and I love the flexibility. Great way to earn extra income.",
                rating: 5,
              },
            ].map((testimonial, index) => (
              <Card key={index}>
                <CardContent className="pt-6 pb-6 px-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                    ))}
                  </div>
                  <p className="text-sm mb-6">&ldquo;{testimonial.content}&rdquo;</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">
                        {testimonial.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-sm">{testimonial.name}</div>
                      <div className="text-xs text-muted-foreground">{testimonial.role}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 md:py-32">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4" variant="secondary">FAQ</Badge>
            <h2 className="mb-4">Frequently Asked Questions</h2>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {[
              {
                question: "How does the AI photo detection work?",
                answer: "Simply take a photo of the items you want to move. Our AI uses computer vision to identify each item, then looks up real manufacturer specifications to determine exact dimensions and weight. This allows us to give you an accurate quote without any guesswork.",
              },
              {
                question: "How do you verify movers?",
                answer: "Every mover on our platform goes through a comprehensive verification process including background checks, driver's license verification, vehicle inspection, and insurance confirmation. We also require a minimum rating to stay on the platform.",
              },
              {
                question: "What payment methods do you accept?",
                answer: "We accept all major credit and debit cards through our secure Stripe payment system. Payment is processed before the move begins, and your funds are protected until the job is completed satisfactorily.",
              },
              {
                question: "What if something gets damaged during the move?",
                answer: "All moves are covered by our standard liability protection. For high-value items, we offer additional insurance options. You can report any issues through the app, and our support team will help resolve them promptly.",
              },
              {
                question: "How quickly can I book a move?",
                answer: "You can book a move as quickly as 2 hours in advance, subject to mover availability. For same-day moves, we recommend booking at least 3-4 hours ahead. Most customers receive mover matches within 5-10 minutes of booking.",
              },
              {
                question: "Do you serve areas outside Calgary?",
                answer: "Currently, we operate within Calgary and surrounding areas (up to 50km from downtown). We're expanding to Edmonton and other Alberta cities soon. Sign up for updates!",
              },
            ].map((item, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Move Smarter?
          </h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Join thousands of Calgarians who've discovered the smarter way to move. 
            Get your AI-powered quote in under 2 minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/request-move">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto gap-2" data-testid="button-cta-book">
                Book a Move Now <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/signup?role=mover">
              <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2 bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-cta-drive">
                Drive with LervIT <Truck className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                  <Truck className="w-6 h-6 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold">LervIT</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Calgary's smartest moving platform. AI-powered quotes, verified movers, transparent pricing.
              </p>
              <div className="flex gap-4">
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                  <SiX className="w-5 h-5" />
                </a>
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                  <SiFacebook className="w-5 h-5" />
                </a>
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                  <SiInstagram className="w-5 h-5" />
                </a>
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                  <SiLinkedin className="w-5 h-5" />
                </a>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Press</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/support" className="hover:text-foreground transition-colors">Help Center</Link></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Safety</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  support@lervit.com
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  (403) 555-LERV
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Calgary, Alberta
                </li>
              </ul>
            </div>
          </div>
          
          <div className="border-t pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} LervIT Inc. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="gap-1">
                <Shield className="w-3 h-3" /> Stripe Secured
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="w-3 h-3" /> Verified Platform
              </Badge>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
