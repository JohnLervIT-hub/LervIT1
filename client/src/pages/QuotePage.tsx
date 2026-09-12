import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Loader2, Clock } from "lucide-react";

type Status = "loading" | "found" | "expired" | "error";

export default function QuotePage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!id) return;

    fetch(`/api/quotes/${id}`)
      .then(async r => {
        if (r.status === 410) {
          setStatus("expired");
          return null;
        }
        if (!r.ok) {
          setStatus("error");
          return null;
        }
        return r.json();
      })
      .then(quote => {
        if (!quote?.id) return;
        setStatus("found");
        const params = new URLSearchParams({
          quote: id,
          pickup: quote.pickupAddress ?? "",
          dropoff: quote.dropoffAddress ?? "",
        });
        if (quote.pickupLat != null && quote.pickupLng != null) {
          params.set("pickupLat", String(quote.pickupLat));
          params.set("pickupLng", String(quote.pickupLng));
        }
        if (quote.dropoffLat != null && quote.dropoffLng != null) {
          params.set("dropoffLat", String(quote.dropoffLat));
          params.set("dropoffLng", String(quote.dropoffLng));
        }
        navigate(`/request-move?${params.toString()}`);
      })
      .catch(() => setStatus("error"));
  }, [id, navigate]);

  if (status === "loading" || status === "found") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-muted-foreground">Loading your quote...</p>
        </div>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <Clock className="w-12 h-12 mx-auto mb-4 text-amber-500" />
          <h1 className="text-xl font-bold mb-2">Quote Expired</h1>
          <p className="text-muted-foreground mb-6">
            This quote has expired (quotes are valid for 48 hours). Get a fresh instant quote:
          </p>
          <a
            href="/request-move"
            className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold inline-block"
          >
            Get New Quote →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <h1 className="text-xl font-bold mb-2">Quote Not Found</h1>
        <p className="text-muted-foreground mb-6">This quote link is invalid or has expired.</p>
        <a
          href="/request-move"
          className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold inline-block"
        >
          Get New Quote →
        </a>
      </div>
    </div>
  );
}
