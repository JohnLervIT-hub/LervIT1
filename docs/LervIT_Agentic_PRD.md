# LervIT Agentic PRD

**Document:** LervIT Agentic System — Product Requirements
**Owner:** LervIT Product / AI Ops
**Last Updated:** 2026-09-09
**Status:** Living document

---

## Purpose

Defines the LervIT agent roster, their crawl/monitoring sources, content responsibilities, external APIs, and compliance guardrails. This document is the source of truth for what each agent is authorized to crawl, publish, or act on.

---

## Agent Roster (summary)

| Codename | Human Name | Role |
|---|---|---|
| HUNTER-D | Scout Reid | Lead discovery / demand-signal crawler |
| MAGNET | Ember Lane | Content, SEO, and inbound-channel operator |
| NOVA | — | Public-comment and review responder |
| XAVIER | — | Demand forecasting / strategic briefs |
| ALEX | — | Outbound sales / lead contact |
| AEGIS | — | Compliance and terms-of-service monitor |

---

## Scout Reid (HUNTER-D) — Crawl Sources

### Google Sources

**Google Alerts (RSS feeds)**
- Queries:
  - `moving Calgary`
  - `mover Calgary`
  - `moving to Calgary`
  - `relocating Calgary`
  - `Calgary apartment for rent`
- Cadence: real-time RSS processing
- Output: raw lead-candidate events → dedup → Alex queue

**Google Maps Places API**
- Search: `moving company Calgary`
- Monitor:
  - New listings (competitor launches)
  - Competitor **1–2 star reviews** (warm leads — dissatisfied customers)
- Cadence: every 48 hours

**Google News (RSS)**
- Queries:
  - `Calgary real estate`
  - `Calgary housing`
  - `Alberta interprovincial migration`
  - `Calgary new development`
- Cadence: daily
- Output: market-context feed for Xavier briefs

**Google Trends (pytrends)**
- Track: `moving Calgary` search-volume spikes
- Output: demand forecast input for Xavier's weekly brief
- Cadence: weekly

### YouTube Sources

**YouTube Data API v3**
- Monitor comments on videos matching queries:
  - `moving to Calgary`
  - `Calgary apartment tour`
  - `Calgary cost of living`
  - `Calgary neighbourhood guide`
- Flag comments containing intent phrases:
  - `moving next month`
  - `relocating to Calgary`
  - `need a mover`
  - `moving company`
  - `help moving`
- Cadence: daily
- API cost: FREE (10K units/day quota)

---

## Ember Lane (MAGNET) — Content Strategy

### YouTube Content (Ember creates)

Weekly video briefs for:
- `Moving to [Calgary neighbourhood]` guides
- `How LervIT AI pricing works`
- Customer testimonial scripts
- `Moving tips Calgary` content

Target keywords:
- `moving to Calgary`
- `best movers Calgary`
- `Calgary moving company`
- `how to book a mover Calgary`

### YouTube Monitoring (Ember manages)

- Monitor LervIT-owned video comments
- Nova responds to all comments
- High-intent comments → Scout flags → Alex contacts
- Track: views, watch time, CTR per video

### Google Business Profile (Ember manages)

- Post weekly updates
- Monitor and flag new reviews to Nova
- Q&A monitoring and responses
- Photo updates monthly

### Google Search Console (Ember monitors)

- Weekly ranking report to Xavier
- New keyword opportunities flagged
- CTR drops → content-update trigger

---

## APIs

| API | Access | Cost |
|---|---|---|
| Google Alerts | RSS | FREE |
| YouTube Data API v3 | API key | FREE (10K units/day) |
| Google News | RSS | FREE |
| Google Trends | `pytrends` library | FREE |
| Google Maps Places | API key (already configured) | Existing plan |
| Google Search Console API | OAuth | FREE |
| Google Business Profile API | OAuth | FREE |

---

## Compliance (Aegis monitors)

### YouTube API terms
- No storing personal user data from comments
- No contacting users outside YouTube without their explicit consent
- Only public comments are processed

### Google Maps terms
- No storing competitor business data beyond 30 days
- No automated review scraping beyond permitted API limits

---

## Change Log

- **2026-09-09** — Initial PRD. Added Google + YouTube crawl sources for Scout Reid (HUNTER-D); added YouTube content, Google Business Profile, and Google Search Console responsibilities for Ember Lane (MAGNET); added APIs table and Aegis compliance rules for YouTube + Google Maps terms.
