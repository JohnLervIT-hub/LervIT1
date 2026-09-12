import { memo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calculator, TrendingUp, Zap, Package, MapPin, Truck, Sparkles, Gift, Tag, X, Loader2, CheckCircle2, CheckCircle, Lock, User, Phone, Mail, Shield, Star, ArrowRight, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { PriceBreakdown } from "@shared/pricing";
import { PRICING_CONFIG } from "@shared/pricing";
import { useAuth } from "@/contexts/AuthContext";

export interface CapturedContact {
  name: string;
  phone: string;
  email: string;
}

interface PromoState {
  code: string;
  valid: boolean;
  discountPercent: number;
  usesRemaining: number;
  message: string;
}

interface PricingSummaryProps {
  breakdown: PriceBreakdown | null;
  isCalculating?: boolean;
  error?: string | null;
  className?: string;
  showPromoInput?: boolean;
  appliedPromo?: PromoState | null;
  onPromoApplied?: (promo: PromoState | null) => void;
  onContactCapture?: (contact: CapturedContact) => void | Promise<void>;
  contactCaptured?: boolean;
  isLoggedIn?: boolean;
}

export const PricingSummary = memo(function PricingSummary({ breakdown, isCalculating, error, className, showPromoInput = false, appliedPromo, onPromoApplied, onContactCapture, contactCaptured = false, isLoggedIn = false }: PricingSummaryProps) {
  const { user } = useAuth();
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const handleApplyPromo = useCallback(async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError(null);
    try {
      const res = await apiRequest("POST", "/api/promo/validate", { code: promoInput.trim() });
      const data = await res.json();
      if (data.valid) {
        onPromoApplied?.({
          code: data.code,
          valid: true,
          discountPercent: data.discountPercent,
          usesRemaining: data.usesRemaining,
          message: data.message,
        });
        setPromoInput("");
      } else {
        setPromoError(data.message || "Invalid promo code");
      }
    } catch {
      setPromoError("Failed to validate promo code");
    } finally {
      setPromoLoading(false);
    }
  }, [promoInput, onPromoApplied]);

  const handleRemovePromo = useCallback(() => {
    onPromoApplied?.(null);
    setPromoError(null);
  }, [onPromoApplied]);

  if (error) {
    return (
      <Card className={`${className} border-destructive/30`} data-testid="pricing-error">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Price Estimate</h3>
              <p className="text-xs text-destructive">{error}</p>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (isCalculating || !breakdown) {
    return (
      <Card className={className} data-testid="pricing-loading">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
              <Calculator className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base">Calculating...</h3>
              <p className="text-xs text-muted-foreground">Updating your estimate</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
          <Separator className="my-3" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const loadSizeLabel = breakdown.rawVolume > 0
    ? `Load (${breakdown.rawVolume.toFixed(0)} ft³ × $${PRICING_CONFIG.volumeRate.toFixed(2)})`
    : "Load";

  const distanceLabel = breakdown.distanceKm
    ? `Distance (${breakdown.distanceKm} km)`
    : "Distance";

  type FeeRow = {
    label: string;
    amount: number;
    testId: string;
    icon: typeof Zap;
    show: boolean;
    premium?: boolean;
  };

  const staticFees: FeeRow[] = [
    {
      label: `Base Fee (Class ${breakdown.vehicleClass})`,
      amount: breakdown.baseFee,
      testId: "fee-base",
      icon: Zap,
      show: true,
    },
    {
      label: distanceLabel,
      amount: breakdown.distanceFee,
      testId: "fee-distance",
      icon: MapPin,
      show: true,
    },
    {
      label: loadSizeLabel,
      amount: breakdown.loadFee,
      testId: "fee-loadsize",
      icon: Package,
      show: true,
    },
    {
      label: "Pickup Access",
      amount: breakdown.pickupDifficultyFee,
      testId: "fee-pickup",
      icon: TrendingUp,
      show: breakdown.pickupDifficultyFee > 0,
    },
    {
      label: "Dropoff Access",
      amount: breakdown.dropoffDifficultyFee,
      testId: "fee-dropoff",
      icon: TrendingUp,
      show: breakdown.dropoffDifficultyFee > 0,
    },
  ];

  const itemPremiumFees: FeeRow[] = breakdown.itemPremiums.length > 0
    ? breakdown.itemPremiums.map((p, idx) => ({
        label: `${p.name} (special item)`,
        amount: p.fee,
        testId: `fee-item-premium-${idx}`,
        icon: AlertCircle,
        show: true,
        premium: true,
      }))
    : breakdown.premiumFee > 0
      ? [{
          label: "Item Premium",
          amount: breakdown.premiumFee,
          testId: "fee-item-premiums",
          icon: AlertCircle,
          show: true,
          premium: true,
        }]
      : [];

  const visibleFees = [...staticFees, ...itemPremiumFees].filter(item => item.show);
  const hasTwoMovers = breakdown.moverAddition > 0;
  const hasPromo = appliedPromo?.valid;
  const discountMultiplier = hasPromo ? (1 - appliedPromo.discountPercent / 100) : 1;
  const discountedTotal = breakdown.total * discountMultiplier;

  const shouldGate = !contactCaptured && !isLoggedIn && breakdown.total > 0 && !!onContactCapture;

  return (
    <Card className={`${className} overflow-hidden`} data-testid="pricing-summary">
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
              <Calculator className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Live Price Estimate</h3>
              <p className="text-xs text-muted-foreground">Updates as you fill the form</p>
            </div>
          </div>
        </CardHeader>
      </div>

      <CardContent className="pt-0 space-y-4">
        <div className={cn("relative", shouldGate && "min-h-[440px]")}>
        <div className={cn(
          "space-y-4 transition-all duration-500",
          shouldGate && "blur-sm pointer-events-none select-none opacity-60"
        )}>
        <div className="space-y-2">
          {visibleFees.map((item) => (
            <div
              key={item.testId}
              className="flex items-center justify-between py-1.5 group"
              data-testid={item.testId}
            >
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center transition-colors",
                  item.premium
                    ? "bg-amber-500/10"
                    : "bg-muted/50 group-hover:bg-muted",
                )}>
                  <item.icon className={cn(
                    "w-3 h-3",
                    item.premium ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                  )} />
                </div>
                <span className={cn(
                  "text-sm",
                  item.premium ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                )}>
                  {item.label}
                </span>
              </div>
              <span className={cn(
                "text-sm font-medium tabular-nums",
                item.premium && "text-amber-600 dark:text-amber-400",
              )}>
                {item.premium ? "+" : ""}${item.amount.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex items-center justify-between" data-testid="pricing-subtotal">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="text-sm font-medium tabular-nums">${breakdown.subtotal.toFixed(2)}</span>
        </div>

        {hasTwoMovers && (
          <div className="flex items-center justify-between py-2 px-3 bg-primary/5 rounded-lg border border-primary/10" data-testid="fee-movers-note">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-3 h-3 text-primary" />
              </div>
              <span className="text-sm text-primary font-medium">2 Movers (+30%)</span>
            </div>
            <span className="text-sm font-semibold text-primary tabular-nums">${breakdown.moverAddition.toFixed(2)}</span>
          </div>
        )}

        {hasPromo && (
          <div className="flex items-center justify-between py-2 px-3 bg-green-500/10 rounded-lg border border-green-500/20" data-testid="fee-promo-discount">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-green-500/20 flex items-center justify-center">
                <Tag className="w-3 h-3 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-sm text-green-600 dark:text-green-400 font-medium">Promo: {appliedPromo.code}</span>
              <Badge variant="default" className="bg-green-500 text-white text-[10px]">
                <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                SAVE
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-green-600 dark:text-green-400">-{appliedPromo.discountPercent}%</span>
              <button 
                onClick={handleRemovePromo} 
                className="text-muted-foreground hover:text-destructive transition-colors"
                data-testid="button-remove-promo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {showPromoInput && !hasPromo && (
          <div className="space-y-2" data-testid="promo-input-section">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Enter promo code"
                  value={promoInput}
                  onChange={(e) => {
                    setPromoInput(e.target.value.toUpperCase());
                    setPromoError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                  className="pl-8 text-sm"
                  data-testid="input-promo-code"
                />
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleApplyPromo}
                disabled={!promoInput.trim() || promoLoading}
                data-testid="button-apply-promo"
              >
                {promoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply"}
              </Button>
            </div>
            {promoError && (
              <p className="text-xs text-destructive pl-1" data-testid="text-promo-error">{promoError}</p>
            )}
          </div>
        )}

        <Separator />

        <div 
          className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/80 rounded-xl p-4 text-primary-foreground"
          data-testid="pricing-total"
        >
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-xs text-primary-foreground/80 mb-1">
                {hasPromo ? "Estimated (With Promo)" : "Estimated Total"}
              </p>
              <div className="flex items-baseline gap-1 flex-wrap">
                {hasPromo ? (
                  <>
                    <span className="text-lg line-through text-primary-foreground/50 mr-1">
                      ${breakdown.total.toFixed(2)}
                    </span>
                    <span className="text-3xl font-bold tracking-tight">
                      ${discountedTotal.toFixed(2)}
                    </span>
                  </>
                ) : (
                  <span className="text-3xl font-bold tracking-tight">
                    ${breakdown.total.toFixed(2)}
                  </span>
                )}
                <span className="text-sm font-medium text-primary-foreground/80">CAD</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              {hasPromo ? <Gift className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
            </div>
          </div>
        </div>
        </div>
        {shouldGate && onContactCapture && (
          <div className="absolute inset-0 flex items-center justify-center">
            <LeadCaptureOverlay onSubmit={onContactCapture} totalCost={breakdown.total} />
          </div>
        )}
        </div>

        {hasPromo && (
          <div className="flex items-center gap-1.5 justify-center">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            <p className="text-[11px] text-green-600 dark:text-green-400 font-medium">
              You save ${(breakdown.total - discountedTotal).toFixed(2)} with promo code {appliedPromo.code}
            </p>
          </div>
        )}

        {!user && !hasPromo && (
          <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-3" data-testid="promo-nudge-banner">
            <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <Lock className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400 leading-tight">
                Save 10% on this move
              </p>
              <p className="text-xs text-green-700/70 dark:text-green-500 mt-0.5 leading-relaxed">
                Sign in or create a free account and apply code{" "}
                <span className="font-semibold text-green-700 dark:text-green-400">LERVIT10</span>{" "}
                at checkout — valid on your first Move.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <a
                  href="/login"
                  className="text-xs font-semibold text-green-700 dark:text-green-400 underline underline-offset-2 hover:opacity-80"
                  data-testid="link-promo-signin"
                >
                  Sign in
                </a>
                <span className="text-xs text-green-700/40 dark:text-green-500/40">·</span>
                <a
                  href="/signup"
                  className="text-xs font-semibold text-green-700 dark:text-green-400 underline underline-offset-2 hover:opacity-80"
                  data-testid="link-promo-signup"
                >
                  Create account
                </a>
              </div>
            </div>
          </div>
        )}

        <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
          Final price confirmed at checkout. Travel fee calculated based on mover distance to pickup.
        </p>
      </CardContent>
    </Card>
  );
});

function LeadCaptureOverlay({
  onSubmit,
  totalCost,
}: {
  onSubmit: (contact: CapturedContact) => void | Promise<void>;
  totalCost: number;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const nameValid = name.trim().length > 1;
  const phoneValid = phone.trim().length >= 10;
  const emailValid = email.includes('@') && email.includes('.');
  const isValid = nameValid && (phoneValid || emailValid);

  const handleSubmit = useCallback(async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      setShowSuccess(true);
      await new Promise(resolve => setTimeout(resolve, 800));
      await onSubmit({ name: name.trim(), phone: phone.trim(), email: email.trim() });
    } finally {
      setIsSubmitting(false);
    }
  }, [isValid, isSubmitting, name, phone, email, onSubmit]);

  if (showSuccess) {
    return (
      <div
        className="w-full bg-background/95 backdrop-blur-md rounded-xl border shadow-xl p-6 mx-2 text-center animate-in fade-in duration-300"
        data-testid="lead-capture-success"
      >
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-500/20 mb-2">
          <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
        </div>
        <p className="font-semibold text-sm">Your price is unlocked!</p>
      </div>
    );
  }

  return (
    <div
      className="w-full bg-background/95 backdrop-blur-md rounded-xl border shadow-xl p-5 mx-2 animate-in fade-in slide-in-from-bottom-2 duration-300"
      data-testid="lead-capture-overlay"
    >
      <div className="text-center mb-4">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-2">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <h3 className="font-semibold text-sm">Your price is ready</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Enter your details to unlock your instant quote
        </p>
      </div>

      <div className="bg-primary/5 rounded-lg px-4 py-2.5 mb-4 text-center">
        <p className="text-xs text-muted-foreground">Estimated Total</p>
        <p className="text-2xl font-bold tracking-tight filter blur-sm select-none">
          ${totalCost.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground">CAD</p>
      </div>

      <div className="space-y-2.5">
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-all duration-200",
            focused === 'name' ? "border-primary ring-1 ring-primary/20" : "border-border"
          )}
        >
          <User className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={e => setName(e.target.value)}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
            autoComplete="name"
            data-testid="input-capture-name"
          />
          {nameValid && (
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0 animate-in fade-in duration-200" />
          )}
        </div>

        <div
          className={cn(
            "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-all duration-200",
            focused === 'phone' ? "border-primary ring-1 ring-primary/20" : "border-border"
          )}
        >
          <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="tel"
            placeholder="Phone number (403, 587, 825)"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/[^\d\s\-\(\)\+]/g, ''))}
            onFocus={() => setFocused('phone')}
            onBlur={() => setFocused(null)}
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
            autoComplete="tel"
            data-testid="input-capture-phone"
          />
          {phoneValid && (
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0 animate-in fade-in duration-200" />
          )}
        </div>

        <div
          className={cn(
            "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-all duration-200",
            focused === 'email' ? "border-primary ring-1 ring-primary/20" : "border-border"
          )}
        >
          <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
            autoComplete="email"
            data-testid="input-capture-email"
          />
          {emailValid && (
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0 animate-in fade-in duration-200" />
          )}
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!isValid || isSubmitting}
        className="w-full mt-3 gap-2 h-11 text-sm font-semibold"
        size="lg"
        data-testid="button-unlock-price"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Getting your price...
          </>
        ) : (
          <>
            <Zap className="w-4 h-4" />
            Unlock My Price
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </Button>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Shield className="w-3 h-3 text-green-500" />
          <span>No spam. No obligation. Cancel anytime.</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
          <span>5.0 stars · 17 verified Google reviews</span>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-3">
        Already have an account?{' '}
        <a href="/login" className="text-primary font-medium hover:underline">
          Sign in
        </a>
      </p>
    </div>
  );
}
