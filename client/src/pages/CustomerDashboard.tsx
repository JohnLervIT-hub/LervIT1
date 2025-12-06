import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Plus, Loader2, AlertTriangle, MapPin, Calendar, Package, 
  Truck, MessageSquare, Eye, DollarSign, Clock, CheckCircle,
  XCircle, TrendingUp, CreditCard
} from "lucide-react";
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
  distance?: string;
  paymentStatus?: string;
  mover?: {
    id: string;
    userId: string;
    moverImage: string | null;
    rating?: string;
    tripCount?: number;
    vehicleType?: string;
    user: {
      id: string;
      name: string;
    };
  };
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Awaiting Payment", color: "bg-amber-500/10 text-amber-600 border-amber-200", icon: Clock },
  confirmed: { label: "Mover Assigned", color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Truck },
  in_transit: { label: "In Transit", color: "bg-primary/10 text-primary border-primary/20", icon: TrendingUp },
  completed: { label: "Completed", color: "bg-green-500/10 text-green-600 border-green-200", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-500/10 text-red-600 border-red-200", icon: XCircle },
};

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    enabled: !!user?.id,
  });

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
        description: "We've received your report and will investigate promptly.",
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

  const activeBookings = bookings?.filter((b) => 
    b.status === "pending" || b.status === "confirmed" || b.status === "in_transit"
  ) || [];

  const pastBookings = bookings?.filter((b) => 
    b.status === "completed" || b.status === "cancelled"
  ) || [];

  const handleMessage = (id: string) => {
    setLocation(`/messages/${id}`);
  };

  const handleViewDetails = (id: string) => {
    setLocation(`/my-bookings`);
  };

  const handlePayment = (id: string) => {
    setLocation(`/payment/${id}`);
  };

  const handleReportMover = (booking: Booking) => {
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

  const BookingCard = ({ booking, showActions = true }: { booking: Booking; showActions?: boolean }) => {
    const status = statusConfig[booking.status] || statusConfig.pending;
    const StatusIcon = status.icon;
    const isPending = booking.status === "pending";
    
    return (
      <Card className="overflow-hidden hover-elevate" data-testid={`card-booking-${booking.id}`}>
        {/* Status Bar */}
        <div className={`px-4 py-2 border-b flex items-center justify-between ${status.color}`}>
          <div className="flex items-center gap-2">
            <StatusIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{status.label}</span>
          </div>
          <span className="text-xs opacity-70">#{booking.id.slice(0, 8)}</span>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Route Display */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1 pt-1">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                <span className="text-[10px] font-bold">A</span>
              </div>
              <div className="w-0.5 h-6 bg-gradient-to-b from-muted-foreground/30 to-primary/30" />
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary">B</span>
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Pickup</p>
                <p className="font-medium text-sm truncate">{booking.pickupAddress}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dropoff</p>
                <p className="font-medium text-sm truncate">{booking.dropoffAddress}</p>
              </div>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xl font-bold">${parseFloat(booking.price || "0").toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">CAD</p>
            </div>
          </div>
          
          {/* Info Row */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>{format(new Date(booking.preferredDate), "MMM d, h:mm a")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Package className="w-4 h-4" />
              <span className="capitalize">{booking.loadSize}</span>
            </div>
            {booking.distance && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                <span>{parseFloat(booking.distance).toFixed(1)} km</span>
              </div>
            )}
          </div>
          
          {/* Mover Info */}
          {booking.mover && (
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Avatar className="w-10 h-10">
                <AvatarImage src={booking.mover.moverImage || undefined} />
                <AvatarFallback>{booking.mover.user.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{booking.mover.user.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {booking.mover.rating && (
                    <span className="flex items-center gap-0.5">
                      <span className="text-amber-500">★</span>
                      {parseFloat(booking.mover.rating).toFixed(1)}
                    </span>
                  )}
                  {booking.mover.vehicleType && (
                    <span className="capitalize">{booking.mover.vehicleType}</span>
                  )}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => handleMessage(booking.id)}
                data-testid={`button-message-${booking.id}`}
              >
                <MessageSquare className="w-4 h-4" />
              </Button>
            </div>
          )}
          
          {/* Actions */}
          {showActions && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {isPending && (
                <Button 
                  size="sm" 
                  onClick={() => handlePayment(booking.id)}
                  data-testid={`button-pay-${booking.id}`}
                >
                  <CreditCard className="w-4 h-4 mr-1.5" />
                  Pay Now
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleViewDetails(booking.id)} 
                data-testid={`button-view-${booking.id}`}
              >
                <Eye className="w-4 h-4 mr-1.5" />
                Details
              </Button>
              {booking.moverId && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleReportMover(booking)}
                  className="text-destructive hover:text-destructive ml-auto"
                  data-testid={`button-report-${booking.id}`}
                >
                  <AlertTriangle className="w-4 h-4 mr-1.5" />
                  Report
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen pt-24 pb-12 bg-muted/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">My Bookings</h1>
            <p className="text-sm text-muted-foreground">
              Track and manage your moves
            </p>
          </div>
          <Button onClick={() => setLocation("/request-move")} data-testid="button-new-booking">
            <Plus className="w-4 h-4 mr-2" />
            New Booking
          </Button>
        </div>

        {/* Quick Stats */}
        {bookings && bookings.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{activeBookings.length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{pastBookings.filter(b => b.status === 'completed').length}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">
                ${bookings.reduce((sum, b) => sum + parseFloat(b.price || "0"), 0).toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground">Total Spent</p>
            </Card>
          </div>
        )}

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="active" className="flex-1" data-testid="tab-active">
              Active ({activeBookings.length})
            </TabsTrigger>
            <TabsTrigger value="past" className="flex-1" data-testid="tab-past">
              History ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {activeBookings.length === 0 ? (
              <Card className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                  <Truck className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">No active bookings</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Ready to move? Book a mover in minutes.
                </p>
                <Button onClick={() => setLocation("/request-move")}>
                  <Plus className="w-4 h-4 mr-2" />
                  Book Your First Move
                </Button>
              </Card>
            ) : (
              activeBookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {pastBookings.length === 0 ? (
              <Card className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                  <Clock className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">No past bookings</h3>
                <p className="text-sm text-muted-foreground">
                  Your completed moves will appear here.
                </p>
              </Card>
            ) : (
              pastBookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} showActions={false} />
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Report Mover Dialog */}
        <AlertDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Report Safety Concern
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                {selectedBooking && selectedBooking.mover && (
                  <>
                    Report mover <strong>{selectedBooking.mover.user.name}</strong>? 
                    Our team will investigate and contact you via email.
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
