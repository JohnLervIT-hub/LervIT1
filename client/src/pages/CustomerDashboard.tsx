import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Loader2, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

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
  const { toast } = useToast();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Fetch bookings for this customer ONLY (server enforces filtering by role)
  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    enabled: !!user?.id,
  });

  // Report mover mutation
  const reportMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const booking = bookings?.find(b => b.id === bookingId);
      if (!booking || !booking.mover || !booking.mover.user) {
        throw new Error("Booking or mover details not found");
      }

      return await apiRequest("POST", "/api/support-tickets", {
        subject: `Report: Mover ${booking.mover.user.name} (Booking #${bookingId.slice(0, 8)})`,
        category: "mover_concern",
        priority: "high",
        description: `Customer ${user?.name} is reporting a concern about mover ${booking.mover.user.name} for booking #${bookingId}. Please investigate.`,
      });
    },
    onSuccess: () => {
      toast({
        title: "Report Submitted",
        description: "We've received your report and will investigate promptly. We'll contact you via email.",
      });
      setReportDialogOpen(false);
      setSelectedBooking(null);
      queryClient.invalidateQueries({ queryKey: ["/api/support-tickets"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Report Failed",
        description: error.message || "Unable to submit report. Please try again.",
        variant: "destructive",
      });
    },
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

  const handleReportMover = (booking: Booking) => {
    // Validate mover details exist before opening dialog
    if (!booking.mover || !booking.mover.user) {
      toast({
        title: "Cannot Report Mover",
        description: "Mover details are not available for this booking.",
        variant: "destructive",
      });
      return;
    }
    setSelectedBooking(booking);
    setReportDialogOpen(true);
  };

  const confirmReport = () => {
    if (selectedBooking) {
      reportMutation.mutate(selectedBooking.id);
    }
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
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleViewDetails(booking.id)} data-testid={`button-view-${booking.id}`}>
                        View Details
                      </Button>
                      {booking.moverId && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleMessage(booking.id)} data-testid={`button-message-${booking.id}`}>
                            Message
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleReportMover(booking)}
                            className="text-destructive hover:text-destructive gap-1"
                            data-testid={`button-report-${booking.id}`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Report
                          </Button>
                        </>
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

        {/* Report Mover Dialog */}
        <AlertDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Report Safety Concern
              </AlertDialogTitle>
              <AlertDialogDescription>
                {selectedBooking && selectedBooking.mover && (
                  <>
                    You're about to report mover <strong>{selectedBooking.mover.user.name}</strong> for booking <strong>#{selectedBooking.id.slice(0, 8)}</strong>.
                    <br /><br />
                    Our support team will investigate this report immediately and contact you via email. 
                    If you're in immediate danger, please call emergency services.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-report">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmReport}
                disabled={reportMutation.isPending}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="button-confirm-report"
              >
                {reportMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Report"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
