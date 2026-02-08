# 11 — Appendix: Representative Snippets

**Version:** 1.0  
**Date:** February 8, 2026

---

## Redaction Notice

All snippets in this appendix have been reviewed to confirm:
- No API keys, tokens, passwords, or environment variable values are included
- No database connection strings are included
- No webhook signing secrets are included
- Snippets are limited to 30–60 lines each
- Code is shown to demonstrate authorship of system expressions, not to enable reproduction

---

## Snippet 1: Vehicle Class Configuration (Pricing)

**File:** `shared/pricing.ts`  
**Purpose:** Defines the vehicle class-based pricing model — the single source of truth for all pricing across the platform.

```typescript
export type VehicleClass = 'A' | 'B' | 'C' | 'D' | 'E';

export interface VehicleClassConfig {
  class: VehicleClass;
  name: string;
  vehicleType: string;
  volumeRangeMin: number;  // ft³
  volumeRangeMax: number;  // ft³
  baseFee: number;         // CAD
  perKmRate: number;       // CAD per km
  loadType: string;
  examples: string;
}

export const VEHICLE_CLASSES: Record<VehicleClass, VehicleClassConfig> = {
  A: {
    class: 'A',
    name: 'SUV / Small Vehicle',
    vehicleType: 'car',
    volumeRangeMin: 0,
    volumeRangeMax: 20,
    baseFee: 10.00,
    perKmRate: 0.90,
    loadType: 'Small items, single chairs',
    examples: '1-4 boxes, single chair, small items',
  },
  C: {
    class: 'C',
    name: 'Cargo Van',
    vehicleType: 'van',
    volumeRangeMin: 21,
    volumeRangeMax: 165,
    baseFee: 15.00,
    perKmRate: 1.25,
    loadType: 'Medium to large furniture loads',
    examples: 'Sofa, mattress, bedroom set',
  },
  // Classes D and E follow the same pattern with increasing rates
};
```

**Redaction:** No secrets present in this snippet.

---

## Snippet 2: Booking State Machine (Schema)

**File:** `shared/schema.ts`  
**Purpose:** Defines the booking lifecycle state machine with valid transitions enforced across frontend and backend.

```typescript
export const BOOKING_STATUSES = {
  PENDING_PAYMENT: "pending_payment",
  PAYMENT_FAILED: "payment_failed",
  PENDING: "pending",
  CONFIRMED: "confirmed",
  EN_ROUTE_TO_PICKUP: "en_route_to_pickup",
  LOADING: "loading",
  EN_ROUTE_TO_DROPOFF: "en_route_to_dropoff",
  UNLOADING: "unloading",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BOOKING_STATUSES.PENDING_PAYMENT]: [BOOKING_STATUSES.PENDING, BOOKING_STATUSES.PAYMENT_FAILED, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.PAYMENT_FAILED]: [BOOKING_STATUSES.PENDING_PAYMENT, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.PENDING]: [BOOKING_STATUSES.CONFIRMED, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.CONFIRMED]: [BOOKING_STATUSES.EN_ROUTE_TO_PICKUP, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.EN_ROUTE_TO_PICKUP]: [BOOKING_STATUSES.LOADING, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.LOADING]: [BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF]: [BOOKING_STATUSES.UNLOADING, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.UNLOADING]: [BOOKING_STATUSES.COMPLETED, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.COMPLETED]: [],
  [BOOKING_STATUSES.CANCELLED]: [],
};

export function isValidStatusTransition(from: string, to: string): boolean {
  const validTransitions = BOOKING_STATUS_TRANSITIONS[from as BookingStatus];
  return validTransitions?.includes(to as BookingStatus) ?? false;
}
```

**Redaction:** No secrets present in this snippet.

---

## Snippet 3: Platform Fee Calculation (Stripe)

**File:** `server/config/stripe.ts`  
**Purpose:** Demonstrates the platform's fee splitting logic — 15% platform commission with the mover receiving 85%.

```typescript
export const PLATFORM_COMMISSION = {
  DEFAULT_PERCENT: 15.00,
};

export function calculatePlatformFee(
  grossAmount: number,
  _vehicleClass?: string
): {
  grossAmountCents: number;
  platformFeePercent: number;
  platformFeeCents: number;
  moverPayoutCents: number;
} {
  const grossAmountCents = Math.round(grossAmount * 100);
  const platformFeePercent = PLATFORM_COMMISSION.DEFAULT_PERCENT;
  const platformFeeCents = Math.round(grossAmountCents * (platformFeePercent / 100));
  const moverPayoutCents = grossAmountCents - platformFeeCents;

  return {
    grossAmountCents,
    platformFeePercent,
    platformFeeCents,
    moverPayoutCents,
  };
}
```

**Redaction:** Stripe secret key initialization removed. Only the fee calculation logic is shown.

---

## Snippet 4: Vehicle Compatibility for Matching

**File:** `shared/matching.ts`  
**Purpose:** Demonstrates the single-tier vehicle upgrade system that prevents extreme mismatches (e.g., sending a car for a truck-sized load).

```typescript
const VEHICLE_PRIORITY_ORDER: VehicleType[] = ['car', 'van', 'pickup', 'truck'];

function getSingleTierCompatibility(baseType: VehicleType): VehicleType[] {
  const index = VEHICLE_PRIORITY_ORDER.indexOf(baseType);
  if (index === -1) return [VEHICLE_PRIORITY_ORDER[0]];

  // If already at largest tier, only that one
  if (index === VEHICLE_PRIORITY_ORDER.length - 1) {
    return [baseType];
  }

  // Return base type + ONE tier higher
  return [baseType, VEHICLE_PRIORITY_ORDER[index + 1]];
}

// Usage examples:
// getSingleTierCompatibility('car')    → ['car', 'van']
// getSingleTierCompatibility('van')    → ['van', 'pickup']
// getSingleTierCompatibility('pickup') → ['pickup', 'truck']
// getSingleTierCompatibility('truck')  → ['truck']
```

**Redaction:** No secrets present in this snippet.

---

## Snippet 5: Vision Engine Pipeline Entry Point (Pseudocode)

**File:** `server/vision-engine-v2.ts`  
**Purpose:** Shows the orchestration logic of the 3-layer AI identification pipeline. Presented as pseudocode to protect implementation details.

```
FUNCTION identifyItemV2(photoUrl):
    startTime = now()

    // LAYER 1: Convert image and detect via GPT-4o Vision
    imageBase64 = convertToBase64(photoUrl)        // Supports JPEG, PNG, HEIC
    visionResult = detectItemWithVision(imageBase64) // GPT-4o Vision API call

    // LAYER 1.5: Fix AI misclassifications
    correctedCategory = applyCategoryCorrection(visionResult.itemName, visionResult.category)
    quantity = detectQuantity(visionResult.itemName) // "pair of chairs" → 2

    // LAYER 2: Match against ground-truth furniture database
    databaseMatch = searchFurnitureDatabase(visionResult.itemName)

    IF databaseMatch.similarity >= THRESHOLD (0.70):
        USE databaseMatch.dimensions, weight, vehicleType
        source = "ground_truth_database"
        confidence = databaseMatch.similarity
    ELSE:
        // LAYER 3: Use AI estimates with dimension corrections
        correctedDimensions = clampByCategory(visionResult.estimatedDimensions)
        volume = calculateVolume(correctedDimensions)
        volume = enforceMinimumVolume(category, volume)
        source = "vision_ai_corrected"

    // Classify and recommend
    loadSize = classifyByVolume(volume)
    vehicleClass = getVehicleClassFromVolume(volume)

    RETURN result with confidence, source, and processingTime
```

**Redaction:** OpenAI API key usage, prompt text, and detailed implementation removed. Only orchestration logic is shown.
