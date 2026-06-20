import { useQuery, useMutation } from "@tanstack/react-query";
import { openTel } from "@/lib/native";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MapPin, Calendar, Package, DollarSign, MessageCircle, Star, ChevronDown, Sparkles, CreditCard, CheckCircle2, XCircle, Navigation, Clock, TrendingUp, ArrowRight, AlertTriangle, Loader2, Info, ImageOff, Truck, Phone, Shield, User, X, ZoomIn, ChevronLeft, ChevronRight as ChevronRightIcon, Pencil, RotateCcw, ListChecks, ChevronUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { format, isValid } from "date-fns";

import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useCallback } from "react";
import { generatePriceExplanation, AI_FEATURES } from "@shared/ai";
import EditBookingForm from "@/components/EditBookingForm";

function safeFormatDate(dateStr: string | null | undefined, fmt: string, fallback = "TBD"): string {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (!isValid(d)) return fallback;
  return format(d, fmt);
}

// Constants for pending payment timeout (must match server)
const PENDING_PAYMENT_TIMEOUT_MINUTES = 120; // 2 hours

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
  baseFee: string | null;
  distanceFee: string | null;
  loadFee: string | null;
  moverTravelFee: string | null;
  pickupDifficultyFee: string | null;
  dropoffDifficultyFee: string | null;
  heavyItemFee: string | null;
  subtotal: string | null;
  numberOfMovers?: number;
  pickupDifficulty?: string;
  dropoffDifficulty?: string;
  heavyItem?: boolean;
  paymentStatus: string | null;
  createdAt: string;
  hasReview?: boolean;
  partnerAvgRating?: number | null;
  enterprisePartnerId?: string | null;
  mover: {
    id: string;
    name: string;
    phone?: string;
    moverImage?: string;
    vehicleType: string;
    vehicleColor?: string;
    vehicleModel?: string;
    licensePlate?: string;
    rating: string;
    completedTrips?: number;
    isVerified?: boolean;
  } | null;
  partnerAssignment: {
    driverName: string | null;
    driverPhone: string | null;
    driverPhoto: string | null;
    teamName: string | null;
    vehicleType: string | null;
    vehiclePlate: string | null;
    assignedAt: string;
    completedMoves: number | null;
  } | null;
};

export default function MyBookings() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  // State for image preview dialog
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  
  // State for specific booking view from URL query param
  const [focusedBookingId, setFocusedBookingId] = useState<string | null>(null);
  
  // State for edit booking dialog
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);

  // State for status timeline dialog (partner bookings)
  const [timelineBookingId, setTimelineBookingId] = useState<string | null>(null);

  // Task 2: Post-move review modal state
  const [reviewModalBooking, setReviewModalBooking] = useState<Booking | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Task 5: Status timeline open state (per booking)
  const [openTimelines, setOpenTimelines] = useState<Record<string, boolean>>({});
  
  // State for countdown timer refresh
  const [countdownTick, setCountdownTick] = useState(0);
  
  // Update countdown every 30 seconds for pending_payment bookings
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdownTick(t => t + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);
  
  // Calculate remaining time for pending_payment bookings
  const getCountdownInfo = useCallback((createdAt: string) => {
    const created = new Date(createdAt).getTime();
    const expiresAt = created + PENDING_PAYMENT_TIMEOUT_MINUTES * 60 * 1000;
    const remaining = expiresAt - Date.now();
    
    if (remaining <= 0) {
      return { expired: true, minutes: 0, text: "Expired" };
    }
    
    const minutes = Math.floor(remaining / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return { expired: false, minutes, text: `${hours}h ${mins}m remaining` };
    }
    return { expired: false, minutes, text: `${mins} min remaining` };
  }, [countdownTick]);
  
  // Parse URL for specific booking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('booking');
    setFocusedBookingId(bookingId);
  }, [location]);

  const { data: bookings, isLoading, isError } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    enabled: !!user?.id,
    retry: 2,
  });

  // Task 2: Trigger review modal for first unseen completed booking
  useEffect(() => {
    if (!bookings) return;
    const target = bookings.find(
      (b) =>
        b.status === "completed" &&
        b.mover &&
        !b.hasReview &&
        !localStorage.getItem(`review_prompted_${b.id}`)
    );
    if (target) setReviewModalBooking(target);
  }, [bookings]);

  const submitReview = async () => {
    if (!reviewModalBooking || !user) return;
    setIsSubmittingReview(true);
    try {
      await apiRequest("POST", "/api/reviews", {
        bookingId: reviewModalBooking.id,
        moverId: reviewModalBooking.mover?.id,
        customerId: user.id,
        rating: reviewRating,
        comment: reviewComment.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Review submitted", description: "Thank you for your feedback!" });
    } catch {
      toast({ title: "Could not submit review", variant: "destructive" });
    } finally {
      localStorage.setItem(`review_prompted_${reviewModalBooking.id}`, "1");
      setIsSubmittingReview(false);
      setReviewModalBooking(null);
      setReviewRating(5);
      setReviewComment("");
    }
  };

  const dismissReviewModal = () => {
    if (reviewModalBooking) localStorage.setItem(`review_prompted_${reviewModalBooking.id}`, "1");
    setReviewModalBooking(null);
    setReviewRating(5);
    setReviewComment("");
  };
  
  // Sort and filter bookings with safe date handling
  const now = new Date();
  const safeParseDate = (date: unknown): Date => {
    if (!date) return new Date(0);
    try {
      return new Date(date as string);
    } catch {
      return new Date(0);
    }
  };
  
  const sortedBookings = bookings
    ?.filter(b => {
      if (!b) return false;
      return true; // Show all bookings
    })
    .sort((a, b) => {
      // Priority 1: Pending payment bookings go first (urgent - need to pay)
      if (a.status === "pending_payment" && b.status !== "pending_payment") return -1;
      if (b.status === "pending_payment" && a.status !== "pending_payment") return 1;
      
      // Priority 2: Active bookings before completed/cancelled
      const aIsActive = ["pending", "confirmed", "in_transit", "payment_failed"].includes(a.status) || a.paymentStatus === "failed";
      const bIsActive = ["pending", "confirmed", "in_transit", "payment_failed"].includes(b.status) || b.paymentStatus === "failed";
      
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      
      // Within same priority group: sort by date descending (newest first)
      // Use preferredDate for scheduling context, fallback to createdAt
      const aDate = safeParseDate(a.preferredDate || a.createdAt).getTime();
      const bDate = safeParseDate(b.preferredDate || b.createdAt).getTime();
      return bDate - aDate; // Descending order (newest first)
    }) || [];
    
  // Filter to show only focused booking if URL param exists
  const displayBookings = focusedBookingId 
    ? sortedBookings.filter(b => b.id === focusedBookingId)
    : sortedBookings;
    
  const handleImageClick = (images: string[], index: number) => {
    setPreviewImages(images);
    setPreviewIndex(index);
    setPreviewImage(images[index]);
  };
  
  const handlePrevImage = () => {
    const newIndex = (previewIndex - 1 + previewImages.length) % previewImages.length;
    setPreviewIndex(newIndex);
    setPreviewImage(previewImages[newIndex]);
  };
  
  const handleNextImage = () => {
    const newIndex = (previewIndex + 1) % previewImages.length;
    setPreviewIndex(newIndex);
    setPreviewImage(previewImages[newIndex]);
  };
  
  const clearFocusedBooking = () => {
    setFocusedBookingId(null);
    setLocation('/my-bookings');
  };

  const cancelBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest("PATCH", `/api/bookings/${bookingId}`, { status: "cancelled" });
    },
    onSuccess: () => {
      // Invalidate all booking-related queries
      queryClient.invalidateQueries({ predicate: (query) => 
        query.queryKey[0]?.toString().includes('/api/bookings') || false
      });
      toast({
        title: "Booking cancelled",
        description: "Your booking has been cancelled successfully.",
      });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending_payment": return <CreditCard className="w-4 h-4" />;
      case "pending": return <Clock className="w-4 h-4" />;
      case "confirmed": return <CheckCircle2 className="w-4 h-4" />;
      case "accepted": return <CheckCircle2 className="w-4 h-4" />;
      case "assigned": return <CheckCircle2 className="w-4 h-4" />;
      case "in_transit": return <TrendingUp className="w-4 h-4" />;
      case "completed": return <CheckCircle2 className="w-4 h-4" />;
      case "cancelled": return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  // Task 5: Status timeline steps and helper
  const TIMELINE_STEPS = [
    { label: "Booked", statuses: ["pending_payment", "pending"] },
    { label: "Confirmed", statuses: ["confirmed", "accepted", "assigned"] },
    { label: "En Route", statuses: ["en_route_to_pickup"] },
    { label: "Arrived", statuses: ["loading"] },
    { label: "In Progress", statuses: ["en_route_to_dropoff", "unloading", "in_transit"] },
    { label: "Completed", statuses: ["completed"] },
  ];

  const STATUS_RANK: Record<string, number> = {
    pending_payment: 0, pending: 1, confirmed: 2, accepted: 2, assigned: 2,
    en_route_to_pickup: 3, loading: 4, en_route_to_dropoff: 5, unloading: 5, in_transit: 5,
    completed: 6,
  };

  const getTimelineStepState = (stepStatuses: string[], bookingStatus: string): "completed" | "current" | "upcoming" => {
    const bookingRank = STATUS_RANK[bookingStatus] ?? -1;
    const stepRank = Math.min(...stepStatuses.map((s) => STATUS_RANK[s] ?? 0));
    if (bookingRank > stepRank) return "completed";
    if (stepStatuses.includes(bookingStatus)) return "current";
    return "upcoming";
  };

  const StatusTimeline = ({ bookingStatus, bookingId }: { bookingStatus: string; bookingId: string }) => {
    if (bookingStatus === "cancelled") return null;
    const isOpen = openTimelines[bookingId] ?? false;
    return (
      <div className="mt-4 border-t pt-4">
        <button
          onClick={() => setOpenTimelines((prev) => ({ ...prev, [bookingId]: !isOpen }))}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          data-testid={`button-timeline-toggle-${bookingId}`}
        >
          <ListChecks className="w-3.5 h-3.5" />
          <span>Move Progress</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
        </button>
        {isOpen && (
          <div className="mt-3 flex items-center gap-0 overflow-x-auto pb-1">
            {TIMELINE_STEPS.map((step, i) => {
              const state = getTimelineStepState(step.statuses, bookingStatus);
              return (
                <div key={step.label} className="flex items-center min-w-0">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      state === "completed" ? "bg-green-500" :
                      state === "current" ? "bg-blue-500" :
                      "bg-muted border border-muted-foreground/30"
                    }`}>
                      {state === "completed" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      ) : state === "current" ? (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                      )}
                    </div>
                    <span className={`text-[10px] font-medium whitespace-nowrap ${
                      state === "completed" ? "text-green-600" :
                      state === "current" ? "text-blue-600 font-semibold" :
                      "text-muted-foreground"
                    }`}>{step.label}</span>
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div className={`h-0.5 w-6 flex-shrink-0 mx-1 mb-4 ${
                      getTimelineStepState(TIMELINE_STEPS[i + 1].statuses, bookingStatus) !== "upcoming" ||
                      state === "completed" ? "bg-green-500" : "bg-muted"
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending_payment": return "bg-orange-500/10 text-orange-600 border-orange-500/20";
      case "pending": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "confirmed": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "accepted": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "assigned": return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
      case "in_transit": return "bg-primary/10 text-primary border-primary/20";
      case "completed": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "cancelled": return "bg-red-500/10 text-red-600 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getPaymentStatusColor = (paymentStatus: string | null) => {
    if (!paymentStatus || paymentStatus === 'pending') return 'bg-amber-500/10 text-amber-600';
    if (paymentStatus === 'succeeded') return 'bg-green-500/10 text-green-600';
    if (paymentStatus === 'failed') return 'bg-red-500/10 text-red-600';
    return 'bg-muted text-muted-foreground';
  };

  const getPaymentStatusLabel = (paymentStatus: string | null) => {
    if (!paymentStatus || paymentStatus === 'pending') return 'Payment Pending';
    if (paymentStatus === 'succeeded') return 'Paid';
    if (paymentStatus === 'failed') return 'Payment Failed';
    return 'Unknown';
  };

  if (!user) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-8 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
            <h2 className="text-xl font-semibold mb-2">Login Required</h2>
            <p className="text-muted-foreground mb-4">Please log in to view your bookings.</p>
            <Button onClick={() => setLocation("/login")}>Log In</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 py-6 mb-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">My Bookings</h1>
            <p className="text-muted-foreground">Track and manage your move requests</p>
          </div>
          <Button 
            onClick={() => setLocation("/request-move")}
            data-testid="button-new-move"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            New Move
          </Button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading your bookings...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <p className="text-muted-foreground mb-4">Could not load your bookings. Please try again.</p>
            <Button onClick={() => window.location.reload()} size="sm" variant="outline">Retry</Button>
          </div>
        ) : !sortedBookings || sortedBookings.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <Package className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No bookings yet</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Ready to move? We'll match you with trusted local movers in minutes.
              </p>
              <Button onClick={() => setLocation("/request-move")} data-testid="button-book-move">
                <Sparkles className="w-4 h-4 mr-2" />
                Book Your First Move
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Back button when viewing specific booking */}
            {focusedBookingId && (
              <Button 
                variant="outline" 
                onClick={clearFocusedBooking}
                className="mb-4"
                data-testid="button-back-all-bookings"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back to All Bookings
              </Button>
            )}
            {displayBookings.map((booking) => (
              <Card key={booking.id} className="overflow-hidden" data-testid={`card-booking-${booking.id}`}>
                {/* Status Bar */}
                <div className={`h-1 ${
                  booking.status === 'pending_payment' ? 'bg-orange-500' :
                  booking.status === 'pending' ? 'bg-amber-500' :
                  booking.status === 'confirmed' ? 'bg-blue-500' :
                  booking.status === 'in_transit' ? 'bg-primary' :
                  booking.status === 'completed' ? 'bg-green-500' : 'bg-red-500'
                }`} />
                
                {/* Urgent Payment Banner for pending_payment bookings */}
                {booking.status === 'pending_payment' && (
                  <div className="bg-orange-500/10 border-b border-orange-500/20 px-6 py-3" data-testid={`banner-payment-countdown-${booking.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-orange-600 animate-pulse" />
                        <span className="text-sm font-medium text-orange-600">
                          Complete payment to notify movers
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/30">
                          <Clock className="w-3 h-3 mr-1" />
                          {getCountdownInfo(booking.createdAt).text}
                        </Badge>
                        <Button
                          size="sm"
                          onClick={() => setLocation(`/payment/${booking.id}`)}
                          className="bg-orange-500 hover:bg-orange-600 text-white"
                          data-testid={`button-urgent-pay-${booking.id}`}
                        >
                          <CreditCard className="w-3 h-3 mr-1" />
                          Pay Now
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                
                <CardContent className="p-6">
                  {/* Header */}
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-xl font-bold">Move #{booking.id.slice(0, 8)}</h2>
                        <Badge className={`${getStatusColor(booking.status)} flex items-center gap-1.5`} data-testid={`badge-status-${booking.id}`}>
                          {getStatusIcon(booking.status)}
                          <span className="capitalize">{booking.status.replace('_', ' ')}</span>
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Booked on {safeFormatDate(booking.createdAt, "MMMM d, yyyy")}
                      </p>
                    </div>
                    <div className="text-right">
                      {booking.price && (
                        <>
                          <p className="text-2xl font-bold text-primary">${parseFloat(booking.price).toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">CAD</p>
                        </>
                      )}
                      {booking.status === 'confirmed' && booking.price && (
                        <Badge className={`mt-2 ${getPaymentStatusColor(booking.paymentStatus)}`} data-testid={`badge-payment-${booking.id}`}>
                          {booking.paymentStatus === 'succeeded' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <CreditCard className="w-3 h-3 mr-1" />}
                          {getPaymentStatusLabel(booking.paymentStatus)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Route Display */}
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div className="relative flex items-start gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500">
                          <span className="text-xs font-bold text-green-600">A</span>
                        </div>
                        <div className="w-0.5 h-12 bg-gradient-to-b from-green-500 to-primary my-1" />
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary">
                          <span className="text-xs font-bold text-primary">B</span>
                        </div>
                      </div>
                      <div className="flex-1 space-y-6">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pickup</p>
                          <p className="font-medium" data-testid={`text-pickup-${booking.id}`}>{booking.pickupAddress}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Dropoff</p>
                          <p className="font-medium" data-testid={`text-dropoff-${booking.id}`}>{booking.dropoffAddress}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-muted/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Date & Time</p>
                        </div>
                        <p className="font-medium">{safeFormatDate(booking.preferredDate, "MMM d, yyyy")}</p>
                        <p className="text-sm text-muted-foreground">{safeFormatDate(booking.preferredDate, "h:mm a")}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Package className="w-4 h-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Load Size</p>
                        </div>
                        <p className="font-medium capitalize">{booking.loadSize}</p>
                        {booking.numberOfMovers && (
                          <p className="text-sm text-muted-foreground">{booking.numberOfMovers} mover{booking.numberOfMovers > 1 ? 's' : ''}</p>
                        )}
                      </div>
                      {booking.distance && (
                        <div className="bg-muted/30 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Distance</p>
                          </div>
                          <p className="font-medium" data-testid={`text-distance-${booking.id}`}>{parseFloat(booking.distance).toFixed(1)} km</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Uber-Style Driver Card */}
                  {booking.mover && (
                    <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-5 mb-4 border border-primary/20" data-testid={`card-mover-${booking.id}`}>
                      <div className="flex items-center gap-1 mb-3">
                        <User className="w-4 h-4 text-primary" />
                        <h4 className="font-semibold text-sm text-primary">Your Mover</h4>
                        {booking.mover.isVerified && (
                          <Badge className="ml-2 bg-green-500 text-xs">
                            <Shield className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <Avatar className="w-16 h-16 border-2 border-primary/30">
                          <AvatarImage src={booking.mover.moverImage || undefined} alt={booking.mover.name} />
                          <AvatarFallback className="bg-primary/20 text-primary text-lg font-bold">
                            {booking.mover.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'M'}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-lg" data-testid={`text-mover-name-${booking.id}`}>{booking.mover.name}</h3>
                            <div className="flex items-center gap-1 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                              <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                              <span className="text-sm font-semibold" data-testid={`text-mover-rating-${booking.id}`}>
                                {parseFloat(booking.mover.rating).toFixed(1)}
                              </span>
                            </div>
                          </div>
                          
                          {booking.mover.completedTrips !== undefined && (
                            <p className="text-sm text-muted-foreground" data-testid={`text-mover-trips-${booking.id}`}>
                              {booking.mover.completedTrips} completed moves
                            </p>
                          )}
                        </div>
                      </div>

                      <Separator className="my-4" />

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Truck className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Vehicle</p>
                            <p className="font-medium text-sm" data-testid={`text-mover-vehicle-${booking.id}`}>
                              {booking.mover.vehicleColor && `${booking.mover.vehicleColor} `}
                              {booking.mover.vehicleType}
                            </p>
                            {booking.mover.vehicleModel && (
                              <p className="text-xs text-muted-foreground">{booking.mover.vehicleModel}</p>
                            )}
                          </div>
                        </div>
                        
                        {booking.mover.licensePlate && (
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center border-2 border-dashed">
                              <span className="text-xs font-bold">LP</span>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">License Plate</p>
                              <p className="font-bold text-sm tracking-wider" data-testid={`text-mover-plate-${booking.id}`}>
                                {booking.mover.licensePlate}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {booking.mover.phone && booking.status !== "completed" && booking.status !== "cancelled" && (
                        <>
                          <Separator className="my-4" />
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full"
                            onClick={() => openTel(booking.mover?.phone ?? '')}
                            data-testid={`button-call-mover-${booking.id}`}
                          >
                            <Phone className="w-4 h-4 mr-2" />
                            Call {booking.mover.name?.split(' ')[0]}
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Partner-Assigned Driver Card */}
                  {booking.partnerAssignment && (
                    <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 rounded-xl p-5 mb-4 border border-blue-500/20" data-testid={`card-partner-driver-${booking.id}`}>
                      <div className="flex items-center gap-1 mb-3">
                        <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <h4 className="font-semibold text-sm text-blue-600 dark:text-blue-400">Your Assigned Driver</h4>
                      </div>

                      <div className="flex items-center gap-4">
                        <Avatar className="w-16 h-16 border-2 border-blue-500/30">
                          <AvatarImage src={booking.partnerAssignment.driverPhoto ?? undefined} alt={booking.partnerAssignment.driverName ?? "Driver"} />
                          <AvatarFallback className="bg-blue-500/20 text-blue-700 dark:text-blue-300 text-lg font-bold">
                            {booking.partnerAssignment.driverName
                              ? booking.partnerAssignment.driverName.split(" ").map(n => n[0]).join("").toUpperCase()
                              : "D"}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-lg" data-testid={`text-partner-driver-name-${booking.id}`}>
                            {booking.partnerAssignment.driverName ?? "Driver assigned"}
                          </h3>
                          {booking.partnerAssignment.teamName && (
                            <p className="text-sm text-muted-foreground" data-testid={`text-partner-team-${booking.id}`}>
                              {booking.partnerAssignment.teamName}
                            </p>
                          )}
                          {booking.partnerAvgRating != null && (
                            <div className="flex items-center gap-1 mt-1" data-testid={`text-partner-rating-${booking.id}`}>
                              <div className="flex items-center gap-1 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                                <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                                <span className="text-sm font-semibold">{booking.partnerAvgRating!.toFixed(1)}</span>
                              </div>
                            </div>
                          )}
                          {booking.partnerAssignment.completedMoves != null && (
                            <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-partner-completed-${booking.id}`}>
                              {booking.partnerAssignment.completedMoves} completed moves
                            </p>
                          )}
                        </div>
                      </div>

                      {(booking.partnerAssignment.vehicleType || booking.partnerAssignment.vehiclePlate) && (
                        <>
                          <Separator className="my-4" />
                          <div className="grid grid-cols-2 gap-4">
                            {booking.partnerAssignment.vehicleType && (
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                  <Truck className="w-5 h-5 text-blue-500" />
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Vehicle</p>
                                  <p className="font-medium text-sm" data-testid={`text-partner-vehicle-${booking.id}`}>
                                    {booking.partnerAssignment.vehicleType}
                                  </p>
                                </div>
                              </div>
                            )}
                            {booking.partnerAssignment.vehiclePlate && (
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center border-2 border-dashed">
                                  <span className="text-xs font-bold">LP</span>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">License Plate</p>
                                  <p className="font-bold text-sm tracking-wider" data-testid={`text-partner-plate-${booking.id}`}>
                                    {booking.partnerAssignment.vehiclePlate}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {booking.partnerAssignment.driverPhone && booking.status !== "completed" && booking.status !== "cancelled" && (
                        <>
                          <Separator className="my-4" />
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => openTel(booking.partnerAssignment!.driverPhone!)}
                            data-testid={`button-call-partner-driver-${booking.id}`}
                          >
                            <Phone className="w-4 h-4 mr-2" />
                            Call {booking.partnerAssignment.driverName?.split(" ")[0] ?? "Driver"}
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Price Breakdown */}
                  {booking.price != null && booking.price !== '' && booking.baseFee != null && booking.baseFee !== '' && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover-elevate active-elevate-2 p-3 rounded-lg w-full bg-muted/30 mb-4" data-testid={`button-price-breakdown-${booking.id}`}>
                        <DollarSign className="w-4 h-4 text-primary" />
                        <span>View Price Breakdown</span>
                        <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl p-5 mb-4 space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Base Fee</span>
                            <span className="font-medium" data-testid={`text-breakdown-base-${booking.id}`}>${parseFloat(booking.baseFee).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Distance ({booking.distance ? parseFloat(booking.distance).toFixed(1) : '0'} km)</span>
                            <span className="font-medium" data-testid={`text-breakdown-distance-${booking.id}`}>${parseFloat(booking.distanceFee || "0").toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Load Size ({booking.loadSize || 'Standard'})</span>
                            <span className="font-medium" data-testid={`text-breakdown-load-${booking.id}`}>${parseFloat(booking.loadFee || "0").toFixed(2)}</span>
                          </div>
                          {parseFloat(booking.pickupDifficultyFee || "0") > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Pickup Difficulty</span>
                              <span className="font-medium">${parseFloat(booking.pickupDifficultyFee || "0").toFixed(2)}</span>
                            </div>
                          )}
                          {parseFloat(booking.dropoffDifficultyFee || "0") > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Dropoff Difficulty</span>
                              <span className="font-medium">${parseFloat(booking.dropoffDifficultyFee || "0").toFixed(2)}</span>
                            </div>
                          )}
                          {parseFloat(booking.heavyItemFee || "0") > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Heavy Item Fee</span>
                              <span className="font-medium">${parseFloat(booking.heavyItemFee || "0").toFixed(2)}</span>
                            </div>
                          )}
                          {parseFloat(booking.moverTravelFee || "0") > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Mover Travel Fee</span>
                              <span className="font-medium">${parseFloat(booking.moverTravelFee || "0").toFixed(2)}</span>
                            </div>
                          )}
                          {booking.numberOfMovers === 2 && booking.subtotal != null && (
                            <>
                              <Separator className="my-3" />
                              <div className="flex justify-between text-sm text-primary">
                                <span className="font-medium">2 Movers Premium (×1.30)</span>
                                <span className="font-medium">${(Number(booking.subtotal) * 1.30).toFixed(2)}</span>
                              </div>
                            </>
                          )}
                          <Separator className="my-3" />
                          <div className="flex justify-between font-bold text-lg">
                            <span>Total</span>
                            <span className="text-primary" data-testid={`text-breakdown-total-${booking.id}`}>${Number(booking.price).toFixed(2)} CAD</span>
                          </div>
                          
                          {/* AI Feature 2: Price Explanation - ARCHIVED */}
                          {AI_FEATURES.PRICE_BREAKDOWN_EXPLAINER && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Infer difficulty from fees (supports both old and new pricing)
                                const inferDifficulty = (fee: number) =>
                                  (fee === 12 || fee === 10) ? "basement" :
                                  (fee === 6 || fee === 5) ? "stairs" :
                                  (fee === 9.60 || fee === 8) ? "elevator" : "ground";
                                const pickupDifficulty = inferDifficulty(parseFloat(booking.pickupDifficultyFee || "0"));
                                const dropoffDifficulty = inferDifficulty(parseFloat(booking.dropoffDifficultyFee || "0"));
                                const heavyItem = parseFloat(booking.heavyItemFee || "0") > 0;
                                
                                const explanation = generatePriceExplanation({
                                  baseFee: parseFloat(booking.baseFee || "30"),
                                  distanceFee: parseFloat(booking.distanceFee || "0"),
                                  loadFee: parseFloat(booking.loadFee || "0"),
                                  pickupDifficultyFee: parseFloat(booking.pickupDifficultyFee || "0"),
                                  dropoffDifficultyFee: parseFloat(booking.dropoffDifficultyFee || "0"),
                                  heavyItemFee: parseFloat(booking.heavyItemFee || "0"),
                                  moverTravelFee: parseFloat(booking.moverTravelFee || "0"),
                                  subtotal: parseFloat(booking.subtotal || "0"),
                                  numberOfMovers: booking.numberOfMovers || 1,
                                  finalTotal: parseFloat(booking.price || "0"),
                                  distance: parseFloat(booking.distance || "0"),
                                  loadSize: booking.loadSize || "small",
                                  pickupDifficulty,
                                  dropoffDifficulty,
                                  heavyItem
                                });
                                alert(explanation);
                              }}
                              className="w-full mt-3"
                              data-testid={`button-ai-explain-${booking.id}`}
                            >
                              <Sparkles className="w-4 h-4 mr-2" />
                              AI Explain My Price
                            </Button>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Images - Clickable to view larger */}
                  {booking.images && booking.images.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        Item Photos ({booking.images.length})
                        <button
                          type="button"
                          onClick={() => handleImageClick(booking.images!, 0)}
                          className="text-xs text-primary hover:underline ml-1 cursor-pointer"
                          data-testid={`button-click-to-enlarge-${booking.id}`}
                        >
                          - Click to enlarge
                        </button>
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {booking.images.map((imageUrl, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleImageClick(booking.images!, index)}
                            className="relative aspect-square rounded-lg overflow-hidden border hover-elevate bg-muted cursor-pointer group focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                            data-testid={`button-image-${booking.id}-${index}`}
                            aria-label={`View item photo ${index + 1} of ${booking.images!.length}`}
                          >
                            <img
                              src={imageUrl}
                              alt={`Item ${index + 1}`}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              data-testid={`image-item-${booking.id}-${index}`}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const placeholder = target.nextElementSibling as HTMLElement;
                                if (placeholder) placeholder.style.display = 'flex';
                              }}
                            />
                            <div className="absolute inset-0 hidden items-center justify-center bg-muted">
                              <ImageOff className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                    {/* Partner bookings: show status timeline instead of GPS tracking */}
                    {booking.enterprisePartnerId ? (
                      ["new", "under_review", "accepted", "assigned", "en_route_to_pickup", "loading", "en_route_to_dropoff", "unloading", "in_transit", "arrived_at_dropoff", "delivered"].some(s => booking.status === s || (booking as any).enterpriseStatus === s) && (
                        <Button
                          variant="outline"
                          onClick={() => setTimelineBookingId(booking.id)}
                          data-testid={`button-move-status-${booking.id}`}
                        >
                          <ListChecks className="w-4 h-4 mr-2" />
                          View Move Status
                        </Button>
                      )
                    ) : (
                      <>
                        {["en_route_to_pickup", "loading", "en_route_to_dropoff", "unloading", "in_transit"].includes(booking.status) && (
                          <Button
                            onClick={() => setLocation(`/track-trip/${booking.id}`)}
                            data-testid={`button-track-trip-${booking.id}`}
                          >
                            <Navigation className="w-4 h-4 mr-2" />
                            Track Trip Live
                          </Button>
                        )}
                        {booking.status === "confirmed" && booking.moverId && (
                          <Button
                            variant="outline"
                            disabled
                            className="opacity-70"
                            data-testid={`button-track-pending-${booking.id}`}
                          >
                            <Clock className="w-4 h-4 mr-2" />
                            Tracking Available When Mover Starts
                          </Button>
                        )}
                      </>
                    )}
                    {(booking.status === "confirmed" || booking.status === "pending" || booking.status === "pending_payment") && booking.paymentStatus !== "succeeded" && booking.price && (
                      <Button
                        onClick={() => setLocation(`/payment/${booking.id}`)}
                        className="bg-gradient-to-r from-primary to-primary/80"
                        data-testid={`button-pay-${booking.id}`}
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Pay ${parseFloat(booking.price).toFixed(2)} CAD
                      </Button>
                    )}
                    {(booking.status === "payment_failed" || booking.paymentStatus === "failed") && booking.price && (
                      <Button
                        onClick={() => setLocation(`/payment/${booking.id}`)}
                        className="bg-gradient-to-r from-orange-500 to-orange-600"
                        data-testid={`button-retry-payment-${booking.id}`}
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Retry Payment - ${parseFloat(booking.price).toFixed(2)} CAD
                      </Button>
                    )}
                    {(booking.status === "pending" || booking.status === "pending_payment") && booking.paymentStatus !== "succeeded" && (
                      <Button
                        variant="outline"
                        onClick={() => setEditingBooking(booking)}
                        data-testid={`button-edit-${booking.id}`}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit Booking
                      </Button>
                    )}
                    {(booking.status === "pending" || booking.status === "pending_payment") && (
                      <Button
                        variant="destructive"
                        onClick={() => cancelBookingMutation.mutate(booking.id)}
                        disabled={cancelBookingMutation.isPending}
                        data-testid={`button-cancel-${booking.id}`}
                      >
                        {cancelBookingMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                        Cancel Booking
                      </Button>
                    )}
                    {booking.mover && booking.status !== "cancelled" && booking.status !== "completed" && (
                      <Button
                        variant="outline"
                        onClick={() => setLocation(`/messages/${booking.id}`)}
                        data-testid={`button-message-${booking.id}`}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Message Mover
                      </Button>
                    )}
                    {booking.status === "completed" && booking.mover && !booking.hasReview && (
                      <Button
                        onClick={() => setLocation(`/review/${booking.id}`)}
                        data-testid={`button-review-${booking.id}`}
                      >
                        <Star className="w-4 h-4 mr-2" />
                        Leave Review
                      </Button>
                    )}
                    {booking.status === "completed" && booking.hasReview && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        Review submitted
                      </div>
                    )}
                    {booking.status === "completed" && (
                      <Button
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
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Rebook
                      </Button>
                    )}
                  </div>
                  {/* Task 5: Status timeline */}
                  <StatusTimeline bookingStatus={booking.status} bookingId={booking.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      {/* Edit Booking Dialog */}
      <Dialog open={!!editingBooking} onOpenChange={(open) => !open && setEditingBooking(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Edit Booking
            </DialogTitle>
            <DialogDescription>
              Update your booking details. The price will be recalculated automatically.
            </DialogDescription>
          </DialogHeader>
          {editingBooking && user && (
            <EditBookingForm
              booking={editingBooking}
              customerId={user.id}
              onSuccess={() => setEditingBooking(null)}
              onCancel={() => setEditingBooking(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          <DialogDescription className="sr-only">
            Viewing image {previewIndex + 1} of {previewImages.length}
          </DialogDescription>
          <div className="relative">
            {/* Close button */}
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Close preview"
              data-testid="button-close-preview"
            >
              <X className="w-6 h-6 text-white" />
            </button>
            
            {/* Navigation buttons */}
            {previewImages.length > 1 && (
              <>
                <button
                  onClick={handlePrevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  aria-label="Previous image"
                  data-testid="button-prev-image"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <button
                  onClick={handleNextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  aria-label="Next image"
                  data-testid="button-next-image"
                >
                  <ChevronRightIcon className="w-6 h-6 text-white" />
                </button>
              </>
            )}
            
            {/* Image */}
            <div className="flex items-center justify-center min-h-[60vh] p-8">
              {previewImage && (
                <img
                  src={previewImage}
                  alt={`Preview ${previewIndex + 1} of ${previewImages.length}`}
                  className="max-w-full max-h-[80vh] object-contain rounded-lg"
                  data-testid="image-preview"
                />
              )}
            </div>
            
            {/* Image counter */}
            {previewImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-sm">
                {previewIndex + 1} / {previewImages.length}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Move Status Timeline Dialog (partner bookings) */}
      <MoveStatusDialog
        bookingId={timelineBookingId}
        onClose={() => setTimelineBookingId(null)}
      />

      {/* Task 2: Post-move review modal */}
      <Dialog open={!!reviewModalBooking} onOpenChange={dismissReviewModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              Rate Your Move
            </DialogTitle>
            <DialogDescription>
              How was your experience with {reviewModalBooking?.mover?.name}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Star picker */}
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setReviewRating(star)}
                  className="focus:outline-none"
                  data-testid={`star-${star}`}
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${star <= reviewRating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"}`}
                  />
                </button>
              ))}
            </div>
            {/* Optional comment */}
            <Textarea
              placeholder="Share details about your experience (optional)"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={3}
              className="resize-none"
              data-testid="textarea-review-comment"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={dismissReviewModal}
                data-testid="button-review-skip"
              >
                Skip
              </Button>
              <Button
                className="flex-1"
                onClick={submitReview}
                disabled={isSubmittingReview}
                data-testid="button-review-submit"
              >
                {isSubmittingReview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Star className="w-4 h-4 mr-2" />}
                Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatStatusLabel(s: string) {
  const map: Record<string, string> = {
    new: "Booking Received",
    under_review: "Under Review",
    accepted: "Confirmed by Moving Company",
    assigned: "Driver Assigned",
    en_route_to_pickup: "Driver En Route to Pickup",
    arrived_at_pickup: "Driver Arrived at Pickup",
    picked_up: "Items Picked Up",
    loading: "Loading Items",
    in_transit: "Move In Progress",
    en_route_to_dropoff: "En Route to Destination",
    arrived_at_dropoff: "Arrived at Destination",
    unloading: "Unloading Items",
    delivered: "Items Delivered",
    completed: "Move Completed",
    delayed: "Delayed",
    issue_reported: "Issue Reported",
    cancelled: "Cancelled",
  };
  return map[s] ?? s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function statusIcon(s: string) {
  if (["completed", "delivered", "arrived_at_dropoff"].includes(s)) return CheckCircle2;
  if (["cancelled", "issue_reported"].includes(s)) return XCircle;
  if (["in_transit", "en_route_to_pickup", "en_route_to_dropoff"].includes(s)) return Truck;
  if (["delayed"].includes(s)) return AlertTriangle;
  return Clock;
}

function MoveStatusDialog({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const { data: events, isLoading } = useQuery<any[]>({
    queryKey: ["/api/bookings", bookingId, "status-events"],
    queryFn: () => fetch(`/api/bookings/${bookingId}/status-events`, { credentials: "include" }).then(r => r.json()),
    enabled: !!bookingId,
    refetchInterval: 15000,
  });

  return (
    <Dialog open={!!bookingId} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-primary" />
            Move Status
          </DialogTitle>
          <DialogDescription>
            Live updates from your moving company
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !events || events.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-3 text-center">
            <Clock className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground font-medium">No updates yet</p>
            <p className="text-xs text-muted-foreground">Status updates will appear here as your moving company progresses through your move.</p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-0 max-h-[420px] overflow-y-auto pr-1">
            {/* Vertical line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
            {events.map((ev, i) => {
              const Icon = statusIcon(ev.toStatus);
              const isLast = i === events.length - 1;
              const isNegative = ["cancelled", "issue_reported", "delayed"].includes(ev.toStatus);
              const isPositive = ["completed", "delivered", "arrived_at_dropoff", "accepted", "assigned"].includes(ev.toStatus);
              return (
                <div key={ev.id} className="relative flex gap-3 pb-5 last:pb-0" data-testid={`event-status-${ev.id}`}>
                  {/* Dot */}
                  <div className={`absolute -left-[25px] w-5 h-5 rounded-full flex items-center justify-center border-2 bg-background ${isLast ? "border-primary" : "border-border"}`}>
                    <Icon className={`w-2.5 h-2.5 ${isNegative ? "text-destructive" : isPositive ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-snug ${isNegative ? "text-destructive" : isLast ? "text-foreground" : "text-muted-foreground"}`}>
                      {formatStatusLabel(ev.toStatus)}
                    </p>
                    {ev.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{ev.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      {format(new Date(ev.createdAt), "MMM d, h:mm a")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
