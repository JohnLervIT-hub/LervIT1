---
name: lervit-master-build
description: Executive engineering framework for Lervit. Use this skill before implementing any significant feature, refactor, or system change on the Lervit platform. Applies multi-role review covering architecture, marketplace economics, AI systems, security, UX, performance, and growth impact.
---

# Lervit Master Build Skill

Lervit is an AI-powered logistics operating system — not a simple booking platform. Every engineering decision must be evaluated across the full system.

## Lervit System Components

- Customer Marketplace
- Operator Portal
- Driver Portal
- Dispatch Engine
- AI Vision Engine
- Dynamic Pricing Engine
- Marketplace Matching Engine
- Driver Assignment Engine
- Live Tracking System
- Payments & Escrow
- Messaging & Notifications
- CRM & Support
- Analytics & Growth Platform
- Admin Platform

Never treat features in isolation. Understand how every component affects the ecosystem.

---

## Execution Phases

### Phase 1 — System Reverse Engineering
Before writing any code, understand:
- Complete architecture and data flow
- Full user journey (customer → mover → admin → operator)
- API flow, event flow, business rules
- Marketplace lifecycle
- AI, payment, driver, customer, operator, and admin workflows

### Phase 2 — Product Thinking
Every implementation must answer:
- Why does this feature exist?
- Who benefits?
- What business KPI improves?
- Does it increase: bookings, revenue, conversion, marketplace liquidity, retention, or operational efficiency?

If not, rethink before building.

### Phase 3 — Software Architecture
Apply: Domain Driven Design, SOLID, Event-driven Architecture, Clean Architecture, Modular Monolith, CQRS where appropriate, Dependency Injection, Separation of Concerns.

Reduce: tight coupling, duplicate logic, technical debt, shared mutable state.
Increase: testability, maintainability, extensibility, reliability.

Never rewrite working systems without measurable benefit.

### Phase 4 — Marketplace Optimization
Optimize: supply liquidity, demand liquidity, driver utilization, operator efficiency, job acceptance rate, cancellation rate, booking completion rate, average response time, marketplace balance.

Avoid features that increase marketplace friction.

### Phase 5 — AI Systems
Treat AI as a production subsystem. Every AI feature must include:
- Confidence score
- Human fallback
- Error handling
- Monitoring
- Continuous learning path

AI subsystems: Vision Engine, Dynamic Pricing, Matching, Recommendations, Support Copilot, Operator Copilot, Dispatch Intelligence, Fraud Detection, Routing Optimization.

### Phase 6 — Performance Engineering
Optimize for: millions of bookings, millions of images, real-time tracking, thousands of concurrent drivers and operators.

Analyze: API latency, DB performance, caching, real-time subscriptions, rendering, queue systems, memory, background jobs. Optimize before scaling hardware.

### Phase 7 — Security
Every feature must cover:
- Authentication & authorization
- Role-Based Access Control (RBAC)
- Row-Level Security
- API security & rate limiting
- Input validation
- Payment security
- Image upload security
- Secrets management
- Audit logging
- Principle of least privilege

Security is mandatory, never optional.

### Phase 8 — Database Engineering
Optimize: schema design, indexes, relationships, query efficiency, transactions, data integrity, partitioning, materialized views. Avoid unnecessary round trips.

### Phase 9 — User Experience
Every screen must optimize: trust, speed, accessibility, simplicity, completion rate, professional appearance, mobile-first experience.

Reduce: clicks, typing, waiting, confusion. Every workflow should feel effortless.

### Phase 10 — Operations
Improve: dispatch speed, driver assignment, route optimization, travel efficiency, ETA accuracy, capacity utilization, operator productivity, customer communication.

Every operational improvement must reduce cost or increase service quality.

### Phase 11 — Growth Engineering
Evaluate impact on: CAC, LTV, referral rate, SEO, organic growth, marketplace network effects, virality, activation, retention, revenue expansion.

Every feature should contribute to sustainable growth.

### Phase 12 — Reliability
Assume production is always live. Never introduce: breaking changes, data corruption, downtime, race conditions, silent failures.

Always include: observability, logging, metrics, alerts, retry logic, graceful degradation, rollback strategy, feature flags.

---

## Executive Review Council
Before approving any implementation, pass all of these reviews:

| Reviewer | Focus |
|---|---|
| CTO | Architecture review |
| Principal Engineer | Code quality |
| Product Manager | User value |
| Marketplace Economist | Marketplace impact |
| AI Architect | AI robustness |
| Security Engineer | Security review |
| SRE | Reliability review |
| Growth Lead | Business impact |
| UX Director | Experience review |

---

## Output Format
For significant features, provide:

1. Problem Definition
2. Current Architecture
3. Business Impact
4. Technical Analysis
5. Marketplace Impact
6. AI Impact
7. Security Review
8. Performance Review
9. UX Review
10. Scalability Assessment
11. Recommended Solution
12. Production-Ready Code
13. Migration Strategy
14. Testing Strategy
15. Deployment Plan
16. Expected Business Outcome

---

## Guiding Principles

- Never optimize prematurely
- Never add complexity without measurable value
- Never sacrifice reliability for speed
- Never sacrifice user experience for engineering convenience
- Always build for long-term scalability
- Always think in systems rather than isolated features
- Every decision must move Lervit closer to becoming the world's leading AI-powered logistics operating system
