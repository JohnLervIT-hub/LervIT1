# LervIT - Smart Moving Platform

## Overview
LervIT is a mobile-first web application designed as a two-sided marketplace connecting customers with freelance movers in Calgary. Its primary goal is to simplify the moving process through features like real-time messaging, booking management, administrative tools, and comprehensive support. The platform emphasizes trust, transparent pricing, and intuitive user experiences, with an ambitious vision to evolve into an intelligent, Uber-style location-based service that matches customers with nearby movers using proximity and dynamic pricing algorithms.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first design using shadcn/ui components, ensuring a consistent and responsive user experience. It includes role-based navigation, protected routes, transparent pricing breakdowns, and an intuitive booking flow. A comprehensive typography system, responsive layouts, and various accessibility improvements (e.g., `ErrorBoundary`, `FormFieldError`, `aria-labels` for icon buttons) have been implemented. A premium admin portal features investor-ready styling with gradient headers and colorful stat cards. User experience is enhanced with a `DashboardSkeleton` component, sticky mobile progress bar, currency formatting utility, dark mode toggle, mobile bottom tab navigation, and Framer Motion-powered micro-animations for page transitions.

### Technical Implementations
*   **Frontend:** React 18+ (TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS).
*   **Backend:** Express.js (Node.js, TypeScript, ESM) with RESTful API, Zod for validation, and custom SHA-256 hashing.
*   **Data Storage:** PostgreSQL (Neon serverless) with Drizzle ORM.
*   **Monorepo Structure:** A `/shared` directory for centralized schema and types, ensuring end-to-end TypeScript type safety.
*   **Production Observability:** Pino-based structured JSON logging (`server/logger.ts`) with event-specific loggers for payments, vehicle matching, cleanup, and errors.
*   **Background Jobs:** node-cron scheduler (`server/background-jobs.ts`) running every 5 minutes to expire stale notifications and payment-failed bookings.
*   **Payment Security:** Stripe webhook signature verification when `STRIPE_WEBHOOK_SECRET` is configured; idempotency checks prevent duplicate processing.

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
*   **Email Notification System:** Comprehensive email templates for various updates.
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
```