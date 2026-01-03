# LervIT - Smart Moving Platform

## Overview
LervIT is a mobile-first web application functioning as a two-sided marketplace. It connects customers with freelance movers in Calgary, aiming to streamline the moving process through features like real-time messaging, booking management, and administrative tools. The platform prioritizes trust, transparent pricing, and an intuitive user experience. The long-term vision is to evolve into an intelligent, Uber-style location-based service, dynamically matching customers with nearby movers using proximity and pricing algorithms.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first design using shadcn/ui components for a responsive and consistent user experience. Key elements include role-based navigation, protected routes, transparent pricing, an intuitive booking flow, and comprehensive accessibility improvements. A premium admin portal offers investor-ready styling. Enhancements include loading skeletons, overlays, sticky mobile progress bars, currency formatting, dark mode, mobile bottom tab navigation, and Framer Motion-powered micro-animations.

### Technical Implementations
*   **Frontend:** React 18+ (TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS).
*   **Backend:** Express.js (Node.js, TypeScript, ESM) with RESTful API, Zod for validation, and custom SHA-256 hashing.
*   **Data Storage:** PostgreSQL (Neon serverless) with Drizzle ORM.
*   **Monorepo Structure:** A `/shared` directory centralizes schema and types for end-to-end TypeScript type safety.
*   **Production Observability:** Pino-based structured JSON logging for various events (payments, vehicle matching, cleanup, errors).
*   **Background Jobs:** `node-cron` schedules tasks every 5 minutes to expire stale notifications and payment-failed bookings.
*   **Payment Security:** Stripe webhook signature verification and idempotency checks prevent duplicate processing.
*   **Stripe Connect Integration:** Full Express account onboarding for movers, with funds held by the platform until job completion, then transferred to the mover's connected account minus platform fees.

### Feature Specifications
*   **Uber-Style Proximity Matching:** Utilizes Google Maps Distance Matrix API for geocoding, a 7-component dynamic pricing model, and an algorithm to rank the top 5 nearest available movers within 15-50km. A `jobNotifications` system manages invitations with a 10-minute expiration.
*   **Single-Tier Vehicle Upgrade Logic:** A smart vehicle matching system classifies vehicles by volume (car, van, pickup, truck) and allows only a single-tier upgrade to prevent extreme mismatches. It normalizes vehicle types and provides explicit `NO_VEHICLE_AVAILABLE` status with user-friendly suggestions.
*   **Enhanced Mover Display:** `MoverCard` component provides comprehensive mover information (verification, ratings, vehicle details, ETA, pricing).
*   **Booking Flow Optimization:** A multi-step process for locations, load details (mandatory photo upload), and scheduling.
*   **AI-Powered Features:**
    *   **AI Auto-Quote Predictor:** Instant price estimates with confidence levels.
    *   **AI Price Breakdown Explainer:** Natural language explanations for pricing components.
    *   **Vision Engine 2.0 (AI Product Identifier):** A 3-layer system for furniture identification:
        -   **Layer 1:** Ground-Truth Database of 50+ furniture items with verified data.
        -   **Layer 2:** Text-based similarity matching against the database.
        -   **Layer 3:** Category-specific dimension correction rules for AI estimates.
        -   **Pipeline:** Image → GPT-4o Vision → Database match → (If no match) Vision estimate + Correction → Volume/Load size calculation → Vehicle recommendation.
        -   **Output:** Structured JSON with item details, volume, weight, load size, vehicle, movers required, confidence, and source.
    *   **AI Support Copilot:** GPT-4o analysis of support tickets for summaries, classification, priority, root cause, recommendations, and suggested responses.
*   **Image Upload:** Frontend drag-and-drop with validation and Multer-based API handling, mandatory for booking.
*   **Role-Specific User Experience:** `ProtectedRoute` for access control and dynamic navigation.
*   **Customer Support System:** Ticketing system with FAQ and admin dashboard.
*   **Payment Processing:** Stripe integration for secure payments, including a **Saved Card Feature**.
*   **Email Notification System:** Comprehensive email templates for job matches, booking confirmations, payment receipts, status updates, and mover assignments.
*   **SMS Notification System (Telnyx):** Real-time SMS alerts to movers for job opportunities.
*   **Mover Earnings Dashboard & Payout System:** Stripe Connect integration for mover payouts, onboarding, commission tracking, and a dedicated UI.
*   **Real-Time Vehicle Tracking:** Movers can share their location for customer tracking.
*   **6-Stage Move Progress Tracking:** Granular booking status flow with visual indicators.
*   **Mover Profile Management:** Movers can manage profiles, photos, bio, and vehicle details.
*   **Driver Verification & Compliance System:** Tracks 7 types of verification with blocking logic until approval.
*   **Admin Verification Review Dashboard:** Admin interface for managing driver verification documents.
*   **Report Mover Safety Feature:** Allows customers to report issues, generating high-priority support tickets.

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

## Recent Changes (Dec 15, 2025)

### Uber-Style OTP Signup Flow
*   **Pre-Signup Phone Verification:** Phone verification now required BEFORE account creation (similar to Uber).
*   **3-Step Signup Flow:**
    1. **Phone Entry:** User enters phone number, clicks "Continue" to send OTP.
    2. **OTP Verification:** User enters 6-digit code sent via Telnyx SMS.
    3. **Profile Completion:** After phone verification, user completes name/email/password/role.
*   **New Schema:** `phone_verification_tokens` table stores pre-signup verification codes with 10-minute expiry.
*   **New API Endpoints:** `/api/auth/pre-signup/send-code` and `/api/auth/pre-signup/verify-code` (no auth required).
*   **Updated Signup API:** `/api/auth/signup` now requires `phoneVerificationToken` parameter.
*   **Security:** Rate limiting (5 requests/15 min in production), automatic phone verification on account creation.
*   **AuthContext Integration:** `phoneVerified` field propagated across login/signup/refresh flows.

### Post-Login Phone Verification
*   **For Existing Users:** `PhoneVerification.tsx` component allows verified users to update/verify phone numbers.
*   **API Endpoints:** `/api/auth/send-phone-verification` and `/api/auth/verify-phone` with authentication required.
*   **Integration:** Available in CustomerProfile and MoverProfile pages.

### Performance Optimizations
*   **Storage Query Pagination:** Added `limit` and `offset` support to `getUsers()`, `getMovers()`, and `getBookings()` storage methods with proper pagination response format containing `data`, `total`, `limit`, `offset`, and `hasMore` fields.
*   **Token Lookup Methods:** Added `getUserByResetToken()` and `getUserByVerificationToken()` direct lookup methods to avoid full table scans for password reset and email verification flows.
*   **Admin Pagination:** `AdminUsersPage` now uses paginated API with proper React Query cache invalidation via predicate functions to ensure all paginated queries are refreshed after mutations.
*   **Component Memoization:** Applied `React.memo()` to `ChatInterface` with memoized `MessageBubble` component to reduce unnecessary re-renders.
*   **AddressAutocomplete Debounce:** Fixed debounce logic using `autocompleteJustFired` ref to allow manual address edits after place selection without duplicate callbacks.
*   **Circuit Breaker System:** Implemented `CircuitBreaker` class in `server/circuit-breaker.ts` for external API resilience (Stripe, OpenAI, Telnyx) with configurable failure thresholds and recovery timeouts.
*   **Vision Queue:** Async job processing system in `server/vision-queue.ts` for background HEIC conversion and OpenAI Vision API calls.

## Recent Changes (Dec 17, 2025)

### Real-Time WebSocket Notification System for Movers
*   **Token-Based Authentication:** WebSocket connections require short-lived (5-min) tokens obtained via authenticated REST endpoint `/api/movers/me/ws-token`.
*   **Security Features:**
    - Tokens are single-use (deleted after validation)
    - Origin validation on WebSocket handshake
    - Session-based token generation (requires authenticated user)
    - Tokens include userId and moverId for verification
*   **Client Hook:** `useMoverWebSocket.ts` handles token fetching, WebSocket connection, automatic reconnection, and message parsing.
*   **Audio Notifications:** `JobNotificationSound.tsx` component plays sound alerts using singleton AudioContext pattern to prevent memory leaks.
*   **ID Matching Contract:** Job notifications use `mover.userId` (the user's ID) as the moverId. WebSocket clients are matched by `client.userId` to ensure proper delivery.
*   **Broadcasting:** New bookings trigger WebSocket notifications to all matched movers via `moverWebSocket.notifyMover(mover.userId, ...)`.
*   **Scalability Note:** Token store is in-memory (MVP limitation). For horizontal scaling, requires distributed storage (Redis).

## Recent Changes (Jan 3, 2026)

### Uber-Style Live Tracking Map
*   **Full-Screen Map Experience:** Replaced card-based map with immersive full-screen Google Map like Uber.
*   **Custom Vehicle Icon:** SVG-based car icon with rotation based on travel direction (calculates bearing between positions).
*   **Smooth Vehicle Animation:** requestAnimationFrame-based interpolation with ease-out cubic easing for smooth 2-second transitions between GPS updates.
*   **Dark Route Line:** Black/dark gray polyline styling matching Uber's design language.
*   **Floating ETA Badge:** OverlayView component displays ETA minutes directly above the vehicle marker.
*   **Bottom Sheet UI:** Rounded card with trip details (ETA, distance, pickup/dropoff addresses) slides up from bottom.
*   **Live Status Indicator:** Green pulsing dot with "LIVE" label when mover is sharing location.
*   **Light Map Styling:** Custom Google Maps styles for clean, minimal appearance.

### Mover Job Decline Feature
*   **Decline Button:** Movers can now decline job offers from their dashboard.
*   **API Endpoint:** `POST /api/bookings/:id/decline` marks job notification as declined.
*   **Prevents Re-acceptance:** Declined jobs no longer appear in available jobs list.

### Improved Proximity & Mover Selection
*   **Accurate Driving Distances:** Browse Movers page now uses Google Maps Distance Matrix API for real driving distances (not straight-line). Implemented batch API call (`getBatchDrivingDistances`) for efficiency.
*   **Driving Time Display:** Movers now show "X km · Y min drive" format for accurate ETAs.
*   **Pre-Selected Mover UI:** RequestMove page now displays a card showing the customer's selected mover (name, rating, vehicle type, completed moves) with option to change or remove selection.
*   **Direct Mover Assignment:** When customer selects a mover from Browse Movers, that mover is directly assigned after payment (no proximity matching).

### Performance Optimizations
*   **Gzip/Brotli Compression:** Added compression middleware to reduce API response sizes by 60-80%.
*   **Lazy Loading:** All non-critical routes use React.lazy() for code splitting (already implemented).
*   **Preconnect Hints:** Added preconnect for Google Maps and Stripe domains to reduce DNS/TLS latency.
*   **React Query Caching:** Configured with `staleTime: Infinity` and 10-minute garbage collection for optimal caching.
*   **Upload Caching:** Static uploads cached for 1 year with `max-age=31536000`.