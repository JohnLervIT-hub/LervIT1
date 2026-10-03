import { memo } from "react";
import { CheckCircle2, Loader2, AlertCircle, Package, Truck, Weight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getVehicleDisplayName } from "@/lib/utils";
import type { VehicleType } from "@shared/furniture-database";
import type { IdentifiedItem } from "@shared/schema";

/**
 * Read-only account of what the vision engine found, plus the Recommendations
 * card restored from the pre-34e1603 design.
 *
 * What is deliberately NOT here and must not come back: the editable item list,
 * quantity steppers, per-item size/weight fields and the "Correct this item"
 * dialog. Every one was a price input the customer controlled, and the measured
 * volume is the whole basis of the quote. A customer who spots a mistake uses
 * the notes field; a wrong photo is removed from the upload grid (which drops
 * its item too).
 *
 * Also absent by design: any vehicle cascade. The old card carried a 70-line
 * getVehicleRecommendation() that re-derived volume thresholds, weight bumps,
 * dimension bumps and the database vehicle floor — a second derivation that
 * drifts from the one feeding the price. `vehicle` arrives as a prop, already
 * decided by the caller.
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

export function totalWeightKg(items: IdentifiedItem[]): number {
  return items.reduce((sum, i) => sum + parseFloat(i.weightKg || "0"), 0);
}

/**
 * Tier accent for the Recommendations card. A lookup keyed by the vehicle tier,
 * not a derivation — an absent or unrecognised tier falls back to neutral
 * styling rather than implying a vehicle the caller never chose.
 */
const TIER_STYLES: Record<
  string,
  { border: string; bg: string; gradient: string; text: string }
> = {
  car: {
    border: "border-green-200 dark:border-green-800",
    bg: "bg-green-50 dark:bg-green-950/30",
    gradient: "from-green-500 to-emerald-500",
    text: "text-green-700 dark:text-green-400",
  },
  pickup: {
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    gradient: "from-blue-500 to-cyan-500",
    text: "text-blue-700 dark:text-blue-400",
  },
  van: {
    border: "border-orange-200 dark:border-orange-800",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    gradient: "from-orange-500 to-amber-500",
    text: "text-orange-700 dark:text-orange-400",
  },
  truck: {
    border: "border-red-200 dark:border-red-800",
    bg: "bg-red-50 dark:bg-red-950/30",
    gradient: "from-red-500 to-orange-500",
    text: "text-red-700 dark:text-red-400",
  },
};

const NEUTRAL_STYLE = {
  border: "border-border/60",
  bg: "bg-muted/30",
  gradient: "from-muted-foreground/40 to-muted-foreground/20",
  text: "text-foreground",
};

interface DetectedItemsSummaryProps {
  items: IdentifiedItem[];
  /**
   * Vehicle tier decided by the caller. Typed loosely rather than as VehicleType
   * alone because `aiRecommendedVehicle` is `string | undefined` in RequestMove;
   * narrowing here would only force a cast at the call site.
   */
  vehicle?: VehicleType | string | null;
  movers?: number | null;
  /**
   * Optional overrides. Left out, each is computed from `items`, so the card
   * cannot disagree with the rows it is summarising.
   */
  totalVolume?: number | null;
  confidence?: number | null;
  totalWeight?: number | null;
  className?: string;
}

export const DetectedItemsSummary = memo(function DetectedItemsSummary({
  items,
  vehicle,
  movers,
  totalVolume,
  confidence,
  totalWeight,
  className,
}: DetectedItemsSummaryProps) {
  if (items.length === 0) return null;

  const completed = items.filter((i) => i.processingStatus === "completed");
  const pending = items.filter(
    (i) => i.processingStatus === "pending" || i.processingStatus === "processing",
  );
  const failed = items.filter((i) => i.processingStatus === "failed");

  const volume =
    totalVolume != null && totalVolume > 0 ? totalVolume : totalVolumeFt3(completed);
  const confidencePct = confidence != null ? confidence : averageConfidencePct(completed);
  const weight =
    totalWeight != null && totalWeight > 0 ? totalWeight : totalWeightKg(completed);

  const style = (vehicle && TIER_STYLES[vehicle]) || NEUTRAL_STYLE;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <div
        className="rounded-xl border border-border/60 bg-muted/30 p-4"
        data-testid="detected-items-summary"
      >
        {completed.length > 0 && (
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm leading-relaxed" data-testid="text-detected-items">
                <span className="font-semibold">Detected: </span>
                {describeItems(completed)}
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

      {/* Recommendations — read-only. An account of what the photos measured,
          not inputs the customer can turn to move the price. */}
      {completed.length > 0 && (
        <Card
          className={`overflow-hidden border ${style.border} ${style.bg}`}
          data-testid="detected-items-recommendations"
        >
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className={`bg-gradient-to-br ${style.gradient} rounded-lg p-2`}>
                <Truck className="h-5 w-5 text-white" />
              </div>
              <h5 className="font-semibold text-lg">Recommendations</h5>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium uppercase tracking-wide">
                  Total Volume
                </p>
                <p
                  className="text-2xl sm:text-3xl font-bold tabular-nums"
                  data-testid="stat-total-volume"
                >
                  {volume.toFixed(1)}
                </p>
                <p className="text-sm text-muted-foreground">cubic feet</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium uppercase tracking-wide">
                  Vehicle
                </p>
                <p
                  className={`text-xl sm:text-2xl font-bold ${style.text}`}
                  data-testid="stat-vehicle"
                >
                  {vehicle ? getVehicleDisplayName(vehicle) : "—"}
                </p>
                <p className="text-sm text-muted-foreground">recommended</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium uppercase tracking-wide">
                  Movers
                </p>
                <div className="flex items-baseline gap-1">
                  <p
                    className="text-2xl sm:text-3xl font-bold tabular-nums"
                    data-testid="stat-movers"
                  >
                    {movers && movers > 0 ? movers : "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">needed</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium uppercase tracking-wide">
                  AI Confidence
                </p>
                <p
                  className="text-2xl sm:text-3xl font-bold tabular-nums"
                  data-testid="stat-confidence"
                >
                  {confidencePct === null ? "—" : `${confidencePct.toFixed(0)}%`}
                </p>
                <p className="text-sm text-muted-foreground">match quality</p>
              </div>
            </div>

            {weight > 0 && (
              <div className="mt-5 pt-5 border-t border-border/50 flex items-center gap-2 text-sm text-muted-foreground">
                <Weight className="h-4 w-4" />
                <span>
                  Est. total weight:{" "}
                  <span className="font-semibold text-foreground" data-testid="stat-total-weight">
                    {weight.toFixed(0)} kg
                  </span>
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
});
