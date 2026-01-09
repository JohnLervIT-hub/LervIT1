# LervIT Vision Engine - Development Scope

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Status:** Planning

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Vision Engine 2.0 (Current)](#vision-engine-20-current)
3. [Vision Engine 3.0 (AR Room Scanner)](#vision-engine-30-ar-room-scanner)
4. [Technical Comparison](#technical-comparison)
5. [Implementation Roadmap](#implementation-roadmap)
6. [Risk Assessment](#risk-assessment)

---

## Executive Summary

The LervIT Vision Engine is an AI-powered system that analyzes photos of furniture and household items to automatically estimate dimensions, weight, volume, and recommend appropriate vehicles for moving. This document outlines the current V2.0 capabilities and the proposed V3.0 "AR Room Scanner" upgrade.

### Business Value

| Metric | Without Vision Engine | With V2.0 | With V3.0 (Projected) |
|--------|----------------------|-----------|----------------------|
| Quote accuracy | 60-70% | 85-92% | 95%+ |
| Time to quote | 5-10 minutes | 30 seconds | 10 seconds |
| Customer drop-off | 40% | 25% | 10% |
| Mover disputes | High | Low | Minimal |

---

## Vision Engine 2.0 (Current)

### Overview

Vision Engine 2.0 is a **3-layer hybrid AI system** that combines GPT-4o Vision with a ground-truth furniture database and dimension correction rules. It's currently deployed in production.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    VISION ENGINE 2.0                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │   LAYER 1    │    │     LAYER 2      │    │    LAYER 3    │  │
│  │   GPT-4o     │───▶│   Database       │───▶│   Dimension   │  │
│  │   Vision     │    │   Matching       │    │   Correction  │  │
│  └──────────────┘    └──────────────────┘    └───────────────┘  │
│        │                     │                      │            │
│        ▼                     ▼                      ▼            │
│  Category Detection    Similarity Match      Clamp Rules        │
│  Item Identification   Ground-Truth Data     Validation         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Details

#### Layer 1: GPT-4o Vision (Category Detection)

**Purpose:** Identify what's in the photo

**Input:** Single photo (JPEG, PNG, HEIC supported)

**Output:**
- Item name (e.g., "3-seater leather sofa")
- Category (Furniture, Appliance, Electronics, Fragile, etc.)
- Subcategory (Seating, Bedroom, Kitchen, etc.)
- Quantity detection (e.g., "pair of dining chairs" = 2)
- Material detection (wood, metal, fabric, glass)
- Initial dimension estimate

**Technology:**
- OpenAI GPT-4o Vision API
- HEIC to JPEG conversion (iPhone support)
- Object Storage integration (cloud image handling)

**Accuracy:** 85-90% for category/item identification

---

#### Layer 2: Ground-Truth Furniture Database

**Purpose:** Provide consistent, verified specifications

**Database Contents:**
- 50+ common furniture items
- Verified dimensions (length × width × height in cm)
- Verified weights (kg)
- Load size classification (small, medium, large)
- Vehicle recommendations
- Mover requirements (1 or 2 movers)
- Handling complexity ratings

**Sample Entry:**
```typescript
{
  id: "sofa_3_seater",
  name: "3-Seater Sofa",
  category: "Furniture",
  subcategory: "Seating",
  dimensions: { length_cm: 220, width_cm: 95, height_cm: 85 },
  weight_kg: 75,
  volume_ft3: 6.2,
  load_size: "large",
  vehicle: "Cargo Van",
  movers_required: 2,
  handling_complexity: "medium"
}
```

**Matching Algorithm:**
- Text-based similarity matching
- Threshold: 70% similarity for database match
- High confidence: 85%+ similarity

**Benefit:** Same item type always returns consistent results

---

#### Layer 3: Dimension Correction Rules

**Purpose:** Prevent unrealistic AI estimates

**Problem Solved:**
- AI might estimate a sofa as 500cm long (camera angle distortion)
- AI might underestimate weight for heavy items

**Correction Rules:**
| Category | Length Range | Width Range | Height Range | Max Weight |
|----------|-------------|-------------|--------------|------------|
| Sofa | 150-280cm | 70-120cm | 70-100cm | 150kg |
| Bed Frame | 180-220cm | 90-200cm | 30-60cm | 80kg |
| Dining Table | 100-300cm | 80-120cm | 70-80cm | 100kg |
| Refrigerator | 50-100cm | 60-90cm | 150-200cm | 120kg |
| Wardrobe | 80-250cm | 50-70cm | 180-220cm | 150kg |

**Process:**
1. If AI estimate exceeds range, clamp to max/min
2. Log correction for analytics
3. Apply weight validation based on category

---

### V2.0 Output Structure

```typescript
interface VisionEngineResult {
  itemName: string;              // "Queen Size Bed Frame"
  category: string;              // "Furniture"
  subcategory: string;           // "Bedroom"
  quantity: number;              // 1
  dimensions: {
    length_cm: number;           // 203
    width_cm: number;            // 152
    height_cm: number;           // 35
  };
  perItemVolumeFt3: number;      // 3.8
  perItemWeightKg: number;       // 45
  volume_ft3: number;            // 3.8 (total)
  weight_kg: number;             // 45 (total)
  load_size: "small" | "medium" | "large";
  vehicle: "Sedan" | "SUV" | "Minivan" | "Pickup Truck" | "Cargo Van" | "Moving Truck";
  movers_required: 1 | 2;
  handling_complexity: "low" | "medium" | "high" | "very_high";
  insurance_level: "standard" | "medium" | "high" | "premium";
  confidence: number;            // 0.0 - 1.0
  source: "database_match" | "vision_estimate" | "fallback";
  matchedItem?: string;          // Database item ID if matched
  corrections?: string[];        // Any corrections applied
  processingTime: number;        // ms
}
```

---

### V2.0 Current Capabilities

| Feature | Status | Notes |
|---------|--------|-------|
| Single photo analysis | ✅ Complete | Production ready |
| HEIC/HEIF support | ✅ Complete | iPhone photos work |
| Object Storage integration | ✅ Complete | Cloud image handling |
| Ground-truth database | ✅ Complete | 50+ items |
| Dimension correction | ✅ Complete | Category-specific rules |
| Quantity detection | ✅ Complete | "Pair of chairs" = 2 |
| Confidence scoring | ✅ Complete | 3-tier source tracking |
| Vehicle recommendation | ✅ Complete | Smart matching |
| Async processing queue | ✅ Complete | Non-blocking |

---

### V2.0 Known Limitations

1. **Single photo only** - Cannot combine multiple angles
2. **No room context** - Doesn't understand room type
3. **Manual upload required** - No real-time camera
4. **One item per photo** - Struggles with cluttered scenes
5. **No AR overlay** - Users can't see detection in real-time
6. **Limited furniture database** - 50 items, needs expansion

---

## Vision Engine 3.0 (AR Room Scanner)

### Overview

Vision Engine 3.0 extends V2.0 with **Augmented Reality room scanning**, allowing users to point their phone at a room and have all items automatically detected, measured, and inventoried.

### Vision Statement

> "Point your phone at any room and get an instant, accurate moving quote - no typing, no guessing, no surprises."

---

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       VISION ENGINE 3.0 (AR Room Scanner)                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        AR LAYER (NEW)                               │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │   Camera     │  │   Depth      │  │   AR         │              │ │
│  │  │   Feed       │──│   Sensing    │──│   Overlay    │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  │         │                 │                 │                       │ │
│  │         ▼                 ▼                 ▼                       │ │
│  │    Frame Capture    LiDAR/ToF Data    Real-time UI                 │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    DETECTION LAYER (NEW)                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │   YOLO v8    │  │   Segment    │  │   Multi-     │              │ │
│  │  │   Detection  │──│   Anything   │──│   Object     │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  │         │                 │                 │                       │ │
│  │         ▼                 ▼                 ▼                       │ │
│  │   Bounding Boxes    Precise Masks    Tracking IDs                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    V2.0 ENGINE (EXISTING)                           │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │   GPT-4o     │  │   Database   │  │   Dimension  │              │ │
│  │  │   Vision     │──│   Matching   │──│   Correction │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    OUTPUT LAYER                                     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │   Room       │  │   Full       │  │   Instant    │              │ │
│  │  │   Inventory  │──│   Volume     │──│   Quote      │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### New Components in V3.0

#### Component 1: AR Camera Layer

**Purpose:** Real-time camera feed with AR overlays

**Technologies:**
- **iOS:** ARKit + RoomPlan API
- **Android:** ARCore + Depth API
- **Web (Progressive):** WebXR + MediaPipe

**Features:**
| Feature | Description |
|---------|-------------|
| Live camera feed | Real-time video processing |
| Depth sensing | LiDAR (iPhone Pro) or ToF sensors |
| Object highlighting | Colored overlays on detected items |
| Dimension display | Show measurements in AR view |
| Room boundary detection | Understand walls, floors, ceilings |

---

#### Component 2: Real-Time Detection Layer

**Purpose:** Fast, local object detection

**Models:**
| Model | Purpose | Speed | Accuracy |
|-------|---------|-------|----------|
| YOLOv8 Nano | Fast detection | 30 FPS | 80% |
| YOLOv8 Small | Better accuracy | 20 FPS | 85% |
| Segment Anything (SAM) | Precise boundaries | 5 FPS | 95% |

**Features:**
- Runs on-device (no internet required for detection)
- Object tracking across frames
- Deduplication (same item from different angles)
- Occlusion handling (partially hidden items)

---

#### Component 3: Multi-Room Aggregation

**Purpose:** Combine scans from multiple rooms

**Process:**
1. Scan living room → Save inventory
2. Scan bedroom → Add to inventory
3. Scan kitchen → Add to inventory
4. Generate complete home inventory
5. Calculate total volume and quote

**Data Structure:**
```typescript
interface RoomScan {
  roomId: string;
  roomType: "living_room" | "bedroom" | "kitchen" | "bathroom" | "garage" | "other";
  items: VisionEngineResult[];
  scanDuration: number;
  completeness: number;  // 0-100%
  scannedAt: Date;
}

interface HomeScan {
  homeId: string;
  rooms: RoomScan[];
  totalItems: number;
  totalVolumeFt3: number;
  totalWeightKg: number;
  recommendedVehicle: string;
  recommendedMovers: number;
  estimatedPrice: {
    min: number;
    max: number;
  };
  createdAt: Date;
}
```

---

#### Component 4: Smart Room Context

**Purpose:** Understand room type and adjust detection

**Room-Specific Logic:**
| Room Type | Expected Items | Priority Detection |
|-----------|---------------|-------------------|
| Living Room | Sofas, coffee tables, TV stands | Large furniture first |
| Bedroom | Beds, dressers, nightstands | Bed frame detection priority |
| Kitchen | Appliances, table, chairs | Appliances prioritized |
| Garage | Tools, boxes, sports equipment | Boxes and bulk items |
| Office | Desks, chairs, bookshelves | Electronics handling |

---

### V3.0 User Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     AR ROOM SCANNER USER FLOW                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. LAUNCH                                                        │
│     ┌─────────────────┐                                          │
│     │  "Scan My Home" │                                          │
│     │     Button      │                                          │
│     └────────┬────────┘                                          │
│              ▼                                                    │
│  2. SELECT ROOM                                                   │
│     ┌─────────────────┐                                          │
│     │ "What room are  │                                          │
│     │  you scanning?" │                                          │
│     │ [Living Room]   │                                          │
│     │ [Bedroom]       │                                          │
│     │ [Kitchen]       │                                          │
│     └────────┬────────┘                                          │
│              ▼                                                    │
│  3. SCAN                                                          │
│     ┌─────────────────────────────────────────┐                  │
│     │  ┌───────────────────────────────────┐  │                  │
│     │  │         AR CAMERA VIEW            │  │                  │
│     │  │                                   │  │                  │
│     │  │    ┌─────────┐  ┌─────────┐      │  │                  │
│     │  │    │  SOFA   │  │  TABLE  │      │  │                  │
│     │  │    │ 220×95  │  │ 120×60  │      │  │                  │
│     │  │    └─────────┘  └─────────┘      │  │                  │
│     │  │                                   │  │                  │
│     │  │         ┌─────────┐              │  │                  │
│     │  │         │   TV    │              │  │                  │
│     │  │         │  55"    │              │  │                  │
│     │  │         └─────────┘              │  │                  │
│     │  │                                   │  │                  │
│     │  └───────────────────────────────────┘  │                  │
│     │                                         │                  │
│     │  Items Found: 3   Volume: 12.5 ft³     │                  │
│     │  ───────────────────────────────────── │                  │
│     │  [Add More Rooms]  [Done Scanning]     │                  │
│     └─────────────────────────────────────────┘                  │
│              ▼                                                    │
│  4. REVIEW INVENTORY                                              │
│     ┌─────────────────────────────────────────┐                  │
│     │  COMPLETE HOME INVENTORY                │                  │
│     │  ─────────────────────────              │                  │
│     │  Living Room (3 items)                  │                  │
│     │    • 3-Seater Sofa - 6.2 ft³           │                  │
│     │    • Coffee Table - 1.8 ft³            │                  │
│     │    • 55" TV - 0.8 ft³                  │                  │
│     │                                         │                  │
│     │  Bedroom (4 items)                      │                  │
│     │    • Queen Bed - 4.5 ft³               │                  │
│     │    • 2× Nightstands - 1.2 ft³          │                  │
│     │    • Dresser - 3.8 ft³                 │                  │
│     │  ─────────────────────────              │                  │
│     │  TOTAL: 7 items | 18.3 ft³ | ~380 kg   │                  │
│     │  Vehicle: Cargo Van                     │                  │
│     │  Movers: 2 recommended                  │                  │
│     └─────────────────────────────────────────┘                  │
│              ▼                                                    │
│  5. GET QUOTE                                                     │
│     ┌─────────────────────────────────────────┐                  │
│     │  YOUR INSTANT QUOTE                     │                  │
│     │  ─────────────────────────              │                  │
│     │         $185 - $220                     │                  │
│     │                                         │                  │
│     │  Based on:                              │                  │
│     │  • 18.3 ft³ total volume               │                  │
│     │  • 12.5 km distance                     │                  │
│     │  • 2 movers required                    │                  │
│     │                                         │                  │
│     │  [Book Now]  [Save for Later]          │                  │
│     └─────────────────────────────────────────┘                  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

### V3.0 Development Phases

#### Phase 1: Multi-Image Upload (2-3 weeks)
**Scope:** Allow users to upload multiple photos for one room

**Deliverables:**
- [ ] Multi-image upload UI component
- [ ] Image gallery with remove/reorder
- [ ] Batch processing API endpoint
- [ ] Item deduplication logic
- [ ] Aggregated room inventory view
- [ ] Combined volume calculation

**Technical:**
- Extend existing booking flow
- Reuse V2.0 engine for each image
- Add server-side aggregation

---

#### Phase 2: Room Context Intelligence (2 weeks)
**Scope:** Add room type selection with optimized detection

**Deliverables:**
- [ ] Room type selector UI
- [ ] Room-specific detection prompts
- [ ] Expected items suggestions
- [ ] Room templates database
- [ ] "Typical room" baseline comparison

**Technical:**
- Update GPT-4o prompt templates
- Add room context to database schema
- Implement suggestion engine

---

#### Phase 3: WebAR Integration (4-6 weeks)
**Scope:** Real-time camera detection in browser

**Deliverables:**
- [ ] Camera access with WebRTC
- [ ] MediaPipe object detection
- [ ] Real-time bounding box overlay
- [ ] Frame capture and analysis
- [ ] Progressive enhancement (works without AR)

**Technical:**
- MediaPipe TFJS integration
- Custom detection model training
- WebGL rendering for overlays
- Fallback to manual upload

---

#### Phase 4: Native AR (iOS/Android) (3-6 months)
**Scope:** Full AR experience with depth sensing

**Deliverables:**
- [ ] iOS app with ARKit RoomPlan
- [ ] Android app with ARCore
- [ ] LiDAR depth integration
- [ ] 3D room reconstruction
- [ ] Precise measurements (1-2cm accuracy)
- [ ] Offline detection capability

**Technical:**
- React Native or Flutter wrapper
- Native AR SDK integration
- On-device ML models
- Cloud sync for inventory

---

### V3.0 Required Resources

#### AI/ML Models

| Model | Purpose | Size | License |
|-------|---------|------|---------|
| YOLOv8 Nano | Fast detection | 6.3MB | AGPL-3.0 |
| YOLOv8 Small | Better accuracy | 28.2MB | AGPL-3.0 |
| Segment Anything (Mobile) | Segmentation | 40MB | Apache 2.0 |
| MobileNet V3 | Classification | 5.4MB | Apache 2.0 |
| GPT-4o Vision | Understanding | API | Commercial |

#### Training Data Needed

| Dataset | Purpose | Est. Images |
|---------|---------|-------------|
| Calgary Furniture | Local furniture styles | 5,000+ |
| Room Contexts | Room type classification | 2,000+ |
| Moving Scenarios | Packed/unpacked items | 1,000+ |
| Edge Cases | Unusual items | 500+ |

#### Infrastructure

| Component | Current | Required for V3.0 |
|-----------|---------|-------------------|
| API Processing | 5 req/sec | 50 req/sec |
| Storage | 50GB | 500GB |
| GPU (inference) | None | 1× T4 or equivalent |
| CDN | Basic | Edge caching |

---

## Technical Comparison

### V2.0 vs V3.0 Side-by-Side

| Feature | V2.0 (Current) | V3.0 (AR Scanner) |
|---------|----------------|-------------------|
| **Input** | Single photo upload | Live camera feed + multi-photo |
| **Detection** | Server-side only | On-device + server hybrid |
| **Speed** | 3-5 seconds/image | Real-time (30 FPS) |
| **Accuracy** | 90-92% | 95%+ |
| **Depth Sensing** | None | LiDAR/ToF supported |
| **AR Overlay** | None | Real-time highlighting |
| **Multi-Item** | 1 item/photo | Unlimited items/scan |
| **Room Context** | None | Full room understanding |
| **Offline** | No | Partial (detection only) |
| **Platform** | Web only | Web + iOS + Android |
| **Inventory** | Per-booking | Saved home profiles |
| **User Effort** | Upload each item | Walk through room |

---

### Accuracy Comparison

| Scenario | V2.0 | V3.0 (Projected) |
|----------|------|------------------|
| Single furniture item | 92% | 95% |
| Multiple items in photo | 75% | 90% |
| Cluttered room | 60% | 85% |
| Complete room inventory | N/A | 90% |
| Dimension accuracy | ±10% | ±3% |
| Weight estimation | ±15% | ±8% |
| Vehicle recommendation | 90% | 97% |

---

## Implementation Roadmap

```
Q1 2026                    Q2 2026                    Q3 2026
─────────────────────────────────────────────────────────────────
│ Phase 1: Multi-Image │ Phase 2: Room     │ Phase 3: WebAR    │
│ - Multi-upload UI    │ - Room types      │ - Camera access   │
│ - Batch processing   │ - Context AI      │ - MediaPipe       │
│ - Deduplication      │ - Suggestions     │ - Real-time UI    │
│                      │                    │                    │
│ [2-3 weeks]          │ [2 weeks]          │ [4-6 weeks]       │
─────────────────────────────────────────────────────────────────

Q4 2026                    Q1 2027
─────────────────────────────────────────────────────
│ Phase 4: Native AR                               │
│ - iOS ARKit app                                  │
│ - Android ARCore app                             │
│ - LiDAR integration                              │
│ - 3D reconstruction                              │
│                                                   │
│ [3-6 months]                                     │
─────────────────────────────────────────────────────
```

---

## Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AR browser compatibility | Medium | High | Progressive enhancement, fallback to upload |
| Model performance on mobile | Medium | Medium | Quantized models, edge optimization |
| GPT-4o API costs at scale | High | Medium | Local models for detection, GPT for classification only |
| LiDAR device fragmentation | Low | Low | Graceful degradation to camera-only |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| User adoption of camera scanning | Medium | High | Optional feature, parallel manual flow |
| Privacy concerns with camera | Medium | Medium | Clear permissions, no cloud storage of video |
| Native app maintenance burden | Medium | Medium | React Native for code sharing |

---

## Success Metrics

### V3.0 KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Scan completion rate | >80% | Users who start and finish a scan |
| Quote accuracy improvement | +5% vs V2.0 | Actual vs quoted price variance |
| Time to quote reduction | <30 seconds | From scan start to quote display |
| User satisfaction | >4.5/5 | Post-scan survey |
| Booking conversion | +15% | Scans that convert to bookings |
| Mover dispute reduction | -30% | "Item not as described" complaints |

---

## Appendix

### A. Furniture Database Categories (V2.0)

Current database includes:
- **Seating:** Sofas, armchairs, dining chairs, office chairs
- **Bedroom:** Beds, mattresses, dressers, nightstands, wardrobes
- **Tables:** Dining tables, coffee tables, desks, end tables
- **Storage:** Bookshelves, cabinets, TV stands, shoe racks
- **Appliances:** Refrigerators, washers, dryers, microwaves
- **Electronics:** TVs, monitors, gaming consoles

### B. File Locations

| Component | Path |
|-----------|------|
| Vision Engine V2.0 | `server/vision-engine-v2.ts` |
| AI Identifier (V1.0 legacy) | `server/ai-identifier.ts` |
| Furniture Database | `shared/furniture-database.ts` |
| Dimension Corrector | `server/dimension-corrector.ts` |
| Vision Queue (async) | `server/vision-queue.ts` |
| AI Feature Flags | `shared/ai.ts` |

### C. API Endpoints

**Current V2.0:**
```
POST /api/vision/analyze
  - Body: { imagePath: string }
  - Response: VisionEngineResult

POST /api/bookings/:id/analyze-photos
  - Triggers vision analysis for booking photos
  - Updates booking with detected items
```

**Proposed V3.0:**
```
POST /api/vision/scan-room
  - Body: { images: string[], roomType: string }
  - Response: RoomScan

POST /api/vision/home-inventory
  - Body: { rooms: RoomScan[] }
  - Response: HomeScan with quote
```

---

*Document prepared for LervIT development team.*
