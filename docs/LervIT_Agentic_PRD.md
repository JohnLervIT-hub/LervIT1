# LervIT Agentic System PRD
## Version 2.1 — September 2026

---

## 1. OVERVIEW

LervIT operates **12 autonomous AI agents** orchestrated by Xavier Cole (APEX). The system handles demand generation, supply recruitment, pricing intelligence, conversion, dispatch, operations, compliance, and retention without human intervention.

Xavier is the only agent with cross-agent visibility. Every other agent operates within its lane and reports events to a shared event bus (`business_events`), a structured log (`agent_logs`), and a decision journal (`agent_decisions`).

---

## 2. AGENT ROSTER

| Formal Name  | Code Name   | Model      | Trigger      | Role                    | Est/mo |
|-------------|-------------|------------|--------------|-------------------------|--------|
| Xavier Cole  | APEX        | Opus 4.6   | Daily 06:00  | CEO Orchestrator        | $8.00  |
| Aegis Ford   | COMPLIANCE  | Opus 4.6   | Event        | Safety + Compliance     | $3.00  |
| Alex Morgan  | CLOSER-D    | Sonnet 4.6 | Event+Sched  | Lead Conversion         | $2.00  |
| Jordan Hayes | VETTER      | Sonnet 4.6 | Event        | Mover Onboarding        | $1.00  |
| Morgan Price | ORACLE      | Sonnet 4.6 | Daily 05:30  | Pricing Intelligence    | $1.00  |
| Scout Reid   | HUNTER-D    | Haiku 4.5  | Daily 07:00  | Customer Prospecting    | $0.30  |
| Ryan Brooks  | HUNTER-S    | Haiku 4.5  | Daily 07:00  | Mover Recruitment       | $0.30  |
| Kai Bennett  | RETAIN      | Haiku 4.5  | Event        | Mover Engagement        | $0.50  |
| Victor Nash  | DISPATCH    | Haiku 4.5  | Event        | Job Matching            | $0.20  |
| Mark Shaw    | PULSE       | Haiku 4.5  | Event        | Operations Monitoring   | $0.20  |
| Nova Clarke  | VOICE       | Haiku 4.5  | Event        | Customer Communications | $0.30  |
| Ember Lane   | MAGNET      | Haiku 4.5  | Weekly       | Content + Inbound       | $0.10  |

**Total agents:** 12

**Cost curve**
- Current volume (~10 jobs/mo): **~$17/month**
- Growth (50 jobs/mo): **~$35/month**
- Scale (150 jobs/mo): **~$80/month**

---

## 3. CRAWL SOURCES

### 3.1 DEMAND SIDE — Scout Reid (HUNTER-D)

#### Priority 1 — Daily

**Google Alerts (RSS)**
- Queries: `moving Calgary`, `mover Calgary`, `moving to Calgary`, `relocating Calgary`, `Calgary apartment for rent`
- Method: RSS feed processing
- Cost: FREE

**Kijiji.ca**
- Sections: Housing (For Rent, For Sale), Services (Moving), Free Stuff (Moving Sale)
- Method: Puppeteer + Cheerio
- Cost: FREE

**RentFaster.ca**
- New rental listings Calgary; "Available immediately" signals
- Method: RSS/API
- Cost: FREE

**Facebook Marketplace**
- Queries: "Moving sale", "Relocating — must sell"; Calgary buy/sell groups
- Method: Public listings scrape
- Cost: FREE

**YouTube Data API v3**
- Monitor comments on videos tagged: `moving to Calgary`, `Calgary apartment tour`, `Calgary cost of living`, `Calgary neighbourhood`
- Flag comments containing moving-intent keywords: `moving next month`, `relocating to Calgary`, `need a mover`, `moving company`, `help moving`
- Method: YouTube Data API v3
- Cost: FREE (10K units/day)

#### Priority 2 — Every 48 Hours

**Google Maps Places API**
- Search: `moving company Calgary`
- Monitor: competitor 1–2 star reviews; new listings (recently added movers)
- Method: Google Maps Places API
- Cost: Already configured

**Google News (RSS)**
- Queries: `Calgary real estate`, `Calgary housing market`, `Alberta interprovincial migration`, `Calgary new development`
- Method: RSS feed processing
- Cost: FREE

**Reddit**
- Subreddits: `r/Calgary`, `r/calgaryhousing`, `r/Alberta`
- Keywords: `moving`, `mover`, `help moving`, `relocating`, `moving company`
- Method: Reddit API (free tier)
- Cost: FREE

**Realtor.ca**
- New Calgary listings; sold listings (buyer needs to move in)
- Method: RSS/scrape
- Cost: FREE

**Craigslist Calgary**
- Housing section new listings; moving-sale tags
- Method: RSS feed
- Cost: FREE

#### Priority 3 — Weekly

**Google Trends**
- Track: `moving Calgary` volume spikes
- Output: demand forecast for Xavier's brief
- Method: `pytrends` library
- Cost: FREE

**LinkedIn**
- Job posts offering Calgary relocation; new Calgary positions
- Method: LinkedIn API (limited)
- Cost: FREE tier

**City of Calgary Open Data**
- Building permits issued; development permits
- URL: `data.calgary.ca`
- Method: Open Data API
- Cost: FREE

#### Priority 4 — Monthly

**Alberta Land Titles**
- New property transfers
- Method: Public records
- Cost: FREE

**Government of Alberta**
- Interprovincial migration data; immigration announcements
- Method: RSS/API
- Cost: FREE

---

### 3.2 SUPPLY SIDE — Ryan Brooks (HUNTER-S)

#### Priority 1 — Daily

**Kijiji.ca Services**
- Moving & Storage section; "Man with a truck" listings; new listings Calgary
- Method: Puppeteer + Cheerio
- Cost: FREE

**Facebook Marketplace Services**
- Moving services Calgary; new mover profiles; "Man with a Truck Calgary" groups
- Method: Public listings scrape
- Cost: FREE

**Indeed.ca**
- Resumes: `mover`, `driver`, `delivery` in Calgary
- Job seekers actively looking for moving work
- Method: Indeed API
- Cost: FREE tier

#### Priority 2 — Every 48 Hours

**Google Maps Places API**
- Search: `moving company Calgary`
- Low-review businesses (early stage, recruitable); new listings
- Method: Google Maps Places API
- Cost: Already configured

**HomeStars.com**
- Moving company profiles Calgary; low-rated operators (opportunity to partner)
- Method: Scrape
- Cost: FREE

**Bark.com**
- Moving professionals Calgary; new sign-ups
- Method: Scrape
- Cost: FREE

#### Priority 3 — Weekly

**Alberta Business Registry**
- New registrations: `moving`, `transport`, `delivery`; recently incorporated operators
- Method: Public registry API
- Cost: FREE

**AutoTrader.ca**
- Commercial vehicle purchases Calgary; cargo van / box truck purchases = new-mover signal
- Method: Scrape/RSS
- Cost: FREE

**JobBank.gc.ca**
- Moving/transport job seekers Calgary
- Method: Government API
- Cost: FREE

#### Priority 4 — Monthly

**Alberta Motor Transport Association**
- Member directory; small fleet operators
- Method: Scrape
- Cost: FREE

**Better Business Bureau Calgary**
- Moving company listings; unaccredited operators (partnership opportunity)
- Method: Scrape
- Cost: FREE

---

## 4. AGENT WORKFLOWS

### 4.1 Xavier Cole (APEX) — Daily Brief
- **Trigger:** Daily 06:00 Calgary time
- **Model:** Claude Opus 4.6
- **Actions:**
  1. Read `/api/admin/intelligence/summary`
  2. Compare vs `kpi_targets`
  3. Review all `agent_logs` from past 24hrs
  4. Generate structured daily brief
  5. Send to John via WhatsApp
  6. Flag any escalations requiring human decision
  7. Queue agent tasks for the day

### 4.2 Scout Reid (HUNTER-D) — Customer Prospecting
- **Trigger:** Daily 07:00 Calgary time
- **Model:** Claude Haiku 4.5
- **Actions:**
  1. Process Google Alerts RSS feed
  2. Crawl Kijiji housing new listings
  3. Scan YouTube comments for moving intent
  4. Check Google News for development signals
  5. Score each signal 0–100 (intent score)
  6. Create lead records for score > 60
  7. Route score > 80 to Alex immediately
  8. Queue score 60–80 for 24hr Alex touch

### 4.3 Ryan Brooks (HUNTER-S) — Mover Recruitment
- **Trigger:** Daily 07:00 Calgary time
- **Model:** Claude Haiku 4.5
- **Actions:**
  1. Crawl Kijiji services new listings
  2. Scan Facebook Marketplace services
  3. Check Indeed.ca for mover job seekers
  4. Cross-reference against existing movers (don't recruit someone already on platform)
  5. Score each candidate 0–100
  6. Create lead records for score > 60
  7. Route to Jordan Hayes for outreach

### 4.4 Alex Morgan (CLOSER-D) — Lead Conversion
- **Trigger:** Event (new lead) + BullMQ scheduled touches
- **Model:** Claude Sonnet 4.6
- **Touch sequence:**
  - Touch 1: Immediate (<60s) — personalized email
  - Touch 2: 24hr delay — SMS (if no reply)
  - Touch 3: 48hr delay — outbound call via Telnyx
  - Touch 4: 72hr delay — final email
  - After 4 touches with no response → mark cold

### 4.5 Jordan Hayes (VETTER) — Onboarding
- **Trigger:** Event (mover application submitted)
- **Model:** Claude Sonnet 4.6
- **Actions:**
  1. Review application completeness
  2. Score against eligibility criteria
  3. Request missing documents
  4. Background check initiation
  5. Send welcome sequence
  6. Create portal account
  7. Trigger Stripe Connect invitation
  8. Send HeyGen welcome video (Phase 5)
  9. Enroll in Loops nurture sequence

### 4.6 Victor Nash (DISPATCH) — Job Matching
- **Trigger:** Event (payment confirmed)
- **Model:** Claude Haiku 4.5
- **Actions:**
  1. Check partner auto-dispatch first (Gap 1)
  2. If no partner match → score available movers:
     - Proximity (30%)
     - Rating (25%)
     - Capacity match (20%)
     - Availability (15%)
     - Fairness score (10%)
  3. Assign top-scored mover
  4. Send job notification via WebSocket + SMS + email
  5. Set 10-minute acceptance window
  6. If declined → score next mover
  7. Log dispatch decision to `agent_decisions`

### 4.7 Mark Shaw (PULSE) — Operations Monitoring
- **Trigger:** Event (active job status changes); polls every 5 minutes on active jobs
- **Model:** Claude Haiku 4.5
- **Monitors:**
  - Mover GPS last update > 10 minutes → alert
  - Job running > 30 min over estimate → notify customer
  - Mover at wrong location → flag to Xavier
  - Job status stuck > 1hr → escalate to John

### 4.8 Nova Clarke (VOICE) — Communications
- **Trigger:** Event (booking status changes)
- **Model:** Claude Haiku 4.5
- **Sends:**
  - Booking confirmation (immediate)
  - Mover assigned notification
  - Day-before reminder
  - Mover en route notification
  - Job complete + review request (1hr post)
  - Payment receipt

### 4.9 Kai Bennett (RETAIN) — Mover Engagement
- **Trigger:** Event (mover inactive 7 days)
- **Model:** Claude Haiku 4.5
- **Re-engagement sequence:**
  - Day 7: SMS check-in
  - Day 8: Phone call via Telnyx
  - Day 14: Final outreach + zone demand data
  - Day 21: Exit survey if still inactive

### 4.10 Ember Lane (MAGNET) — Content
- **Trigger:** Weekly (Monday 08:00)
- **Model:** Claude Haiku 4.5
- **Actions:**
  1. Review Google Trends Calgary moving data
  2. Generate weekly content calendar
  3. Create Google Business Profile posts
  4. Generate social captions (Instagram, Facebook)
  5. Brief YouTube video topics for the week
  6. Monitor LervIT YouTube comments → flag to Nova
  7. Track competitor review sentiment

### 4.11 Aegis Ford (COMPLIANCE) — Safety
- **Trigger:** Event (any compliance-relevant action)
- **Model:** Claude Opus 4.6
- **Monitors:**
  - CASL compliance on all outreach
  - CRTC calling hour enforcement (8am–9pm MT)
  - Mover insurance expiry tracking
  - Background check enforcement
  - PIPEDA data handling
  - WCB fatigue hour limits
  - YouTube / Google API terms compliance

### 4.12 Morgan Price (ORACLE) — Pricing Intelligence
- **Trigger:** Daily 05:30 Calgary time (before Xavier brief) + Event: fuel price spike >5%
- **Model:** Claude Sonnet 4.6
- **Actions:**

  1. **Competitive Intelligence (daily)**
     - Monitor competitor pricing on:
       - Kijiji moving ads (price listings)
       - Google Maps competitor profiles
       - HomeStars.com Calgary movers
     - Output: market rate comparison report
     - Routes to: Xavier Cole for John review

  2. **Fuel Price Monitoring (daily)**
     - Sources: GasBuddy API, Alberta government data
     - When fuel rises >5%:
       - Automatically adjusts fuel surcharge
       - Notifies John via Xavier Cole
       - Updates customer-facing estimates

  3. **YOLO Pricing Accuracy (weekly)**
     - Reviews completed jobs:
       - Quoted price vs actual price
       - Items detected vs actual items
       - Time estimated vs actual time
     - Identifies systematic underquoting patterns
     - Routes corrections to pricing engine

  4. **Seasonal Pricing (monthly)**
     - Calgary demand peaks:
       - May–September (summer moving season)
       - Month-end surges (lease renewals)
       - University move-in (August/September)
     - Recommends surge pricing windows to John
     - Never applies automatically — John approves

  5. **Demand-Based Pricing (event-driven)**
     - Triggered when Victor Nash flags high demand
     - Recommends 10–15% surge pricing
     - Routes to John for approval
     - If approved: updates pricing engine

  6. **Feeds Victor Nash (DISPATCH)**
     - Maintains: base rates by job type
     - Active fuel surcharge %
     - Zone-based pricing adjustments
     - Peak/off-peak multipliers

---

## 5. COST ARCHITECTURE

### 5.1 Model Tiers
- **Claude Opus 4.6:** Xavier Cole, Aegis Ford
- **Claude Sonnet 4.6:** Alex Morgan, Jordan Hayes, Morgan Price
- **Claude Haiku 4.5:** All other 7 agents

### 5.2 Optimizations
- Prompt caching on all stable system prompts
- Event-driven triggers (no idle polling)
- Token budgets per agent:
  - Nova: 150 tokens max
  - Kai: 200 tokens max
  - Alex: 400 tokens max
  - Xavier: 800 tokens max
- BullMQ delayed jobs for timed sequences

### 5.3 Cost Estimates
- Current volume (~10 jobs/month): **~$17/month**
- Growth (50 jobs/month): **~$35/month**
- Scale (150 jobs/month): **~$80/month**

---

## 6. COMPLIANCE & LEGAL

### 6.1 CASL (Canadian Anti-Spam)
- All outreach requires prior express/implied consent
- Unsubscribe mechanism on every email/SMS
- Suppression list maintained by Aegis

### 6.2 CRTC Calling Rules
- Permitted hours: 8am–9pm local Alberta time
- Weekends: 9am–6pm
- DNCL checked before every cold call

### 6.3 PIPEDA / Alberta PIPA
- No storing personal data beyond 30 days
- Right to erasure honored within 30 days
- Cross-border data: no DeepSeek (China routing)

### 6.4 YouTube API Terms
- No storing personal user data from comments
- Only public comments processed
- No contacting users outside YouTube without explicit consent

### 6.5 Google Maps Terms
- No storing competitor data beyond 30 days
- No exceeding API rate limits

---

## 7. INFRASTRUCTURE

### 7.1 Queue System
- BullMQ + Redis (Railway)
- 12 named agent queues
- 3 retry attempts, exponential backoff

### 7.2 Database Tables
- `agent_logs` — every agent action
- `agent_decisions` — key decisions with reasoning
- `leads` — demand + supply pipeline
- `business_events` — unified event stream
- `kpi_targets` — performance benchmarks
- `mover_activity_log` — mover engagement tracking
- `zone_demand_log` — supply/demand by zone

### 7.3 Base Infrastructure
- `server/agents/base.ts` — `BaseAgent` class
- `server/agents/queue.ts` — Queue factory
- `server/events.ts` — Event emitter
- `server/sla.ts` — SLA computation

---

## 8. BUILD SEQUENCE

| Phase | Weeks | Deliverables |
|---|---|---|
| Phase 1 | 1–2 | Xavier Cole (APEX) + daily brief |
| Phase 2 | 3–4 | Alex Morgan (CLOSER-D) + Scout Reid (HUNTER-D) |
| Phase 3 | 5–6 | Ryan Brooks (HUNTER-S) + Jordan Hayes (VETTER) |
| Phase 4 | 7–8 | Victor Nash (DISPATCH) + Mark Shaw (PULSE) |
| Phase 5 | 9–10 | Nova Clarke (VOICE) + Kai Bennett (RETAIN) |
| Phase 6 | 11–12 | Ember Lane (MAGNET) + Aegis Ford (COMPLIANCE) |
| Phase 7 | 13–14 | Morgan Price (ORACLE) + YOLO vehicle capacity |
| Phase 8 | 15+ | Voice integration + mobile app agents |

---

## 9. ORCHESTRATION FLOW

### 9.1 Agent Hierarchy

Xavier Cole (APEX) sits at the top of the orchestration hierarchy. All 11 specialist agents receive direction from Xavier and report outcomes back.

### 9.2 Layer Structure

| Layer | Focus | Agents |
|---|---|---|
| Layer 1 | Demand | Scout Reid, Morgan Price |
| Layer 2 | Supply | Ryan Brooks, Jordan Hayes |
| Layer 3 | Conversion | Alex Morgan, Ember Lane, Kai Bennett |
| Layer 4 | Operations | Victor Nash, Mark Shaw, Nova Clarke |
| Layer 5 | Finance | Pricing Engine (YOLO + CV + Stripe) |
| Layer 6 | Compliance | Aegis Ford (monitors all layers) |

### 9.3 Key Data Flows

- Scout Reid → Alex Morgan (qualified leads)
- Ryan Brooks → Jordan Hayes (recruited movers)
- Morgan Price → Victor Nash (pricing data)
- Victor Nash → Nova Clarke (dispatch triggers comms)
- Aegis Ford → All agents (compliance monitoring)

### 9.4 Daily Schedule

| Time | Agent | Action |
|---|---|---|
| 05:30 | Morgan Price | Pricing intelligence run |
| 06:00 | Xavier Cole | Daily brief generation |
| 07:00 | Scout Reid + Ryan Brooks | Crawl runs |
| On-event | All other agents | Fire on triggers |
| Weekly | Ember Lane | Content calendar |

---

## Change Log
- **2026-09-09** — v2.1. Added Morgan Price (ORACLE) as 12th agent (pricing intelligence, Sonnet 4.6, daily 05:30). Added Section 9 (Orchestration Flow) with layer structure, data flows, and daily schedule. Rebalanced build sequence into 8 phases.
- **2026-09-09** — v2.0. Full 11-agent PRD with crawl sources, workflows, cost architecture, compliance, infrastructure, and build sequence.
