import { memo } from "react";
import { CheckCircle2, Loader2, AlertCircle, Package } from "lucide-react";
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

export function totalVolumeFt3(items: IdentifiedItem[]): number {
  return items.reduce((sum, i) => sum + parseFloat(i.volumeCuft || "0"), 0);
}

interface DetectedItemsSummaryProps {
  items: IdentifiedItem[];
  className?: string;
}

export const DetectedItemsSummary = memo(function DetectedItemsSummary({
  items,
  className,
}: DetectedItemsSummaryProps) {
  if (items.length === 0) return null;

  const completed = items.filter((i) => i.processingStatus === "completed");
  const pending = items.filter(
    (i) => i.processingStatus === "pending" || i.processingStatus === "processing",
  );
  const failed = items.filter((i) => i.processingStatus === "failed");

  const volume = totalVolumeFt3(completed);

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
