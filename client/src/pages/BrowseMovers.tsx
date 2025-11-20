import { useState } from "react";
import MoverCard from "@/components/MoverCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, SlidersHorizontal } from "lucide-react";
import { useLocation } from "wouter";
import moverPhoto1 from "@assets/generated_images/male_mover_profile_photo.png";
import moverPhoto2 from "@assets/generated_images/female_mover_profile_photo.png";
import moverPhoto3 from "@assets/generated_images/young_mover_headshot.png";

//todo: remove mock functionality
const mockMovers = [
  {
    id: "1",
    name: "Mike Johnson",
    photo: moverPhoto1,
    rating: 4.9,
    reviewCount: 142,
    vehicleType: "Large Truck (26ft)",
    distance: "2.3 km",
    price: 185,
    verified: true,
    completedMoves: 235,
  },
  {
    id: "2",
    name: "Sarah Chen",
    photo: moverPhoto2,
    rating: 4.8,
    reviewCount: 98,
    vehicleType: "Cargo Van",
    distance: "4.1 km",
    price: 145,
    verified: true,
    completedMoves: 167,
  },
  {
    id: "3",
    name: "David Martinez",
    photo: moverPhoto3,
    rating: 5.0,
    reviewCount: 203,
    vehicleType: "Medium Truck (16ft)",
    distance: "1.8 km",
    price: 165,
    verified: true,
    completedMoves: 312,
  },
  {
    id: "4",
    name: "Emma Wilson",
    photo: moverPhoto2,
    rating: 4.7,
    reviewCount: 76,
    vehicleType: "Pickup Truck",
    distance: "5.6 km",
    price: 125,
    verified: true,
    completedMoves: 128,
  },
];

export default function BrowseMovers() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelectMover = (id: string) => {
    console.log("Selected mover:", id);
    setLocation("/booking-confirmation");
  };

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Available Movers in Calgary
          </h1>
          <p className="text-muted-foreground">
            Browse verified movers near you
          </p>
        </div>

        <div className="mb-8 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by name or vehicle type..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <Button variant="outline" className="hover-elevate active-elevate-2" data-testid="button-filters">
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Showing:</span>
          <Badge variant="secondary" data-testid="badge-mover-count">
            {mockMovers.length} movers available
          </Badge>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockMovers.map((mover) => (
            <MoverCard
              key={mover.id}
              {...mover}
              onSelect={handleSelectMover}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
