import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Package, Weight, Ruler, Truck, Users } from "lucide-react";
import type { DetectedItem } from "@shared/ai";

interface DetectedItemsListProps {
  items: DetectedItem[];
  onItemsChange: (items: DetectedItem[]) => void;
  onTotalsChange?: (totals: {
    totalCubicFeet: number;
    totalWeightLbs: number;
    recommendedMovers: 1 | 2;
    recommendedVehicle: string;
    loadSize: "small" | "medium" | "large";
  }) => void;
}

export default function DetectedItemsList({ items, onItemsChange, onTotalsChange }: DetectedItemsListProps) {
  const [localItems, setLocalItems] = useState<DetectedItem[]>(items);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  // Calculate totals whenever items change
  useEffect(() => {
    const totalCubicFeet = localItems.reduce((sum, item) => 
      sum + (item.estimatedCubicFeet * item.quantity), 0
    );
    
    const totalWeightLbs = localItems.reduce((sum, item) => 
      sum + (item.estimatedWeightLbs * item.quantity), 0
    );
    
    const heavyItemCount = localItems.filter(item => item.requiresSpecialCare).length;
    
    const recommendedMovers: 1 | 2 = totalWeightLbs > 500 || heavyItemCount > 2 ? 2 : 1;
    
    let loadSize: "small" | "medium" | "large";
    if (totalCubicFeet < 50) {
      loadSize = "small";
    } else if (totalCubicFeet < 200) {
      loadSize = "medium";
    } else {
      loadSize = "large";
    }
    
    let recommendedVehicle: string;
    if (totalCubicFeet < 30 && totalWeightLbs < 200) {
      recommendedVehicle = "Car";
    } else if (totalCubicFeet < 60 && totalWeightLbs < 500) {
      recommendedVehicle = "SUV";
    } else if (totalCubicFeet < 100 && totalWeightLbs < 1000) {
      recommendedVehicle = "Pickup";
    } else if (totalCubicFeet < 300 && totalWeightLbs < 3000) {
      recommendedVehicle = "Cargo Van";
    } else if (totalCubicFeet < 500 && totalWeightLbs < 5000) {
      recommendedVehicle = "Cube Truck";
    } else {
      recommendedVehicle = "Flatbed";
    }
    
    const totals = {
      totalCubicFeet: Math.round(totalCubicFeet * 10) / 10,
      totalWeightLbs: Math.round(totalWeightLbs),
      recommendedMovers,
      recommendedVehicle,
      loadSize
    };
    
    if (onTotalsChange) {
      onTotalsChange(totals);
    }
  }, [localItems, onTotalsChange]);

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    
    const updatedItems = localItems.map(item => 
      item.id === itemId ? { ...item, quantity: newQuantity } : item
    );
    
    setLocalItems(updatedItems);
    onItemsChange(updatedItems);
  };

  const handleRemoveItem = (itemId: string) => {
    const updatedItems = localItems.filter(item => item.id !== itemId);
    setLocalItems(updatedItems);
    onItemsChange(updatedItems);
  };

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'furniture': return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20';
      case 'appliance': return 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20';
      case 'box': return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
      case 'heavy_item': return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20';
      case 'fragile': return 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20';
      default: return 'bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/20';
    }
  };

  // Calculate summary stats
  const totalCubicFeet = localItems.reduce((sum, item) => 
    sum + (item.estimatedCubicFeet * item.quantity), 0
  );
  
  const totalWeightLbs = localItems.reduce((sum, item) => 
    sum + (item.estimatedWeightLbs * item.quantity), 0
  );
  
  const heavyItemCount = localItems.filter(item => item.requiresSpecialCare).length;
  const recommendedMovers: 1 | 2 = totalWeightLbs > 500 || heavyItemCount > 2 ? 2 : 1;
  
  let recommendedVehicle: string;
  if (totalCubicFeet < 30 && totalWeightLbs < 200) {
    recommendedVehicle = "Car";
  } else if (totalCubicFeet < 60 && totalWeightLbs < 500) {
    recommendedVehicle = "SUV";
  } else if (totalCubicFeet < 100 && totalWeightLbs < 1000) {
    recommendedVehicle = "Pickup";
  } else if (totalCubicFeet < 300 && totalWeightLbs < 3000) {
    recommendedVehicle = "Cargo Van";
  } else if (totalCubicFeet < 500 && totalWeightLbs < 5000) {
    recommendedVehicle = "Cube Truck";
  } else {
    recommendedVehicle = "Flatbed";
  }

  if (localItems.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No items detected yet. Upload photos to get started!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Detected Items ({localItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {localItems.map((item) => (
            <div 
              key={item.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card hover-elevate"
              data-testid={`item-${item.id}`}
            >
              {item.imageUrl && (
                <img 
                  src={item.imageUrl} 
                  alt={item.name}
                  className="w-16 h-16 object-cover rounded border"
                />
              )}
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold truncate" data-testid={`text-item-name-${item.id}`}>
                    {item.name}
                  </h4>
                  <Badge 
                    variant="outline" 
                    className={getCategoryBadgeColor(item.category)}
                  >
                    {item.category.replace('_', ' ')}
                  </Badge>
                  {item.requiresSpecialCare && (
                    <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20">
                      Special Care
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Weight className="w-3 h-3" />
                    {item.estimatedWeightLbs} lbs
                  </span>
                  <span className="flex items-center gap-1">
                    <Ruler className="w-3 h-3" />
                    {item.estimatedCubicFeet} cu ft
                  </span>
                  <span>
                    {item.confidence}% confidence
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    data-testid={`button-decrease-${item.id}`}
                  >
                    -
                  </Button>
                  <Input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
                    className="w-16 text-center"
                    data-testid={`input-quantity-${item.id}`}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                    data-testid={`button-increase-${item.id}`}
                  >
                    +
                  </Button>
                </div>
                
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => handleRemoveItem(item.id)}
                  data-testid={`button-remove-${item.id}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Ruler className="w-4 h-4" />
                Volume
              </div>
              <p className="text-lg font-bold" data-testid="text-total-cubic-feet">
                {Math.round(totalCubicFeet * 10) / 10} cu ft
              </p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Weight className="w-4 h-4" />
                Weight
              </div>
              <p className="text-lg font-bold" data-testid="text-total-weight">
                {Math.round(totalWeightLbs)} lbs
              </p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                Movers
              </div>
              <p className="text-lg font-bold" data-testid="text-recommended-movers">
                {recommendedMovers}
              </p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Truck className="w-4 h-4" />
                Vehicle
              </div>
              <p className="text-lg font-bold" data-testid="text-recommended-vehicle">
                {recommendedVehicle}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
