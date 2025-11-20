import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Calendar, Package, DollarSign, MessageCircle, CheckCircle, XCircle } from "lucide-react";
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
  images: string[] | null;
  preferredDate: string;
  status: string;
  distance: string | null;
  price: string | null;
  paymentStatus: string | null;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export default function MoverDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // First get the mover profile
  const { data: mover } = useQuery<any>({
    queryKey: [`/api/movers?userId=${user?.id}`],
    enabled: !!user?.id,
    select: (data) => Array.isArray(data) ? data[0] : data,
  });

  // Then get bookings for this mover
  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: [`/api/bookings?moverId=${mover?.id}`],
    enabled: !!mover?.id,
  });

  // Get all pending bookings (not assigned to any mover)
  const { data: availableBookings } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    select: (data) => data.filter((b: Booking) => b.status === "pending" && !b.moverId),
  });

  const acceptBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest("PATCH", `/api/bookings/${bookingId}`, {
        moverId: mover?.id,
        status: "confirmed",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings?moverId=${mover?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Booking accepted",
        description: "You've successfully accepted this booking.",
      });
    },
  });

  const completeBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest("PATCH", `/api/bookings/${bookingId}`, { status: "completed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings?moverId=${mover?.id}`] });
      toast({
        title: "Booking completed",
        description: "The move has been marked as completed.",
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

  if (!user || user.role !== "mover") {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">This page is only available for movers.</p>
        </div>
      </div>
    );
  }

  const renderBookingCard = (booking: Booking, showActions: boolean = false) => (
    <Card key={booking.id} className="hover-elevate" data-testid={`card-booking-${booking.id}`}>
      <CardHeader>
        <div className="flex justify-between items-start gap-4">
          <div>
            <CardTitle className="text-xl">
              Move #{booking.id.slice(0, 8)}
            </CardTitle>
            <CardDescription>
              {booking.customer && `${booking.customer.name} • `}
              {format(new Date(booking.createdAt), "MMM d, yyyy")}
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
                  <p className="text-sm text-muted-foreground">
                    ${parseFloat(booking.price).toFixed(2)} CAD
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {booking.description && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-1">Additional Details</p>
              <p className="text-sm text-muted-foreground">{booking.description}</p>
            </div>
          </>
        )}

        {booking.images && booking.images.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-3">Item Photos ({booking.images.length})</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {booking.images.map((imageUrl, index) => (
                  <div key={index} className="relative aspect-square rounded-md overflow-hidden border">
                    <img
                      src={imageUrl}
                      alt={`Item ${index + 1}`}
                      className="w-full h-full object-cover"
                      data-testid={`image-item-${booking.id}-${index}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />
        <div className="flex flex-wrap gap-2">
          {showActions && (
            <Button
              variant="default"
              size="sm"
              onClick={() => acceptBookingMutation.mutate(booking.id)}
              disabled={acceptBookingMutation.isPending}
              data-testid={`button-accept-${booking.id}`}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Accept Booking
            </Button>
          )}
          {booking.status === "confirmed" && (
            <Button
              variant="default"
              size="sm"
              onClick={() => completeBookingMutation.mutate(booking.id)}
              disabled={completeBookingMutation.isPending}
              data-testid={`button-complete-${booking.id}`}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark Complete
            </Button>
          )}
          {booking.status !== "cancelled" && booking.status !== "pending" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation(`/messages/${booking.id}`)}
              data-testid={`button-message-${booking.id}`}
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Message Customer
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Mover Dashboard</h1>
          <p className="text-muted-foreground">Manage your bookings and find new jobs</p>
        </div>

        <Tabs defaultValue="available" className="space-y-6">
          <TabsList>
            <TabsTrigger value="available" data-testid="tab-available">
              Available Jobs
              {availableBookings && availableBookings.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {availableBookings.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="my-bookings" data-testid="tab-my-bookings">
              My Bookings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-4">
            {!availableBookings || availableBookings.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">No available jobs at the moment.</p>
                </CardContent>
              </Card>
            ) : (
              availableBookings.map((booking) => renderBookingCard(booking, true))
            )}
          </TabsContent>

          <TabsContent value="my-bookings" className="space-y-4">
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading your bookings...</p>
              </div>
            ) : !bookings || bookings.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">You don't have any bookings yet.</p>
                </CardContent>
              </Card>
            ) : (
              bookings.map((booking) => renderBookingCard(booking))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
