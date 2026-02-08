# LervIT Platform — System-Level Copyright Deposit Package

**Version:** 1.0  
**Date:** February 8, 2026  
**Prepared by:** Lervit Technologies Corporation  
**Repository:** LervIT Smart Moving Platform

---

## Purpose

This package constitutes a **System-Level Copyright Deposit** for the LervIT platform. It documents the original system architecture, workflows, orchestration logic, data model, and user experience flows that together form the copyrightable expression of the LervIT software system.

This deposit is intended to demonstrate authorship of the platform's design, structure, and logic at a system level — without exposing proprietary secrets or full source code.

---

## What Is Included

| # | Document | Description |
|---|----------|-------------|
| 00 | `00_README.md` | This file — package overview, source map, exclusions |
| 01 | `01_System_Overview.md` | Mission, roles, and core capabilities |
| 02 | `02_Architecture.md` | Component overview, interfaces, data flow, mermaid diagrams |
| 03 | `03_Workflows.md` | End-to-end workflows for Customer, Mover, and Admin |
| 04 | `04_State_Machine.md` | Job lifecycle states, transitions, and mermaid state diagram |
| 05 | `05_Decision_Orchestration.md` | Pricing, vehicle-fit, and matching logic (pseudocode) |
| 06 | `06_Payments_and_Payouts.md` | Stripe Connect flow, reconciliation, payout delays |
| 07 | `07_Postgres_Data_Model_Summary.md` | Tables, relationships, and constraints |
| 08 | `08_API_Surface_Summary.md` | Express routes grouped by domain |
| 09 | `09_UX_Flow_Summary.md` | Screen-by-screen flows and navigation map |
| 10 | `10_Original_Authorship_Statement.md` | Original authorship declaration |
| 11 | `11_Appendix_Representative_Snippets.md` | Up to 5 short representative code snippets |

---

## What Is Excluded

- **No API keys, tokens, passwords, or environment variable values**
- **No database connection strings or webhook signing secrets**
- **No full source code dumps** — only small representative snippets (max 30–60 lines each)
- **No personally identifiable information (PII)**
- **No third-party proprietary code**

---

## Source Map

The following table maps each document section to the key source files reviewed during preparation:

| Section | Key Files Reviewed |
|---------|-------------------|
| System Overview | `replit.md`, `shared/schema.ts` |
| Architecture | `server/routes.ts`, `server/db.ts`, `server/vite.ts`, `client/src/App.tsx` |
| Workflows | `client/src/pages/RequestMove.tsx`, `client/src/pages/MoverDashboard.tsx`, `client/src/pages/AdminDashboard.tsx`, `server/routes.ts` |
| State Machine | `shared/schema.ts` (BOOKING_STATUSES, BOOKING_STATUS_TRANSITIONS) |
| Decision Orchestration | `shared/pricing.ts`, `shared/matching.ts`, `shared/furniture-database.ts`, `server/vision-engine-v2.ts` |
| Payments & Payouts | `server/config/stripe.ts`, `server/routes.ts` (payment endpoints) |
| Data Model | `shared/schema.ts` (all table definitions) |
| API Surface | `server/routes.ts` (all endpoint registrations) |
| UX Flow | `client/src/App.tsx`, `client/src/pages/*.tsx`, `client/src/components/*.tsx` |
| Representative Snippets | `shared/pricing.ts`, `shared/matching.ts`, `shared/schema.ts` |

---

## Redactions & Exclusions

This package has been reviewed to confirm:

- No Stripe secret keys, publishable keys, or webhook secrets are included.
- No database connection strings or credentials are included.
- No session secrets, API tokens, or authentication credentials are included.
- No OpenAI, Google Maps, Telnyx, Resend, or SerpAPI keys are included.
- No `.env` file contents are reproduced.
- All code snippets are limited to 30–60 lines and serve only to demonstrate authorship of system expressions.
