# LervIT — 12-Month Product Development Roadmap
## May 2026 → April 2027

**Version:** 3.0 (Production-Aligned)
**Prepared By:** LervIT Technologies Corporation
**Date:** May 2026
**Classification:** Internal — Product & Engineering

---

## Production Baseline

Live as of May 13, 2026. Data queried directly from the production database.

| Metric | Value |
|---|---|
| Total users | 71 (35 customers, 35 movers) |
| Total bookings | 37 |
| Completed moves | 16 |
| Cancelled bookings | 10 |
| Analytics events recorded | 913 |
| Support tickets | 8 |
| Enterprise partners | 1 (OOMovers pilot) |
| Last booking date | May 5, 2026 |
| Production URL | https://app.lervit.com |

---

## Audit Notes

Every item was checked against both the live codebase **and** the production environment. Three categories are used:

- **Confirmed working in production** — feature exists in code and all required API keys/config are set in production
- **In code, broken in production** — feature exists and is deployed, but a missing secret or schema gap means it silently fails
- **Confirmed configured** — infrastructure/tooling that is already set up (keys present, services connected)

### Confirmed working in production

| Feature | Evidence |
|---|---|
| Progressive Web App (PWA) | `client/public/manifest.json`, `sw.js` |
| Rate limiting (auth, API, webhook) | `server/middleware/security.ts` |
| Re-book shortcut | `MyBookings.tsx` L930, `CustomerDashboard.tsx` L805 |
| My Bookings / Move History page | Route `/my-bookings` in `App.tsx` |
| Customer → Mover message button | `CustomerDashboard.tsx` L684 |
| Booking cancellation button | `MyBookings.tsx` — `cancelBookingMutation` |
| In-app notification system | `in_app_notifications` table exists in prod; 39 notifications present |
| Analytics event tracking | `analytics_events` table — 913 events in prod; `POST /api/analytics/event` returning 200 in prod logs |
| Mover earnings dashboard | `mover_earnings`, `mover_payouts` tables exist in prod |
| Stripe Connect + payouts | `STRIPE_SECRET_KEY` + `VITE_STRIPE_PUBLIC_KEY` set; `mover_stripe_accounts` table in prod |
| SMS notifications (Telnyx) | `TELNYX_API_KEY`, `TELNYX_PHONE_NUMBER`, `TELNYX_MESSAGING_PROFILE_ID` all set |
| Real-time WebSocket (movers) | WebSocket server initialised on every prod startup (confirmed in prod logs) |
| Google Maps (geocoding + distance) | `VITE_GOOGLE_MAPS_API_KEY` set; used by both frontend and server |
| OTP signup, mover verification, driver documents | `phone_verification_tokens`, `verification_items` tables in prod |
| Abandoned booking tracking | `abandoned_bookings` table in prod |
| AI Auto-Quote Predictor | Pure math — no API key required; works in production as-is |
| Growth Dashboard + Operations Dashboard | `GrowthDashboard.tsx`, `OperationsDashboard.tsx` |
| Full partner portal (v1) | All partner tables (`partners`, `partner_users`, `partner_invites`, etc.) exist in prod; 1 partner record present |
| Object storage (image uploads) | `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` all set |
| Gzip/Brotli compression, lazy loading | `server/vite.ts`, `client/src/App.tsx` |
| Facebook Pixel + SEO structured data | `client/index.html` |
| Session security secret | `SESSION_SECRET` confirmed set in production |
| Sentry error monitoring | `SENTRY_DSN` and `VITE_SENTRY_DSN` both set in production — **removed from Q1 sprint** |
| Enterprise portal enabled | `VITE_ENABLE_ENTERPRISE=true` set in production env |

### In code, broken in production

These features are deployed and appear to work but will silently fail on every trigger because a required secret is not configured.

| Feature | Root cause | Impact |
|---|---|---|
| **All email notifications** | `RESEND_API_KEY` not set — `resend` client initialises to `null` at startup | Abandoned booking reminders, Stripe Connect onboarding reminders (1st/2nd/3rd), move confirmation emails, partner rejection emails, post-move feedback surveys — all silently drop |
| **Vision Engine (AI Item Detection)** | `OPENAI_API_KEY` not set — `ai-identifier.ts` line 8 reads it at module load | Photo analysis on booking Step 2 returns no AI result; load size / vehicle recommendation falls back to manual input only |
| **AI Support Copilot** | `OPENAI_API_KEY` not set — `ai-support-analyzer.ts` line 99 guards with early return | Admin support ticket analysis produces no summaries, classifications, or suggested responses |

### Schema gaps in production

| Feature | Gap | Impact |
|---|---|---|
| Promo code system (LERVIT20) | `promo_code_uses` table does not exist in production | Promo usage tracking will throw a runtime error if triggered; main promo fields on `bookings` table may still exist |

### Production infrastructure concerns

| Issue | Observation | Frequency |
|---|---|---|
| node-cron missed executions | `[NODE-CRON] [WARN] missed execution` — appears in every production uptime window | Every ~30 minutes |
| Neon DB FATAL crash | One `severity: 'FATAL'` WebSocket error from Neon driver causing full server restart | Observed once in current log window |
| Twilio credentials set but unused | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` are all set; the app uses Telnyx exclusively | Unused secrets — no functional impact, but confusing |

---

## Strategic Themes by Quarter

| Quarter | Theme | Goal |
|---|---|---|
| Q1 (May–Jul) | **Stabilize & Validate** | Close the production gaps above; closed beta with real users |
| Q2 (Aug–Oct) | **Grow & Convert** | Open beta; first 50 paying customers |
| Q3 (Nov–Jan) | **Scale & Diversify** | PaaS multi-tenancy; API; Calgary dominance |
| Q4 (Feb–Apr) | **Expand & Compound** | City 2 expansion; enterprise; native mobile app |

---

## Q1: Stabilize & Validate
### May – July 2026

---

### Production Gap Fixes (P0 — pre-beta blockers)

These are not new features. They are production defects that must be resolved before any beta launch.

#### P0 — Email Notifications: Set RESEND_API_KEY `XS` `Fix`
Every email the platform sends — abandoned booking reminders, Stripe Connect onboarding nudges, move confirmations, partner rejection notices — is currently silently dropped in production. All the code is working; only the API key is missing.
- Action: Add `RESEND_API_KEY` to production secrets; verify at least one email delivers end-to-end
- Done when: An abandoned booking triggers a recovery email that actually arrives in the inbox

#### P0 — AI Features: Set OPENAI_API_KEY `XS` `Fix`
The Vision Engine and AI Support Copilot are deployed but return nothing because `OPENAI_API_KEY` is not set. The Auto-Quote Predictor is unaffected (pure math).
- Action: Add `OPENAI_API_KEY` to production secrets; test a photo upload and a support ticket analysis
- Done when: A booking photo upload returns a load size recommendation; support ticket analysis produces a summary

#### P0 — Deploy Missing Schema: `promo_code_uses` `XS` `Fix`
The `promo_code_uses` table does not exist in the production database. A customer attempting to use the LERVIT20 promo code will hit a runtime error.
- Action: Trigger a production deploy to sync the schema (Replit Publish flow diffs and applies)
- Done when: `SELECT COUNT(*) FROM promo_code_uses` returns 0 in production (table exists, empty)

#### P1 — Background Job Scheduler Reliability `M` `Fix`
node-cron is logging `missed execution` in every production uptime window, roughly every 30 minutes. This means abandoned booking reminders, Stripe onboarding nudges, and booking expiry jobs are all running late or not at all.
- Root cause: node-cron and the Express server share the same single-threaded process. Heavy request handling blocks the event loop long enough to cause cron to miss its slot.
- Options: (a) move background jobs to a separate worker process; (b) replace node-cron with a DB-backed job queue (pg-boss or similar) that survives restarts; (c) use Replit's scheduled tasks if available
- Files: `server/background-jobs.ts`, `server/index.ts`
- Done when: Zero missed execution warnings in a 24-hour production window

---

### Core Product

#### P0 — Closed Beta Invite Flow `M` `New`
A landing page at `/beta` allowing hand-picked customers to sign up with an invite code. Tracks referral source. Auto-sends a "Welcome to Beta" email with onboarding tips. **Depends on RESEND_API_KEY fix above.**
- Files: `client/src/pages/BetaSignup.tsx` (new), `server/routes.ts`
- Done when: 10 beta customers can sign up, book, and pay without needing support

#### P0 — End-to-End Booking Smoke Test Suite `M` `New`
Playwright e2e tests covering the full customer journey: signup → find mover → book → pay → track → complete. Runs on every deployment.
- Files: `tests/e2e/booking-flow.spec.ts` (new)
- Done when: Full booking flow passes in CI with zero flaky failures

#### P0 — Mover Job Acceptance UX Overhaul `M` `Partial`
The current job notification + acceptance flow is functional but lacks urgency. Add a full-screen job offer overlay with countdown timer, earnings estimate, distance, and one-tap accept/decline. Audio alert exists — tie it to this new UI.
- Files: `client/src/components/JobNotificationSound.tsx`, `client/src/pages/MoverDashboard.tsx`
- Done when: Movers can accept or decline a job in under 5 seconds from notification arrival

#### P0 — Booking Cancellation: Stripe Refund + Policy Display `S` `Partial`
The cancel button exists in `MyBookings.tsx` but the Stripe refund is marked TODO and there is no policy display. What remains: trigger automated Stripe refund on cancellation, show the cancellation policy inline (free within 2h, 50% fee after), and notify both parties.
- Files: `server/routes.ts` (refund handler), `client/src/pages/MyBookings.tsx` (policy UI)

#### P1 — Post-Move Review Modal (In-App) `M` `New`
Email-based review prompt exists but no in-app trigger. Add a modal that appears on the customer dashboard immediately after a move is marked completed. Also expose mover's top 3 reviews directly on the Find Movers card (not just inside the mover profile).
- Files: `client/src/pages/CustomerDashboard.tsx`, `client/src/pages/BrowseMovers.tsx`

#### P1 — My Bookings: Invoice Download + Status Timeline `S` `Partial`
The `/my-bookings` page exists. What's missing: a downloadable PDF receipt per completed booking, and a visual status timeline showing the progression of each move.
- Files: `client/src/pages/MyBookings.tsx`

#### P1 — Real-Time Status Push to Customers `L` `New`
The WebSocket system currently serves movers only. Extend it to push status updates to customers when their booking status changes — so they don't have to poll or refresh.
- Files: `server/index.ts`, `client/src/contexts/AuthContext.tsx`

---

### Platform & Infrastructure

#### P0 — Automated CI/CD Pipeline `M` `New`
GitHub Actions: TypeScript check + ESLint on every PR; auto-deploy to staging on merge to main; smoke tests post-deploy; alert on failure.
- Done when: No code reaches production without passing type check and smoke tests

#### P0 — Database Backup Restoration Drill `S` `New`
Neon provides automatic backups but they have never been tested. A FATAL crash was observed in production logs causing a full server restart — recovery from data loss has not been validated. Run a monthly restoration drill to a staging database and document the recovery procedure.

#### P1 — Session Security Hardening `S` `Partial`
`SESSION_SECRET` is confirmed set in production. `sameSite: 'lax'` is set. What remains: upgrade to `sameSite: 'strict'`, ensure `secure: true` is enforced in production (not just via proxy trust), and add an absolute session expiry of 8 hours regardless of activity.
- Files: `server/index.ts` (session config)

#### P2 — Uptime Monitoring & Status Page `S` `New`
BetterUptime or Instatus with synthetic checks on 5 key endpoints. Public status page at `status.lervit.com`. Automatic incident creation on failure.

---

### Business Enablement

#### P0 — Admin: Live Beta Health Dashboard `S` `New`
Extend the Growth Dashboard with a "Beta Health" section: daily active customers, daily active movers, booking completion rate, average time-to-accept, and any beta user stuck for more than 24 hours.
- Files: `client/src/pages/GrowthDashboard.tsx`

#### P0 — Post-Move Feedback Survey `M` `New`
After every completed move, send a 3-question survey (NPS + 2 open-ended) via email. Store responses in a new `feedback` table. Admin views all responses. **Depends on RESEND_API_KEY fix above.**
- Files: `shared/schema.ts`, `server/routes.ts`, new `client/src/pages/admin/AdminFeedback.tsx`

#### P1 — Mover Earnings Statement (PDF Download) `M` `New`
Movers need documentation for tax purposes. Generate a monthly earnings PDF on demand from the mover dashboard: itemised job list with dates, amounts, platform fees, and net pay.
- Files: `client/src/pages/MoverDashboard.tsx`

#### P1 — Promo Code Analytics Card `S` `New`
No admin visibility into promo performance yet. Add a card to the Growth Dashboard: total LERVIT20 uses, total discount absorbed, average order value with/without promo, conversion lift. **Note: `promo_code_uses` schema fix is a prerequisite.**
- Files: `client/src/pages/GrowthDashboard.tsx`

---

## Q2: Grow & Convert
### August – October 2026

---

### Core Product

#### P0 — Open Beta: Remove Invite Gate `M` `New`
Remove the invite gate from customer signup. Add a tasteful "Beta" badge in the UI. Wire onboarding analytics to track where new users drop off in their first session.

#### P0 — Saved Addresses `M` `New`
Customers can save up to 5 addresses (home, work, storage unit, etc.). A saved address dropdown replaces manual entry in the booking flow.
- Files: `client/src/pages/RequestMove.tsx`, `shared/schema.ts`
- Note: Re-book shortcut already exists in `MyBookings.tsx` — no work needed there

#### P1 — Mover Availability Calendar `L` `New`
Movers set their available days and hours for the coming 4 weeks. Customers see only movers marked available on their preferred date. Reduces "no movers available" situations and no-shows.
- Files: `shared/schema.ts` (new `moverAvailability` table), `server/routes.ts`, `client/src/pages/MoverProfile.tsx`

#### P1 — Chat on Live Tracking Screen `S` `Partial`
The message button exists on the customer dashboard. What's missing: surface the chat thread directly on the live tracking screen so customers can contact their mover mid-move without leaving the tracking view.
- Files: `client/src/pages/CustomerDashboard.tsx` (live tracking section)

#### P1 — Customer Referral Program `M` `New`
"Give $20, Get $20" — unique referral link per customer. When a referred customer completes their first move, both parties receive a $20 credit. Built on the existing promo code system.
- Files: `shared/schema.ts`, `server/routes.ts`, `client/src/pages/CustomerProfile.tsx`

#### P1 — Instant Quote Widget on Landing Page `M` `New`
The AI Auto-Quote exists in the booking flow but not on the homepage. Add a lightweight calculator widget on the landing page: pickup → dropoff → load size → instant estimate → CTA into booking.
- Files: `client/src/pages/LandingPage.tsx`

#### P2 — Mover Specializations & Tags `S` `New`
Movers tag themselves: piano moving, fragile items, commercial, senior moves, short notice. Customers filter by tag on Find Movers.
- Files: `shared/schema.ts`, `client/src/pages/FindMovers.tsx`

---

### Platform & Infrastructure

#### P0 — Load Testing Before Open Beta `M` `New`
Simulate 50, 200, and 500 concurrent users using k6 or Artillery. Identify and resolve bottlenecks before the public launch.

#### P0 — Database Query Optimisation Pass `M` `Partial`
Full audit of queries in `server/routes.ts` and `server/partnerRoutes.ts`. Add missing indexes on `bookings.status`, `bookings.customerId`, `bookings.moverId`. Eliminate N+1 patterns.

#### P1 — Object Storage CDN for Images `M` `New`
Move images served directly from Replit Object Storage behind Cloudflare CDN. Reduces application server load and improves image load times for Calgary customers.

#### P2 — Background Job Admin Dashboard `S` `New`
Hidden admin page showing all cron job statuses: last run time, success/failure, next scheduled run. Currently failures are invisible. **Higher priority if background job reliability fix in Q1 is delayed.**
- Files: new `client/src/pages/admin/AdminJobs.tsx`

---

### Business Enablement

#### P0 — Mover Onboarding Funnel Analytics `M` `New`
Track every step from "I want to become a mover" to "first job completed." Identify the highest drop-off step and fix it. Directly drives supply-side growth.
- Files: existing `analytics_events` table, `client/src/hooks/use-analytics.ts`

#### P0 — Mover Premium Subscription Tier `L` `New`
Free tier: 3 jobs/month, 20% platform fee. Premium ($29/mo): unlimited jobs, 15% fee, priority matching, verified badge. Stripe subscription per mover.
- Files: `shared/schema.ts`, `server/routes.ts`, `client/src/pages/MoverDashboard.tsx`

#### P1 — Automated Mover Recruitment Emails `M` `New`
When a customer books in a zone with fewer than 3 available movers, trigger automated outreach to unverified movers in that area. **Depends on RESEND_API_KEY being set.**
- Files: `server/routes.ts`, `server/notificationService.ts`

#### P1 — Admin Revenue Dashboard V2 `M` `New`
Extend Growth Dashboard with: MRR trend, cohort analysis (do promo customers return?), average revenue per booking over time, projected vs actual revenue.
- Files: `client/src/pages/GrowthDashboard.tsx`, `server/routes.ts`

#### P2 — Customer Invoice PDF `M` `New`
After a completed move, customers download a PDF receipt: booking ID, date, pickup/dropoff, mover name, itemised price, tax, and payment confirmation. Useful for rental expense claims.
- Files: `server/routes.ts`, `client/src/pages/MyBookings.tsx`

---

## Q3: Scale & Diversify
### November 2026 – January 2027

---

### Core Product

#### P0 — Review System: Mover Reply + Top Reviews on Find Movers `L` `Partial`
Email-based review prompt exists. Remaining: mover can reply to reviews; top 3 reviews surface directly on the Find Movers card (not just inside profile); admin can flag disputed reviews; "Verified Mover" badge tightened to require 5+ reviews at ≥4.5 average.
- Files: `client/src/pages/BrowseMovers.tsx`, `client/src/pages/MoverProfile.tsx`, `server/routes.ts`

#### P0 — Scheduled Move Reminders (48h + 2h) `S` `New`
48h and 2h before a scheduled move: customer gets SMS + push notification with mover name, ETA, and a Track deep link. Mover gets a reminder with pickup address and customer name. Note: existing background jobs handle Stripe onboarding reminders but not move reminders.
- Files: `server/background-jobs.ts`

#### P1 — Customer Support Live Chat `M` `New`
Replace ticket-only support with a live chat widget (Crisp or Intercom) during business hours. After hours routes to ticket. Support agents see the customer's booking context inline.
- Files: `client/src/pages/Support.tsx`

#### P1 — Multi-Stop Moves `L` `New`
Allow up to 3 stops between pickup and dropoff. Price increases per extra stop. New field on booking schema.
- Files: `shared/schema.ts`, `client/src/pages/RequestMove.tsx`, pricing model

#### P2 — Move Templates (Repeat Customers) `M` `New`
Save a "move template": saved pickup/dropoff pair, load size, preferred mover. One-tap re-book from the template. Targeted at students and businesses doing regular moves.

#### P2 — Mover Streak & Achievement Badges `M` `New`
Milestones: first move, 10 moves, 50 moves, 100 moves, perfect month. "Hot streak" indicator for 3+ jobs this week. Shown on public mover profile.

---

### Platform & Infrastructure

#### P0 — Multi-Tenancy Foundation (PaaS Prerequisite) `XL` `New`
Add `tenant_id` to all partner tables. Create `tenants` table. Inject tenant context into all partner route queries. Critical prerequisite for MoveDeck PaaS.
- Files: `shared/schema.ts`, `server/partnerRoutes.ts`, Drizzle migration
- Done when: Two isolated test tenants exist and cannot read each other's data

#### P0 — Test Coverage: Critical Paths `L` `New`
Unit tests for: pricing model, vehicle matching algorithm, promo code validation, Stripe webhook handler, notification dispatch.
- Target: 80% coverage on `server/pricing.ts`, `shared/matching.ts`, Stripe webhook handler

#### P1 — Redis Session & Cache Layer `L` `New`
Replace `connect-pg-simple` sessions with Redis. Add Redis caching for mover list queries (60s TTL), Google Maps geocoding results (24h TTL), AI quote results (30m TTL).

#### P1 — Structured Logging Dashboard `M` `New`
Pipe Pino JSON logs (currently writing structured JSON in production) to Logtail or Papertrail. Create saved searches for: payment failures, booking errors, mover WebSocket disconnects, AI quota errors. Note: Sentry is already configured for exceptions — this is for operational log search.

#### P2 — Database Read Replica `M` `New`
Provision a Neon read replica. Route analytics and reporting queries to it, keeping write traffic on the primary.

---

### Business Enablement

#### P0 — MoveDeck: Self-Serve Signup & Billing `XL` `New`
Company creates account → selects plan → Stripe subscription created → isolated portal instance provisioned in under 10 seconds.
- Files: `client/src/pages/partner/PartnerSignup.tsx` (new), `server/partnerRoutes.ts`

#### P0 — MoveDeck: Public Landing Page `L` `New`
Marketing page with value proposition, plan pricing table, feature comparison, and "Start free trial" CTA.
- Files: `client/src/pages/MoveDeckLanding.tsx` (new)

#### P1 — Partner Portal: Plan-Gated Paywalls `M` `New`
Gate Growth-tier features (Earnings, Stripe payouts, Compliance Manager) behind an "Upgrade to unlock" modal with plan comparison, once multi-tenancy and billing are in place.
- Files: `client/src/pages/partner/PartnerEarnings.tsx`, `PartnerCompliance.tsx`

#### P1 — Admin: Tenant Management Dashboard `M` `New`
LervIT admin view of all MoveDeck tenants: company name, plan, MRR, trial status, bookings this month, last login.
- Files: new `client/src/pages/admin/AdminTenants.tsx`

#### P2 — MoveDeck Affiliate & Referral Tracking `M` `New`
Partners who refer companies earn 15% recurring commission. UTM-tracked signup links, admin view of referred tenants, automated commission calculation.

---

## Q4: Expand & Compound
### February – April 2027

---

### Core Product

#### P0 — City 2 Expansion: Edmonton `L` `New`
The proximity algorithm, mover onboarding, and dispatch system all work for any city. Launch Edmonton with 10 verified movers minimum before accepting bookings. Requires: pricing calibration, local coverage zone setup.

#### P0 — Native Mover Driver App (iOS + Android) `XL` `New`
React Native or Capacitor app giving movers: push notifications for job offers (no SMS dependency), background GPS tracking, offline job history. The biggest driver of mover supply retention.
- See: `capacitor-native-upgrade` skill for the Capacitor approach

#### P1 — Dynamic Surge Pricing `L` `New`
When demand exceeds supply (fewer than 3 available movers in a zone), apply a 1.1–1.4x surge multiplier. Show a "High demand" notice to customers. Transparent surge indicator on mover cards.
- Files: `server/dispatch.ts`, `client/src/pages/FindMovers.tsx`

#### P1 — B2B / Commercial Account Type `L` `New`
Businesses get: monthly invoicing, volume discount tiers (10+ moves/mo = 10% off), multi-user access so multiple employees can book under one account.
- Files: `shared/schema.ts`, `server/routes.ts`, `client/src/pages/RequestMove.tsx`

#### P2 — Move Insurance Add-On `L` `New`
Optional per-move coverage ($2.99–9.99 based on declared value). Checkbox in booking flow. Certificate emailed on confirmation. Note: the AI identifier already calculates an internal `insuranceLevel` classification — this would expose it as a customer-facing product.

#### P2 — Mover Crew System `M` `New`
Movers form a crew (2–4 people). Lead mover accepts jobs and splits earnings with crew members. Unlocks larger apartment and commercial move categories.
- Files: `shared/schema.ts`, `server/routes.ts`

---

### Platform & Infrastructure

#### P0 — Multi-Region Deployment: Canada + US East `L` `New`
Cloudflare geo-routing sends Canadian users to `ca-central-1` and US users to `us-east-1`. Required for PIPEDA compliance as Canadian data stays in Canada.

#### P0 — SOC 2 Type II Audit Preparation `XL` `New`
Required for enterprise sales to regulated companies. Engage auditor in Q4 — full certification targeted for Q2 of Year 2. Covers: access controls, availability, confidentiality, change management, incident response.

#### P1 — Full REST API v1 (MoveDeck Enterprise) `XL` `New`
Public REST API with API key auth, rate limiting, Swagger documentation. Enables enterprise customers to integrate MoveDeck with their TMS, ERP, or custom tools.

#### P1 — Webhook Event System `L` `New`
Enterprise customers register webhook endpoints. LervIT pushes `booking.*`, `incident.*`, `compliance.*` events in real time.
- Files: `shared/schema.ts` (new `webhooks` table), `server/partnerRoutes.ts`

#### P2 — Performance Budget Enforcement in CI `M` `New`
Lighthouse performance budget in CI: FCP < 1.5s, TBT < 200ms, CLS < 0.1. Fail build on regression.

---

### Business Enablement

#### P0 — First Enterprise MoveDeck Contract `XL` `Business`
Use MoveDeck to close the first enterprise deal at $799+/mo with a dedicated onboarding.
- Prerequisite: Multi-tenancy, billing, white-label branding, CSM

#### P0 — White-Label Branding (MoveDeck Enterprise) `M` `New`
Enterprise tenants upload logo, set primary colour, configure custom subdomain (`ops.acmemovers.com`). Portal renders with their branding — LervIT not visible to end users.
- Files: `server/partnerRoutes.ts`, `client/src/pages/partner/PartnerLayout.tsx`

#### P1 — Customer Loyalty Programme `M` `New`
After 3 completed moves: "Loyal Mover" status — 5% permanent discount. After 10 moves: "LervIT VIP" — priority matching, 10% discount.
- Files: `shared/schema.ts`, `server/routes.ts`

#### P2 — Franchise / City Licence Model `L` `New`
Allow a local operator in a new city to licence the LervIT brand and platform for their market in exchange for revenue share. LervIT provides tech; licensee provides local sales and mover recruitment.

---

## Summary: 12-Month Milestone Tracker

| Milestone | Target Date | Indicator |
|---|---|---|
| RESEND_API_KEY set — emails delivering in production | May 2026 | One abandoned booking email arrives in inbox |
| OPENAI_API_KEY set — AI features functional in production | May 2026 | Photo upload returns load size recommendation |
| Background job scheduler reliable in production | June 2026 | Zero node-cron missed execution warnings in 24h |
| Closed beta live — 10 real customers | June 2026 | 10 completed moves |
| CI/CD pipeline active | June 2026 | No code reaches production without type check passing |
| Stripe refund + cancellation policy live | July 2026 | Self-serve cancel with auto refund |
| Open beta — no invite required | August 2026 | Public signup enabled |
| Mover premium subscription launched | September 2026 | First 10 premium mover subscribers |
| 50 paying customers (marketplace) | October 2026 | MRR ≥ $5,000 |
| Multi-tenancy foundation complete | December 2026 | Two isolated tenants in staging |
| MoveDeck self-serve signup + billing live | January 2027 | First paying MoveDeck tenant |
| Native mover driver app on TestFlight | February 2027 | 5 movers using native app |
| Edmonton launch | March 2027 | 10 Edmonton moves completed |
| First enterprise MoveDeck contract | April 2027 | $799+/mo signed |
| Combined MRR (marketplace + PaaS) | April 2027 | ≥ $15,000 CAD/mo |

---

## Engineering Capacity Assumptions

| Resource | Q1 | Q2 | Q3 | Q4 |
|---|---|---|---|---|
| Full-Stack Developer | 1 FT | 1 FT | 1–2 FT | 2 FT |
| Frontend / UI | 0.5 PT | 0.5 PT | 1 FT | 1 FT |
| DevOps / Infra | 0.25 PT | 0.25 PT | 0.5 PT | 1 FT |
| QA / Testing | 0 | 0.5 PT | 0.5 PT | 1 FT |

P0 items are committed. P1 items are targeted. P2 items are stretch goals dropped if capacity is constrained.

---

## Risk Flags

| Risk | Affected Milestones | Mitigation |
|---|---|---|
| **Email silently broken in production** (RESEND_API_KEY not set) | All Q1 features that trigger email | Set the key immediately — this is a production defect, not a roadmap item |
| **AI features silently broken in production** (OPENAI_API_KEY not set) | Vision Engine, AI Support Copilot | Set the key immediately |
| **Background job scheduler unreliable** | Abandoned booking recovery, Stripe onboarding reminders, booking expiry | Move to DB-backed job queue (pg-boss) or a separate process in Q1 |
| Neon FATAL crash observed in production | Database availability | Test backup restoration drill; consider connection pooling tuning |
| Mover supply too thin for beta | All Q1–Q2 | Pre-recruit 20 movers before opening beta |
| Multi-tenancy scope creep delays PaaS | Q3 milestone | Timebox to 4 weeks; ship row-level isolation first |
| Native app App Store review delays | Q4 mobile milestone | Submit TestFlight by end of January — 3-week buffer |
| Enterprise sales cycle longer than expected | Q4 contract | Begin enterprise conversations in Q2, not Q4 |
| AI API costs exceed budget at scale | Q2–Q4 | Per-user/booking AI caps; cache results aggressively |

---

*LervIT Technologies Corporation. Prepared May 2026. Version 3.0 (Production-Aligned).*
*Review quarterly as market and product learnings evolve.*
