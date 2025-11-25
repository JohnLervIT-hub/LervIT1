import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, Weight, Ruler, Truck, Users, Shield, AlertCircle } from "lucide-react";
import type { IdentifiedItem } from "@shared/schema";

interface IdentifiedItemsListProps {
  items: IdentifiedItem[];
  isLoading?: boolean;
}

export function IdentifiedItemsList({ items, isLoading }: IdentifiedItemsListProps) {
  if (isLoading) {
    return (
      <Card data-testid="card-identified-items-loading">
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Identifying items with AI...</span>
        </CardContent>
      </Card>
    );
  }

  if (!items || items.length === 0) {
    return null;
  }

  const completedItems = items.filter(item => item.processingStatus === 'completed');
  const failedItems = items.filter(item => item.processingStatus === 'failed');
  
  // Calculate aggregate recommendations (handle empty arrays safely)
  const totalVolume = completedItems.reduce((sum, item) => sum + parseFloat(item.volumeCuft || '0'), 0);
  const maxRecommendedMovers = completedItems.length > 0 
    ? Math.max(...completedItems.map(item => item.recommendedMovers || 1))
    : 1;
  const hasHighComplexity = completedItems.some(item => 
    item.handlingComplexity === 'high' || item.handlingComplexity === 'very_high'
  );
  
  // Determine recommended vehicle based on TOTAL volume
  // Boxes: 1-10 ft³, Medium: 11-50 ft³, Large: 51-150 ft³, Apartment: 150+ ft³
  const getVehicleRecommendation = () => {
    if (totalVolume > 150) return { vehicle: 'Truck', loadSize: 'Apartment Move (150+ ft³)', color: 'text-red-600' };
    if (totalVolume > 50) return { vehicle: 'Pickup', loadSize: 'Large Load (51-150 ft³)', color: 'text-orange-600' };
    if (totalVolume > 10) return { vehicle: 'Van', loadSize: 'Medium Load (11-50 ft³)', color: 'text-blue-600' };
    return { vehicle: 'Car/SUV', loadSize: 'Boxes Only (1-10 ft³)', color: 'text-green-600' };
  };
  const vehicleRec = getVehicleRecommendation();

  return (
    <div className="space-y-4" data-testid="container-identified-items">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Identified Items
          </CardTitle>
          <CardDescription>
            {completedItems.length} item{completedItems.length !== 1 ? 's' : ''} identified successfully
            {failedItems.length > 0 && ` (${failedItems.length} failed)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {completedItems.map((item, index) => (
            <Card key={item.id} data-testid={`card-identified-item-${index}`}>
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <img
                    src={item.photoUrl}
                    alt={item.itemName || 'Item'}
                    className="w-24 h-24 object-cover rounded-md"
                    data-testid={`img-item-photo-${index}`}
                  />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h4 className="font-semibold text-lg" data-testid={`text-item-name-${index}`}>
                        {item.itemName}
                      </h4>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary" data-testid={`badge-category-${index}`}>
                          {item.category}
                        </Badge>
                        <Badge 
                          variant={
                            item.handlingComplexity === 'very_high' ? 'destructive' :
                            item.handlingComplexity === 'high' ? 'default' :
                            'secondary'
                          }
                          data-testid={`badge-complexity-${index}`}
                        >
                          {item.handlingComplexity?.replace('_', ' ')}
                        </Badge>
                        {item.confidence && parseFloat(item.confidence) < 0.7 && (
                          <Badge variant="outline" data-testid={`badge-low-confidence-${index}`}>
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Low confidence
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="flex items-center gap-2" data-testid={`text-weight-${index}`}>
                        <Weight className="h-4 w-4 text-muted-foreground" />
                        <span>{item.weightKg ? `${parseFloat(item.weightKg).toFixed(1)} kg` : 'N/A'}</span>
                      </div>
                      
                      <div className="flex items-center gap-2" data-testid={`text-dimensions-${index}`}>
                        <Ruler className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {item.dimensionsLcm && item.dimensionsWcm && item.dimensionsHcm
                            ? `${parseFloat(item.dimensionsLcm).toFixed(0)} × ${parseFloat(item.dimensionsWcm).toFixed(0)} × ${parseFloat(item.dimensionsHcm).toFixed(0)} cm`
                            : 'N/A'}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2" data-testid={`text-vehicle-${index}`}>
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        <span className="capitalize">{item.vehicleType || 'N/A'}</span>
                      </div>
                      
                      <div className="flex items-center gap-2" data-testid={`text-movers-${index}`}>
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{item.recommendedMovers || 1} mover{item.recommendedMovers !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    
                    {item.volumeCuft && (
                      <div className="flex items-center gap-2 text-sm" data-testid={`text-volume-${index}`}>
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span>Volume: {parseFloat(item.volumeCuft).toFixed(2)} ft³</span>
                      </div>
                    )}
                    
                    {item.insuranceLevel && (
                      <div className="flex items-center gap-2 text-sm" data-testid={`text-insurance-${index}`}>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="capitalize">Insurance: {item.insuranceLevel}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {failedItems.length > 0 && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-semibold">Failed to identify {failedItems.length} item{failedItems.length !== 1 ? 's' : ''}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Please manually enter details for these items or try re-uploading clearer photos.
                </p>
              </CardContent>
            </Card>
          )}
          
          {completedItems.length > 0 && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <h5 className="font-semibold mb-3 flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Recommendations
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Volume:</span>
                    <p className="font-bold text-lg">{totalVolume.toFixed(1)} ft³</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vehicle Required:</span>
                    <p className={`font-bold text-lg ${vehicleRec.color}`}>{vehicleRec.vehicle}</p>
                    <p className="text-xs text-muted-foreground">{vehicleRec.loadSize}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Movers Needed:</span>
                    <p className="font-bold text-lg">{maxRecommendedMovers}</p>
                    {hasHighComplexity && (
                      <p className="text-xs text-orange-600">Heavy/Complex items</p>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">AI Confidence:</span>
                    <p className="font-bold text-lg">
                      {(completedItems.reduce((sum, item) => sum + parseFloat(item.confidence || '0'), 0) / completedItems.length * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
