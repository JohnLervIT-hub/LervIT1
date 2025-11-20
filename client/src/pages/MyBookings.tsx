import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MapPin, Calendar, Package, DollarSign, MessageCircle, Star, ChevronDown, Sparkles } from "lucide-react";
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

  if (!user) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">Please log in to view your bookings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">My Bookings</h1>
          <p className="text-muted-foreground">Track and manage your move requests</p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading your bookings...</p>
          </div>
        ) : !bookings || bookings.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground mb-4">You don't have any bookings yet.</p>
              <Button onClick={() => setLocation("/request-move")} data-testid="button-book-move">
                Book Your First Move
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <Card key={booking.id} className="hover-elevate" data-testid={`card-booking-${booking.id}`}>
                <CardHeader>
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <CardTitle className="text-xl">
                        Move #{booking.id.slice(0, 8)}
                      </CardTitle>
                      <CardDescription>
                        Booked on {format(new Date(booking.createdAt), "MMM d, yyyy")}
                      </CardDescription>
                    </div>
                    <Badge variant={getStatusColor(booking.status) as any} data-testid={`badge-status-${booking.id}`}>
                      {getStatusLabel(booking.status)}
                    </Badge>
                  </div>
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
                            <p className="text-sm text-muted-foreground" data-testid={`text-distance-${booking.id}`}>
                              {parseFloat(booking.distance).toFixed(2)} km
                            </p>
                          </div>
                        </div>
                      )}
                      {booking.price && (
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Price</p>
                            <p className="text-sm text-muted-foreground" data-testid={`text-price-${booking.id}`}>
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
                              <span className="font-medium" data-testid={`text-breakdown-base-${booking.id}`}>
                                ${parseFloat(booking.baseFee).toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Distance Fee ({booking.distance ? parseFloat(booking.distance).toFixed(2) : '0'} km × $1.00/km)
                              </span>
                              <span className="font-medium" data-testid={`text-breakdown-distance-${booking.id}`}>
                                ${parseFloat(booking.distanceFee || "0").toFixed(2)}
                              </span>
                            </div>
                            {parseFloat(booking.loadFee || "0") > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Load Fee ({booking.loadSize})</span>
                                <span className="font-medium" data-testid={`text-breakdown-load-${booking.id}`}>
                                  ${parseFloat(booking.loadFee || "0").toFixed(2)}
                                </span>
                              </div>
                            )}
                            {parseFloat(booking.pickupDifficultyFee || "0") > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Pickup Difficulty Fee</span>
                                <span className="font-medium" data-testid={`text-breakdown-pickup-difficulty-${booking.id}`}>
                                  ${parseFloat(booking.pickupDifficultyFee || "0").toFixed(2)}
                                </span>
                              </div>
                            )}
                            {parseFloat(booking.dropoffDifficultyFee || "0") > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Dropoff Difficulty Fee</span>
                                <span className="font-medium" data-testid={`text-breakdown-dropoff-difficulty-${booking.id}`}>
                                  ${parseFloat(booking.dropoffDifficultyFee || "0").toFixed(2)}
                                </span>
                              </div>
                            )}
                            {parseFloat(booking.heavyItemFee || "0") > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Heavy Item Fee</span>
                                <span className="font-medium" data-testid={`text-breakdown-heavy-item-${booking.id}`}>
                                  ${parseFloat(booking.heavyItemFee || "0").toFixed(2)}
                                </span>
                              </div>
                            )}
                            {parseFloat(booking.moverTravelFee || "0") > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Mover Travel Fee</span>
                                <span className="font-medium" data-testid={`text-breakdown-travel-${booking.id}`}>
                                  ${parseFloat(booking.moverTravelFee || "0").toFixed(2)}
                                </span>
                              </div>
                            )}
                            {booking.numberOfMovers === 2 && booking.subtotal != null && (() => {
                              const subtotalValue = Number(booking.subtotal);
                              if (!Number.isNaN(subtotalValue)) {
                                const postMultiplierSubtotal = subtotalValue * 1.75;
                                return (
                                  <>
                                    <div className="h-px bg-border my-2" />
                                    <div className="flex justify-between text-primary">
                                      <span className="font-medium">Subtotal after 2-Movers Multiplier (×1.75)</span>
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
                              <span>Total</span>
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
                            AI Explain My Price
                          </Button>
                        </CollapsibleContent>
                      </Collapsible>
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

                  {booking.mover && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Assigned Mover</p>
                          <p className="text-sm text-muted-foreground" data-testid={`text-mover-${booking.id}`}>
                            {booking.mover.name} • {booking.mover.vehicleType} • {parseFloat(booking.mover.rating).toFixed(1)}★
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    {booking.status === "pending" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => cancelBookingMutation.mutate(booking.id)}
                        disabled={cancelBookingMutation.isPending}
                        data-testid={`button-cancel-${booking.id}`}
                      >
                        Cancel Booking
                      </Button>
                    )}
                    {booking.mover && booking.status !== "cancelled" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/messages/${booking.id}`)}
                        data-testid={`button-message-${booking.id}`}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Message Mover
                      </Button>
                    )}
                    {booking.status === "completed" && booking.mover && (
                      <Button
                        variant="default"
                        size="sm"
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
