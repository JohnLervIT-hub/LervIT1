# MoveIt Uber-Style Matching - Testing Guide

## Quick Test Instructions

### 1. Create Test Movers (with automatic Calgary coordinates)

**Mover 1 - Signup:**
- Email: `mover1@test.com`
- Name: "North Calgary Mover"
- Phone: "403-111-1111"
- Password: "test123"
- Role: "Mover"

Result: System automatically assigns random Calgary coordinates (e.g., lat: 51.05, lng: -114.12)

**Mover 2 - Signup:**
- Email: `mover2@test.com`
- Name: "South Calgary Mover"
- Phone: "403-222-2222"
- Password: "test123"
- Role: "Mover"

Result: System automatically assigns different random Calgary coordinates

**Mover 3 - Signup:**
- Email: `mover3@test.com`
- Name: "Downtown Mover"
- Phone: "403-333-3333"
- Password: "test123"
- Role: "Mover"

Result: System automatically assigns random Calgary coordinates

### 2. Create Customer and Test Booking

**Customer Signup:**
- Email: `customer@test.com`
- Name: "Test Customer"
- Phone: "403-999-8888"
- Password: "test123"
- Role: "Customer"

**Create Booking (Using Calgary Locations):**
Navigate to "Request Move" and enter:
- **Pickup Address:** "Kensington" (will be geocoded to: 51.0536, -114.0869)
- **Dropoff Address:** "Mission" (will be geocoded to: 51.0342, -114.0836)
- **Load Size:** Medium
- **Date:** Tomorrow, 10:00 AM

**Expected System Behavior:**
1. ✅ System geocodes "Kensington" → {lat: 51.0536, lng: -114.0869}
2. ✅ System geocodes "Mission" → {lat: 51.0342, lng: -114.0836}
3. ✅ Calculates distance: ~2.5 km using Haversine formula
4. ✅ Calculates price breakdown:
   - Base Fee: $25.00
   - Distance Fee: 2.5 km × $1.50 = $3.75
   - Load Fee (medium): $25.00
   - Mover Travel Fee: Varies per mover (calculated based on each mover's distance to pickup)
   - **Total:** ~$53.75 + travel fees
5. ✅ Finds top 5 nearest movers to Kensington
6. ✅ Creates job notifications for those movers
7. ✅ Returns confirmation with "notifiedMovers" count

### 3. Test Proximity Matching from Database

Run this SQL query to see the job notifications created:

```sql
SELECT 
  jn.id,
  m.id as mover_id,
  u.name as mover_name,
  jn.distance_to_pickup,
  jn.estimated_earnings,
  jn.status,
  jn.expires_at
FROM job_notifications jn
JOIN movers m ON jn.mover_id = m.id
JOIN users u ON m.user_id = u.id
ORDER BY jn.distance_to_pickup ASC;
```

**Expected Results:**
- Top 5 movers sorted by distance to Kensington
- Each has `distanceToPickup` value (in km)
- Each has `estimatedEarnings` including their specific mover travel fee
- Status = 'pending'
- ExpiresAt = ~10 minutes from now

### 4. Test from Mover Dashboard

Login as one of the test movers and navigate to Mover Dashboard:

**Expected to See:**
- "Available Jobs" tab with the booking listed
- Booking shows:
  - Customer: "Test Customer"
  - Pickup: "Kensington"
  - Dropoff: "Mission"
  - Distance: 2.5 km
  - Price: ~$53.75
  - Load: Medium

**Test Accept Flow:**
- Click "Accept Booking"
- Booking moves to "My Bookings" tab
- Status changes to "Confirmed"

### 5. Verify Price Breakdown (via API)

Use browser console or curl to fetch booking details:

```bash
curl http://localhost:5000/api/bookings/<booking_id>
```

**Expected Response includes:**
```json
{
  "id": "...",
  "pickupLatitude": 51.0536,
  "pickupLongitude": -114.0869,
  "dropoffLatitude": 51.0342,
  "dropoffLongitude": -114.0836,
  "distance": "2.5",
  "price": "53.75",
  "baseFee": "25.00",
  "distanceFee": "3.75",
  "loadFee": "25.00",
  "moverTravelFee": "0.00",
  ...
}
```

## Testing Different Scenarios

### Test Case 1: Different Calgary Neighborhoods
Try creating bookings with these Calgary locations:

**Pickup Locations to Test:**
- "downtown" → 51.0447, -114.0719
- "brentwood" → 51.0861, -114.1311
- "chinook centre" → 50.9978, -114.0711
- "university" → 51.0792, -114.1311
- "airport" → 51.1311, -114.0131

**Dropoff Locations to Test:**
- "17 ave" → 51.0375, -114.0719
- "inglewood" → 51.0383, -114.0406
- "stampede grounds" → 51.0386, -114.0522

### Test Case 2: Load Sizes
Create bookings with different load sizes to verify pricing:

- **Small Load:** Base ($25) + Distance + Load ($10)
- **Medium Load:** Base ($25) + Distance + Load ($25)
- **Large Load:** Base ($25) + Distance + Load ($40)

### Test Case 3: Long Distance Move
- Pickup: "airport" (far north)
- Dropoff: "legacy" (far south)
- Expected distance: ~20+ km
- Expected distance fee: $30+

### Test Case 4: Mover Travel Surcharge
If a mover is more than 5km away from pickup location:
- Expected: moverTravelFee > 0 in job notification
- Formula: (distance - 5km) × $0.75/km

## Troubleshooting

### No Movers Found?
- Check movers have non-null latitude/longitude: `SELECT id, latitude, longitude FROM movers;`
- Verify movers are available: `SELECT id, is_available FROM movers;`

### Price Calculation Issues?
- Check geocoding worked: Look for non-zero pickup/dropoff coordinates in booking
- Verify distance was calculated: `SELECT distance FROM bookings WHERE id = '...';`

### Job Notifications Not Created?
- Query: `SELECT COUNT(*) FROM job_notifications WHERE booking_id = '...';`
- Should return up to 5 (or fewer if less than 5 movers available)

## Success Criteria

✅ **Geocoding Works:** Addresses convert to Calgary coordinates
✅ **Distance Calculation:** Haversine formula calculates correct km distance
✅ **Dynamic Pricing:** All 4 price components calculated correctly
✅ **Proximity Matching:** Top 5 nearest movers identified
✅ **Job Notifications:** Created with distance and earnings per mover
✅ **10-Minute Expiry:** ExpiresAt timestamp set correctly
✅ **Mover Acceptance:** Movers can accept jobs from dashboard

## API Endpoints Reference

**Create Booking:**
```
POST /api/bookings
Body: { pickupAddress, dropoffAddress, loadSize, preferredDate, customerId }
Returns: booking + notifiedMovers count + nearestMovers list
```

**Get Bookings:**
```
GET /api/bookings?customerId=...
GET /api/bookings?moverId=...
```

**Get Job Notifications:**
```sql
SELECT * FROM job_notifications WHERE mover_id = '...' AND status = 'pending';
```

**Update Mover Location:**
```
PATCH /api/movers/:id
Body: { latitude: 51.05, longitude: -114.12 }
```
