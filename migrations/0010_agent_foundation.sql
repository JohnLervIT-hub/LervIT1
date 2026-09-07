-- 0010 — Agent-ready operational intelligence foundation
-- Idempotent: safe to re-run.

BEGIN;

-- =========================================================
-- a) agent_logs — every agent action recorded
-- =========================================================
CREATE TABLE IF NOT EXISTS agent_logs (
  id            varchar        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    text           NOT NULL,
  agent_code    text           NOT NULL,
  action        text           NOT NULL,
  input         jsonb,
  output        jsonb,
  status        text           NOT NULL DEFAULT 'success',
  duration_ms   integer,
  tokens_used   integer,
  cost_usd      decimal(10, 6),
  booking_id    varchar        REFERENCES bookings(id),
  mover_id      varchar        REFERENCES movers(id),
  partner_id    varchar,
  lead_id       varchar,
  created_at    timestamp      NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_logs_agent_code_idx  ON agent_logs(agent_code);
CREATE INDEX IF NOT EXISTS agent_logs_status_idx      ON agent_logs(status);
CREATE INDEX IF NOT EXISTS agent_logs_created_at_idx  ON agent_logs(created_at);
CREATE INDEX IF NOT EXISTS agent_logs_booking_id_idx  ON agent_logs(booking_id);
CREATE INDEX IF NOT EXISTS agent_logs_mover_id_idx    ON agent_logs(mover_id);

-- =========================================================
-- b) agent_decisions — reasoned decisions + escalation trail
-- =========================================================
CREATE TABLE IF NOT EXISTS agent_decisions (
  id                    varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name            text      NOT NULL,
  decision_type         text      NOT NULL,
  reasoning             text,
  outcome               text,
  confidence            decimal(5, 2),
  escalated_to_human    boolean   NOT NULL DEFAULT false,
  escalated_at          timestamp,
  resolved_at           timestamp,
  booking_id            varchar   REFERENCES bookings(id),
  created_at            timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_decisions_agent_name_idx    ON agent_decisions(agent_name);
CREATE INDEX IF NOT EXISTS agent_decisions_escalated_idx     ON agent_decisions(escalated_to_human);
CREATE INDEX IF NOT EXISTS agent_decisions_created_at_idx    ON agent_decisions(created_at);

-- =========================================================
-- c) leads — pre-booking pipeline
-- =========================================================
CREATE TABLE IF NOT EXISTS leads (
  id                     varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name           text,
  contact_phone          text,
  contact_email          text,
  source_channel         text,
  utm_source             text,
  utm_campaign           text,
  utm_medium             text,
  landing_page           text,
  intent_score           integer   NOT NULL DEFAULT 0,
  status                 text      NOT NULL DEFAULT 'new',
  touchpoints            integer   NOT NULL DEFAULT 0,
  last_touched_at        timestamp,
  converted_booking_id   varchar   REFERENCES bookings(id),
  assigned_agent         text,
  notes                  text,
  created_at             timestamp NOT NULL DEFAULT now(),
  updated_at             timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_status_idx           ON leads(status);
CREATE INDEX IF NOT EXISTS leads_source_channel_idx   ON leads(source_channel);
CREATE INDEX IF NOT EXISTS leads_created_at_idx       ON leads(created_at);
CREATE INDEX IF NOT EXISTS leads_contact_phone_idx    ON leads(contact_phone);
CREATE INDEX IF NOT EXISTS leads_contact_email_idx    ON leads(contact_email);

-- =========================================================
-- d) kpi_targets — revenue / retention / conversion goals
-- =========================================================
CREATE TABLE IF NOT EXISTS kpi_targets (
  id            varchar        PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name   text           NOT NULL,
  target_value  decimal(14, 2) NOT NULL,
  period        text           NOT NULL,
  period_start  timestamp,
  period_end    timestamp,
  created_by    varchar        REFERENCES users(id),
  created_at    timestamp      NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kpi_targets_metric_name_idx ON kpi_targets(metric_name);
CREATE INDEX IF NOT EXISTS kpi_targets_period_idx      ON kpi_targets(period);

-- Seed initial targets (idempotent — insert only if not already present)
INSERT INTO kpi_targets (metric_name, target_value, period)
SELECT 'monthly_revenue', 5000, 'monthly'
WHERE NOT EXISTS (SELECT 1 FROM kpi_targets WHERE metric_name = 'monthly_revenue');

INSERT INTO kpi_targets (metric_name, target_value, period)
SELECT 'completed_moves', 50, 'monthly'
WHERE NOT EXISTS (SELECT 1 FROM kpi_targets WHERE metric_name = 'completed_moves');

INSERT INTO kpi_targets (metric_name, target_value, period)
SELECT 'mover_retention_rate', 70, 'monthly'
WHERE NOT EXISTS (SELECT 1 FROM kpi_targets WHERE metric_name = 'mover_retention_rate');

INSERT INTO kpi_targets (metric_name, target_value, period)
SELECT 'lead_conversion_rate', 25, 'monthly'
WHERE NOT EXISTS (SELECT 1 FROM kpi_targets WHERE metric_name = 'lead_conversion_rate');

-- =========================================================
-- e) business_events — unified event log for agent consumption
-- =========================================================
CREATE TABLE IF NOT EXISTS business_events (
  id           varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   text      NOT NULL,
  entity_type  text,
  entity_id    text,
  payload      jsonb,
  source       text      NOT NULL DEFAULT 'system',
  created_at   timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_events_event_type_idx    ON business_events(event_type);
CREATE INDEX IF NOT EXISTS business_events_entity_idx        ON business_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS business_events_created_at_idx    ON business_events(created_at);

-- =========================================================
-- f) mover_activity_log — RETAIN inactivity + trend detection
-- =========================================================
CREATE TABLE IF NOT EXISTS mover_activity_log (
  id             varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  mover_id       varchar   NOT NULL REFERENCES movers(id),
  activity_type  text      NOT NULL,
  metadata       jsonb,
  created_at     timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mover_activity_log_mover_id_idx      ON mover_activity_log(mover_id);
CREATE INDEX IF NOT EXISTS mover_activity_log_activity_type_idx ON mover_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS mover_activity_log_created_at_idx    ON mover_activity_log(created_at);

-- =========================================================
-- g) zone_demand_log — DISPATCH supply/demand time-series
-- =========================================================
CREATE TABLE IF NOT EXISTS zone_demand_log (
  id            varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_name     text      NOT NULL,
  city          text,
  province      text,
  date          date      NOT NULL,
  hour          integer   NOT NULL,
  demand_count  integer   NOT NULL DEFAULT 0,
  supply_count  integer   NOT NULL DEFAULT 0,
  ratio         decimal(8, 4),
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zone_demand_log_zone_idx      ON zone_demand_log(zone_name);
CREATE INDEX IF NOT EXISTS zone_demand_log_date_hour_idx ON zone_demand_log(date, hour);

-- =========================================================
-- Bookings — attribution (UTM) + SLA fields
-- =========================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS utm_source              text,
  ADD COLUMN IF NOT EXISTS utm_medium              text,
  ADD COLUMN IF NOT EXISTS utm_campaign            text,
  ADD COLUMN IF NOT EXISTS source_channel          text,
  ADD COLUMN IF NOT EXISTS landing_page            text,
  ADD COLUMN IF NOT EXISTS expected_completion_at  timestamp,
  ADD COLUMN IF NOT EXISTS sla_deadline_at         timestamp;

CREATE INDEX IF NOT EXISTS bookings_source_channel_idx      ON bookings(source_channel);
CREATE INDEX IF NOT EXISTS bookings_sla_deadline_idx        ON bookings(sla_deadline_at);
CREATE INDEX IF NOT EXISTS bookings_expected_completion_idx ON bookings(expected_completion_at);

-- =========================================================
-- analytics_events.properties: text -> jsonb (safe cast)
-- =========================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'analytics_events'
      AND column_name = 'properties'
      AND data_type   = 'text'
  ) THEN
    ALTER TABLE analytics_events
      ALTER COLUMN properties TYPE jsonb
      USING CASE
        WHEN properties IS NULL OR properties = '' THEN NULL::jsonb
        ELSE properties::jsonb
      END;
  END IF;
END $$;

COMMIT;
