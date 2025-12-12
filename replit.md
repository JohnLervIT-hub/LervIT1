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