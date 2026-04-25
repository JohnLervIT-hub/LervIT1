import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Package, Weight, Truck, Users, AlertCircle, Sparkles, CheckCircle2, X, Plus, Minus, Check } from "lucide-react";
import type { IdentifiedItem } from "@shared/schema";
import { memo, useMemo, useState } from "react";

export interface ConfirmedItemEntry {
  item: IdentifiedItem;
  quantity: number;
  perItemVolumeFt3: number;
  perItemWeightKg: number;
  totalVolumeFt3: number;
  totalWeightKg: number;
}

interface IdentifiedItemsListProps {
  items: IdentifiedItem[];
  isLoading?: boolean;
  onConfirm?: (confirmed: ConfirmedItemEntry[]) => void;
}

function parseSourceMeta(raw: string | null | undefined): { perItemVolumeFt3?: number; perItemWeightKg?: number; quantity?: number } {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function getVehicleLabel(vol: number): { vehicle: string; loadSize: string; colorClass: string } {
  if (vol > 300) return { vehicle: 'Moving Truck',  loadSize: 'Apartment Move', colorClass: 'text-red-600 dark:text-red-400' };
  if (vol > 165) return { vehicle: 'Cargo Van',     loadSize: 'Large Load',     colorClass: 'text-orange-600 dark:text-orange-400' };
  if (vol > 20)  return { vehicle: 'Pickup Truck',  loadSize: 'Medium Load',    colorClass: 'text-blue-600 dark:text-blue-400' };
  return           { vehicle: 'Car / SUV',      loadSize: 'Small Load',     colorClass: 'text-green-600 dark:text-green-400' };
}

export const IdentifiedItemsList = memo(function IdentifiedItemsList({
  items,
  isLoading,
  onConfirm,
}: IdentifiedItemsListProps) {
  const completed = useMemo(() => items.filter(i => i.processingStatus === 'completed'), [items]);
  const failed    = useMemo(() => items.filter(i => i.processingStatus === 'failed'), [items]);

  // --- interactive state ---
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [confirmed, setConfirmed] = useState(false);

  // Resolve per-item volume / weight from sourceMetadata, falling back to total ÷ quantity
  const metaMap = useMemo(() => {
    const map: Record<string, { perItemVol: number; perItemWt: number; baseQty: number }> = {};
    for (const item of completed) {
      const meta = parseSourceMeta(item.sourceMetadata);
      const baseQty = meta.quantity ?? 1;
      const totalVol = parseFloat(item.volumeCuft || '0');
      const totalWt  = parseFloat(item.weightKg   || '0');
      const perItemVol = meta.perItemVolumeFt3 ?? (baseQty > 0 ? totalVol / baseQty : totalVol);
      const perItemWt  = meta.perItemWeightKg  ?? (baseQty > 0 ? totalWt  / baseQty : totalWt);
      map[item.id] = { perItemVol, perItemWt, baseQty };
    }
    return map;
  }, [completed]);

  function qtyFor(item: IdentifiedItem) {
    return quantities[item.id] ?? metaMap[item.id]?.baseQty ?? 1;
  }

  function setQty(id: string, delta: number) {
    setQuantities(prev => {
      const base = prev[id] ?? metaMap[id]?.baseQty ?? 1;
      return { ...prev, [id]: Math.max(1, base + delta) };
    });
  }

  function toggleItem(id: string) {
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const includedItems = useMemo(
    () => completed.filter(i => !excluded.has(i.id)),
    [completed, excluded]
  );

  const liveTotals = useMemo(() => {
    let vol = 0, wt = 0, movers = 1;
    let hasHeavy = false;
    for (const item of includedItems) {
      const qty = qtyFor(item);
      const meta = metaMap[item.id];
      vol += (meta?.perItemVol ?? 0) * qty;
      wt  += (meta?.perItemWt  ?? 0) * qty;
      if ((item.recommendedMovers ?? 1) > 1 || wt > 50) movers = 2;
      if (item.handlingComplexity === 'high' || item.handlingComplexity === 'very_high') hasHeavy = true;
    }
    return { vol: Math.round(vol * 10) / 10, wt: Math.round(wt), movers, hasHeavy };
  }, [includedItems, quantities, metaMap]);

  const vehicleInfo = getVehicleLabel(liveTotals.vol);

  function handleConfirm() {
    if (!onConfirm) return;
    const entries: ConfirmedItemEntry[] = includedItems.map(item => {
      const qty = qtyFor(item);
      const meta = metaMap[item.id];
      const perItemVol = meta?.perItemVol ?? parseFloat(item.volumeCuft || '0');
      const perItemWt  = meta?.perItemWt  ?? parseFloat(item.weightKg   || '0');
      return {
        item,
        quantity: qty,
        perItemVolumeFt3: perItemVol,
        perItemWeightKg:  perItemWt,
        totalVolumeFt3:   Math.round(perItemVol * qty * 100) / 100,
        totalWeightKg:    Math.round(perItemWt  * qty * 10)  / 10,
      };
    });
    onConfirm(entries);
    setConfirmed(true);
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card data-testid="card-identified-items-loading">
        <CardContent className="py-10 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
            <div className="relative bg-primary/10 rounded-full p-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </div>
          <div className="text-center">
            <p className="font-medium">Analyzing your items…</p>
            <p className="text-sm text-muted-foreground mt-1">AI is identifying dimensions and weight</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!items || items.length === 0) return null;

  // ── Confirmed (read-only summary) ──────────────────────────────────────────
  if (confirmed) {
    return (
      <Card data-testid="card-items-confirmed">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="bg-green-500/10 rounded-xl p-2.5 flex-shrink-0 mt-0.5">
            <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Items confirmed</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {includedItems.length} item{includedItems.length !== 1 ? 's' : ''} · {liveTotals.vol.toFixed(1)} ft³ · {liveTotals.wt} kg · {vehicleInfo.vehicle}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {includedItems.map(item => (
                <Badge key={item.id} variant="secondary" className="text-xs">
                  {qtyFor(item) > 1 ? `${qtyFor(item)}× ` : ''}{item.itemName}
                </Badge>
              ))}
            </div>
          </div>
          {onConfirm && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-shrink-0 text-muted-foreground"
              onClick={() => setConfirmed(false)}
              data-testid="button-edit-items"
            >
              Edit
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Interactive list ───────────────────────────────────────────────────────
  const avgConf = completed.length > 0
    ? completed.reduce((s, i) => s + parseFloat(i.confidence || '0'), 0) / completed.length * 100
    : 0;

  return (
    <div className="space-y-4" data-testid="container-identified-items">
      {/* Header card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-xl p-2.5">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Items Detected</CardTitle>
                <CardDescription className="mt-0.5">
                  Uncheck anything you're <strong>not</strong> moving
                </CardDescription>
              </div>
            </div>
            {avgConf > 0 && (
              <div className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="font-medium">{avgConf.toFixed(0)}% accuracy</span>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="divide-y">
            {completed.map((item, idx) => {
              const isExcluded = excluded.has(item.id);
              const qty = qtyFor(item);
              const meta = metaMap[item.id];
              const lineVol = Math.round((meta?.perItemVol ?? 0) * qty * 10) / 10;
              const isHeavy = item.handlingComplexity === 'high' || item.handlingComplexity === 'very_high';

              return (
                <div
                  key={item.id}
                  className={`p-4 flex gap-3 transition-colors ${isExcluded ? 'opacity-40' : ''}`}
                  data-testid={`card-identified-item-${idx}`}
                >
                  {/* Checkbox toggle */}
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    aria-label={isExcluded ? 'Include item' : 'Exclude item'}
                    data-testid={`button-toggle-item-${idx}`}
                    className={`flex-shrink-0 mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isExcluded
                        ? 'border-border bg-background'
                        : 'border-primary bg-primary'
                    }`}
                  >
                    {!isExcluded && <Check className="h-3 w-3 text-primary-foreground" />}
                  </button>

                  {/* Photo */}
                  <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden ring-1 ring-border">
                    <img
                      src={item.photoUrl}
                      alt={item.itemName || 'Item'}
                      className="w-full h-full object-cover"
                      data-testid={`img-item-photo-${idx}`}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold leading-tight" data-testid={`text-item-name-${idx}`}>
                          {item.itemName}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                          {isHeavy && (
                            <Badge variant="default" className="text-xs">
                              <Weight className="h-3 w-3 mr-1" />
                              Heavy
                            </Badge>
                          )}
                        </div>
                      </div>
                      {/* Volume pill */}
                      {!isExcluded && (
                        <span className="text-xs font-medium text-muted-foreground tabular-nums flex-shrink-0">
                          {lineVol.toFixed(1)} ft³
                        </span>
                      )}
                    </div>

                    {/* Quantity controls */}
                    {!isExcluded && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted-foreground">Qty:</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-6 w-6 min-w-0"
                            onClick={() => setQty(item.id, -1)}
                            disabled={qty <= 1}
                            data-testid={`button-qty-minus-${idx}`}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-semibold w-5 text-center tabular-nums" data-testid={`text-qty-${idx}`}>
                            {qty}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-6 w-6 min-w-0"
                            onClick={() => setQty(item.id, 1)}
                            data-testid={`button-qty-plus-${idx}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Exclude × shortcut */}
                  {!isExcluded && (
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      aria-label="Remove item"
                      data-testid={`button-remove-item-${idx}`}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Failed items */}
          {failed.length > 0 && (
            <div className="p-4 bg-destructive/5 border-t border-destructive/20 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                {failed.length} photo{failed.length !== 1 ? 's' : ''} couldn't be analyzed — try a clearer shot
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live totals + confirm */}
      {includedItems.length > 0 && (
        <Card data-testid="card-live-totals">
          <CardContent className="p-5">
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Volume</p>
                <p className="text-2xl font-bold tabular-nums">{liveTotals.vol.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">cubic feet</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Vehicle</p>
                <p className={`text-base font-bold leading-tight ${vehicleInfo.colorClass}`}>{vehicleInfo.vehicle}</p>
                <p className="text-xs text-muted-foreground">{vehicleInfo.loadSize}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Movers</p>
                <p className="text-2xl font-bold tabular-nums">{liveTotals.movers}</p>
                <p className="text-xs text-muted-foreground">needed</p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t">
              <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="text-sm text-muted-foreground flex-1">
                {includedItems.length} item{includedItems.length !== 1 ? 's' : ''} · ~{liveTotals.wt} kg
                {liveTotals.hasHeavy && <span className="text-orange-600 dark:text-orange-400 font-medium"> · Heavy items</span>}
              </p>
              {onConfirm && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleConfirm}
                  data-testid="button-confirm-items"
                  className="gap-2"
                >
                  <Truck className="h-4 w-4" />
                  Confirm items
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {includedItems.length === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          All items unchecked — please include at least one item.
        </div>
      )}
    </div>
  );
});
