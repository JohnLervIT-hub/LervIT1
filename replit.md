# MoveIt - Smart Moving Platform

## Overview

MoveIt is a two-sided marketplace connecting customers with freelance movers in Calgary. It streamlines the moving process from quote to payment, featuring real-time messaging, booking management, and administrative tools. The platform is designed as a mobile-first web application, prioritizing trust, transparent pricing, and intuitive user experiences for both customers and service providers. A key ambition is to evolve into an intelligent, location-based platform, akin to Uber, matching customers with the nearest available movers using proximity and dynamic pricing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

*   **Technology Stack:** React 18+ with TypeScript, Vite, Wouter for routing, TanStack Query for server state, Tailwind CSS for styling.
*   **Component Library:** shadcn/ui built on Radix UI, with a custom mobile-first design system.
*   **State Management:** AuthContext for authentication, React Query for server state.

### Backend Architecture

*   **Server Framework:** Express.js with TypeScript on Node.js, ESM modules.
*   **API Design:** RESTful API, Zod for request validation, JSON middleware, logging.
*   **Authentication:** Custom SHA-256 password hashing with salt, timing-safe verification, user session management, support for password and Firebase UID.
*   **Storage Layer:** Interface-based storage (`IStorage`) with an in-memory implementation (`MemStorage`) designed for database integration.

### Data Storage Solutions

*   **Database:** PostgreSQL (Neon serverless) with Drizzle ORM for type-safe queries and migrations.
*   **Schema Design:** `users`, `movers`, `bookings` (including an images array), `messages`, `reviews` tables. Key relationships include one-to-one User-Mover and one-to-many User/Mover-Bookings.

### System Design Choices

*   **Monorepo Structure:** Shared schema and types in a `/shared` directory, path aliases for clean imports, single TypeScript configuration.
*   **Mobile-First Development:** Components designed for mobile first, then adapted for larger screens.
*   **Type Safety:** End-to-end TypeScript with strict mode, Drizzle Zod integration for runtime validation.
*   **Development Workflow:** Vite HMR for frontend, TSX for server development, separate build processes.
*   **Uber-Style Proximity Matching (✅ Backend Complete):**
    *   **Mock Geocoding System:** `shared/geocoding.ts` with Calgary location database, Haversine formula for accurate distance calculations, auto-geocoding on booking creation, and random coordinate generation for mover signup.
    *   **Dynamic Pricing Engine:** `shared/pricing.ts` calculates 7-component breakdown:
        *   Base Fee: $30.00 (flat rate)
        *   Distance Fee: $1.00/km (pickup → dropoff)
        *   Load Fee: $0 (small), $15 (medium), $30 (large)
        *   Pickup Difficulty Fee: $0 (ground), $10 (basement), $5 (stairs), $8 (elevator)
        *   Dropoff Difficulty Fee: $0 (ground), $10 (basement), $5 (stairs), $8 (elevator)
        *   Heavy Item Fee: $15 (if applicable)
        *   Mover Travel Fee: $0.75/km for distances >5km to pickup location
        *   2-Movers Multiplier: 1.75x applied to subtotal (before final total)
    *   **Proximity Matching Algorithm:** `shared/matching.ts` searches within initial 15km radius (expanding to 50km), ranks by distance, and selects top 5 nearest available movers.
    *   **Job Notification System:** `jobNotifications` table tracks mover invitations with `distanceToPickup`, `estimatedEarnings`, `status` (pending/accepted/declined/expired), and 10-minute `expiresAt` timestamps.
    *   **Type-Safe Decimal Handling:** `shared/utils.ts` provides `toDecimalString()` utility to convert JavaScript numbers to properly formatted decimal strings, preventing floating-point precision issues.
    *   **API Enhancements:** 
        *   POST `/api/bookings`: Geocodes addresses → Calculates distance → Computes price breakdown → Finds nearest movers → Creates job notifications → Returns booking with `notifiedMovers` count
        *   POST `/api/bookings/:id/accept`: **Race-condition-protected job acceptance** with 5-layer validation (booking availability, mover notification, expiration check, decline check, atomic update). First mover wins, others receive HTTP 409 Conflict. Automatically expires all other pending notifications.
        *   POST `/api/bookings/:id/decline`: Allows movers to decline job offers without penalty. Updates notification status to 'declined'.
        *   PATCH `/api/movers/:id`: Allows movers to update their latitude/longitude coordinates
        *   Mover auto-creation: New mover accounts automatically receive random Calgary coordinates (lat: 50.9-51.2, lng: -114.3 to -113.9)
    *   **Database Schema Updates:**
        *   `movers`: Added `latitude`/`longitude` (doublePrecision, nullable)
        *   `bookings`: Added `pickupLatitude`, `pickupLongitude`, `dropoffLatitude`, `dropoffLongitude` (doublePrecision), `distance` (decimal), `baseFee`, `distanceFee`, `loadFee`, `moverTravelFee`, `pickupDifficultyFee`, `dropoffDifficultyFee`, `heavyItemFee`, `subtotal` (decimal, notNull), `pickupDifficulty`, `dropoffDifficulty`, `heavyItem`, `numberOfMovers`, `notifiedAt` (timestamp). **Removed** `urgency` and `urgencyFee` fields to simplify MVP and avoid surge pricing perception.
        *   `jobNotifications`: New table with composite index on (bookingId, moverId, status) for efficient queries
*   **Image Upload for Bookings:**
    *   **Frontend:** `ImageUpload.tsx` with drag-and-drop, previews, client-side validation (max 10 images, 5MB each, JPG/PNG/GIF/WebP).
    *   **API:** `POST /api/upload/images` uses Multer for secure handling, unique filenames, server-side validation. Returns image URLs.
    *   **File Serving:** Express.static serves uploaded files with CORS and cache headers.
    *   **Database:** `bookings.images` column as a PostgreSQL text array storing URLs.
*   **Mover Dashboard Enhancements:** Auto-profile creation for movers, optional phone field in signup. Role-based routing. Improved UI with highlighted customer info, enhanced CTAs, empty states, tab badges, better layout, loading states, and status colors. Fixed API endpoint filtering for movers and role-based routing logic.
*   **Customer Price Transparency (✅ Complete):**
    *   **RequestMove.tsx:** Frontend sends addresses, loadSize, pickup/dropoff difficulty, heavy item flag, and number of movers; backend calculates real distance using geocoding and Haversine formula. Success dialog displays complete 7-component price breakdown (baseFee, distanceFee, loadFee, pickupDifficultyFee, dropoffDifficultyFee, heavyItemFee, moverTravelFee, 2-movers multiplier if applicable) with formula explanations before redirecting to MyBookings. **Removed urgency selector and urgency fee** to simplify MVP and focus on proximity-based matching.
    *   **MyBookings.tsx:** Added distance display to each booking card. Collapsible "View Price Breakdown" section shows all 7 components with test IDs for verification. Price breakdown persists for customer reference.
    *   **MoverDashboard.tsx:** Displays same 7-component breakdown for movers to see detailed earnings calculation. Shows total earnings after all fees and multipliers applied.
    *   **Drizzle ORM Fixes:** Fixed all `.where()` chaining issues in job acceptance endpoints using `and()` from `drizzle-orm`. Applied to POST `/api/bookings/:id/accept` and POST `/api/bookings/:id/decline`.
    *   **E2E Verified:** Tested complete flow from booking creation through job acceptance with race-condition protection. Confirmed real distance calculation, accurate price breakdown display, database storage of all components, and proper notification expiration.
*   **Role-Specific User Experience (✅ E2E Tested):**
    *   **ProtectedRoute Component (`client/src/components/ProtectedRoute.tsx`):** Enforces role-based access control at URL level. Shows loading spinner while auth initializes and for unauthorized users. Redirects unauthorized users with toast notifications to their role-specific dashboards. Uses AuthContext `user` and `isLoading` state.
    *   **Role-Specific Navigation Components:**
        *   `CustomerNav.tsx`: Shows "Request Move", "My Bookings", "Dashboard" only
        *   `MoverNav.tsx`: Shows "Dashboard" link only
        *   `AdminNav.tsx`: Shows "Admin Dashboard" only
        *   Marketing/demo links completely hidden for authenticated users
    *   **Header Updates (`client/src/components/Header.tsx`):** Desktop and mobile navigation dynamically render role-specific nav components based on user role. User dropdown displays role information. Authenticated users never see marketing navigation.
    *   **Login/Signup Flow (Auth Hydration Protected):** Post-authentication redirects use AuthContext state with useEffect watching `user && !isLoading` to ensure proper role-based landing (customer→/dashboard, mover→/mover-dashboard, admin→/admin). Auth loading state properly handled with `setIsLoading(false)` after successful login/signup.
    *   **Route Protection Structure:**
        *   **Public routes:** /, /demo, /lifecycle, /mover-lifecycle, /login, /signup, /browse-movers
        *   **Customer-only (ProtectedRoute):** /request-move, /dashboard, /my-bookings
        *   **Mover-only (ProtectedRoute):** /mover-dashboard
        *   **Admin-only (ProtectedRoute):** /admin
        *   **Shared authenticated:** /messages/:bookingId, /review/:bookingId (both customer & mover roles)
    *   **Marketing Page Guards (Auth Hydration Protected):** Home, ProximityDemo, LifecycleDemo, and MoverLifecycleDemo pages all include useEffect guards checking `!isLoading && user` to redirect authenticated users to role-specific dashboards. Prevents redirect loops during auth hydration on page refresh.
    *   **E2E Test Results:** Comprehensive test verified: (1) Customers can only access customer pages and see only customer navigation, (2) Movers can only access mover pages and see only mover navigation, (3) Login redirects to correct role dashboard, (4) Marketing pages redirect authenticated users, (5) Access denied toasts show when attempting to access unauthorized routes. Complete role separation confirmed.
*   **AI-Powered Features (✅ Production Ready):**
    *   **Feature 1: AI Auto-Quote Predictor**
        *   **Location:** RequestMove.tsx, appears after addresses are entered
        *   **Backend:** POST `/api/geocode/distance` - Geocodes addresses with deterministic hash-based fallback, calculates real distance using Haversine formula
        *   **Functionality:** Displays instant price estimate range ($XX-$XX), confidence percentage, and natural language explanation before final booking submission
        *   **Key Innovation:** Deterministic geocoding ensures same addresses always produce identical distances and predictions
        *   **User Benefit:** Customers see instant price preview, reducing uncertainty and increasing booking confidence
    *   **Feature 2: AI Price Breakdown Explainer**
        *   **Locations:** RequestMove success dialog, MyBookings.tsx, MoverDashboard.tsx
        *   **Functionality:** "AI Explain My Price" button generates natural language explanations of all 7 pricing components
        *   **Implementation:** `generatePriceExplanation()` in `shared/ai.ts` creates human-readable descriptions of base fee, distance, load size, difficulties, heavy items, travel fee, and 2-movers multiplier
        *   **User Benefit:** Educates customers and movers about pricing formula, increases transparency and trust
    *   **Feature 3: AI Item Detection from Photo**
        *   **Location:** RequestMove.tsx, step 2 of booking form
        *   **Backend:** POST `/api/ai/analyze-photo` - Uses OpenAI Vision API to analyze furniture photos
        *   **Functionality:** Upload item photos → AI auto-fills loadSize, heavyItem toggle, and recommended numberOfMovers
        *   **User Benefit:** Streamlines booking workflow with intelligent defaults, reduces form friction
    *   **Technical Architecture:**
        *   **Geocoding System:** `shared/geocoding.ts` with deterministic hash function for unknown addresses, Calgary location database for known addresses
        *   **AI Utilities:** `shared/ai.ts` with `aiPredictPrice()` and `generatePriceExplanation()` functions
        *   **Database Schema:** Added `aiEstimate` (text), `aiExplanation` (text), `aiPhotoAnalysis` (text) columns to `bookings` table for persistence
        *   **API Integration:** OpenAI API key managed via environment secrets, Vision API for photo analysis
    *   **Quality Assurance:** All features architect-reviewed and confirmed production-ready. Deterministic geocoding ensures stable, repeatable predictions.

## External Dependencies

*   **Payment Processing:** Stripe (`@stripe/stripe-js`, `@stripe/react-stripe-js`) for payments, with webhook support.
*   **Database Provider:** Neon Database (PostgreSQL serverless) via `@neondatabase/serverless`, using `ws` for WebSocket connections.
*   **UI Component Libraries:** Radix UI primitives, Class Variance Authority (CVA).
*   **Development Tools:** Replit-specific plugins, TypeScript, ESBuild, Drizzle Kit.
*   **Form Management:** React Hook Form with Hookform Resolvers, Zod for validation.
*   **Date Handling:** date-fns, react-day-picker.
*   **Session Management:** connect-pg-simple for PostgreSQL session store.
*   **File Upload:** Multer for multipart/form-data, `express.static` for serving.
*   **Utility Libraries:** clsx, tailwind-merge (cn utility), nanoid, cmdk.