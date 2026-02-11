// PERFORMANCE: React.memo optimization to prevent unnecessary re-renders
import { memo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Calculator, TrendingUp, Zap, Package, MapPin, Truck, Sparkles, Gift, Car, Info } from "lucide-react";
import type { PriceBreakdown } from "@shared/pricing";
import { VEHICLE_CLASSES, type VehicleClass } from "@shared/pricing";

interface PricingSummaryProps {
  breakdown: PriceBreakdown | null;
  isCalculating?: boolean;
  error?: string | null;
  className?: string;
  showFirstMoveDiscount?: boolean;
}

export const PricingSummary = memo(function PricingSummary({ breakdown, isCalculating, error, className, showFirstMoveDiscount = false }: PricingSummaryProps) {
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

  // Format load size label for display - show volume when AI-detected
  const loadSizeLabel = breakdown.volumeCuft
    ? `Load Fee (${breakdown.volumeCuft.toFixed(0)} ft³ × $0.15)`
    : breakdown.loadSize 
      ? `Load Size (${breakdown.loadSize.charAt(0).toUpperCase() + breakdown.loadSize.slice(1)})`
      : "Load Size";

  // Distance label with KM only
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

  return (
    <Card className={`${className} overflow-hidden`} data-testid="pricing-summary">
      {/* Header with gradient accent */}
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
        {/* Fee Breakdown */}
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

        {/* Subtotal */}
        <div className="flex items-center justify-between" data-testid="pricing-subtotal">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="text-sm font-medium tabular-nums">${breakdown.subtotal.toFixed(2)}</span>
        </div>

        {/* Two Movers Multiplier */}
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

        {/* First-Move Discount */}
        {showFirstMoveDiscount && (
          <div className="flex items-center justify-between py-2 px-3 bg-green-500/10 rounded-lg border border-green-500/20" data-testid="fee-first-move-discount">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-green-500/20 flex items-center justify-center">
                <Gift className="w-3 h-3 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-sm text-green-600 dark:text-green-400 font-medium">First-Move Discount</span>
              <Badge variant="default" className="bg-green-500 text-white text-[10px]">
                <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                NEW
              </Badge>
            </div>
            <span className="text-sm font-semibold text-green-600 dark:text-green-400">-10%</span>
          </div>
        )}

        <Separator />

        {/* Total Price - Hero Section */}
        <div 
          className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/80 rounded-xl p-4 text-primary-foreground"
          data-testid="pricing-total"
        >
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-xs text-primary-foreground/80 mb-1">
                {showFirstMoveDiscount ? "Estimated (With Discount)" : "Estimated Total"}
              </p>
              <div className="flex items-baseline gap-1">
                {showFirstMoveDiscount ? (
                  <>
                    <span className="text-lg line-through text-primary-foreground/50 mr-1">
                      ${breakdown.totalCost.toFixed(2)}
                    </span>
                    <span className="text-3xl font-bold tracking-tight">
                      ${(breakdown.totalCost * 0.9).toFixed(2)}
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
              {showFirstMoveDiscount ? <Gift className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
          Final price confirmed at checkout. Travel fee calculated based on mover distance to pickup.
        </p>

        <Separator />

        {/* Vehicle Class Pricing Reference */}
        <div data-testid="vehicle-class-pricing">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center">
              <Info className="w-3 h-3 text-muted-foreground" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Vehicle Class Rates</span>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Vehicle</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Base Fee</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Per km</th>
                </tr>
              </thead>
              <tbody>
                {(['A', 'B', 'C', 'E'] as VehicleClass[]).map((cls, idx) => {
                  const vc = VEHICLE_CLASSES[cls];
                  const isActive = breakdown.vehicleClass === cls;
                  return (
                    <tr
                      key={cls}
                      className={`${isActive ? 'bg-primary/10 font-medium' : ''} ${idx < 3 ? 'border-b' : ''}`}
                      data-testid={`vehicle-class-row-${cls}`}
                    >
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                          <span className={isActive ? 'text-primary' : 'text-foreground'}>{vc.name}</span>
                        </div>
                      </td>
                      <td className={`text-right py-2 px-3 tabular-nums ${isActive ? 'text-primary' : ''}`}>
                        ${vc.baseFee.toFixed(2)}
                      </td>
                      <td className={`text-right py-2 px-3 tabular-nums ${isActive ? 'text-primary' : ''}`}>
                        ${vc.perKmRate.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Vehicle class is determined by your load size
          </p>
        </div>
      </CardContent>
    </Card>
  );
});
