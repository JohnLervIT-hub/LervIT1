# LervIT Codebase Audit Report

**Date:** 2026-09-01
**Scope:** Platform migration readiness, portal completeness, mobile portability, agent readiness, AI vision + pricing pipeline
**Method:** Read-only audit; five parallel focused sweeps of `/Users/user/Desktop/LervIT1`. No code changed.

---

## Executive Summary

LervIT is a mature, feature-complete moving marketplace with three portals (Customer, Mover, Partner/Enterprise) and an admin console, an AI vision pricing pipeline built on GPT-4o, and a solid PostgreSQL schema (~40 tables) with encoded state machines. The platform runs today on Replit with a bundled Node/Express monolith and Capacitor-wrapped iOS/Android shells.

**The good.** All three customer-facing portals are functionally complete. The database is thoughtfully modeled with audit trails, state-transition helpers, learning tables, and payment-lifecycle status columns. Payments are wired through Stripe (PaymentIntent + SetupIntent + Connect + webhooks) with idempotency keys on financial operations. Structured Pino JSON logging, circuit breakers on every external service, and a documented 10-point dispatch protocol (AC-1..AC-10) show engineering maturity. WebSockets deliver real-time job offers to movers with a 30-second polling fallback. The AI vision pipeline is layered: GPT-4o detection → similarity match against a 50+ item ground-truth furniture DB → rule-based dimension correction → vehicle-class pricing.

**The gap.** Platform coupling to Replit is shallow but real (three dev-only vite plugins, sidecar-based Object Storage, several hardcoded `lervit.replit.app` URLs). React Native portability is limited by pervasive `window`/`document` usage (48+18 files), framer-motion animations, Radix-UI-only component library, and cookie-based session auth. Agent readiness has strong foundations (schema, logging, breakers) but is missing the persistent primitives agents depend on: no durable work queue (the vision queue is in-memory and crash-loses jobs), no pub/sub event bus, no prompt registry, no request-ID correlation across async work, and no idempotency tokens on email/SMS.

**Scores.**
- **Mobile score: 5/10** — ships today via Capacitor, but a true RN app is a 3-4 month rewrite.
- **Agent score: 6/10** — great schema + observability, missing the durable queue + event fabric agents need.

**Top-priority moves.**
1. Purge three hardcoded `lervit.replit.app` URLs in `server/notifications.ts:583, 1377, 1389`; standardize on a single `BASE_URL` env var.
2. Migrate object storage off the Replit sidecar (`server/objectStorage.ts:15-30`) before Railway/Vercel cutover.
3. Introduce a persistent queue (Redis + BullMQ) — vision jobs and email/SMS delivery all currently live in-memory or fire-and-forget.
4. Move auth from session cookies to JWT-in-header before any React Native work; also remove the direct `localStorage.getItem('token')` read in `client/src/pages/MoverVerification.tsx:183`.
5. Extract prompts from `server/vision-engine-v2.ts` and `server/ai-support-analyzer.ts` into a versioned registry so pricing/UX iteration doesn't require redeploys.

---

## 1. Platform (Replit → Railway + Vercel)

### Replit-specific surface area
- **Dev-only Vite plugins** in `package.json:133-135` (`@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, `@replit/vite-plugin-runtime-error-modal`) — imported conditionally in `vite.config.ts:4,10-20` guarded by `process.env.REPL_ID`. Safe to remove.
- **`.replit`** — declares modules (nodejs-20, postgresql-16), the run command (`npm run start`), and port mappings (5000→80). Not portable but not blocking.
- **`replit.md`** — deployment doc referring to Replit blueprints for Stripe/DB/Firebase/Object Storage. Documentation only.
- **Object Storage sidecar** — `server/objectStorage.ts:15-30` authenticates against Replit's local sidecar at `127.0.0.1:1106` for Google Cloud Storage. **This is the largest single migration item.**

### Hardcoded URLs (must fix)
- `server/notifications.ts:583` — `https://lervit.replit.app/payment/${booking.id}` in payment reminder emails.
- `server/notifications.ts:1377` — `https://lervit.replit.app/mover-profile` (mover onboarding CTA).
- `server/notifications.ts:1389` — `https://lervit.replit.app/admin` (admin CTA).
- `server/google-maps.ts:11-19` — `getAppReferer()` falls back to `https://lervit.replit.app/` when no Replit env is set.
- Many `REPLIT_DEV_DOMAIN` → `https://app.lervit.com` fallback chains across `server/notifications.ts`, `server/background-jobs.ts:706,815,989,1184`, `server/dispatch.ts:61`, `server/partnerRoutes.ts` (multiple). Standardize on `BASE_URL`.
- **Client-native fallback:** `client/src/lib/native.ts:6` — `API_BASE_URL = isNative ? 'https://app.lervit.com' : ''`. Good pattern; already relative on web.

### Environment variables
`.env.example` covers: `DATABASE_URL`, `SESSION_SECRET`, Stripe (secret/webhook/public + testing variants), `RESEND_API_KEY`, Telnyx (`_API_KEY`, `_MESSAGING_PROFILE_ID`, `_PHONE_NUMBER`), `VITE_GOOGLE_MAPS_API_KEY`, `OPENAI_API_KEY`, `NODE_ENV`, `PORT`, `APP_BASE_URL`, and `PRIVATE_OBJECT_DIR` / `PUBLIC_OBJECT_SEARCH_PATHS` for Replit Object Storage.

Server reads no Replit-injected DB env vars — the only Replit dependencies are `REPLIT_DEPLOYMENT_URL`, `REPLIT_DEV_DOMAIN`, `REPL_OWNER`, `REPL_SLUG` (all URL construction only) plus the Object Storage sidecar. Removing them requires a single `BASE_URL` env var.

### Database & storage
- **DB:** `@neondatabase/serverless` with `pg` Pool (`server/db.ts:1,6,14`). WebSocket-pooled. Portable to any Postgres — Neon works on Railway.
- **Sessions:** `connect-pg-simple` on Postgres with in-memory fallback (`server/index.ts:59-83`). Portable.
- **Object storage:** GCS via Replit sidecar (blocker). File uploads first buffered to `public/uploads` (multer disk), then pushed to GCS. Older `/uploads/` paths still served locally.

### Server boot
`server/index.ts` — `trust proxy` on (works for Railway/Vercel), health at `/health` (line 26-28), env validation (31-39), port from `PORT || 5000` on `0.0.0.0` (line 219), graceful SIGTERM shutdown (257-263). No Replit-specific boot logic. Timezone forced to `America/Edmonton` at process start.

### Build & deploy
```
build: vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
start: NODE_ENV=production node dist/index.js
worker: tsx server/worker.ts
```
Bundles client (Vite → `dist/public`) and server (esbuild → `dist/index.js`) together — one artifact. The worker (`server/worker.ts` boots `server/background-jobs.ts`) is a separate long-lived process running node-cron. `.github/workflows/ci.yml` runs typecheck + lint + smoke-build; no deploy job.

### Verdict for Railway + Vercel
- **Railway (server + worker as two services):** Feasible in 2-3 days once object storage is migrated. Fix: (a) hardcoded URLs → `BASE_URL`, (b) Object Storage sidecar → direct GCS/S3/R2 auth, (c) drop three Replit vite plugins.
- **Vercel (client only):** Feasible but requires **splitting the monolith**. WebSockets, node-cron worker, multer disk uploads, and long-lived HTTP would all need to live elsewhere (i.e., server stays on Railway; Vercel serves the SPA). This is the cleanest topology.

---

## 2. Portals

### Router & role model
- **Framework:** Wouter (`client/src/App.tsx:1-442`), with `<ProtectedRoute allowedRoles={[...]}>` gating.
- **Roles** (from `shared/schema.ts` users table): `customer`, `mover`, `admin`, `partner_admin`, `partner_dispatcher`, `partner_ops_manager`, `partner_viewer`.
- **Server enforcement:** session-based via `req.session.userId`, guards `authMiddleware`/`requireUser`/`requireAdmin` in `server/routes.ts:151-176`; `requirePartnerAuth` in `server/partnerRoutes.ts:101` resolves partner context and validates partner role.
- **Enterprise flag:** `VITE_ENABLE_ENTERPRISE` (App.tsx:89) — partner routes and admin partner pages only mount when true.

### Customer portal — complete
Home, Browse Movers, Dashboard, Request Move (with AI photo analysis), My Bookings, Messages, Review, Payment, Track Trip (live GPS), Profile, Support. Notifications via polling + email + push-ready.

### Mover portal — complete
Dashboard (WebSocket job notifications), Profile Setup, Settings, Verification (KYC document upload + admin review), Onboarding Wizard, Availability Calendar (`POST /api/mover/availability`, `routes.ts:11504`), Earnings + PDF export (`routes.ts:11342`), Stripe Connect payout setup, Terms Acceptance versioning. Referral infrastructure present in schema; UI integration unclear.

### Partner (Enterprise) portal — complete
14 pages under `client/src/pages/partner/`: activation, onboarding, dashboard, bookings + detail, compliance, incidents, team, messages, users, audit log, earnings, legal. All roles supported; user management is `partner_admin`-only. Full lifecycle: activation via invite token → onboarding submission → coverage zones + compliance docs → team + dispatch config → accept/reject/assign bookings → status transitions → proof of completion → incident reporting → Stripe Connect payouts.

### Admin portal — complete
Verification review, users (lock/unlock, force-verify, delete), movers (pilot status, override onboarding), moves, revenue, payouts (including manual transfers), Support Dashboard (AI-suggested responses), Email Center (campaign creation + attachment upload + send), Partner Management (conditional on flag).

### API surface
- **`server/routes.ts`:** 130+ endpoints. Auth (14 including OTP), users/movers, bookings (create/read/update/accept/decline/edit + payment intent lifecycle + location + metrics), payment methods, messages, reviews, admin (~40), support/AI, uploads, health.
- **`server/partnerRoutes.ts`:** 65+ endpoints. Activation, profile, onboarding, coverage, compliance, dispatch, team, bookings/accept/reject/assign/status/proof/messages, incidents, earnings, Stripe, dashboard, users, audit, direct messages, admin-partner management.

### WebSockets (raw `ws`, not Socket.io)
Two separate servers with short-lived (5-min, one-time) token auth issued by REST:
- **`/ws/mover-notifications`** (`server/websocket.ts:92`) — server→client: `ping`, `connected`, `job_notification` (bookingId, addresses, price, ETA, earnings, expiresAt, isPriority), `booking_update`, `message`. Client→server: `pong`.
- **`/ws/customer-notifications`** (`server/websocket.ts:286`) — server→client: `ping`, `connected`, `booking_update`. Client→server: `pong`.
- **Client hook:** `client/src/hooks/useMoverWebSocket.ts` — auto-reconnect at 5s, token refresh on failure at 10s. Used in `MoverDashboard.tsx`, `Header.tsx`, `JobNotificationSound.tsx`, `AuthContext.tsx`.
- **Partner and Admin do not use WebSockets** — they poll.

### Cross-portal features
- **Messaging:** Customer↔Mover (booking-scoped), Partner↔Admin (both booking-scoped and org-scoped direct messages via `partnerDirectMessages` table).
- **Notifications:** Resend email (rate-limited ~1.8/sec), Telnyx SMS, WebSocket, in-app notifications table.
- **Payments (Stripe):** PaymentIntent + SetupIntent (customers), Connect (partners + partner-onboarded movers), manual transfers (legacy movers). Webhook at `POST /api/stripe-webhook` (`routes.ts:5473`) with signature verification.
- **AI:** photo analysis (`POST /api/ai/analyze-photo`, `/api/ai/items/identify`), support ticket analysis, item corrections (`PATCH /api/ai/items/:itemId`), learning insights.

No TODO/FIXME/HACK comments found in `client/src` or `server/`.

---

## 3. Mobile Readiness

### Current setup
Capacitor 8.3 (`capacitor.config.ts` — appId `com.lervit.app`, webDir `dist/public`). iOS project at `ios/App/`, Android at `android/app/`. **`codemagic.yaml` has an iOS-only release workflow — no Android CI/CD.** 15 Capacitor plugins in `package.json` (app, browser, camera, geolocation, google-maps, haptics, keyboard, network, push-notifications, splash-screen, status-bar, ios, android, cli, core).

### Web-only API usage (RN-breaking)
| API | Files | Severity |
|---|---:|---|
| `window.*` | 48 | High (WebSocket URL builds, matchMedia, history, AudioContext) |
| `document.*` | 18 | Medium-High (root mount, script injection for Maps, canvas ops) |
| `localStorage` | 10 | Medium (auth token in `MoverVerification.tsx:183` = **security concern**) |
| `sessionStorage` | 5 | Medium-High (multi-step booking form recovery in `bookingDraft.ts`, `RequestMove.tsx`) |
| `navigator.*` | 10 | Medium (geolocation already has Capacitor plugin; clipboard, wakeLock, sendBeacon do not) |

Critical hotspots:
- `client/src/main.tsx:33` — `window.history.back()`.
- `client/src/contexts/AuthContext.tsx:68-69` — WebSocket URL built from `window.location`.
- `client/src/contexts/GoogleMapsContext.tsx:54,64` — DOM script injection for Google Maps JS SDK; will not work in RN.
- `client/src/components/ImageUpload.tsx:20,242` — canvas-based image processing.
- `client/src/components/JobNotificationSound.tsx:126` — Web Audio API (`AudioContext`).
- `client/src/lib/exportCsv.ts:20-22` — Blob + `<a>` download; needs `expo-file-system` / `RNFS`.

### Component portability
- **UI kit:** Radix + shadcn/ui (47 components) with Tailwind — **all HTML/CSS; requires a component-by-component rewrite** in RN primitives + `StyleSheet`/NativeWind.
- **Animations:** `framer-motion` in 8 files (5 production: `PageTransition.tsx`, `SplashScreen.tsx`, `InstallPrompt.tsx`, `LoadingOverlay.tsx`, `pages/Support.tsx`; 3 archived). Requires rewrite to `Animated` / Reanimated.
- **Icons:** `lucide-react` — needs `react-native-svg` mapping or vector-icons library.
- **Portable as-is:** TanStack Query (v5.60.5), fetch layer, Zod validators, auth logic (once token-based).

### JWT / auth cleanliness
- **Server:** `server/auth.ts` uses bcrypt (cost 12) + legacy SHA-256 fallback for password checks. **No JWT minting in `server/auth.ts`** — auth is session-cookie-based (`express-session` in `server/index.ts:87-100`).
- **WebSocket auth is clean:** 5-minute one-time tokens issued via `GET /api/auth/ws-token/customer` and `GET /api/movers/me/ws-token` (`server/websocket.ts:44,60`). This is the model to generalize.
- **`client/src/pages/MoverVerification.tsx:183`** reads `localStorage.getItem('token')` and sends `Authorization: Bearer ...` — implies a JWT path exists somewhere, but the rest of the app uses `credentials: 'include'` cookies (`client/src/lib/queryClient.ts:11-14`). This inconsistency needs resolution before RN.
- **Native detection is already in place:** `client/src/lib/native.ts:6` switches `API_BASE_URL` for Capacitor.

### Existing native use
Actively used: `@capacitor/geolocation` (LocationContext, MoverDashboard watchPosition), `@capacitor/camera` (ImageUpload), `@capacitor/browser`, `@capacitor/keyboard`, `@capacitor/status-bar`, `@capacitor/app`, `@capacitor/splash-screen`. Configured but not used in client code: `@capacitor/push-notifications`, `@capacitor/network`, `@capacitor/haptics`, `@capacitor/google-maps`. Missing plugins for future needs: clipboard, keep-awake, secure-storage, audio.

### RN rewrite estimate
Roughly **3-4 months** for full production RN app: 60-70 days on UI (47 components + framer replacement), 10-15 days on storage/nav/permissions abstractions, 5-10 days on Capacitor→RN plugin work, 15-20 days on testing and polish.

---

## 4. Agent Readiness

### Database schema — ~40 tables
Full inventory below. Notable groupings:

**Core:** `users`, `movers`, `bookings`, `messages`, `reviews`, `jobNotifications` (with `pending`/`expired`/`declined` state + `expiresAt`), `savedAddresses`, `moverAvailability`, `referrals`.

**Payments:** `moverStripeAccounts` (Connect onboarding lifecycle), `moverEarnings` (per-booking, `pending`/`available`/`paid`/`failed`), `moverPayouts` (batch history).

**AI + learning:** `identifiedItems` (per-photo with `processingStatus`, `sourceMetadata` JSON), `aiRuns` (provider, operation, token counts, cost, response time), `aiSupportInsights`, `aiIncidentInsights`, `itemFeedback` (corrections), `bookingMetrics` (actual vs estimate), `moverPerformance`, `learningInsights` (aggregated periodic rollups).

**Verification/legal:** `verificationItems`, `moverTermsAcceptance` (with IP + user agent audit).

**Enterprise:** `partners`, `partnerUsers`, `coverageZones`, `bookingAssignments`, `bookingStatusEvents` (state-transition audit), `partnerIncidents`, `proofOfCompletion`, `complianceDocs`, `partnerAuditLog`, `partnerDirectMessages`.

**Support & notifications:** `supportTickets`, `supportTicketReplies`, `inAppNotifications`, `analyticsEvents`, `emailCampaigns`, `abandonedBookings`, `phoneVerificationTokens`, `feedbackSurveys`.

State machines encoded in schema (`shared/schema.ts:834-878` for booking, `1433-1477` for partner booking), with `isValidStatusTransition` and `getNextValidStatuses` helpers.

### Webhooks & external I/O
**Inbound:**
- `POST /api/stripe-webhook` (`server/routes.ts:5473`) — signature-verified; handles `payment_intent.succeeded`, `charge.dispute.created`, `payout.paid`. Idempotency via DB uniqueness + state checks.
- No other inbound webhooks (no Telnyx delivery receipts, no Resend event webhooks, no GitHub/Slack).

**Outbound (all wrapped by circuit breakers in `server/circuit-breaker.ts`):** Stripe, Telnyx, Resend, Google Maps, OpenAI. Breaker thresholds/timeouts documented per service (OpenAI: 3 fails / 60s / 30s timeout; others 5 fails / 30s).

### Event bus / pub-sub — **ABSENT**
No EventEmitter, Redis pub/sub, Kafka, RabbitMQ, or Postgres LISTEN/NOTIFY. The closest thing is direct WebSocket broadcast in `notifyMover(moverId, {...})`. Offline movers depend on 30-second frontend polling.

### Queue system — **WEAK**
- No BullMQ / Bull / Agenda / Kue. `node-cron` is a scheduler, not a queue.
- `server/vision-queue.ts` is an **in-memory** queue: serial processing with 100 ms delay, max 2 immediate retries, no persistence. If the process crashes, DB rows remain `processing` (or `pending` for those never picked up), and there is no re-enqueue on restart.
- Background jobs (`server/background-jobs.ts`, ~1329 lines) are 9 cron-scheduled tasks with per-process mutexes and optimistic-lock DB updates. Timezone hardcoded to `America/Edmonton`. Recovery is inherently cron-tick-based (next tick retries).
- Payment recovery (`recoverOrphanedPayments`, `background-jobs.ts:372`) polls Stripe every ~10 minutes for state drift — a good pattern that compensates for missed webhooks.

### Idempotency
- **Present:** Stripe payment intents (`booking_${id}_${amount}_${pm}`), transfers (`transfer-${bookingId}-v2`, `auto-transfer-onboard-${bookingId}`), job dispatch (`onConflictDoNothing` on `jobNotifications` unique constraint).
- **Absent:** email + SMS delivery, in-app notification creation, most PATCH endpoints.

### Observability
- **`server/logger.ts`** — Pino JSON logs with `logEvent.payment/booking/notification/matching/cleanup/auth/vision/pricing/error(...)` categorization. `LOG_LEVEL` env-controlled. Pino-pretty in dev.
- **No request-ID correlation** across async operations, no OpenTelemetry, no distributed tracing context.
- **Health:** `GET /health` (basic) and `GET /api/health/detailed` (`routes.ts:11603, 11616`).

### AI integration surface
`server/vision-engine-v2.ts` (~909 lines) — three-layer pipeline (GPT-4o Vision → `FURNITURE_DATABASE` similarity match at 0.70 threshold → `server/dimension-corrector.ts` rule-based clamps). Model `gpt-4o` hardcoded (line 427), inline prompt (lines 434-549), `temperature: 0`, `seed: 42`, `max_tokens: 500`. Content-hash caching (line 669). Handles HEIC via `heic-convert`.

`server/ai-support-analyzer.ts` — GPT-4o hardcoded (lines 130, 316, 469). Persists to `aiSupportInsights`.

`server/ai-identifier.ts` — Superseded by vision-engine-v2, still in tree.

**No prompt registry.** No versioning. No A/B testing. No structured output schema (raw JSON string-parsed with markdown-fence stripping). `aiRuns.totalCost` exists but is not automatically populated — token counts are logged, dollars are not.

### Notifications
- Resend email — rate-limited to ~1.8/sec via in-process `EmailRateLimiter`; unbounded queue; dev-mode blocked; no retry on failure.
- Telnyx SMS — synchronous POST, no in-process rate limiter, no retry, dev-mode blocked except phone verification.
- WebSocket — best-effort; offline movers rely on polling fallback.

**Dispatch protocol (AC-1..AC-10) is documented in `server/dispatch.ts`** — vehicle enforcement, proximity ranking (15→50 km expansion), de-duplication (`onConflictDoNothing`), multi-channel fan-out, pre-selected mover priority, decline→re-dispatch, orphan recovery, offline fallback polling, 10-minute expiry, idempotent dispatch. This is the strongest agent-friendly primitive in the codebase.

---

## 5. Vision & Pricing

### GPT-4o integration
- SDK: `openai@^6.9.1` (`package.json:105`).
- Vision entry: `server/vision-engine-v2.ts:415-583` (`detectItemWithVision`). Model `gpt-4o`, `temperature: 0`, `seed: 42`, `max_tokens: 500`. Image passed as `data:image/jpeg;base64,...` or direct URL after HEIC conversion (lines 92-168).
- Response: JSON with `itemName`, `category`, `subcategory`, `confidence`, `estimatedDimensions`, `estimatedWeight`. No JSON schema / structured output — direct `JSON.parse` with fence-stripping.
- Cost tracking: `aiRuns` table records `inputTokens`, `outputTokens`, `responseTime`, `status`; `totalCost` field exists but is **not calculated automatically**.

### Reference data
- `shared/furniture-database.ts` — **static TypeScript array** with 50+ items. Each item: `item_id`, `name`, `category`, `subcategory`, `keywords`, `dimensions_cm{length,width,height}`, `volume_ft3`, `weight_kg`, `load_size`, `vehicle`, `movers_required`, `handling_complexity`, `insurance_level`. Ground-truth for matching.
- `server/dimension-corrector.ts` (~471 lines) — category-specific min/max clamps that override AI's unrealistic estimates (e.g., "accent chair enforced ≥12 ft³").

### Pricing formula (`shared/pricing.ts:211-310`, `calculatePrice()`)
Inputs: `pickupToDropoffDistance`, `loadSize`, `pickupDifficulty`, `dropoffDifficulty`, `heavyItem`/`heavyItemCount`/`heavyItemFeeOverride`, `numberOfMovers`, optional `moverToPickupDistance` and `volumeCuft`.

Steps:
1. **Vehicle class** (A/B/C/E) from volume or load size (lines 53-109). A: $12 + $1.08/km; B/C: $20 + $1.80/km; E: $50 + $2.40/km.
2. **Load-size fee:** either `volumeCuft × $0.20/ft³` (min $6) or flat tier ($6/23/58/75).
3. **Access fees:** ground $0, basement $12, stairs $6, elevator $9.60 per end.
4. **Apartment premium:** +$60 if ≥300 ft³.
5. **Heavy items:** override or `count × $10` or boolean → $10.
6. **Mover travel:** `(distance - 5km) × $0.90/km` above 5 km.
7. **2-mover multiplier:** ×1.30.
8. **No surge, no time-of-day, no rush fees, no admin UI for coefficients** — all rates hardcoded (lines 152-193). Changes require redeploy.

Called from `server/routes.ts` at booking create (~line 350) and update (~line 550), and from `shared/matching.ts:144-151` when ranking mover candidates.

### Quote history
- Every AI photo analysis persists to `identifiedItems` with `photoUrl`, results, and `sourceMetadata` JSON (source: `database_match`|`vision_estimate`|`fallback`, matched item ID, corrections applied, processing time).
- Every AI call logs to `aiRuns`.
- Booking price stored in `bookings.price` alongside `vehicleType`, `loadSize`, `numberOfMovers`, `pickupDifficulty`, `dropoffDifficulty`.
- **Replay is possible in principle** (photoUrl + code) — but no UI, no cache-bypass mechanism, no "AI estimate vs. actual price" comparison field. `bookingMetrics` table tracks estimated vs. actual vehicle class and volume/price accuracy — designed for it, but no code was found populating it automatically.

### Feedback loop
- `itemFeedback` table exists (schema.ts:672) — schema is ready.
- **No UI found** for mover/customer to correct AI misidentifications.
- Dimension corrections are diagnostic only (stored in `sourceMetadata.corrections`); they don't retrain, tune prompts, or update the furniture DB.
- No historical labor/vehicle cost storage — pricing is entirely forward-looking from hardcoded coefficients.

### Vehicle matching
`shared/vehicle-availability.ts` + `shared/matching.ts` — `VEHICLE_PRIORITY_ORDER: ['car','pickup','van','truck']`. Single-tier upgrade only (van ↛ truck skipped only if van also unavailable). Radius expansion for mover proximity.

---

## Mobile Readiness Score: **5 / 10**

Rationale:
- **+** Capacitor is real and ships iOS today (Codemagic release workflow). Capacitor plugins for camera/geolocation are already integrated. `native.ts` already switches API base URL.
- **+** Data layer (TanStack Query, fetch, Zod, auth logic) is portable.
- **−** Session-cookie auth is not RN-friendly; a direct `localStorage.getItem('token')` in `MoverVerification.tsx:183` suggests inconsistent auth.
- **−** 48 files touch `window.*`, 18 touch `document.*`, framer-motion animations in 5 production files, entire UI kit is Radix HTML/CSS.
- **−** Google Maps loaded via script injection; canvas image processing; Web Audio for notification sound.
- **−** No Android CI/CD workflow.
- **Verdict:** Perfectly reasonable for Capacitor-wrapped shipping now. A native React Native rewrite is a genuine 3-4 month project.

## Agent Readiness Score: **6 / 10**

Rationale:
- **+** Rich schema with state-machine helpers, audit tables, learning tables, per-photo AI provenance.
- **+** Pino structured JSON logs with event categorization.
- **+** Circuit breakers on every external service.
- **+** Idempotency keys on all Stripe operations; `onConflictDoNothing` for dispatch de-dup.
- **+** Stripe payment recovery job compensates for missed webhooks — a good self-healing pattern.
- **+** Documented dispatch protocol (AC-1..AC-10) — the strongest agent primitive present.
- **−** No persistent work queue. `vision-queue` is in-memory and loses work on crash.
- **−** No event bus / pub-sub. WebSocket-only fan-out with polling fallback.
- **−** No prompt registry — GPT-4o prompts are inline, no versioning.
- **−** No request-ID correlation, no distributed tracing.
- **−** No idempotency on notification (email/SMS) delivery.
- **−** `aiRuns.totalCost` not automatically calculated; no cost alerts.
- **Verdict:** Excellent bones; missing the durable queue + event fabric that agents lean on for reliability.

---

## Prioritized Gap List

### P0 — blocking, do first
1. **Purge hardcoded `lervit.replit.app` URLs** — `server/notifications.ts:583,1377,1389`. Standardize on `BASE_URL` env var everywhere.
2. **Migrate object storage off Replit sidecar** — `server/objectStorage.ts:4-33`. Direct GCS auth via service account JSON, or move to S3/R2/Vercel Blob.
3. **Fix inconsistent auth** — remove `localStorage.getItem('token')` at `client/src/pages/MoverVerification.tsx:183` and decide: session cookies everywhere, or JWT everywhere. If RN is on the roadmap, choose JWT and reuse the WebSocket short-lived-token pattern already in `server/websocket.ts:44-60`.
4. **Introduce a persistent queue** — Redis + BullMQ, at minimum for the vision pipeline (currently in-memory; jobs are crash-lost). Second wave: email/SMS delivery.

### P1 — required for Railway + Vercel cutover
5. **Drop Replit vite plugins** — `package.json:133-135` and `vite.config.ts:4,10-20`.
6. **Split monolith deployment topology** — server + worker on Railway (two services), SPA on Vercel; wire CORS + `BASE_URL` + `VITE_STRIPE_PUBLIC_KEY`.
7. **Add deploy step to `.github/workflows/ci.yml`** — currently typecheck/lint/smoke only.
8. **Add Android CI/CD** — `codemagic.yaml` has iOS only.
9. **Make timezone env-driven** — currently hardcoded `America/Edmonton` in `server/index.ts:1-2` and `server/background-jobs.ts:43`.

### P2 — agent + AI improvements
10. **Extract prompt registry** — move inline GPT-4o prompts out of `server/vision-engine-v2.ts:434-549` and `server/ai-support-analyzer.ts` into versioned files. Enables A/B testing and iterating pricing/UX without redeploys.
11. **Structured outputs for GPT-4o** — use OpenAI's `response_format: { type: 'json_schema' }` instead of markdown-fence stripping.
12. **Populate `aiRuns.totalCost`** — calculate from token counts + model rate table at call site; add cost-alert threshold job.
13. **Add request-ID correlation** — AsyncLocalStorage-based request ID threaded through Pino logs; enables tracing an agent workflow end-to-end.
14. **Idempotency tokens on email/SMS** — currently duplicates possible if endpoints retry.
15. **Feedback loop UI** — schema (`itemFeedback`) exists; add mover-facing correction UI so mis-identified items feed back into learning.

### P3 — pricing productization
16. **Admin pricing UI** — surface `shared/pricing.ts:152-193` coefficients as DB-backed config with an admin editor. Currently all rate changes require a redeploy.
17. **Surge / time-of-day pricing** — currently linear; no rush multiplier, no weekend/holiday premium.
18. **Actual-vs-estimate tracking** — populate `bookingMetrics` (schema.ts:625) automatically on booking completion; enables learning pipeline to close the loop.

### P4 — general hardening
19. **Remove or delete deprecated `server/ai-identifier.ts`** if truly superseded by `vision-engine-v2.ts`.
20. **Consolidate `URL fallback chains`** — one helper (`getBaseUrl()`) called everywhere, not duplicated across 8+ files.
21. **Health check depth** — `GET /api/health/detailed` exists; ensure it validates DB, Stripe, OpenAI reachability for uptime monitors.

---

## Appendix: Key file references

| Area | File | Notes |
|---|---|---|
| Server boot | `server/index.ts:219` | Port bind |
| Sessions | `server/index.ts:59-100` | PG session store + cookies |
| Auth | `server/auth.ts` | bcrypt only; no JWT minted here |
| WebSocket auth pattern | `server/websocket.ts:44,60` | Short-lived one-time token — model for RN |
| Routes (customer/mover/admin) | `server/routes.ts` | 130+ endpoints |
| Partner routes | `server/partnerRoutes.ts` | 65+ endpoints |
| Dispatch | `server/dispatch.ts` | AC-1..AC-10 protocol |
| Background jobs | `server/background-jobs.ts` | 9 cron tasks |
| Vision engine | `server/vision-engine-v2.ts:415-909` | GPT-4o pipeline |
| Vision queue | `server/vision-queue.ts` | In-memory, non-durable |
| Circuit breakers | `server/circuit-breaker.ts` | Per-service thresholds |
| Object storage | `server/objectStorage.ts:4-33` | Replit sidecar dependency |
| Notifications | `server/notifications.ts` | Email + SMS + hardcoded URLs |
| Schema | `shared/schema.ts` | ~40 tables + state machines |
| Pricing | `shared/pricing.ts:211-310` | Hardcoded coefficients |
| Furniture DB | `shared/furniture-database.ts` | 50+ items, static |
| Client router | `client/src/App.tsx` | Wouter + role gating |
| Native detection | `client/src/lib/native.ts:6` | Capacitor switch |
| Query client | `client/src/lib/queryClient.ts:11-14` | `credentials: 'include'` |
| Auth context | `client/src/contexts/AuthContext.tsx` | Session-cookie based |
| Mover WS hook | `client/src/hooks/useMoverWebSocket.ts` | Auto-reconnect |
