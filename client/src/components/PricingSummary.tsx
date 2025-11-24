import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calculator, TrendingUp, Info } from "lucide-react";
import type { PriceBreakdown } from "@shared/pricing";

interface PricingSummaryProps {
  breakdown: PriceBreakdown | null;
  isCalculating?: boolean;
  error?: string | null;
  className?: string;
}

export function PricingSummary({ breakdown, isCalculating, error, className }: PricingSummaryProps) {
  if (error) {
    return (
      <Card className={className} data-testid="pricing-error">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="w-5 h-5" />
            Price Estimate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <Info className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isCalculating || !breakdown) {
    return (
      <Card className={className} data-testid="pricing-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="w-5 h-5" />
            Price Estimate
          </CardTitle>
          <CardDescription>Calculating your move cost...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Separator />
          <Skeleton className="h-6 w-32" />
        </CardContent>
      </Card>
    );
  }

  const components = [
    { label: "Base Fee", amount: breakdown.baseFee, testId: "fee-base" },
    { label: "Distance Fee", amount: breakdown.distanceFee, testId: "fee-distance" },
    { label: "Load Size Fee", amount: breakdown.loadFee, testId: "fee-loadsize", condition: breakdown.loadFee > 0 },
    { label: "Pickup Difficulty", amount: breakdown.pickupDifficultyFee, testId: "fee-pickup", condition: breakdown.pickupDifficultyFee > 0 },
    { label: "Dropoff Difficulty", amount: breakdown.dropoffDifficultyFee, testId: "fee-dropoff", condition: breakdown.dropoffDifficultyFee > 0 },
    { label: "Heavy Items", amount: breakdown.heavyItemFee, testId: "fee-heavy", condition: breakdown.heavyItemFee > 0 },
    { label: "Mover Travel Fee", amount: breakdown.moverTravelFee, testId: "fee-travel", condition: breakdown.moverTravelFee > 0 },
  ];

  const visibleComponents = components.filter(c => c.condition !== false);
  
  // Add multiplier note if 2 movers
  const twoMoversNote = breakdown.numberOfMoversMultiplier > 1 ? (
    <div className="text-xs text-muted-foreground italic" data-testid="fee-movers-note">
      × {breakdown.numberOfMoversMultiplier} (2 movers: full fee + 30%)
    </div>
  ) : null;

  return (
    <Card className={className} data-testid="pricing-summary">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calculator className="w-5 h-5" />
          Price Estimate
        </CardTitle>
        <CardDescription>Live pricing breakdown for your move</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Price Components */}
        <div className="space-y-2">
          {visibleComponents.map((component) => (
            <div 
              key={component.testId} 
              className="flex items-center justify-between text-sm"
              data-testid={component.testId}
            >
              <span className="text-muted-foreground">
                {component.label}
              </span>
              <span className="font-medium">
                ${component.amount.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <Separator />

        {/* Subtotal */}
        <div className="flex items-center justify-between text-sm" data-testid="pricing-subtotal">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">${breakdown.subtotal.toFixed(2)}</span>
        </div>

        {/* Two Movers Multiplier */}
        {twoMoversNote}

        <Separator />

        {/* Total */}
        <div className="flex items-center justify-between pt-2" data-testid="pricing-total">
          <span className="font-semibold">Estimated Total</span>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-base px-3 py-1">
              ${breakdown.totalCost.toFixed(2)} CAD
            </Badge>
          </div>
        </div>

        {/* Info Message */}
        <Alert className="mt-4">
          <TrendingUp className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Final price confirmed after mover assignment. Travel fee to pickup location may vary slightly based on mover proximity.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
