import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

type Booking = {
  id: string;
  customerId: string;
  moverId: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  loadSize: string;
  preferredDate: string;
  status: string;
  price: string | null;
  mover?: {
    id: string;
    userId: string;
    moverImage: string | null;
    user: {
      id: string;
      name: string;
    };
  };
};

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Fetch bookings for this customer ONLY (server enforces filtering by role)
  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    enabled: !!user?.id,
  });

  // Filter active bookings (not completed/cancelled)
  const activeBookings = bookings?.filter((b) => 
    b.status === "pending" || b.status === "confirmed" || b.status === "in_transit"
  ) || [];

  // Filter past bookings (completed/cancelled)
  const pastBookings = bookings?.filter((b) => 
    b.status === "completed" || b.status === "cancelled"
  ) || [];

  const handleMessage = (id: string) => {
    setLocation(`/messages/${id}`);
  };

  const handleViewDetails = (id: string) => {
    setLocation(`/my-bookings`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              My Bookings
            </h1>
            <p className="text-muted-foreground">
              Manage your moving requests
            </p>
          </div>
          <Button onClick={() => setLocation("/request-move")} data-testid="button-new-booking">
            <Plus className="w-4 h-4 mr-2" />
            New Booking
          </Button>
        </div>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="active" data-testid="tab-active">
              Active Bookings ({activeBookings.length})
            </TabsTrigger>
            <TabsTrigger value="past" data-testid="tab-past">
              Past Bookings ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {activeBookings.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No active bookings</p>
                <Button onClick={() => setLocation("/request-move")}>
                  Book Your First Move
                </Button>
              </div>
            ) : (
              activeBookings.map((booking) => (
                <Card key={booking.id} className="p-6" data-testid={`card-booking-${booking.id}`}>
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="font-semibold text-lg">
                          {booking.pickupAddress}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          to {booking.dropoffAddress}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(booking.preferredDate), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">
                          ${parseFloat(booking.price || "0").toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {booking.status}
                        </p>
                      </div>
                    </div>
                    {booking.mover && (
                      <div className="text-sm text-muted-foreground">
                        Mover: {booking.mover.user.name}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleViewDetails(booking.id)}>
                        View Details
                      </Button>
                      {booking.moverId && (
                        <Button variant="ghost" size="sm" onClick={() => handleMessage(booking.id)}>
                          Message
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {pastBookings.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No past bookings</p>
              </div>
            ) : (
              pastBookings.map((booking) => (
                <Card key={booking.id} className="p-6" data-testid={`card-booking-${booking.id}`}>
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="font-semibold text-lg">
                          {booking.pickupAddress}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          to {booking.dropoffAddress}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(booking.preferredDate), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">
                          ${parseFloat(booking.price || "0").toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {booking.status}
                        </p>
                      </div>
                    </div>
                    {booking.mover && (
                      <div className="text-sm text-muted-foreground">
                        Mover: {booking.mover.user.name}
                      </div>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleViewDetails(booking.id)}>
                      View Details
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
