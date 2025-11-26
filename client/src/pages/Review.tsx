import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Booking = {
  id: string;
  customerId: string;
  moverId: string | null;
  status: string;
  mover: {
    id: string;
    name: string;
    vehicleType: string;
  } | null;
};

export default function Review() {
  const { user } = useAuth();
  const [, params] = useRoute("/review/:bookingId");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const bookingId = params?.bookingId;

  const { data: booking } = useQuery<Booking>({
    queryKey: [`/api/bookings/${bookingId}`],
    enabled: !!bookingId,
  });

  const submitReviewMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/reviews", {
        bookingId,
        moverId: booking?.moverId,
        customerId: user?.id,
        rating,
        comment: comment || null,
      });
    },
    onSuccess: () => {
      toast({
        title: "Review submitted",
        description: "Thank you for your feedback!",
      });
      setLocation("/my-bookings");
    },
  });

  if (!user || !bookingId) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">Invalid booking.</p>
        </div>
      </div>
    );
  }

  if (!booking?.mover) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">No mover assigned to this booking.</p>
        </div>
      </div>
    );
  }

  if (booking.status !== "completed") {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">
            You can only leave a review after the move is completed.
          </p>
          <Button
            variant="outline"
            className="mt-4 text-orange-600 border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20"
            onClick={() => setLocation("/my-bookings")}
          >
            Back to My Bookings
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast({
        title: "Please select a rating",
        description: "Rating is required to submit a review.",
        variant: "destructive",
      });
      return;
    }
    submitReviewMutation.mutate();
  };

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Leave a Review</h1>
          <p className="text-muted-foreground">
            How was your experience with {booking.mover.name}?
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{booking.mover.name}</CardTitle>
            <CardDescription>{booking.mover.vehicleType}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Rating *
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      className="transition-transform hover:scale-110"
                      data-testid={`button-rating-${star}`}
                    >
                      <Star
                        className={`w-8 h-8 ${
                          star <= (hoveredRating || rating)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <p className="text-sm text-muted-foreground mt-2" data-testid="text-rating-selected">
                    {rating} {rating === 1 ? "star" : "stars"}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="comment" className="block text-sm font-medium mb-2">
                  Comment (optional)
                </label>
                <Textarea
                  id="comment"
                  placeholder="Share details about your experience..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  data-testid="input-comment"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={submitReviewMutation.isPending || rating === 0}
                  data-testid="button-submit-review"
                >
                  Submit Review
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/my-bookings")}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
