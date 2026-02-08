# 02 — Architecture

**Version:** 1.0  
**Date:** February 8, 2026

---

## Component Overview

The LervIT platform follows a monorepo architecture with three primary layers:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18, TypeScript, Vite | Mobile-first SPA with role-based routing |
| **Backend** | Express.js, TypeScript, ESM | RESTful API, business logic, integrations |
| **Database** | PostgreSQL (Neon Serverless) | Persistent data store via Drizzle ORM |
| **Shared** | TypeScript modules | End-to-end type safety across frontend and backend |

### Frontend
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite (with hot module replacement)
- **Routing:** Wouter (lightweight client-side router)
- **Data Fetching:** TanStack Query v5 (caching, mutations, optimistic updates)
- **Styling:** Tailwind CSS with shadcn/ui component library
- **Animations:** Framer Motion for micro-interactions and page transitions
- **Maps:** Google Maps JavaScript API via `@react-google-maps/api`

### Backend
- **Runtime:** Node.js with Express.js
- **Language:** TypeScript (ESM modules)
- **Validation:** Zod schemas derived from Drizzle ORM table definitions
- **Authentication:** Session-based (connect-pg-simple for PostgreSQL session store)
- **File Upload:** Multer for multipart form data handling
- **Logging:** Pino-based structured JSON logging
- **Background Jobs:** node-cron for scheduled tasks

### External Services
- **Payments:** Stripe (payments, Stripe Connect for mover payouts)
- **AI:** OpenAI GPT-4o (Vision Engine, auto-quote predictor, support copilot)
- **Maps:** Google Maps Distance Matrix API (geocoding, driving distance/time)
- **Email:** Resend (transactional emails, campaign emails)
- **SMS:** Telnyx (OTP verification, booking alerts, mover notifications)
- **Search:** SerpAPI (data enrichment)

---

## Interfaces and Data Flow

```
Customer Browser                   Mover Browser
      |                                  |
      v                                  v
  [React SPA] ---- HTTP/WS -----> [Express API]
      |                                  |
      |                            [Middleware]
      |                            - Session Auth
      |                            - Zod Validation
      |                            - Multer Upload
      |                                  |
      |                            [Route Handlers]
      |                            - Auth Routes
      |                            - Booking Routes
      |                            - Mover Routes
      |                            - Payment Routes
      |                            - Admin Routes
      |                                  |
      |                            [Service Layer]
      |                            - Storage Interface
      |                            - Pricing Calculator
      |                            - Matching Engine
      |                            - Vision Engine v2
      |                            - Notification Service
      |                                  |
      v                                  v
  [Google Maps API]             [PostgreSQL (Neon)]
  [Stripe.js]                   [Object Storage]
                                [Stripe API]
                                [OpenAI API]
                                [Resend API]
                                [Telnyx API]
```

---

## High-Level Architecture Diagram

*Rendered diagram: see `diagrams/diagram_01_system_architecture.png`*

```mermaid
graph TB
    subgraph "Client Layer"
        CUI[Customer UI<br/>React SPA]
        MUI[Mover UI<br/>React SPA]
        AUI[Admin Portal<br/>React SPA]
    end

    subgraph "API Layer"
        API[Express.js API Server]
        WS[WebSocket Server<br/>Real-Time Notifications]
        CRON[Cron Scheduler<br/>Background Jobs]
    end

    subgraph "Business Logic"
        PRICE[Pricing Calculator<br/>PrecisionMatch Pricing]
        MATCH[Matching Engine<br/>Proximity Algorithm]
        VISION[Vision Engine v2<br/>AI Item Identification]
        NOTIFY[Notification Service<br/>Email + SMS + Push]
    end

    subgraph "Data Layer"
        DB[(PostgreSQL<br/>Neon Serverless)]
        OBJ[Object Storage<br/>Image Uploads]
    end

    subgraph "External Services"
        STRIPE[Stripe<br/>Payments + Connect]
        OPENAI[OpenAI GPT-4o<br/>Vision + NLP]
        GMAPS[Google Maps API<br/>Distance Matrix]
        RESEND[Resend<br/>Email Delivery]
        TELNYX[Telnyx<br/>SMS Delivery]
    end

    CUI --> API
    MUI --> API
    AUI --> API
    MUI --> WS

    API --> PRICE
    API --> MATCH
    API --> VISION
    API --> NOTIFY
    API --> DB
    API --> OBJ

    PRICE --> GMAPS
    MATCH --> GMAPS
    VISION --> OPENAI
    NOTIFY --> RESEND
    NOTIFY --> TELNYX
    API --> STRIPE
    WS --> DB
    CRON --> DB
    CRON --> NOTIFY

    STRIPE -->|Webhooks| API
```

---

## Sequence Diagram: Quote to Book to Complete to Payout

*Rendered diagram: see `diagrams/diagram_02_booking_sequence.png`*

```mermaid
sequenceDiagram
    participant C as Customer
    participant UI as React Frontend
    participant API as Express API
    participant DB as PostgreSQL
    participant AI as OpenAI GPT-4o
    participant GM as Google Maps
    participant S as Stripe
    participant M as Mover
    participant WS as WebSocket
    participant N as Notifications

    Note over C, N: Phase 1 — Quote & Booking

    C->>UI: Enter pickup/dropoff addresses
    UI->>GM: Geocode addresses
    GM-->>UI: Coordinates + distance
    C->>UI: Upload item photos
    UI->>API: POST /api/ai/identify (photo)
    API->>AI: GPT-4o Vision analysis
    AI-->>API: Item identification + dimensions
    API->>DB: Store identified items
    API-->>UI: Items + volume + vehicle recommendation
    UI->>UI: Calculate real-time price (shared/pricing.ts)
    UI-->>C: Display price breakdown

    C->>UI: Confirm booking
    UI->>API: POST /api/bookings
    API->>DB: Create booking (pending_payment)
    API-->>UI: Booking ID

    Note over C, N: Phase 2 — Payment

    UI->>API: POST /api/bookings/:id/create-payment-intent
    API->>S: Create PaymentIntent (destination charge)
    S-->>API: Client secret
    API-->>UI: Client secret
    UI->>S: Confirm payment (Stripe.js)
    S-->>UI: Payment success
    UI->>API: POST /api/bookings/:id/confirm-payment
    API->>DB: Update status → pending
    API->>N: Send confirmation email/SMS to customer

    Note over C, N: Phase 3 — Mover Matching & Assignment

    API->>DB: Find available movers (location, vehicle)
    API->>GM: Distance Matrix (mover → pickup)
    GM-->>API: Driving distances + ETAs
    API->>API: Rank top 5 nearest compatible movers
    API->>DB: Create job notifications (10min expiry)
    API->>WS: Push notifications to movers
    API->>N: SMS alerts to movers

    M->>WS: Receive job notification (audio alert)
    M->>API: POST /api/job-notifications/:id/accept
    API->>DB: Assign mover, status → confirmed
    API->>N: Notify customer of mover assignment

    Note over C, N: Phase 4 — Active Move & Tracking

    M->>API: PATCH /api/bookings/:id/status (en_route_to_pickup)
    API->>DB: Update status
    M->>API: POST /api/bookings/:id/location (GPS every 30s)
    API->>DB: Store current location
    C->>UI: View live tracking map
    UI->>API: GET /api/bookings/:id (poll location)
    API-->>UI: Current mover location + ETA

    M->>API: Progress: loading → en_route_to_dropoff → unloading → completed
    API->>DB: Update status at each stage
    API->>N: Status update notifications to customer

    Note over C, N: Phase 5 — Completion & Payout

    API->>DB: Status → completed
    API->>S: Create Transfer (85% to mover's Connect account)
    S-->>API: Transfer confirmation
    API->>DB: Record mover earnings
    API->>N: Earnings notification to mover
    API->>N: Review prompt to customer
    C->>API: POST /api/reviews (rating + comment)
    API->>DB: Store review, update mover rating
```

---

## Shared Module Architecture

The `/shared` directory contains TypeScript modules used by both frontend and backend, ensuring type consistency:

| Module | Purpose |
|--------|---------|
| `schema.ts` | Drizzle ORM table definitions, Zod insert schemas, TypeScript types |
| `pricing.ts` | Vehicle class configuration, price calculation, mover earnings |
| `matching.ts` | Proximity matching algorithm, vehicle compatibility, ranking |
| `furniture-database.ts` | Ground-truth furniture specifications (50+ items) |
| `geocoding.ts` | Distance calculation utilities |
| `ai.ts` | AI feature flags for enabling/disabling AI capabilities |
