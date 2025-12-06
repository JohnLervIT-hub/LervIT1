import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, AlertTriangle, MapPin, Calendar, Package, ArrowRight, MessageCircle, Clock, CheckCircle2, XCircle, TrendingUp, Sparkles } from "lucide-react";
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="w-4 h-4" />;
      case "confirmed": return <CheckCircle2 className="w-4 h-4" />;
      case "in_transit": return <TrendingUp className="w-4 h-4" />;
      case "completed": return <CheckCircle2 className="w-4 h-4" />;
      case "cancelled": return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "confirmed": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "in_transit": return "bg-primary/10 text-primary border-primary/20";
      case "completed": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "cancelled": return "bg-red-500/10 text-red-600 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your bookings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-accent/5 to-transparent rounded-2xl p-6 sm:p-8 mb-8">
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-accent/10 rounded-full blur-2xl" />
          
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
                  <Package className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold">
                    Welcome back, {user?.name?.split(' ')[0] || 'there'}!
                  </h1>
                  <p className="text-muted-foreground">
                    Manage your moving requests
                  </p>
                </div>
              </div>
            </div>
            <Button 
              onClick={() => setLocation("/request-move")} 
              size="lg"
              className="shadow-lg shadow-primary/20"
              data-testid="button-new-booking"
            >
              <Plus className="w-5 h-5 mr-2" />
              New Booking
            </Button>
          </div>
          
          {/* Quick Stats */}
          <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <div className="bg-card/80 backdrop-blur-sm rounded-lg p-4 border border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Active</p>
              <p className="text-2xl font-bold text-primary">{activeBookings.length}</p>
            </div>
            <div className="bg-card/80 backdrop-blur-sm rounded-lg p-4 border border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Completed</p>
              <p className="text-2xl font-bold text-green-600">{pastBookings.filter(b => b.status === 'completed').length}</p>
            </div>
            <div className="bg-card/80 backdrop-blur-sm rounded-lg p-4 border border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Moves</p>
              <p className="text-2xl font-bold">{bookings?.length || 0}</p>
            </div>
            <div className="bg-card/80 backdrop-blur-sm rounded-lg p-4 border border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending</p>
              <p className="text-2xl font-bold text-amber-600">{activeBookings.filter(b => b.status === 'pending').length}</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-6 bg-muted/50 p-1">
            <TabsTrigger value="active" className="gap-2" data-testid="tab-active">
              <Clock className="w-4 h-4" />
              Active ({activeBookings.length})
            </TabsTrigger>
            <TabsTrigger value="past" className="gap-2" data-testid="tab-past">
              <CheckCircle2 className="w-4 h-4" />
              Completed ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {activeBookings.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="pt-12 pb-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <Package className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No active bookings</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    Ready to move? Book your first move and get matched with professional movers nearby.
                  </p>
                  <Button onClick={() => setLocation("/request-move")} size="lg">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Book Your First Move
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {activeBookings.map((booking) => (
                  <Card key={booking.id} className="overflow-hidden hover-elevate" data-testid={`card-booking-${booking.id}`}>
                    <div className="flex flex-col sm:flex-row">
                      {/* Status Indicator */}
                      <div className={`sm:w-2 h-2 sm:h-auto ${
                        booking.status === 'pending' ? 'bg-amber-500' :
                        booking.status === 'confirmed' ? 'bg-blue-500' :
                        booking.status === 'in_transit' ? 'bg-primary' : 'bg-muted'
                      }`} />
                      
                      <div className="flex-1 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <Badge className={`${getStatusColor(booking.status)} flex items-center gap-1.5`}>
                              {getStatusIcon(booking.status)}
                              <span className="capitalize">{booking.status.replace('_', ' ')}</span>
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              #{booking.id.slice(0, 8)}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-primary">
                              ${parseFloat(booking.price || "0").toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground">CAD</p>
                          </div>
                        </div>

                        {/* Route Display */}
                        <div className="relative flex items-start gap-3 mb-4">
                          <div className="flex flex-col items-center">
                            <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                              <MapPin className="w-4 h-4 text-green-600" />
                            </div>
                            <div className="w-0.5 h-8 bg-gradient-to-b from-green-500 to-primary my-1" />
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <MapPin className="w-4 h-4 text-primary" />
                            </div>
                          </div>
                          <div className="flex-1 space-y-4">
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Pickup</p>
                              <p className="font-medium line-clamp-1">{booking.pickupAddress}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Dropoff</p>
                              <p className="font-medium line-clamp-1">{booking.dropoffAddress}</p>
                            </div>
                          </div>
                        </div>

                        {/* Date & Mover Info */}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>{format(new Date(booking.preferredDate), "MMM dd, yyyy 'at' h:mm a")}</span>
                          </div>
                          {booking.mover && (
                            <div className="flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                              <span>Mover: {booking.mover.user.name}</span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2 pt-4 border-t">
                          <Button variant="outline" size="sm" onClick={() => handleViewDetails(booking.id)} data-testid={`button-view-${booking.id}`}>
                            View Details
                            <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                          {booking.moverId && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleMessage(booking.id)} data-testid={`button-message-${booking.id}`}>
                                <MessageCircle className="w-4 h-4 mr-1" />
                                Message
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleReportMover(booking)}
                                className="text-destructive hover:text-destructive"
                                data-testid={`button-report-${booking.id}`}
                              >
                                <AlertTriangle className="w-4 h-4 mr-1" />
                                Report
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {pastBookings.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="pt-12 pb-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No completed bookings yet</h3>
                  <p className="text-muted-foreground">Your completed moves will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {pastBookings.map((booking) => (
                  <Card key={booking.id} className="overflow-hidden opacity-80 hover:opacity-100 transition-opacity" data-testid={`card-booking-${booking.id}`}>
                    <div className="flex flex-col sm:flex-row">
                      <div className={`sm:w-2 h-2 sm:h-auto ${
                        booking.status === 'completed' ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      
                      <div className="flex-1 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <Badge className={`${getStatusColor(booking.status)} flex items-center gap-1.5`}>
                              {getStatusIcon(booking.status)}
                              <span className="capitalize">{booking.status}</span>
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              #{booking.id.slice(0, 8)}
                            </span>
                          </div>
                          <p className="text-lg font-bold">
                            ${parseFloat(booking.price || "0").toFixed(2)} CAD
                          </p>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          <span className="line-clamp-1">{booking.pickupAddress}</span>
                          <ArrowRight className="w-4 h-4 flex-shrink-0" />
                          <span className="line-clamp-1">{booking.dropoffAddress}</span>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span>{format(new Date(booking.preferredDate), "MMM dd, yyyy")}</span>
                          {booking.mover && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                              <span>Mover: {booking.mover.user.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
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
