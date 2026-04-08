---
name: capacitor-native-upgrade
description: Full plan for wrapping the LervIT web app with Capacitor to produce native iOS and Android apps. Use when the user asks to start the Capacitor integration, continue the native app upgrade, or asks about mobile app wrapping.
---

# LervIT Capacitor Native App Upgrade

## Status: Phase 1 COMPLETE ✓

All Replit-side code changes are done. Web build is clean (2635 modules, 0 errors).
Next step: clone on Mac, run `npx cap add ios && npx cap add android && npx cap sync`, then open in Xcode/Android Studio.

---

## What Was Changed (Phase 1 — Done)

### Packages installed
All 15 Capacitor packages installed:
```
@capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
@capacitor/geolocation @capacitor/camera @capacitor/app @capacitor/browser
@capacitor/google-maps @capacitor/status-bar @capacitor/splash-screen
@capacitor/keyboard @capacitor/haptics @capacitor/network @capacitor/push-notifications
```

### Files Changed

#### `capacitor.config.ts` (new file at project root)
- appId: `com.lervit.app`, appName: `LervIT`, webDir: `dist/public`
- SplashScreen: 2s dark background (`#0f172a`)
- StatusBar: dark style
- Keyboard resize mode: body

#### `client/src/lib/native.ts` (new file)
- `isNative`: boolean — `Capacitor.isNativePlatform()`
- `API_BASE_URL`: `https://app.lervit.com` on native, `''` on web
- `apiUrl(path)`: prepends base URL
- `openUrl(url)`: uses `Browser.open()` on native, `window.open()` on web
- `openTel(phone)`: uses `Browser.open(tel:...)` on native, `window.open()` on web

#### `client/src/lib/queryClient.ts`
- All `fetch('/api/...')` calls now prepend `API_BASE_URL`
- Works transparently on web (empty string prefix) and native (full domain)
- Removed `fetchWithRetry` dependency (simplified)

#### `client/src/contexts/LocationContext.tsx`
- Full rewrite with Capacitor branch + web branch
- Native: `Geolocation.checkPermissions()`, `Geolocation.requestPermissions()`, `Geolocation.getCurrentPosition()`
- Web: `navigator.permissions.query()`, `navigator.geolocation.*`
- Dynamic import so Capacitor only loads on native

#### `client/src/pages/MoverDashboard.tsx`
- GPS watchPosition: native uses `Geolocation.watchPosition()` + `Geolocation.clearWatch()`
- GPS getCurrentPosition fallback: native uses `Geolocation.getCurrentPosition()`
- Navigate buttons (pickup/dropoff): `openUrl(google maps url)` → opens native Maps app
- Added `Capacitor` + `openUrl` imports

#### `client/src/components/ImageUpload.tsx`
- On native: shows "Take / Choose Photo" button using `Camera.getPhoto({ source: CameraSource.Prompt })`
- On web: keeps existing drag-and-drop + file input
- Camera data URL converted to File for upload
- Upload URL now uses `API_BASE_URL` prefix + `credentials: 'include'`

#### `client/src/components/MoverPayoutCenter.tsx`
- `window.location.href = data.url` → `openUrl(data.url)` (Stripe onboarding URL opens in in-app browser)

#### `client/src/pages/MyBookings.tsx`
- `window.open('tel:...', '_self')` → `openTel(phone)` (calls mover from booking)

#### `client/src/pages/MoverVerification.tsx`
- `window.open("tel:+18889820885", "_self")` → `openTel('+18889820885')` (support line)

#### `client/src/main.tsx`
- On native: hides splash screen, sets status bar, handles Android back button, manages keyboard insets
- All native setup is async dynamic import, so web builds are unaffected

---

## What Remains (Phase 2 — Done Locally, Not in Replit)

### Prerequisites
- Mac with Xcode 15+ (for iOS)
- Android Studio (for Android, any OS)
- Apple Developer account ($99/year) for iOS distribution

### Commands to Run Locally
```bash
# 1. Clone/pull latest from Replit (all Phase 1 code is already committed)
git pull

# 2. Install dependencies (in case of fresh clone)
npm install

# 3. Build the web app
npm run build

# 4. Add native platforms (creates ios/ and android/ directories)
npx cap add ios
npx cap add android

# 5. Sync web assets to native platforms
npx cap sync
```

### iOS Setup (Xcode)
```bash
npx cap open ios
```
In Xcode (`ios/App/App.xcworkspace`):
- Bundle ID: `com.lervit.app`
- Add to `Info.plist`:
  ```xml
  <key>NSLocationWhenInUseUsageDescription</key>
  <string>LervIT needs your location to match you with nearby movers.</string>
  <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
  <string>LervIT uses your location while moving to share with customers.</string>
  <key>NSCameraUsageDescription</key>
  <string>LervIT uses the camera to photograph your items for the move.</string>
  <key>NSPhotoLibraryUsageDescription</key>
  <string>LervIT accesses your photo library to select move photos.</string>
  <key>GMSApiKey</key>
  <string>YOUR_GOOGLE_MAPS_API_KEY</string>
  ```
- Sign with Apple Developer team
- Test on simulator, then real device
- Archive → Distribute → App Store Connect

### Android Setup (Android Studio)
```bash
npx cap open android
```
In `android/app/src/main/AndroidManifest.xml`, the following permissions are added automatically by plugins.
Manually verify:
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.INTERNET" />
```
Add Google Maps API key to `android/app/src/main/res/values/strings.xml`:
```xml
<string name="google_maps_key">YOUR_GOOGLE_MAPS_API_KEY</string>
```
And in `AndroidManifest.xml` (inside `<application>`):
```xml
<meta-data android:name="com.google.android.geo.API_KEY" android:value="@string/google_maps_key"/>
```

### Google Maps API Key
The Maps API key (stored as `VITE_GOOGLE_MAPS_API_KEY` in Replit secrets) currently restricts to `app.lervit.com/*`.
For native builds you need to also allow:
- **iOS**: iOS app restriction — add Bundle ID `com.lervit.app`
- **Android**: Android app restriction — add Package name `com.lervit.app` + SHA-1 fingerprint

---

## Phase 3 — App Store Submission

### Apple App Store
- Screenshots required: 6.7" (iPhone 15 Pro Max), 12.9" iPad
- App description, keywords, support URL: `https://app.lervit.com`
- Review notes: "Marketplace for physical moving services — Stripe used for in-person service payments (exempt from App Store IAP requirement per guideline 3.1.3)"
- Review time: 1–3 days

### Google Play Store
- $25 one-time developer account fee
- Screenshots, feature graphic (1024×500), description
- Review time: same day to 1 day

---

## After Every Code Change in Replit
```bash
npm run build
npx cap sync   # (only after ios/android dirs are created locally)
```

---

## Architecture Notes
- Express backend stays at `app.lervit.com` — Capacitor wraps the frontend only
- `Capacitor.isNativePlatform()` branches between native/web behavior everywhere
- Dynamic imports (`await import('@capacitor/...')`) ensure plugins don't load on web builds
- `@react-google-maps/api` kept for TrackTrip + BrowseMovers — works fine in Capacitor WebView
- Mover directions open native Maps app via `Browser.open(google.com/maps/dir/...)`
- WebSocket mover notifications work in foreground; push notifications needed for background alerts
- Stripe payments for physical services allowed on both stores (not digital goods — no IAP required)

---

## Deferred / Future
- `@capacitor/google-maps` native map layer for TrackTrip/BrowseMovers (optional — web SDK works fine in WebView)
- `@capacitor/push-notifications` backend integration (APNs/FCM tokens → server)
- Profile photo camera swap in MoverProfileSetup, CustomerProfile, MoverOnboardingWizard (file input works in WebView now)
- Deep link handling for Stripe Connect return URLs on native
