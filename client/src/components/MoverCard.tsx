// PERFORMANCE: React.memo optimization to prevent unnecessary re-renders
import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MapPin, Truck, Star, Clock, ShieldCheck, Rocket } from "lucide-react";

interface MoverCardProps {
  id: string;
  name: string;
  photo?: string;
  rating: number;
  reviewCount: number;
  vehicleType: string;
  distance: string;
  price: number;
  verified: boolean;
  completedMoves: number;
  onSelect: (id: string) => void;
  travelFee?: number;
  pilotApproved?: boolean;
  vehiclePhoto?: string;
  licensePlate?: string;
  vehicleColor?: string;
}

// Helper function to calculate ETA based on distance
function calculateETA(distanceStr: string): number | null {
  const match = distanceStr.match(/(\d+\.?\d*)/);
  if (!match) return null;
  const km = parseFloat(match[1]);
  return Math.ceil(km * 2.2); // ~2.2 min per km in Calgary traffic
}

const MoverCard = memo(function MoverCard({
  id,
  name,
  photo,
  rating,
  reviewCount,
  vehicleType,
  distance,
  price,
  verified,
  completedMoves,
  onSelect,
  travelFee,
  pilotApproved,
  vehiclePhoto,
  licensePlate,
  vehicleColor,
}: MoverCardProps) {
  const eta = calculateETA(distance);
  
  return (
    <Card className="hover-elevate p-6 shadow-sm" data-testid={`card-mover-${id}`}>
      <div className="flex flex-col h-full">
        {/* Header with Avatar, Name, and Price */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Avatar className="w-12 h-12 shrink-0">
              <AvatarImage src={photo} alt={name} />
              <AvatarFallback>{name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-bold text-base truncate" data-testid={`text-mover-name-${id}`}>
                  {name}
                </h3>
                {verified && (
                  <Badge variant="default" className="text-xs gap-1 shrink-0" data-testid={`badge-verified-${id}`}>
                    <ShieldCheck className="w-3 h-3" />
                    Verified
                  </Badge>
                )}
                {pilotApproved && !verified && (
                  <Badge variant="secondary" className="text-xs gap-1 shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" data-testid={`badge-early-access-${id}`}>
                    <Rocket className="w-3 h-3" />
                    Early Access
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-primary leading-tight" data-testid={`text-price-${id}`}>
              ${price > 0 ? price.toFixed(2) : '—'}
            </div>
            {travelFee !== undefined && travelFee > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                (${travelFee.toFixed(2)} travel fee included)
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              {price > 0 ? 'Estimated' : 'Quote on request'}
            </div>
          </div>
        </div>

        {/* Vehicle Photo Section - Uber Style */}
        {vehiclePhoto && (
          <div className="mb-4 rounded-lg overflow-hidden bg-muted" data-testid={`vehicle-photo-container-${id}`}>
            <img 
              src={vehiclePhoto} 
              alt={`${name}'s ${vehicleColor || ''} ${vehicleType}`}
              className="w-full h-32 object-cover"
              data-testid={`img-vehicle-${id}`}
            />
            <div className="flex items-center justify-between px-3 py-2 bg-card border-t">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {vehicleColor && <span className="capitalize">{vehicleColor} </span>}
                  {vehicleType}
                </span>
              </div>
              {licensePlate && (
                <div 
                  className="px-2 py-1 bg-muted rounded text-xs font-mono font-bold tracking-wider"
                  data-testid={`text-license-plate-${id}`}
                >
                  {licensePlate.toUpperCase()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Details - All left-aligned with standardized icons */}
        <div className="space-y-2.5 text-sm mb-6">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 fill-amber-500 text-amber-500 shrink-0" />
            <span className="font-medium" data-testid={`text-rating-${id}`}>
              {rating.toFixed(1)}
            </span>
            <span className="text-muted-foreground">
              ({completedMoves} {completedMoves === 1 ? 'trip' : 'trips'})
            </span>
          </div>

          {/* Only show vehicle type text if no vehicle photo */}
          {!vehiclePhoto && (
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground" data-testid={`text-vehicle-${id}`}>
                {vehicleColor && <span className="capitalize">{vehicleColor} </span>}
                {vehicleType}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground" data-testid={`text-distance-${id}`}>
              {distance}
            </span>
          </div>

          {eta !== null && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground" data-testid={`text-eta-${id}`}>
                ETA: {eta} min
              </span>
            </div>
          )}
        </div>

        {/* Select Button */}
        <div className="mt-auto">
          <Button
            onClick={() => onSelect(id)}
            data-testid={`button-select-${id}`}
            size="default"
            className="w-full"
          >
            Select Mover
          </Button>
        </div>
      </div>
    </Card>
  );
});

export default MoverCard;
