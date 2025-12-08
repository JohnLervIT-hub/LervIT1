import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Calendar, Package, DollarSign, MessageCircle, CheckCircle, XCircle, ChevronDown, Users, Weight, Clock, Sparkles, Navigation, Settings, Shield, AlertTriangle, Box, Truck, Wallet } from "lucide-react";
import { MoverPayoutCenter } from "@/components/MoverPayoutCenter";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { generatePriceExplanation } from "@shared/ai";
import { useEffect, useState } from "react";
import MoverVerification from "./MoverVerification";
import { MoverDashboardSkeleton } from "@/components/DashboardSkeleton";
import { FadeIn, StaggerChildren, StaggerItem } from "@/components/PageTransition";

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
  pickupDifficulty: string | null;
  dropoffDifficulty: string | null;
  heavyItem: boolean | null;
  numberOfMovers: number | null;
  baseFee: string | null;
  distanceFee: string | null;
  loadFee: string | null;
  pickupDifficultyFee: string | null;
  dropoffDifficultyFee: string | null;
  heavyItemFee: string | null;
  moverTravelFee: string | null;
  subtotal: string | null;
  customer: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  } | null;
};

type IdentifiedItem = {
  id: string;
  photoUrl: string;
  processingStatus: string;
  itemName: string | null;
  category: string | null;
  weightKg: string | null;
  volumeCuft: string | null;
  vehicleType: string | null;
  recommendedMovers: number | null;
  handlingComplexity: string | null;
};

function IdentifiedItemsDisplay({ bookingId }: { bookingId: string }) {
  const { data: items, isLoading } = useQuery<IdentifiedItem[]>({
    queryKey: ['/api/ai/items', bookingId],
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
        <span className="text-sm text-muted-foreground">Loading item details...</span>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return null;
  }

  const completedItems = items.filter(i => i.processingStatus === 'completed' && i.itemName);
  if (completedItems.length === 0) return null;

  const totalVolume = completedItems.reduce((sum, item) => sum + (parseFloat(item.volumeCuft || '0') || 0), 0);
  const totalWeight = completedItems.reduce((sum, item) => sum + (parseFloat(item.weightKg || '0') || 0), 0);

  const getComplexityBadge = (complexity: string | null) => {
    if (!complexity || complexity === 'standard') return null;
    const styles: Record<string, { label: string; variant: "destructive" | "default" | "secondary" }> = {
      'very_high': { label: 'Very Heavy', variant: 'destructive' },
      'high': { label: 'Heavy', variant: 'default' },
      'medium': { label: 'Medium', variant: 'secondary' },
    };
    return styles[complexity] || null;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 rounded-lg p-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold text-sm">AI-Detected Items</span>
          <Badge variant="secondary" className="text-xs">{completedItems.length}</Badge>
        </div>
      </div>
      
      {/* Items Grid */}
      <div className="space-y-2">
        {completedItems.map((item) => {
          const complexityBadge = getComplexityBadge(item.handlingComplexity);
          return (
            <div 
              key={item.id} 
              className="group bg-muted/40 hover:bg-muted/60 rounded-xl p-3 flex items-center gap-3 transition-colors"
              data-testid={`identified-item-${item.id}`}
            >
              {/* Thumbnail */}
              <div className="relative w-14 h-14 rounded-lg overflow-hidden ring-1 ring-border flex-shrink-0">
                <img 
                  src={item.photoUrl} 
                  alt={item.itemName || 'Item'} 
                  className="w-full h-full object-cover"
                />
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{item.itemName}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {item.category && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-background/50 px-2 py-0.5 rounded-md">
                      <Box className="w-3 h-3" />
                      {item.category}
                    </span>
                  )}
                  {item.volumeCuft && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {parseFloat(item.volumeCuft).toFixed(1)} ft³
                    </span>
                  )}
                  {item.weightKg && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {parseFloat(item.weightKg).toFixed(0)} kg
                    </span>
                  )}
                </div>
              </div>
              
              {/* Complexity Badge */}
              {complexityBadge && (
                <Badge variant={complexityBadge.variant} className="text-xs flex-shrink-0">
                  {complexityBadge.label}
                </Badge>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-xl p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Volume</p>
            <p className="text-xl font-bold mt-0.5">{totalVolume.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">ft³</span></p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Weight</p>
            <p className="text-xl font-bold mt-0.5">{totalWeight.toFixed(0)} <span className="text-sm font-normal text-muted-foreground">kg</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MoverDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [locationSharing, setLocationSharing] = useState<string | null>(null);
  const [showVerificationAlert, setShowVerificationAlert] = useState(false);
  const [verificationError, setVerificationError] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("available");

  // First get the mover profile
  const { data: mover, isLoading: isMoverLoading, isFetched: isMoverFetched } = useQuery<any>({
    queryKey: [`/api/movers?userId=${user?.id}`],
    enabled: !!user?.id,
    select: (data) => Array.isArray(data) ? data[0] : data,
  });

  // Get verification status
  const { data: verificationStatus, isLoading: isVerificationLoading } = useQuery<any>({
    queryKey: [`/api/movers/${mover?.id}/verification-status`],
    enabled: !!mover?.id,
  });

  // Get all bookings for this mover (server returns assigned + available)
  const { data: allBookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  // Client-side filtering: separate assigned from available bookings
  const bookings = allBookings?.filter((b) => b.moverId === mover?.id) || [];
  const availableBookings = allBookings?.filter((b) => b.status === "pending" && !b.moverId) || [];

  // Get earnings data for this mover
  const { data: earnings } = useQuery<any>({
    queryKey: [`/api/movers/${mover?.id}/earnings`],
    enabled: !!mover?.id,
  });

  const acceptBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest("PATCH", `/api/bookings/${bookingId}`, {
        moverId: mover?.id,
        status: "confirmed",
      });
    },
    onSuccess: (_, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
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
    onSuccess: (_, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
      // Stop location sharing when trip is completed
      if (locationSharing === bookingId) {
        setLocationSharing(null);
      }
      toast({
        title: "Booking completed",
        description: "The move has been marked as completed.",
      });
    },
  });

  const startTripMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest("PATCH", `/api/bookings/${bookingId}`, { status: "in_transit" });
    },
    onSuccess: (_, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
      setLocationSharing(bookingId);
      toast({
        title: "Trip started",
        description: "Location sharing is now active. Your customer can track your location in real-time.",
      });
    },
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: async (isAvailable: boolean) => {
      const response = await apiRequest("PATCH", `/api/movers/${mover?.id}`, { isAvailable });
      return response.json();
    },
    onSuccess: async (data, variables) => {
      await queryClient.invalidateQueries({ queryKey: [`/api/movers?userId=${user?.id}`] });
      await queryClient.refetchQueries({ queryKey: [`/api/movers?userId=${user?.id}`] });
      
      const newState = data?.isAvailable !== undefined ? data.isAvailable : variables;
      toast({
        title: newState ? "You're now online" : "You're now offline",
        description: newState 
          ? "You can now receive and accept job requests" 
          : "You won't receive new job notifications",
      });
    },
    onError: async (error: any) => {
      await queryClient.invalidateQueries({ queryKey: [`/api/movers?userId=${user?.id}`] });
      await queryClient.refetchQueries({ queryKey: [`/api/movers?userId=${user?.id}`] });
      
      if (error?.error === "VERIFICATION_INCOMPLETE") {
        await queryClient.invalidateQueries({ queryKey: [`/api/movers/${mover?.id}/verification-status`] });
        await queryClient.refetchQueries({ queryKey: [`/api/movers/${mover?.id}/verification-status`] });
        setVerificationError(error);
        setShowVerificationAlert(true);
      } else {
        toast({
          title: "Error",
          description: error?.message || "Failed to update availability",
          variant: "destructive",
        });
      }
    },
  });

  const handleAvailabilityToggle = (checked: boolean) => {
    if (isVerificationLoading) {
      toast({
        title: "Loading verification status",
        description: "Please wait while we check your verification status...",
      });
      return;
    }
    
    if (checked && !verificationStatus?.isComplete) {
      setShowVerificationAlert(true);
      setVerificationError({
        message: "You must complete all verification requirements before going online.",
        incompleteItems: verificationStatus?.incompleteItems || [],
      });
      return;
    }
    
    toggleAvailabilityMutation.mutate(checked);
  };

  // Location sharing effect - updates location every 5 seconds for in-transit bookings
  useEffect(() => {
    if (!locationSharing) return;

    const shareLocation = () => {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              await apiRequest("POST", `/api/bookings/${locationSharing}/location`, {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
            } catch (error) {
              console.error("Failed to update location:", error);
            }
          },
          (error) => {
            console.error("Geolocation error:", error);
            toast({
              title: "Location access denied",
              description: "Please enable location services to share your location with customers.",
              variant: "destructive",
            });
            setLocationSharing(null);
          }
        );
      }
    };

    // Share location immediately
    shareLocation();

    // Then share every 5 seconds
    const interval = setInterval(shareLocation, 5000);

    return () => clearInterval(interval);
  }, [locationSharing, toast]);

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

  // Show skeleton while loading mover profile
  if (isMoverLoading || isLoading) {
    return <MoverDashboardSkeleton />;
  }

  // If mover profile doesn't exist, redirect to setup
  if (isMoverFetched && !mover) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-4">Complete Your Mover Profile</h2>
          <p className="text-muted-foreground mb-6">
            You need to set up your mover profile before you can access the dashboard.
          </p>
          <Button onClick={() => setLocation("/mover-profile-setup")} data-testid="button-setup-profile">
            Set Up Profile
          </Button>
        </div>
      </div>
    );
  }

  const renderBookingCard = (booking: Booking, showActions: boolean = false) => (
    <Card key={booking.id} className="hover-elevate" data-testid={`card-booking-${booking.id}`}>
      <CardHeader className="space-y-4">
        <div className="flex justify-between items-start gap-4">
          <div>
            <CardTitle className="text-xl">
              Move #{booking.id.slice(0, 8)}
            </CardTitle>
            <CardDescription>
              Requested {format(new Date(booking.createdAt), "MMM d, yyyy")}
            </CardDescription>
          </div>
          <Badge variant={getStatusColor(booking.status) as any} data-testid={`badge-status-${booking.id}`}>
            {getStatusLabel(booking.status)}
          </Badge>
        </div>
        
        {booking.customer && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-foreground">Customer Information</p>
            <div className="space-y-1">
              <p className="text-sm">
                <span className="font-medium text-foreground">{booking.customer.name}</span>
              </p>
              <p className="text-sm text-muted-foreground">{booking.customer.email}</p>
              {booking.customer.phone && (
                <p className="text-sm text-muted-foreground">{booking.customer.phone}</p>
              )}
            </div>
          </div>
        )}
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
            {booking.distance && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Distance</p>
                  <p className="text-sm text-muted-foreground">
                    {parseFloat(booking.distance).toFixed(2)} km
                  </p>
                </div>
              </div>
            )}
            {booking.numberOfMovers && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Number of Movers</p>
                  <p className="text-sm text-muted-foreground">
                    {booking.numberOfMovers} Mover{booking.numberOfMovers > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}
            {booking.heavyItem && (
              <div className="flex items-center gap-2">
                <Weight className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Heavy Items</p>
                  <p className="text-sm text-muted-foreground">
                    Yes
                  </p>
                </div>
              </div>
            )}
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

        {booking.price != null && booking.price !== '' && booking.baseFee != null && booking.baseFee !== '' && (
          <>
            <Separator />
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover-elevate active-elevate-2 p-2 rounded-md w-full" data-testid={`button-price-breakdown-${booking.id}`}>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                View Price Breakdown
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="bg-muted/50 rounded-lg p-4 mt-2 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base Fee</span>
                    <span className="font-medium">
                      ${parseFloat(booking.baseFee).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Distance Fee ({booking.distance ? parseFloat(booking.distance).toFixed(2) : '0'} km × $1.00/km)
                    </span>
                    <span className="font-medium">
                      ${parseFloat(booking.distanceFee || "0").toFixed(2)}
                    </span>
                  </div>
                  {parseFloat(booking.loadFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Load Fee ({booking.loadSize})</span>
                      <span className="font-medium">
                        ${parseFloat(booking.loadFee || "0").toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(booking.pickupDifficultyFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pickup Difficulty Fee</span>
                      <span className="font-medium">
                        ${parseFloat(booking.pickupDifficultyFee || "0").toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(booking.dropoffDifficultyFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dropoff Difficulty Fee</span>
                      <span className="font-medium">
                        ${parseFloat(booking.dropoffDifficultyFee || "0").toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(booking.heavyItemFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Heavy Item Fee</span>
                      <span className="font-medium">
                        ${parseFloat(booking.heavyItemFee || "0").toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(booking.moverTravelFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mover Travel Fee</span>
                      <span className="font-medium">
                        ${parseFloat(booking.moverTravelFee || "0").toFixed(2)}
                      </span>
                    </div>
                  )}
                  {booking.numberOfMovers === 2 && booking.subtotal != null && (() => {
                    const subtotalValue = Number(booking.subtotal);
                    if (!Number.isNaN(subtotalValue)) {
                      const postMultiplierSubtotal = subtotalValue * 1.30;
                      return (
                        <>
                          <div className="h-px bg-border my-2" />
                          <div className="flex justify-between text-primary">
                            <span className="font-medium">2-Movers Fee (×1.30): 1st mover + 30% for 2nd</span>
                            <span className="font-medium" data-testid={`text-breakdown-subtotal-multiplied-${booking.id}`}>
                              ${postMultiplierSubtotal.toFixed(2)}
                            </span>
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                  <div className="h-px bg-border my-2" />
                  <div className="flex justify-between font-bold">
                    <span>Total Earnings</span>
                    {booking.price != null ? (
                      <span className="text-primary" data-testid={`text-breakdown-total-${booking.id}`}>
                        ${Number(booking.price).toFixed(2)} CAD
                      </span>
                    ) : (
                      <span className="text-muted-foreground" data-testid={`text-breakdown-total-${booking.id}`}>
                        Quote pending
                      </span>
                    )}
                  </div>
                  
                  {/* AI Feature 2: Price Explanation */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Infer difficulty and heavy item from fees
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
                    AI Explain Earnings
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

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
        <IdentifiedItemsDisplay bookingId={booking.id} />

        {(showActions || booking.status === "confirmed" || (booking.status !== "cancelled" && booking.status !== "pending")) && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-3">
              {showActions && (
                <Button
                  variant="default"
                  onClick={() => acceptBookingMutation.mutate(booking.id)}
                  disabled={acceptBookingMutation.isPending}
                  data-testid={`button-accept-${booking.id}`}
                  className="flex-1 sm:flex-none"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {acceptBookingMutation.isPending ? "Accepting..." : "Accept Booking"}
                </Button>
              )}
              {booking.status === "confirmed" && (
                <Button
                  variant="default"
                  onClick={() => startTripMutation.mutate(booking.id)}
                  disabled={startTripMutation.isPending}
                  data-testid={`button-start-trip-${booking.id}`}
                  className="flex-1 sm:flex-none"
                >
                  <Navigation className="w-4 h-4 mr-2" />
                  {startTripMutation.isPending ? "Starting..." : "Start Trip"}
                </Button>
              )}
              {booking.status === "in_transit" && (
                <>
                  <Button
                    variant="default"
                    onClick={() => completeBookingMutation.mutate(booking.id)}
                    disabled={completeBookingMutation.isPending}
                    data-testid={`button-complete-${booking.id}`}
                    className="flex-1 sm:flex-none"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {completeBookingMutation.isPending ? "Completing..." : "Mark Complete"}
                  </Button>
                  {locationSharing === booking.id && (
                    <Badge variant="default" className="flex items-center gap-1" data-testid={`badge-sharing-location-${booking.id}`}>
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      Sharing Location
                    </Badge>
                  )}
                </>
              )}
              {booking.status !== "cancelled" && booking.status !== "pending" && (
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/messages/${booking.id}`)}
                  data-testid={`button-message-${booking.id}`}
                  className="flex-1 sm:flex-none"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Message Customer
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  const firstName = user?.name?.split(' ')[0] || 'there';
  const rating = mover?.rating ? parseFloat(mover.rating).toFixed(1) : '5.0';
  const totalMoves = mover?.totalMoves || 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      {/* Premium Header Section */}
      <div className="bg-gradient-to-br from-primary/5 via-primary/10 to-transparent border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            {/* Welcome & Profile */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground text-2xl font-bold shadow-lg shadow-primary/20">
                  {firstName.charAt(0).toUpperCase()}
                </div>
                {mover?.isAvailable && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-background flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">Hey {firstName}!</h1>
                <p className="text-muted-foreground flex items-center gap-2">
                  {mover?.vehicleType || 'Mover'}
                  {verificationStatus?.isComplete && (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </p>
              </div>
            </div>
            
            {/* Status Toggle & Actions */}
            <div className="flex items-center gap-3">
              <div 
                className={`flex items-center gap-3 rounded-full px-4 py-2 border-2 transition-all ${
                  mover?.isAvailable 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : 'bg-muted/50 border-muted-foreground/20'
                }`}
                data-testid="toggle-availability"
              >
                <div className={`w-2.5 h-2.5 rounded-full ${mover?.isAvailable ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/50'}`} />
                <span className={`text-sm font-semibold ${mover?.isAvailable ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {isVerificationLoading ? '...' : (mover?.isAvailable ? 'Online' : 'Offline')}
                </span>
                <Switch 
                  checked={mover?.isAvailable || false}
                  onCheckedChange={handleAvailabilityToggle}
                  disabled={isVerificationLoading || toggleAvailabilityMutation.isPending}
                  data-testid="switch-online-status"
                />
              </div>
              
              <Button
                variant="outline"
                size="icon"
                onClick={() => setLocation("/mover-settings")}
                data-testid="button-mover-settings"
                className="rounded-full"
                title="Account Settings"
                aria-label="Account Settings"
              >
                <Users className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setLocation("/mover-profile")}
                data-testid="button-edit-profile"
                className="rounded-full"
                title="Vehicle & Business Profile"
                aria-label="Vehicle & Business Profile"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          {/* Quick Stats Row */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="bg-card/80 backdrop-blur rounded-xl p-4 border shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <Truck className="w-3.5 h-3.5" />
                Completed
              </div>
              <p className="text-2xl font-bold">{totalMoves}</p>
            </div>
            <div className="bg-card/80 backdrop-blur rounded-xl p-4 border shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <DollarSign className="w-3.5 h-3.5" />
                Earnings
              </div>
              <p className="text-2xl font-bold">${earnings?.totalEarnings || '0'}</p>
            </div>
            <div className="bg-card/80 backdrop-blur rounded-xl p-4 border shadow-sm">
              <div className="flex items-center gap-2 text-amber-500 text-xs font-medium mb-1">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
                Rating
              </div>
              <p className="text-2xl font-bold">{rating}</p>
            </div>
          </div>
          
          {!verificationStatus?.isComplete && (
            <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Complete Verification</p>
                  <p className="text-xs text-muted-foreground">Finish setup to start accepting jobs</p>
                </div>
              </div>
              <Button 
                size="sm"
                onClick={() => setActiveTab("verification")}
                data-testid="button-go-to-verification-alert"
                className="rounded-full"
              >
                Get Verified
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">

        <AlertDialog open={showVerificationAlert} onOpenChange={setShowVerificationAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Verification Required
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>{verificationError?.message || "You must complete all verification requirements before going online."}</p>
                
                {verificationError?.incompleteItems && verificationError.incompleteItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">Missing or Incomplete Items:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {verificationError.incompleteItems.map((item: any, idx: number) => (
                        <li key={idx}>
                          {item.type.replace(/_/g, ' ')} - {item.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => {
                  setShowVerificationAlert(false);
                  setActiveTab("verification");
                }}
                data-testid="button-go-to-verification"
              >
                Go to Verification
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="w-full grid grid-cols-5 bg-card border shadow-sm p-1.5 rounded-xl h-auto">
            <TabsTrigger value="available" data-testid="tab-available" className="gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Jobs</span>
              {availableBookings && availableBookings.length > 0 && (
                <Badge variant="secondary" className="no-default-hover-elevate h-5 px-1.5 text-xs bg-primary-foreground/20 text-inherit">
                  {availableBookings.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="my-bookings" data-testid="tab-my-bookings" className="gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Bookings</span>
              {bookings && bookings.length > 0 && (
                <Badge variant="secondary" className="no-default-hover-elevate h-5 px-1.5 text-xs bg-primary-foreground/20 text-inherit">
                  {bookings.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="verification" data-testid="tab-verification" className="gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Verify</span>
            </TabsTrigger>
            <TabsTrigger value="earnings" data-testid="tab-earnings" className="gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <DollarSign className="w-4 h-4" />
              <span className="hidden sm:inline">Earnings</span>
            </TabsTrigger>
            <TabsTrigger value="payouts" data-testid="tab-payouts" className="gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Payouts</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-4">
            {!availableBookings || availableBookings.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <Package className="w-10 h-10 text-primary/60" />
                  </div>
                  <h3 className="font-semibold text-xl mb-2">No Available Jobs</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                    New moving requests in your area will appear here. Stay online to receive job notifications.
                  </p>
                  {!mover?.isAvailable && (
                    <Button onClick={() => handleAvailabilityToggle(true)} className="rounded-full">
                      Go Online
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Available Jobs</h2>
                  <Badge variant="outline" className="text-primary">
                    {availableBookings.length} available
                  </Badge>
                </div>
                {availableBookings.map((booking) => renderBookingCard(booking, true))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-bookings" className="space-y-4">
            {isLoading ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                  </div>
                  <p className="text-muted-foreground">Loading your bookings...</p>
                </CardContent>
              </Card>
            ) : !bookings || bookings.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
                    <Calendar className="w-10 h-10 text-green-500/60" />
                  </div>
                  <h3 className="font-semibold text-xl mb-2">No Active Bookings</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                    Accept jobs from the Jobs tab to start earning. Your active and completed bookings will appear here.
                  </p>
                  <Button variant="outline" onClick={() => setActiveTab("available")} className="rounded-full">
                    Browse Available Jobs
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Your Bookings</h2>
                  <Badge variant="outline">
                    {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
                  </Badge>
                </div>
                {bookings.map((booking) => renderBookingCard(booking))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="verification" className="space-y-4">
            <MoverVerification />
          </TabsContent>

          <TabsContent value="earnings" className="space-y-6">
            {!earnings ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                  </div>
                  <p className="text-muted-foreground">Loading earnings...</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Premium Total Earnings Hero Card */}
                <Card className="bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground overflow-hidden relative" data-testid="card-total-earnings">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-32 translate-x-32" />
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-24 -translate-x-24" />
                  <CardContent className="p-8 relative">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-primary-foreground/70 text-sm font-medium mb-2">Total Earnings</p>
                        <p className="text-5xl font-bold mb-2" data-testid="text-total-earnings">${earnings.totalEarnings}</p>
                        <p className="text-primary-foreground/70 text-sm">
                          From {earnings.completedJobs} completed {earnings.completedJobs === 1 ? 'move' : 'moves'}
                        </p>
                      </div>
                      <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
                        <DollarSign className="w-8 h-8" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Stats Grid */}
                <div className="grid gap-4 grid-cols-2">
                  <Card data-testid="card-pending-earnings" className="hover-elevate">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                          <Clock className="w-6 h-6 text-amber-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Pending</p>
                          <p className="text-2xl font-bold" data-testid="text-pending-earnings">${earnings.pendingEarnings}</p>
                          <p className="text-xs text-muted-foreground">{earnings.pendingJobs} active</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-completed-jobs" className="hover-elevate">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                          <CheckCircle className="w-6 h-6 text-green-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Completed</p>
                          <p className="text-2xl font-bold" data-testid="text-completed-jobs-count">{earnings.completedJobs}</p>
                          <p className="text-xs text-muted-foreground">Jobs done</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Earnings by Month */}
                {earnings.earningsByMonth && earnings.earningsByMonth.length > 0 && (
                  <Card data-testid="card-earnings-by-month">
                    <CardHeader>
                      <CardTitle>Earnings by Month</CardTitle>
                      <CardDescription>
                        Your monthly earnings breakdown
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {earnings.earningsByMonth.map((month: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div>
                              <p className="font-medium">{month.month}</p>
                              <p className="text-sm text-muted-foreground">
                                {month.jobCount} {month.jobCount === 1 ? 'job' : 'jobs'}
                              </p>
                            </div>
                            <div className="text-lg font-bold text-primary">
                              ${month.earnings}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Completed Bookings */}
                {earnings.recentBookings && earnings.recentBookings.length > 0 && (
                  <Card data-testid="card-recent-earnings">
                    <CardHeader>
                      <CardTitle>Recent Completed Jobs</CardTitle>
                      <CardDescription>
                        Your latest earnings
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {earnings.recentBookings.map((booking: any) => (
                          <div
                            key={booking.id}
                            className="flex items-start justify-between p-4 rounded-lg bg-muted/50"
                            data-testid={`earnings-booking-${booking.id}`}
                          >
                            <div className="flex-1">
                              <p className="font-medium">{booking.customerName}</p>
                              <div className="space-y-1 mt-1">
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {booking.pickupAddress}
                                </p>
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {booking.dropoffAddress}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {booking.date}
                                </p>
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-primary">
                                ${booking.earnings}
                              </div>
                              <Badge variant="default" className="mt-1">
                                Paid
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Empty State */}
                {earnings.completedJobs === 0 && (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <DollarSign className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                      <h3 className="font-semibold text-lg mb-2">No Earnings Yet</h3>
                      <p className="text-muted-foreground">
                        Complete jobs to start earning money!
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="payouts" className="space-y-6">
            <MoverPayoutCenter />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
