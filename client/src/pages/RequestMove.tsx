// PERFORMANCE: Preload Payment page when step >= 2
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useGoogleMaps } from "@/contexts/GoogleMapsContext";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import LoadSizeSelector from "@/components/LoadSizeSelector";
import ImageUpload from "@/components/ImageUpload";
import { CustomAddressInput } from "@/components/CustomAddressInput";
import { PricingSummary } from "@/components/PricingSummary";
import { IdentifiedItemsList } from "@/components/IdentifiedItemsList";
import { MapPin, Calendar, FileText, CheckCircle, TrendingUp, Package, DollarSign, Weight, Users, Clock, Sparkles, Camera, Loader2, Info, Scan, CreditCard, Truck, AlertTriangle, Star, X } from "lucide-react";
import type { IdentifiedItem } from "@shared/schema";
import { useLocation, useSearch } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation as useGeoLocation } from "@/contexts/LocationContext";
import { generatePriceExplanation, AI_FEATURES, type PhotoAnalysisResult } from "@shared/ai";
import { calculatePrice, type PriceBreakdown, type PickupDifficultyType, type DropoffDifficultyType } from "@shared/pricing";

import singleMoverVideo from "@assets/generated_videos/single_mover_carrying_box.mp4";
import twoMoversVideo from "@assets/generated_videos/two_movers_carrying_sofa.mp4";
import singleMoverPoster from "@assets/generated_images/single_mover_poster_image.png";
import twoMoversPoster from "@assets/generated_images/two_movers_poster_image.png";
import { saveDraft, loadDraft, clearDraft, type BookingDraftData } from "@/lib/bookingDraft";

// Calgary city center – default map position before addresses are entered
const CALGARY_CENTER = { lat: 51.0447, lng: -114.0719 };

// Premium logistics map style — clear roads, reduced clutter, strong visual hierarchy
const BOOKING_MAP_STYLES = [
  // ── Base & Landscape ──────────────────────────────────────────────────────
  { elementType: "geometry",                                  stylers: [{ color: "#edecea" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#e8e6e3" }] },
  { featureType: "landscape.natural",  elementType: "geometry", stylers: [{ color: "#e4e8dc" }] },

  // ── Roads — local ─────────────────────────────────────────────────────────
  { featureType: "road.local",  elementType: "geometry",        stylers: [{ color: "#ffffff" }] },
  { featureType: "road.local",  elementType: "geometry.stroke",  stylers: [{ color: "#d6d3cf" }, { weight: 0.8 }] },
  { featureType: "road.local",  elementType: "labels.text.fill", stylers: [{ color: "#888480" }] },

  // ── Roads — arterial ─────────────────────────────────────────────────────
  { featureType: "road.arterial", elementType: "geometry",        stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry.stroke",  stylers: [{ color: "#b8b4ae" }, { weight: 1.2 }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#5a5652" }] },
  { featureType: "road.arterial", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },

  // ── Roads — highway ───────────────────────────────────────────────────────
  { featureType: "road.highway", elementType: "geometry",          stylers: [{ color: "#f5d97a" }] },
  { featureType: "road.highway", elementType: "geometry.stroke",    stylers: [{ color: "#c9aa48" }, { weight: 1 }] },
  { featureType: "road.highway", elementType: "labels.text.fill",   stylers: [{ color: "#3d3520" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 3 }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#e8c84e" }] },

  // ── Global label styles ───────────────────────────────────────────────────
  { elementType: "labels.text.fill",   stylers: [{ color: "#4a4744" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2.5 }] },

  // ── Administrative ────────────────────────────────────────────────────────
  { featureType: "administrative.locality",      elementType: "labels.text.fill",   stylers: [{ color: "#2a2725" }] },
  { featureType: "administrative.neighborhood",  elementType: "labels.text.fill",   stylers: [{ color: "#6b6764" }] },

  // ── Water ─────────────────────────────────────────────────────────────────
  { featureType: "water", elementType: "geometry",           stylers: [{ color: "#b8d4e8" }] },
  { featureType: "water", elementType: "labels.text.fill",   stylers: [{ color: "#5a8aaa" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#daeaf5" }] },

  // ── Parks & green ─────────────────────────────────────────────────────────
  { featureType: "poi.park", elementType: "geometry",           stylers: [{ color: "#c8dfc0" }] },
  { featureType: "poi.park", elementType: "labels.text.fill",   stylers: [{ color: "#4a7040" }] },
  { featureType: "poi.park", elementType: "labels.text.stroke", stylers: [{ color: "#e8f4e0" }] },

  // ── POI — hide distracting business icons, keep labels subtle ────────────
  { featureType: "poi",          elementType: "labels.icon",       stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", elementType: "labels",            stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", elementType: "labels",          stylers: [{ visibility: "off" }] },

  // ── Transit — hide ────────────────────────────────────────────────────────
  { featureType: "transit",      stylers: [{ visibility: "off" }] },
];

// Branded map marker: clean dot + short label chip (Pickup / Dropoff)
function makeRouteMarkerIcon(label: string, dotColor: string, labelBg: string, labelFg: string): google.maps.Icon {
  const dotR = 7;
  const fontSize = 10;
  const padX = 8;
  const padY = 5;
  const chipH = fontSize + padY * 2;
  const chipW = Math.round(label.length * 6.2 + padX * 2);
  const chipR = chipH / 2;
  const gap = 4;
  // Total SVG: dot on bottom, chip floating above
  const totalW = Math.max(dotR * 2, chipW);
  const chipX = (totalW - chipW) / 2;
  const dotCX = totalW / 2;
  const totalH = chipH + gap + dotR * 2;
  const chipY = 0;
  const dotCY = chipH + gap + dotR;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">
    <defs>
      <filter id="s${label}" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.25)"/>
      </filter>
    </defs>
    <rect x="${chipX}" y="${chipY}" width="${chipW}" height="${chipH}"
      rx="${chipR}" ry="${chipR}" fill="${labelBg}" filter="url(#s${label})"/>
    <text x="${dotCX}" y="${chipY + chipH / 2 + fontSize / 2 - 1}" text-anchor="middle"
      font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
      font-size="${fontSize}" font-weight="700" fill="${labelFg}" letter-spacing="0.3">${label.toUpperCase()}</text>
    <circle cx="${dotCX}" cy="${dotCY}" r="${dotR}" fill="${dotColor}"
      stroke="white" stroke-width="2" filter="url(#s${label})"/>
  </svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new google.maps.Point(dotCX, totalH) as google.maps.Point,
    scaledSize: new google.maps.Size(totalW, totalH),
  };
}

// Helper functions for load size validation
const loadSizeOrder = ['boxes', 'medium', 'large', 'apartment'];

function isLoadSizeSmaller(selected: string, aiRecommended: string): boolean {
  const selectedIndex = loadSizeOrder.indexOf(selected);
  const recommendedIndex = loadSizeOrder.indexOf(aiRecommended);
  return selectedIndex < recommendedIndex && selectedIndex !== -1 && recommendedIndex !== -1;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Helper function to check if items require 2 movers
function requiresTwoMovers(loadSize: string, heavyItem: boolean): boolean {
  return loadSize === 'large' || loadSize === 'apartment' || heavyItem;
}

export default function RequestMove() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [pickupDifficulty, setPickupDifficulty] = useState("");
  const [dropoffDifficulty, setDropoffDifficulty] = useState("");
  const [loadSize, setLoadSize] = useState("medium");
  const [heavyItem, setHeavyItem] = useState(false);
  const [numberOfMovers, setNumberOfMovers] = useState(1);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [createdBooking, setCreatedBooking] = useState<any>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  
  const [estimateDistance, setEstimateDistance] = useState(0);
  
  // AI Feature 2: Price Explainer state
  const [showPriceExplanation, setShowPriceExplanation] = useState(false);
  const [priceExplanation, setPriceExplanation] = useState("");
  
  /* ARCHIVED: AI Feature 3 - Photo Analysis state (Future Development)
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult | null>(null);
  const [analyzedPhotoUrl, setAnalyzedPhotoUrl] = useState<string | null>(null);
  */
  
  // Promo code state
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    valid: boolean;
    discountPercent: number;
    usesRemaining: number;
    message: string;
  } | null>(null);

  // Step 1 interactive map — fully imperative (no @react-google-maps/api component layer)
  const { isLoaded: mapsIsLoaded, loadMaps } = useGoogleMaps();
  const step1MapDivRef = useRef<HTMLDivElement | null>(null);
  const step1MapInstanceRef = useRef<google.maps.Map | null>(null);
  const step1DirRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const step1DirServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const step1LastAddressesRef = useRef<string>("");
  const step1PickupMarkerRef = useRef<google.maps.Marker | null>(null);
  const step1DropoffMarkerRef = useRef<google.maps.Marker | null>(null);
  const step1AnimPolylineRef = useRef<google.maps.Polyline | null>(null);
  const step1AnimIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live Pricing state
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>({
    baseFee: 0,
    distanceFee: 0,
    distanceKm: 0,
    perKmRate: 0,
    loadFee: 0,
    loadSizeFee: 0,
    apartmentPremium: 0,
    moverTravelFee: 0,
    pickupDifficultyFee: 0,
    dropoffDifficultyFee: 0,
    heavyItemFee: 0,
    subtotal: 0,
    numberOfMoversMultiplier: 1,
    totalCost: 0,
  });
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  // Single mover warning state
  const [showSingleMoverWarning, setShowSingleMoverWarning] = useState(false);
  const [hasSingleMoverAcknowledgment, setHasSingleMoverAcknowledgment] = useState(false);
  
  // AI Product Identifier state
  const [isIdentifyingItems, setIsIdentifyingItems] = useState(false);
  const [identifiedItems, setIdentifiedItems] = useState<IdentifiedItem[]>([]);
  const [hasAutoAnalyzed, setHasAutoAnalyzed] = useState(false);
  const [aiDetectedVolume, setAiDetectedVolume] = useState<number | undefined>(undefined);
  
  // Field validation error states
  const [pickupAccessError, setPickupAccessError] = useState(false);
  const [dropoffAccessError, setDropoffAccessError] = useState(false);
  
  // Pre-selected mover from Browse Movers page
  const [preSelectedMoverId, setPreSelectedMoverId] = useState<string | null>(null);
  
  // Fetch pre-selected mover details
  const { data: selectedMover } = useQuery({
    queryKey: ['/api/movers', preSelectedMoverId],
    queryFn: async () => {
      if (!preSelectedMoverId) return null;
      const res = await fetch(`/api/movers/${preSelectedMoverId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!preSelectedMoverId,
  });
  
  // Use shared location context - no more separate location prompts!
  const { coords: geoCoords, permissionState: locationStatus, requestLocation: requestGeoLocation, isRequesting: isRequestingLocation } = useGeoLocation();
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  
  // Track if we're restoring from sessionStorage - prevents location dialog from showing during restoration
  const isRestoringRef = useRef(false);
  
  // Check on mount if we have pending booking data (synchronous check before effects run)
  // Try both localStorage and sessionStorage for maximum compatibility
  const hasPendingBooking = useRef(
    !!(localStorage.getItem('pendingBooking') || sessionStorage.getItem('pendingBooking'))
  );

  // Show location dialog only if permission not granted AND not already have coords from shared context
  useEffect(() => {
    // Skip if restoring a saved booking, or if we already have location
    if (hasPendingBooking.current || geoCoords || locationStatus === 'granted' || locationStatus === 'loading') {
      setShowLocationDialog(false);
      return;
    }
    
    // Only show dialog if permission is prompt or denied (and we don't have coords)
    if (locationStatus === 'prompt' || locationStatus === 'denied') {
      setShowLocationDialog(true);
    }
  }, [geoCoords, locationStatus]);

  // PERFORMANCE: Preload Payment page when user reaches step 2 for instant navigation
  useEffect(() => {
    if (step >= 2) {
      // Eagerly import the Payment page to warm up the bundle
      import("@/pages/Payment").catch(() => {
        // Silent fail - preloading is optional optimization
      });
    }
  }, [step]);

  // Track if we've already restored from sessionStorage to prevent double-restoration
  const hasRestoredRef = useRef(false);
  
  // Pre-fill form from URL query parameters (PRIORITY 1 - most reliable) or sessionStorage (after login)
  useEffect(() => {
    // Prevent double restoration on strict mode or fast re-renders
    if (hasRestoredRef.current) return;
    
    // PRIORITY 1: Check URL parameters FIRST (most reliable - survives any navigation)
    // Use BOTH searchString from wouter AND window.location.search as fallback
    const wouterParams = new URLSearchParams(searchString);
    const windowParams = new URLSearchParams(window.location.search);
    
    // Use wouter params first, fall back to window.location.search
    const pickup = wouterParams.get('pickup') || windowParams.get('pickup');
    const dropoff = wouterParams.get('dropoff') || windowParams.get('dropoff');
    const preferredDate = wouterParams.get('date') || windowParams.get('date');
    const moverId = wouterParams.get('moverId') || windowParams.get('moverId');
    const pickupAccess = wouterParams.get('pickupAccess') || windowParams.get('pickupAccess');
    const dropoffAccess = wouterParams.get('dropoffAccess') || windowParams.get('dropoffAccess');
    const urlLoadSize = wouterParams.get('loadSize') || windowParams.get('loadSize');
    const resumeStepParam = wouterParams.get('resumeStep') || windowParams.get('resumeStep');
    const abandonedId = wouterParams.get('abandonedId') || windowParams.get('abandonedId');

    console.log('[RequestMove] URL params check:', {
      wouterSearch: searchString,
      windowSearch: window.location.search,
      pickup, dropoff, moverId, pickupAccess, dropoffAccess, urlLoadSize, resumeStepParam, abandonedId
    });

    // PRIORITY 0: Fetch abandoned booking data from server if abandonedId is provided
    if (abandonedId && !pickup && !dropoff) {
      console.log('[RequestMove] Fetching abandoned booking data:', abandonedId);
      hasRestoredRef.current = true;
      
      fetch(`/api/abandoned-bookings/${abandonedId}`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            console.log('[RequestMove] Restored from abandoned booking:', data);
            if (data.pickupAddress) setPickupAddress(data.pickupAddress);
            if (data.dropoffAddress) setDropoffAddress(data.dropoffAddress);
            if (data.loadSize) setLoadSize(data.loadSize);
            if (data.selectedMoverId) setPreSelectedMoverId(data.selectedMoverId);
            
            const resumeStep = data.lastStep || 2;
            setStep(resumeStep > 1 ? resumeStep : 2);
            
            // Store the abandonedId for recovery marking later
            abandonedBookingRef.current = abandonedId;
            
            toast({
              title: "Welcome Back!",
              description: "We restored your saved booking. Pick up where you left off!",
            });
            
            // Clean up URL
            window.history.replaceState({}, '', '/request-move' + (data.selectedMoverId ? `?moverId=${data.selectedMoverId}` : ''));
          }
        })
        .catch(err => {
          console.log('[RequestMove] Failed to fetch abandoned booking:', err);
        });
      return;
    }

    // Check if this is a return from login with full booking data (URL params)
    const isReturningFromLogin = !!(pickup && dropoff && resumeStepParam);
    
    if (isReturningFromLogin) {
      console.log('[RequestMove] Restoring from URL params (returned from login)');
      hasRestoredRef.current = true;
      
      setPickupAddress(pickup);
      setDropoffAddress(dropoff);
      if (pickupAccess) setPickupDifficulty(pickupAccess);
      if (dropoffAccess) setDropoffDifficulty(dropoffAccess);
      if (urlLoadSize) setLoadSize(urlLoadSize);
      if (moverId) setPreSelectedMoverId(moverId);
      
      const resumeStep = parseInt(resumeStepParam) || 2;
      setStep(resumeStep);
      
      // Also clear any drafts from storage to avoid confusion
      clearDraft(moverId);
      
      toast({
        title: "Welcome Back!",
        description: "Your booking details have been restored. You can now complete your request.",
      });
      
      // Clean up URL params after restoration (keep only moverId)
      window.history.replaceState({}, '', '/request-move' + (moverId ? `?moverId=${moverId}` : ''));
      return;
    }

    // PRIORITY 2: Check sessionStorage draft using bookingDraft module
    const draft = loadDraft(moverId);
    if (draft) {
      console.log('[RequestMove] Restoring from bookingDraft module');
      hasRestoredRef.current = true;
      isRestoringRef.current = true;
      
      const data = draft.formData;
      setPickupAddress(data.pickupAddress || "");
      setDropoffAddress(data.dropoffAddress || "");
      setPickupDifficulty(data.pickupDifficulty || "");
      setDropoffDifficulty(data.dropoffDifficulty || "");
      setLoadSize(data.loadSize || "medium");
      setHeavyItem(data.heavyItem || false);
      setNumberOfMovers(data.numberOfMovers || 1);
      setDescription(data.description || "");
      setImages(data.images || []);
      setDate(data.date || "");
      
      if (draft.moverId) {
        setPreSelectedMoverId(draft.moverId);
      }
      
      // Resume at step 2 if they had entered data but no photos
      const resumeStep = data.images && data.images.length > 0 && data.date ? 3 : 2;
      setStep(resumeStep);
      
      // Clear the draft after restoration
      clearDraft(draft.moverId);
      
      setTimeout(() => {
        hasPendingBooking.current = false;
        isRestoringRef.current = false;
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 100);
      
      toast({
        title: "Welcome Back!",
        description: "Your booking details have been restored. You can now complete your request.",
      });
      return;
    }

    // Simple pre-fill from hero or Browse Movers (no resumeStep param)
    if (pickup) {
      setPickupAddress(pickup);
    }
    if (dropoff) {
      setDropoffAddress(dropoff);
    }
    if (preferredDate) {
      setDate(preferredDate);
    }
    if (moverId) {
      setPreSelectedMoverId(moverId);
    }

    // Show a toast if data was pre-filled from hero
    if (pickup && dropoff) {
      toast({
        title: "Quote Form Pre-filled",
        description: "Your addresses have been loaded. Complete the details below to request your move.",
      });
    }
  }, [toast, searchString]);

  const createBookingMutation = useMutation({
    mutationFn: async (bookingData: any) => {
      const res = await apiRequest("POST", "/api/bookings", bookingData);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to create booking. Please try again.');
      }
      return data;
    },
    onSuccess: (data) => {
      setCreatedBooking(data);
      setShowSuccessDialog(true);
      // Invalidate bookings cache so My Bookings page shows the new booking immediately
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Booking Failed",
        description: error.message || "We couldn't process your booking. Please check your details and try again.",
        variant: "destructive",
      });
    },
  });


  // Load Google Maps API on mount (for Step 1 map)
  useEffect(() => {
    loadMaps();
  }, [loadMaps]);

  // Tracks whether the map div is currently in the DOM (drives the init effect)
  const [step1DivReady, setStep1DivReady] = useState(false);

  // Stable ref callback — sets the div ref and flips the ready flag
  const mapDivRefCallback = useCallback((node: HTMLDivElement | null) => {
    step1MapDivRef.current = node;
    if (!node) {
      // Cleanup markers and reset all refs so map is created fresh on next mount
      step1PickupMarkerRef.current?.setMap(null);
      step1DropoffMarkerRef.current?.setMap(null);
      step1PickupMarkerRef.current = null;
      step1DropoffMarkerRef.current = null;
      if (step1AnimIntervalRef.current) { clearInterval(step1AnimIntervalRef.current); step1AnimIntervalRef.current = null; }
      step1AnimPolylineRef.current?.setMap(null);
      step1AnimPolylineRef.current = null;
      step1MapInstanceRef.current = null;
      step1DirRendererRef.current = null;
      step1DirServiceRef.current = null;
      step1LastAddressesRef.current = "";
      setStep1DivReady(false);
    } else {
      setStep1DivReady(true);
    }
  }, []);

  // Create the map once both the API and the div are ready.
  // This effect uses a fresh closure every render so it always sees the latest code.
  useEffect(() => {
    if (!mapsIsLoaded || !step1DivReady || !step1MapDivRef.current || step1MapInstanceRef.current) return;
    const node = step1MapDivRef.current;
    const map = new google.maps.Map(node, {
      center: CALGARY_CENTER,
      zoom: 11,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "cooperative",
      styles: BOOKING_MAP_STYLES,
    });
    step1MapInstanceRef.current = map;
    const renderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#2563eb", strokeWeight: 4, strokeOpacity: 0.9 },
    });
    renderer.setMap(map);
    step1DirRendererRef.current = renderer;
    step1DirServiceRef.current = new google.maps.DirectionsService();
  }, [mapsIsLoaded, step1DivReady]);

  // Calculate route and push to the imperative renderer whenever addresses change
  useEffect(() => {
    if (!mapsIsLoaded || !pickupAddress || !dropoffAddress) {
      // Clear the renderer when addresses are incomplete
      if (step1DirRendererRef.current && (!pickupAddress || !dropoffAddress)) {
        step1DirRendererRef.current.setDirections({ routes: [] } as unknown as google.maps.DirectionsResult);
      }
      return;
    }
    const key = `${pickupAddress}|||${dropoffAddress}`;
    if (step1LastAddressesRef.current === key) return;
    step1LastAddressesRef.current = key;

    // Wait for service ref to be ready (map init effect might not have run yet)
    const service = step1DirServiceRef.current;
    if (!service) return;

    service.route(
      { origin: pickupAddress, destination: dropoffAddress, travelMode: google.maps.TravelMode.DRIVING, region: "CA" },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result && step1DirRendererRef.current) {
          step1DirRendererRef.current.setDirections(result);

          const map = step1MapInstanceRef.current;
          if (map) {
            // Fit the map to show the full route
            const bounds = result.routes[0]?.bounds;
            if (bounds) {
              map.fitBounds(bounds, { top: 80, right: 80, bottom: 110, left: 80 });
              // After fitBounds settles, enforce a minimum zoom so short routes
              // are zoomed in enough to read street names and POI labels.
              google.maps.event.addListenerOnce(map, "idle", () => {
                const distM = result.routes[0]?.legs[0]?.distance?.value ?? 0;
                const minZoom =
                  distM < 1500 ? 15 :   // < 1.5 km  → neighbourhood zoom
                  distM < 4000 ? 14 :   // < 4 km    → suburb zoom
                  distM < 9000 ? 13 :   // < 9 km    → city-district zoom
                  12;                    // longer    → city-wide view
                const current = map.getZoom() ?? 0;
                if (current < minZoom) map.setZoom(minZoom);
              });
            }

            // ── Flowing dash animation over the route ──────────────────────
            // Clear any previous animation before drawing a new one
            if (step1AnimIntervalRef.current) {
              clearInterval(step1AnimIntervalRef.current);
              step1AnimIntervalRef.current = null;
            }
            step1AnimPolylineRef.current?.setMap(null);
            step1AnimPolylineRef.current = null;

            const routePath = result.routes[0]?.overview_path ?? [];
            if (routePath.length > 0) {
              // Invisible stroke so only the dashes show — white dashes over the blue base line
              const animLine = new google.maps.Polyline({
                path: routePath,
                strokeOpacity: 0,
                icons: [{
                  icon: {
                    path: "M 0,-1 0,1",
                    strokeOpacity: 0.55,
                    strokeColor: "#ffffff",
                    strokeWeight: 2,
                    scale: 3,
                  },
                  offset: "0%",
                  repeat: "18px",
                }],
                map,
                zIndex: 5,
              });
              step1AnimPolylineRef.current = animLine;

              // Animate: increment the offset each tick → dashes flow forward
              let tick = 0;
              step1AnimIntervalRef.current = setInterval(() => {
                tick = (tick + 1) % 200;
                const icons = animLine.get("icons");
                icons[0].offset = (tick / 2) + "%";
                animLine.set("icons", icons);
              }, 60);
            }
            // ──────────────────────────────────────────────────────────────

            const leg = result.routes[0]?.legs[0];
            if (leg) {
              // Remove old custom markers
              step1PickupMarkerRef.current?.setMap(null);
              step1DropoffMarkerRef.current?.setMap(null);

              // Pickup — branded green marker chip
              step1PickupMarkerRef.current = new google.maps.Marker({
                position: leg.start_location,
                map,
                icon: makeRouteMarkerIcon("Pickup", "#16a34a", "#16a34a", "#ffffff"),
                title: pickupAddress,
                zIndex: 10,
              });

              // Dropoff — branded dark marker chip
              step1DropoffMarkerRef.current = new google.maps.Marker({
                position: leg.end_location,
                map,
                icon: makeRouteMarkerIcon("Dropoff", "#111827", "#111827", "#ffffff"),
                title: dropoffAddress,
                zIndex: 10,
              });
            }
          }
        }
      }
    );
  }, [mapsIsLoaded, pickupAddress, dropoffAddress]);

  // Calculate real distance estimate when addresses change using geocoding
  useEffect(() => {
    const calculateDistance = async () => {
      if (pickupAddress && dropoffAddress) {
        setIsCalculatingPrice(true);
        setPricingError(null);
        try {
          // Use the backend geocoding API to calculate real distance
          const response = await fetch('/api/geocode/distance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pickupAddress,
              dropoffAddress
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            setEstimateDistance(data.distance);
          } else {
            // Fallback to estimated distance if geocoding fails
            setEstimateDistance(10);
            setPricingError("Using estimated distance - geocoding unavailable");
          }
        } catch (error) {
          // Fallback to estimated distance on error
          setEstimateDistance(10);
          setPricingError("Using estimated distance - geocoding unavailable");
        } finally {
          setIsCalculatingPrice(false);
        }
      } else {
        setPriceBreakdown(null);
        setEstimateDistance(0);
      }
    };
    
    calculateDistance();
  }, [pickupAddress, dropoffAddress]);
  
  // Calculate live pricing whenever form fields change
  useEffect(() => {
    if (estimateDistance > 0 && pickupAddress && dropoffAddress) {
      try {
        const breakdown = calculatePrice(
          estimateDistance,
          loadSize as 'boxes' | 'medium' | 'large' | 'apartment',
          pickupDifficulty as PickupDifficultyType,
          dropoffDifficulty as DropoffDifficultyType,
          heavyItem,
          numberOfMovers as 1 | 2,
          undefined,
          aiDetectedVolume
        );
        if (step === 1) {
          const step1Preview: PriceBreakdown = {
            baseFee: 0,
            distanceFee: 0,
            distanceKm: breakdown.distanceKm,
            perKmRate: 0,
            loadFee: 0,
            loadSizeFee: 0,
            apartmentPremium: 0,
            moverTravelFee: 0,
            pickupDifficultyFee: 0,
            dropoffDifficultyFee: 0,
            heavyItemFee: 0,
            subtotal: 0,
            numberOfMoversMultiplier: 1,
            totalCost: 0,
          };
          setPriceBreakdown(step1Preview);
        } else {
          setPriceBreakdown(breakdown);
        }
        setPricingError(null);
      } catch (error) {
        console.error('Pricing calculation error:', error);
        setPricingError("Error calculating price");
      }
    } else {
      setPriceBreakdown({
        baseFee: 0,
        distanceFee: 0,
        distanceKm: 0,
        perKmRate: 0,
        loadFee: 0,
        loadSizeFee: 0,
        apartmentPremium: 0,
        moverTravelFee: 0,
        pickupDifficultyFee: 0,
        dropoffDifficultyFee: 0,
        heavyItemFee: 0,
        subtotal: 0,
        numberOfMoversMultiplier: 1,
        totalCost: 0,
      });
    }
  }, [step, estimateDistance, loadSize, pickupDifficulty, dropoffDifficulty, heavyItem, numberOfMovers, pickupAddress, dropoffAddress, aiDetectedVolume]);

  // Show warning when user selects 1 mover for items that require 2 movers
  useEffect(() => {
    const needsTwoMovers = requiresTwoMovers(loadSize, heavyItem);
    
    // Reset acknowledgment if customer switches to 2 movers or conditions change
    if (numberOfMovers === 2 || !needsTwoMovers) {
      setHasSingleMoverAcknowledgment(false);
    }
    
    // Show warning when selecting 1 mover for heavy loads without prior acknowledgment
    if (numberOfMovers === 1 && needsTwoMovers && !hasSingleMoverAcknowledgment) {
      setShowSingleMoverWarning(true);
    }
  }, [numberOfMovers, loadSize, heavyItem, hasSingleMoverAcknowledgment]);

  // AI Feature 2: Generate price explanation when booking is created
  useEffect(() => {
    if (createdBooking) {
      const explanation = generatePriceExplanation({
        baseFee: parseFloat(createdBooking.baseFee),
        distanceFee: parseFloat(createdBooking.distanceFee),
        loadFee: parseFloat(createdBooking.loadFee || "0"),
        pickupDifficultyFee: parseFloat(createdBooking.pickupDifficultyFee || "0"),
        dropoffDifficultyFee: parseFloat(createdBooking.dropoffDifficultyFee || "0"),
        heavyItemFee: parseFloat(createdBooking.heavyItemFee || "0"),
        moverTravelFee: parseFloat(createdBooking.moverTravelFee || "0"),
        subtotal: parseFloat(createdBooking.subtotal),
        numberOfMovers: createdBooking.numberOfMovers,
        finalTotal: parseFloat(createdBooking.price),
        distance: parseFloat(createdBooking.distance),
        loadSize: createdBooking.loadSize,
        pickupDifficulty: createdBooking.pickupDifficulty,
        dropoffDifficulty: createdBooking.dropoffDifficulty,
        heavyItem: createdBooking.heavyItem
      });
      setPriceExplanation(explanation);
    }
  }, [createdBooking]);

  // Abandoned Booking Tracking - Save to server when user leaves without completing
  const abandonedBookingRef = useRef<string | null>(null);
  useEffect(() => {
    // Only track if user has entered some booking data (step > 1)
    const hasEnteredData = step > 1 || pickupAddress || dropoffAddress;
    
    const saveAbandonedBooking = async () => {
      if (!hasEnteredData) return;
      
      // Don't save if booking was already created successfully
      if (createdBooking) return;
      
      try {
        const response = await fetch('/api/abandoned-bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            pickupAddress,
            dropoffAddress,
            loadSize,
            preferredDate: date,
            selectedMoverId: preSelectedMoverId,
            lastStep: step,
            email: user?.email,
            phone: user?.phone,
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          abandonedBookingRef.current = data.id;
        }
      } catch (error) {
        console.log('[Abandoned Booking] Failed to save:', error);
      }
    };
    
    // Save on visibility change (user switches tabs)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasEnteredData && !createdBooking) {
        saveAbandonedBooking();
      }
    };
    
    // Save on beforeunload (user closes tab)
    const handleBeforeUnload = () => {
      if (hasEnteredData && !createdBooking) {
        // Use navigator.sendBeacon with Blob for proper JSON content type
        const data = JSON.stringify({
          pickupAddress,
          dropoffAddress,
          loadSize,
          preferredDate: date,
          selectedMoverId: preSelectedMoverId,
          lastStep: step,
          email: user?.email,
          phone: user?.phone,
        });
        const blob = new Blob([data], { type: 'application/json' });
        navigator.sendBeacon('/api/abandoned-bookings', blob);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [step, pickupAddress, dropoffAddress, loadSize, date, preSelectedMoverId, user, createdBooking]);
  
  // Save AI-identified items to the database once the booking is created (runs once)
  const hasSavedItemsRef = useRef(false);
  useEffect(() => {
    if (createdBooking && identifiedItems.length > 0 && !hasSavedItemsRef.current) {
      const completedItems = identifiedItems.filter(item => item.processingStatus === 'completed' && item.itemName);
      if (completedItems.length > 0) {
        hasSavedItemsRef.current = true;
        apiRequest("POST", `/api/ai/items/${createdBooking.id}/save`, {
          items: completedItems.map(item => ({
            photoUrl: item.photoUrl,
            itemName: item.itemName,
            category: item.category,
            weightKg: item.weightKg,
            dimensionsLcm: item.dimensionsLcm,
            dimensionsWcm: item.dimensionsWcm,
            dimensionsHcm: item.dimensionsHcm,
            volumeCuft: item.volumeCuft,
            handlingComplexity: item.handlingComplexity,
            vehicleType: item.vehicleType,
            recommendedMovers: item.recommendedMovers,
            insuranceLevel: item.insuranceLevel,
            confidence: item.confidence,
            sourceMetadata: item.sourceMetadata,
          })),
        }).catch((err) => {
          console.log('[RequestMove] Failed to save AI items to booking:', err);
        });
      }
    }
  }, [createdBooking, identifiedItems]);

  // Mark abandoned booking as recovered when booking is created
  useEffect(() => {
    if (createdBooking && abandonedBookingRef.current) {
      fetch(`/api/abandoned-bookings/${abandonedBookingRef.current}/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bookingId: createdBooking.id }),
      }).catch(() => {
        // Silently fail - not critical
      });
    }
  }, [createdBooking]);

  /* ============================================================
     ARCHIVED: AI Photo Analysis Handler (Future Development)
     ============================================================
     This function handles photo upload and AI analysis for auto-filling load details.
     It has been archived for future development.
     To restore: Uncomment this function and the related UI section in Step 2.
  
  const handlePhotoAnalysis = async (file: File) => {
    setIsAnalyzingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);

      const response = await fetch('/api/ai/analyze-photo', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const result: PhotoAnalysisResult & { imageUrl: string } = await response.json();
      setPhotoAnalysis(result);
      setAnalyzedPhotoUrl(result.imageUrl);

      // Auto-fill form fields based on AI analysis
      setLoadSize(result.loadSize);
      setHeavyItem(result.heavyItem);
      setNumberOfMovers(result.recommendedMovers);

      toast({
        title: "AI Analysis Complete!",
        description: `Detected: ${result.itemType} - ${result.loadSize} load, ${result.heavyItem ? 'heavy item' : 'standard weight'}`,
      });
    } catch (error) {
      toast({
        title: "Analysis Failed",
        description: "Could not analyze photo. Please fill in details manually.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };
  ============================================================ */

  // AI Product Identifier - Identify items from uploaded photos
  // This function can be called manually or automatically after photo upload
  const handleIdentifyItems = async (photoUrls?: string[]) => {
    const urlsToAnalyze = photoUrls || images;
    
    if (urlsToAnalyze.length === 0) {
      toast({
        title: "No photos to analyze",
        description: "Please upload at least one photo first.",
        variant: "destructive",
      });
      return;
    }
    
    setIsIdentifyingItems(true);
    setIdentifiedItems([]);
    
    try {
      const response = await apiRequest("POST", "/api/ai/items/identify", {
        photoUrls: urlsToAnalyze,
      });
      
      if (!response.ok) {
        throw new Error('Unable to analyze photos. Please try again.');
      }
      
      const result = await response.json();
      const items = result.items || [];
      setIdentifiedItems(items);
      
      const completedItems = items.filter((item: IdentifiedItem) => item.processingStatus === 'completed');
      
      if (completedItems.length > 0) {
        // AUTO-APPLY AI recommendations based on total volume
        const totalVolume = completedItems.reduce((sum: number, item: IdentifiedItem) => 
          sum + parseFloat(item.volumeCuft || '0'), 0);
        setAiDetectedVolume(totalVolume);
        
        // Determine load size based on total volume thresholds (synced with shared/pricing.ts)
        // Boxes: 0-20 ft³, Medium: 21-165 ft³, Large: 166-300 ft³, Apartment: >300 ft³
        const loadSizeTiers = ['boxes', 'medium', 'large', 'apartment'] as const;
        const vehicleTiers = ['car', 'van', 'pickup', 'truck'] as const;
        let tierIndex = 0;
        if (totalVolume > 300) tierIndex = 3;
        else if (totalVolume > 165) tierIndex = 2;
        else if (totalVolume > 20) tierIndex = 1;
        
        // Get max recommended movers from all items
        const maxMovers = Math.max(...completedItems.map((item: IdentifiedItem) => item.recommendedMovers || 1));
        
        // Check for heavy/complex items
        const itemTotalWeight = completedItems.reduce((sum: number, item: IdentifiedItem) => sum + parseFloat(item.weightKg || '0'), 0);
        const hasHeavyItems = completedItems.some((item: IdentifiedItem) => 
          item.handlingComplexity === 'high' || 
          item.handlingComplexity === 'very_high' ||
          parseFloat(item.weightKg || '0') > 30
        );
        
        // WEIGHT OVERRIDE (matching server getVehicleRecommendationWithCategory):
        // >150kg → truck, >100kg → pickup, >50kg → van
        if (itemTotalWeight > 150 && tierIndex < 3) tierIndex = 3;
        else if (itemTotalWeight > 100 && tierIndex < 2) tierIndex = 2;
        else if (itemTotalWeight > 50 && tierIndex < 1) tierIndex = 1;
        
        // DIMENSION OVERRIDE: Check max dimension across all items
        const maxDimension = Math.max(...completedItems.map((item: IdentifiedItem) => {
          return Math.max(
            parseFloat(String(item.dimensionsLcm || 0)),
            parseFloat(String(item.dimensionsWcm || 0)),
            parseFloat(String(item.dimensionsHcm || 0))
          );
        }));
        if (maxDimension > 200 && tierIndex < 2) tierIndex = 2;
        else if (maxDimension > 150 && tierIndex < 1) tierIndex = 1;
        if (hasHeavyItems && tierIndex < 1) tierIndex = 1;
        
        const recommendedLoadSize = loadSizeTiers[tierIndex];
        const recommendedVehicle = vehicleTiers[tierIndex];
        
        // Auto-apply all recommendations
        setLoadSize(recommendedLoadSize);
        setNumberOfMovers(maxMovers > 1 ? 2 : 1);
        setHeavyItem(hasHeavyItems);
        setHasAutoAnalyzed(true);
        
        toast({
          title: "AI Auto-Applied Recommendations!",
          description: `Total: ${totalVolume.toFixed(1)} ft³ → ${capitalizeFirst(recommendedLoadSize)} load (${recommendedVehicle}), ${maxMovers} mover${maxMovers !== 1 ? 's' : ''}${hasHeavyItems ? ', Heavy items' : ''}`,
        });
      } else {
        toast({
          title: "Identification Complete",
          description: "AI could not identify items. Please select load details manually.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Analysis Unavailable",
        description: "We couldn't analyze your photos right now. Please select your load details manually below.",
        variant: "destructive",
      });
    } finally {
      setIsIdentifyingItems(false);
    }
  };
  
  // Auto-analyze callback for ImageUpload - runs in background after photo upload
  const handleAutoAnalyze = (photoUrls: string[]) => {
    handleIdentifyItems(photoUrls);
  };

  // Apply AI recommendations to booking form
  const handleApplyAIRecommendations = () => {
    const completedItems = identifiedItems.filter(item => item.processingStatus === 'completed');
    if (completedItems.length === 0) return;
    
    // Calculate total volume and determine load size (synced with shared/pricing.ts)
    // Boxes: 0-20 ft³, Medium: 21-165 ft³, Large: 166-300 ft³, Apartment: >300 ft³
    const totalVolume = completedItems.reduce((sum, item) => sum + parseFloat(item.volumeCuft || '0'), 0);
    setAiDetectedVolume(totalVolume);
    const loadSizeTiers = ['boxes', 'medium', 'large', 'apartment'] as const;
    let tierIndex = 0;
    if (totalVolume > 300) tierIndex = 3;
    else if (totalVolume > 165) tierIndex = 2;
    else if (totalVolume > 20) tierIndex = 1;
    
    // Get max recommended movers
    const maxMovers = Math.max(...completedItems.map(item => item.recommendedMovers || 1));
    
    // Check for heavy/complex items
    const itemTotalWeight = completedItems.reduce((sum, item) => sum + parseFloat(item.weightKg || '0'), 0);
    const hasHeavyItems = completedItems.some(item => 
      item.handlingComplexity === 'high' || 
      item.handlingComplexity === 'very_high' ||
      parseFloat(item.weightKg || '0') > 30
    );
    
    // WEIGHT OVERRIDE (matching server getVehicleRecommendationWithCategory):
    // >150kg → truck, >100kg → pickup, >50kg → van
    if (itemTotalWeight > 150 && tierIndex < 3) tierIndex = 3;
    else if (itemTotalWeight > 100 && tierIndex < 2) tierIndex = 2;
    else if (itemTotalWeight > 50 && tierIndex < 1) tierIndex = 1;
    
    // DIMENSION OVERRIDE: Check max dimension across all items
    const maxDimRecalc = Math.max(...completedItems.map(item => {
      return Math.max(
        parseFloat(String(item.dimensionsLcm || 0)),
        parseFloat(String(item.dimensionsWcm || 0)),
        parseFloat(String(item.dimensionsHcm || 0))
      );
    }));
    if (maxDimRecalc > 200 && tierIndex < 2) tierIndex = 2;
    else if (maxDimRecalc > 150 && tierIndex < 1) tierIndex = 1;
    if (hasHeavyItems && tierIndex < 1) tierIndex = 1;
    
    const recommendedLoadSize = loadSizeTiers[tierIndex];
    
    // Apply recommendations
    setLoadSize(recommendedLoadSize);
    setNumberOfMovers(maxMovers > 1 ? 2 : 1);
    setHeavyItem(hasHeavyItems);
    
    toast({
      title: "Recommendations Applied!",
      description: `Load size: ${capitalizeFirst(recommendedLoadSize)}, ${maxMovers} mover${maxMovers !== 1 ? 's' : ''}, Heavy items: ${hasHeavyItems ? 'Yes' : 'No'}`,
    });
  };

  const handleNext = () => {
    // DEBUG: Show current state when Next is clicked
    console.log('[RequestMove] handleNext called:', {
      currentStep: step,
      hasUser: !!user,
      userId: user?.id,
      hasImages: images?.length || 0,
      pickupAddress,
      dropoffAddress,
      preSelectedMoverId
    });
    
    // Step 1: Validate addresses (MANDATORY)
    if (step === 1) {
      if (!pickupAddress || pickupAddress.trim() === "") {
        toast({
          title: "Pickup address required",
          description: "Please enter a valid pickup address to continue.",
          variant: "destructive",
        });
        return;
      }
      if (!dropoffAddress || dropoffAddress.trim() === "") {
        toast({
          title: "Dropoff address required",
          description: "Please enter a valid dropoff address to continue.",
          variant: "destructive",
        });
        return;
      }
      // Both addresses must be different
      if (pickupAddress.trim().toLowerCase() === dropoffAddress.trim().toLowerCase()) {
        toast({
          title: "Invalid addresses",
          description: "Pickup and dropoff addresses must be different.",
          variant: "destructive",
        });
        return;
      }
      // Access types are mandatory
      let hasAccessError = false;
      if (!pickupDifficulty) {
        setPickupAccessError(true);
        hasAccessError = true;
      }
      if (!dropoffDifficulty) {
        setDropoffAccessError(true);
        hasAccessError = true;
      }
      if (hasAccessError) {
        toast({
          title: "Access type required",
          description: "Please select access type for both pickup and dropoff locations.",
          variant: "destructive",
        });
        return;
      }
    }

    // Step 2: Validate photos (MANDATORY)
    if (step === 2) {
      console.log('[RequestMove] Step 2 validation - checking photos:', {
        images,
        imageCount: images?.length || 0,
        user: !!user
      });
      
      if (!images || images.length === 0) {
        // For unauthenticated users, save data and redirect to login
        // They can upload photos after logging in
        if (!user) {
          console.log('[RequestMove] No user detected - saving data and redirecting to login');
          toast({
            title: "Login Required",
            description: "Please log in to upload photos and complete your booking.",
            variant: "destructive",
          });
          
          // Save current progress using bookingDraft module
          const draftData: BookingDraftData = {
            pickupAddress,
            dropoffAddress,
            pickupDifficulty,
            dropoffDifficulty,
            loadSize,
            heavyItem,
            numberOfMovers,
            description,
            images: [],
            date: ""
          };
          saveDraft(preSelectedMoverId, draftData);
          
          // Build redirect URL with essential data encoded (survives storage clearing)
          const params = new URLSearchParams();
          if (preSelectedMoverId) params.set('moverId', preSelectedMoverId);
          params.set('pickup', pickupAddress);
          params.set('dropoff', dropoffAddress);
          params.set('pickupAccess', pickupDifficulty || '');
          params.set('dropoffAccess', dropoffDifficulty || '');
          params.set('loadSize', loadSize);
          params.set('resumeStep', '2');
          const returnPath = `/request-move?${params.toString()}`;
          console.log('[RequestMove] Redirecting to login with return path:', returnPath);
          setLocation(`/login?redirect=${encodeURIComponent(returnPath)}`);
          return;
        }
        
        toast({
          title: "Photos required",
          description: "Please upload at least one photo of your items to continue.",
          variant: "destructive",
        });
        return;
      }
    }

    if (step < 3) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      console.log('[RequestMove] handleNext on Step 3 - checking conditions:', {
        step,
        date,
        user: !!user,
        userId: user?.id
      });
      
      // Validate date before submission
      if (!date) {
        console.log('[RequestMove] Date validation failed');
        toast({
          title: "Date required",
          description: "Please select a preferred date and time.",
          variant: "destructive",
        });
        return;
      }

      // Check authentication before allowing booking submission
      if (!user) {
        toast({
          title: "Login Required",
          description: "Please log in or sign up to complete your booking request.",
          variant: "destructive",
        });
        // Store current form data in sessionStorage so user can resume after login
        const pendingData = {
          pickupAddress,
          dropoffAddress,
          pickupDifficulty,
          dropoffDifficulty,
          loadSize,
          heavyItem,
          numberOfMovers,
          description,
          images,
          date,
          preSelectedMoverId: preSelectedMoverId || null
        };
        console.log('[RequestMove] Saving pending booking:', pendingData);
        localStorage.setItem('pendingBooking', JSON.stringify(pendingData));
        // Verify it was saved
        console.log('[RequestMove] Verified saved:', localStorage.getItem('pendingBooking'));
        // Redirect to login with return path (include moverId if selected)
        const returnPath = preSelectedMoverId 
          ? `/request-move?moverId=${preSelectedMoverId}`
          : '/request-move';
        setLocation(`/login?redirect=${encodeURIComponent(returnPath)}`);
        return;
      }

      // Check if acknowledgment is required for current booking state
      const needsAcknowledgment = numberOfMovers === 1 && requiresTwoMovers(loadSize, heavyItem);
      
      // Block submission if acknowledgment is required but not provided
      if (needsAcknowledgment && !hasSingleMoverAcknowledgment) {
        toast({
          variant: "destructive",
          title: "Acknowledgment Required",
          description: "Please acknowledge the single mover policy for heavy items before proceeding."
        });
        // Warning dialog should already be visible via useEffect
        return;
      }
      
      // Create the booking - backend will calculate distance and price
      const bookingData = {
        customerId: user.id,
        pickupAddress,
        dropoffAddress,
        pickupDifficulty,
        dropoffDifficulty,
        loadSize,
        heavyItem,
        numberOfMovers,
        acknowledgedSingleMoverPolicy: needsAcknowledgment && hasSingleMoverAcknowledgment,
        description: description || null,
        images: images.length > 0 ? images : null,
        preferredDate: new Date(date).toISOString(),
        preSelectedMoverId: preSelectedMoverId || undefined,
        aiDetectedVolumeCuft: aiDetectedVolume || undefined,
        promoCode: appliedPromo?.code || undefined,
      };
      createBookingMutation.mutate(bookingData);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Request location permission
  const requestLocationPermission = () => {
    // Use the shared location context to request permission
    requestGeoLocation();
    setShowLocationDialog(false);
    toast({
      title: "Location Requested",
      description: "Please allow location access when prompted.",
    });
  };

  return (
    <>
      {/* Location Permission Dialog */}
      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-location-permission">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle>Enable Location Services</DialogTitle>
                <DialogDescription>
                  For the best booking experience
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We recommend enabling location to:
            </p>
            <ul className="text-sm space-y-2">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>Find movers nearest to you faster</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>Auto-fill your pickup address</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>Get accurate distance and pricing</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>Track your mover in real-time</span>
              </li>
            </ul>
            
            {locationStatus === 'denied' && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Location is blocked. Please enable it in your browser settings for the best experience.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setShowLocationDialog(false)}
                data-testid="button-skip-location"
              >
                Skip for Now
              </Button>
              <Button 
                className="flex-1"
                onClick={requestLocationPermission}
                disabled={locationStatus === 'denied'}
                data-testid="button-enable-location"
              >
                <MapPin className="w-4 h-4 mr-2" />
                Enable Location
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-2xl" data-testid="dialog-booking-success">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl">Booking Created!</DialogTitle>
                <DialogDescription>
                  Complete payment to notify nearby movers and get matched
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {createdBooking && (
            <div className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Distance</span>
                  </div>
                  <span className="font-semibold" data-testid="text-calculated-distance">
                    {parseFloat(createdBooking.distance).toFixed(2)} km
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Load Size</span>
                  </div>
                  <span className="font-semibold capitalize">{createdBooking.loadSize}</span>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Price Breakdown
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base Fee</span>
                    <span className="font-medium" data-testid="text-base-fee">
                      ${parseFloat(createdBooking.baseFee).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Distance Fee ({parseFloat(createdBooking.distance).toFixed(2)} km × $1.00/km)
                    </span>
                    <span className="font-medium" data-testid="text-distance-fee">
                      ${parseFloat(createdBooking.distanceFee).toFixed(2)}
                    </span>
                  </div>
                  {parseFloat(createdBooking.loadFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Load Size Fee ({createdBooking.loadSize})</span>
                      <span className="font-medium" data-testid="text-load-fee">
                        ${parseFloat(createdBooking.loadFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(createdBooking.pickupDifficultyFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pickup Difficulty Fee</span>
                      <span className="font-medium" data-testid="text-pickup-difficulty-fee">
                        ${parseFloat(createdBooking.pickupDifficultyFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(createdBooking.dropoffDifficultyFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dropoff Difficulty Fee</span>
                      <span className="font-medium" data-testid="text-dropoff-difficulty-fee">
                        ${parseFloat(createdBooking.dropoffDifficultyFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(createdBooking.heavyItemFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Heavy Item Fee</span>
                      <span className="font-medium" data-testid="text-heavy-item-fee">
                        ${parseFloat(createdBooking.heavyItemFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {parseFloat(createdBooking.moverTravelFee || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mover Travel Fee</span>
                      <span className="font-medium" data-testid="text-mover-travel-fee">
                        ${parseFloat(createdBooking.moverTravelFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {createdBooking.numberOfMovers === 2 && (
                    <div className="flex justify-between text-primary">
                      <span className="font-medium">2-Movers Fee (×1.30)</span>
                      <span className="font-medium">Applied</span>
                    </div>
                  )}
                  <div className="h-px bg-border my-2" />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total Price</span>
                    <span className="text-primary" data-testid="text-total-price">
                      ${parseFloat(createdBooking.price).toFixed(2)} CAD
                    </span>
                  </div>
                </div>
                
                {/* AI Feature 2: Price Explanation Button - ARCHIVED */}
                {AI_FEATURES.PRICE_BREAKDOWN_EXPLAINER && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setShowPriceExplanation(!showPriceExplanation)}
                      className="w-full mt-3"
                      data-testid="button-ai-explain-price"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {showPriceExplanation ? "Hide" : "AI Explain My Price"}
                    </Button>
                    
                    {showPriceExplanation && priceExplanation && (
                      <div className="mt-3 p-4 bg-accent/10 border border-accent/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="w-4 h-4 text-accent-foreground" />
                          <h4 className="font-semibold text-sm">AI Price Explanation</h4>
                        </div>
                        <div className="text-sm whitespace-pre-line text-muted-foreground">
                          {priceExplanation}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                <p className="text-sm text-orange-600 font-medium">
                  Complete payment now to notify movers. After payment, movers have 10 minutes to accept your job!
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSuccessDialog(false);
                    setLocation("/my-bookings");
                  }}
                  className="flex-1"
                  data-testid="button-view-bookings"
                >
                  Pay Later
                </Button>
                <Button
                  onClick={() => {
                    setShowSuccessDialog(false);
                    setLocation(`/payment/${createdBooking.id}`);
                  }}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  data-testid="button-proceed-payment"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Proceed to Payment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sticky Progress Bar (Mobile) */}
      <div className="fixed top-16 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-b md:hidden" data-testid="sticky-progress-bar">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Step {step} of 3</span>
            <span className="text-xs text-muted-foreground">
              {step === 1 && "Locations"}
              {step === 2 && "Load Details"}
              {step === 3 && "Schedule"}
            </span>
          </div>
          <Progress value={(step / 3) * 100} className="h-2" />
        </div>
      </div>

      <div className="min-h-screen pt-20 pb-12 bg-background">
        <div className={step === 1 ? "w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8" : "max-w-4xl mx-auto px-4 sm:px-6"}>
        {/* Mobile spacer — clears both the fixed header (64px via pt-20 on parent)
            and the sticky progress bar (fixed at top-16, ~60px tall → ends ~124px).
            pt-20 = 80px, so we need 44px more to reach 124px.
            Step 1: map is first element → use tight 44px spacer so map sits
                    flush below the progress bar with no extra blank band.
            Steps 2+: page header content follows the spacer and fills the gap
                      naturally, so the full h-16 (64px) is fine. */}
        <div className={step === 1 ? "h-[44px] md:hidden" : "h-16 md:hidden"} />

        {/* Page Header — hidden on mobile step 1 (map is the hero element there) */}
        <div className={step === 1 ? "py-4 mb-4 hidden md:block" : "py-6 mb-2"}>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Request a Move</h1>
          <p className="text-muted-foreground text-sm">Tell us what you need moved</p>
        </div>

        {/* Desktop Step Indicator - hidden on mobile */}
        <div className="mb-6 hidden md:block">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((stepNum) => (
              <div key={stepNum} className="flex items-center flex-1">
                <div
                  className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold ${
                    step >= stepNum ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`step-indicator-${stepNum}`}
                >
                  {stepNum}
                </div>
                {stepNum < 3 && (
                  <div className={`flex-1 h-0.5 mx-2 ${step > stepNum ? "bg-primary" : "bg-muted"}`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span className={step >= 1 ? "font-semibold text-foreground" : ""}>Locations</span>
            <span className={step >= 2 ? "font-semibold text-foreground" : ""}>Load Details</span>
            <span className={step >= 3 ? "font-semibold text-foreground" : ""}>Schedule</span>
          </div>
        </div>

        {/* ── STEP 1: Premium two-column layout ── */}
        <div className={step === 1
          ? "flex flex-col lg:grid lg:grid-cols-[420px_1fr] lg:gap-6 lg:items-stretch"
          : "grid gap-6"
        }>
          {/* Map panel — mobile: stacked above form · desktop: fills right column */}
          {step === 1 && (
            <div className="relative order-first lg:order-last rounded-2xl overflow-hidden h-[52vh] lg:h-[calc(100vh-200px)] lg:max-h-[700px] lg:sticky lg:top-20 bg-muted/40 mb-0 lg:mb-0 shadow-sm">
              <div ref={mapDivRefCallback} className="absolute inset-0" />
              {!mapsIsLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/60 backdrop-blur-sm">
                  <div className="text-center text-muted-foreground">
                    <MapPin className="w-7 h-7 mx-auto mb-2 opacity-30" />
                    <p className="text-xs tracking-wide uppercase font-medium">Loading map…</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Main Form */}
          <div className={step === 1 ? "order-last lg:order-first lg:flex lg:flex-col" : ""}>
            <Card className={step === 1 ? "shadow-sm lg:flex lg:flex-col lg:h-full" : ""}>
              <CardHeader className="pb-4">
                <h2 className={step === 1 ? "text-xl font-bold tracking-tight" : "text-2xl font-bold"}>
                  {step === 1 && "Where is your move?"}
                  {step === 2 && "Step 2: Load Details"}
                  {step === 3 && "Step 3: Schedule & Details"}
                </h2>
                {step === 1 && (
                  <p className="text-sm text-muted-foreground">Set pickup and dropoff locations</p>
                )}
              </CardHeader>
              <CardContent className={step === 1 ? "flex flex-col flex-1 gap-5" : "space-y-6"}>
                {/* Selected Mover Display */}
                {selectedMover && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-4" data-testid="selected-mover-card">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-12 h-12">
                          <AvatarImage src={selectedMover.moverImage} alt={selectedMover.user?.name} />
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {selectedMover.user?.name?.charAt(0)?.toUpperCase() || 'M'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold" data-testid="text-selected-mover-name">
                              {selectedMover.user?.name || 'Selected Mover'}
                            </span>
                            <div className="flex items-center text-sm text-muted-foreground">
                              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 mr-0.5" />
                              {parseFloat(selectedMover.rating || '0').toFixed(1)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Truck className="w-3.5 h-3.5" />
                            <span className="capitalize">{selectedMover.vehicleType || 'Vehicle'}</span>
                            <span>•</span>
                            <span>{selectedMover.totalMoves || 0} moves completed</span>
                          </div>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => setPreSelectedMoverId(null)}
                        className="text-muted-foreground hover:text-destructive"
                        data-testid="button-remove-mover"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      This mover will be directly assigned after payment. <a href="/browse-movers" className="text-primary underline">Change mover</a>
                    </p>
                  </div>
                )}
                
                {step === 1 && (
                  <>
                    {/* Route location selector — clean stacked layout */}
                    <div className="space-y-0">

                      {/* ── Pickup ── */}
                      <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-green-500/20 flex-shrink-0" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pickup</span>
                        </div>
                        <CustomAddressInput
                          id="pickup"
                          placeholder="Enter pickup address in Calgary"
                          value={pickupAddress}
                          onChange={(address) => setPickupAddress(address)}
                          data-testid="input-pickup-address"
                        />
                        <Select value={pickupDifficulty} onValueChange={(val) => { setPickupDifficulty(val); setPickupAccessError(false); }}>
                          <SelectTrigger
                            id="pickup-difficulty"
                            className={`bg-background ${pickupAccessError ? 'border-destructive ring-1 ring-destructive' : ''}`}
                            data-testid="select-pickup-difficulty"
                          >
                            <SelectValue placeholder="Access type (stairs, elevator…)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ground">Ground Floor <span className="text-green-600 ml-2 text-xs">Free</span></SelectItem>
                            <SelectItem value="basement">Basement <span className="text-muted-foreground ml-2 text-xs">+$12</span></SelectItem>
                            <SelectItem value="stairs">Stairs <span className="text-muted-foreground ml-2 text-xs">+$6</span></SelectItem>
                            <SelectItem value="elevator">Elevator Available <span className="text-muted-foreground ml-2 text-xs">+$9.60</span></SelectItem>
                          </SelectContent>
                        </Select>
                        {pickupAccessError && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />Please select pickup access type
                          </p>
                        )}
                      </div>

                      {/* Connector line */}
                      <div className="flex justify-center py-0.5">
                        <div className="w-px h-5 bg-border" />
                      </div>

                      {/* ── Dropoff ── */}
                      <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm bg-primary flex-shrink-0" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dropoff</span>
                        </div>
                        <CustomAddressInput
                          id="dropoff"
                          placeholder="Enter dropoff address in Calgary"
                          value={dropoffAddress}
                          onChange={(address) => setDropoffAddress(address)}
                          data-testid="input-dropoff-address"
                        />
                        <Select value={dropoffDifficulty} onValueChange={(val) => { setDropoffDifficulty(val); setDropoffAccessError(false); }}>
                          <SelectTrigger
                            id="dropoff-difficulty"
                            className={`bg-background ${dropoffAccessError ? 'border-destructive ring-1 ring-destructive' : ''}`}
                            data-testid="select-dropoff-difficulty"
                          >
                            <SelectValue placeholder="Access type (stairs, elevator…)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ground">Ground Floor <span className="text-green-600 ml-2 text-xs">Free</span></SelectItem>
                            <SelectItem value="basement">Basement <span className="text-muted-foreground ml-2 text-xs">+$12</span></SelectItem>
                            <SelectItem value="stairs">Stairs <span className="text-muted-foreground ml-2 text-xs">+$6</span></SelectItem>
                            <SelectItem value="elevator">Elevator Available <span className="text-muted-foreground ml-2 text-xs">+$9.60</span></SelectItem>
                          </SelectContent>
                        </Select>
                        {dropoffAccessError && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />Please select dropoff access type
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Route summary strip — appears once route is calculated */}
                    {estimateDistance > 0 && (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15">
                        <Truck className="w-4 h-4 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{estimateDistance.toFixed(1)} km route</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {pickupAddress.split(",")[0]} → {dropoffAddress.split(",")[0]}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {step === 2 && (
                  <>
                    {/* ============================================================
                        ARCHIVED: Item Detection Feature (Future Development)
                        ============================================================
                        This section contains photo analysis that auto-fills load details.
                        It has been archived for future development.
                        To restore: Uncomment this section and the related handlePhotoAnalysis function.
                    
                    <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">Item Detection</h3>
                          <p className="text-sm text-muted-foreground">
                            Upload a photo and let AI auto-fill load details
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <input
                          ref={(el) => {
                            if (el) {
                              (window as any).__photoFileInput = el;
                            }
                          }}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoAnalysis(file);
                          }}
                          className="hidden"
                          disabled={isAnalyzingPhoto}
                          data-testid="input-photo-upload"
                        />
                        
                        <Button
                          type="button"
                          variant="default"
                          size="default"
                          className="w-full"
                          onClick={() => {
                            ((window as any).__photoFileInput as HTMLInputElement)?.click();
                          }}
                          disabled={isAnalyzingPhoto}
                          data-testid="button-choose-photo"
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          {analyzedPhotoUrl ? "Change Photo" : "Choose Photo"}
                        </Button>
                        
                        {isAnalyzingPhoto && (
                          <div className="flex items-center gap-2 text-sm text-primary">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>AI analyzing your item...</span>
                          </div>
                        )}
                        
                        {photoAnalysis && (
                          <Alert className="bg-primary/10 border-primary/30">
                            <Sparkles className="w-4 h-4" />
                            <AlertDescription>
                              <strong>AI detected:</strong> {photoAnalysis.itemType} •{" "}
                              {photoAnalysis.loadSize} load •{" "}
                              {photoAnalysis.heavyItem ? "Heavy" : "Standard"} •{" "}
                              {photoAnalysis.recommendedMovers} mover{photoAnalysis.recommendedMovers > 1 ? "s" : ""} recommended
                              <div className="text-xs mt-1 text-muted-foreground">
                                {photoAnalysis.explanation}
                              </div>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                    ============================================================ */}

                    <div>
                      <Label className="text-base font-semibold mb-2 block">
                        Upload Photos of Your Items
                      </Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        At least one photo required - Our AI will automatically analyze your items
                      </p>
                      <ImageUpload 
                        onImagesChange={setImages} 
                        onAnalyze={handleAutoAnalyze}
                        maxImages={10} 
                      />
                      
                      {/* Show analyzing status when AI is processing in background */}
                      {isIdentifyingItems && (
                        <div className="mt-4 bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-xl p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                              <Loader2 className="w-6 h-6 text-primary animate-spin" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-base">Analyzing Your Items...</h4>
                              <p className="text-sm text-muted-foreground">
                                AI is identifying items and calculating load requirements
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Show results after analysis completes */}
                      {!isIdentifyingItems && identifiedItems.length > 0 && (
                        <div className="mt-4">
                          <IdentifiedItemsList
                            items={identifiedItems}
                            isLoading={false}
                          />
                        </div>
                      )}
                    </div>

                    {/* Load details - show manual selection only when AI hasn't detected items */}
                    {!isIdentifyingItems && (
                      <>
                        {/* Only show load size selector if AI hasn't recommended one */}
                        {identifiedItems.length === 0 && (
                          <div>
                            <Label className="text-base font-semibold mb-4 block">
                              Select Load Size
                            </Label>
                            <LoadSizeSelector
                              selectedSize={loadSize}
                              onSelectSize={(size) => {
                                setLoadSize(size);
                                setAiDetectedVolume(undefined);
                              }}
                            />
                          </div>
                        )}
                        
                        {/* Show heavy items toggle only when AI hasn't detected items */}
                        {identifiedItems.length === 0 && (
                          <div className="border-t pt-6">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <Weight className="w-5 h-5 text-muted-foreground" />
                                <div>
                                  <Label htmlFor="heavy-item" className="text-base font-semibold">
                                    Heavy Items
                                  </Label>
                                  <p className="text-sm text-muted-foreground">
                                    Includes: sofa beds, appliances, marble/glass, treadmills, sectionals
                                  </p>
                                </div>
                              </div>
                              <Switch
                                id="heavy-item"
                                checked={heavyItem}
                                onCheckedChange={setHeavyItem}
                                data-testid="switch-heavy-item"
                              />
                            </div>
                            {heavyItem && (
                              <div className="mt-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                                <p className="text-sm font-semibold text-primary">+$15 Heavy Item Fee</p>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="border-t pt-6">
                          <Label className="text-base font-semibold mb-2 block flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            Number of Movers
                          </Label>
                          {requiresTwoMovers(loadSize, heavyItem) && (
                            <Alert className="mb-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                              <AlertDescription className="text-sm text-amber-900 dark:text-amber-100">
                                <strong>Recommended: 2 Movers</strong> - Your load size or heavy items typically require assistance from 2 movers for safe handling.
                              </AlertDescription>
                            </Alert>
                          )}
                          <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <button
                              type="button"
                              onClick={() => setNumberOfMovers(1)}
                              className={`relative flex flex-col rounded-xl border-2 transition-all hover-elevate active-elevate-2 ${
                                numberOfMovers === 1
                                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                  : "border-border bg-card hover:border-primary/50"
                              }`}
                              data-testid="button-1-mover"
                            >
                              {/* Standardized media container so mover images/videos are sized and centered consistently */}
                              <div className="relative w-full h-28 sm:h-36 flex items-center justify-center bg-muted/30 rounded-t-lg overflow-hidden">
                                <video
                                  src={singleMoverVideo}
                                  poster={singleMoverPoster}
                                  autoPlay
                                  loop
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="max-w-full max-h-full object-contain"
                                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                                />
                                {numberOfMovers === 1 && (
                                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full">
                                    Selected
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 text-center">
                                <p className="font-bold text-base sm:text-lg">1 Mover</p>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  Customer assists with carrying
                                </p>
                                <div className="mt-2 sm:mt-3 inline-flex items-center gap-1 bg-muted/50 px-2 sm:px-3 py-1 rounded-full">
                                  <DollarSign className="w-3 h-3 flex-shrink-0" />
                                  <span className="text-xs sm:text-sm font-semibold whitespace-nowrap">Standard Rate</span>
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setNumberOfMovers(2)}
                              className={`relative flex flex-col rounded-xl border-2 transition-all hover-elevate active-elevate-2 ${
                                numberOfMovers === 2
                                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                  : "border-border bg-card hover:border-primary/50"
                              }`}
                              data-testid="button-2-movers"
                            >
                              {/* Standardized media container so mover images/videos are sized and centered consistently */}
                              <div className="relative w-full h-28 sm:h-36 flex items-center justify-center bg-muted/30 rounded-t-lg overflow-hidden">
                                <video
                                  src={twoMoversVideo}
                                  poster={twoMoversPoster}
                                  autoPlay
                                  loop
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="max-w-full max-h-full object-contain"
                                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                                />
                                {numberOfMovers === 2 && (
                                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full">
                                    Selected
                                  </div>
                                )}
                                {requiresTwoMovers(loadSize, heavyItem) && numberOfMovers !== 2 && (
                                  <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                    Recommended
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 text-center">
                                <p className="font-bold text-base sm:text-lg">2 Movers</p>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  Full-service, no assistance needed
                                </p>
                                <div className="mt-2 sm:mt-3 inline-flex items-center gap-1 bg-primary/10 text-primary px-2 sm:px-3 py-1 rounded-full">
                                  <TrendingUp className="w-3 h-3 flex-shrink-0" />
                                  <span className="text-xs sm:text-sm font-semibold whitespace-nowrap">+30% Premium</span>
                                </div>
                              </div>
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {step === 3 && (
                  <>
                    {/* Schedule Section - Grand Design */}
                    <div className="relative bg-gradient-to-br from-primary/5 via-accent/5 to-transparent border border-primary/20 rounded-xl p-5">
                      {/* Decorative element */}
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl" />
                      
                      <div className="relative">
                        <div className="flex items-start gap-4 mb-5">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20 flex-shrink-0">
                            <Calendar className="w-6 h-6 text-primary-foreground" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold">Schedule Your Move</h3>
                            <p className="text-sm text-muted-foreground mt-0.5">Choose your preferred date and time</p>
                          </div>
                        </div>

                        {/* Date & Time Input */}
                        <div className="bg-card/80 backdrop-blur-sm rounded-lg p-4 border border-border/50 mb-4">
                          <Label htmlFor="date" className="text-sm font-medium text-muted-foreground mb-2 block">
                            Date & Time
                          </Label>
                          <Input
                            id="date"
                            type="datetime-local"
                            className="h-12 text-base"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            data-testid="input-move-date"
                          />
                        </div>

                        {/* Quick Schedule Options */}
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Schedule</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const tomorrow = new Date();
                                tomorrow.setDate(tomorrow.getDate() + 1);
                                tomorrow.setHours(9, 0, 0, 0);
                                setDate(tomorrow.toISOString().slice(0, 16));
                              }}
                              data-testid="button-quick-tomorrow-morning"
                              className="h-auto py-3 flex-col gap-1"
                            >
                              <Clock className="w-4 h-4" />
                              <span className="text-xs font-medium">Tomorrow</span>
                              <span className="text-[10px] text-muted-foreground">9:00 AM</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const tomorrow = new Date();
                                tomorrow.setDate(tomorrow.getDate() + 1);
                                tomorrow.setHours(14, 0, 0, 0);
                                setDate(tomorrow.toISOString().slice(0, 16));
                              }}
                              data-testid="button-quick-tomorrow-afternoon"
                              className="h-auto py-3 flex-col gap-1"
                            >
                              <Clock className="w-4 h-4" />
                              <span className="text-xs font-medium">Tomorrow</span>
                              <span className="text-[10px] text-muted-foreground">2:00 PM</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const nextWeek = new Date();
                                nextWeek.setDate(nextWeek.getDate() + 7);
                                nextWeek.setHours(9, 0, 0, 0);
                                setDate(nextWeek.toISOString().slice(0, 16));
                              }}
                              data-testid="button-quick-next-week"
                              className="h-auto py-3 flex-col gap-1"
                            >
                              <Calendar className="w-4 h-4" />
                              <span className="text-xs font-medium">Next Week</span>
                              <span className="text-[10px] text-muted-foreground">9:00 AM</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const weekend = new Date();
                                const daysUntilSaturday = (6 - weekend.getDay() + 7) % 7 || 7;
                                weekend.setDate(weekend.getDate() + daysUntilSaturday);
                                weekend.setHours(10, 0, 0, 0);
                                setDate(weekend.toISOString().slice(0, 16));
                              }}
                              data-testid="button-quick-weekend"
                              className="h-auto py-3 flex-col gap-1"
                            >
                              <Calendar className="w-4 h-4" />
                              <span className="text-xs font-medium">This Weekend</span>
                              <span className="text-[10px] text-muted-foreground">Saturday 10 AM</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Notes Section */}
                    <div className="relative bg-gradient-to-r from-muted/30 to-transparent border border-border/50 rounded-xl p-5">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Additional Notes</h3>
                            <span className="text-[10px] font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">OPTIONAL</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">Help your mover prepare for the job</p>
                        </div>
                      </div>
                      
                      <Textarea
                        id="description"
                        placeholder="Examples:&#10;• 3rd floor apartment, elevator available&#10;• Need help disassembling bed frame&#10;• Fragile antique furniture - handle with care&#10;• Access code for building: 1234"
                        className="min-h-32 bg-card/50 resize-none"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        data-testid="input-description"
                      />
                      
                      <div className="flex items-start gap-2 mt-3 p-3 bg-primary/5 rounded-lg">
                        <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">
                          Detailed notes help movers come prepared with the right equipment and plan their time efficiently.
                        </p>
                      </div>
                    </div>

                    {/* Ready to Submit Summary */}
                    <div className="relative overflow-hidden bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/20 rounded-xl p-5">
                      <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-green-500/10 rounded-full blur-2xl" />
                      <div className="relative flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/20">
                          <CheckCircle className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-green-700 dark:text-green-400">Ready to Find Movers</h3>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Click "Find Movers" to see available professionals in your area
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex justify-between pt-5 border-t gap-4 mt-auto">
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    disabled={step === 1}
                    className="hover-elevate active-elevate-2"
                    data-testid="button-back"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleNext}
                    data-testid="button-next"
                  >
                    {step === 3 ? "Find Movers" : "Next"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Live Pricing Summary — hidden on Step 1 (no pricing until load details are set) */}
          {step > 1 && (
            <PricingSummary 
              breakdown={priceBreakdown}
              isCalculating={isCalculatingPrice}
              error={pricingError}
              showPromoInput={!!user && (user.promoUsesCount ?? 0) < 2}
              appliedPromo={appliedPromo}
              onPromoApplied={setAppliedPromo}
            />
          )}
        </div>
      </div>
    </div>

    {/* Single Mover Warning Dialog - Cannot be dismissed without action */}
    <AlertDialog open={showSingleMoverWarning}>
      <AlertDialogContent data-testid="dialog-single-mover-warning">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-500" />
            Important: Single Mover Selection
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base space-y-3">
            <p>
              Based on your items ({loadSize === 'large' ? 'large furniture' : loadSize === 'apartment' ? 'apartment-sized load' : 'heavy items'}), 
              we recommend <strong>2 movers</strong> for safe and efficient moving.
            </p>
            
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-2">
              <p className="font-semibold text-amber-900 dark:text-amber-100">
                By choosing 1 mover, you acknowledge:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-amber-900 dark:text-amber-100">
                <li>You may need to help the mover with loading and unloading</li>
                <li>The mover can request your assistance for heavy items</li>
                <li>If you refuse to help and the mover cancels the job, you will forfeit 50% of the payment</li>
              </ul>
            </div>

            <p className="text-sm font-medium">
              This policy protects movers from unsafe working conditions and ensures fair compensation.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel
            onClick={() => {
              setNumberOfMovers(2);
              setShowSingleMoverWarning(false);
            }}
            data-testid="button-choose-two-movers"
            className="sm:flex-1"
          >
            Change to 2 Movers (Recommended)
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setHasSingleMoverAcknowledgment(true);
              setShowSingleMoverWarning(false);
            }}
            data-testid="button-accept-single-mover"
            className="sm:flex-1 bg-amber-600 hover:bg-amber-700"
          >
            I Understand - Continue with 1 Mover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
