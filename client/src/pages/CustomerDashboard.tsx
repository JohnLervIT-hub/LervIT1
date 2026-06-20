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
  Star,
  RotateCcw,
  AlertCircle
} from "lucide-react";
import { useLocation } from "wouter";
import { format, isToday, isTomorrow, formatDistanceToNow, isValid } from "date-fns";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState, useEffect } from "react";
import { useAnalytics } from "@/hooks/use-analytics";
import { CustomerDashboardSkeleton } from "@/components/DashboardSkeleton";
import { FadeIn, StaggerChildren, StaggerItem, PulseOnHover } from "@/components/PageTransition";
import { WelcomeTutorial } from "@/components/WelcomeTutorial";
import { FirstMovePromo } from "@/components/FirstMovePromo";

function safeFormatDate(dateStr: string | null | undefined, fmt: string, fallback = "TBD"): string {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (!isValid(d)) return fallback;
  return format(d, fmt);
}

type Booking = {
  id: string;
  customerId: string;
  moverId: string | null;
  enterprisePartnerId?: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  loadSize: string;
  preferredDate: string;
  status: string;
  price: string | null;
  paymentStatus?: string;
  hasReview?: boolean;
  mover?: {
    id: string;
    userId: string;
    moverImage: string | null;
    user: {
      id: string;
      name: string;
    };
  };
  partnerAssignment?: {
    driverName?: string | null;
  } | null;
};

const LOAD_SIZE_OPTIONS = [
  { value: 'boxes', label: 'Boxes Only (0-15 ft³)', class: 'A' },
  { value: 'medium', label: 'Medium (40-120 ft³)', class: 'C' },
  { value: 'large', label: 'Large (120-250 ft³)', class: 'D' },
  { value: 'apartment', label: 'Full Move (250+ ft³)', class: 'E' },
];

function getMoverName(mover: any): string {
  return mover?.name || mover?.user?.name || 'Mover';
}

export default function CustomerDashboard() {
  const { user, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  useAnalytics("customer_dashboard");
  // Read ?tab= query param so the bottom nav Activity shortcut jumps to "past"
  const [activeTab, setActiveTab] = useState<string>(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    return p === "past" ? "past" : "active";
  });

  useEffect(() => {
    const sync = () => {
      const p = new URLSearchParams(window.location.search).get("tab");
      setActiveTab(p === "past" ? "past" : "active");
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("lervit-navigation", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("lervit-navigation", sync);
    };
  }, []);

  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackBooking, setFeedbackBooking] = useState<Booking | null>(null);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [actualLoadSize, setActualLoadSize] = useState('');
  const [feedbackComment, setFeedbackComment] = useState('');

  const [surveyDialogOpen, setSurveyDialogOpen] = useState(false);
  const [surveyBooking, setSurveyBooking] = useState<Booking | null>(null);
  const [surveyNps, setSurveyNps] = useState(9);
  const [surveyEase, setSurveyEase] = useState(5);
  const [surveyMover, setSurveyMover] = useState(5);
  const [surveyComments, setSurveyComments] = useState('');

  const { data: bookings, isLoading, isError } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    enabled: !!user?.id,
    retry: 2,
  });

  // Show welcome tutorial for new customers who haven't completed onboarding
  useEffect(() => {
    if (user && user.role === "customer" && !user.hasCompletedOnboarding) {
      setShowTutorial(true);
    }
  }, [user]);

  // Uber-style auto-popup for pending reviews on completed bookings
  useEffect(() => {
    if (!bookings || isLoading || showTutorial || feedbackDialogOpen) return;
    
    // Find completed bookings that need reviews (no review yet)
    // Only prompt when mover has successfully completed the job (status === "completed")
    const pendingReviewBooking = bookings.find(
      (b) => b.status === "completed" && !b.hasReview && b.moverId
    );
    
    if (pendingReviewBooking) {
      // Small delay to let the page render first
      const timer = setTimeout(() => {
        setFeedbackBooking(pendingReviewBooking);
        setActualLoadSize(pendingReviewBooking.loadSize);
        setFeedbackDialogOpen(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [bookings, isLoading, showTutorial, feedbackDialogOpen]);

  // Auto-popup feedback survey for completed bookings older than 24 h (localStorage-gated)
  useEffect(() => {
    if (!bookings || isLoading || showTutorial || feedbackDialogOpen || surveyDialogOpen) return;
    const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;
    const candidate = bookings.find((b) => {
      if (b.status !== "completed") return false;
      const moved = new Date(b.preferredDate).getTime();
      if (Date.now() - moved < TWENTY_FOUR_H) return false;
      return !localStorage.getItem(`survey_done_${b.id}`);
    });
    if (!candidate) return;
    const timer = setTimeout(() => {
      setSurveyBooking(candidate);
      setSurveyDialogOpen(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [bookings, isLoading, showTutorial, feedbackDialogOpen, surveyDialogOpen]);

  const handleTutorialComplete = async () => {
    setShowTutorial(false);
    await refreshUser();
  };

  // Check if user is eligible for first-move discount promo
  const showFirstMovePromo = user && 
    user.role === "customer" && 
    !user.hasUsedFirstMoveDiscount && 
    user.hasCompletedOnboarding;

  const reportMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const booking = bookings?.find(b => b.id === bookingId);
      if (!booking || !booking.mover) {
        throw new Error("Booking or mover details not found");
      }

      return await apiRequest("POST", "/api/support-tickets", {
        subject: `Report: Mover ${getMoverName(booking.mover)} (Booking #${bookingId.slice(0, 8)})`,
        category: "mover_concern",
        priority: "high",
        description: `Customer ${user?.name} is reporting a concern about mover ${getMoverName(booking.mover)} for booking #${bookingId}. Please investigate.`,
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

  const feedbackMutation = useMutation({
    mutationFn: async (data: { bookingId: string; rating: number; actualLoadSize: string; comment: string }) => {
      const booking = bookings?.find(b => b.id === data.bookingId);
      if (!booking) throw new Error("Booking not found");
      
      // For partner bookings there is no mover record — moverId will be null which is now allowed
      const moverId = booking.moverId ?? null;
      
      // First, save the actual review to update mover's rating (skipped server-side when moverId is null)
      console.log('[Feedback] Submitting review:', { bookingId: data.bookingId, moverId, rating: data.rating });
      await apiRequest("POST", "/api/reviews", {
        bookingId: data.bookingId,
        moverId,
        customerId: user?.id,
        rating: data.rating,
        comment: data.comment || null,
      });
      
      // Then send learning metrics for AI training (optional, don't fail if this fails)
      const loadSizeChanged = data.actualLoadSize && data.actualLoadSize !== booking.loadSize;
      try {
        await apiRequest("POST", "/api/learning/booking-metrics", {
          bookingId: data.bookingId,
          estimatedVehicleClass: getClassFromLoadSize(booking.loadSize),
          actualVehicleClass: data.actualLoadSize ? getClassFromLoadSize(data.actualLoadSize) : getClassFromLoadSize(booking.loadSize),
          customerRating: data.rating,
          loadSizeAccurate: !loadSizeChanged,
          feedbackNotes: data.comment || undefined,
        });
      } catch (e) {
        console.log('[Feedback] Learning metrics optional, continuing...');
      }
      
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Review Submitted!",
        description: "Thank you for your feedback. The mover's rating has been updated.",
      });
      setFeedbackDialogOpen(false);
      setFeedbackBooking(null);
      resetFeedbackForm();
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/movers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
    },
    onError: (error: Error) => {
      console.error('[Feedback] Error submitting review:', error);
      toast({
        title: "Feedback Failed",
        description: error.message || "Unable to submit feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  const surveyMutation = useMutation({
    mutationFn: async (data: { bookingId: string; npsScore: number; easeRating: number; moverRating: number; comments: string }) => {
      return await apiRequest("POST", "/api/surveys", data);
    },
    onSuccess: () => {
      if (surveyBooking) {
        localStorage.setItem(`survey_done_${surveyBooking.id}`, "1");
      }
      toast({ title: "Thank you!", description: "Your feedback helps us improve LervIT." });
      setSurveyDialogOpen(false);
      setSurveyBooking(null);
      setSurveyNps(9);
      setSurveyEase(5);
      setSurveyMover(5);
      setSurveyComments('');
    },
    onError: () => {
      toast({ title: "Submission failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const getClassFromLoadSize = (loadSize: string): string => {
    const mapping: Record<string, string> = {
      'boxes': 'A',
      'small': 'B', 
      'medium': 'C',
      'large': 'D',
      'apartment': 'E',
    };
    return mapping[loadSize] || 'C';
  };

  const resetFeedbackForm = () => {
    setRating(5);
    setHoverRating(0);
    setActualLoadSize('');
    setFeedbackComment('');
  };

  const handleLeaveFeedback = (booking: Booking) => {
    setFeedbackBooking(booking);
    setActualLoadSize(booking.loadSize);
    setFeedbackDialogOpen(true);
  };

  const submitFeedback = () => {
    if (!feedbackBooking) return;
    feedbackMutation.mutate({
      bookingId: feedbackBooking.id,
      rating,
      actualLoadSize,
      comment: feedbackComment,
    });
  };

  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today for date comparisons
  
  // 6-stage move progress statuses that indicate an active/ongoing move
  const inProgressStatuses = ['en_route_to_pickup', 'loading', 'en_route_to_dropoff', 'unloading', 'in_transit'];
  
  // Payment-related statuses that need customer attention
  const paymentStatuses = ['pending_payment', 'payment_failed'];
  
  // Filter and sort active bookings: show all non-completed/cancelled bookings with future/today dates
  // Critical: Always show payment-related statuses regardless of date so customers can complete payment
  const activeBookings = bookings?.filter((b) => {
    const bookingDate = new Date(b.preferredDate);
    bookingDate.setHours(0, 0, 0, 0);
    const isPastDate = bookingDate < today;
    
    // Always include payment-related statuses - they need immediate attention
    if (paymentStatuses.includes(b.status)) return true;
    
    // For pending/confirmed: only show if date is today or future
    // Past-dated pending/confirmed bookings should go to Past section
    if (b.status === "pending" || b.status === "confirmed") {
      return !isPastDate; // Only show if NOT past
    }
    
    // Include in-progress statuses only if date is today or future
    // Past-dated in-progress bookings should go to Past section (missed moves)
    if (inProgressStatuses.includes(b.status)) {
      return !isPastDate;
    }
    
    // Exclude completed/cancelled (they go to past bookings)
    return false;
  })
    .sort((a, b) => {
      // Pending payment bookings go first (urgent - need to pay)
      if (a.status === "pending_payment" && b.status !== "pending_payment") return -1;
      if (b.status === "pending_payment" && a.status !== "pending_payment") return 1;
      // Payment failed goes next
      if (a.status === "payment_failed" && b.status !== "payment_failed") return -1;
      if (b.status === "payment_failed" && a.status !== "payment_failed") return 1;
      // Then by date
      return new Date(a.preferredDate).getTime() - new Date(b.preferredDate).getTime();
    }) || [];

  // Sort past bookings by date (most recent first)
  // Include: completed, cancelled, AND past-dated pending/confirmed bookings
  const pastBookings = bookings?.filter((b) => {
    // Always include completed/cancelled
    if (b.status === "completed" || b.status === "cancelled") return true;
    
    // Include past-dated pending/confirmed (jobs that never happened)
    const bookingDate = new Date(b.preferredDate);
    bookingDate.setHours(0, 0, 0, 0);
    const isPastDate = bookingDate < today;
    
    if ((b.status === "pending" || b.status === "confirmed") && isPastDate) {
      return true;
    }
    
    // Include past-dated in-progress bookings (missed moves)
    const inProgressStatuses = ['en_route_to_pickup', 'loading', 'en_route_to_dropoff', 'unloading', 'in_transit'];
    if (inProgressStatuses.includes(b.status) && isPastDate) {
      return true;
    }
    
    return false;
  })
    .sort((a, b) => new Date(b.preferredDate).getTime() - new Date(a.preferredDate).getTime()) || [];

  // Get the next upcoming booking (soonest date that hasn't passed)
  const upcomingBooking = activeBookings
    .filter(b => new Date(b.preferredDate) >= now)
    .sort((a, b) => new Date(a.preferredDate).getTime() - new Date(b.preferredDate).getTime())[0];

  const handleMessage = (id: string) => {
    setLocation(`/messages/${id}`);
  };

  const handleViewDetails = (id: string) => {
    setLocation(`/my-bookings?booking=${id}`);
  };

  const handleReportMover = (booking: Booking) => {
    if (!booking.mover) {
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
      case "pending_payment": return "Awaiting payment";
      case "payment_failed": return "Payment failed";
      case "pending": return "Finding your mover";
      case "confirmed": return "Mover confirmed";
      case "accepted": return "Moving company confirmed";
      case "assigned": return "Driver assigned";
      case "en_route_to_pickup": return "Mover on the way";
      case "loading": return "Loading items";
      case "en_route_to_dropoff": return "In transit";
      case "unloading": return "Unloading items";
      case "in_transit": return "Move in progress";
      case "completed": return "Completed";
      case "cancelled": return "Cancelled";
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending_payment": return "bg-orange-500/10 text-orange-600";
      case "payment_failed": return "bg-red-500/10 text-red-600";
      case "pending": return "bg-amber-500/10 text-amber-600";
      case "confirmed": return "bg-blue-500/10 text-blue-600";
      case "accepted": return "bg-blue-500/10 text-blue-600";
      case "assigned": return "bg-indigo-500/10 text-indigo-600";
      case "en_route_to_pickup": return "bg-green-500/10 text-green-600";
      case "loading": return "bg-green-500/10 text-green-600";
      case "en_route_to_dropoff": return "bg-green-500/10 text-green-600";
      case "unloading": return "bg-green-500/10 text-green-600";
      case "in_transit": return "bg-green-500/10 text-green-600";
      case "completed": return "bg-green-500/10 text-green-600";
      case "cancelled": return "bg-red-500/10 text-red-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getNextAction = (booking: Booking) => {
    switch (booking.status) {
      case "pending_payment":
        return { text: "Complete payment", icon: AlertTriangle, action: () => setLocation(`/payment/${booking.id}`) };
      case "payment_failed":
        return { text: "Retry payment", icon: AlertTriangle, action: () => setLocation(`/payment/${booking.id}`) };
      case "pending":
        return { text: "We're finding nearby movers", icon: Clock, action: null };
      case "confirmed":
        return { text: "Message your mover", icon: MessageCircle, action: () => handleMessage(booking.id) };
      case "accepted":
      case "assigned":
        return { text: "Contact support", icon: MessageCircle, action: () => handleMessage(booking.id) };
      case "en_route_to_pickup":
      case "loading":
      case "en_route_to_dropoff":
      case "unloading":
      case "in_transit":
        return { text: "Track your move", icon: TrendingUp, action: () => setLocation(`/track-trip/${booking.id}`) };
      default:
        return null;
    }
  };

  const getDateLabel = (dateStr: string | null | undefined) => {
    if (!dateStr) return "TBD";
    const date = new Date(dateStr);
    if (!isValid(date)) return "TBD";
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "EEEE, MMM d");
  };

  const firstName = user?.name?.split(' ')[0] || 'there';

  if (isLoading) {
    return <CustomerDashboardSkeleton />;
  }

  if (isError) {
    return (
      <div className="min-h-screen pt-20 pb-12 bg-background flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto px-4">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Could not load your bookings</h2>
          <p className="text-sm text-muted-foreground mb-4">There was a problem connecting to the server. Please check your connection and try again.</p>
          <Button onClick={() => window.location.reload()} size="sm">Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 bg-background">
      {/* Welcome Tutorial for new customers */}
      <WelcomeTutorial
        isOpen={showTutorial}
        onComplete={handleTutorialComplete}
        userName={user?.name || "there"}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        
        {/* Friendly Greeting */}
        <FadeIn>
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
        </FadeIn>

        {/* First Move Promo for eligible customers */}
        {showFirstMovePromo && (
          <div className="mb-6">
            <FirstMovePromo userName={user?.name || "there"} />
          </div>
        )}

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
                  {safeFormatDate(upcomingBooking.preferredDate, "h:mm a")} - {upcomingBooking.loadSize} load
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                <Card 
                  key={booking.id} 
                  className={`overflow-hidden ${
                    inProgressStatuses.includes(booking.status) 
                      ? "border-2 border-green-500/50 bg-gradient-to-br from-green-500/5 to-transparent" 
                      : ""
                  }`} 
                  data-testid={`card-booking-${booking.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-semibold">{getDateLabel(booking.preferredDate)}</p>
                        <p className="text-sm text-muted-foreground">
                          {safeFormatDate(booking.preferredDate, "h:mm a")}
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
                          <p className="font-medium text-sm">{getMoverName(booking.mover)}</p>
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
                        <p className="font-medium">{safeFormatDate(booking.preferredDate, "MMM d, yyyy")}</p>
                        <p className="text-sm text-muted-foreground">{booking.loadSize} load</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={getStatusColor(booking.status)}>
                          {booking.status === "completed" ? (
                            <><CheckCircle2 className="w-3 h-3 mr-1" /> Done</>
                          ) : (
                            <><XCircle className="w-3 h-3 mr-1" /> Cancelled</>
                          )}
                        </Badge>
                        {booking.price && (
                          <span className="text-sm font-semibold" data-testid={`text-price-${booking.id}`}>
                            ${parseFloat(booking.price).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 flex-shrink-0 text-green-600" />
                      <span className="line-clamp-1">{booking.pickupAddress}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <MapPin className="w-4 h-4 flex-shrink-0 text-primary" />
                      <span className="line-clamp-1">{booking.dropoffAddress}</span>
                    </div>

                    {booking.mover && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Moved by {getMoverName(booking.mover)}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-3 pt-3 border-t gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {booking.status === "completed" && !booking.hasReview && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleLeaveFeedback(booking)}
                            data-testid={`button-feedback-${booking.id}`}
                          >
                            <Star className="w-4 h-4 mr-1" />
                            Leave Feedback
                          </Button>
                        )}
                        {booking.status === "completed" && booking.hasReview && (
                          <span className="flex items-center text-sm text-muted-foreground">
                            <CheckCircle2 className="w-4 h-4 mr-1 text-green-500" />
                            Reviewed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewDetails(booking.id)}
                          data-testid={`button-view-past-${booking.id}`}
                        >
                          Details
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                        {booking.status === "completed" && (
                          <Button 
                            size="sm"
                            onClick={() => {
                              const params = new URLSearchParams();
                              params.set('pickup', booking.pickupAddress);
                              params.set('dropoff', booking.dropoffAddress);
                              if (booking.loadSize) params.set('loadSize', booking.loadSize);
                              params.set('resumeStep', '2');
                              setLocation(`/request-move?${params.toString()}`);
                            }}
                            data-testid={`button-rebook-${booking.id}`}
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Rebook
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Help Strip */}
        <Card className="mt-8 bg-muted/30">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Need help?</p>
                  <p className="text-xs text-muted-foreground">
                    Call us: <a href="tel:+18889820885" className="text-primary font-medium hover:underline" data-testid="link-toll-free">1-888-982-0885</a>
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <a href="/support" data-testid="link-contact-support">
                  Contact Us
                  <ChevronRight className="w-4 h-4 ml-1" />
                </a>
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
                    You're reporting an issue with <strong>{getMoverName(selectedBooking.mover)}</strong>.
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

        {/* Post-Move Feedback Dialog */}
        <Dialog open={feedbackDialogOpen} onOpenChange={(open) => {
          if (!open && feedbackBooking && !feedbackBooking.hasReview) {
            toast({
              title: "Review Required",
              description: "Please rate your mover to continue using the app.",
              variant: "destructive",
            });
            return;
          }
          setFeedbackDialogOpen(open);
          if (!open) resetFeedbackForm();
        }}>
          <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => {
            if (feedbackBooking && !feedbackBooking.hasReview) {
              e.preventDefault();
            }
          }}>
            <DialogHeader className="text-center">
              {feedbackBooking?.mover && (
                <div className="flex flex-col items-center mb-2">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-muted border-4 border-primary/20 mb-3">
                    {feedbackBooking.mover.moverImage ? (
                      <img 
                        src={feedbackBooking.mover.moverImage} 
                        alt={getMoverName(feedbackBooking.mover)} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary/10">
                        <Truck className="w-8 h-8 text-primary" />
                      </div>
                    )}
                  </div>
                  <p className="text-lg font-semibold">{getMoverName(feedbackBooking.mover)}</p>
                </div>
              )}
              <DialogTitle className="flex items-center justify-center gap-2">
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                Rate Your Move
              </DialogTitle>
              <DialogDescription className="text-center">
                Your rating helps other customers find great movers
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label>Rate your experience</Label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 transition-transform hover:scale-110 focus:outline-none"
                      data-testid={`button-star-${star}`}
                    >
                      <Star 
                        className={`w-8 h-8 transition-colors ${
                          star <= (hoverRating || rating)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-muted-foreground'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {rating === 5 && "Excellent!"}
                  {rating === 4 && "Great!"}
                  {rating === 3 && "Good"}
                  {rating === 2 && "Fair"}
                  {rating === 1 && "Needs improvement"}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Was the load size estimate accurate?</Label>
                <RadioGroup 
                  value={actualLoadSize} 
                  onValueChange={setActualLoadSize}
                  className="grid grid-cols-1 gap-2"
                >
                  {LOAD_SIZE_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <RadioGroupItem 
                        value={option.value} 
                        id={option.value}
                        data-testid={`radio-loadsize-${option.value}`}
                      />
                      <Label htmlFor={option.value} className="text-sm cursor-pointer">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {feedbackBooking && actualLoadSize && actualLoadSize !== feedbackBooking.loadSize && (
                  <p className="text-xs text-amber-600">
                    Thanks! This helps our AI estimate better next time.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-comment">Additional comments (optional)</Label>
                <Textarea
                  id="feedback-comment"
                  placeholder="Any other feedback about your move..."
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  rows={3}
                  data-testid="textarea-feedback"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => setFeedbackDialogOpen(false)}
                data-testid="button-cancel-feedback"
              >
                Cancel
              </Button>
              <Button 
                onClick={submitFeedback}
                disabled={feedbackMutation.isPending}
                data-testid="button-submit-feedback"
              >
                {feedbackMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Feedback"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Post-move feedback survey (NPS + ease + mover rating) */}
        <Dialog open={surveyDialogOpen} onOpenChange={setSurveyDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-center">How was your experience?</DialogTitle>
              <DialogDescription className="text-center">Quick 3-question survey — takes 30 seconds</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">How likely are you to recommend LervIT? (0–10)</Label>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSurveyNps(n)}
                      className={`w-8 h-8 rounded text-xs font-medium border transition-colors ${surveyNps === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                      data-testid={`button-nps-${n}`}
                    >{n}</button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{surveyNps <= 6 ? "Needs improvement" : surveyNps <= 8 ? "Good" : "Excellent!"}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">How easy was the booking process? (1–5)</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSurveyEase(n)}
                      className={`w-9 h-9 rounded border text-sm font-medium transition-colors ${surveyEase === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                      data-testid={`button-ease-${n}`}
                    >{n}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Rate your mover (1–5)</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSurveyMover(n)}
                      className={`w-9 h-9 rounded border text-sm font-medium transition-colors ${surveyMover === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                      data-testid={`button-mover-rating-${n}`}
                    >{n}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="survey-comments" className="text-sm font-medium">Comments (optional)</Label>
                <Textarea
                  id="survey-comments"
                  placeholder="Anything else you'd like to share?"
                  value={surveyComments}
                  onChange={(e) => setSurveyComments(e.target.value)}
                  rows={2}
                  data-testid="textarea-survey-comments"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" size="sm" onClick={() => { if (surveyBooking) localStorage.setItem(`survey_done_${surveyBooking.id}`, "1"); setSurveyDialogOpen(false); }}>
                Skip
              </Button>
              <Button
                onClick={() => surveyBooking && surveyMutation.mutate({ bookingId: surveyBooking.id, npsScore: surveyNps, easeRating: surveyEase, moverRating: surveyMover, comments: surveyComments })}
                disabled={surveyMutation.isPending}
                data-testid="button-submit-survey"
              >
                {surveyMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
