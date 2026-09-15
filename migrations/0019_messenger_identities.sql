-- Nova DM identity mapping — cross-restart persistence for the DM handlers.
-- Table is applied via drizzle-kit push against shared/schema.ts:messengerIdentities.
-- Kept here as documentation of the resulting DDL and a verification query.

-- CREATE TABLE messenger_identities (
--   id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
--   platform            TEXT NOT NULL,                 -- 'messenger' | 'instagram'
--   sender_id           TEXT NOT NULL,                 -- Meta page-scoped id
--   user_id             VARCHAR REFERENCES users(id),
--   name                TEXT,
--   phone               TEXT,
--   email               TEXT,
--   is_resolved         BOOLEAN NOT NULL DEFAULT FALSE,
--   is_return_customer  BOOLEAN NOT NULL DEFAULT FALSE,
--   total_messages      INTEGER NOT NULL DEFAULT 0,
--   first_seen_at       TIMESTAMP NOT NULL DEFAULT NOW(),
--   last_seen_at        TIMESTAMP NOT NULL DEFAULT NOW(),
--   resolved_at         TIMESTAMP,
--   resolved_by         TEXT,
--   created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
--   updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
--   CONSTRAINT messenger_identities_platform_sender_uniq UNIQUE (platform, sender_id)
-- );
--
-- CREATE INDEX messenger_identities_user_id_idx           ON messenger_identities(user_id);
-- CREATE INDEX messenger_identities_platform_sender_idx  ON messenger_identities(platform, sender_id);
-- Applied: 2026-09-15

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'messenger_identities'
ORDER BY ordinal_position;
