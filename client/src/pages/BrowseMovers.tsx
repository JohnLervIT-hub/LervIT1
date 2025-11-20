import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MoverCard from "@/components/MoverCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, SlidersHorizontal, MapPin } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import moverPhoto1 from "@assets/generated_images/male_mover_profile_photo.png";
import moverPhoto2 from "@assets/generated_images/female_mover_profile_photo.png";
import moverPhoto3 from "@assets/generated_images/young_mover_headshot.png";

const moverPhotos = [moverPhoto1, moverPhoto2, moverPhoto3];

export default function BrowseMovers() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.log("Location permission denied:", error);
          setLocationDenied(true);
        }
      );
    }
  }, []);

  const apiUrl = userCoords
    ? `/api/movers?isAvailable=true&lat=${userCoords.lat}&lng=${userCoords.lng}`
    : "/api/movers?isAvailable=true";

  const { data: movers, isLoading } = useQuery({
    queryKey: [apiUrl],
  });

  const filteredMovers = useMemo(() => {
    if (!movers || !Array.isArray(movers)) return [];
    
    return movers.filter((mover: any) => {
      const searchLower = searchQuery.toLowerCase();
      const nameMatch = mover.user?.name?.toLowerCase().includes(searchLower);
      const vehicleMatch = mover.vehicleType?.toLowerCase().includes(searchLower);
      return nameMatch || vehicleMatch;
    });
  }, [movers, searchQuery]);

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
            {isLoading ? "Loading..." : `${filteredMovers.length} movers available`}
          </Badge>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading movers...</p>
          </div>
        ) : filteredMovers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No movers found matching your search.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMovers.map((mover: any, index: number) => (
              <MoverCard
                key={mover.id}
                id={mover.id}
                name={mover.user?.name || "Unknown"}
                photo={moverPhotos[index % moverPhotos.length]}
                rating={parseFloat(mover.rating) || 0}
                reviewCount={mover.totalMoves || 0}
                vehicleType={mover.vehicleType}
                distance={mover.distance ? `${mover.distance} km away` : "Location unavailable"}
                price={0}
                verified={mover.isVerified}
                completedMoves={mover.totalMoves || 0}
                onSelect={handleSelectMover}
              />
            ))}
          </div>
        )}
        
        {locationDenied && (
          <div className="mt-6 p-4 border rounded-md bg-muted/30">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Location access required</p>
                <p className="text-sm text-muted-foreground">
                  Enable location access to see movers sorted by distance from you.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
