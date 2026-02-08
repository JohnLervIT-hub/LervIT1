# 07 — PostgreSQL Data Model Summary

**Version:** 1.0  
**Date:** February 8, 2026

---

## Overview

The LervIT platform uses PostgreSQL (Neon Serverless) as its primary data store, managed through Drizzle ORM with TypeScript type generation. The schema defines 20+ tables organized into functional domains.

---

## Entity Summary

### Core Entities

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | All platform users (customers, movers, admins) | id (UUID), email, name, phone, role, emailVerified, phoneVerified, createdAt, lastLoginAt |
| `movers` | Mover profiles linked to users | id (UUID), userId (FK→users), vehicleType, rating, totalMoves, latitude, longitude, isAvailable, onboardingCompleted, pilotStatus |
| `bookings` | Move requests and job records | id (UUID), customerId (FK→users), moverId (FK→movers), pickupAddress, dropoffAddress, loadSize, status, price, paymentStatus, distance |
| `messages` | In-booking chat messages | id (UUID), bookingId (FK→bookings), senderId (FK→users), text, readAt |
| `reviews` | Customer reviews of movers | id (UUID), bookingId (FK→bookings), moverId (FK→movers), customerId (FK→users), rating (1-5), comment |

### Authentication & Verification

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `phone_verification_tokens` | OTP tokens for pre-signup phone verification | id, phone, verificationCode, expiresAt, verified, verifiedToken |
| `verification_items` | Mover document verification tracking | id, moverId (FK→movers), type (7 types), status, fileUrls, rejectionReason, reviewedBy |
| `mover_terms_acceptance` | Legal consent tracking for Early Access terms | id, moverId (FK→movers), termsVersion, acceptedAt, acceptedFromIp, userAgent |

### Job Assignment

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `job_notifications` | Proximity match notifications sent to movers | id, bookingId (FK→bookings), moverId (FK→movers), distanceToPickup, estimatedEarnings, status, expiresAt |

### Financial

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `mover_stripe_accounts` | Stripe Connect account tracking | id, moverId (FK→movers), stripeAccountId, onboardingStatus, chargesEnabled, payoutsEnabled, detailsSubmitted |
| `mover_earnings` | Per-booking earnings records | id, moverId (FK→movers), bookingId (FK→bookings), grossAmount, platformFeeAmount, netAmount, stripeTransferId, status |
| `mover_payouts` | Payout history to movers' bank accounts | id, moverId (FK→movers), stripePayoutId, amount, status, payoutType, arrivalDate, failureCode |

### AI & Intelligence

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `identified_items` | AI-identified items from customer photos | id, bookingId (FK→bookings), photoUrl, itemName, category, weightKg, volumeCuft, vehicleType, confidence, processingStatus |
| `ai_runs` | AI API usage tracking (cost, tokens, response time) | id, bookingId (FK→bookings), provider, operation, inputTokens, outputTokens, totalCost, status |
| `ai_support_insights` | AI analysis of support tickets | id, ticketId (FK→support_tickets), summary, category, suggestedPriority, rootCause, recommendations, suggestedResponse |

### Support

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `support_tickets` | Customer/mover support requests | id, userId (FK→users), subject, category, message, status, priority, assignedTo |
| `support_ticket_replies` | Threaded replies on support tickets | id, ticketId (FK→support_tickets), userId (FK→users), message, isStaff |

### Learning System

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `booking_metrics` | Estimated vs actual move metrics | id, bookingId (FK→bookings), estimatedVolumeCuft, actualVolumeCuft, priceAccuracyPercent, vehicleClassMatch |
| `item_feedback` | Corrections to AI-identified items | id, identifiedItemId (FK→identified_items), originalItemName, correctedItemName, feedbackReason |
| `mover_performance` | Per-booking mover performance metrics | id, moverId (FK→movers), bookingId (FK→bookings), communicationScore, professionalismScore, totalMoveMinutes |
| `learning_insights` | Aggregated learning data for model improvement | id, insightType, sampleSize, accuracyPercent, categoryBreakdown |

### Communications

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `email_campaigns` | Admin email campaigns | id, subject, content, type, audienceType, recipientIds, recipientCount, sentBy (FK→users), status |
| `in_app_notifications` | Unified in-app notification inbox | id, userId (FK→users), type, title, message, bookingId, actionUrl, isRead |
| `abandoned_bookings` | Incomplete booking tracking for recovery | id, userId (FK→users), pickupAddress, dropoffAddress, loadSize, lastStep, reminderCount, recovered |

---

## Entity Relationships

```
users (1) ──────── (0..1) movers
  │                        │
  │                        ├── (0..N) mover_stripe_accounts
  │                        ├── (0..N) mover_earnings
  │                        ├── (0..N) mover_payouts
  │                        ├── (0..N) mover_terms_acceptance
  │                        ├── (0..N) verification_items
  │                        ├── (0..N) mover_performance
  │                        └── (0..N) job_notifications
  │
  ├── (0..N) bookings (as customer)
  │              │
  │              ├── (0..N) messages
  │              ├── (0..1) reviews
  │              ├── (0..N) identified_items
  │              │              └── (0..N) item_feedback
  │              ├── (0..N) job_notifications
  │              ├── (0..1) mover_earnings
  │              ├── (0..1) booking_metrics
  │              ├── (0..N) mover_performance
  │              └── (0..N) ai_runs
  │
  ├── (0..N) support_tickets
  │              ├── (0..N) support_ticket_replies
  │              └── (0..1) ai_support_insights
  │
  ├── (0..N) in_app_notifications
  ├── (0..N) abandoned_bookings
  └── (0..N) email_campaigns (as sender)
```

---

## Indexes and Constraints

### Unique Constraints
- `users.email` — unique email per account
- `users.firebase_uid` — unique Firebase UID (optional SSO)
- `mover_stripe_accounts.mover_id` — one Stripe account per mover
- `mover_stripe_accounts.stripe_account_id` — unique Stripe account ID
- `mover_earnings.booking_id` — one earnings record per booking
- `job_notifications.(booking_id, mover_id)` — one notification per mover per booking

### Foreign Key Relationships
- All foreign keys reference the `id` column of their parent table
- Booking references both `customer_id` (users) and `mover_id` (movers)
- Booking also tracks `pre_selected_mover_id` for direct mover selection flow

### Performance Indexes
- `bookings`: customer_id, mover_id, status, payment_status
- `movers`: user_id, is_available, pilot_status
- `job_notifications`: (mover_id, status) composite index
- `mover_earnings`: mover_id, booking_id, status
- `identified_items`: booking_id, processing_status
- `in_app_notifications`: (user_id, is_read) composite index, created_at
- `ai_runs`: booking_id, provider, created_at
- `abandoned_bookings`: user_id, email, recovered, created_at

### Pricing Fields on Bookings

The bookings table stores a complete price breakdown for audit and display:
- `price` — final total cost
- `base_fee`, `distance_fee`, `load_fee` — component fees
- `mover_travel_fee`, `pickup_difficulty_fee`, `dropoff_difficulty_fee` — surcharges
- `subtotal` — pre-multiplier total
- `discount_percent`, `discount_amount`, `discount_reason` — first-move discount
- `platform_fee_percent`, `platform_fee_amount`, `mover_net_amount` — commission split
- `ai_estimate`, `ai_explanation`, `ai_confidence_score` — AI pricing data
