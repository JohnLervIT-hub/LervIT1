-- Nova cross-channel identity mapping. Applied via drizzle-kit push against
-- shared/schema.ts:messengerIdentities. Kept here as documentation of the
-- resulting DDL and a verification query.
--
-- One row per known customer; each channel handle they've been reached on
-- lives on the same row, so a customer who DMs on Instagram and later texts
-- us gets identified as the same person once contact info is collected.

-- CREATE TABLE messenger_identities (
--   id                   VARCHAR PRIMARY KEY DEFAULT ('mid_' || gen_random_uuid()::text),
--   user_id              VARCHAR REFERENCES users(id),
--   name                 TEXT,
--   phone                TEXT,
--   email                TEXT,
--   instagram_sender_id  TEXT,
--   messenger_sender_id  TEXT,
--   whatsapp_phone       TEXT,
--   tiktok_user_id       TEXT,
--   last_channel         TEXT,           -- 'messenger'|'instagram'|'whatsapp'|'tiktok'|'voice'|'sms'
--   is_resolved          BOOLEAN NOT NULL DEFAULT FALSE,
--   is_return_customer   BOOLEAN NOT NULL DEFAULT FALSE,
--   total_messages       INTEGER NOT NULL DEFAULT 0,
--   first_seen_at        TIMESTAMP NOT NULL DEFAULT NOW(),
--   last_seen_at         TIMESTAMP NOT NULL DEFAULT NOW(),
--   resolved_at          TIMESTAMP,
--   resolved_by          TEXT,
--   created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
--   updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
-- );
--
-- CREATE INDEX messenger_identities_user_id_idx    ON messenger_identities(user_id);
-- CREATE INDEX messenger_identities_instagram_idx  ON messenger_identities(instagram_sender_id);
-- CREATE INDEX messenger_identities_messenger_idx  ON messenger_identities(messenger_sender_id);
-- CREATE INDEX messenger_identities_whatsapp_idx   ON messenger_identities(whatsapp_phone);
-- CREATE INDEX messenger_identities_tiktok_idx     ON messenger_identities(tiktok_user_id);
-- CREATE INDEX messenger_identities_phone_idx      ON messenger_identities(phone);
-- CREATE INDEX messenger_identities_email_idx      ON messenger_identities(email);
-- Applied: 2026-09-15

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'messenger_identities'
ORDER BY ordinal_position;
