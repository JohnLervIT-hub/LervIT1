---
name: routes.ts schema import gap
description: partnerUsers table was used in routes.ts but missing from the single large schema import line.
---

**Rule:** When adding partner-related logic to `server/routes.ts`, verify the required schema tables are in the import at line 43.

**Why:** `server/routes.ts` has one long import from `@shared/schema`. Partner tables like `partnerUsers`, `partnerTeamMembers`, `partners` etc. must be explicitly listed. If a table is used (e.g. in a db.select().from(partnerUsers)) but not imported, TypeScript reports TS2552 ("Cannot find name") which would be a runtime crash.

**How to apply:** Before using any schema table in routes.ts, grep the import line for it. If absent, add it to the existing import statement at line 43.
