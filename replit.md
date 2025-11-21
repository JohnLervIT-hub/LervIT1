# LervIT - Smart Moving Platform

## Overview

LervIT is a mobile-first web application functioning as a two-sided marketplace connecting customers with freelance movers in Calgary. It aims to streamline the moving process by offering features such as real-time messaging, booking management, administrative tools, and a comprehensive support system. The platform prioritizes trust, transparent pricing, and intuitive user experiences, with an ambition to evolve into an intelligent, Uber-style location-based service for matching customers with nearby movers using proximity and dynamic pricing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

*   **Technology Stack:** React 18+ (TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS).
*   **Component Library:** shadcn/ui (Radix UI-based) with a custom mobile-first design.
*   **State Management:** AuthContext for authentication, React Query for server state.
*   **UI/UX:** Mobile-first component design, role-based navigation and protected routes, customer price transparency with detailed breakdowns, and an intuitive booking flow.

### Backend

*   **Server Framework:** Express.js (Node.js, TypeScript, ESM).
*   **API Design:** RESTful API with Zod validation, JSON middleware, and logging.
*   **Authentication:** Custom SHA-256 hashing, session management, Firebase UID support.
*   **Storage Layer:** Interface-based `IStorage` with in-memory (`MemStorage`) for database integration.

### Data Storage

*   **Database:** PostgreSQL (Neon serverless) with Drizzle ORM for type-safe queries and migrations.
*   **Schema:** `users`, `movers`, `bookings` (including images array), `messages`, `reviews`, `jobNotifications`, `supportTickets`, `supportTicketReplies` tables.

### System Design

*   **Monorepo Structure:** Shared schema and types in a `/shared` directory.
*   **Type Safety:** End-to-end TypeScript with Drizzle Zod integration.
*   **Uber-Style Proximity Matching:**
    *   **Geocoding:** Mock system with Calgary locations, Haversine formula, auto-geocoding, and random coordinate generation for movers.
    *   **Dynamic Pricing:** 7-component breakdown (Base, Distance, Load, Difficulty, Heavy Item, Mover Travel, 2-Movers Fee). Urgency and urgency fees are removed.
    *   **Matching Algorithm:** Searches within a 15-50km radius, ranking by distance for top 5 nearest available movers.
    *   **Job Notification System:** `jobNotifications` table tracks invitations with status, estimated earnings, and 10-minute expiration.
    *   **Race-Condition Protection:** Atomic updates and 5-layer validation for job acceptance.
    *   **API Enhancements:** Booking creation with geocoding, pricing, and mover notification; race-condition-protected job acceptance/decline; mover location updates.
*   **Image Upload:** Frontend drag-and-drop with validation, Multer-based API for secure handling and storage, `bookings.images` stores URLs.
*   **Customer Price Transparency:** Detailed 7-component price breakdown displayed to customers and movers.
*   **Role-Specific User Experience:** `ProtectedRoute` component for role-based access control, dynamic navigation components, and protected login/signup redirects.
*   **AI-Powered Features:**
    *   **AI Auto-Quote Predictor:** Instant price estimate range, confidence, and natural language explanation using deterministic geocoding.
    *   **AI Price Breakdown Explainer:** Natural language explanations for pricing components.
    *   **AI Item Detection from Photo:** Uses OpenAI Vision API to analyze furniture photos and auto-fill load size, heavy item, and number of movers.
    *   **Technical Architecture:** `shared/geocoding.ts` for deterministic geocoding, `shared/ai.ts` for AI utilities, and OpenAI API integration.
*   **Customer Support System:**
    *   **Architecture:** Ticketing system with FAQ, contact forms, and an admin dashboard.
    *   **Schema:** `supportTickets` and `supportTicketReplies` tables.
    *   **Authentication:** Lightweight Bearer token for user and admin authentication.
    *   **Frontend:** `Support.tsx` for customers (FAQ, contact form, my tickets) and `AdminSupportDashboard.tsx` for admins.
*   **Payment Processing:**
    *   **Integration:** Stripe payment processing with full frontend/backend implementation.
    *   **Features:** Payment intent creation, status tracking, webhook handling, CAD currency support.
    *   **Frontend:** Payment page with Stripe Elements, payment status badges, "Pay Now" buttons on My Bookings.
    *   **Security:** Payment verification, user authorization, prevents double payment.
*   **Email Notification System:**
    *   **Service:** `server/notifications.ts` with comprehensive email templates.
    *   **Triggers:** Booking confirmation, job assignment, mover assignment, payment receipt, status updates.
    *   **Implementation:** Console-logged for MVP demo (ready for SendGrid/Resend integration).
    *   **Templates:** HTML email templates for all booking lifecycle events.
*   **Mover Earnings Dashboard:**
    *   **Endpoint:** `GET /api/movers/:moverId/earnings` for earnings calculation.
    *   **Features:** Total earnings, pending earnings, completed jobs, monthly breakdown, recent bookings.
    *   **Frontend:** "Earnings" tab in Mover Dashboard with 3 summary cards and detailed views.
    *   **Calculation:** Earnings from completed bookings with successful payments.
*   **Real-Time Vehicle Tracking:**
    *   **Schema:** `bookings.currentLatitude`, `bookings.currentLongitude`, `bookings.locationUpdatedAt` for real-time location.
    *   **API Endpoints:** `POST /api/bookings/:bookingId/location` (mover updates), `GET /api/bookings/:bookingId/location` (fetch location).
    *   **Authorization:** Mover-only location updates, customer/mover/admin location viewing.
    *   **Frontend - Mover:** "Start Trip" button on confirmed bookings, automatic GPS sharing every 5 seconds during transit, "Sharing Location" badge.
    *   **Frontend - Customer:** "Track Trip Live" button on in-transit bookings, live Leaflet map with pickup (green), dropoff (red), mover (blue) markers.
    *   **Technical:** Polling approach (5-second intervals), browser Geolocation API, Leaflet with OpenStreetMap (free, no API key).

## External Dependencies

*   **Payment Processing:** Stripe (`@stripe/stripe-js`, `@stripe/react-stripe-js`).
*   **Database Provider:** Neon Database (PostgreSQL serverless) via `@neondatabase/serverless`.
*   **UI Component Libraries:** Radix UI, Class Variance Authority (CVA).
*   **Form Management:** React Hook Form, Hookform Resolvers, Zod.
*   **Date Handling:** date-fns, react-day-picker.
*   **Session Management:** connect-pg-simple (PostgreSQL session store).
*   **File Upload:** Multer.
*   **AI Integration:** OpenAI API.