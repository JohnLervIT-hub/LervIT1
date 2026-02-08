# 09 — UX Flow Summary

**Version:** 1.0  
**Date:** February 8, 2026

---

## Navigation Map

### Public Routes (No Authentication Required)

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Landing page with hero section, feature highlights, CTA |
| `/website` | Landing Page | Marketing landing page |
| `/login` | Login | Email/password login with role-based redirect |
| `/signup` | Signup | Multi-step: phone OTP → profile creation |
| `/forgot-password` | Forgot Password | Email-based password reset request |
| `/reset-password` | Reset Password | Token-based password reset form |
| `/verify-email` | Email Verification | Token verification link handler |
| `/browse-movers` | Browse Movers | Public mover directory with ratings and vehicle info |

### Customer Routes (Authenticated, Role: Customer)

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Customer Dashboard | Active bookings, past moves, quick actions |
| `/request-move` | Request a Move | Multi-step booking form (4 steps) |
| `/my-bookings` | My Bookings | Detailed booking list with status and actions |
| `/payment/:bookingId` | Payment | Stripe-powered payment form |
| `/track-trip/:bookingId` | Track Trip | Live GPS map with mover location |
| `/messages/:bookingId` | Messages | In-booking chat with mover |
| `/review/:bookingId` | Review | Post-move rating and comment form |
| `/profile` | Profile | Account settings, saved cards, notification preferences |
| `/inbox` | Inbox | In-app notification center |
| `/support` | Support | FAQ, contact form, ticket history |

### Mover Routes (Authenticated, Role: Mover)

| Route | Page | Description |
|-------|------|-------------|
| `/mover-dashboard` | Mover Dashboard | Tabbed: Jobs, Active, Verification, Earnings, Payouts, Support |
| `/mover-onboarding` | Onboarding Wizard | Guided first-time setup |
| `/mover-profile` | Profile Setup | Edit bio, vehicle details, photos |
| `/mover-settings` | Settings | Notification preferences, account settings |
| `/mover-verification` | Verification | Document upload and status tracking |

### Admin Routes (Authenticated, Role: Admin)

| Route | Page | Description |
|-------|------|-------------|
| `/admin` | Admin Dashboard | Growth Dashboard with KPIs and trend charts |
| `/admin/users` | User Management | User list, role editing, lock/unlock, delete |
| `/admin/movers` | Mover Management | Mover profiles, verification status, availability |
| `/admin/moves` | Move Management | All bookings with status and pricing details |
| `/admin/revenue` | Revenue | Revenue analytics and financial overview |
| `/admin/support` | Support Dashboard | All tickets with AI analysis tools |
| `/admin/verification` | Verification Review | Pending document review and approval |
| `/admin/email-center` | Email Center | Compose and send targeted email campaigns |
| `/admin/payouts` | Payouts | Mover earnings reconciliation, batch processing |

---

## Key UI States

### Loading States
- **Page-level:** Full-page skeleton loaders for dashboard and listing pages
- **Component-level:** Skeleton cards for individual content blocks
- **Action-level:** Loading overlays for form submissions and mutations
- **Splash Screen:** Brand splash on initial app load

### Error States
- **Network error:** Toast notification with retry option
- **Validation error:** Inline field-level error messages (react-hook-form + Zod)
- **404 Not Found:** Custom not-found page with navigation back
- **Auth error:** Redirect to login page with return URL

### Success States
- **Toast notifications:** Brief success messages for completed actions
- **Status badges:** Color-coded badges on booking cards reflecting current state
- **Completion celebrations:** Review prompt after successful move completion

---

## Screen-by-Screen Flows

### Customer Booking Flow

```
Home (/) 
  → "Book a Move" CTA
  → Request Move (/request-move)

Step 1: Locations
  - Pickup address input (Google Places autocomplete)
  - Dropoff address input (Google Places autocomplete)
  - Distance calculated and displayed
  → "Next" button

Step 2: Load Details
  - Load size selector (Boxes / Medium / Large / Apartment)
  - Pickup access (Ground / Basement / Stairs / Elevator)
  - Dropoff access (Ground / Basement / Stairs / Elevator)
  - Number of movers (1 or 2)
  - Photo upload (drag-and-drop or tap)
  - AI-identified items list with edit/remove
  - Real-time price breakdown display
  → "Next" button

Step 3: Schedule
  - Date picker (calendar component)
  - Time preferences
  → "Next" button

Step 4: Review & Submit
  - Summary of all selections
  - Price total
  - Terms acknowledgment
  → "Confirm Booking" button
  → Redirect to Payment page

Payment (/payment/:id)
  - Stripe Elements card input
  - OR saved card selection
  - Price summary
  → "Pay Now" button
  → On success: redirect to My Bookings or Dashboard
```

### Mover Job Flow

```
Mover Dashboard (/mover-dashboard)
  → "Jobs" tab shows incoming notifications
  → WebSocket pushes new job alerts (audio chime)

Job Notification Card:
  - Pickup area (privacy-masked address)
  - Distance to pickup
  - Estimated earnings
  - 10-minute countdown timer
  - "Accept" / "Decline" buttons

On Accept:
  → Booking assigned, status: confirmed
  → "Active" tab shows the active booking
  → Status progression buttons:
    1. "Start Trip" → en_route_to_pickup (GPS tracking begins)
    2. "Arrived" → loading
    3. "Items Loaded" → en_route_to_dropoff
    4. "Arrived at Dropoff" → unloading
    5. "Move Complete" → completed
  → Earnings appear in "Earnings" tab
```

### Customer Tracking Flow

```
My Bookings (/my-bookings)
  → Active booking card with "Track" button
  → Track Trip (/track-trip/:bookingId)

Track Trip Page:
  - Full-screen Google Maps
  - Custom vehicle icon showing mover's position
  - Dark route polyline (pickup → dropoff)
  - Floating ETA badge
  - Bottom sheet with trip details:
    - Mover name, photo, vehicle
    - Pickup / dropoff addresses
    - Current status with progress steps
    - "Message Mover" button
    - "Report Issue" button
```

### Admin Dashboard Flow

```
Admin Dashboard (/admin)
  → Tabbed navigation:

Growth Tab:
  - KPI cards: Total bookings, revenue, users, conversion rate
  - 7-day booking trend line chart
  - User breakdown: customers, movers, verified, online, live GPS
  - Abandoned booking recovery rate

Users Tab → /admin/users
  - Searchable user table
  - Click to view/edit user details
  - Lock/unlock/delete actions

Movers Tab → /admin/movers
  - Mover list with verification progress
  - Vehicle details and availability status

Moves Tab → /admin/moves
  - All bookings sortable by status, date, amount
  - Click to view full booking details

Support Tab → /admin/support
  - Ticket list with priority and status filters
  - AI analysis button per ticket
  - Reply interface

Verification Tab → /admin/verification
  - Pending documents queue
  - Approve/reject with reason

Email Center Tab → /admin/email-center
  - Campaign composer
  - Audience selector
  - Send history

Payouts Tab → /admin/payouts
  - Pending earnings list
  - Batch process button
  - Manual transfer for individual bookings
```

---

## Information Visibility by Role

| Information | Customer Sees | Mover Sees | Admin Sees |
|-------------|--------------|------------|------------|
| Full pickup/dropoff address | Yes (own bookings) | Yes (assigned bookings) | Yes (all) |
| Other users' addresses | No | No (masked until accepted) | Yes |
| Booking price breakdown | Yes | Estimated earnings (85%) | Full breakdown + commission |
| Mover real name | Yes (after assignment) | N/A | Yes |
| Customer phone | No | Yes (after assignment) | Yes |
| Payment details | Own cards only | Not visible | Transaction summaries |
| Mover GPS location | During active trip | Own location | All active movers |
| Support ticket content | Own tickets | Own tickets | All tickets |
| Revenue/financial data | No | Own earnings only | Full platform analytics |

---

## Mobile-First Design Elements

- **Bottom Tab Navigation:** Fixed navigation bar on mobile for quick access to Dashboard, Bookings, Browse, Inbox, Profile
- **Sticky Progress Bars:** During booking flow, progress indicator remains visible while scrolling
- **Touch-Optimized Controls:** Large tap targets, swipe gestures, pull-to-refresh
- **Responsive Layouts:** Content adapts from mobile (stacked) to tablet/desktop (side-by-side)
- **Dark Mode:** Full theme toggle support with persistent preference
- **PWA Install Prompt:** Intelligent prompt for adding to home screen
