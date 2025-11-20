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
    *   **Dynamic Pricing Engine:** `shared/pricing.ts` calculates 4-component breakdown:
        *   Base Fee: $25.00 (flat rate)
        *   Distance Fee: $1.50/km (pickup → dropoff)
        *   Load Fee: $10 (small), $25 (medium), $40 (large)
        *   Mover Travel Fee: $0.75/km for distances >5km to pickup location
    *   **Proximity Matching Algorithm:** `shared/matching.ts` searches within initial 15km radius (expanding to 50km), ranks by distance, and selects top 5 nearest available movers.
    *   **Job Notification System:** `jobNotifications` table tracks mover invitations with `distanceToPickup`, `estimatedEarnings`, `status` (pending/accepted/declined/expired), and 10-minute `expiresAt` timestamps.
    *   **Type-Safe Decimal Handling:** `shared/utils.ts` provides `toDecimalString()` utility to convert JavaScript numbers to properly formatted decimal strings, preventing floating-point precision issues.
    *   **API Enhancements:** 
        *   POST `/api/bookings`: Geocodes addresses → Calculates distance → Computes price breakdown → Finds nearest movers → Creates job notifications → Returns booking with `notifiedMovers` count
        *   PATCH `/api/movers/:id`: Allows movers to update their latitude/longitude coordinates
        *   Mover auto-creation: New mover accounts automatically receive random Calgary coordinates (lat: 50.9-51.2, lng: -114.3 to -113.9)
    *   **Database Schema Updates:**
        *   `movers`: Added `latitude`/`longitude` (doublePrecision, nullable)
        *   `bookings`: Added `pickupLatitude`, `pickupLongitude`, `dropoffLatitude`, `dropoffLongitude` (doublePrecision), `distance` (decimal), `baseFee`, `distanceFee`, `loadFee`, `moverTravelFee` (decimal, notNull), `notifiedAt` (timestamp)
        *   `jobNotifications`: New table with composite index on (bookingId, moverId, status) for efficient queries
*   **Image Upload for Bookings:**
    *   **Frontend:** `ImageUpload.tsx` with drag-and-drop, previews, client-side validation (max 10 images, 5MB each, JPG/PNG/GIF/WebP).
    *   **API:** `POST /api/upload/images` uses Multer for secure handling, unique filenames, server-side validation. Returns image URLs.
    *   **File Serving:** Express.static serves uploaded files with CORS and cache headers.
    *   **Database:** `bookings.images` column as a PostgreSQL text array storing URLs.
*   **Mover Dashboard Enhancements:** Auto-profile creation for movers, optional phone field in signup. Role-based routing. Improved UI with highlighted customer info, enhanced CTAs, empty states, tab badges, better layout, loading states, and status colors. Fixed API endpoint filtering for movers and role-based routing logic.

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