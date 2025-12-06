import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MapPin, Calendar, Package, DollarSign, MessageCircle, Star, ChevronDown, Sparkles, CreditCard, CheckCircle2, XCircle, Navigation, Clock, TrendingUp, ArrowRight, AlertTriangle, Loader2, Info } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { generatePriceExplanation } from "@shared/ai";

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
  numberOfMovers: number | null;
  paymentStatus: string | null;
  createdAt: string;
  mover: {
    id: string;
    name: string;
    vehicleType: string;
    rating: string;
  } | null;
};

export default function MyBookings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: [`/api/bookings?customerId=${user?.id}`],
    enabled: !!user?.id,
  });

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
        ) : !bookings || bookings.length === 0 ? (
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
            {bookings.map((booking) => (
              <Card key={booking.id} className="overflow-hidden" data-testid={`card-booking-${booking.id}`}>
                {/* Status Bar */}
                <div className={`h-1 ${
                  booking.status === 'pending' ? 'bg-amber-500' :
                  booking.status === 'confirmed' ? 'bg-blue-500' :
                  booking.status === 'in_transit' ? 'bg-primary' :
                  booking.status === 'completed' ? 'bg-green-500' : 'bg-red-500'
                }`} />
                
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
                      {booking.mover && (
                        <div className="bg-muted/30 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <Star className="w-4 h-4 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Mover</p>
                          </div>
                          <p className="font-medium" data-testid={`text-mover-${booking.id}`}>{booking.mover.name}</p>
                          <p className="text-sm text-muted-foreground">{parseFloat(booking.mover.rating).toFixed(1)} rating</p>
                        </div>
                      )}
                    </div>
                  </div>

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
                          {parseFloat(booking.loadFee || "0") > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Load Fee ({booking.loadSize})</span>
                              <span className="font-medium" data-testid={`text-breakdown-load-${booking.id}`}>${parseFloat(booking.loadFee || "0").toFixed(2)}</span>
                            </div>
                          )}
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

                  {/* Images */}
                  {booking.images && booking.images.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        Item Photos ({booking.images.length})
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {booking.images.map((imageUrl, index) => (
                          <div key={index} className="relative aspect-square rounded-lg overflow-hidden border hover-elevate">
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
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                    {booking.status === "in_transit" && (
                      <Button
                        onClick={() => setLocation(`/track-trip/${booking.id}`)}
                        data-testid={`button-track-trip-${booking.id}`}
                      >
                        <Navigation className="w-4 h-4 mr-2" />
                        Track Trip Live
                      </Button>
                    )}
                    {(booking.status === "confirmed" || booking.status === "pending") && booking.paymentStatus !== "succeeded" && booking.price && (
                      <Button
                        onClick={() => setLocation(`/payment/${booking.id}`)}
                        className="bg-gradient-to-r from-primary to-primary/80"
                        data-testid={`button-pay-${booking.id}`}
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Pay ${parseFloat(booking.price).toFixed(2)} CAD
                      </Button>
                    )}
                    {booking.status === "pending" && (
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
    </div>
  );
}
