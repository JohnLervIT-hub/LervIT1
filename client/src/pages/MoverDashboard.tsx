import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Calendar, Package, DollarSign, MessageCircle, CheckCircle, XCircle, ChevronDown, Users, Weight, Clock, Sparkles, Navigation, Settings } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { generatePriceExplanation } from "@shared/ai";
import { useEffect, useState } from "react";

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

export default function MoverDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [locationSharing, setLocationSharing] = useState<string | null>(null); // booking ID for active location sharing

  // First get the mover profile
  const { data: mover } = useQuery<any>({
    queryKey: [`/api/movers?userId=${user?.id}`],
    enabled: !!user?.id,
    select: (data) => Array.isArray(data) ? data[0] : data,
  });

  // Get all bookings for this mover (server returns assigned + available)
  const { data: allBookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    enabled: !!user?.id,
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
    onSuccess: () => {
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
    onSuccess: (_, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
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
      setLocationSharing(bookingId);
      toast({
        title: "Trip started",
        description: "Location sharing is now active. Your customer can track your location in real-time.",
      });
    },
  });

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

  return (
    <div className="min-h-screen pt-24 pb-12 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Mover Dashboard</h1>
            <p className="text-muted-foreground text-lg">Manage your bookings and find new jobs</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setLocation("/mover-profile")}
            className="gap-2"
            data-testid="button-edit-profile"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Profile</span>
          </Button>
        </div>

        <Tabs defaultValue="available" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="available" data-testid="tab-available" className="gap-2">
              Available Jobs
              {availableBookings && availableBookings.length > 0 && (
                <Badge variant="secondary" className="ml-1 no-default-hover-elevate">
                  {availableBookings.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="my-bookings" data-testid="tab-my-bookings">
              My Bookings
              {bookings && bookings.length > 0 && (
                <Badge variant="secondary" className="ml-1 no-default-hover-elevate">
                  {bookings.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="earnings" data-testid="tab-earnings">
              <DollarSign className="w-4 h-4 mr-1" />
              Earnings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-4">
            {!availableBookings || availableBookings.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="font-semibold text-lg mb-2">No Available Jobs</h3>
                  <p className="text-muted-foreground">
                    Check back later for new moving requests in your area.
                  </p>
                </CardContent>
              </Card>
            ) : (
              availableBookings.map((booking) => renderBookingCard(booking, true))
            )}
          </TabsContent>

          <TabsContent value="my-bookings" className="space-y-4">
            {isLoading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="flex justify-center mb-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                  <p className="text-muted-foreground">Loading your bookings...</p>
                </CardContent>
              </Card>
            ) : !bookings || bookings.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="font-semibold text-lg mb-2">No Bookings Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Accept jobs from the Available Jobs tab to get started.
                  </p>
                </CardContent>
              </Card>
            ) : (
              bookings.map((booking) => renderBookingCard(booking))
            )}
          </TabsContent>

          <TabsContent value="earnings" className="space-y-6">
            {!earnings ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="flex justify-center mb-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                  <p className="text-muted-foreground">Loading earnings...</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Earnings Summary Cards */}
                <div className="grid gap-4 md:grid-cols-3">
                  <Card data-testid="card-total-earnings">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Total Earnings
                      </CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-total-earnings">
                        ${earnings.totalEarnings}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        From {earnings.completedJobs} completed {earnings.completedJobs === 1 ? 'job' : 'jobs'}
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-pending-earnings">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Pending Earnings
                      </CardTitle>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-pending-earnings">
                        ${earnings.pendingEarnings}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        From {earnings.pendingJobs} active {earnings.pendingJobs === 1 ? 'job' : 'jobs'}
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-completed-jobs">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Completed Jobs
                      </CardTitle>
                      <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-completed-jobs-count">
                        {earnings.completedJobs}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Successfully finished
                      </p>
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
        </Tabs>
      </div>
    </div>
  );
}
