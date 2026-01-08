import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MapPin, Calendar, Package, MessageCircle, Hash } from "lucide-react";

interface BookingCardProps {
  id: string;
  moverName: string;
  moverPhoto: string;
  pickupAddress: string;
  dropoffAddress: string;
  date: string;
  time: string;
  status: "pending" | "confirmed" | "in-progress" | "completed" | "cancelled";
  price: number;
  onMessage: (id: string) => void;
  onViewDetails: (id: string) => void;
}

export default function BookingCard({
  id,
  moverName,
  moverPhoto,
  pickupAddress,
  dropoffAddress,
  date,
  time,
  status,
  price,
  onMessage,
  onViewDetails,
}: BookingCardProps) {
  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    "in-progress": "bg-primary/10 text-primary",
    completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <Card className="hover-elevate" data-testid={`card-booking-${id}`}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-12 h-12">
            <AvatarImage src={moverPhoto} alt={moverName} />
            <AvatarFallback>{moverName.split(' ').map(n => n[0]).join('')}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold" data-testid={`text-mover-${id}`}>{moverName}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span data-testid={`text-datetime-${id}`}>{date} at {time}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Hash className="w-3 h-3" />
              <span className="font-mono" data-testid={`text-booking-id-${id}`}>{id.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>
        </div>
        <Badge className={`${statusColors[status]} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-status-${id}`}>
          {status.replace('-', ' ')}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium">Pickup</div>
              <div className="text-sm text-muted-foreground" data-testid={`text-pickup-${id}`}>
                {pickupAddress}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Package className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium">Dropoff</div>
              <div className="text-sm text-muted-foreground" data-testid={`text-dropoff-${id}`}>
                {dropoffAddress}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t gap-4">
          <div>
            <div className="text-2xl font-bold" data-testid={`text-price-${id}`}>${price}</div>
            <div className="text-xs text-muted-foreground">Total cost</div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onMessage(id)}
              data-testid={`button-message-${id}`}
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Message
            </Button>
            <Button
              size="sm"
              onClick={() => onViewDetails(id)}
              data-testid={`button-details-${id}`}
            >
              View Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
