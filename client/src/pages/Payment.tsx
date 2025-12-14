import { useEffect, useState, useRef, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, DollarSign, CheckCircle2, Loader2, Shield } from "lucide-react";
import type { Booking } from "@shared/schema";

// Lazy-load Stripe only when payment page is accessed
let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = () => {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
    if (!key) {
      console.error('Missing VITE_STRIPE_PUBLIC_KEY');
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
};

const CheckoutForm = ({ bookingId, userId }: { bookingId: string; userId: string }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      // Use redirect: 'if_required' to handle payment inline without redirect
      // This avoids cross-origin navigation errors in iframes
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/my-bookings`,
        },
        redirect: 'if_required',
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message || "An error occurred during payment. Please try again.",
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Payment succeeded - update booking status immediately
        try {
          await apiRequest("POST", `/api/bookings/${bookingId}/confirm-payment`, {
            paymentIntentId: paymentIntent.id
          });
        } catch {
          // Payment confirmed via webhook
        }
        
        toast({
          title: "Payment Successful!",
          description: "Thank you! Your payment has been processed. Finding movers now...",
        });
        queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/bookings?customerId=${userId}`] });
        setTimeout(() => setLocation("/my-bookings"), 1500);
      } else if (paymentIntent && paymentIntent.status === 'processing') {
        toast({
          title: "Payment Processing",
          description: "Your payment is being processed. We'll update you shortly.",
        });
        setTimeout(() => setLocation("/my-bookings"), 1500);
      } else {
        // Handle other statuses
        toast({
          title: "Payment Status",
          description: `Payment status: ${paymentIntent?.status || 'unknown'}`,
        });
      }
    } catch (err) {
      // Handle any unexpected errors from Stripe
      console.error("Payment error:", err);
      toast({
        title: "Payment Error",
        description: "Something went wrong. Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      // Always reset processing state
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button 
        type="submit" 
        className="w-full" 
        disabled={!stripe || !elements || isProcessing}
        data-testid="button-submit-payment"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          "Pay Now"
        )}
      </Button>
    </form>
  );
};

export default function Payment() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, params] = useRoute("/payment/:bookingId");
  const [, setLocation] = useLocation();
  const [clientSecret, setClientSecret] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const bookingId = params?.bookingId;

  const { data: booking, isLoading: bookingLoading } = useQuery<Booking>({
    queryKey: [`/api/bookings/${bookingId}`],
    enabled: !!bookingId,
  });

  // Track if payment intent was already created to prevent duplicates
  const paymentIntentCreated = useRef(false);

  const createPaymentIntent = async () => {
    if (!bookingId || !user) return;
    
    setIsCreatingIntent(true);
    setPaymentError(null);
    
    try {
      const res = await apiRequest("POST", `/api/bookings/${bookingId}/create-payment-intent`, {});
      const data = await res.json();
      
      if (!res.ok) {
        if (data.alreadyPaid) {
          queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
          queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
          setLocation("/my-bookings");
          return;
        }
        throw new Error(data.error || "Failed to initialize payment");
      }
      
      if (!data.clientSecret) {
        throw new Error("No payment session received");
      }
      
      setClientSecret(data.clientSecret);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load payment form";
      setPaymentError(errorMessage);
      toast({
        title: "Payment Setup Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsCreatingIntent(false);
    }
  };

  useEffect(() => {
    if (!bookingId || !user || paymentIntentCreated.current || clientSecret) return;
    paymentIntentCreated.current = true;
    createPaymentIntent();
  }, [bookingId, user, clientSecret]);

  if (!user || !bookingId) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">Invalid booking or not logged in.</p>
        </div>
      </div>
    );
  }

  if (bookingLoading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">Booking not found.</p>
          <Button onClick={() => setLocation("/my-bookings")} className="mt-4 bg-orange-500 hover:bg-orange-600 text-white">
            Back to My Bookings
          </Button>
        </div>
      </div>
    );
  }

  // Check if booking is already paid
  if (booking.paymentStatus === 'succeeded') {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-2xl mx-auto px-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
                <CardTitle>Payment Complete</CardTitle>
              </div>
              <CardDescription>This booking has already been paid</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setLocation("/my-bookings")} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                Back to My Bookings
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 bg-muted/30">
      <div className="max-w-2xl mx-auto px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Complete Your Payment</h1>
          <p className="text-muted-foreground">
            Secure your booking by completing the payment below
          </p>
        </div>

        {/* Booking Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Booking Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium">Pickup</div>
                <div className="text-sm text-muted-foreground" data-testid="text-pickup-address">
                  {booking.pickupAddress}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium">Dropoff</div>
                <div className="text-sm text-muted-foreground" data-testid="text-dropoff-address">
                  {booking.dropoffAddress}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div>
                <span className="font-medium">Date: </span>
                <span className="text-muted-foreground" data-testid="text-booking-date">
                  {booking.preferredDate ? new Date(booking.preferredDate).toLocaleDateString() : 'TBD'}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between text-lg">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  <span className="font-semibold">Total Amount</span>
                </div>
                <span className="text-2xl font-bold" data-testid="text-total-amount">
                  ${booking.price}
                </span>
              </div>
              <Badge variant="outline" className="mt-2">
                {booking.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Payment Form */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Information</CardTitle>
            <CardDescription>
              Enter your payment details to complete the booking
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paymentError ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="text-center">
                  <p className="text-destructive font-medium">Unable to load payment form</p>
                  <p className="text-sm text-muted-foreground mt-1">{paymentError}</p>
                </div>
                <Button 
                  onClick={() => {
                    paymentIntentCreated.current = false;
                    setPaymentError(null);
                    createPaymentIntent();
                  }}
                  disabled={isCreatingIntent}
                  data-testid="button-retry-payment-setup"
                >
                  {isCreatingIntent ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    "Try Again"
                  )}
                </Button>
              </div>
            ) : !clientSecret ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <Elements stripe={getStripe()} options={{ clientSecret }}>
                <CheckoutForm bookingId={bookingId} userId={user?.id || ''} />
              </Elements>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Shield className="w-4 h-4" />
          <p>Payments are securely processed by Stripe</p>
        </div>
      </div>
    </div>
  );
}
