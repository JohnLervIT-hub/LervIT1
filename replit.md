# LervIT - Smart Moving Platform

## Overview

LervIT is a mobile-first web application designed as a two-sided marketplace connecting customers with freelance movers in Calgary. Its primary goal is to simplify the moving process through features like real-time messaging, booking management, administrative tools, and comprehensive support. The platform emphasizes trust, transparent pricing, and intuitive user experiences, with an ambitious vision to evolve into an intelligent, Uber-style location-based service that matches customers with nearby movers using proximity and dynamic pricing algorithms.

## Recent Changes

### Live Pricing Calculator for Booking Form (November 24, 2025)
Implemented real-time pricing calculator that shows customers the exact price BEFORE finding movers:

**Key Features:**
- **Live Price Updates:** Pricing recalculates automatically as users fill out the booking form (pickup/dropoff addresses, load size, difficulty, heavy items, number of movers)
- **7-Component Breakdown:** Displays all pricing components (base fee, distance, load size, pickup difficulty, dropoff difficulty, heavy items, mover travel fee) with real-time totals
- **Responsive Design:** Right sidebar on desktop (sticky), visible below form on mobile
- **Loading States:** Shows skeleton/loading UI while geocoding distance calculation is in progress
- **Error Handling:** Gracefully handles geocoding failures with fallback to estimated distance
- **Transparency:** Clear messaging that final price is confirmed after mover assignment, with note about potential mover travel fee variations

**Implementation:**
- Created `PricingSummary` component in `client/src/components/PricingSummary.tsx`
- Added live pricing calculation via useEffect hooks in `RequestMove.tsx` that trigger on form field changes
- Integrated Google Maps Geocoding API for accurate distance calculation before pricing
- Uses existing `calculatePrice()` function from `shared/pricing.ts` for consistency
- Displays subtotal before 2-movers multiplier (×1.30), then final total in CAD

**UX Benefits:**
- Customers see pricing upfront before committing to find movers
- Builds trust through transparent, itemized pricing breakdown
- Reduces surprises and improves booking conversion
- Educational - helps customers understand how pricing components work

### Volume-Based Load Size Categorization with Strict AI Rules (November 24, 2025)
Implemented comprehensive volume-based load size system with AI auto-detection, strict categorization enforcement, and visual examples:

**Load Size Categories:**
- **Boxes (1-10 ft³):** Small personal items - shoes, bags, boxes, lamps, monitors - No fee
- **Medium (11-50 ft³):** Small furniture - chairs, small tables, TVs, bookshelves - $15 fee
- **Large (50-150 ft³):** Large furniture - sofas, beds, fridges, dressers - $30 fee
- **Apartment (150+ ft³):** Full room furniture or multiple large items - $45 fee

**Strict AI Categorization Rules:**
To prevent misclassification (e.g., sofas being categorized as "Medium"), implemented mandatory categorization lists that CANNOT be overridden:
- **MUST be "large":** All sofas, couches, sectionals, loveseats, futons, beds, mattresses, bed frames, refrigerators, freezers, washers, dryers, dishwashers, dressers, wardrobes, armoires, bookcases, bookshelves, treadmills, ellipticals, exercise equipment
- **MUST be "apartment":** Bedroom sets, living room sets, dining room sets, full room furniture
- **MUST be "boxes":** Shoes, bags, backpacks, suitcases, luggage, boxes, lamps, monitors, keyboards, books, toys, pillows, cushions

**Implementation Details:**
- Updated Zod schema in `shared/schema.ts` to validate new load size categories
- Created strict item categorization lists in `server/routes.ts` with 3-tier priority system
- Enhanced AI photo analysis (both OpenAI Vision and mock fallback) with mandatory categorization enforcement
- Added validation layer after OpenAI response to auto-correct any misclassifications (logs corrections to console)
- Updated pricing logic in `shared/pricing.ts` with new tiered load fees
- Redesigned `LoadSizeSelector` component with visual examples, volume ranges, and fee displays
- Added AI recommendation badges and validation warnings when user selects smaller size than detected
- Implemented load size comparison logic to alert users about potential mismatches

**AI Validation System:**
- Mock fallback: Priority-based strict matching (apartment → large → boxes → file size analysis)
- OpenAI Vision: Enhanced prompt with explicit "STRICT MANDATORY CATEGORIZATION RULES" section
- Post-processing: Validates OpenAI response against strict lists and auto-corrects violations with console logging

**UI Enhancements:**
- Each load size card displays: volume range, description, 5 specific examples, and pricing
- "AI Suggested" badge appears on AI-recommended category
- Warning alert displays when user selects smaller load size than AI recommendation
- Mobile-responsive grid layout (1 column mobile, 2 columns tablet, 4 columns desktop)

### Typography & Layout Optimizations (November 24, 2025)
Implemented comprehensive typography system and responsive layout improvements across the platform:

**Typography System (index.css):**
- Established proper heading hierarchy matching design guidelines: h1 (2.5rem mobile → 4rem desktop), h2 (1.75rem mobile → 2.5rem desktop), h3-h6 with proper scaling
- Created bespoke helper classes for special tracking needs: `.tracking-tight-headings`, `.tracking-tight`, `.tracking-normal-text`
- Removed problematic utility class overrides (e.g., `.text-lg`, `.text-xl`) to prevent shadcn component conflicts
- Used proper responsive media queries for typography scaling

**Optimized Pages:**
- **LifecycleDemo.tsx (Customer Demo):** Enhanced mobile responsiveness with improved padding (pt-20 px-4 pb-8 md:pt-24 md:px-6 lg:px-8 md:pb-12), better visual hierarchy for header and stats cards, optimized pricing breakdown section
- **MoverLifecycleDemo.tsx (Mover Demo):** Improved stats cards with responsive sizing, enhanced header with scalable icon (w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12), better progress indicators
- **Home.tsx:** Better section spacing (py-12 md:py-16 lg:py-20), enhanced feature cards and "How It Works" section with proper responsive breakpoints

**Responsive Design Patterns:**
- Mobile-first approach with three key breakpoints: default (320px+), md (768px+), lg (1024px+)
- Consistent gap spacing that scales with viewport: gap-4 md:gap-5 lg:gap-6
- Cards use responsive padding: p-5 md:p-6
- Icons scale appropriately across breakpoints

### Technical Debt & Future Improvements
- **Google Maps API Deprecation:** Console warnings indicate deprecated APIs in use. Future work should migrate to new APIs:
  - Replace `google.maps.places.PlacesService` with `google.maps.places.Place`
  - Replace `google.maps.Marker` with `google.maps.marker.AdvancedMarkerElement`
  - Migration guide: https://developers.google.com/maps/documentation/javascript/places-migration-overview
- **Additional Pages for Optimization:** Apply same typography/layout patterns to BrowseMovers, RequestMove, MyBookings, and MoverDashboard for consistency

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
*   **Uber-Style Proximity Matching:** Employs a geocoding system (with Google Maps Distance Matrix API integration and Haversine fallback), a 7-component dynamic pricing model, and a matching algorithm that ranks the top 5 nearest available movers within a 15-50km radius. A `jobNotifications` system handles invitations with a 10-minute expiration, protected by atomic updates and 5-layer validation for job acceptance. The ProximityDemo page demonstrates this with real Google Maps integration using interactive markers, polylines, and InfoWindows to visualize mover locations and matching results. The booking form uses Google Maps Autocomplete for pickup/dropoff locations, with auto-centering map functionality that extracts precise lat/lng coordinates from place details for accurate marker placement. Demo movers feature realistic Calgary quadrant locations (NE, NW, SE, SW, Downtown) with comprehensive profiles including verification status, ratings (out of 5), trip counts, vehicle details (make/model and type), distance calculations, ETA estimates (~2.2 min per km), travel fees, and total earnings with 10-minute expiration timers.
*   **Enhanced Mover Display:** The MoverCard component provides comprehensive mover information across the platform (Browse Movers page, search results, and booking flow). Each card displays: mover name with prominent 🛡️ Verified badge for verified movers, star ratings with trip counts, vehicle information (🚐 Vehicle: type/make/model), location distance (📍 km away), ETA calculations based on Calgary traffic patterns (~2.2 min per km), and estimated pricing. The layout matches the ProximityDemo design for consistency, with clear visual hierarchy and responsive mobile-first design.
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