import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, Weight, Ruler, Truck, Users, Shield, AlertCircle, Sparkles, CheckCircle2, Box } from "lucide-react";
import type { IdentifiedItem } from "@shared/schema";
import { memo, useMemo } from "react";

interface IdentifiedItemsListProps {
  items: IdentifiedItem[];
  isLoading?: boolean;
}

// Memoized component to prevent unnecessary re-renders
export const IdentifiedItemsList = memo(function IdentifiedItemsList({ items, isLoading }: IdentifiedItemsListProps) {
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
  const hasHighComplexity = completedItems.some(item => 
    item.handlingComplexity === 'high' || item.handlingComplexity === 'very_high'
  );
  
  // Vehicle thresholds matching shared/furniture-database.ts VEHICLE_VOLUME_THRESHOLDS
  // CAR_MAX: 20, PICKUP_MAX: 165, VAN_MAX: 300, >300 → Truck
  // WEIGHT OVERRIDES (matching server getVehicleRecommendationWithCategory):
  // >150kg → at least Moving Truck, >100kg → at least Cargo Van
  // COMPLEXITY OVERRIDE: high/very_high items in small loads → at least Pickup Truck
  const getVehicleRecommendation = () => {
    const truckRec = { 
      vehicle: 'Moving Truck', 
      loadSize: 'Apartment Move', 
      description: '300+ ft³',
      gradient: 'from-red-500 to-orange-500',
      bgColor: 'bg-red-50 dark:bg-red-950/30',
      textColor: 'text-red-700 dark:text-red-400',
      borderColor: 'border-red-200 dark:border-red-800'
    };
    const vanRec = { 
      vehicle: 'Cargo Van', 
      loadSize: 'Large Load', 
      description: '166-300 ft³',
      gradient: 'from-orange-500 to-amber-500',
      bgColor: 'bg-orange-50 dark:bg-orange-950/30',
      textColor: 'text-orange-700 dark:text-orange-400',
      borderColor: 'border-orange-200 dark:border-orange-800'
    };
    const pickupRec = { 
      vehicle: 'Pickup Truck', 
      loadSize: 'Medium Load', 
      description: '21-165 ft³',
      gradient: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      textColor: 'text-blue-700 dark:text-blue-400',
      borderColor: 'border-blue-200 dark:border-blue-800'
    };
    const carRec = { 
      vehicle: 'Car/SUV', 
      loadSize: 'Small Load', 
      description: '0-20 ft³',
      gradient: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
      textColor: 'text-green-700 dark:text-green-400',
      borderColor: 'border-green-200 dark:border-green-800'
    };

    let volumeRec = carRec;
    if (totalVolume > 300) volumeRec = truckRec;
    else if (totalVolume > 165) volumeRec = vanRec;
    else if (totalVolume > 20) volumeRec = pickupRec;

    const recOrder = [carRec, pickupRec, vanRec, truckRec];
    let recIndex = recOrder.indexOf(volumeRec);

    return recOrder[recIndex];
  };
  const vehicleRec = getVehicleRecommendation();

  const getComplexityStyle = (complexity: string | null) => {
    switch (complexity) {
      case 'very_high':
        return { label: 'Very Heavy', variant: 'destructive' as const, icon: AlertCircle };
      case 'high':
        return { label: 'Heavy', variant: 'default' as const, icon: Weight };
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
                      </div>
                      
                      {/* Specs Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-3">
                        <div className="flex items-center gap-1.5 text-sm" data-testid={`text-volume-${index}`}>
                          <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{item.volumeCuft ? `${parseFloat(item.volumeCuft).toFixed(1)} ft³` : '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm" data-testid={`text-weight-${index}`}>
                          <Weight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{item.weightKg ? `${parseFloat(item.weightKg).toFixed(0)} kg` : '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm" data-testid={`text-dimensions-${index}`}>
                          <Ruler className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium truncate">
                            {item.dimensionsLcm && item.dimensionsWcm && item.dimensionsHcm
                              ? `${parseFloat(item.dimensionsLcm).toFixed(0)}×${parseFloat(item.dimensionsWcm).toFixed(0)}×${parseFloat(item.dimensionsHcm).toFixed(0)}`
                              : '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm" data-testid={`text-movers-${index}`}>
                          <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{item.recommendedMovers || 1} mover{(item.recommendedMovers || 1) !== 1 ? 's' : ''}</span>
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
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
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
              
              {/* Accuracy */}
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium uppercase tracking-wide">Accuracy</p>
                <div className="flex items-baseline gap-1">
                  <p className="text-2xl sm:text-3xl font-bold tabular-nums text-green-600 dark:text-green-400">
                    {avgConfidence.toFixed(0)}%
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">confidence</p>
              </div>
            </div>
            
            {/* Total Weight Summary */}
            {totalWeight > 0 && (
              <div className="mt-5 pt-5 border-t border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Weight className="h-4 w-4" />
                  <span>Estimated total weight</span>
                </div>
                <p className="font-semibold">{totalWeight.toFixed(0)} kg</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
});
