import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Package, DollarSign } from "lucide-react";

interface PriceCalculatorProps {
  distance: number;
  loadSize: string;
  baseRate: number;
  showBreakdown?: boolean;
}

const loadMultipliers: Record<string, number> = {
  small: 1,
  medium: 1.5,
  large: 2,
  full: 3,
};

export default function PriceCalculator({
  distance,
  loadSize,
  baseRate,
  showBreakdown = true,
}: PriceCalculatorProps) {
  const multiplier = loadMultipliers[loadSize] || 1;
  const distanceCost = Math.round(distance * baseRate);
  const loadCost = Math.round(distanceCost * (multiplier - 1));
  const totalCost = distanceCost + loadCost;

  return (
    <Card className="sticky top-20">
      <CardHeader className="pb-4">
        <h3 className="text-xl font-bold">Price Estimate</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        {showBreakdown && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>Distance ({distance} km)</span>
              </div>
              <span className="font-medium" data-testid="text-distance-cost">
                ${distanceCost}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Package className="w-4 h-4" />
                <span>Load size</span>
              </div>
              <span className="font-medium" data-testid="text-load-cost">
                ${loadCost}
              </span>
            </div>
            <div className="border-t pt-3" />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            <span className="font-semibold">Total Estimate</span>
          </div>
          <div className="text-3xl font-bold text-primary" data-testid="text-total-price">
            ${totalCost}
          </div>
        </div>

        <Badge variant="secondary" className="w-full justify-center text-xs">
          Final price confirmed after mover acceptance
        </Badge>
      </CardContent>
    </Card>
  );
}
