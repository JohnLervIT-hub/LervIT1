# LervIT / MoveDeck — Full Codebase & Product Audit + PRD
**Audit Date:** June 20, 2026  
**Auditor:** Claude Code (Senior Full-Stack + Product)  
**Classification:** Internal — Engineering & Product Leadership  
**Production URL:** https://app.lervit.com  
**Production Baseline:** 71 users (35 customers, 35 movers), 37 bookings, 16 completed moves

---

## Part 1 — Codebase Audit

---

### 1.1 Tech Stack Inventory

| Layer | Technology | Version | Notes |
|---|---|---|---|
| **Frontend Framework** | React | 18.3.1 | SPA, no SSR |
| **Language** | TypeScript | 5.6.3 | Shared across client/server/shared |
| **Routing** | Wouter | 3.3.5 | Lightweight, no React Router |
| **State / Data Fetching** | TanStack Query | 5.60.5 | |
| **UI Components** | Radix UI (full suite) | various | shadcn/ui pattern |
| **Styling** | Tailwind CSS | 3.4.17 | + tailwindcss-animate |
| **Animation** | Framer Motion | 11.13.1 | Page transitions |
| **Charts** | Recharts | 2.15.2 | Admin dashboards |
| **Forms** | React Hook Form + Zod | 7.55 / 3.24 | Shared schema validation |
| **Backend Runtime** | Node.js + Express | 4.21.2 | Single process |
| **Backend Language** | TypeScript via tsx | 4.20.5 | Dev; esbuild for prod |
| **ORM** | Drizzle ORM | 0.39.1 | + drizzle-zod |
| **Database** | Neon (PostgreSQL serverless) | @0.10.4 | WebSocket driver |
| **Authentication** | express-session + passport-local | 1.18.1 | Session-based, no JWT |
| **Password Hashing** | SHA-256 + random salt (custom) | — | **⚠️ Not bcrypt/Argon2** |
| **Payments** | Stripe (Connect Express) | 20.0.0 | CAD currency |
| **Email** | Resend | 6.5.2 | **⚠️ API key missing in prod** |
| **SMS** | Telnyx | 4.6.0 | Job alerts, OTP |
| **AI** | OpenAI GPT-4o Vision | 6.9.1 | **⚠️ API key missing in prod** |
| **Maps** | Google Maps JS API | @react-google-maps/api 2.20.7 | Geocoding + routing |
| **Real-Time** | WebSocket (ws) | 8.18.0 | Mover-only; customers poll |
| **Background Jobs** | node-cron | 4.2.1 | Same process as HTTP server |
| **File Uploads** | Multer + Replit Object Storage | 2.0.2 | HEIC/AVIF supported |
| **Image Processing** | sharp + heic-convert | 0.34 / 2.1 | Mobile format support |
| **Logging** | Pino | 10.1.0 | Structured JSON; pino-pretty in dev |
| **Rate Limiting** | express-rate-limit | 8.2.1 | Per-endpoint limiters |
| **Compression** | compression | 1.8.1 | Gzip level 6 |
| **Mobile Wrapper** | Capacitor | 8.3.0 | Android + iOS shells |
| **Build Tool** | Vite | 5.4.20 | Frontend; esbuild for server |
| **PDF Generation** | PDFKit | 0.18.0 | Technical brief only |

---

### 1.2 File / Folder Structure Overview

```
LervIT1/
├── client/src/
│   ├── components/         UI components (57 files)
│   │   ├── ui/             Radix/shadcn base components (41 files)
│   │   └── admin/          Admin row layout
│   ├── contexts/           Auth, GoogleMaps, Location, Theme
│   ├── hooks/              use-analytics, useResilientPolling, useWakeLock, useMoverWebSocket
│   ├── lib/                queryClient, fetchWithRetry, bookingDraft, locationProvider, currency
│   ├── pages/              34 routes (+ 14 partner pages + 4 archived demos)
│   └── types/              global.d.ts
├── server/
│   ├── routes.ts           ⚠️ 10,965 lines — monolithic route file
│   ├── partnerRoutes.ts    Enterprise partner API
│   ├── auth.ts             Password hash/verify (SHA-256)
│   ├── dispatch.ts         Mover matching + notification dispatch
│   ├── background-jobs.ts  9 cron jobs
│   ├── notifications.ts    Email (Resend) + SMS (Telnyx)
│   ├── vision-engine-v2.ts AI image identification pipeline
│   ├── ai-identifier.ts    AI identifier layer
│   ├── ai-support-analyzer.ts  AI support copilot
│   ├── websocket.ts        Mover-only WebSocket server
│   ├── objectStorage.ts    Replit Object Storage wrapper
│   ├── middleware/security.ts  CORS + rate limits + headers
│   ├── config/stripe.ts    Stripe singleton + fee calculator
│   ├── db.ts               Neon connection pool
│   └── storage.ts          Data access layer (DB abstraction)
├── shared/
│   ├── schema.ts           Drizzle schema — 27 tables, 1,511 lines
│   ├── pricing.ts          Vehicle class pricing engine
│   ├── matching.ts         Proximity matching algorithm
│   ├── ai.ts               AI feature flags + quote logic
│   ├── furniture-database.ts  Ground-truth item database
│   ├── geocoding.ts        Haversine distance utilities
│   └── vehicle-availability.ts
├── migrations/             ⚠️ Only 1 migration file (0000) — drizzle push used
├── android/ ios/           Capacitor native shells
├── exports/                Internal docs (roadmap, technical brief, PaaS scope)
└── artifacts/              Mockup sandbox (separate Vite app)
```

**Key structural observation:** `server/routes.ts` at 10,965 lines is the single most significant maintenance liability in the codebase. It contains authentication, booking, payment, AI, admin, partner, analytics, and notification logic in one file.

---

### 1.3 Identified Bugs, Broken Logic, and Incomplete Features

#### 🔴 Critical (P0) — Production Blockers

| # | File | Issue | Impact |
|---|---|---|---|
| 1 | `server/notifications.ts:26` | `RESEND_API_KEY` not set in production → `resend` client is `null` at startup → **all email is silently dropped** | Move confirmations, Stripe onboarding nudges, abandoned booking reminders, verification status — none delivered |
| 2 | `server/vision-engine-v2.ts:50`, `ai-identifier.ts:9` | `OPENAI_API_KEY` not set in production → `openai` client is `null` → Vision Engine returns nothing | Booking step 2 photo analysis returns no AI result; load size/vehicle recommendation falls back to manual input |
| 3 | `server/ai-support-analyzer.ts:99` | Same `OPENAI_API_KEY` guard → AI Support Copilot returns empty early → no ticket summaries or suggested responses in admin | Admin support team blind to AI-assisted triage |
| 4 | `shared/schema.ts` + `server/routes.ts:3322` | `promo_code_uses` table referenced in promo code logic does **not exist in production schema** → runtime error when customer applies LERVIT20 | Any customer attempting a promo code hits a 500 error |
| 5 | `server/routes.ts:5697` | `TODO: Implement refund handling` — Stripe `charge.refunded` webhook event is handled with a log only; no booking status update, no customer notification | Refunds processed in Stripe dashboard never reflected in platform |
| 6 | `server/routes.ts:2371,2392` | Two `TODO: Send notification` comments in verification item approval/rejection flow — notifications never sent to movers when their documents are approved or rejected | Movers unaware of verification status changes unless they actively check |

#### 🟡 High (P1) — Significant Gaps

| # | File | Issue |
|---|---|---|
| 7 | `server/auth.ts` | Passwords hashed with SHA-256 + random salt. SHA-256 is a **general-purpose hash, not a password KDF** — it's orders of magnitude faster to brute-force than bcrypt/scrypt/Argon2. Should be migrated to bcrypt with cost factor ≥12. |
| 8 | `server/index.ts:96` | `sameSite: 'lax'` — should be `'strict'` for an authenticated app with no cross-site form submissions |
| 9 | `server/routes.ts:280-285` | `/uploads` static directory served with `Access-Control-Allow-Origin: *` — unnecessarily broad; uploaded images (driver documents, vehicle photos) accessible from any origin |
| 10 | `server/index.ts:89` | Default `SESSION_SECRET` of `'lervit-dev-secret-change-in-production'` used if env not set — warning exists but no hard fail in dev |
| 11 | `server/routes.ts:227-251` | `/api/downloads/roadmap` and `/api/downloads/technical-brief` — internal strategic documents (pricing analysis, 12-month roadmap, PaaS scope, patent search status) are **public endpoints with no authentication** |
| 12 | `TESTING_GUIDE.md` | Admin credentials `admin@lervit.com` / `admin123` hardcoded in committed document — accessible to anyone with repo access |
| 13 | `server/background-jobs.ts` | `node-cron` logs `missed execution` every ~30 minutes in production — cron and HTTP server share the same single-threaded event loop; heavy request handling starves cron execution window |
| 14 | `server/dispatch.ts:100-125` | `loadOperationalMovers` fetches user records **individually for each mover** via `Promise.all` of N separate DB queries — N+1 pattern at the most latency-sensitive point (job dispatch) |
| 15 | `server/routes.ts` | No input sanitization (DOMPurify/he) for user-generated text in messages and reviews — **XSS risk** if content is ever rendered as HTML |

#### 🟠 Medium (P2) — Technical Debt

| # | File | Issue |
|---|---|---|
| 16 | `server/routes.ts` | 10,965-line monolithic route file with 102 `as any` type casts — untestable, hard to navigate, single point of failure |
| 17 | `migrations/` | Only one migration (`0000`); schema changes deployed via `drizzle-kit push` rather than versioned migrations — risky for production schema management |
| 18 | `server/vision-engine-v2.ts:56-59` | In-memory vision result cache (`visionResultCache`) not shared across process restarts or multiple instances — cache warm-up lost on every deploy |
| 19 | `client/src/lib/locationProvider.ts` | Google Places legacy API (`PlacesService`) in use — deprecated by Google; migration to new Places API documented but not yet done |
| 20 | `client/src/pages/AdminDashboard.tsx`, `AdminMovesPage.tsx` | Admin tables load **all records with no pagination** — becomes unusable/slow beyond ~500 records |
| 21 | `shared/pricing.ts:87-97` | Vehicle Class D (`'Cargo Van (Legacy)'`) is deprecated but still in the `VEHICLE_CLASSES` map — active in LOAD_SIZE_TO_CLASS with overlapping volume range with Class C; can produce inconsistent pricing |
| 22 | `tests/` | Only `load-test.js` and `smoke-tests.ts` exist — no unit tests for pricing logic, matching algorithm, or auth; no E2E tests |
| 23 | `server/websocket.ts` | WebSocket server is **mover-only** — customers get no real-time push; they rely on frontend polling intervals to detect booking status changes |
| 24 | `capacitor.config.ts` | `VITE_ENABLE_ENTERPRISE` feature flag read at build time from `import.meta.env` — partner portal is compile-time controlled, not runtime; changing it requires a redeploy |

---

### 1.4 Performance Bottlenecks

| Bottleneck | Location | Severity | Notes |
|---|---|---|---|
| N+1 query in dispatch | `server/dispatch.ts:106-113` | High | Fetches user per mover in a loop; should be a single JOIN |
| N+1 in booking list | `server/routes.ts` (GET /api/bookings) | Medium | Enriches each booking with customer/mover data individually |
| No pagination on admin endpoints | `server/routes.ts` (admin routes) | High at scale | Full table scans returned to frontend |
| Monolithic routes.ts (10,965 lines) | `server/routes.ts` | Medium | esbuild cold-start time, developer cognitive load |
| node-cron event loop contention | `server/background-jobs.ts` | Medium | Cron misses execution slots under load |
| In-memory caches not shared | `server/vision-engine-v2.ts` | Low | Vision cache lost on restart; no Redis |
| No CDN for object storage | Object Storage endpoints | Medium | Images served through app server; each image request hits Express |
| `express.json` body limit 50MB | `server/index.ts:114` | Low | Generous limit increases DoS surface |
| Google Maps loaded eagerly | `client/src/contexts/GoogleMapsContext.tsx` | Low | Maps SDK loaded on every page load, not just booking flow |

---

### 1.5 Security Concerns

| Severity | Concern | Location | Recommendation |
|---|---|---|---|
| 🔴 High | Password hashing uses SHA-256 (not a KDF) | `server/auth.ts` | Migrate to `bcryptjs` with cost 12; add migration to re-hash on next login |
| 🔴 High | Internal documents accessible without auth | `server/routes.ts:227-251` | Add `requireAdmin` guard to `/api/downloads/*` endpoints |
| 🔴 High | Admin credentials in committed file | `TESTING_GUIDE.md` | Rotate admin password; remove credentials from all committed files |
| 🟡 Medium | `sameSite: 'lax'` on session cookie | `server/index.ts:96` | Upgrade to `sameSite: 'strict'` |
| 🟡 Medium | No XSS sanitization on user content | `server/routes.ts` (messages, reviews) | Add `he` or `DOMPurify` (server-side) before persisting user text |
| 🟡 Medium | Uploads served with `CORS: *` | `server/routes.ts:283` | Restrict to platform origins only |
| 🟡 Medium | No absolute session expiry | `server/index.ts:95-97` | Add `rolling: false` and enforce 8-hour absolute TTL |
| 🟠 Low | `as any` casts bypass type safety | `server/routes.ts` (102 instances) | Gradual strict typing refactor |
| 🟠 Low | Unused Twilio credentials alongside Telnyx | Env vars | Remove unused Twilio vars to reduce secret surface |
| 🟠 Low | JSON body limit 50MB | `server/index.ts:114` | Reduce to 10MB for API routes; keep 50MB only for upload endpoints |

---

### 1.6 Mobile Responsiveness Assessment

| Area | Status | Notes |
|---|---|---|
| Capacitor native shell | ✅ Good | Android + iOS Capacitor 8.3 wrappers in place |
| PWA / Service Worker | ✅ Good | `client/public/sw.js`, `manifest.json`, install prompt component |
| Mobile bottom nav | ✅ Good | `MobileBottomNav.tsx` with `pb-16 md:pb-0` padding |
| Responsive layouts | ✅ Good | Tailwind responsive prefixes used consistently |
| Touch targets | ✅ Good | Radix UI components have accessible touch sizing |
| HEIC/HEIF upload support | ✅ Good | iOS photos handled via `heic-convert` |
| Wake lock for movers | ✅ Good | `useWakeLock` hook prevents screen sleep during active jobs |
| Google Maps on mobile | ⚠️ Partial | Maps load on all pages; no Capacitor native map plugin used |
| Splash screen | ✅ Good | 800ms animated splash, skipped for returning users |
| Dark mode | ✅ Good | `ThemeContext` + `next-themes` + `ThemeToggle` component |
| Offline capability | ⚠️ Partial | Service worker exists but no offline data caching strategy |

---

## Part 2 — Product Audit

---

### 2.1 Current Feature Inventory

#### Customer Flow
| Feature | Status | Notes |
|---|---|---|
| Email + password signup | ✅ Complete | + OTP phone verification |
| Email verification | ✅ Complete | Token-based |
| Password reset | ✅ Complete | Token email flow |
| Browse movers (public) | ✅ Complete | Location masking, rating display |
| 3-step booking flow | ✅ Complete | Addresses → Load/AI → Date/Mover |
| AI photo analysis (Vision Engine) | ⚠️ Broken in prod | Works when OPENAI_API_KEY set |
| AI auto-quote predictor | ✅ Complete | Pure math, no API key needed |
| Dynamic pricing engine | ✅ Complete | Vehicle class-based, difficulty surcharges |
| Mover selection (pre-select) | ✅ Complete | Priority dispatch to chosen mover |
| Stripe payment (Elements) | ✅ Complete | CAD, card + saved card |
| Promo code (LERVIT20) | ⚠️ Broken | `promo_code_uses` table missing in prod |
| Real-time trip tracking | ✅ Complete | GPS polling every 30s |
| Customer–Mover messaging | ✅ Complete | In-booking chat |
| In-app notifications / Inbox | ✅ Complete | 39 notifications in production |
| Booking cancellation | ⚠️ Partial | Cancel button works; Stripe refund is TODO |
| Re-book shortcut | ✅ Complete | `MyBookings.tsx` |
| Post-move review | ⚠️ Partial | Review page exists; no in-app trigger after completion |
| Support tickets | ✅ Complete | Customer + staff reply flow |
| First move discount display | ✅ Complete | `FirstMovePromo.tsx` |
| Customer profile | ✅ Complete | Edit name, phone, avatar |
| Saved addresses | ❌ Missing | — |
| Referral program | ❌ Missing | — |
| Invoice PDF download | ❌ Missing | — |

#### Mover Flow
| Feature | Status | Notes |
|---|---|---|
| Mover signup + role | ✅ Complete | |
| Pilot / Early Access program | ✅ Complete | Admin approval gated |
| Mover onboarding wizard | ✅ Complete | `MoverOnboardingWizard.tsx` |
| Document verification | ✅ Complete | 7 doc types; admin review |
| Early Access terms acceptance | ✅ Complete | Legal consent with IP + user agent |
| Availability toggle | ✅ Complete | Online/offline |
| GPS location sharing | ✅ Complete | Sent to server on acceptance |
| WebSocket job notifications | ✅ Complete | Real-time push + sound + banner |
| Email job alerts | ✅ Complete | When RESEND_API_KEY set |
| SMS job alerts | ✅ Complete | Via Telnyx |
| Job acceptance / decline | ✅ Complete | 10-minute expiry |
| Job status progression | ✅ Complete | 8-stage status machine |
| Mover earnings dashboard | ✅ Complete | Per-booking breakdown |
| Stripe Connect payout | ✅ Complete | Express accounts |
| Profile + vehicle setup | ✅ Complete | |
| Welcome tutorial | ✅ Complete | `MoverWelcomeTutorial.tsx` |
| Mover availability calendar | ❌ Missing | Customers can't see mover schedules |
| Earnings PDF (for taxes) | ❌ Missing | — |
| Job acceptance UX overhaul | ⚠️ Partial | No full-screen overlay/countdown UI |

#### Admin Flow
| Feature | Status | Notes |
|---|---|---|
| User management | ✅ Complete | Lock, verify, edit roles |
| Mover management + pilot approval | ✅ Complete | |
| Bookings management | ✅ Complete | Assign movers, force-status |
| Revenue dashboard | ✅ Complete | Platform fee tracking |
| Payout management | ✅ Complete | Stripe Connect transfers |
| Email campaign center | ✅ Complete | Bulk + targeted campaigns |
| Support ticket dashboard | ✅ Complete | AI triage (when key set) |
| Verification dashboard | ✅ Complete | Document review queue |
| Operations dashboard | ✅ Complete | Live activity view |
| Growth dashboard | ✅ Complete | Analytics, cohort data |
| Enterprise partner management | ✅ Complete | `VITE_ENABLE_ENTERPRISE=true` in prod |
| Admin job status dashboard | ❌ Missing | Cron job health invisible |
| Post-move feedback survey | ❌ Missing | NPS collection not built |
| Promo code analytics | ❌ Missing | |

#### Enterprise Partner Portal (OOMovers Pilot)
| Feature | Status | Notes |
|---|---|---|
| Partner onboarding (5-step) | ✅ Complete | |
| Coverage zone configuration | ✅ Complete | |
| Compliance document upload | ✅ Complete | |
| Booking acceptance/routing | ✅ Complete | Enterprise status machine (15 states) |
| Team member management | ✅ Complete | Driver + team assignments |
| Incident reporting | ✅ Complete | With AI insight |
| Proof of completion upload | ✅ Complete | |
| Partner audit log | ✅ Complete | |
| Admin ↔ Partner direct messages | ✅ Complete | |
| Partner earnings | ✅ Complete | Stripe Connect |
| Partner legal documents | ✅ Complete | |

---

### 2.2 UX Friction Points in the Booking Flow

| Step | Friction Point | Severity |
|---|---|---|
| **Step 1: Addresses** | Google Places address suggestions use the deprecated `PlacesService` — may degrade or break with no warning | Medium |
| **Step 1: Addresses** | No saved address shortcut — returning customers must re-type their home address every booking | High |
| **Step 2: AI Photo Analysis** | With OPENAI_API_KEY missing (current prod), the "Scan Items with AI" feature shows no result — customers see a spinner or empty state with no clear explanation | Critical |
| **Step 2: Load Size** | Load size selector uses furniture-volume terms (ft³) that most customers don't understand without the AI context | Medium |
| **Step 2: Pricing** | Price updates on each input change but there's no debounce — rapid price flickering while typing addresses | Low |
| **Step 3: Date / Mover** | No mover availability calendar — customers pick a date without knowing if their preferred mover is actually free that day | High |
| **Step 3: Mover selection** | Mover profile cards on Browse Movers show no top reviews inline — customers must click into profile to see social proof | Medium |
| **Payment** | No cancellation policy displayed before payment — customers don't know the 2-hour free cancellation window | High |
| **Post-booking** | Customer receives no real-time WebSocket push when status changes — dashboard must be manually refreshed or rely on slow polling | High |
| **Post-move** | No in-app review prompt after move completion — only email (which currently doesn't send in prod) | High |
| **Live tracking** | Chat with mover not accessible from tracking screen — requires navigating to a separate messages page mid-move | Medium |

---

### 2.3 Missing Features Based on Platform Purpose (Micro-Logistics)

1. **Mover availability calendar** — the most critical scheduling gap; customers book without knowing if their chosen mover is free
2. **Customer real-time WebSocket push** — currently customers poll; status updates have 5–30s latency
3. **Automated Stripe refunds on cancellation** — cancellation exists but refund is a TODO
4. **Saved addresses** — every competitor (Uber, Instacart) offers this; it significantly reduces rebooking friction
5. **Post-move NPS / feedback survey** — no closed-loop customer satisfaction measurement
6. **Referral / "Give $20 Get $20" program** — critical for organic supply/demand growth in a local market
7. **Mover specialization tags** — piano moving, fragile items, commercial, seniors; unlocks better matching
8. **Instant quote widget on landing page** — acquisition funnel currently requires signup before seeing a price
9. **Scheduled move reminders (48h + 2h)** — no pre-move notification to either party
10. **Mover earnings PDF** — movers have no tax documentation from the platform
11. **Customer invoice PDF** — no receipt for expense claims
12. **E2E automated test suite** — zero confidence when deploying changes to booking/payment flows
13. **CI/CD pipeline** — manual deploys with no automated type check or smoke test gate

---

## Part 3 — PRD Output

---

### 3.1 Product Vision Statement

> **LervIT is the Uber for micro-logistics in Canada — making it as easy to move a couch as it is to order a car. We connect Canadians who need to move anything from a single box to a full apartment with a vetted, GPS-tracked network of local movers, priced transparently, paid securely, and coordinated in real time.**

The platform serves two markets simultaneously: a consumer booking experience that rivals the simplicity of Uber or DoorDash, and an enterprise partner network (MoveDeck PaaS) that allows established moving companies to integrate LervIT's demand pipeline into their existing dispatch operations.

---

### 3.2 User Personas

#### Persona 1 — "The Apartment Renter" (Customer)
- **Name:** Maya, 28, Calgary
- **Context:** Moves 1–2 times per year (city renter). Doesn't own a truck. Can't get friends to help on a weekday.
- **Goal:** Book a reliable, fairly priced mover in under 5 minutes, pay on her phone, and track the job in real time.
- **Pain points:** Doesn't know how much movers should cost. Worried about no-shows. Doesn't want to share her full address with a stranger before booking. Wants to know exactly when the mover will arrive.
- **Key flows:** Browse movers → Book → Pay → Track → Review
- **Success metric:** Booking completed in under 7 minutes; mover arrives within 15 minutes of estimated time

#### Persona 2 — "The Weekend Side-Hustler" (Mover)
- **Name:** Devon, 32, Calgary
- **Context:** Has a pickup truck and wants to earn $800–1,400/month on weekends without managing their own marketing.
- **Goal:** Wake up, flip on "Available," and have jobs come to him. Accept or decline in under 30 seconds. Get paid automatically.
- **Pain points:** Unpredictable job timing. No clarity on earnings before accepting. Doesn't want to manage invoices or Interac transfers.
- **Key flows:** Toggle available → Receive job push → Accept/decline → Navigate to pickup → Update status → Get paid
- **Success metric:** Accept or decline a job in < 30 seconds; earnings hit bank within 2 business days

#### Persona 3 — "The Dispatch Manager" (Enterprise Partner)
- **Name:** Raj, 45, OOMovers (Calgary)
- **Context:** Runs a 12-truck moving company. Has existing crews but needs more demand on weekdays when calendars are thin.
- **Goal:** Receive overflow bookings from LervIT, assign to a driver, track the job, and get paid monthly via Stripe.
- **Pain points:** LervIT jobs need to fit into his existing dispatch workflow. Needs proof of delivery for insurance. Needs audit logs if a customer disputes a job.
- **Key flows:** Partner portal → Accept routed booking → Assign driver → Update status → Upload proof → Receive payout
- **Success metric:** Booking acceptance to driver assignment < 5 minutes; zero disputed payouts

---

### 3.3 Feature Prioritization

#### P0 — Pre-Beta Blockers (must be done before any paying beta user)

| # | Feature | Effort | Type |
|---|---|---|---|
| P0-1 | Set `RESEND_API_KEY` in production | XS | Fix |
| P0-2 | Set `OPENAI_API_KEY` in production | XS | Fix |
| P0-3 | Deploy `promo_code_uses` schema to production | XS | Fix |
| P0-4 | Migrate password hashing from SHA-256 to bcrypt | S | Security |
| P0-5 | Add `requireAdmin` auth guard to `/api/downloads/*` | XS | Security |
| P0-6 | Remove admin credentials from `TESTING_GUIDE.md`; rotate admin password | XS | Security |
| P0-7 | Implement Stripe refund on booking cancellation (`charge.refunded` handler) | S | Fix |
| P0-8 | Send push/email to mover on verification approval/rejection (2 TODOs) | XS | Fix |
| P0-9 | Cancellation policy UI displayed before payment (free within 2h) | S | UX |
| P0-10 | End-to-end Playwright smoke test: signup → book → pay → complete | M | Quality |
| P0-11 | GitHub Actions CI: TypeScript check + smoke test on every PR | S | Quality |

#### P1 — Q1 Core Product (closed beta readiness)

| # | Feature | Effort | Type |
|---|---|---|---|
| P1-1 | Mover job acceptance: full-screen overlay with countdown, earnings, one-tap | M | UX |
| P1-2 | Customer real-time WebSocket push for booking status updates | L | Feature |
| P1-3 | Post-move in-app review modal (triggered after `completed` status) | S | Feature |
| P1-4 | Background job scheduler reliability fix (separate worker process or pg-boss) | L | Infrastructure |
| P1-5 | Admin: background job health dashboard (last run, success/fail, next scheduled) | S | Admin |
| P1-6 | N+1 fix in dispatch: JOIN movers + users in single query | S | Performance |
| P1-7 | Admin dashboard pagination (limit/offset on all list endpoints) | M | Performance |
| P1-8 | Upgrade `sameSite: 'lax'` → `'strict'`; add 8h absolute session expiry | XS | Security |
| P1-9 | Input sanitization for user-generated text (messages, reviews, ticket replies) | S | Security |
| P1-10 | Restrict `/uploads` CORS from `*` to platform origins | XS | Security |
| P1-11 | My Bookings: visual status timeline per booking | S | UX |
| P1-12 | Chat surfaced on live trip tracking screen | S | UX |

#### P2 — Q2 Growth Features (open beta / first 50 paying customers)

| # | Feature | Effort | Type |
|---|---|---|---|
| P2-1 | Saved addresses (up to 5 per customer) | M | Feature |
| P2-2 | Mover availability calendar (set available days/hours; customer sees only available movers) | L | Feature |
| P2-3 | Post-move NPS / feedback survey (3-question; stored in DB; admin view) | M | Feature |
| P2-4 | Instant quote widget on landing page (no signup required) | M | Acquisition |
| P2-5 | Customer referral program ("Give $20, Get $20") | M | Growth |
| P2-6 | Mover specialization tags (piano, fragile, seniors, commercial, short notice) | S | Feature |
| P2-7 | Mover earnings statement PDF (monthly; tax documentation) | M | Feature |
| P2-8 | Customer invoice PDF (per completed move; for expense claims) | M | Feature |
| P2-9 | Top 3 reviews surfaced inline on Browse Movers cards | S | UX |
| P2-10 | Google Places API migration to new Places API (away from deprecated PlacesService) | M | Technical |
| P2-11 | Object Storage CDN integration (images behind Cloudflare) | M | Performance |
| P2-12 | Database backup restoration drill (monthly; staging environment) | S | Infrastructure |
| P2-13 | Scheduled move reminders: 48h + 2h before (customer SMS/push + mover reminder) | S | Feature |
| P2-14 | Mover premium subscription tier ($29/mo; lower fee, priority matching) | L | Revenue |
| P2-15 | Uptime monitoring + public status page | S | Infrastructure |

#### P3 — Q3/Q4 Scale & Expansion

| # | Feature | Effort | Notes |
|---|---|---|---|
| P3-1 | Migrate `server/routes.ts` from monolith to modular router structure | XL | 10,965-line file → domain-scoped files |
| P3-2 | Replace `drizzle-kit push` with versioned migration workflow | M | Production schema safety |
| P3-3 | Redis caching layer (session store, hot mover list, vision cache) | L | Scale trigger: 1,000 daily bookings |
| P3-4 | Load testing (k6 or Artillery; 50/200/500 concurrent users) | M | Before open beta |
| P3-5 | Move review: mover can reply; admin can flag; "Verified Mover" badge tightened | M | Trust signal |
| P3-6 | PaaS multi-tenancy (white-label MoveDeck for enterprise clients) | XL | Q3 revenue diversification |
| P3-7 | City 2 expansion (Edmonton) | XL | Q4; supply-side ops required |
| P3-8 | Native push notifications (APNs + FCM via Capacitor) | L | Replace Telnyx SMS for app users |
| P3-9 | Vehicle class D deprecation + migration | S | Clean up legacy pricing path |
| P3-10 | AI learning feedback loop activation (bookingMetrics + itemFeedback tables live) | L | Requires sufficient data volume (~500 completed moves) |

---

### 3.4 Recommended Tech Improvements

#### Immediate (0–4 weeks)
1. **bcrypt password hashing** — replace `server/auth.ts` SHA-256 with `bcryptjs`. Add a "re-hash on next login" path so existing passwords migrate transparently.
2. **Route decomposition** — extract `server/routes.ts` into at minimum: `auth.routes.ts`, `booking.routes.ts`, `payment.routes.ts`, `admin.routes.ts`, `partner.routes.ts`. One file per domain.
3. **Versioned migrations** — stop using `drizzle-kit push` on production. Switch to `drizzle-kit generate` + `drizzle-kit migrate` with the migration files committed to git.
4. **Session hardening** — `sameSite: 'strict'`, absolute expiry 8h, remove default fallback secret.

#### Short-term (1–2 months)
5. **Background jobs decoupled from HTTP process** — use `pg-boss` (PostgreSQL-backed job queue) or a separate worker `tsx` process. Cron jobs sharing the event loop with Express is the root cause of `missed execution` warnings.
6. **Customer WebSocket** — extend `server/websocket.ts` to support authenticated customer connections and push status change events. This eliminates the need for frontend polling on the tracking and dashboard screens.
7. **N+1 query fixes** — in `dispatch.ts`, `storage.ts`, and booking list endpoints, replace per-record DB calls with single JOIN queries.
8. **Admin pagination** — add `limit`/`offset` parameters to all admin list endpoints; wire up frontend pagination controls.

#### Medium-term (2–4 months)
9. **CDN for object storage** — route Replit Object Storage through Cloudflare CDN. Each user-uploaded image currently hits the Express server; at 100+ concurrent users this degrades response times across all API endpoints.
10. **Redis cache** — session store (replace pg-session for lower latency), mover availability hot-list (eliminate full table scan on every dispatch), vision result cache (survive restarts).
11. **Google Places migration** — move from deprecated `PlacesService` to the new `google.maps.places.Place` API before Google enforces the deprecation.
12. **Typed API layer** — eliminate `as any` casts with explicit Zod-to-Drizzle type mappers; enable `strict: true` in tsconfig gradually by domain.

---

### 3.5 Sprint-Ready Task List (Ordered by Impact)

Each item includes a rough effort estimate and the single most important file to change.

---

**Sprint 1: Unblock Production (Week 1–2)**

| Priority | Task | File | Effort |
|---|---|---|---|
| 🔴 | Set `RESEND_API_KEY` in prod env | `.env` (Replit Secrets) | 1h |
| 🔴 | Set `OPENAI_API_KEY` in prod env | `.env` (Replit Secrets) | 1h |
| 🔴 | Push `promo_code_uses` schema to production | `migrations/` + deploy | 2h |
| 🔴 | Remove admin credentials from TESTING_GUIDE.md; rotate password | `TESTING_GUIDE.md` | 1h |
| 🔴 | Add `requireAdmin` guard to `/api/downloads/*` endpoints | `server/routes.ts:227-251` | 30m |
| 🔴 | Implement Stripe refund on `charge.refunded` webhook | `server/routes.ts:5697` | 3h |
| 🔴 | Add mover notifications for verification approval/rejection | `server/routes.ts:2371,2392` | 2h |

---

**Sprint 2: Security Hardening (Week 3–4)**

| Priority | Task | File | Effort |
|---|---|---|---|
| 🟡 | Migrate password hashing to bcrypt (+ re-hash on next login) | `server/auth.ts` | 4h |
| 🟡 | Session hardening: `sameSite: 'strict'`, 8h absolute expiry, no fallback secret | `server/index.ts` | 2h |
| 🟡 | Add input sanitization for user text fields (messages, reviews, tickets) | `server/routes.ts` | 3h |
| 🟡 | Restrict `/uploads` CORS to platform origins only | `server/routes.ts:283` | 30m |
| 🟡 | Reduce JSON body limit from 50MB to 10MB for non-upload routes | `server/index.ts:114` | 1h |

---

**Sprint 3: Core UX Fixes (Week 5–6)**

| Priority | Task | File | Effort |
|---|---|---|---|
| 🟡 | Cancellation policy displayed before payment (free 2h window) | `client/src/pages/Payment.tsx` | 3h |
| 🟡 | Post-move in-app review modal (fires on `completed` status change) | `client/src/pages/CustomerDashboard.tsx` | 4h |
| 🟡 | Full-screen job acceptance overlay for movers (countdown, earnings, 1-tap) | `client/src/pages/MoverDashboard.tsx` | 6h |
| 🟡 | Surface chat on live tracking screen | `client/src/pages/TrackTrip.tsx` | 3h |
| 🟡 | Booking status timeline in My Bookings | `client/src/pages/MyBookings.tsx` | 4h |

---

**Sprint 4: Performance & Infrastructure (Week 7–8)**

| Priority | Task | File | Effort |
|---|---|---|---|
| 🟡 | Fix N+1 in `loadOperationalMovers` (JOIN users in single query) | `server/dispatch.ts:100-125` | 3h |
| 🟡 | Add pagination to admin list endpoints (bookings, users, movers, tickets) | `server/routes.ts` (admin section) | 6h |
| 🟡 | Move background jobs to separate worker process or pg-boss | `server/background-jobs.ts` | 8h |
| 🟡 | GitHub Actions CI: TypeScript + smoke test on every PR | `.github/workflows/ci.yml` | 4h |

---

**Sprint 5: Feature Expansion (Week 9–12)**

| Priority | Task | File | Effort |
|---|---|---|---|
| 🟠 | Saved addresses (schema + API + booking flow shortcut) | `shared/schema.ts` + `RequestMove.tsx` | 8h |
| 🟠 | Customer WebSocket push for booking status changes | `server/websocket.ts` + `client/src/contexts/AuthContext.tsx` | 10h |
| 🟠 | Post-move feedback survey (3 questions, NPS, DB storage, admin view) | `shared/schema.ts` + new `AdminFeedback.tsx` | 8h |
| 🟠 | Mover earnings statement PDF (monthly, downloadable from dashboard) | `client/src/pages/MoverDashboard.tsx` + PDFKit | 6h |
| 🟠 | Instant quote widget on landing page (no login required) | `client/src/pages/LandingPage.tsx` | 6h |
| 🟠 | Playwright E2E test suite (signup → book → pay → complete) | `tests/e2e/booking-flow.spec.ts` | 12h |

---

**Sprint 6: Scale Prep (Week 13–16)**

| Priority | Task | File | Effort |
|---|---|---|---|
| 🟠 | Mover availability calendar (schema + mover profile + booking filter) | `shared/schema.ts` + `MoverProfile.tsx` + `BrowseMovers.tsx` | 16h |
| 🟠 | Object Storage CDN (Cloudflare in front of Replit Object Storage) | `server/objectStorage.ts` | 6h |
| 🟠 | Google Places v2 migration (new `Place` API) | `client/src/lib/locationProvider.ts` | 6h |
| 🟠 | Route decomposition: split `routes.ts` into domain files | `server/routes/` (new directory) | 20h |
| 🟠 | Referral program: unique link + $20 credit on first completed booking | `shared/schema.ts` + `server/routes.ts` + `CustomerProfile.tsx` | 10h |
| 🟠 | Load testing with k6: 50/200/500 concurrent users | `tests/load/` | 4h |

---

## Appendix — Key Numbers

| Metric | Value |
|---|---|
| `server/routes.ts` line count | 10,965 |
| `as any` casts in `server/routes.ts` | 102 |
| Database tables in schema | 27 |
| Background cron jobs | 9 |
| Unique frontend pages/routes | 48 |
| Migration files | 1 |
| Unit / E2E test files | 2 (load-test.js, smoke-tests.ts; not automated in CI) |
| Production users | 71 |
| Production completed moves | 16 |
| Known P0 production bugs | 6 |

---

*This document should be treated as a living artifact. Revisit after Sprint 2 to reprioritize based on beta user feedback.*
