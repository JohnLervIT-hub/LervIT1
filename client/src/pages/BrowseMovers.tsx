import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MoverCard from "@/components/MoverCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, SlidersHorizontal, MapPin, X, Navigation, SearchX } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation as useGeoLocation, CALGARY_FALLBACK } from "@/contexts/LocationContext";
import { getVehicleDisplayName } from "@/lib/utils";

const PAGE_SIZE = 12;

// Vehicle type filter options with display name and normalized DB values
const VEHICLE_TYPE_FILTERS = [
  { display: "SUV / Small Vehicle", dbValues: ["car", "suv", "small"] },
  { display: "Pickup Truck", dbValues: ["pickup", "pickup truck"] },
  { display: "Cargo Van", dbValues: ["van", "cargo van"] },
  { display: "Moving Truck", dbValues: ["truck", "moving truck", "large truck"] },
];

function MoverCardSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex flex-col h-full">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3 flex-1">
            <Skeleton className="w-12 h-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <div className="text-right">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3 w-12 mt-1" />
          </div>
        </div>
        <div className="space-y-2.5 mb-6">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-10 w-full mt-auto" />
      </div>
    </Card>
  );
}

export default function BrowseMovers() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { coords: userCoords, isApproximate, permissionState, requestLocation, isRequesting } = useGeoLocation();
  const userLat = userCoords?.lat ?? CALGARY_FALLBACK.lat;
  const userLng = userCoords?.lng ?? CALGARY_FALLBACK.lng;
  const usingApproximateLocation = !userCoords || isApproximate;
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<string[]>([]);
  const [minRating, setMinRating] = useState<string>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>("distance");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const activeFilterCount =
    selectedVehicleTypes.length +
    (minRating !== "all" ? 1 : 0) +
    (verifiedOnly ? 1 : 0) +
    (dateFilter ? 1 : 0);

  const clearFilters = () => {
    setSelectedVehicleTypes([]);
    setMinRating("all");
    setVerifiedOnly(false);
    setSortBy("distance");
    setDateFilter("");
  };

  const toggleVehicleType = (type: string) => {
    setSelectedVehicleTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  // URL built inside queryFn so it's always fresh when queryKey changes — no stale closure
  const baseUrl = "/api/movers?isAvailable=true";

  const { data: movers, isLoading, isError, refetch } = useQuery({
    queryKey: [baseUrl, userLat, userLng, dateFilter],
    queryFn: async () => {
      let url = `${baseUrl}&lat=${userLat}&lng=${userLng}`;
      if (dateFilter) url += `&date=${dateFilter}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch movers');
      return res.json();
    },
    retry: 2,
  });

  const filteredMovers = useMemo(() => {
    if (!movers || !Array.isArray(movers)) return [];
    
    let result = movers.filter((mover: any) => {
      const searchLower = searchQuery.toLowerCase();
      const nameMatch = mover.user?.name?.toLowerCase().includes(searchLower);
      const vehicleMatch = mover.vehicleType?.toLowerCase().includes(searchLower);
      if (!nameMatch && !vehicleMatch) return false;
      
      if (selectedVehicleTypes.length > 0) {
        const moverVehicle = mover.vehicleType?.toLowerCase() || "";
        // If mover has no vehicle type, exclude them when filters are active
        if (!moverVehicle) return false;
        // Check if mover's vehicle matches any of the selected filter types
        const matchesVehicle = selectedVehicleTypes.some(selectedDisplay => {
          // Find the filter config for this display name
          const filterConfig = VEHICLE_TYPE_FILTERS.find(f => f.display === selectedDisplay);
          if (!filterConfig) return false;
          // Check if mover's vehicle matches any of the DB values for this filter
          return filterConfig.dbValues.some(dbVal => 
            moverVehicle.includes(dbVal.toLowerCase()) || dbVal.toLowerCase().includes(moverVehicle)
          );
        });
        if (!matchesVehicle) return false;
      }
      
      if (minRating !== "all") {
        const rating = parseFloat(mover.rating) || 0;
        if (rating < parseFloat(minRating)) return false;
      }
      
      if (verifiedOnly && !mover.isVerified) return false;
      
      return true;
    });
    
    if (sortBy === "rating") {
      result.sort((a: any, b: any) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
    } else if (sortBy === "moves") {
      result.sort((a: any, b: any) => (b.totalMoves || 0) - (a.totalMoves || 0));
    } else if (sortBy === "distance") {
      result.sort((a: any, b: any) => (parseFloat(a.distance) || 999) - (parseFloat(b.distance) || 999));
    }
    
    return result;
  }, [movers, searchQuery, selectedVehicleTypes, minRating, verifiedOnly, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedVehicleTypes, minRating, verifiedOnly, sortBy, dateFilter]);

  const paginatedMovers = filteredMovers.slice(0, page * PAGE_SIZE);
  const hasMore = filteredMovers.length > paginatedMovers.length;

  const handleSelectMover = (id: string) => {
    const bookingPath = `/request-move?moverId=${id}`;
    
    if (!user) {
      // Not authenticated - redirect to login first, then to booking page
      toast({
        title: "Sign in required",
        description: "Please sign in to book this mover.",
      });
      setLocation(`/login?redirect=${encodeURIComponent(bookingPath)}`);
      return;
    }
    
    // User is authenticated - go directly to booking page
    setLocation(bookingPath);
  };

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Find a Mover
          </h1>
          <p className="text-muted-foreground">
            Browse verified movers in Calgary and book in minutes
          </p>
        </div>

        {/* Location prompt - only shows if permission not yet granted */}
        {usingApproximateLocation && permissionState !== "granted" && permissionState !== "loading" && (
          <div className="mb-6">
            <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/40">
                    <MapPin className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-orange-800 dark:text-orange-200">
                      {permissionState === "denied" ? "Location Access Blocked" : "Enable Location for Better Results"}
                    </h3>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      {permissionState === "denied" 
                        ? "Enable location in browser settings to find movers near you."
                        : "See movers closest to you with accurate distance."
                      }
                    </p>
                  </div>
                </div>
                {permissionState !== "denied" && (
                  <Button
                    onClick={requestLocation}
                    disabled={isRequesting}
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                    size="sm"
                    data-testid="button-enable-location"
                  >
                    <Navigation className="w-4 h-4 mr-2" />
                    {isRequesting ? "Getting..." : "Enable Location"}
                  </Button>
                )}
              </div>
            </Card>
          </div>
        )}

        <div className="mb-8 flex gap-4 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by name or vehicle type..."
              className="pl-10 pr-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-clear-search"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFilter}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-40"
              data-testid="input-date-filter"
            />
            {dateFilter && (
              <Button variant="ghost" size="icon" onClick={() => setDateFilter("")} data-testid="button-clear-date">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="relative" data-testid="button-filters">
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Filter Movers</h4>
                  {activeFilterCount > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={clearFilters}
                      className="h-auto py-1 px-2 text-xs"
                      data-testid="button-clear-filters"
                    >
                      Clear all
                    </Button>
                  )}
                </div>
                
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Vehicle Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {VEHICLE_TYPE_FILTERS.map((filter) => (
                      <div key={filter.display} className="flex items-center space-x-2">
                        <Checkbox
                          id={`vehicle-${filter.display}`}
                          checked={selectedVehicleTypes.includes(filter.display)}
                          onCheckedChange={() => toggleVehicleType(filter.display)}
                          data-testid={`checkbox-vehicle-${filter.display.toLowerCase().replace(/[\s\/]+/g, '-')}`}
                        />
                        <Label 
                          htmlFor={`vehicle-${filter.display}`} 
                          className="text-sm font-normal cursor-pointer"
                        >
                          {filter.display}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Minimum Rating</Label>
                  <Select value={minRating} onValueChange={setMinRating}>
                    <SelectTrigger data-testid="select-min-rating">
                      <SelectValue placeholder="Any rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any rating</SelectItem>
                      <SelectItem value="4">4+ stars</SelectItem>
                      <SelectItem value="4.5">4.5+ stars</SelectItem>
                      <SelectItem value="5">5 stars only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="verified-only"
                    checked={verifiedOnly}
                    onCheckedChange={(checked) => setVerifiedOnly(checked === true)}
                    data-testid="checkbox-verified-only"
                  />
                  <Label 
                    htmlFor="verified-only" 
                    className="text-sm font-normal cursor-pointer"
                  >
                    Verified movers only
                  </Label>
                </div>
                
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-sm font-medium">Sort By</Label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger data-testid="select-sort-by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="distance">Distance (nearest)</SelectItem>
                      <SelectItem value="rating">Rating (highest)</SelectItem>
                      <SelectItem value="moves">Experience (most moves)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Button 
                  className="w-full" 
                  onClick={() => setFiltersOpen(false)}
                  data-testid="button-apply-filters"
                >
                  Apply Filters
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {usingApproximateLocation && (
          <p
            className="mb-3 text-xs text-muted-foreground"
            data-testid="text-approximate-location-note"
          >
            📍 Showing distances from Calgary city centre — enable location for accurate distances
          </p>
        )}

        <div className="mb-6 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Showing:</span>
          <Badge variant="secondary" data-testid="badge-mover-count">
            {isLoading
              ? "Loading..."
              : hasMore
                ? `${paginatedMovers.length} of ${filteredMovers.length} shown`
                : activeFilterCount > 0 || searchQuery
                  ? `${filteredMovers.length} movers shown`
                  : `${filteredMovers.length} movers available`}
          </Badge>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <MoverCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <X className="w-7 h-7 text-destructive" />
            </div>
            <p className="text-muted-foreground mb-4">Could not load movers. Please check your connection.</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              data-testid="button-retry-movers"
            >
              Try again
            </Button>
          </div>
        ) : filteredMovers.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <SearchX className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="font-medium mb-1">No movers found</p>
            <p className="text-sm text-muted-foreground mb-5">
              {searchQuery
                ? `No results for "${searchQuery}"`
                : "Try adjusting your filters to see more movers."}
            </p>
            {(activeFilterCount > 0 || searchQuery) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { clearFilters(); setSearchQuery(""); }}
                data-testid="button-clear-all-filters"
              >
                Clear all filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedMovers.map((mover: any) => {
                // Coordinates are geocoded from the profile address, so
                // presence of lat/lng + a calculated distance is enough to
                // trust the value. (last_location_update is not yet present
                // in prod, so gating on it would hide every distance.)
                const hasRealLocation =
                  mover.latitude != null &&
                  mover.longitude != null &&
                  mover.distance != null;
                let distanceDisplay = mover.location || "Calgary, AB";
                if (hasRealLocation) {
                  if (mover.drivingMinutes !== null && mover.drivingMinutes !== undefined) {
                    distanceDisplay = `${mover.distance} km · ${mover.drivingMinutes} min drive`;
                  } else {
                    distanceDisplay = `${mover.distance} km away`;
                  }
                }

                return (
                  <MoverCard
                    key={mover.id}
                    id={mover.id}
                    name={mover.user?.name || "Unknown"}
                    photo={mover.moverImage || undefined}
                    rating={parseFloat(mover.rating) || 0}
                    reviewCount={mover.totalMoves || 0}
                    vehicleType={mover.vehicleType}
                    distance={distanceDisplay}
                    verified={mover.isVerified}
                    completedMoves={mover.totalMoves || 0}
                    onSelect={handleSelectMover}
                    vehiclePhoto={mover.vehiclePhoto || undefined}
                    licensePlate={mover.licensePlate || undefined}
                    vehicleColor={mover.vehicleColor || undefined}
                    isLiveLocation={mover.isLiveLocation}
                  />
                );
              })}
            </div>
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-load-more-movers"
                >
                  Load more movers
                </Button>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
