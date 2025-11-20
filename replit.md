# MoveIt - Smart Moving Platform

## Overview

MoveIt is a two-sided marketplace platform connecting customers with freelance movers in Calgary. The application facilitates the entire moving workflow from quote requests to payment processing, featuring real-time messaging, booking management, and administrative oversight. Built as a mobile-first web application, it emphasizes trust signals, transparent pricing, and streamlined user experiences for both customers and service providers.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18+ with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for client-side routing (lightweight alternative to React Router)
- TanStack Query (React Query) for server state management and data fetching
- Tailwind CSS for utility-first styling with custom design system

**Component Library:**
- shadcn/ui components built on Radix UI primitives for accessible, customizable UI elements
- Custom design system following mobile-first principles with responsive breakpoints
- Component examples provided in `/client/src/components/examples/` for development reference

**Design System:**
- Mobile-first responsive design (320px → desktop)
- Custom Tailwind configuration with extended color palette using HSL values
- Design guidelines documented in `design_guidelines.md` emphasizing bold CTAs, trust signals, and marketplace-inspired UX
- Inter font for UI, Open Sans for body text

**State Management:**
- AuthContext for user authentication state (local storage persistence)
- React Query for server state with configured defaults (no refetch on window focus, infinite stale time)
- Component-level state using React hooks

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript running on Node.js
- Custom Vite integration for development with HMR support
- ESM modules throughout the codebase

**API Design:**
- RESTful API endpoints organized in `/server/routes.ts`
- Zod schema validation for request body validation
- JSON middleware with raw body access for webhook support (Stripe)
- Logging middleware for API request tracking

**Authentication:**
- Custom password hashing using SHA-256 with random salt generation
- Timing-safe comparison for password verification to prevent timing attacks
- User session management (storage mechanism not fully implemented in provided code)
- Support for both password-based auth and Firebase UID integration

**Storage Layer:**
- Interface-based storage pattern (`IStorage`) allowing for multiple implementations
- In-memory storage implementation (`MemStorage`) for development/testing
- Designed to be swapped with database-backed storage (Drizzle ORM ready)

### Data Storage Solutions

**Database:**
- PostgreSQL as the primary database (via Neon serverless)
- Drizzle ORM for type-safe database queries and migrations
- WebSocket connection support for Neon serverless database

**Schema Design:**
- `users` table: Core user accounts with email, password, name, phone, role (customer/mover/admin)
- `movers` table: Extended profile for movers including vehicle info, verification status, ratings, location
- `bookings` table: Move requests/bookings with pickup/dropoff addresses, load size, pricing, status tracking, **images array for uploaded photos**
- `messages` table: Chat messages between customers and movers
- `reviews` table: Customer reviews and ratings for movers

**Key Relationships:**
- One-to-one: User → Mover (via userId foreign key)
- One-to-many: User → Bookings (as customer)
- One-to-many: Mover → Bookings
- One-to-many: Booking → Messages

### External Dependencies

**Payment Processing:**
- Stripe integration for payment handling
- `@stripe/stripe-js` and `@stripe/react-stripe-js` for frontend payment UI
- Payment intent tracking via `stripePaymentIntentId` in bookings table
- Webhook support prepared (raw body parsing enabled)

**Database Provider:**
- Neon Database (PostgreSQL serverless) via `@neondatabase/serverless`
- WebSocket-based connections using `ws` package
- Connection pooling configured

**UI Component Libraries:**
- Radix UI primitives for accessible component foundations
- Multiple Radix packages for specific components (dialog, dropdown, select, toast, etc.)
- Class Variance Authority (CVA) for component variant management

**Development Tools:**
- Replit-specific plugins for development environment integration
- TypeScript with strict mode enabled
- ESBuild for production server bundling
- Drizzle Kit for database migrations

**Form Management:**
- React Hook Form with Hookform Resolvers
- Zod integration for form validation schema

**Date Handling:**
- date-fns for date formatting and manipulation
- react-day-picker for calendar UI components

**Session Management:**
- connect-pg-simple for PostgreSQL session store (configured but implementation details not fully visible)

**File Upload:**
- Multer middleware for handling multipart/form-data image uploads
- Secure file storage in `/public/uploads` directory
- Express.static serving uploaded files via `/uploads` route with CORS and cache headers
- File validation: max 5MB per image, supports JPG, PNG, GIF, WebP formats

**Utility Libraries:**
- clsx and tailwind-merge (via cn utility) for conditional class handling
- nanoid for unique ID generation
- cmdk for command palette/search interfaces

### Key Architectural Decisions

**Monorepo Structure:**
- Shared schema and types in `/shared` directory accessible to both client and server
- Path aliases configured (`@/`, `@shared/`, `@assets/`) for clean imports
- Single TypeScript configuration covering full stack

**Mobile-First Development:**
- All components designed for mobile viewports first, then enhanced for larger screens
- Touch-friendly interactions and simplified navigation patterns
- Responsive images and assets stored in `/attached_assets/generated_images/`

**Type Safety:**
- End-to-end TypeScript with strict mode
- Drizzle Zod integration for runtime validation matching database schema
- Shared types between frontend and backend

**Development Workflow:**
- Vite HMR for fast frontend development
- TSX for running TypeScript server in development
- Separate build processes for client (Vite) and server (ESBuild)

## Feature Highlights

### Image Upload for Bookings (November 2025)
**Purpose:** Allow customers to upload photos of items to be moved, helping movers provide more accurate quotes and better assess job scope.

**Implementation Details:**
- **Frontend Component:** `ImageUpload.tsx` with drag-and-drop and click-to-select functionality
  - Visual feedback during drag operations (border highlight, background tint)
  - Preview thumbnails with remove capability
  - Maximum 10 images per booking, 5MB per image
  - Client-side file type validation (JPG, PNG, GIF, WebP)
  
- **API Endpoint:** `POST /api/upload/images`
  - Multer middleware for secure file handling
  - Unique filename generation (timestamp + random suffix)
  - Server-side validation matching client restrictions
  - Returns array of image URLs for storage
  
- **File Serving:** Express.static middleware
  - Secure path handling (no directory traversal vulnerabilities)
  - CORS headers for cross-origin access
  - Long-term cache headers for performance
  
- **Database Schema:** `bookings.images` column
  - PostgreSQL text array storing image URLs
  - Schema validation accepts ISO date strings for `preferredDate` field
  
- **User Experience:**
  - Step 3 of RequestMove form includes optional image upload
  - Images displayed in both MyBookings (customer view) and MoverDashboard (mover view)
  - Grid layout: 2 columns on mobile, 4 columns on desktop
  - Aspect-square containers with rounded borders for consistent display

### Mover Dashboard Enhancements (November 2025)
**Purpose:** Improved mover interface for better readability, cleaner UX, and streamlined job management workflow.

**Implementation Details:**
- **Auto-Profile Creation:** When users sign up with `role="mover"`, backend automatically creates mover profile with default values (vehicleType: "van", location: "Calgary, AB")
- **Phone Field Added:** Signup form now includes optional phone field for better contact information collection
- **Dashboard Routing:** Header component intelligently routes users based on role (movers → /mover-dashboard, customers → /dashboard, admins → /admin)
  
**UI Improvements:**
- **Customer Information Prominence:** Highlighted section displaying customer name and email in muted background box at top of booking cards
- **Enhanced CTAs:** Primary action buttons (Accept Booking, Mark Complete) with loading states and responsive sizing (full-width on mobile, auto-width on desktop)
- **Better Empty States:** Icon-based empty states with helpful messaging and visual feedback
- **Tab Badges:** Real-time count badges on both Available Jobs and My Bookings tabs
- **Improved Layout:** Background tint for better contrast, better spacing, enhanced visual hierarchy
- **Loading States:** Spinner animation for booking data loads
- **Status Colors:** Improved badge variants for better status visibility

**Bug Fixes:**
- Fixed `/api/movers` endpoint to properly filter by `userId` query parameter, ensuring each mover sees only their own profile and bookings
- Resolved mover profile loading issues preventing dashboard access
- Fixed routing logic for role-based navigation