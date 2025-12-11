# Google Places API Migration Guide

## Current Status

LervIT currently uses the **Google Places Autocomplete (Legacy)** API for address input. As of March 1, 2025, Google has deprecated `google.maps.places.PlacesService` for new customers.

### Console Warning
```
As of March 1st, 2025, google.maps.places.PlacesService is not available to new customers. 
Please use google.maps.places.Place instead.
```

## Timeline

| Date | Impact |
|------|--------|
| March 1, 2025 | New customers cannot use PlacesService |
| Current | Existing customers (like LervIT) can continue using PlacesService |
| TBD (12+ months) | PlacesService may be deprecated for all customers |

**Recommendation**: Plan migration for Q3-Q4 2025, no immediate action required.

## Current Implementation

### Files Using Places API

1. **`client/src/components/PlacesAutocomplete.tsx`**
   - Uses `google.maps.places.AutocompleteService`
   - Handles address autocomplete for booking form

2. **`client/src/App.tsx`**
   - Loads Google Maps JavaScript API with `places` library
   - Uses `useJsApiLoader` from `@react-google-maps/api`

3. **`server/google-maps.ts`**
   - Uses `@googlemaps/google-maps-services-js` for geocoding
   - Server-side Geocoding API (NOT affected by deprecation)

## Migration Options

### Option 1: New Google Places API (Recommended)

**Effort**: Medium (2-3 days)
**Cost**: Same pricing structure

```typescript
// OLD (deprecated)
const autocompleteService = new google.maps.places.AutocompleteService();
autocompleteService.getPlacePredictions(request, callback);

// NEW (recommended)
const { Place, AutocompleteSessionToken } = await google.maps.importLibrary("places");
const token = new AutocompleteSessionToken();
const request = {
  input: "123 Main St",
  sessionToken: token,
};
const { predictions } = await Place.searchByText(request);
```

**Migration Steps**:
1. Update `@react-google-maps/api` to latest version
2. Replace `AutocompleteService` with new `Place.autocomplete()` method
3. Update callback patterns to Promise-based async/await
4. Test address validation thoroughly
5. Verify geocoding still returns lat/lng correctly

### Option 2: Mapbox Search API

**Effort**: High (5-7 days)
**Cost**: Potentially lower for high volume

**Pros**:
- Competitive pricing
- Excellent developer experience
- Built-in session handling

**Cons**:
- Different API structure
- Need to add new API key
- May affect existing Google Maps integration

### Option 3: Continue with Current API

**Effort**: None
**Risk**: Low-Medium (12+ months runway)

Google has committed to:
- Continuing bug fixes for major regressions
- 12 months notice before full deprecation
- No immediate action required

## Recommended Action Plan

### Phase 1: Monitor (Now - Q2 2025)
- [x] Document current implementation
- [ ] Set calendar reminder for Q3 2025 review
- [ ] Monitor Google announcements for deprecation timeline

### Phase 2: Plan (Q3 2025)
- [ ] Evaluate new Places API features
- [ ] Create feature branch for migration
- [ ] Test new API in development

### Phase 3: Migrate (Q4 2025)
- [ ] Implement new Places API
- [ ] A/B test address autocomplete
- [ ] Roll out to production
- [ ] Remove legacy code

## Code Locations for Migration

```
client/src/components/PlacesAutocomplete.tsx  ← Primary migration target
client/src/App.tsx                            ← Update library loading
client/src/pages/RequestMove.tsx              ← Uses PlacesAutocomplete
```

## Testing Checklist

After migration, verify:
- [ ] Address autocomplete returns predictions
- [ ] Calgary, AB addresses work correctly
- [ ] Lat/lng coordinates are accurate
- [ ] Distance calculation still works
- [ ] Price estimation uses correct distance
- [ ] Mobile keyboard doesn't interfere with dropdown

## Resources

- [Google Places Migration Guide](https://developers.google.com/maps/documentation/javascript/places-migration-overview)
- [New Places API Documentation](https://developers.google.com/maps/documentation/javascript/places)
- [Mapbox Search API](https://docs.mapbox.com/api/search/)
