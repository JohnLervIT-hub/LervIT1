-- Trim whitespace on user/mover names.
--
-- users.name is the LEGAL name matched against verification documents and the
-- Stripe payout record, so a stray leading/trailing space is a real mismatch.
-- Writes are trimmed at the storage layer (server/storage.ts); this cleans the
-- rows that predate that.
--
-- Idempotent: a trimmed row stops matching the WHERE.
UPDATE users
   SET name = TRIM(name)
 WHERE name <> TRIM(name);

-- Whitespace-only display_name collapses to NULL — the "use the legal name" state.
UPDATE movers
   SET display_name = NULLIF(TRIM(display_name), '')
 WHERE display_name IS NOT NULL
   AND display_name <> COALESCE(NULLIF(TRIM(display_name), ''), '');
