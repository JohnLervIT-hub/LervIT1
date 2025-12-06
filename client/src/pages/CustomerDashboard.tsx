import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Loader2, 
  AlertTriangle, 
  MapPin, 
  Calendar, 
  Package, 
  ArrowRight, 
  MessageCircle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  Sparkles,
  HelpCircle,
  Phone,
  ChevronRight,
  Truck,
  Star
} from "lucide-react";
import { useLocation } from "wouter";
import { format, isToday, isTomorrow, formatDistanceToNow } from "date-fns";
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

  // Get the next upcoming booking (soonest date)
  const upcomingBooking = activeBookings
    .filter(b => new Date(b.preferredDate) >= new Date())
    .sort((a, b) => new Date(a.preferredDate).getTime() - new Date(b.preferredDate).getTime())[0];

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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Finding your mover";
      case "confirmed": return "Mover confirmed";
      case "in_transit": return "Move in progress";
      case "completed": return "Completed";
      case "cancelled": return "Cancelled";
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-500/10 text-amber-600";
      case "confirmed": return "bg-blue-500/10 text-blue-600";
      case "in_transit": return "bg-primary/10 text-primary";
      case "completed": return "bg-green-500/10 text-green-600";
      case "cancelled": return "bg-red-500/10 text-red-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getNextAction = (booking: Booking) => {
    switch (booking.status) {
      case "pending":
        return { text: "We're finding nearby movers", icon: Clock, action: null };
      case "confirmed":
        return { text: "Message your mover", icon: MessageCircle, action: () => handleMessage(booking.id) };
      case "in_transit":
        return { text: "Track your move", icon: TrendingUp, action: () => handleViewDetails(booking.id) };
      default:
        return null;
    }
  };

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "EEEE, MMM d");
  };

  const firstName = user?.name?.split(' ')[0] || 'there';

  if (isLoading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your moves...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        
        {/* Friendly Greeting */}
        <div className="py-6 sm:py-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="text-greeting">
            Hey {firstName}!
          </h1>
          <p className="text-muted-foreground">
            {activeBookings.length > 0 
              ? "Here's what's happening with your moves."
              : "Ready to make your next move stress-free?"
            }
          </p>
        </div>

        {/* Upcoming Move Highlight */}
        {upcomingBooking && (
          <Card className="mb-6 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Truck className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium text-primary">Your next move</span>
              </div>
              
              <div className="mb-4">
                <p className="text-xl font-bold mb-1">
                  {getDateLabel(upcomingBooking.preferredDate)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(upcomingBooking.preferredDate), "h:mm a")} - {upcomingBooking.loadSize} load
                </p>
              </div>

              <div className="flex items-start gap-3 mb-4 p-3 bg-card rounded-lg">
                <div className="flex flex-col items-center pt-1">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <div className="w-0.5 h-6 bg-border my-1" />
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <div className="flex-1 space-y-3 text-sm">
                  <p className="line-clamp-1">{upcomingBooking.pickupAddress}</p>
                  <p className="line-clamp-1">{upcomingBooking.dropoffAddress}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge className={getStatusColor(upcomingBooking.status)}>
                  {getStatusLabel(upcomingBooking.status)}
                </Badge>
                
                {getNextAction(upcomingBooking)?.action && (
                  <Button 
                    size="sm" 
                    onClick={getNextAction(upcomingBooking)!.action!}
                    data-testid="button-next-action"
                  >
                    {getNextAction(upcomingBooking)!.text}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button 
            onClick={() => setLocation("/request-move")} 
            className="h-auto py-4 flex-col gap-2"
            data-testid="button-new-booking"
          >
            <Plus className="w-6 h-6" />
            <span>New Move</span>
          </Button>
          <Button 
            variant="outline"
            onClick={() => setLocation("/support")} 
            className="h-auto py-4 flex-col gap-2"
            data-testid="button-get-help"
          >
            <HelpCircle className="w-6 h-6" />
            <span>Get Help</span>
          </Button>
        </div>

        {/* All Bookings */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="w-full mb-4 bg-muted/50 p-1">
            <TabsTrigger value="active" className="flex-1 gap-2" data-testid="tab-active">
              <Clock className="w-4 h-4" />
              Active ({activeBookings.length})
            </TabsTrigger>
            <TabsTrigger value="past" className="flex-1 gap-2" data-testid="tab-past">
              <CheckCircle2 className="w-4 h-4" />
              Past ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-3 mt-0">
            {activeBookings.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <Package className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No moves scheduled</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    Moving soon? We'll match you with trusted local movers in minutes.
                  </p>
                  <Button onClick={() => setLocation("/request-move")} size="lg">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Plan Your Move
                  </Button>
                </CardContent>
              </Card>
            ) : (
              activeBookings.map((booking) => (
                <Card key={booking.id} className="overflow-hidden" data-testid={`card-booking-${booking.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-semibold">{getDateLabel(booking.preferredDate)}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(booking.preferredDate), "h:mm a")}
                        </p>
                      </div>
                      <Badge className={getStatusColor(booking.status)}>
                        {getStatusLabel(booking.status)}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <MapPin className="w-4 h-4 flex-shrink-0 text-green-600" />
                      <span className="line-clamp-1 flex-1">{booking.pickupAddress}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                      <MapPin className="w-4 h-4 flex-shrink-0 text-primary" />
                      <span className="line-clamp-1 flex-1">{booking.dropoffAddress}</span>
                    </div>

                    {booking.mover && (
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg mb-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Truck className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{booking.mover.user.name}</p>
                          <p className="text-xs text-muted-foreground">Your mover</p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleMessage(booking.id)}
                          data-testid={`button-message-${booking.id}`}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t">
                      <p className="font-bold text-lg">
                        ${parseFloat(booking.price || "0").toFixed(2)} <span className="text-sm font-normal text-muted-foreground">CAD</span>
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleViewDetails(booking.id)}
                        data-testid={`button-view-${booking.id}`}
                      >
                        Details
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-3 mt-0">
            {pastBookings.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <Star className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No past moves yet</h3>
                  <p className="text-muted-foreground">
                    Your completed moves will show up here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              pastBookings.map((booking) => (
                <Card key={booking.id} className="overflow-hidden" data-testid={`card-booking-${booking.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-medium">{format(new Date(booking.preferredDate), "MMM d, yyyy")}</p>
                        <p className="text-sm text-muted-foreground">{booking.loadSize} load</p>
                      </div>
                      <Badge className={getStatusColor(booking.status)}>
                        {booking.status === "completed" ? (
                          <><CheckCircle2 className="w-3 h-3 mr-1" /> Done</>
                        ) : (
                          <><XCircle className="w-3 h-3 mr-1" /> Cancelled</>
                        )}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="line-clamp-1">{booking.pickupAddress}</span>
                      <ArrowRight className="w-4 h-4 flex-shrink-0" />
                      <span className="line-clamp-1">{booking.dropoffAddress}</span>
                    </div>

                    {booking.mover && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Moved by {booking.mover.user.name}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Help Strip */}
        <Card className="mt-8 bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Need help?</p>
                  <p className="text-xs text-muted-foreground">We're here for you</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/support")}>
                Contact Us
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Report Mover Dialog */}
        <AlertDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Report a Concern
              </AlertDialogTitle>
              <AlertDialogDescription>
                {selectedBooking && selectedBooking.mover && (
                  <>
                    You're reporting an issue with <strong>{selectedBooking.mover.user.name}</strong>.
                    <br /><br />
                    Our team will review this right away and reach out to you by email. 
                    If you're in immediate danger, please call 911.
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
                    Sending...
                  </>
                ) : (
                  "Send Report"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
