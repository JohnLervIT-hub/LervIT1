---
name: TrackTrip null coordinate crash
description: Booking pickup/dropoff lat/lng can be null in DB; Google Maps throws into ErrorBoundary if passed null coords.
---

**Rule:** Before rendering GoogleMap, Marker, or calling LatLngBounds.extend(), always null-check pickup.latitude / pickup.longitude / dropoff.latitude / dropoff.longitude.

**Why:** Geocoding can fail or be absent for older bookings. The DB columns are nullable. Passing `{ lat: null, lng: null }` to any Google Maps API call throws a runtime error that React's ErrorBoundary catches, showing "Something went wrong."

**How to apply:**
- Derive `pickupCoords` / `dropoffCoords` as null-safe objects early in the component.
- Add an early-return showing "Location data not available" if either is null — before rendering GoogleMap.
- Guard all useEffect hooks that call bounds.extend() or DirectionsService.route() with the same null checks.
- Use Calgary default `{ lat: 51.0447, lng: -114.0719 }` as a map center fallback if needed.
