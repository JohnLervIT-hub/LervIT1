# 06 — Payments and Payouts

**Version:** 1.0  
**Date:** February 8, 2026

---

## Overview

LervIT uses Stripe as the sole payment processor. The platform implements an Uber-style payment splitting model where customer payments are automatically divided between the mover (85%) and the platform (15%) using Stripe Connect.

---

## Payment Flow (System Level)

### Customer Charge

```
Customer → Stripe PaymentIntent → Platform receives full amount
```

1. When a booking is confirmed, the backend creates a Stripe PaymentIntent in CAD (cents).
2. The amount is calculated **server-side** from the booking's stored price — never trusted from the client.
3. If the assigned mover has a connected Stripe Express account, the PaymentIntent is created as a **destination charge** with automatic transfer.
4. Customer pays via Stripe Elements (PCI-compliant, hosted input fields).
5. Stripe processes the charge and confirms via webhook.

### Platform Fee Calculation

```
grossAmount (customer pays) = $100.00
platformFeePercent = 15%
platformFeeCents = grossAmountCents * 0.15 = 1500 ($15.00)
moverPayoutCents = grossAmountCents - platformFeeCents = 8500 ($85.00)
```

The platform fee is calculated using a flat 15% commission rate for all vehicle classes in the current MVP. The architecture supports future tiered rates by vehicle class.

### Transfer to Connected Account

```
Platform Stripe Account → Stripe Transfer → Mover's Connected Account
```

1. Upon booking completion, a Stripe Transfer is created to move the mover's share (85%) to their Stripe Express connected account.
2. The transfer includes metadata: booking ID, mover ID, and amount breakdown.
3. Idempotency keys prevent duplicate transfers for the same booking.
4. Transfer status is tracked in the `mover_earnings` table.

### Payout to Bank

```
Mover's Connected Account → Stripe Payout → Mover's Bank Account
```

1. Stripe automatically pays out from the mover's connected account balance to their linked bank account.
2. Payout schedule is configured during Stripe Express onboarding (typically daily or weekly).
3. First payout may have a delay period (Stripe's standard policy for new accounts).

---

## Stripe Connect Integration

### Mover Onboarding

1. Mover initiates Stripe Express onboarding from the Earnings/Payouts tab.
2. System creates a Stripe Express account (type: express, country: CA, currency: CAD).
3. System generates an onboarding link that redirects the mover to Stripe's hosted onboarding flow.
4. Mover provides identity verification, bank account details, and tax information.
5. Stripe sends `account.updated` webhook events as onboarding progresses.
6. System tracks onboarding status: `pending` → `in_progress` → `complete`.

### Onboarding Status Tracking

The platform tracks each connected account's status:
- `chargesEnabled` — Can receive destination charges
- `payoutsEnabled` — Can receive payouts to bank
- `detailsSubmitted` — Has completed Stripe's KYC requirements
- `requirementsDue` — Outstanding requirements from Stripe
- `currentlyDue` — Immediately required actions

### Automated Onboarding Reminders

If a mover creates a Stripe Connect account but does not complete onboarding, the system sends progressive reminders:
- **1st reminder:** 24 hours after creation (email only)
- **2nd reminder:** 3 days after creation (email + SMS)
- **3rd reminder:** 7 days after creation (email + SMS)
- Maximum of 3 reminders per mover.

---

## Reconciliation

### Earnings Records

For each completed booking, the `mover_earnings` table stores:
- Gross amount (what customer paid)
- Platform fee percentage and amount
- Net amount (mover's share)
- Stripe Transfer ID (once transfer is created)
- Status: `pending` → `available` → `paid` → (or `failed`)
- Timestamps for availability and payout dates

### Admin Reconciliation Tools

- **Batch Processing:** Admin can trigger batch processing of all pending earnings, creating Stripe Transfers for each.
- **Manual Transfer:** Admin can create individual Stripe Transfers for specific bookings.
- **Earnings Overview:** Admin dashboard shows all earnings records with status, amounts, and transfer details.
- **Payout History:** Each mover's payout history is tracked in the `mover_payouts` table with Stripe Payout IDs, amounts, arrival dates, and failure information.

### Balance Tracking

- **Pending Earnings:** Completed bookings where transfer has not yet been created.
- **Available Earnings:** Transfers created, funds in mover's Stripe balance.
- **Paid Earnings:** Stripe has paid out to mover's bank account.
- **Failed Transfers:** Transfer attempt failed (insufficient balance, account issues).

---

## Common Payout Delay Causes

| Cause | Description | Resolution |
|-------|-------------|------------|
| **Bank verification pending** | Mover's bank account has not been verified by Stripe | Mover completes microdeposit verification or provides additional bank details |
| **First payout hold** | Stripe holds first payout for 7–14 days for new Express accounts | Automatic — payout releases after hold period |
| **Payout schedule** | Mover's account may be on weekly or monthly payout schedule | Funds accumulate and are paid on the scheduled date |
| **Insufficient balance** | Transfer was created but mover's Stripe balance is insufficient (e.g., due to refund) | Admin reviews and may need to top up or adjust |
| **Account restrictions** | Stripe has flagged the account for additional verification | Mover completes required verification steps in Stripe Dashboard |
| **Disputes/chargebacks** | Customer disputes the charge, funds are held | Platform resolves dispute with Stripe; funds released or refunded |
| **KYC requirements** | Stripe requires additional identity documents from mover | Mover provides documents via Stripe Express Dashboard |

---

## Webhook Events Handled

The platform's Stripe webhook endpoint processes the following event types:

| Event | Action |
|-------|--------|
| `payment_intent.succeeded` | Update booking payment status to `paid`, trigger mover matching |
| `payment_intent.payment_failed` | Update booking to `payment_failed`, notify customer |
| `account.updated` | Sync mover's Stripe Connect account status (charges/payouts enabled, requirements) |
| `charge.dispute.created` | Flag booking for review |

All webhook events are verified using Stripe's signature verification to prevent spoofing. Idempotency checks prevent duplicate processing.

---

## Security Measures

1. **Server-side amount calculation:** PaymentIntent amounts are always calculated from the booking's stored price on the server. Client-provided amounts are never trusted.
2. **Webhook signature verification:** All Stripe webhook events are verified against the webhook signing secret before processing.
3. **Idempotency:** Each payment operation uses idempotency keys derived from booking IDs to prevent duplicate charges or transfers.
4. **PCI compliance:** Card details are handled exclusively by Stripe.js and Stripe Elements — they never touch the LervIT server.
5. **Mode detection:** The system automatically detects whether it is running in Stripe test mode or live mode based on the key prefix.
