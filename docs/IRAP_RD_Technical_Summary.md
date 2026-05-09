# LervIT — IRAP R&D Technical Summary
**Prepared for:** National Research Council of Canada — Industrial Research Assistance Program (IRAP)
**Company:** LervIT Technologies Inc.
**Contact:** john@lervit.com
**Platform:** lervit.com
**Date:** May 2026

---

## 1. Executive Summary

LervIT is developing an intelligent dispatching and logistics optimization system for the urban moving industry. The core innovation is a multi-layer AI decision engine that autonomously prices jobs, matches labour and vehicle resources to demand, interprets unstructured visual data (photographs of household contents), and continuously refines its models through operational feedback.

The R&D challenge is significant: the moving industry has no established training datasets, no standardized item taxonomy, and no prior art for real-time proximity-based dynamic pricing at the individual job level. Every algorithmic component described below required original research, iterative experimentation, and ongoing technical uncertainty — the hallmarks of eligible IRAP R&D work.

---

## 2. Technical R&D Components

### 2.1 AI-Powered Dynamic Pricing Engine

**Technical Challenge:**
Standard pricing models (fixed-rate or hour-based) fail to capture the multi-variable complexity of a moving job: load volume, distance, vehicle type, time-of-day demand, mover proximity, and historical acceptance rates. Building a model that produces accurate, real-time price predictions without a large industry training corpus required original methodological work.

**R&D Activities:**
- Designed and implemented a **7-component pricing model** that decomposes job cost into independently estimable sub-problems: base rate, distance factor, volume coefficient, time-of-day demand signal, vehicle overhead, mover scarcity index, and promo adjustment.
- Developed a **confidence-scoring layer** on top of the predictor — the system emits a confidence band alongside each estimate, enabling the UI to communicate price uncertainty rather than false precision.
- Conducted iterative training experiments using bootstrapped data from completed jobs to reduce mean absolute percentage error (MAPE) on unseen booking scenarios.
- Researched and implemented an **AI Auto-Quote Predictor** (`shared/ai.ts`) controlled by feature flags that allow rapid A/B switching between model versions without deployment changes.

**Remaining Technical Uncertainty:**
- Generalizing pricing accuracy across seasonal demand fluctuations with limited historical data.
- Incorporating real-time traffic conditions (Google Distance Matrix latency vs. model freshness trade-off).

---

### 2.2 Vision Engine 2.0 — AI Product Identifier (Computer Vision)

**Technical Challenge:**
Customers cannot reliably self-report their load size or item inventory. Existing computer vision datasets (COCO, ImageNet) do not contain fine-grained household furniture categories with the specificity needed to estimate move volume. Custom vision pipelines for this domain did not exist prior to this work.

**R&D Activities:**
- Designed and implemented a **3-layer vision architecture**:
  - **Layer 1 — GPT-4o Vision inference:** Sends customer-uploaded photographs to a multimodal LLM for initial furniture identification and item listing.
  - **Layer 2 — Ground-truth database matching:** A custom-built furniture taxonomy with known volumetric dimensions (length × width × height in cubic feet) is queried to validate and correct LLM-identified items against verified measurements.
  - **Layer 3 — Dimension correction rules engine:** Heuristic rules derived from empirical testing correct systematic over/under-estimation by the LLM (e.g., LLM consistently underestimates sectional sofa volume by ~18% based on angle of photograph).
- Built an **async Vision Queue** (`server/`) to decouple image processing from the booking flow — preserving UX responsiveness while allowing GPU-bound inference to complete asynchronously.
- Implemented a **load size classification system** mapping identified items to discrete vehicle categories (boxes→car, medium load→pickup, large load→van, apartment→truck) via the `resolveVehicleForBooking()` function in `shared/matching.ts`.
- Developed a **Circuit Breaker pattern** (`server/`) around all external Vision API calls to gracefully degrade to manual entry when upstream model availability drops.

**Remaining Technical Uncertainty:**
- Accuracy degrades with photographs taken in poor lighting, cluttered rooms, or occluded items — active research into pre-processing prompts and image quality scoring.
- Multi-room aggregation (summing volume across several photos) introduces compounding estimation error; aggregation logic is under active refinement.

---

### 2.3 Job-to-Vehicle Matching Algorithm

**Technical Challenge:**
Assigning the correct vehicle type to a job is a constrained optimization problem: a vehicle must be large enough for the load, but over-assignment (e.g., dispatching a truck for a box move) increases cost and reduces mover acceptance rates. The matching function must be deterministic, auditable, and composable with the vision output.

**R&D Activities:**
- Researched vehicle volume classifications and developed a **normalized vehicle type taxonomy** (`car`, `pickup`, `van`, `truck`) with associated volume capacity thresholds.
- Implemented a **single-tier upgrade rule**: the system permits at most one vehicle class upgrade above the minimum required — preventing both under-provisioning and excessive over-provisioning.
- Designed `resolveVehicleForBooking()` as a **pure function** in `shared/matching.ts` callable from all 5 dispatch sites in the system (customer booking, admin override, proximity matching, mover pre-selection, abandoned booking recovery) — ensuring consistency across all entry points.
- Identified and corrected a priority-order bug in `vehicle-availability.ts` where `van` and `pickup` were swapped (`['car','van','pickup','truck']` → `['car','pickup','van','truck']`), discovered through integration testing of the matching pipeline.

---

### 2.4 Proximity Matching & Intelligent Dispatch

**Technical Challenge:**
Matching customers to movers in real time requires balancing spatial proximity, vehicle availability, acceptance probability, and job expiration — a multi-objective optimization problem with no closed-form solution at the required operating latency.

**R&D Activities:**
- Integrated **Google Maps Distance Matrix API** to compute real driving distances and ETAs (as opposed to Euclidean distance), significantly improving match quality for Calgary's non-uniform street network.
- Implemented a **ranked nearest-mover algorithm** that scores and returns the top 5 available movers within a configurable radius (15–50 km) weighted by distance, vehicle fit, and historical acceptance rate.
- Built a **10-minute job notification expiration** system with automatic re-dispatch logic: if a pre-selected mover declines, the system automatically falls through to proximity matching for the next eligible candidate.
- Developed **Active Trip Protection** logic in the background job scheduler: auto-complete and auto-cancel jobs check `locationUpdatedAt` before acting — if a mover has shared GPS within the prior 2 hours, the booking is protected from premature status changes.
- Implemented a **two-stage assignment flow** (pending notification → explicit mover acceptance/decline) to capture acceptance signal as structured training data for future model improvement.

---

### 2.5 Feedback & Learning Loop

**Technical Challenge:**
A dispatching AI that does not learn from outcomes will not improve. Capturing structured operational feedback — and connecting it back to model inputs — required purpose-built data infrastructure that does not exist in commercial off-the-shelf dispatch software.

**R&D Activities:**
- Designed and deployed an **`analytics_events` table** (PostgreSQL) and a fire-and-forget beacon endpoint (`POST /api/analytics/event`) that captures granular user interactions without blocking UX: page views, booking funnel steps, vehicle selections, promo code usage, and payment completion.
- Implemented a **booking funnel analytics pipeline** tracking conversion from job initiation through mover selection, payment, acceptance, and completion — enabling quantitative measurement of where the matching and pricing models cause drop-off.
- Built an **Operations Intelligence Dashboard** (`/api/admin/ops-metrics`) with sub-components for:
  - Booking funnel visualization (drop-off % per stage)
  - Mover performance leaderboard (acceptance %, decline/expiry counts, completion rate)
  - AI price and volume accuracy card (comparing AI quote vs. final price)
  - Revenue cohort analysis (weekly trends, avg booking value)
- Instrumented the Vision Engine output against actual vehicle assignments post-completion to measure volume estimation accuracy and feed corrections back into the dimension correction rules engine (Layer 3).
- Implemented **Fulfilment Hours tracking**: per-driver move time statistics (average, fastest, slowest, total hours) used to validate and refine the pricing model's time-component coefficient.

---

## 3. R&D Methodology

| Phase | Activity | Status |
|-------|----------|--------|
| Problem Definition | Identify failure modes of manual dispatch and static pricing | Complete |
| Literature Review | Survey computer vision datasets for furniture classification applicability | Complete |
| Prototype | GPT-4o Vision integration with manual validation against known item dimensions | Complete |
| Experimentation | A/B testing of pricing model components; vision layer accuracy benchmarking | Ongoing |
| Integration | End-to-end pipeline from photo upload → volume estimate → vehicle match → price → dispatch | Complete |
| Measurement | Analytics instrumentation and accuracy tracking dashboard | Complete |
| Refinement | Dimension correction rules; pricing model retraining; acceptance-rate weighting | Ongoing |

---

## 4. Technical Uncertainty & Innovation Criteria

IRAP eligibility requires that work involve **technological advancement** and **technological uncertainty**. The following uncertainties were present at the outset and remain partially unresolved:

1. **Vision accuracy across uncontrolled photography conditions** — No prior dataset exists for household move photography; accuracy under real-world conditions (lighting, angle, clutter) was unknown and required empirical testing to characterize.
2. **Pricing model generalization** — Whether a 7-component model trained on a small Calgary dataset would generalize to new neighbourhoods and move types was unknown prior to live deployment.
3. **Real-time dispatch latency** — Whether proximity matching with live Google Maps API calls could operate within acceptable UX latency under concurrent load required architectural experimentation (async queue, circuit breaker, caching strategy).
4. **Feedback loop signal quality** — Whether booking funnel events would yield sufficient training signal to measurably improve model accuracy within a 12-month horizon is an ongoing research question.

---

## 5. Key Technical Artifacts

| Artifact | Location | Description |
|----------|----------|-------------|
| AI feature flags | `shared/ai.ts` | Central control for enabling/disabling AI components |
| Pricing model | `server/` | 7-component dynamic pricing logic |
| Vision Engine | `server/` | 3-layer image processing pipeline |
| Vehicle matching | `shared/matching.ts` | `resolveVehicleForBooking()` pure function |
| Proximity algorithm | `server/` | Ranked nearest-mover dispatch |
| Analytics schema | `shared/schema.ts` | `analytics_events` table definition |
| Ops dashboard | `client/src/pages/OperationsDashboard.tsx` | AI accuracy and funnel measurement |
| Circuit breaker | `server/` | Resilience wrapper for external AI calls |
| Vision queue | `server/` | Async image processing decoupled from booking flow |

---

## 6. Distinction from Commercial Activities

The following activities are **explicitly excluded** from this R&D claim as they constitute routine commercial operations:

- Customer acquisition, marketing, and advertising
- Mover onboarding and training
- Payment processing and financial reconciliation
- Customer support operations
- General platform administration

The R&D claim covers only the work of **building, testing, and improving** the AI decision engine and its sub-components, as described in Sections 2–4 above.

---

## 7. Summary of R&D Investment Areas

| Component | R&D Nature |
|-----------|-----------|
| Dynamic Pricing Engine | Algorithm design, model training, accuracy benchmarking |
| Vision Engine 2.0 | Computer vision pipeline, custom taxonomy, correction rules |
| Vehicle Matching Algorithm | Constrained optimization, integration testing |
| Proximity Dispatch | Multi-objective matching, real-time systems research |
| Feedback & Learning Loop | Data infrastructure, model evaluation methodology |

---

*This document was prepared to support an IRAP application. All described work represents original technical development by LervIT Technologies Inc. with non-trivial technological uncertainty at the time of undertaking.*
