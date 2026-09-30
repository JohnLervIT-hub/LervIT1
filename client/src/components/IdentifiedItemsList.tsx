import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Package, Weight, Ruler, Truck, Users, AlertCircle, Sparkles, CheckCircle2, Box, X, DollarSign, Pencil } from "lucide-react";
import type { IdentifiedItem } from "@shared/schema";
import { VEHICLE_VOLUME_THRESHOLDS } from "@shared/furniture-database";
import { memo, useState } from "react";

/** cm³ -> ft³, matching calculateVolumeFt3 in server/vision-engine-v2.ts. */
function volumeFt3FromCm(lengthCm: number, widthCm: number, heightCm: number): number {
  return Math.round((lengthCm * widthCm * heightCm / 28316.8) * 100) / 100;
}

/**
 * Per-item figures and quantity live in `sourceMetadata` as JSON, not as
 * columns — `volumeCuft` and `weightKg` on the row are quantity-inclusive
 * TOTALS (see toIdentificationResult). Editing has to work in per-item terms
 * and re-multiply, or a quantity change would silently do nothing.
 */
function readItemMeta(item: IdentifiedItem): {
  quantity: number;
  perItemVolumeFt3: number;
  perItemWeightKg: number;
  userCorrected: boolean;
} {
  let parsed: any = {};
  try {
    parsed = item.sourceMetadata ? JSON.parse(item.sourceMetadata) : {};
  } catch {
    parsed = {};
  }
  const quantity = Number(parsed.quantity) > 0 ? Math.floor(Number(parsed.quantity)) : 1;
  const totalVolume = parseFloat(item.volumeCuft || '0');
  const totalWeight = parseFloat(item.weightKg || '0');
  return {
    quantity,
    // Fall back to dividing the total, so items analysed before per-item
    // figures were recorded still edit correctly.
    perItemVolumeFt3: Number(parsed.perItemVolumeFt3) > 0
      ? Number(parsed.perItemVolumeFt3)
      : (quantity > 0 ? totalVolume / quantity : totalVolume),
    perItemWeightKg: Number(parsed.perItemWeightKg) > 0
      ? Number(parsed.perItemWeightKg)
      : (quantity > 0 ? totalWeight / quantity : totalWeight),
    userCorrected: parsed.userCorrected === true,
  };
}

function writeItemMeta(
  item: IdentifiedItem,
  next: { quantity: number; perItemVolumeFt3: number; perItemWeightKg: number },
): string {
  let parsed: any = {};
  try {
    parsed = item.sourceMetadata ? JSON.parse(item.sourceMetadata) : {};
  } catch {
    parsed = {};
  }
  return JSON.stringify({ ...parsed, ...next, userCorrected: true });
}

// Tiered handling premiums — must stay in sync with shared/pricing.ts HEAVY_ITEM_PREMIUMS_BY_COMPLEXITY
const ITEM_PREMIUMS: Record<string, number> = { slight: 5, moderate: 10, high: 15, very_high: 30 };
const ITEM_PREMIUM_CAP = 150;

function calcTotalHandlingFee(items: IdentifiedItem[]): number {
  const total = items.reduce((sum, item) => sum + (ITEM_PREMIUMS[item.handlingComplexity || ''] ?? 0), 0);
  return Math.min(total, ITEM_PREMIUM_CAP);
}

interface IdentifiedItemsListProps {
  items: IdentifiedItem[];
  isLoading?: boolean;
  /** Called when the user removes an item; receives the item's photoUrl */
  onRemoveItem?: (photoUrl: string) => void;
  /**
   * Called when the user corrects an item. Receives the item's photoUrl and a
   * patch to merge. Omit to render the list read-only.
   */
  onUpdateItem?: (photoUrl: string, patch: Partial<IdentifiedItem>) => void;
}

/** Draft state for the edit dialog. Strings so partially-typed input is kept. */
interface ItemDraft {
  photoUrl: string;
  itemName: string;
  quantity: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightKg: string;
}

// Memoized component to prevent unnecessary re-renders
export const IdentifiedItemsList = memo(function IdentifiedItemsList({ items, isLoading, onRemoveItem, onUpdateItem }: IdentifiedItemsListProps) {
  const [draft, setDraft] = useState<ItemDraft | null>(null);

  const openEditor = (item: IdentifiedItem) => {
    const meta = readItemMeta(item);
    setDraft({
      photoUrl: item.photoUrl,
      itemName: item.itemName ?? '',
      quantity: String(meta.quantity),
      lengthCm: item.dimensionsLcm ? String(parseFloat(item.dimensionsLcm)) : '',
      widthCm: item.dimensionsWcm ? String(parseFloat(item.dimensionsWcm)) : '',
      heightCm: item.dimensionsHcm ? String(parseFloat(item.dimensionsHcm)) : '',
      // Shown and edited per item, not as the row total.
      weightKg: meta.perItemWeightKg ? String(Math.round(meta.perItemWeightKg * 10) / 10) : '',
    });
  };

  const draftItem = draft ? items.find((i) => i.photoUrl === draft.photoUrl) : undefined;

  // Live preview of the totals the correction will produce, so the customer can
  // see a quantity change land before they commit it.
  const draftTotals = (() => {
    if (!draft) return null;
    const qty = Math.max(1, Math.floor(Number(draft.quantity) || 1));
    const l = Number(draft.lengthCm) || 0;
    const w = Number(draft.widthCm) || 0;
    const h = Number(draft.heightCm) || 0;
    const perWeight = Number(draft.weightKg) || 0;
    const perVolume = l > 0 && w > 0 && h > 0
      ? volumeFt3FromCm(l, w, h)
      : (draftItem ? readItemMeta(draftItem).perItemVolumeFt3 : 0);
    return {
      qty,
      perVolume,
      totalVolume: Math.round(perVolume * qty * 100) / 100,
      totalWeight: Math.round(perWeight * qty * 10) / 10,
    };
  })();

  const saveDraft = () => {
    if (!draft || !draftItem || !draftTotals || !onUpdateItem) return;
    const { qty, perVolume, totalVolume, totalWeight } = draftTotals;
    const l = Number(draft.lengthCm) || 0;
    const w = Number(draft.widthCm) || 0;
    const h = Number(draft.heightCm) || 0;

    onUpdateItem(draft.photoUrl, {
      itemName: draft.itemName.trim() || draftItem.itemName,
      ...(l > 0 && { dimensionsLcm: String(l) }),
      ...(w > 0 && { dimensionsWcm: String(w) }),
      ...(h > 0 && { dimensionsHcm: String(h) }),
      volumeCuft: String(totalVolume),
      weightKg: String(totalWeight),
      sourceMetadata: writeItemMeta(draftItem, {
        quantity: qty,
        perItemVolumeFt3: perVolume,
        perItemWeightKg: totalWeight / qty,
      }),
    });
    setDraft(null);
  };

  if (isLoading) {
    return (
      <Card className="overflow-hidden" data-testid="card-identified-items-loading">
        <CardContent className="py-8 sm:py-12 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
            <div className="relative bg-gradient-to-br from-primary/10 to-primary/5 rounded-full p-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </div>
          <div className="text-center px-4">
            <p className="font-medium text-foreground text-base">Analyzing your items...</p>
            <p className="text-sm text-muted-foreground mt-1">Our AI is identifying dimensions and weight</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!items || items.length === 0) {
    return null;
  }

  const completedItems = items.filter(item => item.processingStatus === 'completed');
  const failedItems = items.filter(item => item.processingStatus === 'failed');
  
  const totalVolume = completedItems.reduce((sum, item) => sum + parseFloat(item.volumeCuft || '0'), 0);
  const totalWeight = completedItems.reduce((sum, item) => sum + parseFloat(item.weightKg || '0'), 0);
  const maxRecommendedMovers = completedItems.length > 0 
    ? Math.max(...completedItems.map(item => item.recommendedMovers || 1))
    : 1;
  // Must match RequestMove's hasHeavyItems exactly — this list drives the badge
  // the customer reads, while RequestMove drives what they are billed for. The
  // weight arm was missing here, so a 35 kg item with 'medium' complexity showed
  // "SUV" while the booking priced a Pickup.
  const hasHighComplexity = completedItems.some(item => 
    item.handlingComplexity === 'high' ||
    item.handlingComplexity === 'very_high' ||
    parseFloat(item.weightKg || '0') > 30
  );

  // Longest single edge across all items. A 2.4 m item can be low-volume and
  // low-weight yet still need a van; RequestMove applies this override and this
  // component did not.
  const maxDimension = completedItems.length > 0
    ? Math.max(...completedItems.map(item => Math.max(
        parseFloat(String(item.dimensionsLcm || 0)),
        parseFloat(String(item.dimensionsWcm || 0)),
        parseFloat(String(item.dimensionsHcm || 0)),
      )))
    : 0;
  
  // Vehicle thresholds matching shared/furniture-database.ts VEHICLE_VOLUME_THRESHOLDS
  // CAR_MAX: 54 ft³, PICKUP_MAX: 136 ft³, VAN_MAX: 318 ft³, >318 ft³ → Truck
  // (the ranges quoted here and in the cards below were stale: they read
  // 20/165/300 while the constants have been 54/136/318, so every band shown to
  // the customer was wrong and 166-180 ft³ fell in a gap between two cards)
  // WEIGHT BUMPS: max +1 tier from volume-based tier (pickup ~600kg, van ~900kg payload)
  // COMPLEXITY OVERRIDE: high/very_high items in small loads → at least Pickup Truck
  const getVehicleRecommendation = () => {
    const truckRec = { 
      vehicle: 'Moving Truck', 
      loadSize: 'Apartment Move', 
      description: '319+ ft³',
      gradient: 'from-red-500 to-orange-500',
      bgColor: 'bg-red-50 dark:bg-red-950/30',
      textColor: 'text-red-700 dark:text-red-400',
      borderColor: 'border-red-200 dark:border-red-800'
    };
    const vanRec = { 
      vehicle: 'Cargo Van', 
      loadSize: 'Large Load', 
      description: '137-318 ft³',
      gradient: 'from-orange-500 to-amber-500',
      bgColor: 'bg-orange-50 dark:bg-orange-950/30',
      textColor: 'text-orange-700 dark:text-orange-400',
      borderColor: 'border-orange-200 dark:border-orange-800'
    };
    const pickupRec = { 
      vehicle: 'Pickup Truck', 
      loadSize: 'Medium Load', 
      description: '55-136 ft³',
      gradient: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      textColor: 'text-blue-700 dark:text-blue-400',
      borderColor: 'border-blue-200 dark:border-blue-800'
    };
    const carRec = { 
      vehicle: 'SUV', 
      loadSize: 'Small Load', 
      description: '0-54 ft³',
      gradient: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
      textColor: 'text-green-700 dark:text-green-400',
      borderColor: 'border-green-200 dark:border-green-800'
    };

    let volumeRec = carRec;
    if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.VAN_MAX)         volumeRec = truckRec;
    else if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.PICKUP_MAX) volumeRec = vanRec;
    else if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.CAR_MAX)    volumeRec = pickupRec;

    const recOrder = [carRec, pickupRec, vanRec, truckRec];
    let recIndex = recOrder.indexOf(volumeRec);

    // Weight bumps: capped at +1 tier above volume-based tier.
    // Real payload limits: pickup ~600 kg, van ~900 kg, truck 2000+ kg.
    const volumeRecIndex = recIndex;
    if (totalWeight > 600 && recIndex < 3)      recIndex = Math.min(volumeRecIndex + 1, 3);
    else if (totalWeight > 300 && recIndex < 2) recIndex = Math.min(volumeRecIndex + 1, 2);
    else if (totalWeight > 100 && recIndex < 1) recIndex = Math.min(volumeRecIndex + 1, 1);

    // Dimension override, then complexity — same order as RequestMove.
    if (maxDimension > 200 && recIndex < 2)      recIndex = 2;
    else if (maxDimension > 150 && recIndex < 1) recIndex = 1;

    // Apply complexity override: heavy items in small loads need at least a pickup
    if (hasHighComplexity && recIndex < 1) recIndex = 1;

    // DATABASE VEHICLE FLOOR: honour the per-item vehicleType from the ground truth DB.
    // e.g. a 450 kg hot tub has vehicle='truck' — volume alone would only give pickup.
    const VEHICLE_TIER_RANK: Record<string, number> = { car: 0, pickup: 1, van: 2, truck: 3 };
    const maxDbTier = completedItems.reduce(
      (max, item) => Math.max(max, VEHICLE_TIER_RANK[item.vehicleType || 'car'] ?? 0), 0
    );
    if (maxDbTier > recIndex) recIndex = maxDbTier;

    return recOrder[recIndex];
  };
  const vehicleRec = getVehicleRecommendation();

  const getComplexityStyle = (complexity: string | null) => {
    switch (complexity) {
      case 'very_high':
        return { label: 'Very Heavy', variant: 'destructive' as const, icon: AlertCircle };
      case 'high':
        return { label: 'Heavy', variant: 'default' as const, icon: Weight };
      case 'moderate':
        return { label: 'Moderate', variant: 'secondary' as const, icon: Weight };
      case 'slight':
        return { label: 'Slight', variant: 'outline' as const, icon: Weight };
      case 'medium':
        return { label: 'Medium', variant: 'secondary' as const, icon: null };
      default:
        return { label: 'Standard', variant: 'outline' as const, icon: null };
    }
  };

  const avgConfidence = completedItems.length > 0 
    ? (completedItems.reduce((sum, item) => sum + parseFloat(item.confidence || '0'), 0) / completedItems.length * 100)
    : 0;

  return (
    <div className="space-y-6" data-testid="container-identified-items">
      {/* Main Items Card */}
      <Card className="overflow-hidden border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-primary/5 via-primary/3 to-transparent pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-xl p-2.5">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Item Detection</CardTitle>
                <CardDescription className="mt-0.5">
                  {completedItems.length} item{completedItems.length !== 1 ? 's' : ''} analyzed
                </CardDescription>
              </div>
            </div>
            {avgConfidence > 0 && (
              <div className="hidden sm:flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-full px-3 py-1.5 border">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">{avgConfidence.toFixed(0)}% Accuracy</span>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {/* Items List */}
          <div className="divide-y">
            {completedItems.map((item, index) => {
              const complexityStyle = getComplexityStyle(item.handlingComplexity);
              return (
                <div 
                  key={item.id} 
                  className="p-4 sm:p-5 hover:bg-muted/30 transition-colors"
                  data-testid={`card-identified-item-${index}`}
                >
                  <div className="flex gap-4">
                    {/* Image */}
                    <div className="relative flex-shrink-0">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden ring-1 ring-border">
                        <img
                          src={item.photoUrl}
                          alt={item.itemName || 'Item'}
                          className="w-full h-full object-cover"
                          data-testid={`img-item-photo-${index}`}
                        />
                      </div>
                      {item.confidence && parseFloat(item.confidence) >= 0.8 && (
                        <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1">
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-semibold text-base sm:text-lg leading-tight" data-testid={`text-item-name-${index}`}>
                            {item.itemName}
                          </h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <Badge variant="secondary" className="text-xs font-medium" data-testid={`badge-category-${index}`}>
                              <Box className="h-3 w-3 mr-1" />
                              {item.category}
                            </Badge>
                            {readItemMeta(item).quantity > 1 && (
                              <Badge variant="secondary" className="text-xs font-medium" data-testid={`badge-quantity-${index}`}>
                                x{readItemMeta(item).quantity}
                              </Badge>
                            )}
                            {readItemMeta(item).userCorrected && (
                              <Badge variant="outline" className="text-xs font-medium" data-testid={`badge-corrected-${index}`}>
                                <Pencil className="h-3 w-3 mr-1" />
                                You edited this
                              </Badge>
                            )}
                            {item.handlingComplexity && item.handlingComplexity !== 'standard' && (
                              <Badge 
                                variant={complexityStyle.variant}
                                className="text-xs font-medium"
                                data-testid={`badge-complexity-${index}`}
                              >
                                {complexityStyle.icon && <complexityStyle.icon className="h-3 w-3 mr-1" />}
                                {complexityStyle.label}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center">
                          {onUpdateItem && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => openEditor(item)}
                              data-testid={`button-edit-item-${index}`}
                              aria-label={`Correct ${item.itemName}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {onRemoveItem && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => onRemoveItem(item.photoUrl)}
                              data-testid={`button-remove-item-${index}`}
                              aria-label={`Remove ${item.itemName} from analysis`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Specs Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-3">
                        <div className="flex items-center gap-1.5 text-sm" data-testid={`text-volume-${index}`}>
                          <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{item.volumeCuft ? `${parseFloat(item.volumeCuft).toFixed(1)} ft³` : '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm" data-testid={`text-weight-${index}`}>
                          <Weight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{item.weightKg ? `${parseFloat(item.weightKg).toFixed(0)} kg` : '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm" data-testid={`text-movers-${index}`}>
                          <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{item.recommendedMovers || 1} mover{(item.recommendedMovers || 1) !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm" data-testid={`text-dimensions-${index}`}>
                          <Ruler className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium truncate">
                            {item.dimensionsLcm && item.dimensionsWcm && item.dimensionsHcm
                              ? `${parseFloat(item.dimensionsLcm).toFixed(0)}×${parseFloat(item.dimensionsWcm).toFixed(0)}×${parseFloat(item.dimensionsHcm).toFixed(0)} cm`
                              : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Failed Items Alert */}
          {failedItems.length > 0 && (
            <div className="p-4 bg-destructive/5 border-t border-destructive/20">
              <div className="flex items-start gap-3">
                <div className="bg-destructive/10 rounded-lg p-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <p className="font-medium text-destructive">
                    {failedItems.length} item{failedItems.length !== 1 ? 's' : ''} couldn't be analyzed
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Try uploading clearer photos for better results
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Recommendations Card */}
      {completedItems.length > 0 && (
        <Card className={`overflow-hidden border ${vehicleRec.borderColor} ${vehicleRec.bgColor}`}>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className={`bg-gradient-to-br ${vehicleRec.gradient} rounded-lg p-2`}>
                <Truck className="h-5 w-5 text-white" />
              </div>
              <h5 className="font-semibold text-lg">Recommendations</h5>
            </div>
            
            <div className="grid grid-cols-3 gap-4 sm:gap-6">
              {/* Total Volume */}
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium uppercase tracking-wide">Total Volume</p>
                <p className="text-2xl sm:text-3xl font-bold tabular-nums">{totalVolume.toFixed(1)}</p>
                <p className="text-sm text-muted-foreground">cubic feet</p>
              </div>
              
              {/* Vehicle Required */}
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium uppercase tracking-wide">Vehicle</p>
                <p className={`text-xl sm:text-2xl font-bold ${vehicleRec.textColor}`}>{vehicleRec.vehicle}</p>
                <p className="text-sm text-muted-foreground">{vehicleRec.loadSize}</p>
              </div>
              
              {/* Movers Needed */}
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium uppercase tracking-wide">Movers</p>
                <div className="flex items-baseline gap-1">
                  <p className="text-2xl sm:text-3xl font-bold tabular-nums">{maxRecommendedMovers}</p>
                  <p className="text-sm text-muted-foreground">needed</p>
                </div>
                {hasHighComplexity && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-medium flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Heavy items detected
                  </p>
                )}
              </div>
            </div>
            
            {/* Footer row: weight + handling fee + confidence */}
            <div className="mt-5 pt-5 border-t border-border/50 flex flex-wrap items-center justify-between gap-3">
              {totalWeight > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Weight className="h-4 w-4" />
                  <span>Est. total weight: <span className="font-semibold text-foreground">{totalWeight.toFixed(0)} kg</span></span>
                </div>
              )}
              {false && (
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400" data-testid="text-handling-fee-total">
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                <span>AI confidence: <span className="font-semibold text-foreground">{avgConfidence.toFixed(0)}%</span></span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent data-testid="dialog-edit-item">
          <DialogHeader>
            <DialogTitle>Correct this item</DialogTitle>
            <DialogDescription>
              Dimensions and weight are per item. We multiply them by the quantity to
              work out the space your move needs.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="edit-item-name">Item</Label>
                <Input
                  id="edit-item-name"
                  value={draft.itemName}
                  onChange={(e) => setDraft({ ...draft, itemName: e.target.value })}
                  placeholder="e.g. Two-seat sofa"
                  data-testid="input-edit-item-name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-item-qty">How many?</Label>
                  <Input
                    id="edit-item-qty"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={draft.quantity}
                    onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                    data-testid="input-edit-item-quantity"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-item-weight">Weight each (kg)</Label>
                  <Input
                    id="edit-item-weight"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.5"
                    value={draft.weightKg}
                    onChange={(e) => setDraft({ ...draft, weightKg: e.target.value })}
                    data-testid="input-edit-item-weight"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Size each (cm)</Label>
                <div className="grid grid-cols-3 gap-3">
                  <Input
                    aria-label="Length in centimetres"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="Length"
                    value={draft.lengthCm}
                    onChange={(e) => setDraft({ ...draft, lengthCm: e.target.value })}
                    data-testid="input-edit-item-length"
                  />
                  <Input
                    aria-label="Width in centimetres"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="Width"
                    value={draft.widthCm}
                    onChange={(e) => setDraft({ ...draft, widthCm: e.target.value })}
                    data-testid="input-edit-item-width"
                  />
                  <Input
                    aria-label="Height in centimetres"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="Height"
                    value={draft.heightCm}
                    onChange={(e) => setDraft({ ...draft, heightCm: e.target.value })}
                    data-testid="input-edit-item-height"
                  />
                </div>
              </div>

              {draftTotals && (
                <div
                  className="rounded-lg border bg-muted/40 p-3 text-sm"
                  data-testid="text-edit-item-preview"
                >
                  <span className="text-muted-foreground">New total for this line: </span>
                  <span className="font-semibold">
                    {draftTotals.totalVolume.toFixed(1)} ft³
                  </span>
                  <span className="text-muted-foreground"> and </span>
                  <span className="font-semibold">
                    {draftTotals.totalWeight.toFixed(0)} kg
                  </span>
                  {draftTotals.qty > 1 && (
                    <span className="text-muted-foreground"> ({draftTotals.qty} x {draftTotals.perVolume.toFixed(1)} ft³)</span>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Your mover sees the corrected figures. If the load is bigger than
                described on the day, the price may need to change.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} data-testid="button-cancel-edit-item">
              Cancel
            </Button>
            <Button onClick={saveDraft} data-testid="button-save-edit-item">
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
