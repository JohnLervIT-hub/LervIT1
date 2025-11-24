import { Card } from "@/components/ui/card";
import { Package, Box, Sofa, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface LoadSize {
  id: string;
  label: string;
  volume: string;
  description: string;
  examples: string[];
  icon: React.ReactNode;
  fee: number;
}

interface LoadSizeSelectorProps {
  selectedSize: string;
  onSelectSize: (sizeId: string) => void;
  aiRecommendedSize?: string;
}

const loadSizes: LoadSize[] = [
  {
    id: "boxes",
    label: "Boxes",
    volume: "1-10 ft³",
    description: "Small personal items",
    examples: ["Shoes", "Bags", "Boxes", "Lamps", "Monitors"],
    icon: <Package className="w-8 h-8" />,
    fee: 0,
  },
  {
    id: "medium",
    label: "Medium",
    volume: "11-50 ft³",
    description: "Small furniture",
    examples: ["Chairs", "Small tables", "TVs", "Bookshelves"],
    icon: <Box className="w-8 h-8" />,
    fee: 15,
  },
  {
    id: "large",
    label: "Large",
    volume: "50-150 ft³",
    description: "Large furniture",
    examples: ["Sofas", "Beds", "Fridges", "Dressers"],
    icon: <Sofa className="w-8 h-8" />,
    fee: 30,
  },
  {
    id: "apartment",
    label: "Apartment",
    volume: "150+ ft³",
    description: "Full room furniture",
    examples: ["1-2 bedroom", "Multiple large items"],
    icon: <Home className="w-8 h-8" />,
    fee: 45,
  },
];

export default function LoadSizeSelector({ selectedSize, onSelectSize, aiRecommendedSize }: LoadSizeSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {loadSizes.map((size) => {
        const isSelected = selectedSize === size.id;
        const isAiRecommended = aiRecommendedSize === size.id;
        
        return (
          <Card
            key={size.id}
            className={`p-5 cursor-pointer transition-all hover-elevate active-elevate-2 ${
              isSelected
                ? 'border-primary border-2 bg-primary/5'
                : ''
            }`}
            onClick={() => onSelectSize(size.id)}
            data-testid={`card-load-${size.id}`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className={isSelected ? 'text-primary' : 'text-muted-foreground'}>
                  {size.icon}
                </div>
                {isAiRecommended && (
                  <Badge variant="default" className="text-xs">
                    AI Suggested
                  </Badge>
                )}
              </div>
              
              <div>
                <div className="font-semibold mb-1" data-testid={`text-load-label-${size.id}`}>
                  {size.label}
                </div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {size.volume}
                </div>
                <div className="text-sm text-muted-foreground mb-2">
                  {size.description}
                </div>
                
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {size.examples.map((example, idx) => (
                    <div key={idx}>• {example}</div>
                  ))}
                </div>
                
                <div className="text-sm font-semibold mt-3 text-primary">
                  {size.fee === 0 ? "No fee" : `+$${size.fee}`}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
