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
    volume: "50-170 ft³",
    description: "Large furniture",
    examples: ["Sofas", "Beds", "Fridges", "Dressers"],
    icon: <Sofa className="w-8 h-8" />,
    fee: 30,
  },
  {
    id: "apartment",
    label: "Apartment",
    volume: "170+ ft³",
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
            className={`p-5 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg border-2 ${
              isSelected
                ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 shadow-lg shadow-orange-500/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-600'
            }`}
            onClick={() => onSelectSize(size.id)}
            data-testid={`card-load-${size.id}`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                  {size.icon}
                </div>
                {isAiRecommended && (
                  <Badge className="text-xs bg-green-500 text-white">
                    AI Suggested
                  </Badge>
                )}
              </div>
              
              <div>
                <div className={`font-bold text-lg mb-1 ${isSelected ? 'text-orange-600 dark:text-orange-400' : ''}`} data-testid={`text-load-label-${size.id}`}>
                  {size.label}
                </div>
                <div className={`text-sm font-semibold mb-2 ${isSelected ? 'text-orange-500' : 'text-muted-foreground'}`}>
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
                
                <div className={`text-base font-bold mt-3 ${isSelected ? 'text-orange-600 dark:text-orange-400' : 'text-orange-500'}`}>
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
