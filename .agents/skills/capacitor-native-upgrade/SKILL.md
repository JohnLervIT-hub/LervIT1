---
name: capacitor-native-upgrade
description: Full plan for wrapping the LervIT web app with Capacitor to produce native iOS and Android apps. Use when the user asks to start the Capacitor integration, continue the native app upgrade, or asks about mobile app wrapping.
---

# LervIT Capacitor Native App Upgrade

## Overview
Wraps the existing React/Express web app into a native iOS and Android app using Capacitor.
The Express backend stays on Replit (app.lervit.com). Capacitor wraps only the frontend.

## What Needs Changing (Summary)
- `navigator.geolocation` → `@capacitor/geolocation`
- `<input type="file">` → `@capacitor/camera`
- `window.open(external)` → `@capacitor/browser`
- `@react-google-maps/api` (TrackTrip, BrowseMovers) → `@capacitor/google-maps`
- Vite API base URL → point to `https://app.lervit.com` in native builds
- `main.tsx` → add `SplashScreen.hide()` on app ready

## Maps Decision
- **TrackTrip.tsx** and **BrowseMovers.tsx**: rewrite to use `@capacitor/google-maps` (native layer, Uber-style)
- **Mover directions**: keep `window.open(google.com/maps/dir/...)` → launches Google Maps app (correct pattern, same as Uber drivers)
- **Google Navigation SDK**: NOT needed — movers get native turn-by-turn by launching the Maps app

---

## Full Plugin List

### Required (app breaks without these)
```
@capacitor/core
@capacitor/cli
@capacitor/ios
@capacitor/android
@capacitor/geolocation
@capacitor/camera
@capacitor/app
@capacitor/browser
@capacitor/google-maps
```

### Recommended (significantly improves native experience)
```
@capacitor/status-bar
@capacitor/splash-screen
@capacitor/keyboard
@capacitor/haptics
@capacitor/network
@capacitor/push-notifications
```

### Skip / Defer
- `@capacitor/preferences` — localStorage works fine in Capacitor WebView
- `@capacitor/local-notifications` — push notifications cover this
- Google Navigation SDK — not needed, mover directions open Maps app

---

## Files That Need Changes

### `client/src/contexts/LocationContext.tsx`
Replace all `navigator.geolocation` calls with `@capacitor/geolocation`:
- `getCurrentPosition` → `Geolocation.getCurrentPosition()`
- `navigator.permissions.query({ name: 'geolocation' })` → `Geolocation.checkPermissions()`
- `navigator.geolocation.watchPosition` → `Geolocation.watchPosition()`
- Add platform detection: use web API on browser, Capacitor plugin on native

### `client/src/pages/MoverDashboard.tsx`
- Replace `navigator.geolocation.watchPosition` (lines ~738–777) with `Geolocation.watchPosition()`
- Replace `navigator.geolocation.getCurrentPosition` fallback (line ~822) with `Geolocation.getCurrentPosition()`
- `window.open(google maps directions, '_blank')` → `Browser.open({ url: ... })`

### `client/src/components/ImageUpload.tsx`
- Keep `<input type="file">` for web
- Add Capacitor Camera option: `Camera.getPhoto()` for native
- Use `Capacitor.isNativePlatform()` to choose between the two
- Convert base64 result from Camera to Blob for existing upload logic

### `client/src/pages/MoverProfileSetup.tsx`
- Same camera swap as ImageUpload

### `client/src/pages/MoverVerification.tsx`
- Same camera swap for document uploads

### `client/src/pages/CustomerProfile.tsx`
- Same camera swap for profile photo

### `client/src/pages/MoverOnboardingWizard.tsx`
- Same camera swap for document uploads

### `client/src/components/MoverPayoutCenter.tsx`
- `window.location.href = data.url` (Stripe onboarding) → `Browser.open({ url: data.url })`

### `client/src/pages/MyBookings.tsx`
- `window.open('tel:...')` → `Browser.open({ url: 'tel:...' })` or use Capacitor App plugin

### `client/src/pages/TrackTrip.tsx`
- Replace `@react-google-maps/api` with `@capacitor/google-maps`
- Native map renders below WebView; React UI overlays on top (bottom sheet, ETA badge, etc.)

### `client/src/pages/BrowseMovers.tsx`
- Replace `@react-google-maps/api` with `@capacitor/google-maps` for mover location markers

### `client/src/main.tsx`
- Add `SplashScreen.hide()` after app mounts
- Add `StatusBar.setStyle()` for theme-aware status bar
- Add `App.addListener('backButton')` for Android hardware back button

### `client/src/lib/queryClient.ts` or env config
- Add `VITE_API_BASE_URL` used in native builds: `https://app.lervit.com`
- All `fetch('/api/...')` calls must become `fetch(${BASE_URL}/api/...)` when native

---

## Phase 1 — Done in Replit

1. Install all packages:
```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm install @capacitor/geolocation @capacitor/camera @capacitor/app @capacitor/browser @capacitor/google-maps
npm install @capacitor/status-bar @capacitor/splash-screen @capacitor/keyboard @capacitor/haptics @capacitor/network @capacitor/push-notifications
```

2. Initialize Capacitor:
```bash
npx cap init LervIT com.lervit.app --web-dir dist/public
```

3. Apply all code changes listed above

4. Build and sync:
```bash
npm run build
npx cap add ios
npx cap add android
npx cap sync
```

This generates `ios/` and `android/` project folders.

---

## Phase 2 — Done Locally (not in Replit)

### iOS (requires Mac + Xcode)
```bash
npx cap open ios
```
- Opens `ios/App/App.xcworkspace` in Xcode
- Set Bundle ID: `com.lervit.app`
- Add Google Maps API key to `Info.plist`
- Add camera/location permission descriptions to `Info.plist`
- Sign with Apple Developer account ($99/year)
- Test on simulator and device

### Android (any OS + Android Studio)
```bash
npx cap open android
```
- Opens `android/` in Android Studio
- Add Google Maps API key to `AndroidManifest.xml`
- Add permissions: `ACCESS_FINE_LOCATION`, `CAMERA`, `READ_EXTERNAL_STORAGE`
- Sign with keystore for release
- Test on emulator and device

---

## Phase 3 — App Store Submission

### Apple App Store
- Screenshots required: 6.7" (iPhone 15 Pro Max), 12.9" iPad
- App description, keywords, support URL
- Review notes: "Marketplace for physical moving services — Stripe used for in-person service payments (exempt from App Store IAP requirement)"
- Review time: 1–3 days typically

### Google Play Store
- $25 one-time developer account fee
- Screenshots, feature graphic, description
- Review time: same day to 1 day

---

## capacitor.config.ts (to be created at project root)
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lervit.app',
  appName: 'LervIT',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0f172a',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    GoogleMaps: {
      // API key injected via environment at build time
    },
  },
};

export default config;
```

---

## Important Notes
- After every code change in Replit: `npm run build && npx cap sync`
- iOS build ALWAYS requires a Mac — cannot be done in Replit
- Android can be built on any OS with Android Studio
- Stripe payments for physical services are allowed on both stores (not digital goods)
- WebSocket mover notifications work in foreground; push notifications needed for background alerts
- `Capacitor.isNativePlatform()` is the standard check to branch between web/native behavior
