import { memo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calculator, TrendingUp, Zap, Package, MapPin, Truck, Sparkles, Gift, Tag, X, Loader2, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { PriceBreakdown } from "@shared/pricing";

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
}

export const PricingSummary = memo(function PricingSummary({ breakdown, isCalculating, error, className, showPromoInput = false, appliedPromo, onPromoApplied }: PricingSummaryProps) {
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

  const loadSizeLabel = breakdown.volumeCuft
    ? `Load Fee (${breakdown.volumeCuft.toFixed(0)} ft³ × $0.15)`
    : "Load Size";

  const distanceLabel = breakdown.distanceKm 
    ? `Distance (${breakdown.distanceKm} km)`
    : "Distance";

  const feeItems = [
    { 
      label: "Base Fee", 
      amount: breakdown.baseFee, 
      testId: "fee-base",
      icon: Zap,
      show: true
    },
    { 
      label: distanceLabel, 
      amount: breakdown.distanceFee, 
      testId: "fee-distance",
      icon: MapPin,
      show: true
    },
    { 
      label: loadSizeLabel, 
      amount: breakdown.loadSizeFee, 
      testId: "fee-loadsize",
      icon: Package,
      show: true
    },
    { 
      label: "Apartment Move Premium", 
      amount: breakdown.apartmentPremium, 
      testId: "fee-apartment-premium",
      icon: Package,
      show: (breakdown.apartmentPremium || 0) > 0
    },
    { 
      label: "Pickup Access", 
      amount: breakdown.pickupDifficultyFee, 
      testId: "fee-pickup",
      icon: TrendingUp,
      show: breakdown.pickupDifficultyFee > 0
    },
    { 
      label: "Dropoff Access", 
      amount: breakdown.dropoffDifficultyFee, 
      testId: "fee-dropoff",
      icon: TrendingUp,
      show: breakdown.dropoffDifficultyFee > 0
    },
    { 
      label: "Mover Travel", 
      amount: breakdown.moverTravelFee, 
      testId: "fee-travel",
      icon: Truck,
      show: breakdown.moverTravelFee > 0
    },
  ];

  const visibleFees = feeItems.filter(item => item.show);
  const hasTwoMovers = breakdown.numberOfMoversMultiplier > 1;
  const hasPromo = appliedPromo?.valid;
  const discountMultiplier = hasPromo ? (1 - appliedPromo.discountPercent / 100) : 1;
  const discountedTotal = breakdown.totalCost * discountMultiplier;

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
        <div className="space-y-2">
          {visibleFees.map((item) => (
            <div 
              key={item.testId} 
              className="flex items-center justify-between py-1.5 group"
              data-testid={item.testId}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center group-hover:bg-muted transition-colors">
                  <item.icon className="w-3 h-3 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">{item.label}</span>
              </div>
              <span className="text-sm font-medium tabular-nums">
                ${item.amount.toFixed(2)}
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
              <span className="text-sm text-primary font-medium">2 Movers Premium</span>
            </div>
            <span className="text-sm font-semibold text-primary">+30%</span>
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
                      ${breakdown.totalCost.toFixed(2)}
                    </span>
                    <span className="text-3xl font-bold tracking-tight">
                      ${discountedTotal.toFixed(2)}
                    </span>
                  </>
                ) : (
                  <span className="text-3xl font-bold tracking-tight">
                    ${breakdown.totalCost.toFixed(2)}
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

        {hasPromo && (
          <div className="flex items-center gap-1.5 justify-center">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            <p className="text-[11px] text-green-600 dark:text-green-400 font-medium">
              You save ${(breakdown.totalCost - discountedTotal).toFixed(2)} with promo code {appliedPromo.code}
            </p>
          </div>
        )}

        <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
          Final price confirmed at checkout. Travel fee calculated based on mover distance to pickup.
        </p>
      </CardContent>
    </Card>
  );
});
