# 03 — Workflows

**Version:** 1.0  
**Date:** February 8, 2026

---

## Customer Workflows

### 1. Signup & Verification

**Trigger:** Customer clicks "Sign Up"

1. **Phone Verification (OTP):** Customer enters phone number. System sends a 6-digit OTP via Telnyx SMS. Customer enters OTP. System verifies and issues a verification token.
2. **Profile Creation:** Customer provides name, email, and password. The phone verification token is submitted along with profile data. System creates account with `phoneVerified: true`.
3. **Email Verification:** System sends a verification email via Resend with a unique token link. Customer clicks the link. System marks `emailVerified: true`.
4. **Login Redirect:** Customer is redirected to the Customer Dashboard.

**Validations:**
- Phone number must be valid Canadian format (+1XXXXXXXXXX)
- OTP expires after 10 minutes
- Password minimum 6 characters
- Email must be unique
- Email verification required before booking

**Errors/Fallbacks:**
- Invalid OTP → "Invalid or expired verification code" error
- Duplicate email → "An account with this email already exists"
- Account lockout after 5 failed login attempts (30-minute cooldown)

---

### 2. Quote & Booking

**Trigger:** Customer clicks "Book a Move"

1. **Step 1 — Locations:** Customer enters pickup and dropoff addresses. Google Maps geocodes addresses and calculates driving distance.
2. **Step 2 — Load Details:** Customer selects load size (Boxes / Medium / Large / Apartment), access difficulty for both locations (Ground / Basement / Stairs / Elevator), number of movers (1 or 2), and uploads item photos.
3. **AI Photo Analysis:** Uploaded photos are processed by Vision Engine 2.0 (GPT-4o Vision). System identifies items, estimates volume, recommends vehicle class, and suggests mover count.
4. **Real-Time Price Display:** Price is calculated client-side using shared pricing module. Breakdown shows base fee, distance fee, load size fee, access fees, and total.
5. **Step 3 — Scheduling:** Customer selects preferred date.
6. **Step 4 — Review & Submit:** Customer reviews all details and submits booking.

**Login-First Flow (Unauthenticated Users):**
- If user is not logged in, booking data is saved to sessionStorage (30-minute expiry)
- Critical data (addresses, load size, mover ID) is also encoded in redirect URL parameters
- After signup/login, user is returned to Step 2 with all data restored

**Validations:**
- Both addresses required and must geocode successfully
- At least one photo upload required (moved to recommendation, not blocking)
- Email verification required before submission
- Preferred date must be in the future

**Errors/Fallbacks:**
- Geocoding failure → "Could not find this address" prompt
- Photo upload failure → Item can be manually described
- Session expiry → User restarts booking flow

---

### 3. Payment

**Trigger:** Booking created with status `pending_payment`

1. System creates a Stripe PaymentIntent with the booking amount (in CAD cents).
2. If the assigned mover has a Stripe Connect account, a destination charge is created (automatic 85/15 split).
3. Customer enters card details via Stripe Elements (PCI-compliant).
4. Payment is confirmed. Status moves to `pending`.
5. Customer receives confirmation email and SMS.

**Saved Card Flow:**
- Customer can save cards via SetupIntent for future use.
- Saved cards are listed. Customer selects a saved card and confirms.

**Errors/Fallbacks:**
- Payment failure → Status moves to `payment_failed`. Customer can retry.
- Stripe webhook confirms final payment status (idempotent).
- 30-minute payment window before booking expires.

---

### 4. Tracking

**Trigger:** Mover updates status to `en_route_to_pickup`

1. Customer opens the Track Trip page.
2. Live map displays mover's current GPS position with custom vehicle icon.
3. Mover location updates every 30 seconds via API.
4. Customer sees progress stages: En Route to Pickup → Loading → En Route to Dropoff → Unloading → Completed.
5. ETA badge shows estimated arrival time.

**Errors/Fallbacks:**
- GPS unavailable → Last known location displayed with timestamp
- Map load failure → Status-only text view shown

---

### 5. Completion & Review

**Trigger:** Mover marks status as `completed`

1. Customer receives completion notification.
2. Customer is prompted to leave a review (rating 1–5 + comment).
3. Review is stored and mover's aggregate rating is updated.
4. Booking appears in "Past Moves" section of dashboard.

---

## Mover Workflows

### 1. Onboarding

**Trigger:** User signs up with role "mover"

1. **Onboarding Wizard:** Multi-step guided setup covering profile, vehicle details, and terms acceptance.
2. **Profile Setup:** Mover adds bio, profile photo, vehicle type, vehicle photo, license plate, and vehicle color.
3. **Terms Acceptance:** Mover accepts Early Access terms (version tracked, timestamp and IP recorded).
4. **Verification Documents:** Mover uploads required documents (ID, driver's license, vehicle registration, vehicle photos, insurance, background check).
5. **Stripe Connect Setup:** Mover initiates Stripe Express onboarding to enable payouts.
6. **Admin Review:** Admin reviews and approves/rejects each verification document.

**Validations:**
- All required fields must be completed
- Document uploads must be valid image formats
- Stripe onboarding must be completed for payouts

---

### 2. Going Online & Receiving Jobs

**Trigger:** Mover toggles availability to "Online"

1. GPS tracking begins automatically (updates every 30 seconds).
2. "Live" badge appears on mover's profile in Browse Movers page.
3. System includes mover in proximity matching queries.
4. When a nearby booking is created, mover receives:
   - WebSocket push notification (with audio alert)
   - SMS notification via Telnyx
   - In-app notification in Inbox
5. Job notification shows: pickup/dropoff (masked for privacy), distance, estimated earnings, and 10-minute expiry countdown.

---

### 3. Accept Job → In Progress → Complete

**Trigger:** Mover taps "Accept" on a job notification

1. **Accept:** Booking is assigned to mover. Status → `confirmed`. Customer is notified.
2. **En Route to Pickup:** Mover starts driving. GPS tracking is active. Status → `en_route_to_pickup`.
3. **Loading:** Mover arrives at pickup. Status → `loading`.
4. **En Route to Dropoff:** Items loaded, mover departs. Status → `en_route_to_dropoff`.
5. **Unloading:** Mover arrives at dropoff. Status → `unloading`.
6. **Completed:** Mover finishes. Status → `completed`.

Each status transition is validated against the state machine (only forward transitions or cancellation allowed).

---

### 4. Earnings & Payout

**Trigger:** Booking status reaches `completed`

1. Platform calculates: 85% to mover, 15% platform commission.
2. If mover has a Stripe Connect account with payouts enabled, a Stripe Transfer is created.
3. Earnings record is stored with gross amount, platform fee, and net amount.
4. Mover views earnings in the Earnings tab of their dashboard.
5. Stripe processes payout to mover's bank account per their payout schedule.

---

## Admin Workflows

### 1. User & Mover Management

- View all users with role, verification status, and activity timestamps.
- Lock/unlock user accounts with reason tracking.
- Delete users (with confirmation).
- View all movers with vehicle details, verification progress, and availability status.

### 2. Verification Review

- View pending verification documents submitted by movers.
- Approve or reject each document with optional rejection reason.
- Track 7 verification types: ID, Driver's License, Vehicle Registration, Vehicle Photos, Insurance, Background Check, Payout Setup.

### 3. Booking Management

- View all bookings with status, pricing, and assignment details.
- Cancel bookings with reason.
- Reassign movers to bookings.
- View booking pricing breakdown.

### 4. Support Ticket Management

- View all support tickets with priority, status, and category.
- AI-assisted analysis: summaries, classification, root cause, and suggested responses (GPT-4o).
- Reply to tickets (marked as staff reply).
- Escalate priority.

### 5. Financial Operations

- Process pending mover earnings (batch Stripe transfers).
- Manual transfer creation for individual bookings.
- View all mover earnings for reconciliation.
- Revenue analytics in Growth Dashboard.

### 6. Email Campaigns

- Compose and send targeted emails to all users, customers only, movers only, or specific users.
- Campaign types: Account Update, News, Promotion, Event, Personal.
- Track sent count and delivery status.

### 7. Growth Dashboard

- Total / weekly / monthly bookings
- Total revenue and average booking value
- Conversion rate (completed / total bookings)
- User statistics: total customers, total movers, online movers, verified movers, live GPS movers
- Abandoned booking recovery rate
- 7-day booking trend chart
