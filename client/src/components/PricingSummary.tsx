// PERFORMANCE: React.memo optimization to prevent unnecessary re-renders
import { memo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calculator, TrendingUp, Zap, Package, MapPin, Truck, ChevronDown, Info, Car } from "lucide-react";
import type { PriceBreakdown } from "@shared/pricing";
import { VEHICLE_CLASSES, type VehicleClass } from "@shared/pricing";

// Pricing reference data
const LOAD_SIZE_FEES: Record<string, { label: string; fee: number }> = {
  boxes: { label: "Boxes / Small Items", fee: 5.00 },
  small: { label: "Small Load", fee: 5.00 },
  medium: { label: "Medium Load", fee: 15.00 },
  large: { label: "Large Load", fee: 30.00 },
  apartment: { label: "Full Apartment", fee: 45.00 },
};

interface PricingSummaryProps {
  breakdown: PriceBreakdown | null;
  isCalculating?: boolean;
  error?: string | null;
  className?: string;
}

export const PricingSummary = memo(function PricingSummary({ breakdown, isCalculating, error, className }: PricingSummaryProps) {
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

  // Format load size label for display
  const loadSizeLabel = breakdown.loadSize 
    ? `Load Size (${breakdown.loadSize.charAt(0).toUpperCase() + breakdown.loadSize.slice(1)})`
    : "Load Size Fee";

  // Get vehicle class info
  const vehicleClass = breakdown.vehicleClass || 'C';
  const vehicleConfig = VEHICLE_CLASSES[vehicleClass];

  // Distance label with KM
  const distanceLabel = breakdown.distanceKm 
    ? `Distance (${breakdown.distanceKm} km × $${breakdown.perKmRate.toFixed(2)})`
    : "Distance";

  // Base fee explanation based on vehicle class
  const baseFeeLabel = `Base Fee (${vehicleConfig.name})`;

  const feeItems = [
    { 
      label: baseFeeLabel, 
      amount: breakdown.baseFee, 
      testId: "fee-base",
      icon: Zap,
      show: true,
      tooltip: "Starting fee based on vehicle size needed"
    },
    { 
      label: distanceLabel, 
      amount: breakdown.distanceFee, 
      testId: "fee-distance",
      icon: MapPin,
      show: true,
      tooltip: `${breakdown.distanceKm || 0} km at $${breakdown.perKmRate?.toFixed(2) || '0.00'}/km`
    },
    { 
      label: loadSizeLabel, 
      amount: breakdown.loadSizeFee, 
      testId: "fee-loadsize",
      icon: Package,
      show: true,
      tooltip: "Fee based on the size of your load"
    },
    { 
      label: "Pickup Access", 
      amount: breakdown.pickupDifficultyFee, 
      testId: "fee-pickup",
      icon: TrendingUp,
      show: breakdown.pickupDifficultyFee > 0,
      tooltip: "Additional fee for stairs, basement, or elevator access"
    },
    { 
      label: "Dropoff Access", 
      amount: breakdown.dropoffDifficultyFee, 
      testId: "fee-dropoff",
      icon: TrendingUp,
      show: breakdown.dropoffDifficultyFee > 0,
      tooltip: "Additional fee for stairs, basement, or elevator access"
    },
    { 
      label: "Mover Travel", 
      amount: breakdown.moverTravelFee, 
      testId: "fee-travel",
      icon: Truck,
      show: breakdown.moverTravelFee > 0,
      tooltip: "Fee for mover traveling beyond 5km to pickup"
    },
  ];

  const visibleFees = feeItems.filter(item => item.show);
  const hasTwoMovers = breakdown.numberOfMoversMultiplier > 1;

  // State for collapsible sections
  const [showRates, setShowRates] = useState(false);

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

        {/* Collapsible Pricing Reference */}
        <Collapsible open={showRates} onOpenChange={setShowRates}>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="toggle-pricing-rates">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4" />
              <span>View All Pricing Rates</span>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showRates ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-2">
            {/* Vehicle Class Rates */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Car className="w-3 h-3" />
                Price Per KM by Vehicle
              </div>
              <div className="grid gap-1.5 text-xs">
                {(Object.entries(VEHICLE_CLASSES) as [VehicleClass, typeof VEHICLE_CLASSES[VehicleClass]][]).map(([cls, config]) => (
                  <div 
                    key={cls}
                    className={`flex items-center justify-between py-1.5 px-2 rounded ${
                      vehicleClass === cls ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'
                    }`}
                    data-testid={`rate-vehicle-${cls}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                        vehicleClass === cls ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        {cls}
                      </span>
                      <span className={vehicleClass === cls ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                        {config.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`font-medium tabular-nums ${vehicleClass === cls ? 'text-primary' : 'text-foreground'}`}>
                        ${config.perKmRate.toFixed(2)}/km
                      </span>
                      <span className="text-muted-foreground ml-1">(${config.baseFee} base)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Load Size Fees */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Package className="w-3 h-3" />
                Load Size Fees
              </div>
              <div className="grid gap-1.5 text-xs">
                {Object.entries(LOAD_SIZE_FEES).filter(([key]) => key !== 'small').map(([key, { label, fee }]) => (
                  <div 
                    key={key}
                    className={`flex items-center justify-between py-1.5 px-2 rounded ${
                      breakdown.loadSize === key ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'
                    }`}
                    data-testid={`rate-loadsize-${key}`}
                  >
                    <span className={breakdown.loadSize === key ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                      {label}
                    </span>
                    <span className={`font-medium tabular-nums ${breakdown.loadSize === key ? 'text-primary' : 'text-foreground'}`}>
                      ${fee.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Base Fee Explanation */}
            <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-medium">
                <Zap className="w-3 h-3 text-primary" />
                What is the Base Fee?
              </div>
              <p className="text-muted-foreground leading-relaxed">
                The base fee is a starting charge that varies by vehicle size. Larger vehicles (like moving trucks) 
                have higher base fees because they require more fuel and specialized equipment. Your current 
                vehicle class <span className="font-medium text-foreground">({vehicleConfig.name})</span> has 
                a base fee of <span className="font-medium text-foreground">${breakdown.baseFee.toFixed(2)}</span>.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

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

        <Separator />

        {/* Total Price - Hero Section */}
        <div 
          className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/80 rounded-xl p-4 text-primary-foreground"
          data-testid="pricing-total"
        >
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-xs text-primary-foreground/80 mb-1">Estimated Total</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">
                  ${breakdown.totalCost.toFixed(2)}
                </span>
                <span className="text-sm font-medium text-primary-foreground/80">CAD</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <Zap className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
          Final price confirmed after mover assignment. Travel fee may vary based on mover proximity.
        </p>
      </CardContent>
    </Card>
  );
});
