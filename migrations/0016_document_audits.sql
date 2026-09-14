-- Reid Calloway (DOCOPS) — document audit + irregularity tracking.
BEGIN;

CREATE TABLE IF NOT EXISTS document_audits (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  mover_id varchar NOT NULL,
  document_type text NOT NULL,
  document_url text,
  status text DEFAULT 'pending_review',
  irregularity_score integer DEFAULT 0,
  irregularities jsonb,
  checks_run jsonb,
  audited_by text DEFAULT 'reid',
  reviewed_by text,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  clarification_requested timestamptz,
  clarification_received timestamptz,
  escalated_at timestamptz,
  escalation_reason text,
  notes text,
  kpi_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_irregularities (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id varchar REFERENCES document_audits(id),
  mover_id varchar NOT NULL,
  check_name text NOT NULL,
  result text NOT NULL,
  severity text NOT NULL,
  details text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_audits_mover
  ON document_audits(mover_id);

CREATE INDEX IF NOT EXISTS idx_doc_audits_status
  ON document_audits(status);

CREATE INDEX IF NOT EXISTS idx_doc_irregularities_audit
  ON document_irregularities(audit_id);

COMMIT;

SELECT 'Migration 0016 complete' AS result;
