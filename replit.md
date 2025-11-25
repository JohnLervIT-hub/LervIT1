# LervIT - Smart Moving Platform

## Overview

LervIT is a mobile-first web application designed as a two-sided marketplace connecting customers with freelance movers in Calgary. Its primary goal is to simplify the moving process through features like real-time messaging, booking management, administrative tools, and comprehensive support. The platform emphasizes trust, transparent pricing, and intuitive user experiences, with an ambitious vision to evolve into an intelligent, Uber-style location-based service that matches customers with nearby movers using proximity and dynamic pricing algorithms.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first design using shadcn/ui (Radix UI-based) components, ensuring a consistent and responsive user experience. It includes role-based navigation, protected routes, transparent pricing breakdowns for customers, and an intuitive booking flow. A comprehensive typography system and responsive layout improvements have been implemented across the platform for enhanced visual consistency and user experience.

### Technical Implementations
*   **Frontend:** Built with React 18+ (TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS). Authentication state is managed via AuthContext, and server state with React Query.
*   **Backend:** Utilizes Express.js (Node.js, TypeScript, ESM) with a RESTful API design, Zod for validation, and custom SHA-256 hashing for authentication.
*   **Data Storage:** PostgreSQL (Neon serverless) with Drizzle ORM for type-safe queries and migrations. Key schemas include `users`, `movers`, `bookings`, `messages`, `reviews`, `jobNotifications`, `supportTickets`, and `verificationItems`.
*   **Monorepo Structure:** A `/shared` directory centralizes schema and types, ensuring end-to-end TypeScript type safety with Drizzle Zod integration.

### Feature Specifications
*   **Uber-Style Proximity Matching:** Employs a geocoding system (with Google Maps Distance Matrix API integration and Haversine fallback), a 7-component dynamic pricing model, and a matching algorithm that ranks the top 5 nearest available movers within a 15-50km radius. A `jobNotifications` system handles invitations with a 10-minute expiration, protected by atomic updates and 5-layer validation for job acceptance. A ProximityDemo page visualizes mover locations and matching results. The booking form uses Google Maps Autocomplete for pickup/dropoff locations. A live pricing calculator provides real-time cost updates.
*   **Enhanced Mover Display:** The MoverCard component provides comprehensive mover information, including verification status, ratings, trip counts, vehicle details, distance calculations, ETA estimates, and estimated pricing.
*   **Booking Flow Optimization:**
    *   **Step 1:** Locations (pickup/dropoff addresses with difficulty selection)
    *   **Step 2:** Load Details (load size selector at top, followed by **mandatory** photo upload, heavy items toggle, and mover count selection)
    *   **Step 3:** Schedule & Details (date/time selection and optional description)
*   **AI-Powered Features:**
    *   **AI Auto-Quote Predictor:** Provides instant price estimate ranges with confidence levels and natural language explanations.
    *   **AI Price Breakdown Explainer:** Offers natural language explanations for pricing components.
    *   **AI Item Detection from Photo (ARCHIVED):** Archived for future development. Previously used OpenAI Vision API for auto-filling load details from photos. Code preserved in comments for restoration.
*   **Image Upload:** Supports frontend drag-and-drop with validation and Multer-based API handling. Photo upload is **mandatory** in Step 2, positioned below load size selector. Customers must upload at least one photo before proceeding.
*   **Role-Specific User Experience:** Implements `ProtectedRoute` for access control, dynamic navigation, and protected login/signup redirects based on user roles.
*   **Customer Support System:** Features a ticketing system with FAQ, contact forms, and an admin dashboard.
*   **Payment Processing:** Integrated with Stripe for secure payment intent creation, status tracking, webhook handling, and CAD currency support.
*   **Email Notification System:** Comprehensive email templates for booking confirmations, job assignments, payment receipts, and status updates.
*   **Mover Earnings Dashboard:** Provides movers with a detailed overview of their earnings.
*   **Real-Time Vehicle Tracking:** Allows movers to share their location, which customers can track live on Google Maps.
*   **Mover Profile Management:** Movers can manage their profile, including photos, bio, vehicle details, with robust validation and authentication.
*   **Driver Verification & Compliance System:** A `verificationItems` table tracks 7 types of verification with statuses and expiry dates, implementing blocking logic until all required verifications are approved.
*   **Admin Verification Review Dashboard:** An admin interface for reviewing and managing driver verification documents.
*   **Report Mover Safety Feature:** Customers can report movers for issues, generating high-priority support tickets.

## External Dependencies

*   **Payment Processing:** Stripe (`@stripe/stripe-js`, `@stripe/react-stripe-js`)
*   **Database Provider:** Neon Database (PostgreSQL serverless)
*   **UI Component Libraries:** Radix UI, Class Variance Authority (CVA)
*   **Form Management:** React Hook Form, Hookform Resolvers, Zod
*   **Date Handling:** date-fns, react-day-picker
*   **Session Management:** connect-pg-simple (PostgreSQL session store)
*   **File Upload:** Multer
*   **AI Integration:** OpenAI API
*   **Maps:** Google Maps JavaScript API via @react-google-maps/api library