# LervIT - Smart Moving Platform

## Overview

LervIT is a mobile-first web application designed as a two-sided marketplace connecting customers with freelance movers in Calgary. Its primary goal is to simplify the moving process through features like real-time messaging, booking management, administrative tools, and comprehensive support. The platform emphasizes trust, transparent pricing, and intuitive user experiences, with an ambitious vision to evolve into an intelligent, Uber-style location-based service that matches customers with nearby movers using proximity and dynamic pricing algorithms.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first design using shadcn/ui (Radix UI-based) components, ensuring a consistent and responsive user experience. It includes role-based navigation, protected routes, transparent pricing breakdowns for customers, and an intuitive booking flow. A comprehensive typography system and responsive layout improvements have been implemented across the platform for enhanced visual consistency and user experience.

**Premium Admin Portal:** The admin dashboard features investor-ready premium styling with gradient headers, colorful stat cards, and polished visual hierarchy. Key features include:
- **AdminNav:** Gradient blue/indigo navigation bar with shield icon branding and active state highlighting
- **AdminDashboard:** Gradient stat cards for users, movers, completed moves, and revenue with hover effects
- **AdminVerificationDashboard:** Blue gradient header with stats (Total Drivers, Approved, Pending, Needs Attention)
- **AdminSupportDashboard:** Purple gradient header with ticket stats (Total, Open, In Progress, Resolved)

**UX/Accessibility Improvements:**
- **DashboardSkeleton Component:** Reusable loading skeleton with stat cards, booking cards, and CTA pills for consistent loading states across Customer, Mover, and Admin dashboards
- **ErrorBoundary Component:** Graceful error handling with fallback UI, "Try Again" and "Go Home" buttons, and development-mode error details
- **FormFieldError Component:** Accessible inline form validation with proper aria-describedby linking, aria-live="polite" for screen readers, and role="alert" for error announcements
- **Sticky Mobile Progress Bar:** Booking flow (RequestMove) shows a fixed progress indicator on mobile devices with step count and progress bar
- **Icon Button Accessibility:** All icon-only buttons now include aria-labels for screen reader support (Header, MoverDashboard, TrackTrip, LandingPage, AdminSupportDashboard, CustomerProfile, ImageUpload)
- **Currency Formatting Utility:** `client/src/lib/currency.ts` provides formatCurrency(), formatCurrencyCompact(), formatCurrencyWhole() for global scalability with multi-currency support (CAD, USD, EUR, GBP)
- **Dark Mode Toggle:** ThemeProvider context (`client/src/contexts/ThemeContext.tsx`) with light/dark/system options. ThemeToggle component in Header enables user preference switching with localStorage persistence and system preference detection.
- **Mobile Bottom Tab Navigation:** Role-based bottom navigation (`client/src/components/MobileBottomNav.tsx`) for Customer, Mover, and Admin dashboards. Shows on mobile devices only with proper active state detection including query parameters.
- **Micro-animations:** Framer Motion-powered page transitions and animation utilities (`client/src/components/PageTransition.tsx`) including FadeIn, StaggerChildren, StaggerItem, SlideIn, ScaleIn, and PulseOnHover. Applied to router for page transitions and feature cards on Home page.

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
    *   **AI Product Identifier:** Complete pipeline using OpenAI Vision API + SerpAPI for real-world product identification and specification lookup. Identifies items from photos, retrieves dimensions/weight from internet sources, categorizes into Lervit system (Furniture, Appliance, Fragile, Oversized, Bulky, Electronics), and outputs structured JSON with 9 fields (item_name, category, weight_kg, dimensions_LWH_cm, volume_cuft, handling_complexity, vehicle_type, recommended_movers, insurance_level). Supports multi-item photo upload with separate classifications. Backend service (`server/ai-identifier.ts`) handles Vision API calls, SerpAPI searches, GPT-based estimation fallback, and automatic categorization. Frontend component (`IdentifiedItemsList.tsx`) displays results with aggregate recommendations.
    *   **AI Support Copilot:** GPT-4o-powered support ticket analysis in Admin Support Dashboard. Analyzes ticket content to provide: summary, category classification, priority recommendation, root cause analysis, actionable recommendations, and a suggested response. Features include confidence scoring, 1-hour result caching to control API costs, one-click "Use This" to populate reply textarea, and copy-to-clipboard for suggested responses. Backend service (`server/ai-support-analyzer.ts`) uses structured JSON output with graceful fallback when API key is missing. Results stored in `ai_support_insights` table.
*   **Image Upload:** Supports frontend drag-and-drop with validation and Multer-based API handling. Photo upload is **mandatory** in Step 2, positioned below load size selector. Customers must upload at least one photo before proceeding.
*   **Role-Specific User Experience:** Implements `ProtectedRoute` for access control, dynamic navigation, and protected login/signup redirects based on user roles.
*   **Customer Support System:** Features a ticketing system with FAQ, contact forms, and an admin dashboard.
*   **Payment Processing:** Integrated with Stripe for secure payment intent creation, status tracking, webhook handling, and CAD currency support. Includes **Saved Card Feature** allowing customers to save payment methods to their profile for faster checkout. Customers can add new cards, set a default card, and delete saved cards via the CustomerProfile page. Backend uses Stripe Setup Intents for secure card tokenization and Stripe Customer objects for card management. The `stripeCustomerId` field on users table links to the Stripe customer.
*   **Email Notification System:** Comprehensive email templates for booking confirmations, job assignments, payment receipts, and status updates.
*   **Mover Earnings Dashboard:** Provides movers with a detailed overview of their earnings.
*   **Uber-Style Mover Payout System:** Full Stripe Connect integration for mover payouts. Movers onboard via Stripe Express accounts, platform collects customer payments and deducts 15% commission, remaining 85% is tracked in `mover_earnings` table and transferred to mover bank accounts. Features include:
    *   **Stripe Connect Onboarding:** Movers can set up payout accounts via `/api/movers/payouts/onboarding-link`
    *   **Commission Persistence:** Booking completion stores `platformFeePercent`, `platformFeeAmount`, and `moverNetAmount` on bookings for audit trail
    *   **Earnings Tracking:** `mover_earnings` table records each job's gross amount, platform fee, and net payout
    *   **Payout Center UI:** New "Payouts" tab in Mover Dashboard (`MoverPayoutCenter.tsx`) shows account status, earnings overview, and history
    *   **Database Schema:** Three new tables: `mover_stripe_accounts`, `mover_earnings`, `mover_payouts`
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

## Security Notes

*   **Session-Based Authentication:** Uses express-session with connect-pg-simple PostgreSQL store. Sessions are regenerated on login/signup to prevent session fixation attacks. Cookies are HTTP-only with secure settings.
*   **Account Lockout Protection:** After 4 consecutive failed login attempts, accounts are automatically locked for 30 minutes. The login page displays remaining attempts warnings (when ≤2 attempts left) and clear lockout messages with time remaining. Admins can manually lock/unlock accounts via `/api/admin/users/:id/lock` and `/api/admin/users/:id/unlock` endpoints. Database tracks `failedLoginAttempts`, `lockedUntil`, `lockedByAdmin`, and `lockReason` fields on users table.
*   **API Key Protection:** OpenAI and SerpAPI services fail gracefully when keys are missing, returning fallback values instead of crashing.

## Known Technical Debt

*   **Google Maps PlacesService Deprecation:** Browser console shows warning about migrating from `google.maps.places.PlacesService` to `google.maps.places.Place`. The current implementation works but should be updated before March 2026 deprecation deadline.
*   **Email Sender Domain:** Using `support@lervit.com` via Resend. Ensure the domain is verified in Resend dashboard for emails to deliver.