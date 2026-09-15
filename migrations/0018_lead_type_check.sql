-- Already applied manually in Neon.
-- Documented here for migration history.

-- ALTER TABLE leads
--   ADD CONSTRAINT leads_lead_type_check
--   CHECK (lead_type IN ('b2c', 'b2bm', 'b2bp'));
-- Applied: 2026-09-15

SELECT
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'leads_lead_type_check';
