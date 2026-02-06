# LervIT Pricing Analysis & Recommendations
**Date:** February 6, 2026

## Context
Analysis of current pricing gaps identified through real booking scenarios in Calgary market. LervIT is a new platform competing against established moving companies — pricing must be competitive enough to attract customers while fair enough to retain movers.

---

## Current Pricing Model (As-Is)

### Vehicle Class Base Fees
| Class | Vehicle | Volume Range | Base Fee | Per km Rate |
|-------|---------|-------------|----------|-------------|
| A | SUV / Small Vehicle | 0-20 ft³ | $10.00 | $0.90/km |
| C | Cargo Van | 21-165 ft³ | $15.00 | $1.25/km |
| D | Pickup Truck | 166-300 ft³ | $20.00 | $1.60/km |
| E | Moving Truck (Large) | 300+ ft³ | $40.00 | $2.00/km |

### Load Size Fees (Current)
| Load Size | Fee |
|-----------|-----|
| Boxes (0-20 ft³) | $5.00 |
| Medium (21-165 ft³) | $15.00 |
| Large (166-300 ft³) | $30.00 |
| Apartment (300+ ft³) | $45.00 |

### Other Fees
- 2 Movers Premium: +30%
- Pickup/Dropoff Difficulty: $0 (ground), $5 (stairs), $8 (elevator), $10 (basement)
- Heavy Item Fee: $15 (marked as "not used in new pricing")
- Platform Commission: 15%

### Pricing Gaps Identified
1. **No handling complexity surcharge** — Very Heavy items (piano, large sectional) get no extra charge
2. **No weight-based component** — Pricing ignores weight entirely
3. **Load size fees too flat** — $45 max doesn't reflect actual difficulty

---

## Test Case: 3 Heavy Items (8.8 km move)

### Items
| Item | Volume | Weight | Complexity | Movers |
|------|--------|--------|------------|--------|
| 2-seater loveseat sofa | 38.3 ft³ | 45 kg | Medium | 2 |
| L-shaped sectional w/ storage | 162.1 ft³ | 120 kg | Very Heavy | 2 |
| Grand piano | 41.3 ft³ | 250 kg | Very Heavy | 2 |
| **Total** | **241.7 ft³** | **415 kg** | | |

### Current Price: $133.35
- Base Fee (Moving Truck): $40.00
- Distance (8.8 km × $2.00): $17.58
- Load Size (Apartment): $45.00
- Subtotal: $102.58
- 2 Movers (+30%): **$133.35**

### Calgary Market Rate: $450 - $1,200+
- Grand piano alone: $300-750
- L-shaped sectional: $100-300
- Loveseat sofa: $50-150

**Current pricing is 70-90% below market rate.**

---

## Test Case: L-Shaped Sectional Only (8.8 km move)

### Current Price: ~$83.30
- Base Fee (Pickup Truck — weight override): $20.00
- Distance (8.8 km × $1.60): $14.08
- Load Size (Large — weight override): $30.00
- Subtotal: $64.08
- 2 Movers (+30%): **$83.30**

### Calgary Market Rate: $100-300

---

## Proposed Pricing: Competitive Entry Model

### Strategy
Position as the **affordable alternative** to established Calgary movers. Price at the lower end of market rates to attract early customers and movers, with room to increase as reputation builds.

### New Fee: Handling Complexity Surcharge (Per Item)
| Complexity Level | Surcharge |
|-----------------|-----------|
| Standard | $0 |
| Medium | $5 |
| High | $15 |
| Very High | $35 |

### New Fee: Weight Surcharge
- **Free threshold:** First 75 kg at no charge
- **Rate:** $0.10 per kg above 75 kg
- Applies to total weight of all items

### Updated Load Size Fees
| Load Size | Current | Proposed |
|-----------|---------|----------|
| Boxes (0-20 ft³) | $5.00 | $5.00 (no change) |
| Medium (21-165 ft³) | $15.00 | $15.00 (no change) |
| Large (166-300 ft³) | $30.00 | **$40.00** |
| Apartment (300+ ft³) | $45.00 | **$60.00** |

---

## Proposed Price: 3 Heavy Items (8.8 km)

| Component | Amount |
|-----------|--------|
| Base Fee (Moving Truck) | $40.00 |
| Distance (8.8 km × $2.00) | $17.58 |
| Load Size (Apartment) | $60.00 |
| Complexity: Loveseat (Medium) | $5.00 |
| Complexity: Sectional (Very High) | $35.00 |
| Complexity: Piano (Very High) | $35.00 |
| Weight: (415 kg - 75 kg) × $0.10 | $34.00 |
| **Subtotal** | **$226.58** |
| 2 Movers (+30%) | |
| **Total** | **~$288 CAD** |

Mover receives (85%): **~$245**

### Market Position
- LervIT: ~$288
- Calgary market: $450-1,200+
- **Savings for customer: 36-76%**

---

## Proposed Price: L-Shaped Sectional Only (8.8 km)

| Component | Amount |
|-----------|--------|
| Base Fee (Pickup Truck) | $20.00 |
| Distance (8.8 km × $1.60) | $14.08 |
| Load Size (Large) | $40.00 |
| Complexity (Very High) | $35.00 |
| Weight: (120 kg - 75 kg) × $0.10 | $4.50 |
| **Subtotal** | **$113.58** |
| 2 Movers (+30%) | |
| **Total** | **~$148 CAD** |

Mover receives (85%): **~$126**

### Market Position
- LervIT: ~$148
- Calgary market: $100-300
- **Positioned at lower-mid market**

---

## Summary Comparison

| Scenario | Current | Proposed | Market Rate | LervIT Position |
|----------|---------|----------|-------------|-----------------|
| 3 heavy items (8.8 km) | $133 | ~$288 | $450-1,200 | Value leader |
| Sectional only (8.8 km) | $83 | ~$148 | $100-300 | Lower-mid market |

---

## Growth Strategy
1. **Launch phase:** Use competitive entry pricing (above) to build volume
2. **After 100+ completed bookings:** Increase complexity surcharges by $5-10
3. **After 500+ bookings:** Increase load size fees by $5-10
4. **Ongoing:** Monitor mover acceptance rates — if movers decline jobs, prices are too low

---

## Implementation Notes
- Complexity surcharge is per-item, calculated from `handlingComplexity` field (already tracked by AI Vision Engine)
- Weight surcharge uses `weightKg` field (already tracked per item)
- Load size fees are in `shared/pricing.ts` → `PRICING_CONFIG.LOAD_SIZE_FEES`
- Platform commission (15%) is separate and does not change
- All changes require updates to: `shared/pricing.ts`, `client/src/pages/RequestMove.tsx`, `client/src/components/PricingSummary.tsx`
