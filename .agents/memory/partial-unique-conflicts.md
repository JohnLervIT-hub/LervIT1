---
name: Partial unique conflict targets
description: PostgreSQL and Drizzle behavior when conflict handling relies on partial unique indexes.
---

Do not assume `ON CONFLICT (column)` can infer a partial unique index. Without the matching predicate, PostgreSQL can reject the statement because it cannot find a matching unique constraint.

**Why:** A targeted conflict clause can compile successfully yet fail at runtime when PostgreSQL cannot infer the matching partial uniqueness rule.

**How to apply:** For concurrency-sensitive invariants, serialize the complete check-and-insert sequence in a transaction using an appropriate lock. Use untargeted `ON CONFLICT DO NOTHING` for defensive handling, or include the exact partial-index predicate when PostgreSQL and the query layer support it.