-- Telnyx voice centre. All statements are safe to apply repeatedly.
CREATE TABLE IF NOT EXISTS admin_voice_profiles (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), user_id varchar NOT NULL UNIQUE REFERENCES users(id),
  display_name text, caller_id_number text, enabled boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_voice_presence (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), user_id varchar NOT NULL UNIQUE REFERENCES users(id),
  status text NOT NULL DEFAULT 'offline', last_seen_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE admin_voice_profiles ADD COLUMN IF NOT EXISTS telnyx_credential_id text;
ALTER TABLE admin_voice_profiles ADD COLUMN IF NOT EXISTS telnyx_sip_username text;
ALTER TABLE admin_voice_profiles ADD COLUMN IF NOT EXISTS telnyx_credential_expires_at timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS admin_voice_profiles_credential_uniq ON admin_voice_profiles(telnyx_credential_id) WHERE telnyx_credential_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS voice_calls (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), telnyx_call_control_id text UNIQUE, telnyx_call_leg_id text UNIQUE,
  direction text NOT NULL, status text NOT NULL DEFAULT 'initiated', from_number text NOT NULL, to_number text NOT NULL,
  admin_id varchar REFERENCES users(id), matched_user_id varchar REFERENCES users(id), booking_id varchar REFERENCES bookings(id),
  started_at timestamp, answered_at timestamp, ended_at timestamp, duration_seconds integer, last_event_at timestamp,
  metadata text, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS client_state text;
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS recording_requested_at timestamp;
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS routing_state text NOT NULL DEFAULT 'pending';
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS routing_deadline_at timestamp;
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS routing_lease_until timestamp;
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS fallback_requested_at timestamp;
CREATE INDEX IF NOT EXISTS voice_calls_routing_reconcile_idx ON voice_calls(direction, routing_state, routing_deadline_at);
CREATE UNIQUE INDEX IF NOT EXISTS voice_calls_client_state_uniq ON voice_calls(client_state) WHERE client_state IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS admin_voice_profiles_sip_username_uniq ON admin_voice_profiles(telnyx_sip_username) WHERE telnyx_sip_username IS NOT NULL;
CREATE TABLE IF NOT EXISTS voice_call_attempts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), call_id varchar NOT NULL REFERENCES voice_calls(id),
  admin_id varchar NOT NULL REFERENCES users(id), telnyx_call_control_id text UNIQUE, telnyx_call_leg_id text UNIQUE,
  client_state text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'ringing', expires_at timestamp,
  answered_at timestamp, ended_at timestamp, created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_call_attempts_call_idx ON voice_call_attempts(call_id);
CREATE INDEX IF NOT EXISTS voice_call_attempts_admin_status_idx ON voice_call_attempts(admin_id, status);
DELETE FROM voice_call_attempts newer USING voice_call_attempts older
WHERE newer.call_id = older.call_id AND newer.admin_id = older.admin_id AND newer.ctid > older.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS voice_call_attempts_call_admin_uniq ON voice_call_attempts(call_id, admin_id);
CREATE TABLE IF NOT EXISTS voice_webhook_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), telnyx_event_id text NOT NULL UNIQUE, event_type text NOT NULL,
  call_id varchar REFERENCES voice_calls(id), received_at timestamp NOT NULL DEFAULT now(), processed_at timestamp,
  payload text NOT NULL, processing_error text
);
ALTER TABLE voice_webhook_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE voice_webhook_events ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE voice_webhook_events ADD COLUMN IF NOT EXISTS next_attempt_at timestamp NOT NULL DEFAULT now();
ALTER TABLE voice_webhook_events ADD COLUMN IF NOT EXISTS lease_until timestamp;
ALTER TABLE voice_webhook_events ADD COLUMN IF NOT EXISTS last_error text;
CREATE INDEX IF NOT EXISTS voice_webhook_events_retry_idx ON voice_webhook_events(status, next_attempt_at);
CREATE TABLE IF NOT EXISTS voice_transfers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), call_id varchar NOT NULL REFERENCES voice_calls(id),
  initiated_by_admin_id varchar NOT NULL REFERENCES users(id), target_admin_id varchar REFERENCES users(id),
  target_number text, status text NOT NULL DEFAULT 'requested', telnyx_command_id text,
  completed_at timestamp, created_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE voice_transfers ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE voice_transfers ADD COLUMN IF NOT EXISTS dial_lease_until timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS voice_transfers_request_id_uniq ON voice_transfers(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS voice_transfers_active_target_idx ON voice_transfers(call_id, target_admin_id, status);
CREATE INDEX IF NOT EXISTS voice_transfers_dial_lease_idx ON voice_transfers(status, dial_lease_until);
CREATE TABLE IF NOT EXISTS voice_media (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), call_id varchar NOT NULL REFERENCES voice_calls(id),
  kind text NOT NULL, telnyx_recording_id text UNIQUE, storage_url text, content_type text,
  duration_seconds integer, transcription text, available_at timestamp, created_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE voice_media ADD COLUMN IF NOT EXISTS private_object_key text;
ALTER TABLE voice_media ADD COLUMN IF NOT EXISTS storage_status text NOT NULL DEFAULT 'pending';
ALTER TABLE voice_media ADD COLUMN IF NOT EXISTS archive_attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE voice_media ADD COLUMN IF NOT EXISTS archive_next_attempt_at timestamp NOT NULL DEFAULT now();
ALTER TABLE voice_media ADD COLUMN IF NOT EXISTS archive_last_error text;
ALTER TABLE voice_media ADD COLUMN IF NOT EXISTS archive_lease_until timestamp;
CREATE INDEX IF NOT EXISTS voice_media_archive_retry_idx ON voice_media(storage_status, archive_next_attempt_at);
CREATE UNIQUE INDEX IF NOT EXISTS voice_media_private_object_key_uniq ON voice_media(private_object_key) WHERE private_object_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_voice_profiles_enabled_idx ON admin_voice_profiles(enabled);
CREATE INDEX IF NOT EXISTS admin_voice_presence_status_idx ON admin_voice_presence(status);
CREATE INDEX IF NOT EXISTS voice_calls_control_idx ON voice_calls(telnyx_call_control_id);
CREATE INDEX IF NOT EXISTS voice_calls_admin_created_idx ON voice_calls(admin_id, created_at);
CREATE INDEX IF NOT EXISTS voice_calls_booking_idx ON voice_calls(booking_id);
CREATE INDEX IF NOT EXISTS voice_calls_phone_idx ON voice_calls(from_number, to_number);
CREATE INDEX IF NOT EXISTS voice_webhook_events_call_idx ON voice_webhook_events(call_id);
CREATE INDEX IF NOT EXISTS voice_webhook_events_type_received_idx ON voice_webhook_events(event_type, received_at);
CREATE INDEX IF NOT EXISTS voice_transfers_call_idx ON voice_transfers(call_id);
CREATE INDEX IF NOT EXISTS voice_media_call_idx ON voice_media(call_id);