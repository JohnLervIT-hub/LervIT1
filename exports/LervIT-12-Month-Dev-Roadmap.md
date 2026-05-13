# LervIT — 12-Month Product Development Roadmap
## May 2026 → April 2027

**Version:** 1.0  
**Prepared By:** LervIT Technologies Corporation  
**Classification:** Internal — Product & Engineering

---

## How to Read This Roadmap

Each quarter is broken into three tracks that run in parallel:

- **Core Product** — Customer and mover-facing features that drive marketplace growth
- **Platform & Infrastructure** — Technical work that enables scale, reliability, and security
- **Business Enablement** — Admin tools, analytics, monetization, and partner/PaaS features

Each item is tagged with:
- **Priority:** P0 (must-have), P1 (high value), P2 (nice to have)
- **Effort:** S (1–3 days), M (1–2 weeks), L (2–4 weeks), XL (1–2 months)
- **Status at roadmap start:** Exists (already built), Partial (partly built), New (net new)

---

## Strategic Themes by Quarter

| Quarter | Theme | Goal |
|---|---|---|
| Q1 (May–Jul) | **Stabilize & Validate** | Close beta with real users; fix everything that breaks |
| Q2 (Aug–Oct) | **Grow & Convert** | Open beta; mobile-first UX; first 50 paying customers |
| Q3 (Nov–Jan) | **Scale & Diversify** | PaaS multi-tenancy; API; Calgary dominance |
| Q4 (Feb–Apr) | **Expand & Compound** | City 2 expansion; enterprise; native mobile app |

---

## Q1: Stabilize & Validate
### May – July 2026

**Theme:** Get 10 real customers through 10 real moves. Watch everything. Fix everything.

---

### Core Product

#### P0 — Closed Beta Onboarding Flow `M` `New`
A dedicated landing page at `/beta` that allows hand-picked customers to sign up with an invite code. Tracks referral source. Auto-sends a "Welcome to Beta" email with onboarding tips.
- Files: `client/src/pages/BetaSignup.tsx`, `server/routes.ts`
- Done when: 10 beta customers can sign up, book a move, and pay without needing support

#### P0 — End-to-End Booking Smoke Test Suite `M` `New`
Automated Playwright e2e test suite covering the full customer journey: signup → find mover → book → pay → track → complete. Runs on every deployment.
- Files: `tests/e2e/booking-flow.spec.ts` (new)
- Done when: Full booking flow tests pass in CI with zero flaky failures

#### P0 — Mover App: Job Acceptance UX Overhaul `M` `Partial`
Current job notification + acceptance flow is functional but lacks urgency. Add a full-screen job offer overlay with countdown timer, earnings estimate, distance, and one-tap accept/decline. Audio alert already exists — tie it to this new UI.
- Files: `client/src/components/JobNotificationSound.tsx`, `client/src/pages/MoverDashboard.tsx`
- Done when: Movers can accept or decline a job in under 5 seconds from notification

#### P1 — Booking Cancellation & Refund Flow `M` `Partial`
Customers can currently not self-serve cancel a booking. Build a cancellation flow with policy display (free within 2h, 50% fee after), automated Stripe refund trigger, and notifications to both parties.
- Files: `server/routes.ts`, `client/src/pages/CustomerDashboard.tsx`

#### P1 — Mover Rating & Review Improvements `S` `Partial`
Post-move review prompt is sent via email but not surfaced in-app prominently. Add an in-app modal that appears on the customer dashboard after a completed move. Also show mover's rating history on their public profile.
- Files: `client/src/pages/FindMovers.tsx`, `client/src/components/MoverCard.tsx`

#### P1 — Customer Move History Page `S` `Partial`
Customers currently have a basic dashboard. Build a dedicated move history view with status timeline, invoice download, and re-book shortcut.
- Files: `client/src/pages/CustomerDashboard.tsx`

#### P2 — Real-Time Move Status Push Notifications `L` `New`
Extend the existing WebSocket system (currently mover-only) to send real-time status updates to customers when their booking status changes. Eliminates the need to poll or refresh.
- Files: `server/index.ts`, `client/src/contexts/AuthContext.tsx`

---

### Platform & Infrastructure

#### P0 — Automated CI/CD Pipeline `M` `New`
GitHub Actions workflow: TypeScript type check + ESLint on every PR; auto-deploy to staging on merge to main; smoke tests run post-deploy; Slack alert on failure.
- Done when: No code reaches production without passing type check and smoke tests

#### P0 — Error Monitoring Integration `S` `New`
Integrate Sentry (or equivalent) for both frontend and backend. Every unhandled exception is captured with full context: user ID, request path, stack trace.
- Files: `server/index.ts`, `client/src/main.tsx`
- Done when: Zero unhandled errors go undetected in production for more than 5 minutes

#### P0 — Database Backup Verification `S` `New`
Neon provides automatic backups but they have never been tested. Run a monthly backup restoration drill to a staging database. Document the recovery procedure.

#### P1 — API Response Time Baseline `S` `New`
Audit all API endpoints for response time. Flag any endpoint consistently above 500ms. Optimize the top 3 slowest with query analysis and targeted indexing.
- Files: `server/routes.ts`, `server/partnerRoutes.ts`

#### P1 — Rate Limiting on Auth Endpoints `S` `New`
Add per-IP rate limiting on `/api/auth/login`, `/api/auth/register`, and `/api/otp/*` to prevent brute force attacks. Use `express-rate-limit`.
- Files: `server/index.ts`

#### P2 — Uptime Monitoring & Status Page `S` `New`
Set up BetterUptime or Instatus with synthetic checks on 5 key endpoints. Public status page at `status.lervit.com`. Automatic incident creation on failure.

---

### Business Enablement

#### P0 — Admin: Live Beta Dashboard `S` `Partial`
Extend the existing admin Growth Dashboard with a "Beta Health" section: daily active customers, daily active movers, booking completion rate, average time-to-accept, and any beta user who has been stuck for more than 24 hours.
- Files: `client/src/pages/GrowthDashboard.tsx`

#### P0 — Structured Feedback Collection `S` `New`
After every completed move, send a 3-question feedback survey (NPS + 2 open-ended) via email. Store responses in a new `feedback` table. Admin can view all responses.
- Files: `shared/schema.ts`, `server/routes.ts`, new `client/src/pages/admin/AdminFeedback.tsx`

#### P1 — Mover Earnings Statement (PDF) `M` `New`
Movers need documentation for tax purposes. Generate a monthly earnings PDF on demand from the mover dashboard: itemized job list with dates, amounts, platform fees, and net pay. Uses the existing earnings data.
- Files: `client/src/pages/MoverDashboard.tsx`

#### P1 — Promo Code Analytics `S` `Partial`
LERVIT20 promo exists but admin visibility is limited. Add a promo analytics card to the admin dashboard showing: total uses, total discount absorbed, average order value with/without promo, and conversion lift.
- Files: `client/src/pages/GrowthDashboard.tsx`

---

## Q2: Grow & Convert
### August – October 2026

**Theme:** Remove the invite gate. Make the product good enough that customers recommend it without being asked.

---

### Core Product

#### P0 — Open Beta Launch & Public Signup `M` `New`
Remove invite-gate from signup. Add a "Beta" badge in the UI (small, tasteful). Set up basic onboarding analytics to track where new users drop off in the first session.

#### P0 — Progressive Web App (PWA) — Installable on Mobile `M` `Partial`
LervIT is already mobile-responsive. Convert it to a full PWA with: service worker for offline shell, `manifest.json` with app icon, Add to Home Screen prompt at the right moment (after first completed booking). This closes the "no mobile app" gap without native development.
- Files: `client/public/manifest.json`, `client/src/components/InstallPrompt.tsx` (Partial — exists, needs improvement)
- Done when: A customer on iPhone can install LervIT to their home screen and use it like a native app

#### P0 — Saved Addresses & Quick Re-Book `M` `New`
Customers can save up to 5 addresses (home, work, storage unit, etc.). On the booking flow, a saved address dropdown replaces the manual entry. Also add a "Re-book this move" shortcut on completed bookings.
- Files: `client/src/pages/RequestMove.tsx`, `shared/schema.ts`

#### P1 — Mover Availability Calendar `L` `New`
Movers set their available days/hours for the coming 4 weeks. Customers see only movers who are marked available on their preferred date. Dramatically reduces "no movers available" situations and no-shows.
- Files: `shared/schema.ts` (new `moverAvailability` table), `server/routes.ts`, `client/src/pages/MoverProfile.tsx`

#### P1 — In-App Customer → Mover Chat `M` `Partial`
Messaging exists but is not prominently surfaced in the booking flow. Surface a chat thread directly on the booking confirmation page and the live tracking screen. Real-time via existing WebSocket infrastructure.
- Files: `client/src/pages/CustomerDashboard.tsx`, existing message components

#### P1 — Customer Referral Program `M` `New`
"Give $20, Get $20" — customers get a unique referral link. When a referred customer completes their first move, both parties receive a $20 credit applied to next booking. Track in the existing promo code system.
- Files: `shared/schema.ts`, `server/routes.ts`, `client/src/pages/CustomerProfile.tsx`

#### P1 — Instant Quote on Landing Page `M` `Partial`
AI Auto-Quote exists in the booking flow but not on the homepage. Add a lightweight quote calculator widget on the landing page: pickup → dropoff → load size → instant estimate. Drives conversion into the booking flow.
- Files: `client/src/pages/LandingPage.tsx`

#### P2 — Mover Specializations & Tags `S` `New`
Movers can tag themselves: piano moving, fragile items, commercial moves, senior moves, short notice. Customers can filter by tag on the Find Movers page.
- Files: `shared/schema.ts`, `client/src/pages/FindMovers.tsx`

---

### Platform & Infrastructure

#### P0 — Load Testing Before Open Beta `M` `New`
Simulate 50 concurrent users, 200 concurrent users, and a "spike" of 500 using k6 or Artillery. Identify and fix bottlenecks before the public launch.

#### P0 — Database Query Optimization Pass `M` `Partial`
Full audit of queries in `server/routes.ts` and `server/partnerRoutes.ts`. Add missing indexes (especially on `bookings.status`, `bookings.customerId`, `bookings.moverId`). Eliminate N+1 query patterns.

#### P1 — Object Storage CDN for Images `M` `Partial`
Move images currently served directly from Replit Object Storage to behind Cloudflare CDN. Reduces load on the application server and dramatically improves image load times for Calgary customers.

#### P1 — Session Security Hardening `S` `Partial`
- Rotate session secret in production (currently static)
- Set `sameSite: strict` and `secure: true` on session cookies
- Implement absolute session expiry (8 hours) regardless of activity

#### P2 — Background Job Dashboard `S` `New`
Add a hidden admin page showing the status of all cron jobs (last run time, success/failure, next scheduled run). Currently these are invisible — failures go undetected.
- Files: new `client/src/pages/admin/AdminJobs.tsx`

---

### Business Enablement

#### P0 — Mover Onboarding Funnel Analytics `M` `New`
Track every step of the mover onboarding process from "I want to become a mover" to "first job completed". Identify the step with the highest drop-off and fix it. This directly drives supply-side growth.
- Files: existing `analytics_events` table, `client/src/hooks/use-analytics.ts`

#### P0 — Subscription Billing for Movers (Optional Premium) `L` `New`
Free tier: 3 jobs/month, 20% platform fee. Premium tier ($29/mo): unlimited jobs, 15% platform fee, priority matching, verified badge. Stripe subscription per mover.
- Files: `shared/schema.ts`, `server/routes.ts`, `client/src/pages/MoverDashboard.tsx`

#### P1 — Automated Mover Recruitment Emails `M` `New`
When a customer books in a zone with fewer than 3 available movers, trigger an automated outreach to unverified movers in that area encouraging them to complete verification.
- Files: `server/routes.ts`, email templates in `server/notificationService.ts`

#### P1 — Admin Revenue Dashboard V2 `M` `Partial`
Extend the existing analytics with: MRR trend, cohort analysis (do customers who used promo codes return?), average revenue per booking over time, and projected revenue vs. actuals.
- Files: `client/src/pages/GrowthDashboard.tsx`, `server/routes.ts`

#### P2 — Invoice Generation for Customers `M` `New`
After a completed move, customers can download a PDF invoice with LervIT branding: booking ID, date, pickup/dropoff, mover name, itemized price, tax, and payment confirmation. Useful for renters claiming moving expenses.
- Files: `server/routes.ts`, `client/src/pages/CustomerDashboard.tsx`

---

## Q3: Scale & Diversify
### November 2026 – January 2027

**Theme:** Build the infrastructure for a second revenue stream. Begin the PaaS play.

---

### Core Product

#### P0 — Review & Trust System Overhaul `L` `Partial`
Reviews exist but aren't prominent enough to drive mover selection behavior. Changes:
- Surface top 3 reviews directly on the Find Movers page (not just in profile)
- Add response system: movers can reply to reviews
- Flag and admin-review disputed reviews
- "Verified Mover" badge logic tightened (requires 5+ reviews with ≥4.5 average)

#### P0 — Scheduled Move Reminders `S` `New`
48h and 2h before a scheduled move: customer gets SMS + push notification with mover name, ETA, and a "Track" deep link. Mover gets a reminder with the pickup address and customer name.

#### P1 — Customer Support Live Chat Integration `M` `New`
Replace the current ticket-only support with a live chat widget (Crisp or Intercom) that's available during business hours. After hours, automatically routes to ticket. Support agents can see the customer's booking context inline.
- Files: `client/src/pages/Support.tsx`

#### P1 — Multi-Stop Moves `L` `New`
Allow customers to add up to 3 stops between pickup and dropoff (e.g., pick up from storage unit on the way). Price increases per extra stop. New field on booking schema.
- Files: `shared/schema.ts`, `client/src/pages/RequestMove.tsx`, pricing model in `server/pricing.ts`

#### P2 — Scheduled Move Templates `M` `New`
For repeat customers (students moving between semesters, businesses doing regular deliveries), allow saving a "move template": saved pickup/dropoff pair, load size, preferred mover. One-tap re-book from the template.

#### P2 — Mover Streak & Achievement System `M` `New`
Gamification for movers: badges for milestones (first move, 10 moves, 50 moves, 100 moves, perfect month), a "hot streak" indicator when they've completed 3+ jobs this week. Shown on their public profile. Drives engagement and retention.

---

### Platform & Infrastructure

#### P0 — Multi-Tenancy Foundation (PaaS Prerequisite) `XL` `New`
Add `tenant_id` to all partner tables. Create `tenants` table. Inject tenant context into all partner route queries. This is the critical prerequisite for MoveDeck PaaS.
- Files: `shared/schema.ts`, `server/partnerRoutes.ts`, Drizzle migration
- Done when: Two isolated test tenants exist and cannot read each other's data

#### P0 — Test Coverage: Critical Paths `L` `New`
Unit tests for: pricing model, vehicle matching algorithm, promo code validation, Stripe webhook handler, notification dispatch. Target 80% coverage on these files specifically.
- Files: `server/pricing.ts`, `shared/matching.ts`, `server/routes.ts` (webhook handler)

#### P1 — Redis Session & Cache Layer `L` `New`
Replace `connect-pg-simple` sessions with Redis. Add Redis caching for: mover list queries (60s TTL), Google Maps geocoding results (24h TTL), AI quote results (30m TTL). Reduces database load and API costs.

#### P1 — Structured Logging Dashboard `M` `New`
Pipe Pino JSON logs to a log aggregation service (Logtail or Papertrail). Create saved searches for: payment failures, booking errors, mover WebSocket disconnects, AI quota errors. Makes debugging production issues 10x faster.

#### P2 — Database Read Replica `M` `New`
Provision a Neon read replica. Route all analytics and reporting queries to the replica, keeping write traffic on the primary. Prevents heavy admin dashboard queries from impacting booking flow performance.

---

### Business Enablement

#### P0 — MoveDeck Self-Serve Signup & Billing `XL` `New`
The PaaS play requires self-serve onboarding: company creates account → selects plan → Stripe subscription created → isolated portal instance provisioned in under 10 seconds.
- Files: `client/src/pages/partner/PartnerSignup.tsx` (new), `server/partnerRoutes.ts`
- See: MoveDeck PaaS Scope Document, Phase 0

#### P0 — MoveDeck Public Landing Page `L` `New`
Public-facing marketing page at `/movedeck` (or `movedeck.io` when ready): value proposition, plan pricing table, feature comparison, and a "Start free trial" CTA.
- Files: `client/src/pages/MoveDeckLanding.tsx` (new)

#### P1 — Partner Portal: Plan-Gated Feature Paywalls `M` `New`
Once multi-tenancy and billing are in place, gate Growth-tier features (Earnings, Stripe payouts, Compliance Manager) behind an "Upgrade to unlock" paywall with a plan comparison modal.
- Files: `client/src/pages/partner/PartnerEarnings.tsx`, `PartnerCompliance.tsx`

#### P1 — LervIT Admin: Tenant Management Dashboard `M` `New`
Admin page showing all MoveDeck tenants: company name, plan, MRR, trial status, usage (bookings this month), last login. One-click impersonate for support purposes.
- Files: new `client/src/pages/admin/AdminTenants.tsx`

#### P2 — Affiliate & Referral Tracking for MoveDeck `M` `New`
Moving industry consultants and insurance brokers who refer companies to MoveDeck earn 15% recurring commission. UTM-tracked signup links, admin view of referred tenants, automated commission calculation.

---

## Q4: Expand & Compound
### February – April 2027

**Theme:** Expand geographically. Launch native mobile. Close first enterprise deal.

---

### Core Product

#### P0 — City 2 Expansion: Edmonton `L` `New`
LervIT's proximity algorithm, mover onboarding, and dispatch system all work for any city. Launch in Edmonton with a targeted mover recruitment campaign (10 verified movers before accepting bookings). Requires: Edmonton-specific pricing calibration, local mover coverage zone setup.

#### P0 — Native Mobile App: Mover Driver App (iOS + Android) `XL` `New`
The single biggest driver of mover supply retention. A native app (React Native or Capacitor) gives movers: push notifications for job offers (no more SMS dependency), GPS tracking in the background, offline job history, and a professional-feeling tool they're proud to use.
- See: `capacitor-native-upgrade` skill for the Capacitor approach
- Done when: App available on TestFlight (iOS) and Google Play internal track

#### P1 — Dynamic Surge Pricing `L` `New`
When demand in a zone exceeds supply (fewer than 3 available movers), automatically apply a 1.1–1.4x surge multiplier. Display a "High demand in your area" notice to customers with an estimated wait time alternative. Transparent surge indicator on mover cards.
- Files: `server/dispatch.ts`, `client/src/pages/FindMovers.tsx`

#### P1 — B2B / Commercial Account Type `L` `New`
Businesses (offices, retailers, property managers) can create a business account: monthly invoicing instead of per-move payment, volume discount tiers (10+ moves/mo = 10% off), multi-user access so multiple employees can book under one account.
- Files: `shared/schema.ts`, `server/routes.ts`, `client/src/pages/RequestMove.tsx`

#### P2 — Move Insurance Add-On `L` `New`
Partner with a Canadian specialty insurer to offer optional per-move coverage ($2.99–9.99 depending on declared value). Checkbox in booking flow. Certificate emailed on booking confirmation. A meaningful trust signal and additional revenue stream.

#### P2 — Mover Team / Crew System `M` `New`
Currently one mover per booking. Allow movers to form a crew (2–4 people) with a lead mover who accepts jobs and splits earnings with crew members. Unlocks larger apartment and commercial move categories.
- Files: `shared/schema.ts`, `server/routes.ts`

---

### Platform & Infrastructure

#### P0 — Multi-Region Deployment: Canada + US East `L` `New`
Deploy to both `ca-central-1` (existing) and `us-east-1`. Cloudflare geo-routing sends Canadian users to Canadian servers (PIPEDA compliance) and US users to US servers (prep for US expansion).

#### P0 — SOC 2 Type II Audit Preparation `XL` `New`
Required for enterprise sales to regulated companies. Engage a SOC 2 auditor. This is a 3–6 month process. Q4 is the start — full certification targeted for Q2 of Year 2.
- Covers: access controls, availability, confidentiality, change management, incident response

#### P1 — Full REST API v1 (MoveDeck Enterprise) `XL` `New`
Public REST API with API key authentication, rate limiting, Swagger documentation. Enables enterprise customers to integrate MoveDeck with their TMS, ERP, or custom tools.
- See: Appendix B of MoveDeck PaaS Scope Document for planned endpoints

#### P1 — Webhook Event System `L` `New`
Enterprise customers register webhook endpoints. LervIT pushes `booking.*`, `incident.*`, `compliance.*` events to their systems in real time.
- Files: `shared/schema.ts` (new `webhooks` table), `server/partnerRoutes.ts`

#### P2 — Performance Budget Enforcement `M` `New`
Set Lighthouse performance budget in CI: First Contentful Paint < 1.5s, Total Blocking Time < 200ms, Cumulative Layout Shift < 0.1. Fail the build if any page regresses below budget.

---

### Business Enablement

#### P0 — First Enterprise Partner Contract `XL` `Business`
Use the MoveDeck platform to close the first enterprise deal: a mid-sized moving company (20+ trucks) in Calgary or Edmonton signing at the $799+/mo tier with a dedicated onboarding.
- Prerequisite: Multi-tenancy, billing, white-label branding, dedicated CSM

#### P0 — White-Label Branding (MoveDeck Enterprise) `M` `New`
Enterprise tenants can upload a logo, set a primary color, and configure a custom subdomain (`ops.acmemovers.com`). Portal renders with their branding — LervIT not visible to end users.
- Files: `server/partnerRoutes.ts`, `client/src/pages/partner/PartnerLayout.tsx`

#### P1 — Customer Loyalty Program `M` `New`
After 3 completed moves: "Loyal Mover" status — 5% permanent discount. After 10 moves: "LervIT VIP" — dedicated support, priority matching, 10% discount. Tracked on user record.
- Files: `shared/schema.ts`, `server/routes.ts`

#### P2 — Franchise / City License Model `L` `New`
Allow a local operator in a new city to "license" the LervIT brand and platform for their market in exchange for a revenue share. LervIT provides the tech; the licensee provides local sales and mover recruitment. De-risks geographic expansion without hiring locally.

---

## Summary: 12-Month Milestone Tracker

| Milestone | Target Date | Indicator |
|---|---|---|
| Closed beta live with 10 real customers | June 2026 | 10 completed moves |
| CI/CD pipeline and error monitoring active | June 2026 | Zero blind production errors |
| Open beta — no invite required | August 2026 | Public signup enabled |
| PWA installable on iOS + Android | September 2026 | App store equivalent experience |
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

This roadmap is scoped for a lean team:

| Resource | Q1 | Q2 | Q3 | Q4 |
|---|---|---|---|---|
| Full-Stack Developer | 1 FT | 1 FT | 1–2 FT | 2 FT |
| Frontend / UI | 0.5 PT | 0.5 PT | 1 FT | 1 FT |
| DevOps / Infra | 0.25 PT | 0.25 PT | 0.5 PT | 1 FT |
| QA / Testing | 0 | 0.5 PT | 0.5 PT | 1 FT |

*FT = Full-Time, PT = Part-Time*

P0 items are committed. P1 items are targeted. P2 items are stretch goals that will be dropped if capacity is constrained.

---

## Risk Flags

| Risk | Affected Milestones | Mitigation |
|---|---|---|
| Mover supply too thin to support beta | All of Q1–Q2 | Pre-recruit 20 movers before opening beta |
| Multi-tenancy scope creep delays PaaS | Q3 milestone | Timebox to 4 weeks; ship row-level isolation first, schema isolation later |
| Native app delays (App Store review times) | Q4 mobile milestone | Submit to TestFlight by end of January; build in 3-week buffer |
| Enterprise sales cycle longer than expected | Q4 contract milestone | Begin enterprise sales conversations in Q2, not Q4 |
| AI API costs exceed budget at scale | Q2–Q4 | Add AI feature usage caps per user/booking; cache results aggressively |

---

*LervIT Technologies Corporation. Prepared May 2026. Version 1.0.*  
*This document is subject to revision as market and product learnings evolve. Review quarterly.*
