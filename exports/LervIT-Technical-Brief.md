# LervIT — One-Page Technical Brief
**Version 1.0 · May 2026 · Confidential**

---

## What Is LervIT?

LervIT is a mobile-first, two-sided moving marketplace operating in Calgary, Alberta. It connects customers who need to move with vetted freelance movers and enterprise fulfillment partners — matching them by proximity, price, vehicle type, and availability in real time. The platform is designed to scale from individual gig-economy movers to white-label enterprise dispatch contracts.

---

## Platform Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui |
| Backend | Express.js (Node.js, TypeScript, ESM), Zod validation, Pino structured logging |
| Database | PostgreSQL via Neon (serverless), Drizzle ORM, shared TypeScript schema |
| Payments | Stripe + Stripe Connect (customer charges, mover escrow payouts, webhook verification) |
| AI | OpenAI GPT-4o (Vision Engine, Auto-Quote, Support Copilot, Audit Copilot) |
| Realtime | WebSocket server (mover notifications, token auth, audio alerts) |
| Comms | Resend (email), Telnyx (SMS + OTP) |
| Maps | Google Maps Distance Matrix API (proximity matching, ETA, driving distance) |
| Storage | Object Storage (driver photos, vehicle photos, compliance docs, proof of completion) |
| Observability | Pino JSON logs, analytics event table, Operations Intelligence dashboard |
| Background Jobs | node-cron (booking expiry, notification cleanup, abandoned booking reminders) |

---

## Core Features

**Customer Side**
- Multi-step booking flow with mandatory load photo upload and AI load estimation
- Uber-style proximity matching — top 5 movers ranked by driving distance (15–50 km radius)
- Real-time GPS tracking with live ETA and 6-stage move progress indicators
- Saved payment cards, promo codes (LERVIT20, 20% off first 2 moves), and Stripe-secured checkout
- Abandoned booking recovery with automated email/SMS reminders (up to 3 per booking)

**Mover Side**
- Job notification system with 10-minute acceptance window and audio alerts
- Stripe Connect onboarding with automated progressive reminders (24 h, 3 days, 7 days)
- Earnings dashboard, payout history, and 7-type driver verification with admin review
- Live GPS sharing (30-second updates, "Live" badge visible to customers within 1 hour)
- Vehicle classification and smart load-matching (car → pickup → van → truck)

**Admin Portal**
- Growth dashboard: bookings, revenue, conversion rate, fulfilment hours, 7-day trend chart
- Operations Intelligence: booking funnel, live ops, mover performance leaderboard, revenue cohorts (auto-refresh every 30 s)
- Visitor analytics: page views, session tracking, booking funnel from client events
- AI Support Copilot: GPT-4o ticket analysis with priority classification, root cause, and dual-output responses (customer-facing + internal notes)
- Single-session enforcement for admin accounts

---

## Enterprise Partner Portal (MoveDeck v1)

A fully isolated portal at `/partner/*` for enterprise fulfillment companies (pilot: OOMovers Inc.).

- Role-based access: `partner_admin`, `partner_dispatcher`, `partner_ops_manager`, `partner_viewer`
- Full booking lifecycle management: accept, reject, assign to driver/crew, status transitions
- Compliance document upload and review workflow (insurance, cargo liability, registration, etc.)
- Incident reporting and resolution tracking
- Team and driver CRUD with vehicle details, photos, and internal notes
- AI Audit Copilot: on-demand GPT-4o analysis per audit log entry with contextual insight, recommendation, and operational risk flag (low / medium / high)
- Partner-scoped audit log with CSV export
- Direct messaging between LervIT admin and partner dispatchers

---

## AI Capabilities

| Feature | Model | Status |
|---|---|---|
| Vision Engine 2.0 — furniture ID from photos | GPT-4o Vision | Active |
| Auto-Quote Predictor — instant price estimate with confidence | GPT-4o | Active |
| Support Copilot — ticket analysis, priority, dual response | GPT-4o | Active |
| Audit Copilot — per-entry operational insight + risk flag | GPT-4o | Active |
| Price Breakdown Explainer | GPT-4o | Feature-flagged off |

All AI features are controlled via `AI_FEATURES` flags in `shared/ai.ts` and fail gracefully when the API key is unavailable.

---

## Security & Reliability

- Stripe webhook signature verification and idempotency checks on all payment events
- Circuit breaker pattern on all external API calls
- Neon pool error listener — FATAL/transient DB errors log a warning and recover on next query (no server restart)
- `uncaughtException` handler distinguishes transient infrastructure errors from fatal application errors
- Session-based auth with `connect-pg-simple`, IP-scoped partner data access, production seed endpoint blocked
- All partner routes are scoped to the authenticated partner — cross-tenant data access is not possible

---

## Key Numbers (Production — May 2026)

| Metric | Value |
|---|---|
| Registered users | 71 |
| Total bookings | 37 |
| Completed moves | 16 |
| Analytics events tracked | 913 |
| Enterprise partners onboarded | 1 (OOMovers pilot) |

---

*LervIT is built and maintained as a monorepo. Frontend, backend, and shared types are fully TypeScript end-to-end. Contact the engineering team for API documentation or integration enquiries.*
