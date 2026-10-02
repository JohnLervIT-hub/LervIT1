import { memo } from "react";
import { CheckCircle2, Loader2, AlertCircle, Package } from "lucide-react";
import { getVehicleDisplayName } from "@/lib/utils";
import type { IdentifiedItem } from "@shared/schema";

/**
 * Read-only account of what the vision engine found.
 *
 * Replaces the editable item list. The quantity steppers, per-item size/weight
 * fields and row delete buttons are gone on purpose: every one of them was a
 * price input the customer controlled, and the measured volume is the whole
 * basis of the quote. A customer who spots a mistake uses the notes field, and a
 * wrong photo is removed from the upload grid (which drops its item too).
 */

/** `quantity` lives in sourceMetadata; volumeCuft on the row is the total. */
function readQuantity(item: IdentifiedItem): number {
  try {
    const parsed = item.sourceMetadata ? JSON.parse(item.sourceMetadata) : {};
    const q = Number(parsed.quantity);
    return q > 0 ? Math.floor(q) : 1;
  } catch {
    return 1;
  }
}

/**
 * "3-seat sofa, queen bed frame, 6 boxes" — the name already carries the count
 * when the engine detected several ("3 moving boxes (large)"), so a quantity is
 * only prefixed when the name does not already start with one.
 */
export function describeItems(items: IdentifiedItem[]): string {
  return items
    .map((item) => {
      const name = item.itemName?.trim() || "item";
      const quantity = readQuantity(item);
      if (quantity <= 1 || /^\d/.test(name)) return name;
      return `${quantity}× ${name}`;
    })
    .join(", ");
}

/**
 * Mean per-item confidence as a percentage, or null when nothing reported one.
 * Returned as null (not 0) so an engine that omits confidence hides the stat
 * instead of advertising "0%" accuracy on a perfectly good identification.
 */
export function averageConfidencePct(items: IdentifiedItem[]): number | null {
  const scores = items
    .map((i) => parseFloat(i.confidence || "0"))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (scores.length === 0) return null;
  return (scores.reduce((sum, n) => sum + n, 0) / scores.length) * 100;
}

export function totalVolumeFt3(items: IdentifiedItem[]): number {
  return items.reduce((sum, i) => sum + parseFloat(i.volumeCuft || "0"), 0);
}

interface DetectedItemsSummaryProps {
  items: IdentifiedItem[];
  /**
   * Vehicle tier key ('car' | 'pickup' | 'van' | 'truck') and mover count, both
   * passed in rather than re-derived here. The caller already computes them —
   * volume thresholds, weight and dimension bumps, and the per-item database
   * vehicle floor — and the same values feed the price. A second derivation in
   * this component would be a copy that silently drifts from the quote.
   */
  vehicle?: string | null;
  movers?: number | null;
  className?: string;
}

export const DetectedItemsSummary = memo(function DetectedItemsSummary({
  items,
  vehicle,
  movers,
  className,
}: DetectedItemsSummaryProps) {
  if (items.length === 0) return null;

  const completed = items.filter((i) => i.processingStatus === "completed");
  const pending = items.filter(
    (i) => i.processingStatus === "pending" || i.processingStatus === "processing",
  );
  const failed = items.filter((i) => i.processingStatus === "failed");

  const volume = totalVolumeFt3(completed);
  const confidencePct = averageConfidencePct(completed);

  return (
    <div
      className={`rounded-xl border border-border/60 bg-muted/30 p-4 ${className ?? ""}`}
      data-testid="detected-items-summary"
    >
      {completed.length > 0 && (
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm leading-relaxed" data-testid="text-detected-items">
              <span className="font-semibold">Detected: </span>
              {describeItems(completed)}
              {volume > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  (est. {volume.toFixed(volume < 10 ? 1 : 0)} ft³)
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              Measured from your photos. Missed something? Add it in the notes below.
            </p>
          </div>
        </div>
      )}

      {/* Recommendations — read-only. Restored from the pre-vision-first item
          list, without the quantity steppers / size+weight fields that came with
          it: these four are an account of what the photos measured, not inputs
          the customer can turn to move the price. */}
      {completed.length > 0 && (
        <div
          className="mt-3 pt-3 border-t border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-3"
          data-testid="detected-items-recommendations"
        >
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
              Total Volume
            </p>
            <p className="text-xl font-bold tabular-nums" data-testid="stat-total-volume">
              {volume.toFixed(volume < 10 ? 1 : 0)}
              <span className="text-sm font-medium text-muted-foreground"> ft³</span>
            </p>
          </div>

          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
              Vehicle
            </p>
            <p className="text-xl font-bold" data-testid="stat-vehicle">
              {vehicle ? getVehicleDisplayName(vehicle) : "—"}
            </p>
          </div>

          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
              Movers
            </p>
            <p className="text-xl font-bold tabular-nums" data-testid="stat-movers">
              {movers && movers > 0 ? movers : "—"}
            </p>
          </div>

          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
              AI Confidence
            </p>
            <p className="text-xl font-bold tabular-nums" data-testid="stat-confidence">
              {confidencePct === null ? "—" : `${confidencePct.toFixed(0)}%`}
            </p>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex items-center gap-2.5 mt-2" data-testid="text-detected-pending">
          <Loader2 className="w-4 h-4 text-primary shrink-0 animate-spin" />
          <p className="text-sm text-muted-foreground">
            Still analysing {pending.length} photo{pending.length === 1 ? "" : "s"}…
          </p>
        </div>
      )}

      {/* A failed photo still counts against the load: saying nothing would let a
          quote look complete while an item is silently missing from it. */}
      {failed.length > 0 && (
        <div className="flex items-start gap-2.5 mt-2" data-testid="text-detected-failed">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            {failed.length} photo{failed.length === 1 ? "" : "s"} couldn't be analysed.
            Re-upload {failed.length === 1 ? "it" : "them"}, or describe the items in
            the notes below.
          </p>
        </div>
      )}

      {completed.length === 0 && pending.length === 0 && failed.length === 0 && (
        <div className="flex items-center gap-2.5">
          <Package className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">No items detected yet.</p>
        </div>
      )}
    </div>
  );
});
