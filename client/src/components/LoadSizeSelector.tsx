import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import boxesImage from "@assets/generated_images/3d_boxes_for_small_loads.png";
import mediumImage from "@assets/generated_images/3d_medium_furniture_items.png";
import largeImage from "@assets/generated_images/3d_large_furniture_sofa.png";
import apartmentImage from "@assets/generated_images/3d_apartment_interior_model.png";

interface LoadSize {
  id: string;
  label: string;
  volume: string;
  description: string;
  examples: string[];
  image: string;
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
    image: boxesImage,
    fee: 0,
  },
  {
    id: "medium",
    label: "Medium",
    volume: "11-50 ft³",
    description: "Small furniture",
    examples: ["Chairs", "Small tables", "TVs", "Bookshelves"],
    image: mediumImage,
    fee: 15,
  },
  {
    id: "large",
    label: "Large",
    volume: "50-170 ft³",
    description: "Large furniture",
    examples: ["Sofas", "Beds", "Fridges", "Dressers"],
    image: largeImage,
    fee: 30,
  },
  {
    id: "apartment",
    label: "Apartment",
    volume: "170+ ft³",
    description: "Full room furniture",
    examples: ["1-2 bedroom", "Multiple large items"],
    image: apartmentImage,
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
                <div className={`w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center ${isSelected ? 'ring-2 ring-orange-500 ring-offset-2' : ''}`}>
                  <img 
                    src={size.image} 
                    alt={size.label}
                    className="w-full h-full object-cover"
                  />
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
