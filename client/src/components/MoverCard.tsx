import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MapPin, Truck, Star, CheckCircle2 } from "lucide-react";

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
  return (
    <Card className="hover-elevate p-6" data-testid={`card-mover-${id}`}>
      <div className="flex flex-col h-full">
        <div className="flex items-start gap-4 mb-4">
          <Avatar className="w-16 h-16">
            <AvatarImage src={photo} alt={name} />
            <AvatarFallback>{name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg truncate" data-testid={`text-mover-name-${id}`}>
                {name}
              </h3>
              {verified && (
                <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" data-testid={`icon-verified-${id}`} />
              )}
            </div>
            <div className="flex items-center gap-1 mb-2">
              <Star className="w-4 h-4 fill-accent text-accent" />
              <span className="font-semibold text-sm" data-testid={`text-rating-${id}`}>
                {rating.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground">
                ({reviewCount} reviews)
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span data-testid={`text-distance-${id}`}>{distance} away</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm" data-testid={`text-vehicle-${id}`}>{vehicleType}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {completedMoves} moves completed
            </Badge>
          </div>
        </div>

        <div className="mt-auto pt-4 border-t flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-bold" data-testid={`text-price-${id}`}>
              ${price}
            </div>
            <div className="text-xs text-muted-foreground">Estimated total</div>
          </div>
          <Button
            onClick={() => onSelect(id)}
            data-testid={`button-select-${id}`}
          >
            Select Mover
          </Button>
        </div>
      </div>
    </Card>
  );
}
