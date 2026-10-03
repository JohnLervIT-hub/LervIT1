import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { queryClient } from "@/lib/queryClient";
import {
  PIECE_COUNT_DISPUTE_STATUS,
  PIECE_COUNT_DISPUTE_WINDOW_MS,
} from "@shared/schema";

/**
 * The customer's side of a piece-count-discrepancy claim.
 *
 * Only actionable while the status is 'pending_customer'. Every other state is a
 * read-only line: the claim has been settled one way or another and there is
 * nothing left for the customer to do, so showing buttons would invite a click
 * that 409s.
 */

interface PieceCountDisputeBannerProps {
  bookingId: string;
  disputeStatus: string | null;
  disputeOpenedAt: string | Date | null;
  declaredPieceCount: number | null;
  actualPieceCountOnArrival: number | null;
}

const READ_ONLY_LABELS: Record<string, { label: string; tone: string }> = {
  [PIECE_COUNT_DISPUTE_STATUS.CUSTOMER_CONFIRMED]: {
    label: "Dispute confirmed — cancellation processed",
    tone: "text-muted-foreground",
  },
  [PIECE_COUNT_DISPUTE_STATUS.CUSTOMER_DISPUTED]: {
    label: "Under review — our team will respond within 48 hours",
    tone: "text-amber-700 dark:text-amber-300",
  },
  [PIECE_COUNT_DISPUTE_STATUS.OPS_REVIEW]: {
    label: "Under review by our team",
    tone: "text-amber-700 dark:text-amber-300",
  },
  [PIECE_COUNT_DISPUTE_STATUS.RESOLVED]: {
    label: "Piece count dispute resolved",
    tone: "text-muted-foreground",
  },
};

export function PieceCountDisputeBanner({
  bookingId,
  disputeStatus,
  disputeOpenedAt,
  declaredPieceCount,
  actualPieceCountOnArrival,
}: PieceCountDisputeBannerProps) {
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<"confirm" | "dispute" | null>(null);

  if (!disputeStatus) return null;

  if (disputeStatus !== PIECE_COUNT_DISPUTE_STATUS.PENDING_CUSTOMER) {
    const meta = READ_ONLY_LABELS[disputeStatus];
    if (!meta) return null;
    return (
      <p
        className={`px-4 py-2 text-xs ${meta.tone}`}
        data-testid={`text-piece-count-dispute-status-${bookingId}`}
      >
        {meta.label}
      </p>
    );
  }

  if (submitted === "confirm") {
    return (
      <div className="flex items-center gap-2 bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Thanks — we've recorded your confirmation.
      </div>
    );
  }
  if (submitted === "dispute") {
    return (
      <div className="flex items-center gap-2 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <ShieldQuestion className="h-4 w-4 shrink-0" />
        Your dispute has been submitted. Our team will review within 48 hours.
      </div>
    );
  }

  const deadline = disputeOpenedAt
    ? new Date(new Date(disputeOpenedAt).getTime() + PIECE_COUNT_DISPUTE_WINDOW_MS)
    : null;

  async function send(action: "confirm" | "dispute", evidencePhotoUrl?: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/piece-count-dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, evidencePhotoUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not record your response");
      }
      setSubmitted(action);
      setDisputeOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record your response");
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch(`/api/bookings/${bookingId}/piece-count-evidence`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error("Upload returned no URL");
      setPhotoUrl(data.url);
    } catch (err) {
      setPhotoUrl(null);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div
        className="border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40"
        data-testid={`banner-piece-count-dispute-${bookingId}`}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Your mover reported{" "}
              <span className="font-semibold">{actualPieceCountOnArrival ?? "a different number of"}</span>{" "}
              pieces. You declared{" "}
              <span className="font-semibold">{declaredPieceCount ?? "no count"}</span>.
              {deadline && ` Confirm or dispute before ${deadline.toLocaleString()}.`}
            </p>
            {error && (
              <p className="text-xs text-destructive" data-testid="text-dispute-error">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={submitting}
                onClick={() => void send("confirm")}
                data-testid={`button-dispute-confirm-${bookingId}`}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={submitting}
                onClick={() => setDisputeOpen(true)}
                data-testid={`button-dispute-open-${bookingId}`}
              >
                Dispute
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={disputeOpen} onOpenChange={(o) => !submitting && setDisputeOpen(o)}>
        <DialogContent data-testid="dialog-piece-count-dispute">
          <DialogHeader>
            <DialogTitle>Upload a photo of your items</DialogTitle>
            <DialogDescription>
              A photo of what was actually there helps our team settle this quickly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              type="file"
              accept="image/*"
              disabled={uploading || submitting}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
              }}
              className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium"
              data-testid="input-dispute-photo"
            />
            {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
            {photoUrl && !uploading && (
              <img
                src={photoUrl}
                alt="Your items"
                className="h-20 w-20 rounded-md object-cover ring-1 ring-border"
                data-testid="img-dispute-thumbnail"
              />
            )}
            <Button
              className="w-full"
              disabled={!photoUrl || uploading || submitting}
              onClick={() => photoUrl && void send("dispute", photoUrl)}
              data-testid="button-dispute-submit"
            >
              {submitting ? "Submitting…" : "Submit dispute"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
