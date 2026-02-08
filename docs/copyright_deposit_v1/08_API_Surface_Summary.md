# 08 — API Surface Summary

**Version:** 1.0  
**Date:** February 8, 2026

---

## Overview

The LervIT backend exposes a RESTful API via Express.js. All endpoints are prefixed with `/api/`. Authentication is session-based using `connect-pg-simple`.

### Security Levels

| Level | Description |
|-------|-------------|
| **PUBLIC** | No authentication required |
| **PROTECTED** | Requires valid user session |
| **ADMIN-ONLY** | Requires session + admin role |
| **STRIPE-ONLY** | Stripe webhook signature verification (no user session) |

---

## Authentication & Users

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| POST | `/api/auth/signup` | PUBLIC | Create new user account (requires phone verification token) |
| POST | `/api/auth/login` | PUBLIC | Authenticate user, create session |
| POST | `/api/auth/logout` | PROTECTED | Destroy session |
| GET | `/api/auth/me` | PROTECTED | Get current authenticated user |
| PATCH | `/api/auth/profile` | PROTECTED | Update user profile fields |
| POST | `/api/auth/change-password` | PROTECTED | Change password (requires current password) |
| POST | `/api/auth/forgot-password` | PUBLIC | Send password reset email |
| POST | `/api/auth/reset-password` | PUBLIC | Reset password with token |
| POST | `/api/auth/verify-phone` | PUBLIC | Send OTP to phone number |
| POST | `/api/auth/verify-phone-code` | PUBLIC | Verify OTP code |
| GET | `/api/auth/verify-email` | PUBLIC | Verify email with token |
| POST | `/api/auth/resend-verification` | PROTECTED | Resend email verification |

---

## Bookings

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| POST | `/api/bookings` | PROTECTED | Create new booking (customer only, email verified) |
| GET | `/api/bookings` | PROTECTED | List bookings for current user |
| GET | `/api/bookings/:id` | PROTECTED | Get booking details (with mover/customer info) |
| PATCH | `/api/bookings/:id` | PROTECTED | Update booking fields |
| PATCH | `/api/bookings/:id/status` | PROTECTED | Update booking status (validates state transitions) |
| PATCH | `/api/bookings/:id/cancel` | PROTECTED | Cancel a booking |
| POST | `/api/bookings/:id/location` | PROTECTED | Update mover's GPS location for active booking |

---

## Pricing & Quotes

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| GET | `/api/pricing/config` | PUBLIC | Get vehicle class configuration and pricing rates |
| POST | `/api/pricing/calculate` | PUBLIC | Calculate price for given parameters |

---

## Payments

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| POST | `/api/bookings/:id/create-payment-intent` | PROTECTED | Create Stripe PaymentIntent for booking |
| POST | `/api/bookings/:id/confirm-payment` | PROTECTED | Confirm inline payment success |
| POST | `/api/bookings/:id/pay-with-saved-card` | PROTECTED | Pay using a previously saved card |
| POST | `/api/payment-methods/setup-intent` | PROTECTED | Create SetupIntent for saving a card |
| GET | `/api/payment-methods` | PROTECTED | List customer's saved payment methods |
| POST | `/api/payment-methods/:id/set-default` | PROTECTED | Set default payment method |
| DELETE | `/api/payment-methods/:id/delete` | PROTECTED | Remove saved payment method |

---

## Stripe Webhook

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| POST | `/api/stripe-webhook` | STRIPE-ONLY | Handle Stripe events (payment success/failure, account updates) |

---

## Movers

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| GET | `/api/movers` | PUBLIC | List all movers (with optional filters) |
| GET | `/api/movers/:id` | PUBLIC | Get mover profile details |
| GET | `/api/movers/profile` | PROTECTED | Get current mover's own profile |
| PATCH | `/api/movers/profile` | PROTECTED | Update mover profile |
| POST | `/api/movers/availability` | PROTECTED | Toggle mover online/offline status |
| POST | `/api/movers/location` | PROTECTED | Update mover's GPS coordinates |
| GET | `/api/movers/bookings` | PROTECTED | List mover's assigned bookings |

---

## Job Notifications

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| GET | `/api/job-notifications` | PROTECTED | List pending job notifications for mover |
| POST | `/api/job-notifications/:id/accept` | PROTECTED | Accept a job offer |
| POST | `/api/job-notifications/:id/decline` | PROTECTED | Decline a job offer |

---

## Mover Payouts (Stripe Connect)

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| GET | `/api/movers/payouts/account` | PROTECTED | Get Stripe Connect account status |
| POST | `/api/movers/payouts/onboarding-link` | PROTECTED | Generate Stripe Express onboarding link |
| POST | `/api/movers/payouts/refresh-status` | PROTECTED | Refresh Stripe account status from Stripe |
| POST | `/api/movers/payouts/login-link` | PROTECTED | Generate Stripe Express dashboard login link |
| GET | `/api/movers/payouts/earnings` | PROTECTED | Get earnings history |

---

## Messages

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| GET | `/api/bookings/:id/messages` | PROTECTED | Get messages for a booking |
| POST | `/api/bookings/:id/messages` | PROTECTED | Send a message in a booking |

---

## Reviews

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| POST | `/api/reviews` | PROTECTED | Submit a review for a completed booking |
| GET | `/api/movers/:id/reviews` | PUBLIC | Get reviews for a mover |

---

## AI Features

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| POST | `/api/ai/identify` | PROTECTED | Upload photo for AI item identification (Vision Engine v2) |
| GET | `/api/ai/items/:bookingId` | PROTECTED | Get identified items for a booking |
| POST | `/api/ai/auto-quote` | PROTECTED | Get AI-powered price estimate |

---

## Support Tickets

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| POST | `/api/support/tickets` | PROTECTED | Create a support ticket |
| GET | `/api/support/tickets` | PROTECTED | List user's support tickets |
| GET | `/api/support/tickets/:id` | PROTECTED | Get ticket details with replies |
| POST | `/api/support/tickets/:id/reply` | PROTECTED | Reply to a support ticket |

---

## Mover Verification

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| GET | `/api/verification/items` | PROTECTED | Get mover's verification documents |
| POST | `/api/verification/items` | PROTECTED | Submit a verification document |

---

## Notifications (Inbox)

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| GET | `/api/inbox` | PROTECTED | Get in-app notifications |
| GET | `/api/inbox/unread-count` | PROTECTED | Get unread notification count |
| POST | `/api/inbox/:id/read` | PROTECTED | Mark notification as read |
| POST | `/api/inbox/read-all` | PROTECTED | Mark all notifications as read |

---

## Admin Endpoints

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| GET | `/api/admin/users` | ADMIN | List all users |
| PATCH | `/api/admin/users/:id` | ADMIN | Update user (role, lock status) |
| DELETE | `/api/admin/users/:id` | ADMIN | Delete a user |
| GET | `/api/admin/movers` | ADMIN | List all movers with details |
| GET | `/api/admin/bookings` | ADMIN | List all bookings |
| GET | `/api/admin/verification/pending` | ADMIN | Get pending verification items |
| PATCH | `/api/admin/verification/:id` | ADMIN | Approve or reject a verification item |
| GET | `/api/admin/support/tickets` | ADMIN | List all support tickets |
| POST | `/api/admin/support/tickets/:id/analyze` | ADMIN | Run AI analysis on a ticket |
| POST | `/api/admin/manual-transfer/:bookingId` | ADMIN | Create manual Stripe transfer for a booking |
| POST | `/api/admin/process-pending-payouts` | ADMIN | Batch process pending mover earnings |
| GET | `/api/admin/mover-earnings` | ADMIN | Get all mover earnings for reconciliation |
| GET | `/api/admin/growth-metrics` | ADMIN | Get Growth Dashboard KPIs |
| GET | `/api/admin/available-movers` | ADMIN | List movers available for assignment |
| POST | `/api/admin/email-campaigns` | ADMIN | Send email campaign |
| GET | `/api/admin/email-campaigns` | ADMIN | List email campaign history |
| GET | `/api/admin/abandoned-bookings` | ADMIN | Get abandoned booking analytics |

---

## WebSocket

| Endpoint | Purpose |
|----------|---------|
| `/ws` | Real-time notifications for movers (job alerts, status updates) |

WebSocket connections are authenticated via token-based auth. Movers receive push notifications with audio alerts for new job opportunities.

---

## Health & System

| Method | Endpoint | Security | Purpose |
|--------|----------|----------|---------|
| GET | `/health` | PUBLIC | Health check endpoint |
| POST | `/api/seed` | PUBLIC (dev only) | Seed database with test data (returns 404 in production) |
