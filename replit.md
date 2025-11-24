# LervIT - Smart Moving Platform

## Overview

LervIT is a mobile-first web application designed as a two-sided marketplace connecting customers with freelance movers in Calgary. Its primary goal is to simplify the moving process through features like real-time messaging, booking management, administrative tools, and comprehensive support. The platform emphasizes trust, transparent pricing, and intuitive user experiences, with an ambitious vision to evolve into an intelligent, Uber-style location-based service that matches customers with nearby movers using proximity and dynamic pricing algorithms.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first design using shadcn/ui (Radix UI-based) components, ensuring a consistent and responsive user experience. It includes role-based navigation, protected routes, transparent pricing breakdowns for customers, and an intuitive booking flow.

### Technical Implementations
*   **Frontend:** Built with React 18+ (TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS) for a modern and performant user interface. Authentication state is managed via AuthContext, and server state with React Query.
*   **Backend:** Utilizes Express.js (Node.js, TypeScript, ESM) with a RESTful API design, Zod for validation, and custom SHA-256 hashing for authentication.
*   **Data Storage:** PostgreSQL (Neon serverless) with Drizzle ORM for type-safe queries and migrations. Key schemas include `users`, `movers`, `bookings`, `messages`, `reviews`, `jobNotifications`, `supportTickets`, and `verificationItems`.
*   **Monorepo Structure:** A `/shared` directory centralizes schema and types, ensuring end-to-end TypeScript type safety with Drizzle Zod integration.

### Feature Specifications
*   **Uber-Style Proximity Matching:** Employs a geocoding system (with Google Maps Distance Matrix API integration and Haversine fallback), a 7-component dynamic pricing model, and a matching algorithm that ranks the top 5 nearest available movers within a 15-50km radius. A `jobNotifications` system handles invitations with a 10-minute expiration, protected by atomic updates and 5-layer validation for job acceptance.
*   **AI-Powered Features:**
    *   **AI Auto-Quote Predictor:** Provides instant price estimate ranges with confidence levels and natural language explanations.
    *   **AI Price Breakdown Explainer:** Offers natural language explanations for pricing components.
    *   **AI Item Detection from Photo (Optimized):** Uses OpenAI Vision API with enhanced prompts to provide specific, detailed item descriptions (e.g., "Queen-size bed", "Leather sofa", "Running shoes", "Suitcase") instead of generic classifications. Auto-fills load size, heavy item estimates, number of movers, weight detection, and vehicle recommendations. Mock fallback includes 30+ item types with intelligent classification based on file size and filename patterns.
*   **Image Upload:** Supports frontend drag-and-drop with validation and Multer-based API handling for secure storage.
*   **Role-Specific User Experience:** Implements `ProtectedRoute` for access control, dynamic navigation, and protected login/signup redirects based on user roles.
*   **Customer Support System:** Features a ticketing system with FAQ, contact forms, and an admin dashboard, utilizing `supportTickets` and `supportTicketReplies` tables.
*   **Payment Processing:** Integrated with Stripe for secure payment intent creation, status tracking, webhook handling, and CAD currency support.
*   **Email Notification System:** Comprehensive email templates for booking confirmations, job assignments, payment receipts, and status updates, designed for integration with services like SendGrid/Resend.
*   **Mover Earnings Dashboard:** Provides movers with a detailed overview of their earnings, including total, pending, and completed jobs, with monthly breakdowns.
*   **Real-Time Vehicle Tracking:** Allows movers to share their location, which customers can track live on Google Maps with markers for pickup, dropoff, and the mover's current position.
*   **Mover Profile Management:** Movers can manage their profile, including photos, bio, vehicle details (type, color, license plate), with robust validation and authentication.
*   **Driver Verification & Compliance System:** A `verificationItems` table tracks 7 types of verification (e.g., Government ID, Driver's License, Vehicle Registration) with statuses and expiry dates. A blocking logic prevents movers from going online until all required verifications are approved.
*   **Admin Verification Review Dashboard:** An admin interface for reviewing and managing driver verification documents, with features for searching, filtering, approving/rejecting items, and providing rejection comments.
*   **Report Mover Safety Feature:** Customers can report movers for issues, generating high-priority support tickets, with confirmation dialogs and security validations.

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