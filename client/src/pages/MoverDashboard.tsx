import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Calendar, Package, DollarSign, MessageCircle, CheckCircle, XCircle, ChevronDown, Users, Weight, Clock, Sparkles, Navigation, Settings, Shield, AlertTriangle, Box, Truck, Wallet, User, Phone, TrendingUp, CheckCircle2, HelpCircle, ArrowRight, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MoverPayoutCenter } from "@/components/MoverPayoutCenter";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { useLocation as useGeoLocation } from "@/contexts/LocationContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getVehicleDisplayName } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { generatePriceExplanation, AI_FEATURES } from "@shared/ai";
import { useEffect, useState, useRef } from "react";
import MoverVerification from "./MoverVerification";
import { MoverDashboardSkeleton } from "@/components/DashboardSkeleton";
import { FadeIn, StaggerChildren, StaggerItem } from "@/components/PageTransition";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EarlyAccessTermsModal } from "@/components/EarlyAccessTermsModal";
import { ZoomIn, ChevronLeft, ChevronRight } from "lucide-react";
import { BOOKING_STATUSES, ACTIVE_STATUSES, BOOKING_STATUS_INFO, getNextValidStatuses, type BookingStatus } from "@shared/schema";
import MoveProgressIndicator from "@/components/MoveProgressIndicator";
import { MoverWelcomeTutorial } from "@/components/MoverWelcomeTutorial";
import { ProfileCompletionCard } from "@/components/ProfileCompletionCard";
import { LocationPrompt } from "@/components/LocationPrompt";

type Booking = {
  id: string;
  customerId: string;
  moverId: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  loadSize: string;
  description: string | null;
  images: string[] | null;
  preferredDate: string;
  status: string;
  distance: string | null;
  price: string | null;
  paymentStatus: string | null;
  createdAt: string;
  pickupDifficulty: string | null;
  dropoffDifficulty: string | null;
  heavyItem: boolean | null;
  numberOfMovers: number | null;
  baseFee: string | null;
  distanceFee: string | null;
  loadFee: string | null;
  pickupDifficultyFee: string | null;
  dropoffDifficultyFee: string | null;
  heavyItemFee: string | null;
  moverTravelFee: string | null;
  subtotal: string | null;
  customer: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  } | null;
};

type IdentifiedItem = {
  id: string;
  photoUrl: string;
  processingStatus: string;
  itemName: string | null;
  category: string | null;
  weightKg: string | null;
  volumeCuft: string | null;
  vehicleType: string | null;
  recommendedMovers: number | null;
  handlingComplexity: string | null;
};

function IdentifiedItemsDisplay({ bookingId }: { bookingId: string }) {
  const { data: items, isLoading } = useQuery<IdentifiedItem[]>({
    queryKey: ['/api/ai/items', bookingId],
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
        <span className="text-sm text-muted-foreground">Loading item details...</span>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return null;
  }

  const completedItems = items.filter(i => i.processingStatus === 'completed' && i.itemName);
  if (completedItems.length === 0) return null;

  const totalVolume = completedItems.reduce((sum, item) => sum + (parseFloat(item.volumeCuft || '0') || 0), 0);
  const totalWeight = completedItems.reduce((sum, item) => sum + (parseFloat(item.weightKg || '0') || 0), 0);

  const getComplexityBadge = (complexity: string | null) => {
    if (!complexity || complexity === 'standard') return null;
    const styles: Record<string, { label: string; variant: "destructive" | "default" | "secondary" }> = {
      'very_high': { label: 'Very Heavy', variant: 'destructive' },
      'high': { label: 'Heavy', variant: 'default' },
      'medium': { label: 'Medium', variant: 'secondary' },
    };
    return styles[complexity] || null;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 rounded-lg p-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold text-sm">AI-Detected Items</span>
          <Badge variant="secondary" className="text-xs">{completedItems.length}</Badge>
        </div>
      </div>
      
      {/* Items Grid */}
      <div className="space-y-2">
        {completedItems.map((item) => {
          const complexityBadge = getComplexityBadge(item.handlingComplexity);
          return (
            <div 
              key={item.id} 
              className="group bg-muted/40 hover:bg-muted/60 rounded-xl p-3 flex items-center gap-3 transition-colors"
              data-testid={`identified-item-${item.id}`}
            >
              {/* Thumbnail */}
              <div className="relative w-14 h-14 rounded-lg overflow-hidden ring-1 ring-border flex-shrink-0">
                <img 
                  src={item.photoUrl} 
                  alt={item.itemName || 'Item'} 
                  className="w-full h-full object-cover"
                />
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{item.itemName}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {item.category && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-background/50 px-2 py-0.5 rounded-md">
                      <Box className="w-3 h-3" />
                      {item.category}
                    </span>
                  )}
                  {item.volumeCuft && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {parseFloat(item.volumeCuft).toFixed(1)} ft³
                    </span>
                  )}
                  {item.weightKg && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {parseFloat(item.weightKg).toFixed(0)} kg
                    </span>
                  )}
                </div>
              </div>
              
              {/* Complexity Badge */}
              {complexityBadge && (
                <Badge variant={complexityBadge.variant} className="text-xs flex-shrink-0">
                  {complexityBadge.label}
                </Badge>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-xl p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Volume</p>
            <p className="text-xl font-bold mt-0.5">{totalVolume.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">ft³</span></p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Weight</p>
            <p className="text-xl font-bold mt-0.5">{totalWeight.toFixed(0)} <span className="text-sm font-normal text-muted-foreground">kg</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MoverDashboard() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [locationSharing, setLocationSharing] = useState<string | null>(null);
  const [showVerificationAlert, setShowVerificationAlert] = useState(false);
  const [verificationError, setVerificationError] = useState<any>(null);
  
  // Shared location context - seamless GPS flow
  const { coords: geoCoords, permissionState: geoPermissionState, requestLocation: requestGeoLocation, refreshLocation, isRequesting: isRequestingGeo } = useGeoLocation();
  const [isLiveGpsActive, setIsLiveGpsActive] = useState(false);
  const pendingOnlineToggle = useRef(false);
  
  // Track URL search params for tab sync (wouter's location only tracks pathname)
  const [searchParams, setSearchParams] = useState(window.location.search);
  
  // Listen for URL changes including query params
  useEffect(() => {
    const updateSearch = () => setSearchParams(window.location.search);
    
    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', updateSearch);
    
    // Listen for custom navigation events from MobileBottomNav
    // This is needed because wouter's setLocation doesn't trigger popstate for same-path changes
    const handleCustomNav = (e: CustomEvent) => {
      if (e.detail?.search !== undefined) {
        setSearchParams(e.detail.search);
      }
    };
    window.addEventListener('lervit-navigation', handleCustomNav as EventListener);
    
    // Check on location change from wouter
    updateSearch();
    
    return () => {
      window.removeEventListener('popstate', updateSearch);
      window.removeEventListener('lervit-navigation', handleCustomNav as EventListener);
    };
  }, [location]);
  
  // Sync tabs with URL query params for mobile bottom nav integration
  const getTabFromUrl = () => {
    const params = new URLSearchParams(searchParams);
    const tab = params.get('tab');
    // Map URL param values to actual tab values
    if (tab === 'active') return 'my-bookings';
    if (tab === 'payouts') return 'payouts';
    return 'available';
  };
  
  const [activeTab, setActiveTab] = useState(getTabFromUrl);
  
  // Sync tab state with URL changes (for mobile nav clicks)
  useEffect(() => {
    const newTab = getTabFromUrl();
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
  }, [searchParams]);
  
  // Update URL when tab changes (for deep linking and mobile nav sync)
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Use setLocation to trigger wouter navigation so MobileBottomNav updates
    if (tab === 'my-bookings') {
      setLocation('/mover-dashboard?tab=active', { replace: true });
    } else if (tab === 'payouts') {
      setLocation('/mover-dashboard?tab=payouts', { replace: true });
    } else {
      setLocation('/mover-dashboard', { replace: true });
    }
  };
  
  // Image preview state
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showImagePreview, setShowImagePreview] = useState(false);

  // First get the mover profile
  const { data: mover } = useQuery<any>({
    queryKey: [`/api/movers?userId=${user?.id}`],
    enabled: !!user?.id,
    select: (data) => Array.isArray(data) ? data[0] : data,
  });

  // Get verification status
  const { data: verificationStatus, isLoading: isVerificationLoading } = useQuery<any>({
    queryKey: [`/api/movers/${mover?.id}/verification-status`],
    enabled: !!mover?.id,
  });

  // Get Early Access terms acceptance status
  const { data: termsStatus } = useQuery<any>({
    queryKey: ["/api/movers/terms/status"],
    enabled: !!mover?.id,
  });

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showWelcomeTutorial, setShowWelcomeTutorial] = useState(false);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);

  useEffect(() => {
    if (termsStatus?.requiresTermsAcceptance) {
      setShowTermsModal(true);
    }
  }, [termsStatus]);

  // Show welcome tutorial for new movers (only once, persisted to database)
  useEffect(() => {
    // Only show if: user exists, hasn't completed onboarding, mover profile exists, and not already dismissed this session
    if (user && user.hasCompletedOnboarding === false && mover && !tutorialDismissed) {
      setShowWelcomeTutorial(true);
    } else if (user?.hasCompletedOnboarding === true) {
      // If already completed, make sure tutorial stays closed
      setShowWelcomeTutorial(false);
    }
  }, [user?.hasCompletedOnboarding, mover, tutorialDismissed]);

  const handleTutorialComplete = () => {
    setTutorialDismissed(true);
    setShowWelcomeTutorial(false);
  };

  // Get all bookings for this mover (server returns assigned + available)
  const { data: allBookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    enabled: !!user?.id,
  });

  // Client-side filtering: separate assigned from available bookings
  // Auto-filter expired bookings and sort by preferredDate (soonest first)
  const now = new Date();
  
  // Active bookings: assigned to this mover, not completed/cancelled, and not past-dated
  // Hide jobs with past dates to keep the list clean
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const activeBookings = allBookings
    ?.filter((b) => b.moverId === mover?.id)
    ?.filter((b) => {
      const isActiveStatus = ["confirmed", "in_transit", ...ACTIVE_STATUSES].includes(b.status);
      if (!isActiveStatus) return false;
      
      // Hide jobs with past dates (before today)
      const jobDate = new Date(b.preferredDate);
      jobDate.setHours(0, 0, 0, 0);
      if (jobDate < todayStart) return false;
      
      return true;
    })
    ?.sort((a, b) => {
      // Sort by soonest date first
      const aDate = new Date(a.preferredDate);
      const bDate = new Date(b.preferredDate);
      return aDate.getTime() - bDate.getTime();
    }) || [];
  
  // Past bookings are auto-hidden from "Your Bookings" - movers only see active jobs
  // Completed/cancelled bookings are tracked in earnings history instead
  
  // Only show active bookings in "Your Bookings" section
  const bookings = activeBookings;
  
  // Show only PAID jobs that are available for acceptance
  // Must have: payment succeeded, no mover assigned, pending/confirmed status, and not a past date
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today for date comparison
  
  const availableBookings = allBookings
    ?.filter((b) => {
      // Must be a paid job
      if (b.paymentStatus !== 'succeeded') return false;
      // Must not have a mover assigned
      if (b.moverId) return false;
      // Must be pending or confirmed status
      if (b.status !== "pending" && b.status !== "confirmed") return false;
      // Must be today or in the future (not old jobs)
      const jobDate = new Date(b.preferredDate);
      jobDate.setHours(0, 0, 0, 0);
      if (jobDate < today) return false;
      return true;
    })
    ?.sort((a, b) => {
      // Sort by soonest date first
      const aDate = new Date(a.preferredDate);
      const bDate = new Date(b.preferredDate);
      return aDate.getTime() - bDate.getTime();
    }) || [];
  
  // Check if mover already has a trip in progress (to block starting multiple trips)
  const hasActiveTrip = bookings.some((b) => 
    b.status === "in_transit" || ACTIVE_STATUSES.includes(b.status as BookingStatus)
  );

  // Get earnings data for this mover
  const { data: earnings } = useQuery<any>({
    queryKey: [`/api/movers/${mover?.id}/earnings`],
    enabled: !!mover?.id,
  });

  const acceptBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("PATCH", `/api/bookings/${bookingId}`, {
        moverId: mover?.id,
        status: "confirmed",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to accept booking");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Booking accepted",
        description: "You've successfully accepted this booking.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to accept booking",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAcceptBooking = (bookingId: string) => {
    const hasValidPhoto = mover?.moverImage && mover.moverImage.trim().length > 0;
    if (!hasValidPhoto) {
      toast({
        title: "Profile photo required",
        description: "Please upload a profile photo before accepting jobs.",
        variant: "destructive",
        action: (
          <Button variant="outline" size="sm" onClick={() => setLocation("/mover-profile")}>
            Add Photo
          </Button>
        ),
      });
      return;
    }
    acceptBookingMutation.mutate(bookingId);
  };

  const declineBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/bookings/${bookingId}/decline`, {
        moverId: mover?.id,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to decline booking");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Job declined",
        description: "You've declined this job. It will no longer appear in your available jobs.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to decline job",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const completeBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("PATCH", `/api/bookings/${bookingId}`, { status: "completed" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to complete booking");
      }
      return response.json();
    },
    onSuccess: (_, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      // Stop location sharing when trip is completed
      if (locationSharing === bookingId) {
        setLocationSharing(null);
      }
      toast({
        title: "Booking completed",
        description: "The move has been marked as completed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to complete booking",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const startTripMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("PATCH", `/api/bookings/${bookingId}`, { status: BOOKING_STATUSES.EN_ROUTE_TO_PICKUP });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start trip");
      }
      return response.json();
    },
    onSuccess: (_, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setLocationSharing(bookingId);
      toast({
        title: "Trip started",
        description: "Location sharing is now active. Your customer can track your location in real-time.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start trip",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for advancing through status stages
  const updateStatusMutation = useMutation({
    mutationFn: async ({ bookingId, newStatus }: { bookingId: string; newStatus: BookingStatus }) => {
      // Use dedicated complete endpoint for completion to trigger earnings recording
      if (newStatus === BOOKING_STATUSES.COMPLETED) {
        const response = await apiRequest("POST", `/api/bookings/${bookingId}/complete`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to complete booking");
        }
        return response.json();
      }
      
      // Regular status updates for other statuses
      const response = await apiRequest("PATCH", `/api/bookings/${bookingId}`, { status: newStatus });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update status");
      }
      return response.json();
    },
    onSuccess: (data, { bookingId, newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      
      const statusInfo = BOOKING_STATUS_INFO[newStatus];
      
      // Start location sharing for active statuses
      if (ACTIVE_STATUSES.includes(newStatus)) {
        setLocationSharing(bookingId);
      }
      
      // Stop location sharing when completed
      if (newStatus === BOOKING_STATUSES.COMPLETED) {
        setLocationSharing(null);
        // Invalidate earnings to refresh the payout dashboard (both endpoints)
        queryClient.invalidateQueries({ queryKey: [`/api/movers/${mover?.id}/earnings`] });
        queryClient.invalidateQueries({ queryKey: ["/api/movers/payouts/earnings"] });
      }
      
      // Show earnings info if completion returned earnings data
      if (newStatus === BOOKING_STATUSES.COMPLETED && data?.earnings) {
        toast({
          title: "Move Completed!",
          description: `You earned $${parseFloat(data.earnings.net).toFixed(2)} CAD (after ${data.earnings.platformFee ? `$${parseFloat(data.earnings.platformFee).toFixed(2)}` : '15%'} platform fee)`,
        });
      } else {
        toast({
          title: `Status Updated: ${statusInfo?.label || newStatus}`,
          description: statusInfo?.description || "Move status has been updated.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: async (isAvailable: boolean) => {
      const response = await apiRequest("PATCH", `/api/movers/${mover?.id}`, { isAvailable });
      return response.json();
    },
    onSuccess: async (data, variables) => {
      await queryClient.invalidateQueries({ queryKey: [`/api/movers?userId=${user?.id}`] });
      await queryClient.refetchQueries({ queryKey: [`/api/movers?userId=${user?.id}`] });
      
      const newState = data?.isAvailable !== undefined ? data.isAvailable : variables;
      toast({
        title: newState ? "You're now online" : "You're now offline",
        description: newState 
          ? "Customers can now see you're available. Your location is updated while you stay online." 
          : "You won't receive new job notifications. Location sharing stopped.",
      });
    },
    onError: async (error: any) => {
      await queryClient.invalidateQueries({ queryKey: [`/api/movers?userId=${user?.id}`] });
      await queryClient.refetchQueries({ queryKey: [`/api/movers?userId=${user?.id}`] });
      
      if (error?.error === "VERIFICATION_INCOMPLETE") {
        await queryClient.invalidateQueries({ queryKey: [`/api/movers/${mover?.id}/verification-status`] });
        await queryClient.refetchQueries({ queryKey: [`/api/movers/${mover?.id}/verification-status`] });
        setVerificationError(error);
        setShowVerificationAlert(true);
      } else {
        toast({
          title: "Error",
          description: error?.message || "Failed to update availability",
          variant: "destructive",
        });
      }
    },
  });

  const handleAvailabilityToggle = (checked: boolean) => {
    if (isVerificationLoading) {
      toast({
        title: "Loading verification status",
        description: "Please wait while we check your verification status...",
      });
      return;
    }
    
    // TEMPORARILY DISABLED FOR TESTING - Re-enable verification check for production
    // if (checked && !verificationStatus?.isComplete) {
    //   setShowVerificationAlert(true);
    //   setVerificationError({
    //     message: "You must complete all verification requirements before going online.",
    //     incompleteItems: verificationStatus?.incompleteItems || [],
    //   });
    //   return;
    // }
    
    // When going online, auto-request location permission (seamless UX)
    if (checked && geoPermissionState !== 'granted' && !geoCoords) {
      pendingOnlineToggle.current = true;
      requestGeoLocation();
      toast({
        title: "Enabling location...",
        description: "Please allow location access to go online and receive job offers.",
      });
      return;
    }
    
    toggleAvailabilityMutation.mutate(checked);
  };
  
  // Auto-complete online toggle after location permission is granted
  useEffect(() => {
    if (pendingOnlineToggle.current && (geoPermissionState === 'granted' || geoCoords)) {
      pendingOnlineToggle.current = false;
      toggleAvailabilityMutation.mutate(true);
    }
  }, [geoPermissionState, geoCoords]);

  // Location sharing effect - uses watchPosition for continuous real-time tracking during trips
  // This is more reliable than setInterval + getCurrentPosition, especially when phone screen is off
  useEffect(() => {
    if (!locationSharing) return;

    let permissionDeniedShown = false;
    let watchId: number | null = null;
    let lastSentTime = 0;
    const MIN_UPDATE_INTERVAL = 3000; // Send updates at most every 3 seconds
    const MIN_DISTANCE_METERS = 5; // Only send if moved at least 5 meters
    let lastPosition: { lat: number; lng: number } | null = null;

    // Calculate distance between two points in meters (Haversine formula)
    const getDistanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 6371000; // Earth's radius in meters
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    const sendLocationUpdate = async (latitude: number, longitude: number) => {
      const now = Date.now();
      
      // Check if enough time has passed since last update
      if (now - lastSentTime < MIN_UPDATE_INTERVAL) {
        return;
      }
      
      // Check if we've moved enough (skip if standing still)
      if (lastPosition) {
        const distance = getDistanceMeters(lastPosition.lat, lastPosition.lng, latitude, longitude);
        if (distance < MIN_DISTANCE_METERS && now - lastSentTime < 10000) {
          // If not moved much and updated within 10 seconds, skip
          return;
        }
      }
      
      try {
        await apiRequest("POST", `/api/bookings/${locationSharing}/location`, {
          latitude,
          longitude,
        });
        lastSentTime = now;
        lastPosition = { lat: latitude, lng: longitude };
        console.log("[GPS] Location shared via watchPosition");
      } catch (error) {
        console.error("Failed to update location:", error);
      }
    };

    if ("geolocation" in navigator) {
      // Use watchPosition for continuous tracking - more reliable in background
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          sendLocationUpdate(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error("Geolocation watch error:", error.code, error.message);
          
          if (error.code === 1 && !permissionDeniedShown) { // PERMISSION_DENIED
            permissionDeniedShown = true;
            toast({
              title: "Location permission denied",
              description: "Please allow location access in your browser settings, then try starting the trip again.",
              variant: "destructive",
            });
            setLocationSharing(null);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 30000, // Longer timeout for watchPosition
          maximumAge: 3000, // Accept positions up to 3 seconds old
        }
      );
      
      console.log("[GPS] Started watchPosition for trip tracking, watchId:", watchId);
    } else {
      toast({
        title: "Geolocation not supported",
        description: "Your browser doesn't support location services.",
        variant: "destructive",
      });
      setLocationSharing(null);
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        console.log("[GPS] Stopped watchPosition, watchId:", watchId);
      }
    };
  }, [locationSharing, toast]);

  // Uber-style live GPS tracking when mover is online (isAvailable = true)
  // Updates location every 30 seconds to show on Find Movers page
  // Uses shared LocationContext for seamless permission handling
  useEffect(() => {
    if (!mover?.isAvailable) {
      setIsLiveGpsActive(false);
      return;
    }
    
    // If permission is denied, we can't get location
    if (geoPermissionState === 'denied') {
      setIsLiveGpsActive(false);
      return;
    }
    
    // Force location refresh if we don't have coords yet and permission isn't denied
    // This ensures GPS starts immediately when mover is already online on page load
    if (!geoCoords && geoPermissionState !== 'denied' && refreshLocation) {
      console.log("[GPS] Forcing location refresh for online mover");
      refreshLocation();
    }
    
    const updateLiveLocation = async () => {
      // Use shared context coords if available (faster, already cached)
      if (geoCoords) {
        try {
          await apiRequest("PATCH", "/api/movers/me/location", {
            latitude: geoCoords.lat,
            longitude: geoCoords.lng,
          });
          console.log("[GPS] Live location updated from shared context");
          setIsLiveGpsActive(true);
        } catch (error) {
          console.error("[GPS] Failed to update live location:", error);
        }
        return;
      }
      
      // Fallback to direct geolocation if shared context doesn't have coords yet
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              await apiRequest("PATCH", "/api/movers/me/location", {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
              console.log("[GPS] Live location updated from direct call");
              setIsLiveGpsActive(true);
            } catch (error) {
              console.error("[GPS] Failed to update live location:", error);
            }
          },
          (error) => {
            console.error("[GPS] Geolocation error:", error.code);
            if (error.code === 1) {
              setIsLiveGpsActive(false);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30000
          }
        );
      }
    };

    // Update location immediately when going online
    updateLiveLocation();

    // Then update every 30 seconds while online
    const interval = setInterval(updateLiveLocation, 30000);

    return () => {
      clearInterval(interval);
      setIsLiveGpsActive(false);
    };
  }, [mover?.isAvailable, geoCoords, geoPermissionState, refreshLocation]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "confirmed": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "in_transit": 
      case BOOKING_STATUSES.EN_ROUTE_TO_PICKUP: return "bg-orange-500/10 text-orange-600 border-orange-500/20";
      case BOOKING_STATUSES.LOADING: return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      case BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF: return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case BOOKING_STATUSES.UNLOADING: return "bg-teal-500/10 text-teal-600 border-teal-500/20";
      case "completed": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "cancelled": return "bg-red-500/10 text-red-600 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="w-4 h-4" />;
      case "confirmed": return <CheckCircle2 className="w-4 h-4" />;
      case "in_transit":
      case BOOKING_STATUSES.EN_ROUTE_TO_PICKUP: return <Truck className="w-4 h-4" />;
      case BOOKING_STATUSES.LOADING: return <Package className="w-4 h-4" />;
      case BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF: return <Navigation className="w-4 h-4" />;
      case BOOKING_STATUSES.UNLOADING: return <Package className="w-4 h-4" />;
      case "completed": return <CheckCircle2 className="w-4 h-4" />;
      case "cancelled": return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusBarColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-500";
      case "confirmed": return "bg-blue-500";
      case "in_transit":
      case BOOKING_STATUSES.EN_ROUTE_TO_PICKUP: return "bg-orange-500";
      case BOOKING_STATUSES.LOADING: return "bg-purple-500";
      case BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF: return "bg-blue-500";
      case BOOKING_STATUSES.UNLOADING: return "bg-teal-500";
      case "completed": return "bg-green-500";
      case "cancelled": return "bg-red-500";
      default: return "bg-muted";
    }
  };

  const getStatusLabel = (status: string) => {
    const info = BOOKING_STATUS_INFO[status as BookingStatus];
    if (info) return info.label;
    return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  if (!user || user.role !== "mover") {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">This page is only available for movers.</p>
        </div>
      </div>
    );
  }

  if (isLoading || !mover) {
    return <MoverDashboardSkeleton />;
  }

  const renderBookingCard = (booking: Booking, showActions: boolean = false) => (
    <Card key={booking.id} className="overflow-hidden hover-elevate" data-testid={`card-booking-${booking.id}`}>
      {/* Status Bar */}
      <div className={`h-1 ${getStatusBarColor(booking.status)}`} />
      
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h2 className="text-xl font-bold">Move #{booking.id.slice(0, 8)}</h2>
              {/* Priority Request Badge - shown when customer specifically selected this mover */}
              {(booking as any).preSelectedMoverId === mover?.id && (
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 animate-pulse" data-testid={`badge-priority-${booking.id}`}>
                  <Star className="w-3 h-3 mr-1" />
                  Priority Request
                </Badge>
              )}
              <Badge variant="outline" className={`${getStatusColor(booking.status)} flex items-center gap-1.5`} data-testid={`badge-status-${booking.id}`}>
                {getStatusIcon(booking.status)}
                <span className="capitalize">{getStatusLabel(booking.status)}</span>
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Requested on {format(new Date(booking.createdAt), "MMMM d, yyyy")}
            </p>
          </div>
          <div className="text-right">
            {booking.price && (
              <>
                <p className="text-2xl font-bold text-primary">${parseFloat(booking.price).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">CAD</p>
              </>
            )}
          </div>
        </div>

        {/* Customer Card - Premium Uber Style */}
        {booking.customer && (
          <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 rounded-xl p-5 mb-6 border border-blue-500/20" data-testid={`card-customer-${booking.id}`}>
            <div className="flex items-center gap-1 mb-3">
              <User className="w-4 h-4 text-blue-600" />
              <h4 className="font-semibold text-sm text-blue-600">Customer</h4>
            </div>
            
            <div className="flex items-center gap-4">
              <Avatar className="w-14 h-14 border-2 border-blue-500/30">
                <AvatarFallback className="bg-blue-500/20 text-blue-600 text-lg font-bold">
                  {booking.customer.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'C'}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1">
                <h3 className="font-bold text-lg" data-testid={`text-customer-name-${booking.id}`}>{booking.customer.name}</h3>
                <p className="text-sm text-muted-foreground">{booking.customer.email}</p>
              </div>
              
              {booking.customer.phone && (
                <Button variant="outline" size="icon" className="rounded-full" asChild data-testid={`button-call-customer-${booking.id}`}>
                  <a href={`tel:${booking.customer.phone}`} aria-label={`Call ${booking.customer.name}`}>
                    <Phone className="w-4 h-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Route Display - A/B Markers */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="relative flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500">
                <span className="text-xs font-bold text-green-600">A</span>
              </div>
              <div className="w-0.5 h-12 bg-gradient-to-b from-green-500 to-primary my-1" />
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary">
                <span className="text-xs font-bold text-primary">B</span>
              </div>
            </div>
            <div className="flex-1 space-y-6">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pickup</p>
                  <p className="font-medium" data-testid={`text-pickup-${booking.id}`}>{booking.pickupAddress}</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="shrink-0 gap-1.5"
                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(booking.pickupAddress)}`, '_blank')}
                  data-testid={`button-navigate-pickup-${booking.id}`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Navigate
                </Button>
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Dropoff</p>
                  <p className="font-medium" data-testid={`text-dropoff-${booking.id}`}>{booking.dropoffAddress}</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="shrink-0 gap-1.5"
                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(booking.dropoffAddress)}`, '_blank')}
                  data-testid={`button-navigate-dropoff-${booking.id}`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Navigate
                </Button>
              </div>
            </div>
          </div>

          {/* Info Boxes Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Date & Time</p>
              </div>
              <p className="font-medium text-sm">{format(new Date(booking.preferredDate), "MMM d, yyyy")}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(booking.preferredDate), "h:mm a")}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Load Size</p>
              </div>
              <p className="font-medium text-sm capitalize">{booking.loadSize}</p>
              {booking.numberOfMovers && (
                <p className="text-xs text-muted-foreground">{booking.numberOfMovers} mover{booking.numberOfMovers > 1 ? 's' : ''}</p>
              )}
            </div>
            {booking.distance && (
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Distance</p>
                </div>
                <p className="font-medium text-sm" data-testid={`text-distance-${booking.id}`}>{parseFloat(booking.distance).toFixed(1)} km</p>
              </div>
            )}
            {booking.heavyItem && (
              <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <Weight className="w-4 h-4 text-amber-600" />
                  <p className="text-xs text-amber-600">Heavy Items</p>
                </div>
                <p className="font-medium text-sm text-amber-600">Yes</p>
              </div>
            )}
          </div>
        </div>

        {booking.price != null && booking.price !== '' && booking.baseFee != null && booking.baseFee !== '' && (
          <>
            <Separator />
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover-elevate active-elevate-2 p-2 rounded-md w-full" data-testid={`button-price-breakdown-${booking.id}`}>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                View Price Breakdown
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="bg-muted/50 rounded-lg p-4 mt-2 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base Fee</span>
                    <span className="font-medium">
                      ${parseFloat(booking.baseFee).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Distance Fee ({booking.distance ? parseFloat(booking.distance).toFixed(2) : '0'} km × $1.00/km)
                    </span>
                    <span className="font-medium">
                      ${parseFloat(booking.distanceFee || "0").toFixed(2)}
                    </span>
                  </div>
                  {parseFloat(booking.loadFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Load Fee ({booking.loadSize})</span>
                      <span className="font-medium">
                        ${parseFloat(booking.loadFee || "0").toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(booking.pickupDifficultyFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pickup Difficulty Fee</span>
                      <span className="font-medium">
                        ${parseFloat(booking.pickupDifficultyFee || "0").toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(booking.dropoffDifficultyFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dropoff Difficulty Fee</span>
                      <span className="font-medium">
                        ${parseFloat(booking.dropoffDifficultyFee || "0").toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(booking.heavyItemFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Heavy Item Fee</span>
                      <span className="font-medium">
                        ${parseFloat(booking.heavyItemFee || "0").toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(booking.moverTravelFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mover Travel Fee</span>
                      <span className="font-medium">
                        ${parseFloat(booking.moverTravelFee || "0").toFixed(2)}
                      </span>
                    </div>
                  )}
                  {booking.numberOfMovers === 2 && booking.subtotal != null && (() => {
                    const subtotalValue = Number(booking.subtotal);
                    if (!Number.isNaN(subtotalValue)) {
                      const postMultiplierSubtotal = subtotalValue * 1.30;
                      return (
                        <>
                          <div className="h-px bg-border my-2" />
                          <div className="flex justify-between text-primary">
                            <span className="font-medium">2-Movers Fee (×1.30): 1st mover + 30% for 2nd</span>
                            <span className="font-medium" data-testid={`text-breakdown-subtotal-multiplied-${booking.id}`}>
                              ${postMultiplierSubtotal.toFixed(2)}
                            </span>
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                  <div className="h-px bg-border my-2" />
                  <div className="flex justify-between font-bold">
                    <span>Total Earnings</span>
                    {booking.price != null ? (
                      <span className="text-primary" data-testid={`text-breakdown-total-${booking.id}`}>
                        ${Number(booking.price).toFixed(2)} CAD
                      </span>
                    ) : (
                      <span className="text-muted-foreground" data-testid={`text-breakdown-total-${booking.id}`}>
                        Quote pending
                      </span>
                    )}
                  </div>
                  
                  {/* AI Feature 2: Price Explanation - ARCHIVED */}
                  {AI_FEATURES.PRICE_BREAKDOWN_EXPLAINER && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Infer difficulty and heavy item from fees
                        const pickupDifficulty = parseFloat(booking.pickupDifficultyFee || "0") === 10 ? "basement" :
                          parseFloat(booking.pickupDifficultyFee || "0") === 5 ? "stairs" :
                          parseFloat(booking.pickupDifficultyFee || "0") === 8 ? "elevator" : "ground";
                        const dropoffDifficulty = parseFloat(booking.dropoffDifficultyFee || "0") === 10 ? "basement" :
                          parseFloat(booking.dropoffDifficultyFee || "0") === 5 ? "stairs" :
                          parseFloat(booking.dropoffDifficultyFee || "0") === 8 ? "elevator" : "ground";
                        const heavyItem = parseFloat(booking.heavyItemFee || "0") > 0;
                        
                        const explanation = generatePriceExplanation({
                          baseFee: parseFloat(booking.baseFee || "30"),
                          distanceFee: parseFloat(booking.distanceFee || "0"),
                          loadFee: parseFloat(booking.loadFee || "0"),
                          pickupDifficultyFee: parseFloat(booking.pickupDifficultyFee || "0"),
                          dropoffDifficultyFee: parseFloat(booking.dropoffDifficultyFee || "0"),
                          heavyItemFee: parseFloat(booking.heavyItemFee || "0"),
                          moverTravelFee: parseFloat(booking.moverTravelFee || "0"),
                          subtotal: parseFloat(booking.subtotal || "0"),
                          numberOfMovers: booking.numberOfMovers || 1,
                          finalTotal: parseFloat(booking.price || "0"),
                          distance: parseFloat(booking.distance || "0"),
                          loadSize: booking.loadSize || "small",
                          pickupDifficulty,
                          dropoffDifficulty,
                          heavyItem
                        });
                        alert(explanation);
                      }}
                      className="w-full mt-3"
                      data-testid={`button-ai-explain-${booking.id}`}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      AI Explain Earnings
                    </Button>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {booking.description && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-1">Additional Details</p>
              <p className="text-sm text-muted-foreground">{booking.description}</p>
            </div>
          </>
        )}

        {booking.images && booking.images.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-3">Item Photos ({booking.images.length})</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {booking.images.map((imageUrl, index) => (
                  <div 
                    key={index} 
                    className="relative aspect-square rounded-md overflow-hidden border cursor-pointer group"
                    onClick={() => {
                      setPreviewImages(booking.images || []);
                      setPreviewIndex(index);
                      setShowImagePreview(true);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setPreviewImages(booking.images ?? []);
                        setPreviewIndex(index);
                        setShowImagePreview(true);
                      }
                    }}
                    aria-label={`View item photo ${index + 1} of ${booking.images?.length || 0}`}
                    data-testid={`button-preview-image-${booking.id}-${index}`}
                  >
                    <img
                      src={imageUrl}
                      alt={`Item ${index + 1}`}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      data-testid={`image-item-${booking.id}-${index}`}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />
        <IdentifiedItemsDisplay bookingId={booking.id} />

        {/* Move Progress Indicator for active bookings */}
        {(ACTIVE_STATUSES.includes(booking.status as BookingStatus) || booking.status === "in_transit") && (
          <>
            <Separator />
            <MoveProgressIndicator currentStatus={booking.status} className="py-2" />
          </>
        )}

        {(showActions || booking.status === "confirmed" || (booking.status !== "cancelled" && booking.status !== "pending" && booking.status !== "completed")) && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-3">
              {showActions && (
                <>
                  <Button
                    variant="default"
                    onClick={() => handleAcceptBooking(booking.id)}
                    disabled={acceptBookingMutation.isPending || declineBookingMutation.isPending}
                    data-testid={`button-accept-${booking.id}`}
                    className="flex-1 sm:flex-none"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {acceptBookingMutation.isPending ? "Accepting..." : "Accept Booking"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => declineBookingMutation.mutate(booking.id)}
                    disabled={acceptBookingMutation.isPending || declineBookingMutation.isPending}
                    data-testid={`button-decline-${booking.id}`}
                    className="flex-1 sm:flex-none"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    {declineBookingMutation.isPending ? "Declining..." : "Decline"}
                  </Button>
                </>
              )}
              
              {/* Start Trip - Confirmed status AND assigned to this mover (not available jobs) */}
              {booking.status === "confirmed" && booking.moverId && !showActions && (
                <Button
                  variant="default"
                  onClick={() => startTripMutation.mutate(booking.id)}
                  disabled={startTripMutation.isPending || hasActiveTrip}
                  data-testid={`button-start-trip-${booking.id}`}
                  className="flex-1 sm:flex-none bg-orange-500 hover:bg-orange-600"
                  title={hasActiveTrip ? "Complete your current trip before starting another" : undefined}
                >
                  <Truck className="w-4 h-4 mr-2" />
                  {startTripMutation.isPending ? "Starting..." : hasActiveTrip ? "Trip in Progress" : "Head to Pickup"}
                </Button>
              )}
              
              {/* En Route to Pickup → Loading */}
              {(booking.status === BOOKING_STATUSES.EN_ROUTE_TO_PICKUP || booking.status === "in_transit") && (
                <Button
                  variant="default"
                  onClick={() => updateStatusMutation.mutate({ bookingId: booking.id, newStatus: BOOKING_STATUSES.LOADING })}
                  disabled={updateStatusMutation.isPending}
                  data-testid={`button-arrived-pickup-${booking.id}`}
                  className="flex-1 sm:flex-none bg-purple-500 hover:bg-purple-600"
                >
                  <Package className="w-4 h-4 mr-2" />
                  {updateStatusMutation.isPending ? "Updating..." : "Arrived - Start Loading"}
                </Button>
              )}
              
              {/* Loading → En Route to Dropoff */}
              {booking.status === BOOKING_STATUSES.LOADING && (
                <Button
                  variant="default"
                  onClick={() => updateStatusMutation.mutate({ bookingId: booking.id, newStatus: BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF })}
                  disabled={updateStatusMutation.isPending}
                  data-testid={`button-depart-${booking.id}`}
                  className="flex-1 sm:flex-none bg-blue-500 hover:bg-blue-600"
                >
                  <Navigation className="w-4 h-4 mr-2" />
                  {updateStatusMutation.isPending ? "Updating..." : "Loading Complete - Depart"}
                </Button>
              )}
              
              {/* En Route to Dropoff → Unloading */}
              {booking.status === BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF && (
                <Button
                  variant="default"
                  onClick={() => updateStatusMutation.mutate({ bookingId: booking.id, newStatus: BOOKING_STATUSES.UNLOADING })}
                  disabled={updateStatusMutation.isPending}
                  data-testid={`button-arrived-dropoff-${booking.id}`}
                  className="flex-1 sm:flex-none bg-teal-500 hover:bg-teal-600"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  {updateStatusMutation.isPending ? "Updating..." : "Arrived - Start Unloading"}
                </Button>
              )}
              
              {/* Unloading → Completed */}
              {booking.status === BOOKING_STATUSES.UNLOADING && (
                <Button
                  variant="default"
                  onClick={() => updateStatusMutation.mutate({ bookingId: booking.id, newStatus: BOOKING_STATUSES.COMPLETED })}
                  disabled={updateStatusMutation.isPending}
                  data-testid={`button-complete-${booking.id}`}
                  className="flex-1 sm:flex-none bg-green-500 hover:bg-green-600"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {updateStatusMutation.isPending ? "Completing..." : "Unloading Complete - Finish Move"}
                </Button>
              )}
              
              {/* Location sharing indicator */}
              {locationSharing === booking.id && (
                <Badge variant="default" className="flex items-center gap-1" data-testid={`badge-sharing-location-${booking.id}`}>
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  Sharing Location
                </Badge>
              )}
              
              {/* Message button for all active bookings */}
              {booking.status !== "cancelled" && booking.status !== "pending" && (
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/messages/${booking.id}`)}
                  data-testid={`button-message-${booking.id}`}
                  className="flex-1 sm:flex-none"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Message Customer
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  const firstName = user?.name?.split(' ')[0] || 'there';
  const rating = mover?.rating ? parseFloat(mover.rating).toFixed(1) : '5.0';
  // Use earnings data for accurate completed count (matches Earnings tab)
  const totalMoves = earnings?.completedJobs ?? mover?.totalMoves ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      {/* Premium Header Section */}
      <div className="bg-gradient-to-br from-primary/5 via-primary/10 to-transparent border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            {/* Welcome & Profile */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="w-16 h-16 rounded-2xl shadow-lg shadow-primary/20">
                  <AvatarImage src={mover?.moverImage || undefined} alt={user?.name || "Mover"} />
                  <AvatarFallback className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-2xl font-bold">
                    {firstName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {mover?.isAvailable && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-background flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">Hey {firstName}!</h1>
                <p className="text-muted-foreground flex flex-wrap items-center gap-2">
                  {getVehicleDisplayName(mover?.vehicleType) || 'Mover'}
                  {verificationStatus?.isComplete && (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                  {termsStatus?.hasAcceptedCurrentTerms && mover?.pilotStatus === 'approved' && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Early Access
                    </Badge>
                  )}
                </p>
              </div>
            </div>
            
            {/* Status Toggle & Actions */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {mover?.isAvailable && isLiveGpsActive && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs gap-1" data-testid="badge-live-gps">
                    <MapPin className="w-3 h-3" />
                    Live GPS
                  </Badge>
                )}
                {mover?.isAvailable && !isLiveGpsActive && geoPermissionState !== 'denied' && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs gap-1 animate-pulse" data-testid="badge-gps-loading">
                    <MapPin className="w-3 h-3" />
                    GPS...
                  </Badge>
                )}
                <div 
                  className={`flex items-center gap-3 rounded-full px-4 py-2 border-2 transition-all ${
                    mover?.isAvailable 
                      ? 'bg-green-500/10 border-green-500/30' 
                      : 'bg-muted/50 border-muted-foreground/20'
                  }`}
                  data-testid="toggle-availability"
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${mover?.isAvailable ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/50'}`} />
                  <span className={`text-sm font-semibold ${mover?.isAvailable ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {isVerificationLoading ? '...' : (mover?.isAvailable ? 'Online' : 'Offline')}
                  </span>
                  <Switch 
                    checked={mover?.isAvailable || false}
                    onCheckedChange={handleAvailabilityToggle}
                    disabled={isVerificationLoading || toggleAvailabilityMutation.isPending}
                    data-testid="switch-online-status"
                  />
                </div>
              </div>
              
            </div>
          </div>
          
          {/* Quick Stats Row */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="bg-card/80 backdrop-blur rounded-xl p-4 border shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <Truck className="w-3.5 h-3.5" />
                Completed
              </div>
              <p className="text-2xl font-bold">{totalMoves}</p>
            </div>
            <div className="bg-card/80 backdrop-blur rounded-xl p-4 border shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <DollarSign className="w-3.5 h-3.5" />
                {totalMoves > 0 ? 'Earnings' : 'Pending'}
              </div>
              <p className="text-2xl font-bold">
                {totalMoves > 0 ? `$${earnings?.totalEarnings || '0'}` : `${activeBookings.length}`}
              </p>
            </div>
            <div className="bg-card/80 backdrop-blur rounded-xl p-4 border shadow-sm">
              <div className="flex items-center gap-2 text-amber-500 text-xs font-medium mb-1">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
                Rating
              </div>
              <p className="text-2xl font-bold">{rating}</p>
            </div>
          </div>
          
          {!verificationStatus?.isComplete && (
            <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Complete Verification</p>
                  <p className="text-xs text-muted-foreground">Finish setup to start accepting jobs</p>
                </div>
              </div>
              <Button 
                size="sm"
                onClick={() => handleTabChange("verification")}
                data-testid="button-go-to-verification-alert"
                className="rounded-full"
              >
                Get Verified
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">

        <EarlyAccessTermsModal 
          open={showTermsModal} 
          onAccept={() => setShowTermsModal(false)} 
        />

        {/* Mover Welcome Tutorial */}
        <MoverWelcomeTutorial
          isOpen={showWelcomeTutorial}
          onComplete={handleTutorialComplete}
          userName={user?.name || "Mover"}
        />

        {/* Location Permission Prompt for Movers - ONLY show if permission blocked */}
        {geoPermissionState === 'denied' && !geoCoords && (
          <div className="mb-4">
            <LocationPrompt 
              variant="card"
              showAlways={true}
              context="mover"
            />
          </div>
        )}

        <AlertDialog open={showVerificationAlert} onOpenChange={setShowVerificationAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Verification Required
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>{verificationError?.message || "You must complete all verification requirements before going online."}</p>
                
                {verificationError?.incompleteItems && verificationError.incompleteItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">Missing or Incomplete Items:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {verificationError.incompleteItems.map((item: any, idx: number) => (
                        <li key={idx}>
                          {item.type.replace(/_/g, ' ')} - {item.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => {
                  setShowVerificationAlert(false);
                  handleTabChange("verification");
                }}
                data-testid="button-go-to-verification"
              >
                Go to Verification
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="w-full grid grid-cols-6 bg-card border shadow-sm p-1.5 rounded-xl h-auto">
            <TabsTrigger value="available" data-testid="tab-available" className="gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Jobs</span>
              {availableBookings && availableBookings.length > 0 && (
                <Badge variant="secondary" className="no-default-hover-elevate h-5 px-1.5 text-xs bg-primary-foreground/20 text-inherit">
                  {availableBookings.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="my-bookings" data-testid="tab-my-bookings" className="gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Bookings</span>
              {bookings && bookings.length > 0 && (
                <Badge variant="secondary" className="no-default-hover-elevate h-5 px-1.5 text-xs bg-primary-foreground/20 text-inherit">
                  {bookings.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="verification" data-testid="tab-verification" className="gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Verify</span>
            </TabsTrigger>
            <TabsTrigger value="earnings" data-testid="tab-earnings" className="gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <DollarSign className="w-4 h-4" />
              <span className="hidden sm:inline">Earnings</span>
            </TabsTrigger>
            <TabsTrigger value="payouts" data-testid="tab-payouts" className="gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Payouts</span>
            </TabsTrigger>
            <TabsTrigger value="support" data-testid="tab-support" className="gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Support</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-4">
            {!availableBookings || availableBookings.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <Package className="w-10 h-10 text-primary/60" />
                  </div>
                  <h3 className="font-semibold text-xl mb-2">No Available Jobs</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                    New moving requests in your area will appear here. Stay online to receive job notifications.
                  </p>
                  {!mover?.isAvailable && (
                    <Button onClick={() => handleAvailabilityToggle(true)} className="rounded-full">
                      Go Online
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Available Jobs</h2>
                  <Badge variant="outline" className="text-primary">
                    {availableBookings.length} available
                  </Badge>
                </div>
                {availableBookings.map((booking) => renderBookingCard(booking, true))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-bookings" className="space-y-4">
            {isLoading ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                  </div>
                  <p className="text-muted-foreground">Loading your bookings...</p>
                </CardContent>
              </Card>
            ) : !bookings || bookings.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
                    <Calendar className="w-10 h-10 text-green-500/60" />
                  </div>
                  <h3 className="font-semibold text-xl mb-2">No Active Bookings</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                    Accept jobs from the Jobs tab to start earning. Your active and completed bookings will appear here.
                  </p>
                  <Button variant="outline" onClick={() => handleTabChange("available")} className="rounded-full">
                    Browse Available Jobs
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Your Bookings</h2>
                  <Badge variant="outline">
                    {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
                  </Badge>
                </div>
                {bookings.map((booking) => renderBookingCard(booking))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="verification" className="space-y-4">
            <MoverVerification />
          </TabsContent>

          <TabsContent value="earnings" className="space-y-6">
            {totalMoves === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <DollarSign className="w-10 h-10 text-primary/60" />
                  </div>
                  <h3 className="font-semibold text-xl mb-2">No Earnings Yet</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                    Complete your first job to start tracking your earnings here. Accept available jobs to get started!
                  </p>
                  <Button variant="outline" onClick={() => handleTabChange("available")} className="rounded-full">
                    Browse Available Jobs
                  </Button>
                </CardContent>
              </Card>
            ) : !earnings ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                  </div>
                  <p className="text-muted-foreground">Loading earnings...</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Premium Total Earnings Hero Card */}
                <Card className="bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground overflow-hidden relative" data-testid="card-total-earnings">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-32 translate-x-32" />
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-24 -translate-x-24" />
                  <CardContent className="p-8 relative">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-primary-foreground/70 text-sm font-medium mb-2">Total Earnings</p>
                        <p className="text-5xl font-bold mb-2" data-testid="text-total-earnings">${earnings.totalEarnings}</p>
                        <p className="text-primary-foreground/70 text-sm">
                          From {earnings.completedJobs} completed {earnings.completedJobs === 1 ? 'move' : 'moves'}
                        </p>
                      </div>
                      <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
                        <DollarSign className="w-8 h-8" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Stats Grid */}
                <div className="grid gap-4 grid-cols-2">
                  <Card data-testid="card-pending-earnings" className="hover-elevate">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                          <Clock className="w-6 h-6 text-amber-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Pending</p>
                          <p className="text-2xl font-bold" data-testid="text-pending-earnings">${earnings.pendingEarnings}</p>
                          <p className="text-xs text-muted-foreground">{earnings.pendingJobs} active</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-completed-jobs" className="hover-elevate">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                          <CheckCircle className="w-6 h-6 text-green-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Completed</p>
                          <p className="text-2xl font-bold" data-testid="text-completed-jobs-count">{earnings.completedJobs}</p>
                          <p className="text-xs text-muted-foreground">Jobs done</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Earnings by Month */}
                {earnings.earningsByMonth && earnings.earningsByMonth.length > 0 && (
                  <Card data-testid="card-earnings-by-month">
                    <CardHeader>
                      <CardTitle>Earnings by Month</CardTitle>
                      <CardDescription>
                        Your monthly earnings breakdown
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {earnings.earningsByMonth.map((month: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div>
                              <p className="font-medium">{month.month}</p>
                              <p className="text-sm text-muted-foreground">
                                {month.jobCount} {month.jobCount === 1 ? 'job' : 'jobs'}
                              </p>
                            </div>
                            <div className="text-lg font-bold text-primary">
                              ${month.earnings}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Completed Bookings */}
                {earnings.recentBookings && earnings.recentBookings.length > 0 && (
                  <Card data-testid="card-recent-earnings">
                    <CardHeader>
                      <CardTitle>Recent Completed Jobs</CardTitle>
                      <CardDescription>
                        Your latest earnings
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {earnings.recentBookings.map((booking: any) => (
                          <div
                            key={booking.id}
                            className="flex items-start justify-between p-4 rounded-lg bg-muted/50"
                            data-testid={`earnings-booking-${booking.id}`}
                          >
                            <div className="flex-1">
                              <p className="font-medium">{booking.customerName}</p>
                              <div className="space-y-1 mt-1">
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {booking.pickupAddress}
                                </p>
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {booking.dropoffAddress}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {booking.date}
                                </p>
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-primary">
                                ${booking.earnings}
                              </div>
                              <Badge variant="default" className="mt-1">
                                Paid
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Empty State */}
                {earnings.completedJobs === 0 && (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <DollarSign className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                      <h3 className="font-semibold text-lg mb-2">No Earnings Yet</h3>
                      <p className="text-muted-foreground">
                        Complete jobs to start earning money!
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="payouts" className="space-y-6">
            <MoverPayoutCenter />
          </TabsContent>

          <TabsContent value="support" className="space-y-6">
            <Card>
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <HelpCircle className="w-10 h-10 text-primary/60" />
                </div>
                <h3 className="font-semibold text-xl mb-2">Need Help?</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                  Access our help center for FAQs, submit support tickets, or contact our team directly.
                </p>
                <Button onClick={() => setLocation("/support")} data-testid="button-go-to-support">
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Go to Support Center
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Image Preview Dialog */}
      <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          <DialogDescription className="sr-only">
            Viewing image {previewIndex + 1} of {previewImages.length}
          </DialogDescription>
          <div className="relative flex items-center justify-center min-h-[60vh]">
            {previewImages.length > 0 && (
              <>
                <img
                  src={previewImages[previewIndex]}
                  alt={`Preview ${previewIndex + 1}`}
                  className="max-w-full max-h-[80vh] object-contain"
                  data-testid="img-preview-full"
                />
                
                {/* Navigation arrows */}
                {previewImages.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full"
                      onClick={() => setPreviewIndex((prev) => (prev > 0 ? prev - 1 : previewImages.length - 1))}
                      aria-label="Previous image"
                      data-testid="button-prev-image"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full"
                      onClick={() => setPreviewIndex((prev) => (prev < previewImages.length - 1 ? prev + 1 : 0))}
                      aria-label="Next image"
                      data-testid="button-next-image"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </Button>
                  </>
                )}
                
                {/* Image counter */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 px-3 py-1 rounded-full text-white text-sm">
                  {previewIndex + 1} / {previewImages.length}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
