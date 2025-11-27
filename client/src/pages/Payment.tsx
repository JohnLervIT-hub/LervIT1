import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, DollarSign, CheckCircle2, Loader2 } from "lucide-react";
import type { Booking } from "@shared/schema";

// Initialize Stripe
if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}

// Initialize Stripe with configured key
const stripeKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;

// Validate Stripe key type (warning only to not block testing)
if (stripeKey.startsWith('sk_')) {
  console.error('[Payment] ERROR: VITE_STRIPE_PUBLIC_KEY contains a secret key (sk_). This will fail in production. Please update to use a publishable key (pk_).');
} else if (!stripeKey.startsWith('pk_')) {
  console.warn('[Payment] Warning: Stripe key does not start with pk_ - this may not be a valid publishable key');
} else {
  console.log('[Payment] Stripe configured with publishable key');
}

const stripePromise = loadStripe(stripeKey);

const CheckoutForm = ({ bookingId }: { bookingId: string }) => {
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

    // Use redirect: 'if_required' to handle payment inline without redirect
    // This avoids cross-origin navigation errors in iframes
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/my-bookings`,
      },
      redirect: 'if_required',
    });

    setIsProcessing(false);

    if (error) {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      // Payment succeeded
      toast({
        title: "Payment Successful!",
        description: "Thank you! Your payment has been processed.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
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
  const [, params] = useRoute("/payment/:bookingId");
  const [, setLocation] = useLocation();
  const [clientSecret, setClientSecret] = useState("");
  const bookingId = params?.bookingId;

  const { data: booking, isLoading: bookingLoading } = useQuery<Booking>({
    queryKey: [`/api/bookings/${bookingId}`],
    enabled: !!bookingId,
  });

  useEffect(() => {
    if (!bookingId || !user) return;

    // Create payment intent when component loads
    apiRequest("POST", `/api/bookings/${bookingId}/create-payment-intent`, {})
      .then(async (res) => {
        const data = await res.json();
        
        if (!res.ok) {
          // Check if payment was already completed
          if (data.alreadyPaid) {
            // Invalidate booking cache to refresh status
            queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
            queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
            // Redirect to my-bookings
            setLocation("/my-bookings");
            return;
          }
          console.error("Payment intent error:", data.error);
          return;
        }
        
        setClientSecret(data.clientSecret);
      })
      .catch((error) => {
        console.error("Error creating payment intent:", error);
      });
  }, [bookingId, user, setLocation]);

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
                  {booking.preferredDate}
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
            {!clientSecret ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <CheckoutForm bookingId={bookingId} />
              </Elements>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>🔒 Payments are securely processed by Stripe</p>
        </div>
      </div>
    </div>
  );
}
