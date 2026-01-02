import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MapPin, Calendar, Package, DollarSign, MessageCircle, Star, ChevronDown, Sparkles, CreditCard, CheckCircle2, XCircle, Navigation, Clock, TrendingUp, ArrowRight, AlertTriangle, Loader2, Info, ImageOff, Truck, Phone, Shield, User, X, ZoomIn, ChevronLeft, ChevronRight as ChevronRightIcon, Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useCallback } from "react";
import { generatePriceExplanation } from "@shared/ai";
import EditBookingForm from "@/components/EditBookingForm";

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

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: [`/api/bookings?customerId=${user?.id}`],
    enabled: !!user?.id,
  });
  
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
      // Always keep pending_payment bookings - they need to show the payment button
      if (b.status === "pending_payment") return true;
      // Also keep bookings with failed payment status
      if (b.paymentStatus === "failed") return true;
      // Keep in_transit and payment_failed as they're active
      if (b.status === "in_transit" || b.status === "payment_failed") return true;
      // Filter out expired pending/confirmed bookings only
      const isActiveStatus = ["pending", "confirmed"].includes(b.status);
      if (isActiveStatus && safeParseDate(b.preferredDate) < now) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Pending payment bookings go first (urgent - need to pay)
      if (a.status === "pending_payment" && b.status !== "pending_payment") return -1;
      if (b.status === "pending_payment" && a.status !== "pending_payment") return 1;
      
      // Then other active bookings
      const aIsActive = ["pending", "confirmed", "in_transit", "payment_failed"].includes(a.status) || a.paymentStatus === "failed";
      const bIsActive = ["pending", "confirmed", "in_transit", "payment_failed"].includes(b.status) || b.paymentStatus === "failed";
      
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      
      // Within same group, sort by created date (newest first for pending_payment)
      if (a.status === "pending_payment" && b.status === "pending_payment") {
        return safeParseDate(b.createdAt).getTime() - safeParseDate(a.createdAt).getTime();
      }
      
      // Active: sort by preferred date ascending
      if (aIsActive && bIsActive) {
        return safeParseDate(a.preferredDate).getTime() - safeParseDate(b.preferredDate).getTime();
      }
      // Past bookings: most recent first
      return safeParseDate(b.preferredDate).getTime() - safeParseDate(a.preferredDate).getTime();
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
      queryClient.invalidateQueries({ queryKey: [`/api/bookings?customerId=${user?.id}`] });
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
      case "in_transit": return <TrendingUp className="w-4 h-4" />;
      case "completed": return <CheckCircle2 className="w-4 h-4" />;
      case "cancelled": return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending_payment": return "bg-orange-500/10 text-orange-600 border-orange-500/20";
      case "pending": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "confirmed": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
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
                        Booked on {format(new Date(booking.createdAt), "MMMM d, yyyy")}
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
                        <p className="font-medium">{format(new Date(booking.preferredDate), "MMM d, yyyy")}</p>
                        <p className="text-sm text-muted-foreground">{format(new Date(booking.preferredDate), "h:mm a")}</p>
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

                      {booking.mover.phone && (
                        <>
                          <Separator className="my-4" />
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full"
                            onClick={() => window.open(`tel:${booking.mover?.phone}`, '_self')}
                            data-testid={`button-call-mover-${booking.id}`}
                          >
                            <Phone className="w-4 h-4 mr-2" />
                            Call {booking.mover.name?.split(' ')[0]}
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
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const pickupDifficulty = parseFloat(booking.pickupDifficultyFee || "0") === 10 ? "basement" :
                                parseFloat(booking.pickupDifficultyFee || "0") === 5 ? "stairs" :
                                parseFloat(booking.pickupDifficultyFee || "0") === 8 ? "elevator" : "ground";
                              const dropoffDifficulty = parseFloat(booking.dropoffDifficultyFee || "0") === 10 ? "basement" :
                                parseFloat(booking.dropoffDifficultyFee || "0") === 5 ? "stairs" :
                                parseFloat(booking.dropoffDifficultyFee || "0") === 8 ? "elevator" : "ground";
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
                    {["en_route_to_pickup", "loading", "en_route_to_dropoff", "unloading", "in_transit"].includes(booking.status) && (
                      <Button
                        onClick={() => setLocation(`/track-trip/${booking.id}`)}
                        data-testid={`button-track-trip-${booking.id}`}
                      >
                        <Navigation className="w-4 h-4 mr-2" />
                        Track Trip Live
                      </Button>
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
                    {booking.mover && booking.status !== "cancelled" && (
                      <Button
                        variant="outline"
                        onClick={() => setLocation(`/messages/${booking.id}`)}
                        data-testid={`button-message-${booking.id}`}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Message Mover
                      </Button>
                    )}
                    {booking.status === "completed" && booking.mover && (
                      <Button
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
    </div>
  );
}
