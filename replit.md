# LervIT - Smart Moving Platform

## Overview
LervIT is a mobile-first web application designed as a two-sided marketplace connecting customers with freelance movers in Calgary. Its primary goal is to simplify the moving process through features like real-time messaging, booking management, administrative tools, and comprehensive support. The platform emphasizes trust, transparent pricing, and intuitive user experiences, with an ambitious vision to evolve into an intelligent, Uber-style location-based service that matches customers with nearby movers using proximity and dynamic pricing algorithms.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first design using shadcn/ui components, ensuring a consistent and responsive user experience. It includes role-based navigation, protected routes, transparent pricing breakdowns, and an intuitive booking flow. A comprehensive typography system, responsive layouts, and various accessibility improvements (e.g., `ErrorBoundary`, `FormFieldError`, `aria-labels` for icon buttons) have been implemented. A premium admin portal features investor-ready styling with gradient headers and colorful stat cards. User experience is enhanced with:
- `DashboardSkeleton` component for loading states
- `LoadingOverlay` component with specialized variants (Vision, Payment, Booking)
- Sticky mobile progress bar for booking flow
- Currency formatting utility
- Dark mode toggle with Light/Dark/System options
- Mobile bottom tab navigation
- Framer Motion-powered micro-animations for page transitions
- User-friendly error messages throughout the application
- Clean production build (no console.logs in client code)

### Technical Implementations
*   **Frontend:** React 18+ (TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS).
*   **Backend:** Express.js (Node.js, TypeScript, ESM) with RESTful API, Zod for validation, and custom SHA-256 hashing.
*   **Data Storage:** PostgreSQL (Neon serverless) with Drizzle ORM.
*   **Monorepo Structure:** A `/shared` directory for centralized schema and types, ensuring end-to-end TypeScript type safety.
*   **Production Observability:** Pino-based structured JSON logging (`server/logger.ts`) with event-specific loggers for payments, vehicle matching, cleanup, and errors.
*   **Background Jobs:** node-cron scheduler (`server/background-jobs.ts`) running every 5 minutes to expire stale notifications and payment-failed bookings.
*   **Payment Security:** Stripe webhook signature verification when `STRIPE_WEBHOOK_SECRET` is configured; idempotency checks prevent duplicate processing.
*   **Stripe Connect Integration:** Full Express account onboarding for movers with separate transfer flow - funds held by platform until job completion, then transferred to mover's connected account minus platform fee.

### Feature Specifications
*   **Uber-Style Proximity Matching:** Geocoding system (Google Maps Distance Matrix API), 7-component dynamic pricing model, and an algorithm that ranks the top 5 nearest available movers within 15-50km. A `jobNotifications` system handles invitations with a 10-minute expiration.
*   **Single-Tier Vehicle Upgrade Logic:** Smart vehicle matching system (`shared/matching.ts`, `shared/vehicle-availability.ts`) that:
    - Matches customers to movers based on volume-based vehicle requirements (0-20 ft³ → car, 21-80 ft³ → van, 81-170 ft³ → pickup, >170 ft³ → truck)
    - Allows ONE tier upgrade only (car→van, van→pickup, pickup→truck) to prevent extreme mismatches
    - Normalizes legacy vehicle type labels (case-insensitive matching for "SUV", "Cargo Van", etc.)
    - Returns explicit `NO_VEHICLE_AVAILABLE` status when no matching vehicle is online (including single-tier upgrade)
    - Provides user-friendly messaging and suggestions when no match is found
*   **Enhanced Mover Display:** `MoverCard` component provides comprehensive mover information including verification, ratings, vehicle details, ETA, and pricing.
*   **Booking Flow Optimization:** Multi-step process for locations, load details (mandatory photo upload), and scheduling.
*   **AI-Powered Features:**
    *   **AI Auto-Quote Predictor:** Instant price estimates with confidence levels.
    *   **AI Price Breakdown Explainer:** Natural language explanations for pricing components.
    *   **Vision Engine 2.0 (AI Product Identifier):** 3-layer system for stable, consistent furniture identification:
        - **Layer 1 - Ground-Truth Database:** 50+ furniture items with verified dimensions, weight, load_size, and vehicle recommendations in `shared/furniture-database.ts`
        - **Layer 2 - Similarity Matching:** Text-based matching of detected items against database. If similarity > 70%, uses verified database values instead of estimation.
        - **Layer 3 - Dimension Correction:** Category-specific clamp rules in `server/dimension-corrector.ts` normalize AI estimates to realistic ranges (e.g., beds 183-216cm length, sofas 152-356cm).
        - **Pipeline:** Image → GPT-4o Vision detection → Database match → (If no match) Vision estimate + Correction → Volume calculation → Load size classification → Vehicle recommendation
        - **Output:** Structured JSON with itemName, category, dimensions, volume_ft3, weight_kg, load_size, vehicle, movers_required, confidence, source (database_match/vision_estimate/fallback)
    *   **AI Support Copilot:** GPT-4o-powered analysis of support tickets providing summaries, classification, priority, root cause, recommendations, and suggested responses.
*   **Image Upload:** Frontend drag-and-drop with validation and Multer-based API handling, mandatory for booking.
*   **Role-Specific User Experience:** `ProtectedRoute` for access control and dynamic navigation.
*   **Customer Support System:** Ticketing system with FAQ and admin dashboard.
*   **Payment Processing:** Stripe integration for secure payments, including a **Saved Card Feature** allowing customers to store and manage payment methods.
*   **Email Notification System:** Comprehensive email templates including:
    - **Job Match Notifications:** Urgent emails sent to movers when matched to a job with 10-minute expiry warning, earnings display, job details, and direct CTA to accept
    - **Booking Confirmations:** Sent to customers after payment
    - **Payment Receipts:** Detailed payment confirmation emails
    - **Status Updates:** Move progress notifications
    - **Mover Assignment:** Notification to customer when mover accepts
*   **Mover Earnings Dashboard & Payout System:** Stripe Connect integration for mover payouts, including onboarding, commission tracking, and a Mover Payout Center UI.
*   **Real-Time Vehicle Tracking:** Movers can share location for customer tracking on Google Maps.
*   **6-Stage Move Progress Tracking:** Granular booking status flow with visual indicators and status progression buttons.
*   **Mover Profile Management:** Movers can manage profile, photos, bio, and vehicle details.
*   **Driver Verification & Compliance System:** Tracks 7 types of verification with blocking logic until approval.
*   **Admin Verification Review Dashboard:** Admin interface for managing driver verification documents.
*   **Report Mover Safety Feature:** Allows customers to report issues, generating high-priority support tickets.

## External Dependencies
*   **Payment Processing:** Stripe (`@stripe/stripe-js`, `@stripe/react-stripe-js`)
*   **Database Provider:** Neon Database (PostgreSQL serverless)
*   **UI Component Libraries:** Radix UI, Class Variance Authority (CVA)
*   **Form Management:** React Hook Form, Hookform Resolvers, Zod
*   **Date Handling:** date-fns, react-day-picker
*   **Session Management:** connect-pg-simple
*   **File Upload:** Multer
*   **AI Integration:** OpenAI API
*   **Maps:** Google Maps JavaScript API via @react-google-maps/api library
*   **Search/Data Enrichment:** SerpAPI
*   **Email Sending:** Resend

## Stripe Connect Configuration (LIVE Mode)

### Required Environment Variables
Add these to Replit Secrets for LIVE mode:
- `STRIPE_SECRET_KEY`: Live secret key (`sk_live_...`) - Server-side only
- `VITE_STRIPE_PUBLIC_KEY`: Live publishable key (`pk_live_...`) - Frontend
- `STRIPE_WEBHOOK_SECRET`: Webhook signing secret for live endpoint

### Payment Flow Architecture
**Separate Transfer Approach (Option B):**
1. Customer creates booking → PaymentIntent created
2. Customer pays → Funds held in Lervit's Stripe account
3. Mover accepts job → Job notification system
4. Mover completes job → Transfer created to mover's connected account (minus platform fee)

This approach is used because:
- Mover is unknown at payment time (Uber-style matching)
- Platform can hold funds until job completion
- Enables refund handling before transfer occurs

### Mover Onboarding Endpoints
- `POST /api/movers/payouts/onboarding-link` - Create Stripe Express onboarding link
- `GET /api/movers/payouts/login-link` - Access Stripe Express Dashboard
- `POST /api/movers/payouts/refresh-status` - Sync onboarding status from Stripe
- `GET /api/movers/payouts/account` - Get current Connect account status
- `GET /api/movers/payouts/summary` - Earnings dashboard data

### Webhook Events Handled
- `payment_intent.succeeded` - Mark booking paid, notify movers
- `payment_intent.payment_failed` - Mark booking as payment failed
- `account.updated` - Sync mover Connect account status
- `charge.refunded` - Future: Handle refunds

### Platform Commission
Default: 15% (configurable in `server/config/stripe.ts`)
Vehicle class adjustments available:
- Car: 12%
- Van/Pickup: 15%
- Truck: 18%

### Manual Test Plan
1. Create a test booking as customer
2. Pay with real card in LIVE mode
3. Check Stripe Dashboard → Payments → See platform receives full amount
4. Mover completes job → Check Stripe Dashboard → Connect → Transfers
5. Verify webhook updated booking status in database

## Security Hardening Checklist

### Completed Security Measures
- [x] **CORS Configuration**: Production allows only lervit.com domains; development allows localhost/Replit
- [x] **Rate Limiting**: General API (100/15min), Auth (10/15min), Payments (20/15min), Webhooks (50/min)
- [x] **Security Headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, HSTS (production)
- [x] **Webhook Signature Verification**: Uses raw body + `stripe.webhooks.constructEvent()`
- [x] **Server-Side Amount Calculation**: Payment amounts calculated from booking, never from client
- [x] **Idempotency Keys**: Prevent duplicate PaymentIntents and Transfers
- [x] **Ownership Validation**: Users can only access/pay for their own bookings
- [x] **Session-Based Auth**: User IDs from server session, not request body
- [x] **Production Webhook Secret Required**: Rejects webhooks if `STRIPE_WEBHOOK_SECRET` missing in production

### Verification Commands
```bash
# Test CORS is working (should succeed from allowed origin)
curl -H "Origin: https://lervit.com" -I https://your-app.replit.app/api/bookings

# Test rate limiting (should get 429 after limit)
for i in {1..120}; do curl -s https://your-app.replit.app/api/bookings; done

# Test webhook verification (should fail without valid signature)
curl -X POST https://your-app.replit.app/api/stripe-webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"test"}'
# Expected: {"error":"No stripe signature"}
```

### Security Files
- `server/middleware/security.ts` - CORS, rate limiting, security headers
- `server/config/stripe.ts` - Stripe client, commission configuration
- `server/routes.ts` - Security documentation header, endpoint protection

## Operational Tooling

### Structured Logging
Pino-based JSON structured logging with event-specific loggers:
- `logEvent.payment()` - Payment processing, Stripe webhooks, transfers
- `logEvent.booking()` - Booking creation, geocoding, distance calculation
- `logEvent.notification()` - Email and job notification delivery
- `logEvent.vision()` - Vision Engine 2.0 item identification results
- `logEvent.matching()` - Mover matching and vehicle availability
- `logEvent.cleanup()` - Background job execution
- `logEvent.error()` - Error capture with stack traces

### Testing Infrastructure
- **Smoke Tests**: `npx tsx tests/smoke-tests.ts` - Verifies 8 critical API endpoints
- **Load Tests**: `k6 run tests/load-test.js` - Simulates 50 concurrent users
- **Run smoke tests before deployment** to catch issues early

### Documentation
- `docs/neon-pitr-backup.md` - Database backup and recovery procedures
- `docs/google-places-migration.md` - Places API migration plan (Q4 2025)

## Future Integrations (Pending)

### Twilio SMS Notifications
**Status:** Not yet configured - user to provide credentials when ready

**Required Secrets:**
- `TWILIO_ACCOUNT_SID` - Account identifier
- `TWILIO_AUTH_TOKEN` - Authentication token
- `TWILIO_PHONE_NUMBER` - Canadian phone number for sending

**Implementation Plan:**
1. Add `phone` field to movers table (opt-in)
2. Create `sendSMS()` function in `server/notifications.ts`
3. Send SMS alongside email for job match alerts
4. SMS first (instant), email as backup (detailed info)

### Production Monitoring Commands
```bash
# Run smoke tests
npx tsx tests/smoke-tests.ts

# Run load tests (requires k6 installed)
k6 run tests/load-test.js

# View structured logs (production JSON format)
tail -f /var/log/app.log | jq .

# Check for errors in logs
grep '"level":"error"' /var/log/app.log | jq .
```