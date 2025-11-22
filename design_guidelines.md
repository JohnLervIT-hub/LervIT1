# LervIT Mobile-First Design Guidelines

## Design Philosophy

**Industry Standard Mobile-First Marketplace**
LervIT follows industry-leading design patterns from Uber, DoorDash, Lyft, Bolt, and TaskRabbit. The interface prioritizes touch-friendly interactions, clear visual hierarchy, and professional polish on all screen sizes.

**Core Principles:**
- **Mobile-First:** Designed for 375px-430px screens first, scales up gracefully
- **Touch-Optimized:** Minimum 44px touch targets, generous spacing, clear tap states
- **Premium Visual Quality:** Card-based layouts, soft shadows, smooth animations
- **Zero Friction:** Fixed bottom CTAs, single-column forms, immediate visual feedback
- **Trust & Clarity:** Verification badges, clear pricing, professional imagery

---

## Brand Colors

### Primary Palette
- **Orange (Primary):** `#FF6A00` - CTAs, active states, brand accent
- **Deep Teal (Accent):** `#004C4C` - Headers, trust elements, secondary CTAs
- **White:** `#FFFFFF` - Card backgrounds, primary surfaces
- **Light Gray:** `#F5F5F5` - Page backgrounds, subtle dividers

### Usage
- **Primary Orange:** Book Now, Confirm, Accept Job, all primary CTAs
- **Deep Teal:** Navigation headers, verified badges, mover profiles
- **White Cards:** All content containers on light gray backgrounds
- **Shadows:** Soft `0 2px 8px rgba(0,0,0,0.08)` on cards

---

## Typography

### Font Stack
**Primary:** `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

### Mobile-First Scale
- **Hero Headlines:** `2rem` (32px), bold (700)
- **Page Titles:** `1.5rem` (24px), semibold (600)
- **Section Headers:** `1.25rem` (20px), semibold (600)
- **Body Text:** `1rem` (16px), regular (400)
- **Small/Meta:** `0.875rem` (14px), medium (500)
- **Button Text:** `1rem` (16px), semibold (600)

### Desktop Scale (768px+)
- **Hero Headlines:** `3rem` (48px)
- **Page Titles:** `2rem` (32px)
- **Section Headers:** `1.5rem` (24px)

---

## Layout System

### Mobile Spacing (< 768px)
- **Page Padding:** `px-4` (16px)
- **Card Padding:** `p-4` (16px)
- **Element Gaps:** `gap-3` (12px)
- **Section Spacing:** `py-6` (24px)
- **Input Padding:** `p-3` (12px)

### Desktop Spacing (768px+)
- **Page Padding:** `px-6 md:px-8` (24-32px)
- **Card Padding:** `p-6` (24px)
- **Element Gaps:** `gap-4` (16px)
- **Section Spacing:** `py-12` (48px)

### Container Max Widths
- **Full Page:** `max-w-7xl` (1280px)
- **Forms:** `max-w-2xl` (672px)
- **Cards:** `100%` mobile → `max-w-sm` desktop

---

## Responsive Breakpoints

### Standard Mobile Breakpoints
```css
/* Mobile Small: 320px - 374px */
/* Mobile Medium: 375px - 413px */
/* Mobile Large: 414px - 429px */
/* Mobile XL: 430px - 767px */
/* Tablet: 768px - 1023px */
/* Desktop: 1024px+ */
```

### Media Queries
```css
@media (max-width: 430px) { /* Mobile XL adjustments */ }
@media (max-width: 414px) { /* iPhone Pro Max / Android Large */ }
@media (max-width: 375px) { /* iPhone standard / Android Medium */ }
@media (min-width: 768px) { /* Tablet and above */ }
@media (min-width: 1024px) { /* Desktop */ }
```

---

## Component Library

### Header / Navigation
**Mobile Header (< 768px):**
- Height: `h-16` (64px)
- Layout: Back arrow (left) → Logo (center) → Profile/Menu (right)
- Padding: `px-4`
- Background: White with bottom border
- Fixed position with shadow on scroll

**Desktop Header (768px+):**
- Height: `h-20` (80px)
- Layout: Logo (left) → Nav links (center) → User menu + "Book Move" CTA (right)
- Padding: `px-8`
- Transparent on home, white on other pages

### Cards
**Standard Card:**
```
- Background: White
- Border Radius: rounded-2xl (16px)
- Shadow: 0 2px 8px rgba(0,0,0,0.08)
- Padding: p-4 (mobile), p-6 (desktop)
- Hover: Shadow lifts to 0 4px 12px rgba(0,0,0,0.12)
```

**Booking Card:**
- Status badge (top-right)
- Pickup/Dropoff with map pin icons
- Mover photo + name
- Price (large, bold)
- Action buttons (full-width on mobile)

**Mover Card:**
- Profile photo (rounded-full, 80px)
- Name + verification badge
- Rating (large stars)
- Vehicle type + distance
- Price (prominent)
- "Select Mover" CTA (full-width)

### Buttons

**Primary CTA (Orange):**
```
- Background: #FF6A00
- Text: White, semibold
- Height: min-h-12 (48px) - mobile minimum
- Height: min-h-14 (56px) - desktop
- Padding: px-6 py-3
- Border Radius: rounded-xl (12px)
- Width: Full-width on mobile, auto on desktop
- Touch Target: Minimum 44px
- Hover: Darken to #E55F00
- Active: Scale 0.98
```

**Secondary CTA (Outline):**
```
- Border: 2px solid #004C4C
- Text: #004C4C, semibold
- Same sizing as primary
- Hover: Fill with #004C4C, text white
```

**Icon Button:**
```
- Size: w-12 h-12 (48px)
- Border Radius: rounded-full
- Background: White or transparent
- Icon Size: 24px
```

### Forms & Inputs

**Text Input:**
```
- Height: min-h-12 (48px)
- Padding: px-4 py-3
- Border: 1.5px solid #E0E0E0
- Border Radius: rounded-xl
- Focus: Border #FF6A00, ring-2 ring-orange-100
- Icon: Left-aligned with pl-12
```

**Select Dropdown:**
```
- Same styling as text input
- Chevron icon right-aligned
- Touch-friendly options (min-h-12)
```

**Labels:**
```
- Above input with mb-2
- Font: 0.875rem (14px), semibold
- Color: #333333
```

### Fixed Bottom CTA Bar

**Mobile Pattern (< 768px):**
```
- Position: fixed bottom-0 left-0 right-0
- Height: min-h-20 (80px)
- Padding: p-4
- Background: White
- Shadow: 0 -2px 10px rgba(0,0,0,0.1)
- Content: Price (left) + CTA Button (right)
- Safe Area: pb-safe (iOS notch support)
```

**Desktop:**
- Sticky sidebar or inline buttons

### Status Badges

**Badge Styling:**
```
- Border Radius: rounded-full
- Padding: px-3 py-1
- Font: 0.75rem (12px), semibold, uppercase
```

**Colors:**
- **Pending:** Yellow (#FFA000) background, dark text
- **Confirmed:** Blue (#2196F3) background, white text
- **In Progress:** Green (#4CAF50) background, white text
- **Completed:** Deep Teal (#004C4C) background, white text
- **Cancelled:** Red (#F44336) background, white text

### Progress Indicators

**Multi-Step Flow:**
```
- Horizontal dots or stepped line
- Current step: Orange (#FF6A00)
- Completed: Deep Teal (#004C4C)
- Upcoming: Light Gray (#E0E0E0)
- Step numbers in circles
```

### Icons & Visual Elements

**Icon Guidelines:**
- **Library:** Lucide React
- **Size:** 20px (mobile), 24px (desktop)
- **Stroke:** 2px
- **Color:** Current text color or brand colors

**Map Pins:**
- Pickup: Green (#4CAF50)
- Dropoff: Red (#F44336)
- Mover Location: Orange (#FF6A00)

**Trust Signals:**
- Verification checkmark (white on deep teal circle)
- Star ratings (orange stars, 5-star scale)
- Review count next to rating

---

## Page-Specific Patterns

### Home Page (Landing)

**Mobile (< 768px):**
```
1. Hero Section:
   - Full-width background gradient
   - Centered headline (32px)
   - Subtext (16px)
   - Quick booking form (white card)
   - Fixed bottom "Get Estimate" CTA

2. How It Works (3 steps):
   - Vertical stack of cards
   - Icon + title + description
   - Full-width per card

3. Trust Indicators:
   - Stats row (2 columns)
   - "500+ Movers" | "Verified Professionals"
```

**Desktop (768px+):**
```
- 60/40 split (form left, hero image right)
- 3-column "How It Works"
- 4-column stats grid
```

### Request Move Page

**Mobile Flow:**
```
1. Progress Bar (top)
2. Step Content:
   - Single-column form
   - Large input fields (min-h-12)
   - Visual selection cards (load size)
   - Helper text below inputs
3. Fixed Bottom Bar:
   - "Next Step" CTA (full-width)
   - Price preview (if applicable)
```

**Steps:**
1. **Addresses:** Pickup + Dropoff with map pin icons
2. **Load Details:** Visual cards for load size, stairs, movers
3. **Schedule:** Calendar picker + time slots
4. **Review:** Summary card + "Confirm Booking" CTA

### My Bookings

**Mobile:**
```
- Tab navigation (Active / Past)
- Vertical stack of booking cards
- Each card: 
  - Status badge (top-right)
  - Pickup → Dropoff
  - Date + Time
  - Mover info (if assigned)
  - Price
  - Action buttons (full-width)
```

### Browse Movers

**Mobile:**
```
- Filter bar (fixed top)
- 1-column grid
- Mover cards:
  - Large profile photo
  - Name + verification
  - Rating + reviews
  - Vehicle + distance
  - Price (bold)
  - "Select" CTA (full-width)
```

**Desktop:**
```
- 3-column grid
- Filters in left sidebar
```

---

## Animations & Interactions

### Touch Feedback
```css
/* Button Press */
.btn-press {
  transition: transform 0.1s ease;
}
.btn-press:active {
  transform: scale(0.98);
}

/* Card Hover */
.card-hover {
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}
.card-hover:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  transform: translateY(-2px);
}
```

### Page Transitions
- Fade in: 200ms
- Slide up: 300ms ease-out
- Modal: 200ms with backdrop fade

### Loading States
- Skeleton screens for content
- Spinner for actions (20px, orange)
- Progress bar for multi-step

---

## Accessibility

### Touch Targets
- **Minimum:** 44px × 44px (iOS/Android guideline)
- **Preferred:** 48px × 48px for primary actions
- **Spacing:** Minimum 8px between touch targets

### Contrast
- **Text:** Minimum 4.5:1 ratio
- **Large Text:** Minimum 3:1 ratio
- **Focus Indicators:** Visible 2px ring

### Keyboard Navigation
- Tab order follows visual flow
- Focus visible on all interactive elements
- Escape closes modals/dropdowns

### Screen Readers
- Semantic HTML (nav, main, section)
- ARIA labels for icon-only buttons
- Alt text for all images

---

## Performance

### Mobile Optimization
- Images: WebP format, lazy loading
- Fonts: Preload Inter, subset for used characters
- CSS: Inline critical styles
- JS: Code splitting by route

### Target Metrics
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3.5s
- Largest Contentful Paint: < 2.5s
- Cumulative Layout Shift: < 0.1

---

## Design Checklist

### Every Page Must Have:
- [ ] Responsive layout (320px → 1920px)
- [ ] Touch-friendly buttons (min 44px)
- [ ] No horizontal scrolling on mobile
- [ ] Clear visual hierarchy
- [ ] Loading states for async actions
- [ ] Error states with helpful messages
- [ ] Empty states with CTAs
- [ ] Proper spacing (no cramped elements)

### Every Form Must Have:
- [ ] Clear labels above inputs
- [ ] Helper text where needed
- [ ] Validation with inline errors
- [ ] Touch-friendly inputs (min-h-12)
- [ ] Progress indicator (multi-step)
- [ ] Clear CTAs (full-width mobile)

### Every Card Must Have:
- [ ] White background
- [ ] Rounded corners (rounded-2xl)
- [ ] Soft shadow
- [ ] Adequate padding (p-4 mobile, p-6 desktop)
- [ ] Clear hierarchy (title → content → actions)

---

## Implementation Notes

Use Tailwind CSS with these custom extensions:

```javascript
// tailwind.config.js
theme: {
  extend: {
    colors: {
      orange: {
        primary: '#FF6A00',
        dark: '#E55F00',
      },
      teal: {
        deep: '#004C4C',
        light: '#006666',
      }
    },
    minHeight: {
      '12': '3rem',    // 48px - mobile buttons
      '14': '3.5rem',  // 56px - desktop buttons
      '16': '4rem',    // 64px - mobile header
      '20': '5rem',    // 80px - desktop header
    }
  }
}
```
