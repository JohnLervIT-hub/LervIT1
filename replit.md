# LervIT - Smart Moving Platform

## Overview
LervIT is a mobile-first web application designed as a two-sided marketplace connecting customers with freelance movers in Calgary. Its primary purpose is to simplify the moving process through features like real-time messaging, booking management, and administrative tools. The platform emphasizes trust, transparent pricing, and an intuitive user experience. The long-term ambition is to evolve into an intelligent, Uber-style location-based service, employing dynamic matching algorithms to connect customers with nearby movers based on proximity and pricing.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a responsive, mobile-first design utilizing shadcn/ui components. Key UI/UX aspects include role-based navigation, protected routes, transparent pricing displays, an intuitive multi-step booking flow, and comprehensive accessibility. An administrative portal offers investor-ready styling. Enhancements include loading skeletons, overlays, sticky mobile progress bars, currency formatting, dark mode, mobile bottom tab navigation, and Framer Motion-powered micro-animations. The system also includes an Uber-style live tracking map with custom vehicle icons, smooth animations, a dark route line, floating ETA badges, and a bottom sheet UI for trip details.

### Technical Implementations
*   **Frontend:** React 18+ (TypeScript, Vite, Wouter for routing, TanStack Query for data fetching, Tailwind CSS for styling).
*   **Backend:** Express.js (Node.js, TypeScript, ESM) providing a RESTful API, Zod for schema validation, and custom SHA-256 hashing.
*   **Data Storage:** PostgreSQL (Neon serverless) managed with Drizzle ORM.
*   **Monorepo Structure:** A `/shared` directory ensures end-to-end TypeScript type safety across frontend and backend.
*   **Production Observability:** Pino-based structured JSON logging for critical events.
*   **Background Jobs:** `node-cron` for scheduled tasks like expiring notifications and failed bookings, and `expirePastScheduledJobs()` to mark past jobs. **Active Trip Protection:** Auto-complete/cancel jobs now check `locationUpdatedAt` - if mover updated location within 2 hours, booking is protected from premature status changes.
*   **Payment Security:** Stripe webhook signature verification and idempotency checks.
*   **Stripe Connect:** Integrates for mover onboarding and escrow-based payout system. Automated reminder system sends up to 3 progressive reminders (1st: 24h email, 2nd: 3 days email+SMS, 3rd: 7 days email+SMS) to movers with incomplete onboarding.
*   **Performance:** Gzip/Brotli compression, lazy loading for routes, preconnect hints, React Query caching, and static upload caching.
*   **Real-Time Communication:** WebSocket notification system for movers with token-based authentication and audio alerts.
*   **Resilience:** Circuit Breaker system for external API calls and an async Vision Queue for background image processing.
*   **Production Security:** `/api/seed` endpoint returns 404 in production (NODE_ENV check).
*   **Admin Single-Session Enforcement:** When an admin logs in, all their previous sessions are automatically invalidated, preventing concurrent admin sessions across devices/browsers.
*   **Archived Pages:** Demo pages (ProximityDemo, LifecycleDemo, MoverLifecycleDemo, VideoPreview) moved to `client/src/pages/archived/`.

### Feature Specifications
*   **Uber-Style Proximity Matching:** Uses Google Maps Distance Matrix API for geocoding, a 7-component dynamic pricing model, and an algorithm to rank the top 5 nearest available movers (15-50km radius) with a 10-minute job notification expiration.
*   **Vehicle Matching:** A smart system classifies vehicles by volume and allows only a single-tier upgrade, normalizing types and providing user-friendly suggestions.
*   **Enhanced Mover Display:** `MoverCard` provides detailed mover information, including verification status, ratings, vehicle details, ETA, and pricing.
*   **Booking Flow:** A multi-step process for locations, load details (mandatory photo upload), and scheduling.
*   **AI-Powered Features:** Controlled via `AI_FEATURES` flags in `shared/ai.ts` for easy enable/disable.
    *   **AI Auto-Quote Predictor:** Provides instant price estimates with confidence levels. (Active)
    *   **AI Price Breakdown Explainer:** Natural language explanations for pricing components. (Archived - feature flag disabled)
    *   **Vision Engine 2.0 (AI Product Identifier):** A 3-layer system for furniture identification using GPT-4o Vision, a ground-truth database, text-based similarity matching, and dimension correction rules for volume/load size estimation and vehicle recommendation. (Active)
    *   **AI Support Copilot:** Analyzes support tickets using GPT-4o for summaries, classification, priority, root cause, recommendations, and suggested responses. (Active)
*   **Image Upload:** Frontend drag-and-drop with validation and Multer-based API handling.
*   **Role-Specific UX:** `ProtectedRoute` for access control and dynamic navigation.
*   **Customer Support:** Ticketing system with FAQ and admin dashboard.
*   **Payment Processing:** Stripe integration for secure payments, including a saved card feature.
*   **Notification Systems:** Comprehensive email templates (Resend) and SMS alerts (Telnyx) for job matches, bookings, payments, and status updates.
*   **Mover Earnings & Payout:** Dashboard and payout system integrated with Stripe Connect for onboarding, commissions, and UI.
*   **Real-Time Tracking:** Movers can share location for customer tracking.
*   **Live Mover GPS System:** Uber-style live location when movers go online - GPS updates every 30 seconds while available, showing "Live" badge on Find Movers page for movers with updates within 1 hour. Uses `lastLocationUpdate` timestamp field and `isLiveLocation` flag.
*   **Move Progress Tracking:** A 6-stage booking status flow with visual indicators.
*   **Mover Profile Management:** Movers can manage profiles, photos, bio, and vehicle details.
*   **Driver Verification:** System tracks 7 types of verification with blocking logic, supported by an admin review dashboard.
*   **Safety Feature:** Customers can report movers, generating high-priority support tickets.
*   **OTP Signup Flow:** Pre-signup phone verification via Telnyx SMS, followed by profile completion.
*   **Mover Job Decline:** Movers can decline job offers, marking notifications as declined and preventing re-acceptance.
*   **Improved Mover Selection:** Uses Google Maps Distance Matrix API for accurate driving distances and times, and supports pre-selection of movers with a two-stage assignment flow (pending notification, explicit acceptance/decline). If a pre-selected mover declines, the system automatically triggers proximity matching for other movers.
*   **Login-First Mover Selection:** Unauthenticated users selecting a mover are redirected to login/signup, then returned to the booking page with the selected mover pre-filled.
*   **Abandoned Booking Tracking:** Automatically saves incomplete bookings when users leave the booking flow. Sends email/SMS reminders to encourage completion (up to 3 reminders per abandoned booking). Admin can view abandoned bookings and recovery rate.
*   **Promo Code System:** LERVIT20 promo code offers 20% off first 2 moves per customer. Platform absorbs the full discount (movers still get 85% of original price). Stripe auto-payout gives movers 85% of discounted price; admin must manually top up the balance via the Promo Balances tab in Admin Payouts. Fields: `promoCode`, `moverBalanceOwed`, `moverBalancePaid` on bookings; `promoUsesCount` on users. Validation endpoint: POST `/api/promo/validate`. Admin endpoints: GET `/api/admin/promo-balances`, POST `/api/admin/promo-balances/:bookingId/mark-paid`.
*   **Growth Dashboard:** Admin tab showing key platform metrics including total/weekly/monthly bookings, revenue, conversion rate, user stats (customers, movers, online, verified, live GPS), abandoned booking recovery rate, 7-day booking trend chart, and **Fulfilment Hours** section with per-driver time tracking (avg/fastest/slowest move times, total hours, driver breakdown table).

## External Dependencies
*   **Payment Processing:** Stripe (`@stripe/stripe-js`, `@stripe/react-stripe-js`)
*   **Database Provider:** Neon Database (PostgreSQL serverless)
*   **UI Component Libraries:** Radix UI, Class Variance Authority (CVA)
*   **Form Management:** React Hook Form, Hookform Resolvers, Zod
*   **Date Handling:** `date-fns`, `react-day-picker`
*   **Session Management:** `connect-pg-simple`
*   **File Upload:** Multer
*   **AI Integration:** OpenAI API
*   **Maps:** Google Maps JavaScript API via `@react-google-maps/api`
*   **Search/Data Enrichment:** SerpAPI
*   **Email Sending:** Resend
*   **SMS Notifications:** Telnyx