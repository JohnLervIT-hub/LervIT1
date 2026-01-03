import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Star, Truck, CheckCircle, MapPin } from "lucide-react";
import { getVehicleDisplayName, getVehicleBasePrice } from "@/lib/utils";

type MoverProfileCardProps = {
  mover: {
    id: string;
    userId: string;
    vehicleType: string | null;
    vehiclePhoto: string | null;
    vehicleColor: string | null;
    licensePlate: string | null;
    moverImage: string | null;
    rating: string | null;
    completedTrips: number | null;
    bio: string | null;
    profileVerified: boolean | null;
    documentsVerified: boolean | null;
    user: {
      id: string;
      name: string;
      phone?: string;
    };
  };
  showContactInfo?: boolean;
};

export default function MoverProfileCard({ mover, showContactInfo = false }: MoverProfileCardProps) {
  const rating = mover.rating ? parseFloat(mover.rating) : 0;
  const completedTrips = mover.completedTrips || 0;
  const isVerified = mover.profileVerified && mover.documentsVerified;

  return (
    <Card className="p-6" data-testid="card-mover-profile">
      <div className="space-y-6">
        {/* Mover Header */}
        <div className="flex items-start gap-4">
          <Avatar className="w-16 h-16" data-testid="img-mover-avatar">
            <AvatarImage src={mover.moverImage || undefined} alt={mover.user.name} />
            <AvatarFallback className="text-lg font-semibold">
              {mover.user.name.split(" ").map((n) => n[0]).join("")}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-bold" data-testid="text-mover-name">
                {mover.user.name}
              </h3>
              {isVerified && (
                <Badge variant="default" className="gap-1" data-testid="badge-verified">
                  <CheckCircle className="w-3 h-3" />
                  Verified
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-4 flex-wrap text-sm">
              {rating > 0 && (
                <div className="flex items-center gap-1" data-testid="text-rating">
                  <Star className="w-4 h-4 fill-primary text-primary" />
                  <span className="font-semibold">{rating.toFixed(1)}</span>
                </div>
              )}
              
              <div className="flex items-center gap-1 text-muted-foreground" data-testid="text-trips">
                <MapPin className="w-4 h-4" />
                <span>{completedTrips} trips completed</span>
              </div>
            </div>

            {showContactInfo && mover.user.phone && (
              <p className="text-sm text-muted-foreground" data-testid="text-phone">
                Phone: {mover.user.phone}
              </p>
            )}
          </div>
        </div>

        {/* Bio */}
        {mover.bio && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">About</h4>
            <p className="text-sm text-muted-foreground" data-testid="text-bio">
              {mover.bio}
            </p>
          </div>
        )}

        {/* Vehicle Information */}
        {mover.vehicleType && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-muted-foreground" />
              <h4 className="font-semibold text-sm">Vehicle</h4>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              {mover.vehiclePhoto && (
                <div className="space-y-2">
                  <img
                    src={mover.vehiclePhoto}
                    alt={`${mover.vehicleType} vehicle`}
                    className="w-full h-32 object-cover rounded-md border"
                    data-testid="img-vehicle-photo"
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" data-testid="badge-vehicle-type">
                    {getVehicleDisplayName(mover.vehicleType)}
                  </Badge>
                  {mover.vehicleColor && (
                    <Badge variant="outline" data-testid="badge-vehicle-color">
                      {mover.vehicleColor}
                    </Badge>
                  )}
                  {getVehicleBasePrice(mover.vehicleType) !== null && (
                    <span className="text-xs text-muted-foreground" data-testid="text-base-price">
                      From ${getVehicleBasePrice(mover.vehicleType)?.toFixed(2)}
                    </span>
                  )}
                </div>
                
                {mover.licensePlate && (
                  <p className="text-sm text-muted-foreground font-mono" data-testid="text-license-plate">
                    Plate: {mover.licensePlate}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
