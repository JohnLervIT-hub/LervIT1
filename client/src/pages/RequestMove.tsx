// PERFORMANCE: Preload Payment page when step >= 2
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAnalytics, trackEvent } from "@/hooks/use-analytics";
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
import { Badge } from "@/components/ui/badge";
import LoadSizeSelector from "@/components/LoadSizeSelector";
import ImageUpload from "@/components/ImageUpload";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { PricingSummary } from "@/components/PricingSummary";
import { IdentifiedItemsList } from "@/components/IdentifiedItemsList";
import { MapPin, Calendar, FileText, CheckCircle, TrendingUp, Package, DollarSign, Weight, Users, Clock, Sparkles, Camera, Loader2, Info, Scan, CreditCard, Truck, AlertTriangle, Star, X, Tag, Gift, CheckCircle2 } from "lucide-react";
import type { IdentifiedItem } from "@shared/schema";
import { useLocation, useSearch } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation as useGeoLocation } from "@/contexts/LocationContext";
import { generatePriceExplanation, AI_FEATURES, type PhotoAnalysisResult } from "@shared/ai";
import { calculatePrice, type PriceBreakdown, type PickupDifficultyType, type DropoffDifficultyType } from "@shared/pricing";
import { VEHICLE_VOLUME_THRESHOLDS } from "@shared/furniture-database";
import singleMoverVideo from "@assets/generated_videos/single_mover_carrying_box.mp4";
import twoMoversVideo from "@assets/generated_videos/two_movers_carrying_sofa.mp4";
import singleMoverPoster from "@assets/generated_images/single_mover_poster_image.png";
import twoMoversPoster from "@assets/generated_images/two_movers_poster_image.png";
import { saveDraft, loadDraft, clearDraft, type BookingDraftData } from "@/lib/bookingDraft";

// Tiered handling premiums by complexity.
// Rates mirror PRICING_CONFIG.HEAVY_ITEM_PREMIUMS_BY_COMPLEXITY in shared/pricing.ts.
// high (large appliances, gym equipment, massage chairs): $15/item
// very_high (pianos, hot tubs, pool tables, safes, motorcycles): $30/item
// Cap: $150 total — no booking is ever charged more than this in handling fees alone.
const HEAVY_ITEM_PREMIUMS_TIERED: Record<string, number> = { slight: 5, moderate: 10, high: 15, very_high: 30 };
const HEAVY_ITEM_PREMIUM_CAP = 150;

function getItemTypePremium(items: IdentifiedItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.processingStatus !== 'completed') continue;
    total += HEAVY_ITEM_PREMIUMS_TIERED[item.handlingComplexity || ''] ?? 0;
  }
  return Math.min(total, HEAVY_ITEM_PREMIUM_CAP);
}

// Returns the number of heavy items (for display / backwards compatibility)
function countHeavyItems(items: IdentifiedItem[]): number {
  return items.filter(i => i.processingStatus === 'completed' && (i.handlingComplexity === 'very_high' || i.handlingComplexity === 'high')).length;
}

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

export default function RequestMove() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { user } = useAuth();
  const { toast } = useToast();
  const { track } = useAnalytics("booking_flow");
  const [step, setStep] = useState(1);
  const [contactCaptured, setContactCaptured] = useState(false);
  const [capturedContact, setCapturedContact] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const quoteSaveInFlight = useRef(false);
  // Format a Date as YYYY-MM-DDTHH:MM in the user's LOCAL timezone
  // (datetime-local inputs require local time, NOT UTC ISO strings)
  const toLocalDT = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

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
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [referralApplied, setReferralApplied] = useState(false);

  const handleApplyPromo = useCallback(async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError(null);
    try {
      const res = await apiRequest("POST", "/api/promo/validate", { code: promoInput.trim() });
      const data = await res.json();
      if (data.valid) {
        setAppliedPromo({
          code: data.code,
          valid: true,
          discountPercent: data.discountPercent,
          usesRemaining: data.usesRemaining,
          message: data.message,
        });
        setPromoInput("");
      } else {
        setPromoError(data.message || "Invalid promo code");
      }
    } catch {
      setPromoError("Failed to validate promo code");
    } finally {
      setPromoLoading(false);
    }
  }, [promoInput]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('lervit_contact');
      if (saved) {
        setContactCaptured(true);
        setCapturedContact(JSON.parse(saved));
      }
    } catch {}
  }, []);

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
  const step1MoverMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const step1MoverInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [visibleMoverCount, setVisibleMoverCount] = useState(0);
  const [pillExpanded, setPillExpanded] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Live Pricing state
  const emptyBreakdown = (): PriceBreakdown => ({
    baseFee: 0,
    distanceFee: 0,
    loadFee: 0,
    premiumFee: 0,
    accessFee: 0,
    pickupDifficultyFee: 0,
    dropoffDifficultyFee: 0,
    moverAddition: 0,
    subtotal: 0,
    total: 0,
    vehicleClass: 'A',
    adjustedVolume: 0,
    rawVolume: 0,
    numberOfMovers: 1,
    forcedTwoMovers: false,
    itemPremiums: [],
    distanceKm: 0,
    perKmRate: 0,
  });
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(emptyBreakdown());
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  // Auto-save the anonymous quote to /api/quotes once a price is computed.
  // Fires exactly once per session — quoteSaveInFlight guards strict-mode
  // double-fires; setQuoteId gates the effect itself thereafter.
  useEffect(() => {
    if (
      quoteId ||
      quoteSaveInFlight.current ||
      !priceBreakdown ||
      priceBreakdown.total <= 0 ||
      !pickupAddress ||
      step < 2
    ) {
      return;
    }
    quoteSaveInFlight.current = true;

    const VEHICLE_TIER_RANK: Record<string, number> = { car: 0, pickup: 1, van: 2, truck: 3 };
    const tiers = ['car', 'pickup', 'van', 'truck'] as const;
    const maxTier = identifiedItems.reduce(
      (m, it) => Math.max(m, VEHICLE_TIER_RANK[it.vehicleType || 'car'] ?? 0),
      0,
    );
    const vehicleType = identifiedItems.length > 0 ? tiers[maxTier] : null;

    fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress,
        dropoffAddress,
        distanceKm: priceBreakdown.distanceKm || estimateDistance,
        loadSize,
        itemsJson: identifiedItems.length > 0 ? identifiedItems : null,
        vehicleType,
        numberOfMovers,
        totalPrice: priceBreakdown.total,
        baseFee: priceBreakdown.baseFee,
        distanceFee: priceBreakdown.distanceFee,
        loadFee: priceBreakdown.loadFee,
      }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.quoteId) {
          setQuoteId(data.quoteId);
          try { sessionStorage.setItem('lervit_quote_id', data.quoteId); } catch {}
        } else {
          quoteSaveInFlight.current = false;
        }
      })
      .catch(() => { quoteSaveInFlight.current = false; });
  }, [priceBreakdown?.total, quoteId, pickupAddress, step]);

  // When adjusted volume exceeds the force-2-movers threshold, the pricing
  // engine locks the count to 2 automatically. UI reflects that lock via banner.
  const forcedTwoMovers = priceBreakdown?.forcedTwoMovers ?? false;
  
  // AI Product Identifier state
  const [isIdentifyingItems, setIsIdentifyingItems] = useState(false);
  const [identifiedItems, setIdentifiedItems] = useState<IdentifiedItem[]>([]);
  const identifiedItemsRef = useRef<IdentifiedItem[]>([]);
  const [hasAutoAnalyzed, setHasAutoAnalyzed] = useState(false);
  const [aiDetectedVolume, setAiDetectedVolume] = useState<number | undefined>(undefined);

  const handleContactCapture = useCallback(async (contact: { name: string; phone: string; email: string }) => {
    try {
      const linkedQuoteId = quoteId ?? (() => {
        try { return sessionStorage.getItem('lervit_quote_id'); } catch { return null; }
      })();

      const VEHICLE_LABELS: Record<string, string> = {
        car: 'SUV',
        pickup: 'Pickup Truck',
        van: 'Cargo Van',
        truck: 'Moving Truck',
      };
      const VEHICLE_RANK: Record<string, number> = { car: 0, pickup: 1, van: 2, truck: 3 };
      const tiers = ['car', 'pickup', 'van', 'truck'] as const;
      const maxTier = identifiedItems.reduce(
        (m, it) => Math.max(m, VEHICLE_RANK[it.vehicleType || 'car'] ?? 0),
        0,
      );
      const vehicleKey = identifiedItems.length > 0 ? tiers[maxTier] : null;
      const distanceKm = priceBreakdown?.distanceKm || estimateDistance;

      const quoteContext = {
        totalPrice: priceBreakdown?.total
          ? `$${parseFloat(String(priceBreakdown.total)).toFixed(2)} CAD`
          : null,
        items: identifiedItems.length > 0
          ? identifiedItems
              .map(i => i.itemName)
              .filter((n): n is string => !!n)
              .join(', ')
          : null,
        vehicleLabel: vehicleKey ? VEHICLE_LABELS[vehicleKey] : null,
        distanceKm: distanceKm ? parseFloat(String(distanceKm)).toFixed(1) : null,
        numberOfMovers: numberOfMovers ?? 1,
      };

      const res = await apiRequest("POST", "/api/leads/capture", {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        source: 'quote_form',
        notes: `Pickup: ${pickupAddress} → Dropoff: ${dropoffAddress}`,
        quoteContext,
        quoteId: linkedQuoteId,
      });
      if (res.ok) {
        setCapturedContact(contact);
        setContactCaptured(true);
        try {
          sessionStorage.setItem('lervit_contact', JSON.stringify(contact));
        } catch {}
      } else {
        setContactCaptured(true);
      }
    } catch (err) {
      console.error('Lead capture failed:', err);
      setContactCaptured(true);
    }
  }, [pickupAddress, dropoffAddress, quoteId, identifiedItems, priceBreakdown, estimateDistance, numberOfMovers]);
  
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

  // Available movers near the pickup — powers the truck markers on the map
  type NearbyMover = {
    id: string;
    latitude: number | null;
    longitude: number | null;
    rating?: string | number | null;
    distance?: number | null;
    user?: { name?: string } | null;
  };
  const { data: availableMovers = [] } = useQuery<NearbyMover[]>({
    queryKey: ['/api/movers', 'available', pickupCoords?.lat, pickupCoords?.lng],
    queryFn: async () => {
      if (!pickupCoords) return [];
      const res = await fetch(
        `/api/movers?isAvailable=true&lat=${pickupCoords.lat}&lng=${pickupCoords.lng}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
    enabled: !!pickupCoords,
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

  // Auto-fill pickup address from GPS coordinates once permission is granted
  useEffect(() => {
    if (!geoCoords || pickupAddress) return;
    const { lat, lng } = geoCoords;
    fetch(`/api/places/reverse-geocode?lat=${lat}&lng=${lng}`)
      .then(r => r.json())
      .then(data => {
        if (data.address && !pickupAddress) {
          setPickupAddress(data.address);
          setPickupCoords({ lat, lng });
        }
      })
      .catch(() => {});
  }, [geoCoords]);

  // Track booking funnel step views
  useEffect(() => {
    const stepNames: Record<number, string> = {
      1: "booking_step_1_locations",
      2: "booking_step_2_load_details",
      3: "booking_step_3_schedule",
    };
    const name = stepNames[step];
    if (name) track(name, { step });
  }, [step]);

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
    const quoteIdParam = wouterParams.get('quote') || windowParams.get('quote');

    // PRIORITY -1: Restore anonymous quote by id (e.g. /request-move?quote=q_...).
    // Takes precedence over abandoned/pickup restore paths.
    if (quoteIdParam) {
      hasRestoredRef.current = true;
      fetch(`/api/quotes/${quoteIdParam}`)
        .then(async r => (r.ok ? r.json() : null))
        .then(quote => {
          if (!quote?.id) return;
          if (quote.pickupAddress) setPickupAddress(quote.pickupAddress);
          if (quote.dropoffAddress) setDropoffAddress(quote.dropoffAddress);
          if (quote.loadSize) setLoadSize(quote.loadSize);
          if (Array.isArray(quote.itemsJson)) setIdentifiedItems(quote.itemsJson);
          if (typeof quote.numberOfMovers === 'number') setNumberOfMovers(quote.numberOfMovers);
          setQuoteId(quote.id);
          try { sessionStorage.setItem('lervit_quote_id', quote.id); } catch {}
          if (quote.hasContact) setContactCaptured(true);
          setStep(3);
          window.history.replaceState({}, '', '/request-move');
          toast({
            title: 'Quote restored',
            description: 'We reopened your saved quote — you can review and book.',
          });
        })
        .catch(() => {});
      return;
    }

    // PRIORITY 0: Fetch abandoned booking data from server if abandonedId is provided
    if (abandonedId && !pickup && !dropoff) {
      hasRestoredRef.current = true;
      
      fetch(`/api/abandoned-bookings/${abandonedId}`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
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
        });
      return;
    }

    // Check if this is a return from login with full booking data (URL params)
    const isReturningFromLogin = !!(pickup && dropoff && resumeStepParam);
    
    if (isReturningFromLogin) {
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
      trackEvent("booking_submitted", {
        bookingId: data?.id,
        loadSize: data?.loadSize,
        price: data?.price,
        hasPromo: !!data?.promoCode,
      });
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


  // Detect ?ref=CODE on mount and apply referral credit
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (!refCode || !user) return;
    fetch('/api/referrals/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code: refCode }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) setReferralApplied(true);
      })
      .catch(() => {});
    // Remove ?ref from URL so it doesn't re-apply on refresh
    const newUrl = window.location.pathname + window.location.search.replace(/[?&]ref=[^&]*/g, '').replace(/^&/, '?');
    window.history.replaceState({}, '', newUrl);
  }, [user]);

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
      step1MoverMarkersRef.current.forEach(m => { m.map = null; });
      step1MoverMarkersRef.current = [];
      step1MoverInfoWindowRef.current?.close();
      step1MoverInfoWindowRef.current = null;
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
      mapId: import.meta.env.VITE_GOOGLE_MAPS_ID || 'DEMO_MAP_ID',
      styles: BOOKING_MAP_STYLES,
    });
    step1MapInstanceRef.current = map;
    const renderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      preserveViewport: true,   // prevent renderer from overriding our custom fitBounds
      polylineOptions: { strokeColor: "#2563eb", strokeWeight: 4, strokeOpacity: 0.9 },
    });
    renderer.setMap(map);
    step1DirRendererRef.current = renderer;
    step1DirServiceRef.current = new google.maps.DirectionsService();
  }, [mapsIsLoaded, step1DivReady]);

  // Calculate route and push to the imperative renderer whenever addresses change.
  // Debounced by 500ms so we don't fire the Directions API on every keystroke.
  useEffect(() => {
    if (!mapsIsLoaded || !pickupAddress || !dropoffAddress) {
      // Clear the renderer + any route error when addresses are incomplete
      if (step1DirRendererRef.current && (!pickupAddress || !dropoffAddress)) {
        step1DirRendererRef.current.setDirections({ routes: [] } as unknown as google.maps.DirectionsResult);
      }
      setRouteError(null);
      return;
    }
    const key = `${pickupAddress}|||${dropoffAddress}`;
    if (step1LastAddressesRef.current === key) return;

    const timer = setTimeout(() => {
      step1LastAddressesRef.current = key;

      // Wait for service ref to be ready (map init effect might not have run yet)
      const service = step1DirServiceRef.current;
      if (!service) return;

      // Capture the key now so the async callback can detect stale responses.
      const requestKey = key;

      service.route(
        { origin: pickupAddress, destination: dropoffAddress, travelMode: google.maps.TravelMode.DRIVING, region: "CA" },
        (result, status) => {
          // Stale-response guard: discard if addresses changed since this request was sent
          if (step1LastAddressesRef.current !== requestKey) return;

          // NOT_FOUND / ZERO_RESULTS — address doesn't resolve or no drivable route.
          // Clear the polyline + endpoint markers, show a subtle message, and
          // fall back to geocoding just the pickup so truck markers still load.
          if (
            status === google.maps.DirectionsStatus.NOT_FOUND ||
            status === google.maps.DirectionsStatus.ZERO_RESULTS
          ) {
            step1DirRendererRef.current?.setDirections({ routes: [] } as unknown as google.maps.DirectionsResult);
            if (step1AnimIntervalRef.current) {
              clearInterval(step1AnimIntervalRef.current);
              step1AnimIntervalRef.current = null;
            }
            step1AnimPolylineRef.current?.setMap(null);
            step1AnimPolylineRef.current = null;
            setRouteError("Route not found — please verify your address");

            // Best-effort pickup-only geocode so the mover-markers query can still fire
            try {
              new google.maps.Geocoder().geocode(
                { address: pickupAddress, region: "CA" },
                (geoResults, geoStatus) => {
                  if (step1LastAddressesRef.current !== requestKey) return;
                  if (geoStatus === google.maps.GeocoderStatus.OK && geoResults?.[0]) {
                    const loc = geoResults[0].geometry.location;
                    setPickupCoords({ lat: loc.lat(), lng: loc.lng() });
                  }
                }
              );
            } catch { /* geocoder unavailable — silently skip */ }
            return;
          }

          if (status !== google.maps.DirectionsStatus.OK || !result || !step1DirRendererRef.current) {
            // Other transient errors (OVER_QUERY_LIMIT etc.) — leave prior route in place
            return;
          }

          setRouteError(null);
          step1DirRendererRef.current.setDirections(result);

          const map = step1MapInstanceRef.current;
          const leg = result.routes[0]?.legs[0];
          if (map && leg) {
            // Fit to Google's own route bounds — guarantees both endpoints and
            // the full polyline are visible regardless of distance/direction.
            const routeBounds = result.routes[0]?.bounds;
            if (routeBounds) {
              map.fitBounds(routeBounds, { top: 80, bottom: 80, left: 60, right: 60 });
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

            // Place branded marker chips at the confirmed geocoded endpoints
            {
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

            // Publish pickup coords so the available-movers query can fire
            setPickupCoords({
              lat: leg.start_location.lat(),
              lng: leg.start_location.lng(),
            });
            setDropoffCoords({
              lat: leg.end_location.lat(),
              lng: leg.end_location.lng(),
            });
          }
        }
      );
    }, 500);

    return () => clearTimeout(timer);
  }, [mapsIsLoaded, pickupAddress, dropoffAddress]);

  // Render available-mover truck markers around the pickup point.
  // Uses AdvancedMarkerElement (loaded on demand) so the marker content is a
  // real DOM node. Works with the vector-rendered map (no mapId required).
  useEffect(() => {
    const map = step1MapInstanceRef.current;
    if (!mapsIsLoaded || !map) return;

    // Clear any previously-drawn mover markers
    step1MoverMarkersRef.current.forEach(m => { m.map = null; });
    step1MoverMarkersRef.current = [];
    step1MoverInfoWindowRef.current?.close();

    if (!availableMovers || availableMovers.length === 0) {
      setVisibleMoverCount(0);
      return;
    }

    // Exclude null, 0/0, and near-zero (default/uninitialized) coordinates
    const mappableMovers = availableMovers.filter(m =>
      m.latitude != null && m.longitude != null &&
      m.latitude !== 0 && m.longitude !== 0 &&
      Math.abs(m.latitude) > 0.001 &&
      Math.abs(m.longitude) > 0.001
    );
    const nearest = mappableMovers.slice(0, 8);

    const escapeHtml = (s: string) =>
      s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

    // One shared InfoWindow — click a truck to open, click another to move it
    const infoWindow = step1MoverInfoWindowRef.current ?? new google.maps.InfoWindow();
    step1MoverInfoWindowRef.current = infoWindow;

    let cancelled = false;
    (async () => {
      const markerLib = await (google.maps as any).importLibrary('marker') as google.maps.MarkerLibrary;
      if (cancelled) return;
      const { AdvancedMarkerElement } = markerLib;

      for (const mover of nearest) {
        const markerEl = document.createElement('div');
        markerEl.innerHTML = '🚛';
        markerEl.style.cssText = `
          background:#1a56db;
          border-radius:50%;
          width:44px;height:44px;
          display:flex;align-items:center;
          justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          border:2px solid white;
          font-size:20px;cursor:pointer;
        `;

        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: mover.latitude as number, lng: mover.longitude as number },
          content: markerEl,
          title: mover.user?.name || 'Available mover',
        });

        // DOM click on the content element is the most portable way to wire
        // a click across Maps JS SDK versions (vs `gmp-click` on the marker).
        // Touchend is required because AdvancedMarkerElement's synthetic click
        // event doesn't fire reliably on mobile touch screens.
        const handleMarkerClick = () => {
          const name = escapeHtml(mover.user?.name || 'Available mover');
          const ratingNum = typeof mover.rating === 'string' ? parseFloat(mover.rating) : mover.rating;
          const rating = ratingNum && !Number.isNaN(ratingNum) ? ratingNum.toFixed(1) : '5.0';
          const distance = typeof mover.distance === 'number'
            ? `${mover.distance.toFixed(1)} km away`
            : 'Nearby';
          const content = `
            <div style="
              padding:10px 14px;
              font-family:Arial,sans-serif;
              min-width:160px;
            ">
              <div style="
                font-weight:bold;
                font-size:14px;
                margin-bottom:6px;
                color:#111;
              ">
                ${name}
              </div>
              <div style="
                color:#f59e0b;
                font-size:13px;
                margin-bottom:4px;
              ">
                ⭐ ${rating}
              </div>
              <div style="
                color:#555;
                font-size:13px;
              ">
                📍 ${distance}
              </div>
            </div>
          `;
          infoWindow.setContent(content);
          infoWindow.open({ map, anchor: marker });
        };
        markerEl.addEventListener('click', handleMarkerClick);
        markerEl.addEventListener('touchend', (e) => {
          e.preventDefault();
          handleMarkerClick();
        });

        step1MoverMarkersRef.current.push(marker);
      }
      const rendered = step1MoverMarkersRef.current.length;
      setVisibleMoverCount(rendered);
      // Diagnostic: confirms pill count matches actual markers on the map
      console.log('[markers] rendered:', rendered, 'availableMovers:', availableMovers.length);
    })();

    return () => { cancelled = true; };
  }, [availableMovers, mapsIsLoaded]);

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
        const breakdown = calculatePrice({
          distanceKm: estimateDistance,
          loadSize,
          pickupDifficulty,
          dropoffDifficulty,
          heavyItem,
          numberOfMovers,
          volumeCuft: aiDetectedVolume,
          heavyItemFeeOverride: getItemTypePremium(identifiedItems),
        });
        // countHeavyItems retained for legacy telemetry only.
        void countHeavyItems(identifiedItems);
        if (step === 1) {
          const step1Preview = emptyBreakdown();
          step1Preview.distanceKm = breakdown.distanceKm;
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
      setPriceBreakdown(emptyBreakdown());
    }
  }, [step, estimateDistance, loadSize, pickupDifficulty, dropoffDifficulty, heavyItem, numberOfMovers, pickupAddress, dropoffAddress, aiDetectedVolume, identifiedItems]);

  // Hard lock: whenever the calculator forces 2 movers, sync local selection.
  useEffect(() => {
    if (forcedTwoMovers && numberOfMovers !== 2) {
      setNumberOfMovers(2);
    }
  }, [forcedTwoMovers, numberOfMovers]);

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
  
  // Tracks which photo URLs have already been sent to the Vision Engine so that
  // adding new photos only analyzes the incremental batch, keeping existing
  // item prices stable.
  const analyzedUrlsRef = useRef(new Set<string>());

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

  // AI Product Identifier - Identify items from uploaded photos.
  // Only NEW (unanalyzed) photos are sent to the Vision Engine each time;
  // results are merged with existing items so previously-analyzed prices stay stable.
  const handleIdentifyItems = async (photoUrls?: string[], forceAll?: boolean) => {
    const allUrls = photoUrls || images;

    if (allUrls.length === 0) {
      toast({
        title: "No photos to analyze",
        description: "Please upload at least one photo first.",
        variant: "destructive",
      });
      return;
    }

    const newUrls = forceAll
      ? allUrls
      : allUrls.filter(function(url) { return !analyzedUrlsRef.current.has(url); });

    if (newUrls.length === 0) {
      return;
    }

    newUrls.forEach(function(url) { analyzedUrlsRef.current.add(url); });

    if (forceAll) {
      analyzedUrlsRef.current = new Set(newUrls);
      identifiedItemsRef.current = [];
      setIdentifiedItems([]);
    }

    setIsIdentifyingItems(true);

    try {
      const response = await apiRequest("POST", "/api/ai/items/identify", {
        photoUrls: newUrls,
      });

      if (!response.ok) {
        throw new Error('Unable to analyze photos. Please try again.');
      }

      const result = await response.json();
      const newItems = (result.items || []) as IdentifiedItem[];

      // Merge with the ref (always current, avoids stale closure from async gap).
      const merged = [...identifiedItemsRef.current, ...newItems];
      identifiedItemsRef.current = merged;
      setIdentifiedItems(merged);

      const completedAll = merged.filter(
        function(item) { return item.processingStatus === 'completed'; }
      );

      if (completedAll.length > 0) {
        const totalVolume = completedAll.reduce(
          function(sum, item) { return sum + parseFloat(item.volumeCuft || '0'); }, 0
        );

        const loadSizeTiers = ['boxes', 'medium', 'large', 'apartment'] as const;
        const vehicleTiers  = ['car', 'pickup', 'van', 'truck'] as const;
        let tierIndex = 0;
        if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.VAN_MAX)    tierIndex = 3;
        else if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.PICKUP_MAX) tierIndex = 2;
        else if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.CAR_MAX)    tierIndex = 1;

        const maxMovers = Math.max(
          ...completedAll.map(function(item) { return item.recommendedMovers || 1; })
        );

        const itemTotalWeight = completedAll.reduce(
          function(sum, item) { return sum + parseFloat(item.weightKg || '0'); }, 0
        );
        const hasHeavyItems = completedAll.some(function(item) {
          return (
            item.handlingComplexity === 'high' ||
            item.handlingComplexity === 'very_high' ||
            parseFloat(item.weightKg || '0') > 30
          );
        });

        // Weight bumps: capped at +1 tier above volume-based tier.
        // Real payload limits: pickup ~600 kg, van ~900 kg, truck 2000+ kg.
        // Prevents single/dual heavy items from jumping straight to "Moving Truck".
        const volumeTierIndex1 = tierIndex;
        if (itemTotalWeight > 600 && tierIndex < 3)      tierIndex = Math.min(volumeTierIndex1 + 1, 3);
        else if (itemTotalWeight > 300 && tierIndex < 2) tierIndex = Math.min(volumeTierIndex1 + 1, 2);
        else if (itemTotalWeight > 100 && tierIndex < 1) tierIndex = Math.min(volumeTierIndex1 + 1, 1);

        const maxDimension = Math.max(
          ...completedAll.map(function(item) {
            return Math.max(
              parseFloat(String(item.dimensionsLcm || 0)),
              parseFloat(String(item.dimensionsWcm || 0)),
              parseFloat(String(item.dimensionsHcm || 0))
            );
          })
        );
        if (maxDimension > 200 && tierIndex < 2)      tierIndex = 2;
        else if (maxDimension > 150 && tierIndex < 1) tierIndex = 1;
        if (hasHeavyItems && tierIndex < 1)           tierIndex = 1;

        // DATABASE VEHICLE FLOOR: honour the per-item vehicle assignment from the ground
        // truth database. Items like a 450 kg hot tub are tagged vehicle='truck' in the DB;
        // volume alone can't reflect that, so we take the highest vehicleType across all
        // identified items and ensure we never recommend below it.
        const VEHICLE_TIER_RANK: Record<string, number> = { car: 0, pickup: 1, van: 2, truck: 3 };
        const maxDbTier = completedAll.reduce(
          function(max, item) { return Math.max(max, VEHICLE_TIER_RANK[item.vehicleType || 'car'] ?? 0); }, 0
        );
        if (maxDbTier > tierIndex) tierIndex = maxDbTier;

        const recommendedLoadSize = loadSizeTiers[tierIndex];
        const recommendedVehicle  = vehicleTiers[tierIndex];

        // Use the actual detected volume for display consistency.
        // calculatePrice now takes the max of volume-based and loadSize-based vehicle class,
        // so the correct van/truck class is used even when weight bumps the tier.
        setAiDetectedVolume(totalVolume);

        setLoadSize(recommendedLoadSize);
        setNumberOfMovers(maxMovers > 1 ? 2 : 1);
        setHeavyItem(hasHeavyItems);
        setHasAutoAnalyzed(true);

        const isIncremental = !forceAll && identifiedItemsRef.current.length > newItems.length;
        const toastTitle = isIncremental ? "New Items Added" : "AI Auto-Applied Recommendations!";
        const ft3Label = totalVolume.toFixed(1) + " ft3";
        const moversLabel = maxMovers + " mover" + (maxMovers !== 1 ? "s" : "");
        const heavyLabel = hasHeavyItems ? ", Heavy items" : "";
        toast({
          title: toastTitle,
          description: ft3Label + " - " + capitalizeFirst(recommendedLoadSize) + " load (" + recommendedVehicle + "), " + moversLabel + heavyLabel,
        });
      } else if (newItems.length === 0) {
        toast({
          title: "Identification Complete",
          description: "AI could not identify items. Please select load details manually.",
          variant: "destructive",
        });
      }
    } catch (err) {
      newUrls.forEach(function(url) { analyzedUrlsRef.current.delete(url); });
      toast({
        title: "Analysis Unavailable",
        description: "We couldn't analyze your photos right now. Please select your load details manually below.",
        variant: "destructive",
      });
    } finally {
      setIsIdentifyingItems(false);
    }
  };

  // Auto-analyze callback for ImageUpload - only new images are sent to the API.
  const handleAutoAnalyze = (photoUrls: string[]) => {
    handleIdentifyItems(photoUrls);
  };

  // Recalculates all AI-driven pricing state from a given list of completed items.
  // Called after any removal so the Live Price Estimate card stays in sync.
  const recalcFromItems = (remaining: IdentifiedItem[]) => {
    const completedItems = remaining.filter(item => item.processingStatus === 'completed');
    if (completedItems.length === 0) {
      // Nothing left — reset to manual defaults
      setAiDetectedVolume(undefined);
      setLoadSize('medium');
      setNumberOfMovers(1);
      setHeavyItem(false);
      return;
    }

    const totalVolume = completedItems.reduce(
      (sum, item) => sum + parseFloat(item.volumeCuft || '0'), 0
    );

    const loadSizeTiers = ['boxes', 'medium', 'large', 'apartment'] as const;
    let tierIndex = 0;
    if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.VAN_MAX)         tierIndex = 3;
    else if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.PICKUP_MAX) tierIndex = 2;
    else if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.CAR_MAX)    tierIndex = 1;

    const maxMovers = Math.max(...completedItems.map(item => item.recommendedMovers || 1));
    const itemTotalWeight = completedItems.reduce(
      (sum, item) => sum + parseFloat(item.weightKg || '0'), 0
    );
    const hasHeavyItems = completedItems.some(item =>
      item.handlingComplexity === 'high' ||
      item.handlingComplexity === 'very_high' ||
      parseFloat(item.weightKg || '0') > 30
    );

    const volumeTierIndex2 = tierIndex;
    if (itemTotalWeight > 600 && tierIndex < 3)      tierIndex = Math.min(volumeTierIndex2 + 1, 3);
    else if (itemTotalWeight > 300 && tierIndex < 2) tierIndex = Math.min(volumeTierIndex2 + 1, 2);
    else if (itemTotalWeight > 100 && tierIndex < 1) tierIndex = Math.min(volumeTierIndex2 + 1, 1);

    const maxDim = Math.max(...completedItems.map(item =>
      Math.max(
        parseFloat(String(item.dimensionsLcm || 0)),
        parseFloat(String(item.dimensionsWcm || 0)),
        parseFloat(String(item.dimensionsHcm || 0))
      )
    ));
    if (maxDim > 200 && tierIndex < 2)      tierIndex = 2;
    else if (maxDim > 150 && tierIndex < 1) tierIndex = 1;
    if (hasHeavyItems && tierIndex < 1)     tierIndex = 1;

    // DATABASE VEHICLE FLOOR: use the highest per-item vehicleType from the ground truth DB.
    const VEHICLE_TIER_RANK2: Record<string, number> = { car: 0, pickup: 1, van: 2, truck: 3 };
    const maxDbTier2 = completedItems.reduce(
      (max, item) => Math.max(max, VEHICLE_TIER_RANK2[item.vehicleType || 'car'] ?? 0), 0
    );
    if (maxDbTier2 > tierIndex) tierIndex = maxDbTier2;

    setAiDetectedVolume(totalVolume);

    setLoadSize(loadSizeTiers[tierIndex]);
    setNumberOfMovers(maxMovers > 1 ? 2 : 1);
    setHeavyItem(hasHeavyItems);
  };

  // Called by ImageUpload when images change (new uploads or grid removals)
  const handleImagesChange = (newUrls: string[]) => {
    // Detect removed URLs so we can clean up identified items
    const removedUrls = images.filter(url => !newUrls.includes(url));
    if (removedUrls.length > 0) {
      removedUrls.forEach(url => analyzedUrlsRef.current.delete(url));
      const filtered = identifiedItemsRef.current.filter(item => !removedUrls.includes(item.photoUrl));
      identifiedItemsRef.current = filtered;
      setIdentifiedItems(filtered);
      recalcFromItems(filtered);
    }
    setImages(newUrls);
  };

  // Called by IdentifiedItemsList when the user taps the X on an item row
  const handleRemoveItem = (photoUrl: string) => {
    analyzedUrlsRef.current.delete(photoUrl);
    const filtered = identifiedItemsRef.current.filter(item => item.photoUrl !== photoUrl);
    identifiedItemsRef.current = filtered;
    setIdentifiedItems(filtered);
    // Recalculate pricing state immediately from the new item list
    recalcFromItems(filtered);
    // Also remove the photo from the upload grid
    setImages(prev => prev.filter(url => url !== photoUrl));
  };

  // Apply AI recommendations to booking form
  const handleApplyAIRecommendations = () => {
    const completedItems = identifiedItems.filter(item => item.processingStatus === 'completed');
    if (completedItems.length === 0) return;
    
    // Volume thresholds sourced from shared/furniture-database.ts VEHICLE_VOLUME_THRESHOLDS
    // CAR_MAX: 20 ft³, PICKUP_MAX: 165 ft³, VAN_MAX: 300 ft³, >300 ft³ → Truck
    const totalVolume = completedItems.reduce((sum, item) => sum + parseFloat(item.volumeCuft || '0'), 0);
    const loadSizeTiers = ['boxes', 'medium', 'large', 'apartment'] as const;
    let tierIndex = 0;
    if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.VAN_MAX)         tierIndex = 3;
    else if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.PICKUP_MAX) tierIndex = 2;
    else if (totalVolume > VEHICLE_VOLUME_THRESHOLDS.CAR_MAX)    tierIndex = 1;
    
    // Get max recommended movers
    const maxMovers = Math.max(...completedItems.map(item => item.recommendedMovers || 1));
    
    // Check for heavy/complex items
    const itemTotalWeight = completedItems.reduce((sum, item) => sum + parseFloat(item.weightKg || '0'), 0);
    const hasHeavyItems = completedItems.some(item => 
      item.handlingComplexity === 'high' || 
      item.handlingComplexity === 'very_high' ||
      parseFloat(item.weightKg || '0') > 30
    );
    
    // Weight bumps: capped at +1 tier above volume-based tier.
    // Real payload limits: pickup ~600 kg, van ~900 kg, truck 2000+ kg.
    const volumeTierIndex3 = tierIndex;
    if (itemTotalWeight > 600 && tierIndex < 3)      tierIndex = Math.min(volumeTierIndex3 + 1, 3);
    else if (itemTotalWeight > 300 && tierIndex < 2) tierIndex = Math.min(volumeTierIndex3 + 1, 2);
    else if (itemTotalWeight > 100 && tierIndex < 1) tierIndex = Math.min(volumeTierIndex3 + 1, 1);
    
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

    // DATABASE VEHICLE FLOOR: use the highest per-item vehicleType from the ground truth DB.
    const VEHICLE_TIER_RANK3: Record<string, number> = { car: 0, pickup: 1, van: 2, truck: 3 };
    const maxDbTier3 = completedItems.reduce(
      (max, item) => Math.max(max, VEHICLE_TIER_RANK3[item.vehicleType || 'car'] ?? 0), 0
    );
    if (maxDbTier3 > tierIndex) tierIndex = maxDbTier3;
    
    const recommendedLoadSize = loadSizeTiers[tierIndex];

    // Use actual volume for display consistency; calculatePrice handles class via loadSize floor.
    setAiDetectedVolume(totalVolume);
    
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
      // Require geometry-resolved coords (proves Google actually matched the address)
      if (!pickupCoords) {
        toast({
          title: "Invalid pickup address",
          description: "Please select a valid address from the suggestions.",
          variant: "destructive",
        });
        return;
      }
      if (!dropoffCoords) {
        toast({
          title: "Invalid dropoff address",
          description: "Please select a valid address from the suggestions.",
          variant: "destructive",
        });
        return;
      }
      // Compare by coords when we have them, fall back to string compare
      const sameAddress =
        Math.abs(pickupCoords.lat - dropoffCoords.lat) < 0.0001 &&
        Math.abs(pickupCoords.lng - dropoffCoords.lng) < 0.0001;
      if (sameAddress) {
        toast({
          title: "Same address",
          description: "Pickup and dropoff cannot be the same location.",
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
      if (!images || images.length === 0) {
        // For unauthenticated users, save data and redirect to login
        // They can upload photos after logging in
        if (!user) {
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
      window.scrollTo({ top: 0, behavior: "instant" });
    } else {
      // Validate date before submission
      if (!date) {
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
        localStorage.setItem('pendingBooking', JSON.stringify(pendingData));
        // Verify it was saved
        // Redirect to login with return path (include moverId if selected)
        const returnPath = preSelectedMoverId 
          ? `/request-move?moverId=${preSelectedMoverId}`
          : '/request-move';
        setLocation(`/login?redirect=${encodeURIComponent(returnPath)}`);
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
        acknowledgedSingleMoverPolicy: false,
        description: description || null,
        images: images.length > 0 ? images : null,
        preferredDate: new Date(date).toISOString(),
        preSelectedMoverId: preSelectedMoverId || undefined,
        aiDetectedVolumeCuft: aiDetectedVolume || undefined,
        heavyItemCount: countHeavyItems(identifiedItems),
        heavyItemFeeOverride: getItemTypePremium(identifiedItems),
        promoCode: appliedPromo?.code || undefined,
        quoteId: quoteId ?? (() => {
          try { return sessionStorage.getItem('lervit_quote_id'); } catch { return null; }
        })(),
      };
      createBookingMutation.mutate(bookingData);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: "instant" });
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

      <div className="min-h-screen pt-16 pb-12 bg-background">
        <div className={step === 1 ? "w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8" : "max-w-5xl mx-auto px-4 sm:px-6"}>

        {referralApplied && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-sm text-green-800 dark:text-green-200 flex items-center gap-2" data-testid="banner-referral-applied">
            <span className="font-medium">$20 referral credit applied!</span> Your friend's code was accepted.
          </div>
        )}

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
          : step === 2
            ? "grid gap-6 xl:grid-cols-[1fr_360px] xl:items-start"
            : "grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start"
        }>
          {/* Map panel — mobile: stacked above form · desktop: fills right column */}
          {step === 1 && (
            <div className="relative order-first lg:order-last rounded-2xl overflow-hidden h-[52vh] lg:h-[calc(100vh-200px)] lg:max-h-[700px] lg:sticky lg:top-20 bg-muted/40 mb-4 lg:mb-0 shadow-sm">
              <div ref={mapDivRefCallback} className="absolute inset-0" />
              {!mapsIsLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/60 backdrop-blur-sm">
                  <div className="text-center text-muted-foreground">
                    <MapPin className="w-7 h-7 mx-auto mb-2 opacity-30" />
                    <p className="text-xs tracking-wide uppercase font-medium">Loading map…</p>
                  </div>
                </div>
              )}
              {visibleMoverCount > 0 && (
                <button
                  type="button"
                  onClick={() => setPillExpanded(v => !v)}
                  data-testid="pill-available-movers"
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    zIndex: 10,
                    background: 'white',
                    color: '#111',
                    borderRadius: 20,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    padding: '6px 12px',
                    fontSize: 13,
                    cursor: 'pointer',
                    border: '1px solid rgba(0,0,0,0.08)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    maxWidth: pillExpanded ? 200 : 60,
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span>🚛</span>
                  {pillExpanded
                    ? `${visibleMoverCount} mover${visibleMoverCount === 1 ? '' : 's'} available nearby`
                    : visibleMoverCount}
                </button>
              )}
              {routeError && (
                <div
                  className="absolute bottom-3 left-3 right-3 z-10 rounded-md bg-amber-50/95 dark:bg-amber-950/80 backdrop-blur px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 shadow-sm text-center"
                  data-testid="text-route-error"
                >
                  {routeError}
                </div>
              )}
            </div>
          )}

          {/* Main Form */}
          <div className={step === 1 ? "order-last lg:order-first lg:flex lg:flex-col" : ""}>
            <Card className={step === 1 ? "shadow-sm lg:flex lg:flex-col lg:h-full" : ""}>
              <CardHeader className={step === 1 ? "pt-4 pb-3 md:pt-6 md:pb-4" : "pb-3"}>
                <h2 className={step === 1 ? "text-xl font-bold tracking-tight" : "text-xl font-bold"}>
                  {step === 1 && "Where is your move?"}
                  {step === 2 && "Load Details"}
                  {step === 3 && "Schedule & Details"}
                </h2>
                {step === 1 && (
                  <p className="text-sm text-muted-foreground">Set pickup and dropoff locations</p>
                )}
                {(step === 2 || step === 3) && pickupAddress && dropoffAddress && (
                  <div className="mt-1 space-y-0.5">
                    {[
                      { label: "Pickup", addr: pickupAddress, color: "bg-green-500" },
                      { label: "Dropoff", addr: dropoffAddress, color: "bg-foreground" },
                    ].map(({ label, addr, color }) => (
                      <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                        <span className="font-medium text-foreground">{label}:</span>
                        <span className="truncate">
                          {addr.split(",")[0].trim()
                            .replace(/\bSoutheast\b/g, "SE")
                            .replace(/\bNortheast\b/g, "NE")
                            .replace(/\bNorthwest\b/g, "NW")
                            .replace(/\bSouthwest\b/g, "SW")}
                        </span>
                      </div>
                    ))}
                  </div>
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
                        <AddressAutocomplete
                          id="pickup"
                          placeholder="Enter pickup address in Calgary"
                          value={pickupAddress}
                          onChange={(address, place) => {
                            setPickupAddress(address);
                            if (place?.geometry?.location) {
                              setPickupCoords({
                                lat: place.geometry.location.lat(),
                                lng: place.geometry.location.lng(),
                              });
                            }
                          }}
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
                        <AddressAutocomplete
                          id="dropoff"
                          placeholder="Enter dropoff address in Calgary"
                          value={dropoffAddress}
                          onChange={(address, place) => {
                            setDropoffAddress(address);
                            if (place?.geometry?.location) {
                              setDropoffCoords({
                                lat: place.geometry.location.lat(),
                                lng: place.geometry.location.lng(),
                              });
                            }
                          }}
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
                            {pickupAddress.split(",")[0].trim().replace(/\bSoutheast\b/g,"SE").replace(/\bNortheast\b/g,"NE").replace(/\bNorthwest\b/g,"NW").replace(/\bSouthwest\b/g,"SW")} → {dropoffAddress.split(",")[0].trim().replace(/\bSoutheast\b/g,"SE").replace(/\bNortheast\b/g,"NE").replace(/\bNorthwest\b/g,"NW").replace(/\bSouthwest\b/g,"SW")}
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
                        value={images}
                        onImagesChange={handleImagesChange} 
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
                            onRemoveItem={handleRemoveItem}
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
                                <p className="text-sm font-semibold text-primary">+$10 Heavy Item Premium</p>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="border-t pt-6">
                          <Label className="text-base font-semibold mb-2 block flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            Number of Movers
                          </Label>
                          {forcedTwoMovers && (
                            <Alert className="mb-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                              <AlertDescription className="text-sm text-amber-900 dark:text-amber-100">
                                <strong>This move requires 2 movers due to volume.</strong> Your adjusted load exceeds the safe single-mover threshold, so 2 movers has been locked in.
                              </AlertDescription>
                            </Alert>
                          )}
                          <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <button
                              type="button"
                              disabled={forcedTwoMovers}
                              aria-disabled={forcedTwoMovers}
                              onClick={() => { if (!forcedTwoMovers) setNumberOfMovers(1); }}
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
                                {forcedTwoMovers && numberOfMovers !== 2 && (
                                  <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                    Required
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
                                setDate(toLocalDT(tomorrow));
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
                                setDate(toLocalDT(tomorrow));
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
                                setDate(toLocalDT(nextWeek));
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
                                setDate(toLocalDT(weekend));
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

                    {/* Availability note */}
                    {date && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
                        <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                        Only movers who marked themselves available on{' '}
                        {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                        will be matched to your booking.
                      </div>
                    )}

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

                    {/* Promo Code Section */}
                    {!!user && (user.promoUsesCount ?? 0) < 2 && (
                      <div className="relative overflow-hidden bg-gradient-to-br from-green-500/20 via-green-500/10 to-transparent border border-green-500/40 rounded-xl p-5">
                        <div className="absolute -right-6 -top-6 w-28 h-28 bg-green-500/15 rounded-full blur-2xl pointer-events-none" />
                        <div className="relative">
                          <div className="flex items-start gap-4 mb-4">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-md shadow-green-500/30 flex-shrink-0">
                              <Gift className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-green-700 dark:text-green-400">Save 10% on this move</h3>
                                <Badge className="bg-green-500 text-white text-[10px] px-2 shrink-0">
                                  <Sparkles className="w-2.5 h-2.5 mr-1" />
                                  LERVIT10
                                </Badge>
                              </div>
                              <p className="text-sm text-green-700/70 dark:text-green-500 mt-0.5">
                                {appliedPromo?.valid
                                  ? `${appliedPromo.discountPercent}% discount applied to your total`
                                  : "Enter code LERVIT10 below — valid on your first Move"}
                              </p>
                            </div>
                          </div>

                          {appliedPromo?.valid ? (
                            <div className="flex items-center justify-between py-2.5 px-4 bg-white/40 dark:bg-green-900/20 rounded-lg border border-green-500/30" data-testid="step3-promo-applied">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                                <span className="text-sm font-bold text-green-700 dark:text-green-400">
                                  {appliedPromo.code}
                                </span>
                                <span className="text-sm text-green-600 dark:text-green-400">
                                  — {appliedPromo.discountPercent}% off applied
                                </span>
                              </div>
                              <button
                                onClick={() => { setAppliedPromo(null); setPromoError(null); }}
                                className="text-green-600/60 hover:text-destructive transition-colors"
                                data-testid="button-remove-promo-step3"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600 dark:text-green-400" />
                                  <Input
                                    placeholder="e.g. LERVIT10"
                                    value={promoInput}
                                    onChange={(e) => {
                                      setPromoInput(e.target.value.toUpperCase());
                                      setPromoError(null);
                                    }}
                                    onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                                    className="pl-9 text-sm border-green-500/40 bg-white/50 dark:bg-green-950/20 focus-visible:ring-green-500/30"
                                    data-testid="input-promo-code-step3"
                                  />
                                </div>
                                <Button
                                  type="button"
                                  onClick={handleApplyPromo}
                                  disabled={!promoInput.trim() || promoLoading}
                                  className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                                  data-testid="button-apply-promo-step3"
                                >
                                  {promoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                                </Button>
                              </div>
                              {promoError && (
                                <p className="text-xs text-destructive pl-1" data-testid="text-promo-error-step3">{promoError}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Navigation buttons — only shown inside the card on Step 1 */}
                {step === 1 && (
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
                      Next
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: Live Pricing Summary + nav buttons (steps 2 & 3) */}
          {step > 1 && (
            <div className="flex flex-col gap-4 lg:sticky lg:top-20">
              <PricingSummary
                breakdown={priceBreakdown}
                isCalculating={isCalculatingPrice}
                error={pricingError}
                showPromoInput={false}
                appliedPromo={appliedPromo}
                onPromoApplied={setAppliedPromo}
                contactCaptured={contactCaptured || !!user}
                isLoggedIn={!!user}
                onContactCapture={handleContactCapture}
              />
              <div className="flex justify-between gap-4">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  className="hover-elevate active-elevate-2 flex-1"
                  data-testid="button-back"
                  disabled={createBookingMutation.isPending}
                >
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  className="flex-1"
                  data-testid="button-next"
                  disabled={createBookingMutation.isPending}
                >
                  {step === 3 && createBookingMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Finding Movers...
                    </>
                  ) : step === 3 ? "Find Movers" : "Next"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    </>
  );
}
