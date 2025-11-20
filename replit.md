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
*   **Uber-Style Proximity Matching:**
    *   **Mock Geocoding:** Internal system with Calgary locations, Haversine formula for distance, auto-geocoding, and random coordinate generation for movers.
    *   **Dynamic Pricing:** Base, distance, load, and mover travel fees, with full breakdown stored.
    *   **Proximity Matching Algorithm:** Searches movers within an initial 15km radius (expanding to 50km), ranks by distance, and notifies the 5 nearest.
    *   **Job Notification System:** `jobNotifications` table tracks invitations with 10-minute timeouts and status tracking.
    *   **API Enhancements:** `/api/bookings` now geocodes, calculates prices, finds and notifies movers. `/api/movers/:id` allows coordinate updates. Auto-creation of mover profiles with default vehicle and location.
    *   **Database Schema Updates:** `movers` table includes `latitude`/`longitude`. `bookings` table includes pickup/dropoff coordinates, price breakdown fields. New `jobNotifications` table.
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