# MoveDeck by LervIT Technologies Corporation
## Platform-as-a-Service — Full Scope, Execution, Deployment & Hypercare

**Document Version:** 1.0  
**Prepared By:** LervIT Technologies Corporation  
**Date:** May 2026  
**Classification:** Internal Strategy / Investor-Ready

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Positioning](#2-product-vision--positioning)
3. [Market Opportunity](#3-market-opportunity)
4. [Product Scope](#4-product-scope)
   - 4.1 Core Feature Set (MVP)
   - 4.2 Growth Tier Features
   - 4.3 Enterprise Tier Features
   - 4.4 Out of Scope (Phase 1)
5. [Technical Architecture](#5-technical-architecture)
   - 5.1 Multi-Tenancy Design
   - 5.2 Tech Stack
   - 5.3 Infrastructure
   - 5.4 Security & Compliance
6. [Pricing & Revenue Model](#6-pricing--revenue-model)
   - 6.1 Subscription Tiers
   - 6.2 Transaction Fee Model
   - 6.3 Add-Ons
   - 6.4 Revenue Projections (3-Year)
7. [Execution Roadmap](#7-execution-roadmap)
   - 7.1 Phase 0 — Foundation (Weeks 1–4)
   - 7.2 Phase 1 — MVP Launch (Weeks 5–12)
   - 7.3 Phase 2 — Growth Features (Weeks 13–24)
   - 7.4 Phase 3 — Enterprise & API (Weeks 25–40)
8. [Go-to-Market Strategy](#8-go-to-market-strategy)
   - 8.1 Target Segments
   - 8.2 Acquisition Channels
   - 8.3 Pilot Program
   - 8.4 Partnerships
9. [Deployment Plan](#9-deployment-plan)
   - 9.1 Environments
   - 9.2 CI/CD Pipeline
   - 9.3 Database Strategy
   - 9.4 Tenant Provisioning Flow
   - 9.5 Custom Domain & Branding
10. [Hypercare Plan](#10-hypercare-plan)
    - 10.1 Launch Hypercare (Days 1–30)
    - 10.2 Onboarding Experience
    - 10.3 Support Tiers
    - 10.4 SLA Commitments
    - 10.5 Incident Response
    - 10.6 Success Metrics
11. [Team & Resource Requirements](#11-team--resource-requirements)
12. [Risk Register](#12-risk-register)
13. [Legal & Compliance Considerations](#13-legal--compliance-considerations)
14. [Appendix A — Feature Comparison Table](#appendix-a--feature-comparison-table)
15. [Appendix B — Sample API Endpoints](#appendix-b--sample-api-endpoints)
16. [Appendix C — Financial Model Assumptions](#appendix-c--financial-model-assumptions)

---

## 1. Executive Summary

LervIT Technologies Corporation operates a two-sided marketplace connecting customers with freelance movers in Calgary. In building this platform, the engineering team has developed a sophisticated partner operations portal — covering booking dispatch, team management, earnings tracking, compliance document management, Stripe payout integration, and a full audit trail.

This document outlines the strategy to commercialize that portal as a standalone Platform-as-a-Service (PaaS) product under the brand **MoveDeck**, targeting small-to-mid-sized moving companies, freight brokers, and last-mile logistics operators across North America who currently manage operations through spreadsheets, email, or generic project management tools.

**The opportunity is real and underserved.** There are over 17,000 registered moving companies in Canada and the United States. Fewer than 8% use purpose-built operations software. MoveDeck fills that gap with a purpose-built, affordable, immediately deployable back-office platform.

**The core product is already ~80% built.** The primary investment is in multi-tenancy architecture, self-serve billing, and a public-facing signup experience — not a ground-up build.

**Target Year 1 ARR:** $180,000 CAD  
**Target Year 2 ARR:** $540,000 CAD  
**Target Year 3 ARR:** $1,400,000 CAD

---

## 2. Product Vision & Positioning

### Vision Statement
To become the operating system for independent and mid-market moving and logistics companies — the back-office platform they never had the budget to build themselves.

### Positioning Statement
*"MoveDeck gives moving companies the technology of a large enterprise at the price of a subscription. Bookings, dispatch, compliance, payouts, and audit trails — in one place, live in 24 hours."*

### Differentiation
| Competitor Approach | MoveDeck |
|---|---|
| Generic CRMs (HubSpot, Monday) | Purpose-built for moving operations |
| Large ERP solutions ($50k+) | Affordable SaaS ($149–799/mo) |
| Spreadsheet-based workflows | Automated, auditable, real-time |
| No payout tooling | Native Stripe Connect payout management |
| No compliance tracking | Document upload, review, expiry alerts |
| No AI dispatch | Optional AI proximity-matching add-on |

---

## 3. Market Opportunity

### Addressable Market
- **Canada:** ~3,200 licensed moving companies; ~900 in the SMB segment (5–50 employees)
- **United States:** ~14,000 licensed moving companies; ~6,000 in the SMB segment
- **Total Addressable Market (TAM):** ~6,900 SMB moving companies in North America

### Serviceable Addressable Market (SAM)
Targeting English-language, tech-comfortable operators with at least 3 active drivers:
- Estimated SAM: ~2,500 companies

### Serviceable Obtainable Market (SOM — Year 3)
Realistic capture of 2–3% of SAM:
- ~60–75 paying customers by end of Year 3

### Market Pain Points (Primary Research)
1. No single place to see all active jobs, drivers, and status in real-time
2. Driver compliance docs (insurance, CVOR, background checks) expire unnoticed
3. Payout reconciliation between job completion and driver pay is manual and error-prone
4. No audit trail when a customer dispute arises
5. Onboarding new dispatcher staff takes weeks with no standardized tooling

---

## 4. Product Scope

### 4.1 Core Feature Set — Starter Tier (MVP)

These features exist in the LervIT portal today and require multi-tenancy adaptation:

- **Booking Inbox** — View, filter, search, and action all routed bookings in a status-tabbed interface
- **Booking Detail** — Full job detail with status transitions, driver assignment, incident reporting, and proof of completion upload
- **Team Management** — Add/edit/remove drivers and crew members with role assignments
- **Audit Log** — Full immutable action history with per-entry insight annotations
- **CSV Data Export** — Export bookings, earnings, and audit logs as date-stamped CSV files
- **Partner Onboarding Checklist** — Multi-step guided setup: company info, coverage zones, compliance docs, terms acceptance
- **Legal Agreement Page** — Viewable, printable 19-clause partner agreement with acceptance timestamp
- **Invite-Based Signup** — Secure token-based activation flow for new partner accounts

### 4.2 Growth Tier Features

Features partially built or requiring moderate new development:

- **Earnings Dashboard** — Revenue tracking by booking, monthly summaries, pending/completed split
- **Stripe Connect Payouts** — Native driver payout management via Stripe Connect with onboarding flow
- **Compliance Document Management** — Upload, review-status tracking, expiry date alerts for insurance, licenses, and certifications
- **Incident Reporting** — Log, categorize, and resolve incidents tied to specific bookings
- **Proof of Completion** — Photo and signature upload per delivery
- **Email Notifications** — Automated emails for booking assignments, status updates, and compliance expiry warnings
- **Custom Coverage Zones** — Define and manage geographic service areas
- **Multi-User Roles** — Admin, Dispatcher, Ops Manager, Viewer — with role-based access control

### 4.3 Enterprise Tier Features

New development required:

- **White-Label Branding** — Custom logo, primary color, subdomain (e.g. `ops.acmemovers.com`)
- **Public REST API** — Full CRUD API with API key authentication for integration with TMS, ERP, or custom systems
- **Webhook Events** — Push events (booking.created, booking.completed, incident.reported) to customer endpoints
- **Advanced Analytics** — Booking funnel, driver performance leaderboard, revenue cohorts, fulfilment hours
- **AI Dispatch Add-On** — Proximity-based auto-assignment using Google Maps Distance Matrix + dynamic pricing model
- **SSO / SAML** — Enterprise single sign-on via Google Workspace, Okta, or Microsoft Entra
- **Dedicated Onboarding** — Assigned customer success manager for setup and training
- **SLA Guarantees** — 99.9% uptime SLA with financial credits

### 4.4 Out of Scope — Phase 1

The following will NOT be included in the initial PaaS offering:

- Customer-facing booking portal (that remains LervIT core)
- Mobile native apps (iOS/Android) for drivers
- Real-time GPS tracking map (available as future add-on)
- Automated tax filing or CRA/IRS integration
- Custom report builder
- Multi-currency support (CAD only in Phase 1)
- Offline mode

---

## 5. Technical Architecture

### 5.1 Multi-Tenancy Design

The current LervIT portal uses a single-tenant model (one partner per database schema context). Converting to true multi-tenancy is the primary technical workload of Phase 0.

**Chosen Approach: Row-Level Tenancy**

All tenant data is stored in shared PostgreSQL tables with a `tenant_id` foreign key column. This approach:
- Is the lowest-cost to operate at early scale
- Requires careful row-level security (RLS) policy enforcement at the ORM layer
- Allows migration to schema-per-tenant later if a single large customer requires isolation

**Key Changes Required:**
- Add `tenant_id UUID` to all relevant tables: `partners`, `partner_users`, `partner_invites`, `bookings`, `booking_assignments`, `partner_incidents`, `proof_of_completion`, `compliance_docs`, `partner_audit_log`, `coverage_zones`
- Create a `tenants` table: `id`, `name`, `slug`, `plan`, `stripeCustomerId`, `stripeSubscriptionId`, `createdAt`, `trialEndsAt`, `logoUrl`, `primaryColor`, `customDomain`
- Enforce `tenant_id` on every server-side query via middleware context injection
- Create tenant-scoped API key system for Enterprise API access

**Tenant Isolation Enforcement:**
```
Request → Auth Middleware → Resolve tenant_id from session/API key
                         → Inject tenant_id into all ORM query contexts
                         → Any query without tenant_id throws 403
```

### 5.2 Tech Stack

The existing stack requires no replacement — it is production-grade and already deployed:

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Wouter + TanStack Query v5 |
| UI Components | shadcn/ui + Radix UI + Tailwind CSS |
| Backend | Express.js + Node.js (ESM, TypeScript) |
| ORM | Drizzle ORM |
| Database | PostgreSQL via Neon (serverless, auto-scaling) |
| Payments | Stripe (subscriptions + Connect for payouts) |
| Email | Resend |
| SMS | Telnyx |
| File Storage | Replit Object Storage (uploads, compliance docs) |
| Auth | Session-based (connect-pg-simple) + planned OAuth/SSO |
| Logging | Pino structured JSON |
| Background Jobs | node-cron |

### 5.3 Infrastructure

**Phase 1 (0–100 tenants):**
- Single Replit deployment with autoscale enabled
- Neon PostgreSQL serverless (scales to demand, no provisioning)
- Replit Object Storage for document/image uploads
- Estimated monthly infra cost: $150–400 CAD

**Phase 2 (100–500 tenants):**
- Migrate to dedicated cloud hosting (Railway, Render, or AWS Fargate)
- Add Redis for session caching and background job queuing
- CDN (Cloudflare) for static assets and DDoS protection
- Estimated monthly infra cost: $600–1,200 CAD

**Phase 3 (500+ tenants):**
- Kubernetes cluster with horizontal pod autoscaling
- Read replicas for analytics queries
- Multi-region deployment (Canada + US East)
- Estimated monthly infra cost: $2,000–5,000 CAD

### 5.4 Security & Compliance

- All data encrypted at rest (AES-256 via Neon) and in transit (TLS 1.3)
- Tenant isolation enforced at ORM layer with automated test coverage
- API keys hashed before storage (SHA-256)
- Compliance document uploads scanned for malware via object storage pipeline
- Admin audit log is append-only — no delete or update permitted
- Session tokens rotated on privilege change
- Stripe webhook signature verification on all payment events
- PIPEDA (Canada) compliant data handling — data residency in Canada
- SOC 2 Type II audit planned for Year 2 (required for enterprise sales)

---

## 6. Pricing & Revenue Model

### 6.1 Subscription Tiers

| Tier | Monthly (CAD) | Annual (CAD) | Seats | Key Limits |
|---|---|---|---|---|
| **Starter** | $149 | $1,490 (~17% off) | Up to 5 users | 200 bookings/mo |
| **Growth** | $349 | $3,490 (~17% off) | Up to 15 users | 1,000 bookings/mo |
| **Enterprise** | $799+ | Custom | Unlimited | Unlimited, custom domain, SLA |

**14-day free trial** on Starter and Growth tiers — no credit card required.

### 6.2 Transaction Fee Model (Alternative / Add-On)

For companies that prefer usage-based pricing:
- **$2.50 CAD per booking** routed through the platform
- Available as standalone or in place of the Starter subscription
- Automatically tracked via `booking_assignments` table

### 6.3 Add-Ons (All Tiers)

| Add-On | Monthly Price (CAD) | Description |
|---|---|---|
| AI Dispatch Engine | $199 | Proximity matching + dynamic pricing algorithm |
| Compliance Manager Pro | $99 | Expiry alerts, multi-doc workflows, bulk upload |
| White-Label Branding | $149 | Custom logo, colors, subdomain |
| SMS Notifications | $49 + usage | Driver and customer SMS alerts via Telnyx |
| API Access | $199 | Full REST API + webhook events |
| Extra Seats (5-pack) | $79 | For teams exceeding plan seat limits |

### 6.4 Revenue Projections (3-Year)

#### Assumptions
- Month 1–3: Pilot customers (3 free, 2 paid Starter)
- Month 4–12: Word-of-mouth + targeted outreach; 3–5 new paid customers/month
- Year 2: Content marketing + partnerships driving 8–12 new customers/month
- Year 3: Sales team hired; enterprise deals close at $799–2,000/mo

#### Projection Table

| Period | Paying Customers | Avg MRR/Customer | MRR | ARR |
|---|---|---|---|---|
| End of Year 1 | 12 | $249 | $2,988 | $35,856 |
| End of Year 2 | 38 | $349 | $13,262 | $159,144 |
| End of Year 3 | 72 | $449 | $32,328 | $387,936 |

*Note: Conservative estimates. Does not include transaction fee revenue, add-on revenue, or enterprise deals. With add-ons and enterprise contracts, Year 3 ARR realistically reaches $500,000–700,000 CAD.*

#### Break-Even Analysis
- Fixed monthly costs (infra + tools): ~$800 CAD
- Break-even at: **4 Starter customers or 3 Growth customers**
- Expected break-even month: **Month 5 of launch**

---

## 7. Execution Roadmap

### 7.1 Phase 0 — Foundation (Weeks 1–4)

**Goal:** Multi-tenancy in place; not yet customer-facing.

| Task | Owner | Effort |
|---|---|---|
| Add `tenant_id` to all partner tables via Drizzle migration | Backend Dev | 3 days |
| Create `tenants` table and Drizzle schema | Backend Dev | 1 day |
| Middleware: inject `tenant_id` from session into all queries | Backend Dev | 2 days |
| Automated test: tenant A cannot read tenant B data | QA | 1 day |
| Stripe Billing integration: create subscription on signup | Full-Stack Dev | 3 days |
| Self-serve signup page (company name, email, password, plan select) | Frontend Dev | 2 days |
| Stripe webhook: activate/deactivate tenant based on payment status | Backend Dev | 1 day |
| Email: welcome email on signup, trial expiry reminders | Backend Dev | 1 day |
| Internal admin dashboard: view all tenants, plan, MRR | Full-Stack Dev | 2 days |

**Phase 0 Exit Criteria:**
- A new company can sign up, pay, and receive an isolated partner portal instance
- A LervIT admin can see all tenants and their subscription status
- Tenant A's data is provably invisible to Tenant B

### 7.2 Phase 1 — MVP Launch (Weeks 5–12)

**Goal:** First 5 paying customers live; product feedback loop established.

| Task | Owner | Effort |
|---|---|---|
| Public marketing landing page at `movedeck.io` | Frontend Dev / Designer | 1 week |
| Onboarding wizard improvements (guided, step-by-step for new tenants) | Frontend Dev | 3 days |
| In-app plan upgrade/downgrade flow | Full-Stack Dev | 2 days |
| Usage metering (booking count vs. plan limit) | Backend Dev | 2 days |
| "Upgrade to unlock" paywalls for Growth features | Frontend Dev | 1 day |
| Customer support widget integration (Crisp or Intercom) | Full-Stack Dev | 1 day |
| Help center (basic — 10 articles covering onboarding + key features) | Content | 1 week |
| Pilot outreach to 10 Calgary-area moving companies | Founder / Sales | Ongoing |
| User feedback sessions (2x per pilot customer per month) | PM | Ongoing |

**Phase 1 Exit Criteria:**
- 3 paid customers active
- NPS score from pilot customers ≥ 30
- No P1 bugs open for more than 24 hours

### 7.3 Phase 2 — Growth Features (Weeks 13–24)

**Goal:** 15 paying customers; Growth tier adoption; first enterprise prospect.

| Task | Owner | Effort |
|---|---|---|
| White-label branding (logo upload, color picker, custom subdomain routing) | Full-Stack Dev | 1 week |
| Advanced analytics tab (funnel, cohorts, driver leaderboard) | Frontend Dev | 1 week |
| Compliance expiry alert system (cron job → email 30/7/1 day before) | Backend Dev | 3 days |
| Mobile-responsive audit log improvements | Frontend Dev | 2 days |
| Referral program ("Give 1 month, get 1 month") | Full-Stack Dev | 3 days |
| Integration: Zapier / Make webhook triggers | Backend Dev | 1 week |
| Case study content: 2 pilot customer stories | Marketing | 2 weeks |
| Pricing page A/B test (transaction fee vs. subscription) | Growth | Ongoing |
| Hire: Part-time customer success manager | Hiring | — |

**Phase 2 Exit Criteria:**
- 15 paying customers
- Growth tier accounts for ≥40% of MRR
- Churn rate below 5% monthly

### 7.4 Phase 3 — Enterprise & API (Weeks 25–40)

**Goal:** First enterprise contract; public API launch; $30k+ MRR.

| Task | Owner | Effort |
|---|---|---|
| Full REST API v1 with API key auth + rate limiting | Backend Dev | 2 weeks |
| Webhook event system (booking.*, incident.*, compliance.*) | Backend Dev | 1 week |
| API documentation site (Swagger / Readme.io) | Backend Dev | 1 week |
| SSO / SAML integration (Google Workspace + Okta) | Backend Dev | 2 weeks |
| AI Dispatch Engine packaged as standalone add-on | Full-Stack Dev | 1 week |
| Dedicated enterprise onboarding flow + CSM handoff | PM + CSM | Ongoing |
| SOC 2 Type II audit preparation | Security / Legal | 3 months |
| Multi-region infrastructure (US East expansion) | DevOps | 2 weeks |
| Hire: Full-time sales development representative | Hiring | — |

**Phase 3 Exit Criteria:**
- 1 signed enterprise contract ($799+/mo)
- Public API has at least 3 active integration partners
- MRR exceeds $30,000 CAD

---

## 8. Go-to-Market Strategy

### 8.1 Target Segments

**Primary — Independent Moving Companies (1–20 employees)**
- Currently using: paper, WhatsApp groups, Google Sheets
- Budget: $100–300/mo for software
- Decision-maker: Owner-operator
- Sales cycle: 1–2 weeks
- Acquisition: direct outreach, Facebook Groups, moving industry associations

**Secondary — Mid-Market Moving Companies (20–100 employees)**
- Currently using: generic CRMs or legacy dispatch software
- Budget: $300–800/mo
- Decision-maker: Operations Manager or GM
- Sales cycle: 3–6 weeks
- Acquisition: content marketing, LinkedIn, trade shows (Canadian Movers Association)

**Tertiary — Freight Brokers & Last-Mile Logistics**
- Currently using: expensive TMS platforms or custom built tools
- Budget: $800–2,000/mo
- Decision-maker: VP Operations or CTO
- Sales cycle: 2–4 months
- Acquisition: enterprise sales outreach, partnership with logistics consultants

### 8.2 Acquisition Channels

**Content Marketing (Medium effort, High ROI)**
- Blog: "How to manage 50 moves a month without losing your mind"
- SEO targets: "moving company dispatch software", "driver management app for movers", "moving company operations software Canada"
- YouTube: 60-second product demo videos showing specific pain points solved

**Direct Outreach (High effort, High conversion)**
- Identify 200 moving companies in Calgary, Edmonton, Vancouver, Toronto via Google Maps
- Personalized cold email sequence (3 touches over 10 days)
- LinkedIn outreach to Operations Managers

**Community Presence**
- Canadian Movers Association (CMA) — event sponsorship + member discount
- Moving company Facebook Groups (large organic communities)
- Reddit: r/moving, r/smallbusiness

**Partnership Channel**
- Stripe: Listed as Stripe Partner app for the logistics vertical
- Moving industry consultants who advise on technology adoption
- Commercial truck insurance brokers (they talk to every moving company)

### 8.3 Pilot Program

**Structure:**
- 5 pilot companies selected from Calgary moving industry network
- 3 months free on Growth tier ($349/mo value = $1,047 per pilot)
- In exchange: 2 feedback sessions per month, written testimonial, logo for website

**Pilot Success Criteria:**
- 80% of pilot users complete onboarding within first week
- At least 3 of 5 convert to paid at end of pilot period
- At least 2 provide a usable case study or quote

**Total Pilot Investment:** ~$5,235 in forgone revenue, offset by product improvement value

### 8.4 Partnerships

| Partner Type | Target | Value Exchange |
|---|---|---|
| Moving industry consultants | 3 relationships by Month 6 | Revenue share (15%) on referred customers |
| Commercial vehicle insurers | 2 broker relationships | Co-marketing; compliance doc integration |
| Moving supply companies | 1 national partner | Bundle discount offer to their customers |
| Accounting software | QuickBooks / Wave integration | Earnings export directly to accounting |

---

## 9. Deployment Plan

### 9.1 Environments

| Environment | Purpose | URL Pattern |
|---|---|---|
| Development | Active development, local testing | `localhost:5000` |
| Staging | Pre-release QA, customer demos | `staging.movedeck.io` |
| Production | Live customer traffic | `movedeck.io` / `app.movedeck.io` |
| Tenant Custom Domains | White-label enterprise customers | `ops.{customer-domain}.com` |

### 9.2 CI/CD Pipeline

**Tooling:** GitHub Actions (or Replit Deployments for Phase 1)

**Pipeline Stages:**
1. **On Pull Request:** TypeScript type check + ESLint + unit tests
2. **On Merge to `main`:** Automated deploy to Staging; smoke test suite runs
3. **On Release Tag:** Deploy to Production with database migration run automatically
4. **Post-Deploy:** Synthetic uptime monitor pings key endpoints; alert on failure

**Database Migration Policy:**
- All schema changes via Drizzle ORM migration files (versioned, sequential)
- Migrations run in a pre-deploy step with automatic rollback on failure
- No destructive migrations (column drops) without a 2-week deprecation cycle

### 9.3 Database Strategy

**Phase 1:** Single Neon PostgreSQL database, row-level tenant isolation
- All tables include `tenant_id UUID NOT NULL` with foreign key to `tenants.id`
- Database index on `tenant_id` for all high-traffic tables
- Neon autoscaling handles burst traffic without manual provisioning

**Phase 2:** Dedicated Neon project per large tenant (Enterprise tier option)
- Activated on request or when tenant exceeds 5,000 bookings/month
- Automated provisioning script creates isolated project and applies migrations

**Backup Policy:**
- Neon provides continuous WAL-based backups with point-in-time recovery (7-day window on Starter, 30-day on Enterprise)
- Weekly full backup exported to object storage as additional safety layer

### 9.4 Tenant Provisioning Flow

When a new company signs up, the following automated sequence runs:

```
1. Signup form submitted (company name, email, password, plan)
2. Stripe customer + subscription created (or trial started)
3. tenants row inserted: { id, name, slug, plan, stripeCustomerId, trialEndsAt }
4. Default partner_users row created for the owner (role: partner_admin)
5. Welcome email sent via Resend with login link + onboarding guide
6. Tenant dashboard accessible immediately at app.movedeck.io/{slug}
7. Onboarding checklist state initialized (step 1 of 6)
```

**Provisioning Time Target:** Under 10 seconds end-to-end

### 9.5 Custom Domain & Branding (Enterprise)

1. Customer provides their desired subdomain (e.g. `ops.acmemovers.com`)
2. LervIT provides a CNAME target (`cname.movedeck.io`)
3. Customer adds CNAME record at their DNS provider
4. Cloudflare SSL certificate auto-provisioned via ACME
5. Tenant record updated: `{ customDomain: "ops.acmemovers.com", logoUrl, primaryColor }`
6. Portal renders with customer branding — LervIT not visible to end users

---

## 10. Hypercare Plan

### 10.1 Launch Hypercare (Days 1–30)

The 30 days following the public launch of MoveDeck receive elevated attention from every member of the LervIT team.

**Daily Actions (Days 1–7):**
- Review all error logs morning and evening
- Monitor Stripe webhook delivery success rate
- Review onboarding completion funnel daily — identify and fix drop-off points
- Personally email every new signup within 4 hours offering a live onboarding call
- Maintain a "Launch Issues" Notion doc — every bug, confusion, or friction point logged

**Weekly Actions (Days 8–30):**
- Weekly product review call with all pilot customers
- Ship a patch release every Thursday addressing top friction items
- Send a "Week X of MoveDeck" update email to all active customers highlighting improvements made based on their feedback
- Review support ticket volume, categories, and resolution times

### 10.2 Onboarding Experience

**Onboarding Philosophy:** A customer who completes their first booking dispatch through MoveDeck within their first 7 days will have a 3x higher 90-day retention rate. Every onboarding touchpoint is designed to reach that milestone.

**In-App Onboarding Checklist:**
1. Complete company profile (name, address, logo)
2. Add your first driver/crew member
3. Define your coverage zone
4. Upload at least one compliance document
5. Connect Stripe for payouts
6. Accept the partner terms agreement

Each step has inline help text, a video link, and a "Done" confirmation. Progress is persistent and visible in the sidebar.

**Onboarding Emails (Automated Sequence):**
| Day | Email Subject |
|---|---|
| Day 0 | Welcome to MoveDeck — Your portal is ready |
| Day 1 | Quick tip: Add your first driver in 60 seconds |
| Day 3 | Have you set up your coverage zones? |
| Day 7 | How's it going? Book a 15-min call with our team |
| Day 14 | You're halfway through your free trial |
| Day 12 | Trial ending in 2 days — here's what you'll keep |

**Live Onboarding Call:**
- Available for all Growth and Enterprise customers
- 45-minute video call with screen share
- Covers: full portal walkthrough, first booking dispatch, compliance setup, Stripe connection

### 10.3 Support Tiers

| Tier | Channel | Response Time | Hours |
|---|---|---|---|
| **Starter** | In-app chat + email | 24 business hours | Mon–Fri, 9–5 MT |
| **Growth** | In-app chat + email + video call | 8 business hours | Mon–Fri, 8–6 MT |
| **Enterprise** | Dedicated CSM + Slack channel | 2 hours (critical), 4 hours (standard) | Mon–Fri, 7am–9pm MT; weekend on-call for P1 |

**Support Tools:**
- Crisp or Intercom widget embedded in portal (Phase 1)
- Help center with searchable articles (Mintlify or Notion public docs)
- Status page at `status.movedeck.io` (Instatus or BetterUptime)

### 10.4 SLA Commitments

| Tier | Uptime SLA | Measurement | Credit Policy |
|---|---|---|---|
| Starter | 99.5% | Monthly | None |
| Growth | 99.9% | Monthly | 5% credit per 0.1% below SLA |
| Enterprise | 99.95% | Monthly | 10% credit per incident exceeding 15 minutes of downtime |

**SLA Exclusions:** Scheduled maintenance (communicated 72h in advance), third-party provider outages (Stripe, Neon, Resend), customer-caused issues.

### 10.5 Incident Response

**Severity Definitions:**

| Severity | Definition | Response Time | Communication |
|---|---|---|---|
| P0 — Critical | Complete platform outage; all tenants affected | 15 minutes | Status page + email to all customers within 30 min |
| P1 — High | Core feature broken for >50% of tenants (e.g. booking dispatch fails) | 1 hour | Status page update; enterprise customers notified directly |
| P2 — Medium | Feature degraded but workaround exists | 4 hours | Status page update |
| P3 — Low | Minor UX issue, cosmetic bug, single tenant affected | 24 hours | Support ticket resolution |

**Incident Runbook:**
1. Alert fires (uptime monitor / customer report)
2. On-call engineer acknowledges within 15 minutes
3. Status page updated to "Investigating"
4. Root cause identified and communicated within 1 hour
5. Fix deployed; post-deployment verification
6. Status page updated to "Resolved"
7. Post-mortem written within 48 hours for P0/P1 incidents
8. Post-mortem shared with affected Enterprise customers

### 10.6 Success Metrics

**Customer Health Score (calculated weekly per tenant):**
- Bookings dispatched in last 7 days (40% weight)
- Login frequency (20% weight)
- Onboarding checklist completion % (20% weight)
- Support tickets opened (negative weight, 10%)
- Plan tier (10%)

**Platform-Level KPIs (reviewed weekly):**

| Metric | Target — Month 3 | Target — Month 12 |
|---|---|---|
| MRR | $1,500 | $7,500 |
| Active tenants | 8 | 30 |
| Trial-to-paid conversion | 35% | 45% |
| Monthly churn rate | <8% | <4% |
| Onboarding completion (7-day) | 60% | 75% |
| NPS score | 35 | 50 |
| P1 incident frequency | <2/month | <1/month |
| Avg support resolution time | <12 hours | <6 hours |

---

## 11. Team & Resource Requirements

### Phase 1 Team (Months 1–6)

| Role | Commitment | Responsibility |
|---|---|---|
| Founder / CEO | 60% | GTM, sales, investor relations, product direction |
| Full-Stack Developer (current LervIT dev) | 80% | Multi-tenancy, billing, new features |
| Part-Time Designer | 20% | Marketing site, onboarding UX, brand |
| Part-Time Content Writer | 20% | Help center articles, blog, email sequences |

**Total Phase 1 Monthly Labor Cost (est.):** $12,000–18,000 CAD

### Phase 2 Team (Months 7–18)

Add:
| Role | Type | Responsibility |
|---|---|---|
| Customer Success Manager | Full-time | Onboarding, retention, upsell |
| Sales Development Rep | Full-time | Outbound prospecting, demo calls |
| Additional Backend Dev | Full-time or contract | API, enterprise features, scalability |

**Total Phase 2 Monthly Labor Cost (est.):** $28,000–38,000 CAD

### Phase 3 Team (Months 19–36)

Add:
| Role | Type |
|---|---|
| VP Sales | Full-time |
| DevOps / Platform Engineer | Full-time |
| Marketing Manager | Full-time |

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Low trial-to-paid conversion | Medium | High | Shorten onboarding; offer monthly billing with no lock-in; improve activation milestone |
| Tenant data breach / cross-tenant data leak | Low | Critical | Automated isolation tests in CI; penetration test before launch; cyber insurance |
| Stripe account suspension | Low | High | Maintain compliance; never store raw card data; keep fraud rate below 0.1% |
| LervIT core product demand consumes dev capacity | High | Medium | Dedicated sprint capacity for MoveDeck; separate repo or clearly scoped modules |
| Competitor launches similar product | Medium | Medium | Speed to market advantage; build strong customer relationships early; focus on service quality |
| Customer churn due to product immaturity | High | Medium | Close feedback loop; hypercare plan; ship fast; monthly roadmap transparency |
| Neon / infrastructure outage | Low | High | Multi-region deployment in Phase 3; Neon SLA is 99.95%; automated alerts |
| Key developer leaves LervIT | Low | High | Document architecture; avoid single-person knowledge silos; code review culture |

---

## 13. Legal & Compliance Considerations

### Contractual
- **Master Subscription Agreement (MSA):** Required for all customers; covers data ownership, acceptable use, payment terms, termination, liability limitation
- **Data Processing Agreement (DPA):** Required for any EU or enterprise customers; covers GDPR-equivalent obligations
- **Partner Terms of Service:** Already built into the portal onboarding flow (19 clauses including IP protection and governing law)

### Data Residency
- Phase 1: All data stored in Canada (Neon Canada East region, Replit Canadian deployment)
- Enterprise customers may request dedicated US-region instance (Phase 3)
- Clearly disclosed in onboarding and MSA: *"Your data is stored in Canadian data centers governed by PIPEDA"*

### Intellectual Property
- All portal code is wholly owned by LervIT Technologies Corporation
- No open-source licenses with copyleft provisions in the critical path
- Customer data remains the property of the customer at all times
- LervIT may use anonymized, aggregated data for platform improvement and benchmarking (disclosed in DPA)

### Insurance
- Cyber liability insurance: obtain before public launch (est. $2,400–4,800 CAD/year for coverage up to $1M)
- Errors & Omissions (E&O) insurance: recommended before first enterprise contract

### Regulatory
- PIPEDA (Personal Information Protection and Electronic Documents Act) compliance required for Canadian operations
- Payment Card Industry (PCI DSS): LervIT never stores raw card data; Stripe handles all card processing; PCI compliance inherited from Stripe
- SOC 2 Type II: plan for Year 2; required for enterprise prospects in regulated industries

---

## Appendix A — Feature Comparison Table

| Feature | Starter $149/mo | Growth $349/mo | Enterprise $799+/mo |
|---|---|---|---|
| Booking inbox & dispatch | Yes | Yes | Yes |
| Team management (drivers/crew) | Up to 5 users | Up to 15 users | Unlimited |
| Audit log | Yes | Yes | Yes |
| CSV data export | Yes | Yes | Yes |
| Onboarding checklist | Yes | Yes | Yes |
| Legal agreement & history | Yes | Yes | Yes |
| Earnings dashboard | No | Yes | Yes |
| Stripe Connect payouts | No | Yes | Yes |
| Compliance document management | No | Yes | Yes |
| Incident reporting | No | Yes | Yes |
| Proof of completion upload | No | Yes | Yes |
| Email notifications | Basic | Full | Full + Custom |
| Coverage zone management | No | Yes | Yes |
| Advanced analytics | No | No | Yes |
| White-label branding | No | No | Yes (add-on) |
| Custom domain | No | No | Yes |
| REST API access | No | No | Yes (add-on) |
| Webhook events | No | No | Yes (add-on) |
| SSO / SAML | No | No | Yes |
| AI Dispatch Engine | Add-on | Add-on | Add-on |
| Dedicated CSM | No | No | Yes |
| SLA guarantee | None | 99.9% | 99.95% |
| Bookings per month | 200 | 1,000 | Unlimited |
| Data retention | 12 months | 24 months | Unlimited |

---

## Appendix B — Sample API Endpoints

The following REST API endpoints are planned for the Enterprise tier (Phase 3):

```
Authentication
  POST   /api/v1/auth/token                    — Exchange API key for session token

Tenants
  GET    /api/v1/tenant                         — Get current tenant profile
  PATCH  /api/v1/tenant                         — Update tenant settings

Bookings
  GET    /api/v1/bookings                       — List bookings (filterable by status, date)
  GET    /api/v1/bookings/:id                   — Get single booking detail
  POST   /api/v1/bookings                       — Create a booking
  PATCH  /api/v1/bookings/:id/status            — Update booking enterprise status
  POST   /api/v1/bookings/:id/assign            — Assign driver to booking

Team
  GET    /api/v1/team                           — List all team members
  POST   /api/v1/team                           — Create team member
  PATCH  /api/v1/team/:id                       — Update team member
  DELETE /api/v1/team/:id                       — Remove team member

Compliance
  GET    /api/v1/compliance                     — List compliance documents
  POST   /api/v1/compliance                     — Upload a compliance document
  GET    /api/v1/compliance/expiring            — Documents expiring within 30 days

Incidents
  GET    /api/v1/incidents                      — List all incidents
  POST   /api/v1/incidents                      — Report a new incident
  PATCH  /api/v1/incidents/:id/resolve          — Mark incident resolved

Webhooks
  GET    /api/v1/webhooks                       — List configured webhooks
  POST   /api/v1/webhooks                       — Register a webhook endpoint
  DELETE /api/v1/webhooks/:id                   — Remove a webhook

Webhook Event Types:
  booking.created
  booking.status_changed
  booking.completed
  booking.cancelled
  incident.reported
  incident.resolved
  compliance.expiring_soon
  compliance.expired
  team_member.added
  team_member.removed
```

---

## Appendix C — Financial Model Assumptions

### Customer Acquisition Cost (CAC)
- Direct outreach: ~$150 CAD per acquired customer (time cost)
- Content marketing: ~$80 CAD per acquired customer (at scale, Month 12+)
- Blended CAC estimate: $100–200 CAD

### Lifetime Value (LTV)
- Average subscription length: 18 months (based on comparable SMB SaaS benchmarks)
- Average MRR per customer: $280 CAD
- LTV = $280 × 18 = **$5,040 CAD**

### LTV:CAC Ratio
- $5,040 / $150 = **33.6x** — well above the 3:1 benchmark for healthy SaaS

### Payback Period
- CAC / Monthly gross margin per customer
- $150 / ($280 × 0.85 gross margin) = **0.63 months** — exceptional for SaaS
- This reflects the very low infrastructure cost and already-built product

### Churn Sensitivity
| Monthly Churn Rate | Avg Customer Lifetime | LTV |
|---|---|---|
| 3% | 33 months | $9,240 |
| 5% | 20 months | $5,600 |
| 8% | 12.5 months | $3,500 |
| 12% | 8.3 months | $2,324 |

*Keeping monthly churn below 5% is the single most important financial lever in the business.*

### Year 1 Cash Flow Summary (Conservative)

| Month | New Customers | Total Customers | MRR | Costs | Net |
|---|---|---|---|---|---|
| 1 | 2 | 2 | $298 | $2,800 | -$2,502 |
| 2 | 2 | 4 | $596 | $2,800 | -$2,204 |
| 3 | 3 | 7 | $1,043 | $3,200 | -$2,157 |
| 4 | 3 | 10 | $1,490 | $3,200 | -$1,710 |
| 5 | 4 | 14 | $2,086 | $3,500 | -$1,414 |
| 6 | 4 | 18 | $2,682 | $3,500 | -$818 |
| 7 | 4 | 22 | $3,278 | $4,000 | -$722 |
| 8 | 4 | 26 | $3,874 | $4,000 | -$126 |
| 9 | 5 | 31 | $4,619 | $4,500 | +$119 |
| 10 | 5 | 36 | $5,364 | $4,500 | +$864 |
| 11 | 5 | 41 | $6,109 | $5,000 | +$1,109 |
| 12 | 5 | 46 | $6,854 | $5,000 | +$1,854 |

*Costs include: infra, tooling, part-time contractor hours, marketing. Does not include founder salary.*

---

*MoveDeck is a product of LervIT Technologies Corporation. All rights reserved.*  
*This document is confidential and intended for internal planning and investor use only.*  
*Document prepared May 2026. Version 1.0.*
