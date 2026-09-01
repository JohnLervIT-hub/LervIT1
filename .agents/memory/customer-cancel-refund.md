---
name: Customer cancellation refund flow
description: How the customer cancel path works — ownership, timing, Stripe refund, mover notification.
---

**Rule:** Customer cancellation is handled entirely in `PATCH /api/bookings/:id` when `status === 'cancelled'`. Four things must happen in order: ownership check → timing guard → Stripe action → mover notification.

**Why:** Previously cancelling only updated the DB status. No refund was issued, no ownership was checked (any user could cancel any booking by ID), and the assigned mover received no notification.

**How to apply:**
1. **Ownership:** `user.role !== 'admin' && booking.customerId !== user.id` → 403.
2. **Timing:** Block if `booking.status` is in `[en_route_to_pickup, loading, en_route_to_dropoff, unloading]`. Customer must contact support instead.
3. **Stripe refund:**
   - `paymentStatus === 'succeeded'` → `stripe.refunds.create({ payment_intent, reason: 'requested_by_customer' })` + set `paymentStatus = 'refunded'`
   - `paymentStatus === 'pending'` → `stripe.paymentIntents.cancel(...)` + set `paymentStatus = 'cancelled'`
4. **Mover notification:** `storage.createNotification` + `notificationService.sendEmail` with `type: 'status_update'` (sendEmail only accepts the restricted union from notifications.ts; 'booking_cancelled' is NOT valid for sendEmail, only for inAppNotifications).

**Gotcha:** `notificationService.sendEmail` type field is restricted to `'booking_confirmation' | 'job_assignment' | 'payment_receipt' | 'status_update' | 'pilot_status'`. Use `'status_update'` for cancellation emails to movers.
