# LervIT - Smart Moving Platform

## Overview

LervIT is a mobile-first web application designed as a two-sided marketplace connecting customers with freelance movers in Calgary. Its primary goal is to simplify the moving process through features like real-time messaging, booking management, administrative tools, and comprehensive support. The platform emphasizes trust, transparent pricing, and intuitive user experiences, with an ambitious vision to evolve into an intelligent, Uber-style location-based service that matches customers with nearby movers using proximity and dynamic pricing algorithms.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first design using shadcn/ui (Radix UI-based) components, ensuring a consistent and responsive user experience. It includes role-based navigation, protected routes, transparent pricing breakdowns for customers, and an intuitive booking flow. Typography system and responsive layout improvements are applied across the platform, including proper heading hierarchy, custom tracking classes, and consistent spacing across breakpoints.

### Technical Implementations
*   **Frontend:** Built with React 18+ (TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS) for a modern and performant user interface. Authentication state is managed via AuthContext, and server state with React Query.
*   **Backend:** Utilizes Express.js (Node.js, TypeScript, ESM) with a RESTful API design, Zod for validation, and custom SHA-256 hashing for authentication.
*   **Data Storage:** PostgreSQL (Neon serverless) with Drizzle ORM for type-safe queries and migrations. Key schemas include `users`, `movers`, `bookings`, `messages`, `reviews`, `jobNotifications`, `supportTickets`, and `verificationItems`.
*   **Monorepo Structure:** A `/shared` directory centralizes schema and types, ensuring end-to-end TypeScript type safety with Drizzle Zod integration.

### Feature Specifications
*   **Uber-Style Proximity Matching:** Employs a geocoding system (Google Maps Distance Matrix API integration with Haversine fallback), a 7-component dynamic pricing model, and a matching algorithm that ranks the top 5 nearest available movers within a 15-50km radius. A `jobNotifications` system handles invitations with a 10-minute expiration, protected by atomic updates and 5-layer validation for job acceptance. The ProximityDemo page visualizes mover locations and matching results with interactive Google Maps. The booking form uses Google Maps Autocomplete for precise location capture.
*   **Enhanced Mover Display:** The MoverCard component provides comprehensive mover information including name, verified badge, star ratings, trip counts, vehicle information, distance, ETA calculations, and estimated pricing, consistent with the ProximityDemo design.
*   **AI-Powered Features:**
    *   **AI Auto-Quote Predictor:** Provides instant price estimate ranges with confidence levels and natural language explanations.
    *   **AI Price Breakdown Explainer:** Offers natural language explanations for pricing components.
    *   **AI Multi-Photo Item Detection (Enhanced):** Analyzes up to 10 photos simultaneously using OpenAI Vision API with intelligent duplicate detection to combine quantities of similar items. DetectedItemsList component allows real-time editable quantities, live calculation updates (cubic feet, weight, movers needed, vehicle type), and auto-fills booking form fields. A comprehensive `Standard Weight Database` provides accurate weight, volume, and difficulty for items, used for lookup and interactive suggestions when AI confidence is low. Booking records persist complete item inventory. A mock fallback system is in place for when the OpenAI API is unavailable.
*   **Image Upload:** Supports frontend drag-and-drop with validation and Multer-based API handling for secure storage.
*   **Role-Specific User Experience:** Implements `ProtectedRoute` for access control, dynamic navigation, and protected login/signup redirects based on user roles.
*   **Customer Support System:** Features a ticketing system with FAQ, contact forms, and an admin dashboard.
*   **Payment Processing:** Integrated with Stripe for secure payment intent creation, status tracking, webhook handling, and CAD currency support.
*   **Email Notification System:** Comprehensive email templates for booking confirmations, job assignments, payment receipts, and status updates.
*   **Mover Earnings Dashboard:** Provides movers with a detailed overview of their earnings.
*   **Real-Time Vehicle Tracking:** Allows movers to share their location for customer tracking on Google Maps.
*   **Mover Profile Management:** Movers can manage their profile, including photos, bio, and vehicle details.
*   **Driver Verification & Compliance System:** A `verificationItems` table tracks 7 types of verification with blocking logic to prevent unverified movers from going online.
*   **Admin Verification Review Dashboard:** An admin interface for reviewing and managing driver verification documents.
*   **Report Mover Safety Feature:** Customers can report movers for issues, generating high-priority support tickets.

## External Dependencies

*   **Payment Processing:** Stripe (`@stripe/stripe-js`, `@stripe/react-stripe-js`)
*   **Database Provider:** Neon Database (PostgreSQL serverless) via `@neondatabase/serverless`
*   **UI Component Libraries:** Radix UI, Class Variance Authority (CVA)
*   **Form Management:** React Hook Form, Hookform Resolvers, Zod
*   **Date Handling:** date-fns, react-day-picker
*   **Session Management:** connect-pg-simple (PostgreSQL session store)
*   **File Upload:** Multer
*   **AI Integration:** OpenAI API (with free mock fallback)
*   **Maps:** Google Maps JavaScript API via @react-google-maps/api library