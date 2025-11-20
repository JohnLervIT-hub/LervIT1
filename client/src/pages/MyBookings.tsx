import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MapPin, Calendar, Package, DollarSign, MessageCircle, Star } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Booking = {
  id: string;
  customerId: string;
  moverId: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  loadSize: string;
  description: string | null;
  preferredDate: string;
  status: string;
  distance: string | null;
  price: string | null;
  paymentStatus: string | null;
  createdAt: string;
  mover: {
    id: string;
    name: string;
    vehicleType: string;
    rating: string;
  } | null;
};

export default function MyBookings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: [`/api/bookings?customerId=${user?.id}`],
    enabled: !!user?.id,
  });

  const cancelBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest("PATCH", `/api/bookings/${bookingId}`, { status: "cancelled" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings?customerId=${user?.id}`] });
      toast({
        title: "Booking cancelled",
        description: "Your booking has been cancelled successfully.",
      });
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "secondary",
      confirmed: "default",
      in_progress: "default",
      completed: "default",
      cancelled: "destructive",
    };
    return colors[status] || "secondary";
  };

  const getStatusLabel = (status: string) => {
    return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  if (!user) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">Please log in to view your bookings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">My Bookings</h1>
          <p className="text-muted-foreground">Track and manage your move requests</p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading your bookings...</p>
          </div>
        ) : !bookings || bookings.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground mb-4">You don't have any bookings yet.</p>
              <Button onClick={() => setLocation("/request-move")} data-testid="button-book-move">
                Book Your First Move
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <Card key={booking.id} className="hover-elevate" data-testid={`card-booking-${booking.id}`}>
                <CardHeader>
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <CardTitle className="text-xl">
                        Move #{booking.id.slice(0, 8)}
                      </CardTitle>
                      <CardDescription>
                        Booked on {format(new Date(booking.createdAt), "MMM d, yyyy")}
                      </CardDescription>
                    </div>
                    <Badge variant={getStatusColor(booking.status) as any} data-testid={`badge-status-${booking.id}`}>
                      {getStatusLabel(booking.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Pickup</p>
                          <p className="text-sm text-muted-foreground" data-testid={`text-pickup-${booking.id}`}>
                            {booking.pickupAddress}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Dropoff</p>
                          <p className="text-sm text-muted-foreground" data-testid={`text-dropoff-${booking.id}`}>
                            {booking.dropoffAddress}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Preferred Date</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(booking.preferredDate), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Load Size</p>
                          <p className="text-sm text-muted-foreground capitalize">
                            {booking.loadSize}
                          </p>
                        </div>
                      </div>
                      {booking.price && (
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Price</p>
                            <p className="text-sm text-muted-foreground" data-testid={`text-price-${booking.id}`}>
                              ${parseFloat(booking.price).toFixed(2)} CAD
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {booking.mover && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Assigned Mover</p>
                          <p className="text-sm text-muted-foreground" data-testid={`text-mover-${booking.id}`}>
                            {booking.mover.name} • {booking.mover.vehicleType} • {parseFloat(booking.mover.rating).toFixed(1)}★
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    {booking.status === "pending" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => cancelBookingMutation.mutate(booking.id)}
                        disabled={cancelBookingMutation.isPending}
                        data-testid={`button-cancel-${booking.id}`}
                      >
                        Cancel Booking
                      </Button>
                    )}
                    {booking.mover && booking.status !== "cancelled" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/messages/${booking.id}`)}
                        data-testid={`button-message-${booking.id}`}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Message Mover
                      </Button>
                    )}
                    {booking.status === "completed" && booking.mover && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setLocation(`/review/${booking.id}`)}
                        data-testid={`button-review-${booking.id}`}
                      >
                        <Star className="w-4 h-4 mr-2" />
                        Leave Review
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
