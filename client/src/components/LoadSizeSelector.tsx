import { Card } from "@/components/ui/card";
import { Package, Box, Sofa, Home } from "lucide-react";

interface LoadSize {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  multiplier: number;
}

interface LoadSizeSelectorProps {
  selectedSize: string;
  onSelectSize: (sizeId: string) => void;
}

const loadSizes: LoadSize[] = [
  {
    id: "small",
    label: "Small Box",
    description: "1-5 small items",
    icon: <Package className="w-8 h-8" />,
    multiplier: 1,
  },
  {
    id: "medium",
    label: "Medium Load",
    description: "5-15 boxes or items",
    icon: <Box className="w-8 h-8" />,
    multiplier: 1.5,
  },
  {
    id: "large",
    label: "Large Furniture",
    description: "Bedroom set, appliances",
    icon: <Sofa className="w-8 h-8" />,
    multiplier: 2,
  },
  {
    id: "full",
    label: "Full Apartment",
    description: "1-2 bedroom apartment",
    icon: <Home className="w-8 h-8" />,
    multiplier: 3,
  },
];

export default function LoadSizeSelector({ selectedSize, onSelectSize }: LoadSizeSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {loadSizes.map((size) => (
        <Card
          key={size.id}
          className={`p-6 cursor-pointer transition-all hover-elevate active-elevate-2 ${
            selectedSize === size.id
              ? 'border-primary border-2 bg-primary/5'
              : ''
          }`}
          onClick={() => onSelectSize(size.id)}
          data-testid={`card-load-${size.id}`}
        >
          <div className="flex flex-col items-center text-center gap-3">
            <div className={selectedSize === size.id ? 'text-primary' : 'text-muted-foreground'}>
              {size.icon}
            </div>
            <div>
              <div className="font-semibold mb-1" data-testid={`text-load-label-${size.id}`}>
                {size.label}
              </div>
              <div className="text-sm text-muted-foreground">
                {size.description}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
