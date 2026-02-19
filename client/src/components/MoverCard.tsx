// PERFORMANCE: React.memo optimization to prevent unnecessary re-renders
import { memo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Truck, Star, Clock, ShieldCheck, Rocket } from "lucide-react";
import { getVehicleDisplayName } from "@/lib/utils";

interface MoverCardProps {
  id: string;
  name: string;
  photo?: string;
  rating: number;
  reviewCount: number;
  vehicleType: string;
  distance: string;
  verified: boolean;
  completedMoves: number;
  onSelect: (id: string) => void;
  pilotApproved?: boolean;
  vehiclePhoto?: string;
  licensePlate?: string;
  vehicleColor?: string;
  isLiveLocation?: boolean; // Uber-style: mover has recent GPS location (within 1 hour)
  price?: number; // Optional - only used in proximity matching results
  travelFee?: number; // Optional - only used in proximity matching results
}

const MoverCard = memo(function MoverCard({
  id,
  name,
  photo,
  rating,
  reviewCount,
  vehicleType,
  distance,
  verified,
  completedMoves,
  onSelect,
  pilotApproved,
  vehiclePhoto,
  licensePlate,
  vehicleColor,
  isLiveLocation,
}: MoverCardProps) {
  const [vehicleImageLoaded, setVehicleImageLoaded] = useState(false);
  const [vehicleImageError, setVehicleImageError] = useState(false);
  
  return (
    <Card className="overflow-hidden shadow-sm border" data-testid={`card-mover-${id}`}>
      <div className="flex flex-col h-full">
        {/* Header with Avatar, Name - grey background for definition */}
        <div className="bg-muted/50 dark:bg-muted/30 px-5 py-4 border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Avatar className="w-12 h-12 shrink-0 ring-2 ring-background shadow-sm">
                <AvatarImage src={photo} alt={name} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">{name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base truncate" data-testid={`text-mover-name-${id}`}>
                  {name}
                </h3>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {verified && (
                    <Badge variant="outline" className="text-xs gap-1 shrink-0 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800" data-testid={`badge-verified-${id}`}>
                      <ShieldCheck className="w-3 h-3" />
                      Verified
                    </Badge>
                  )}
                  {pilotApproved && (
                    <Badge variant="secondary" className="text-xs gap-1 shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" data-testid={`badge-early-access-${id}`}>
                      <Rocket className="w-3 h-3" />
                      Early Access
                    </Badge>
                  )}
                  {isLiveLocation && (
                    <Badge variant="outline" className="text-xs gap-1 shrink-0 bg-blue-500/10 text-blue-600 border-blue-500/30" data-testid={`badge-live-location-${id}`}>
                      <MapPin className="w-3 h-3" />
                      Live
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle Section - Full image display without cropping */}
        <div className="mx-5 mt-4 mb-4 rounded-lg overflow-hidden border bg-muted/30" data-testid={`vehicle-photo-container-${id}`}>
          {/* Vehicle Image Container - 16:9 aspect ratio for full visibility */}
          <div className="relative aspect-video bg-gradient-to-br from-muted to-muted/70">
            {vehiclePhoto && !vehicleImageError ? (
              <>
                {/* Loading skeleton shown while image loads */}
                {!vehicleImageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Skeleton className="w-full h-full" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Truck className="w-12 h-12 text-muted-foreground/40 animate-pulse" />
                    </div>
                  </div>
                )}
                <img 
                  src={vehiclePhoto} 
                  alt={`${name}'s ${vehicleColor || ''} ${vehicleType}`}
                  className={`w-full h-full object-contain transition-opacity duration-300 ${vehicleImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  onLoad={() => setVehicleImageLoaded(true)}
                  onError={() => setVehicleImageError(true)}
                  data-testid={`img-vehicle-${id}`}
                />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Truck className="w-16 h-16 text-muted-foreground/30" />
              </div>
            )}
            {/* License Plate Badge - Prominent overlay at bottom center */}
            {licensePlate && (
              <div 
                className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 bg-white dark:bg-gray-900 rounded-md border-2 border-gray-300 dark:border-gray-600 shadow-lg"
                data-testid={`text-license-plate-${id}`}
              >
                <span className="text-base font-mono font-bold tracking-widest text-gray-900 dark:text-white">
                  {licensePlate.toUpperCase()}
                </span>
              </div>
            )}
          </div>
          {/* Vehicle Info Bar */}
          <div className="flex items-center justify-center gap-2 px-3 py-2.5 bg-card border-t">
            <Truck className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-semibold" data-testid={`text-vehicle-${id}`}>
              {vehicleColor && `${vehicleColor} `}{getVehicleDisplayName(vehicleType)}
            </span>
          </div>
        </div>

        {/* Details - Rating and Location */}
        <div className="px-5 space-y-2 text-sm mb-4">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 fill-amber-500 text-amber-500 shrink-0" />
            <span className="font-semibold" data-testid={`text-rating-${id}`}>
              {rating.toFixed(1)}
            </span>
            <span className="text-muted-foreground">
              ({completedMoves} {completedMoves === 1 ? 'trip' : 'trips'})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground" data-testid={`text-distance-${id}`}>
              {distance}
            </span>
          </div>
        </div>

        {/* Select Button */}
        <div className="mt-auto px-5 pb-5">
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
