import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MapPin, Truck, Star, Clock, ShieldCheck } from "lucide-react";

interface MoverCardProps {
  id: string;
  name: string;
  photo: string;
  rating: number;
  reviewCount: number;
  vehicleType: string;
  distance: string;
  price: number;
  verified: boolean;
  completedMoves: number;
  onSelect: (id: string) => void;
}

// Helper function to calculate ETA based on distance
function calculateETA(distanceStr: string): number | null {
  const match = distanceStr.match(/(\d+\.?\d*)/);
  if (!match) return null;
  const km = parseFloat(match[1]);
  return Math.ceil(km * 2.2); // ~2.2 min per km in Calgary traffic
}

export default function MoverCard({
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
}: MoverCardProps) {
  const eta = calculateETA(distance);
  
  return (
    <Card className="hover-elevate p-5" data-testid={`card-mover-${id}`}>
      <div className="flex flex-col h-full">
        {/* Header with Avatar and Name */}
        <div className="flex items-start gap-3 mb-4">
          <Avatar className="w-14 h-14 shrink-0">
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
            </div>
            <div className="flex items-center gap-1 mb-1">
              <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
              <span className="font-medium text-sm" data-testid={`text-rating-${id}`}>
                {rating.toFixed(1)}
              </span>
              <span className="text-xs text-muted-foreground">
                ({completedMoves} {completedMoves === 1 ? 'trip' : 'trips'})
              </span>
            </div>
          </div>
        </div>

        {/* Vehicle and Location Info */}
        <div className="space-y-2 mb-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4" />
            <span className="font-medium">Vehicle:</span>
            <span data-testid={`text-vehicle-${id}`}>{vehicleType}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              <span data-testid={`text-distance-${id}`}>{distance}</span>
            </span>
            {eta !== null && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span data-testid={`text-eta-${id}`}>ETA: {eta} min</span>
              </span>
            )}
          </div>
        </div>

        {/* Price and Select Button */}
        <div className="mt-auto pt-4 border-t flex items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-primary" data-testid={`text-price-${id}`}>
              ${price > 0 ? price.toFixed(2) : '—'}
            </div>
            <div className="text-xs text-muted-foreground">
              {price > 0 ? 'Estimated' : 'Quote on request'}
            </div>
          </div>
          <Button
            onClick={() => onSelect(id)}
            data-testid={`button-select-${id}`}
            size="default"
          >
            Select
          </Button>
        </div>
      </div>
    </Card>
  );
}
