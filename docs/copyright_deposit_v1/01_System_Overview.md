# 01 — System Overview

**Version:** 1.0  
**Date:** February 8, 2026

---

## Mission

LervIT is an AI-powered, two-sided marketplace that connects customers in Calgary, Alberta with freelance movers. The platform's mission is to simplify the moving process through intelligent automation — replacing phone calls, guesswork pricing, and unreliable scheduling with a seamless, mobile-first digital experience.

The long-term vision is to evolve into an Uber-style location-based moving service with dynamic matching algorithms, real-time GPS tracking, and AI-driven pricing.

---

## Platform Roles

### Customer
The person who needs items moved. Customers can:
- Browse verified movers with ratings, vehicle details, and live availability
- Upload photos of items for AI-powered identification and volume estimation
- Receive instant, transparent price quotes based on distance, load size, and access difficulty
- Book moves with secure online payment
- Track their mover's real-time location during active moves
- Message movers directly within the platform
- Leave reviews after completed moves
- File support tickets and report safety concerns

### Mover (Freelance Driver)
The independent contractor who performs the move. Movers can:
- Complete onboarding with identity verification, vehicle registration, and insurance
- Set up Stripe Connect for direct deposit payouts
- Go online/offline to control availability
- Receive proximity-based job notifications with audio alerts
- Accept or decline job offers with estimated earnings displayed
- Progress through move stages (en route, loading, driving, unloading)
- Share real-time GPS location with customers during active moves
- View earnings dashboard with detailed commission breakdowns
- Manage their profile, bio, vehicle photos, and settings

### Admin / Support
Platform operators who oversee all activity. Admins can:
- View the Growth Dashboard with comprehensive KPIs (bookings, revenue, users, conversion rate)
- Manage all users, movers, and bookings
- Review and approve mover verification documents
- Process manual Stripe transfers and batch payout operations
- Respond to support tickets with AI-assisted suggested responses
- Send targeted email campaigns to customers, movers, or specific users
- Monitor abandoned bookings and recovery rates
- View real-time booking trends and revenue analytics

---

## Core Capabilities

### 1. Instant Booking with Transparent Pricing
A multi-step booking flow captures pickup/dropoff locations, load details, access difficulty, and preferred date. Prices are calculated in real time using a 7-component dynamic pricing model tied to vehicle class.

### 2. AI Photo-Based Pricing (Vision Engine 2.0)
Customers upload photos of items to be moved. The system uses GPT-4o Vision to identify furniture, match against a ground-truth database of 50+ item types, calculate volume, recommend vehicle class, and estimate mover requirements — all in seconds.

### 3. Smart Proximity Matching (PrecisionMatch)
When a booking is created, the platform identifies the top 5 nearest available movers within a 15–50 km expanding radius. Movers are ranked by distance, vehicle compatibility (single-tier upgrade allowed), and availability. Job notifications expire after 10 minutes.

### 4. Real-Time GPS Tracking
During active moves, movers share GPS location updates every 30 seconds. Customers see a live map with the mover's position, route, and estimated arrival time. A "Live" badge indicates movers who have updated location within the last hour.

### 5. Secure Payments with Automatic Splitting
Stripe processes all payments with PCI-compliant card handling. Upon completion, the platform automatically splits funds: 85% to the mover's Stripe Connect account, 15% retained as platform commission. Movers receive payouts directly to their bank account.

### 6. Multi-Channel Notifications
The platform sends notifications via email (Resend), SMS (Telnyx), WebSocket real-time alerts (with audio), and an in-app inbox system. Notifications cover job opportunities, booking status updates, payment confirmations, and support ticket responses.

### 7. Progressive Web App (PWA)
The platform is installable on mobile devices, providing a native app-like experience with offline support hints, push notification readiness, and responsive design optimized for Calgary's mobile-first user base.

### 8. Comprehensive Admin Portal
An investor-ready admin dashboard provides real-time visibility into platform health: total/weekly/monthly bookings, revenue, conversion rates, user statistics, mover verification status, abandoned booking recovery rates, and 7-day booking trend charts.
