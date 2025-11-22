# LervIT Design Guidelines

## Design Approach

**Hybrid Marketplace System**
Drawing inspiration from successful service marketplaces (Uber, TaskRabbit, Airbnb) while maintaining a bold, friendly, mobile-first foundation. The design prioritizes quick decision-making, trust-building, and effortless booking flows.

**Core Principles:**
- Mobile-first responsive design (320px → desktop)
- Bold visual hierarchy for CTAs and critical actions
- Friendly, approachable interfaces that reduce booking anxiety
- Trust signals throughout (verified badges, ratings, vehicle info)
- Clear status indicators for all booking states

## Typography

**Font Stack:** Inter for UI, Open Sans for body text
- **Hero/Primary Headlines:** 2.5rem (mobile) → 4rem (desktop), bold (700)
- **Section Headers:** 1.75rem (mobile) → 2.5rem (desktop), semibold (600)
- **Card Titles:** 1.25rem, semibold (600)
- **Body Text:** 1rem, regular (400), 1.6 line-height for readability
- **Small/Meta:** 0.875rem, medium (500)
- **Buttons/CTAs:** 1rem, semibold (600), uppercase tracking

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, 12, 16, 20, 24
- Micro spacing: p-2, gap-2 (8px)
- Standard spacing: p-4, m-6 (16-24px)
- Section spacing: py-12 (mobile) → py-20 (desktop)
- Container spacing: px-4 (mobile) → px-8 (desktop)

**Grid System:**
- Max container width: max-w-7xl for main content
- Form containers: max-w-2xl centered
- Dashboard: max-w-screen-xl
- Mobile: Always single column, stack vertically
- Tablet (md:): 2-column for cards/features
- Desktop (lg:): 3-column for mover grids, 2-column for forms with preview

## Component Library

### Navigation
**Header:** Fixed top navigation with logo (left), main nav (center), user menu/CTA (right)
- Mobile: Hamburger menu, prominent "Book a Move" CTA
- Include trust indicator: "500+ Movers in Calgary"

### Hero Section (Landing)
**Layout:** Asymmetric split - 60% booking form, 40% hero image
- Large headline with subtext
- Embedded quick booking form (pickup, dropoff, date, "Get Price" CTA)
- Hero image: Professional mover with truck, Calgary skyline backdrop
- Desktop: Side-by-side, Mobile: Form first, image below

### Booking Flow Pages
**Job Request Form:**
- Multi-step progress indicator (4 steps: Details → Load → Schedule → Review)
- Each step: Single focus, large inputs, helpful icons
- Address inputs with mock autocomplete styling
- Load size: Visual cards with icons (Small Box, Medium Load, Large Furniture, etc.)
- Date/time: Calendar picker + time slots grid
- Real-time price display: Sticky bottom bar (mobile) or right sidebar (desktop)

**Mover Selection Grid:**
- Cards with: Profile photo, name, rating (stars), vehicle type, distance, price
- 1 column (mobile) → 2 columns (tablet) → 3 columns (desktop)
- Each card: Large tap target, "Select Mover" CTA, verification badges

### User Profiles
**Customer Dashboard:**
- Sidebar navigation (mobile: bottom tabs)
- Main content area: Active bookings (cards), Past bookings (list), Profile settings
- Booking cards: Status badge, mover info, pickup/dropoff, date, actions

**Mover Profile:**
- Hero section: Profile photo, name, rating, vehicle info, availability toggle
- Stats row: Completed moves, rating, response time (4-column grid)
- About section, reviews list, vehicle photos gallery

### Messaging Interface
**Chat View:**
- Full-screen on mobile, 60% width sidebar on desktop
- Message list: Left-aligned (received), right-aligned (sent)
- Input bar: Text field + send button, attachment icon
- Booking summary card pinned at top (pickup/dropoff, date, price)

### Admin Dashboard
**Layout:** Sidebar (left) + main content area
- Sidebar: Collapsible on mobile, fixed on desktop
- Dashboard widgets: 4-column stat cards (bookings, revenue, active movers, customers)
- Tables: Responsive, horizontal scroll on mobile, sortable columns
- Filters: Top bar with dropdowns (date range, status, region)

### Forms & Inputs
**Style:** Bold borders, generous padding (p-4), rounded corners (rounded-lg)
- Labels: Above input, semibold, mb-2
- Inputs: h-12 minimum, clear focus states
- Helper text: Below input, smaller text
- Error states: Bold borders, inline error messages
- Submit buttons: Full width on mobile, auto width on desktop

### Cards
**Standard Card:**
- Rounded borders (rounded-xl), shadow on hover
- Padding: p-6 (desktop), p-4 (mobile)
- Header: Icon + title (semibold)
- Content: Clear hierarchy, adequate spacing
- Footer: Actions or metadata (right-aligned)

### Buttons
**Primary CTA:** Large (h-12), bold text, full width on mobile
**Secondary:** Outlined style, same dimensions
**Icon Buttons:** Square (w-10 h-10), rounded
When on images: Blurred background (backdrop-blur-sm, bg-white/20)

### Status Indicators
**Badges:** Rounded-full, px-3 py-1, semibold text, 0.875rem
- Different badge styles for: Pending, Active, Completed, Cancelled
**Verification Icons:** Small badges next to names (checkmark icon)

### Trust Signals
- Star ratings: Large (1.25rem), prominent placement
- Verification badges: Next to mover names, vehicle licenses
- Review count: Always visible with ratings
- "Verified" text labels on profiles

## Images

**Hero Image:** Professional mover loading truck, Calgary cityscape background (1200x800px minimum, right-aligned on desktop)

**Mover Profile Photos:** Square headshots (400x400px), rounded-full on small displays

**Vehicle Photos:** Landscape orientation (16:9 ratio), showcase truck/van capacity

**Feature Icons:** Use Heroicons (outline style) via CDN for consistency

**Empty States:** Friendly illustration placeholders for "No bookings yet," "No messages"

## Responsive Breakpoints
- Mobile: 320px - 767px (base)
- Tablet: 768px - 1023px (md:)
- Desktop: 1024px+ (lg:)

## Accessibility
- Minimum 44x44px touch targets on mobile
- Clear focus indicators (ring-2) on all interactive elements
- Semantic HTML: nav, main, section, article
- ARIA labels for icon-only buttons
- Keyboard navigation support for all flows