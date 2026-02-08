# 05 — Decision Orchestration

**Version:** 1.0  
**Date:** February 8, 2026

---

This document describes the three core decision systems that power the LervIT platform: **Dynamic Pricing**, **Vehicle-Fit Classification**, and **Proximity Matching**.

---

## 1. Dynamic Pricing (PrecisionMatch Pricing)

### Inputs
- Pickup-to-dropoff driving distance (km, from Google Maps)
- Load size category (Boxes, Medium, Large, Apartment)
- Pickup access difficulty (Ground, Basement, Stairs, Elevator)
- Dropoff access difficulty (Ground, Basement, Stairs, Elevator)
- Number of movers (1 or 2)
- Mover-to-pickup distance (km, optional — for mover travel surcharge)
- Total item volume (ft³, optional — for precise vehicle class determination)

### Outputs
- Price breakdown: base fee, distance fee, load size fee, access fees, mover travel fee
- Total cost (CAD)
- Vehicle class recommendation (A through E)
- Mover earnings estimate (85% of total)

### Pricing Formula (Pseudocode)

```
FUNCTION calculatePrice(distance, loadSize, pickupAccess, dropoffAccess, numMovers, moverDistance, volume):

    // Step 1: Determine vehicle class
    IF volume is provided:
        vehicleClass = classifyByVolume(volume)
        // 0-20 ft³ → A, 21-165 ft³ → C, 166-300 ft³ → D, >300 ft³ → E
    ELSE:
        vehicleClass = classifyByLoadSize(loadSize)
        // boxes → A, medium → C, large → D, apartment → E

    // Step 2: Look up class-specific rates
    config = VEHICLE_CLASSES[vehicleClass]
    baseFee = config.baseFee       // $10 to $40 depending on class
    perKmRate = config.perKmRate   // $0.90 to $2.00/km depending on class

    // Step 3: Calculate component fees
    distanceFee = distance * perKmRate
    loadSizeFee = LOAD_SIZE_FEES[loadSize]   // $5 to $45
    pickupFee = ACCESS_FEES[pickupAccess]     // $0 to $10
    dropoffFee = ACCESS_FEES[dropoffAccess]   // $0 to $10

    // Step 4: Mover travel surcharge (beyond 5km free radius)
    moverTravelFee = 0
    IF moverDistance > 5km:
        moverTravelFee = (moverDistance - 5) * $0.75/km

    // Step 5: Subtotal
    subtotal = baseFee + distanceFee + loadSizeFee + pickupFee + dropoffFee + moverTravelFee

    // Step 6: Multi-mover multiplier
    IF numMovers == 2:
        total = subtotal * 1.30   // 30% surcharge for 2-mover jobs
    ELSE:
        total = subtotal

    RETURN priceBreakdown
```

### Vehicle Class Configuration

| Class | Vehicle Type | Volume Range | Base Fee | Per-km Rate |
|-------|-------------|--------------|----------|-------------|
| A | SUV / Small Vehicle | 0–20 ft³ | $10.00 | $0.90 |
| C | Cargo Van | 21–165 ft³ | $15.00 | $1.25 |
| D | Pickup Truck / Small Moving Truck | 166–300 ft³ | $20.00 | $1.60 |
| E | Moving Truck (Large) | 301–600 ft³ | $40.00 | $2.00 |

*Note: Class B has been deprecated and merged into Class C.*

---

## 2. Vehicle-Fit Classification (AI Vision Pipeline)

### Overview

The Vision Engine 2.0 uses a 3-layer system to identify furniture from customer photos and determine the appropriate vehicle class.

### Pipeline (Pseudocode)

```
FUNCTION identifyItem(photoUrl):

    // LAYER 1: AI Detection
    imageBase64 = convertToBase64(photoUrl)   // Handles JPEG, PNG, HEIC
    visionResult = callGPT4oVision(imageBase64)
    // Returns: itemName, category, subcategory, estimated dimensions, weight

    // LAYER 1.5: Category Correction
    // Fix AI misclassifications using keyword detection
    correctedCategory = applyKeywordRules(visionResult.itemName, visionResult.category)
    // e.g., "pair of accent chairs" → category = Chair (not Appliance)

    // LAYER 1.6: Quantity Detection
    quantity = detectQuantity(visionResult.itemName)
    // e.g., "pair of chairs" → quantity = 2

    // LAYER 2: Ground-Truth Database Matching
    match = searchFurnitureDatabase(visionResult.itemName)
    IF match.similarity >= 0.70:
        USE match.item.dimensions, weight, vehicleType, movers
        // Ground-truth values from 50+ verified furniture entries
    ELSE:
        // LAYER 3: Estimation with Dimension Corrections
        correctedDimensions = clampDimensions(
            visionResult.category,
            visionResult.estimatedDimensions
        )
        // Apply category-specific min/max rules to prevent unrealistic values

    // Calculate volume and classify
    volume = (length * width * height) / 28316.85   // cm³ → ft³
    volume = enforceMinimumVolume(category, volume)
    loadSize = classifyByVolume(volume)
    vehicleClass = getVehicleClassFromVolume(volume)

    RETURN identificationResult with confidence score and source metadata
```

### Ground-Truth Database

The furniture database contains verified specifications for 50+ common items including:
- **Beds:** Twin, Full/Double, Queen, King (frames and mattresses)
- **Seating:** Armchairs, loveseats, 3-seaters, L-shaped sectionals, recliners
- **Tables:** Coffee tables, dining tables (4/6/8-seat), desks
- **Storage:** Dressers, bookshelves, wardrobes, nightstands
- **Appliances:** Refrigerators, washers, dryers, dishwashers, stoves, mini fridges, freezers
- **Electronics:** TVs (32" to 85"), gaming consoles
- **Outdoor:** BBQ grills, patio sets

Each entry includes: exact dimensions (cm), weight (kg), volume (ft³), recommended vehicle type, minimum movers, and handling complexity.

### Weight Override Logic

For exceptionally heavy items, weight overrides the volume-based vehicle recommendation:
- Items >150 kg → Moving Truck tier (regardless of volume)
- Items >100 kg → Pickup Truck tier (minimum)

---

## 3. Proximity Matching

### Inputs
- Pickup coordinates (latitude, longitude)
- Dropoff coordinates (latitude, longitude)
- Required load size / vehicle class
- List of available movers with GPS coordinates

### Outputs
- Ranked list of top 5 nearest compatible movers
- Each with: distance to pickup, ETA, estimated earnings, price breakdown

### Algorithm (Pseudocode)

```
FUNCTION findNearestMovers(pickupCoords, dropoffCoords, loadSize, availableMovers, config):

    // Step 1: Determine required vehicle type
    requiredVehicle = getVehicleTypeForLoadSize(loadSize)
    compatibleTypes = getSingleTierCompatibility(requiredVehicle)
    // e.g., if loadSize needs 'van', compatible = ['van', 'pickup']
    // Only ONE tier upgrade allowed to prevent mismatches

    // Step 2: Filter movers
    candidates = []
    FOR EACH mover IN availableMovers:
        IF mover.isAvailable == false: SKIP
        IF mover.latitude is null: SKIP
        IF mover.vehicleType NOT IN compatibleTypes: SKIP

        // Calculate straight-line distance
        distance = haversineDistance(mover.location, pickupCoords)
        IF distance > config.maxRadiusKm (50km): SKIP

        candidates.ADD(mover, distance)

    // Step 3: Sort by distance (nearest first)
    candidates.SORT_BY(distance, ascending)

    // Step 4: Limit to top N movers
    topMovers = candidates.TAKE(config.maxMoversToNotify)  // default: 5

    // Step 5: Calculate earnings for each mover
    FOR EACH mover IN topMovers:
        priceBreakdown = calculatePrice(
            pickupToDropoffDistance,
            loadSize,
            pickupDifficulty,
            dropoffDifficulty,
            numberOfMovers,
            mover.distanceToPickup
        )
        mover.estimatedEarnings = priceBreakdown.totalCost * 0.85

    RETURN topMovers
```

### Matching Configuration

| Parameter | Default Value | Description |
|-----------|---------------|-------------|
| Initial Radius | 15 km | Starting search radius |
| Max Radius | 50 km | Maximum search radius |
| Radius Expansion Step | 10 km | Increment if not enough movers found |
| Max Movers to Notify | 5 | Maximum notifications per booking |

### Vehicle Compatibility (Single-Tier Upgrade)

To prevent extreme mismatches (e.g., sending an SUV for a full apartment move), the system only allows a single-tier vehicle upgrade:

| Required Vehicle | Compatible Vehicles |
|-----------------|-------------------|
| Car/SUV | Car, Van |
| Van | Van, Pickup |
| Pickup | Pickup, Truck |
| Truck | Truck only |

### Job Notification Expiry

- Each job notification has a **10-minute expiry window**.
- If no mover accepts within the expiry, the notification becomes invalid.
- The booking remains in `pending` status for potential re-matching.
- Mover can explicitly decline, marking the notification as `declined` and preventing re-acceptance.
