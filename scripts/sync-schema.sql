-- =============================================================================
-- scripts/sync-schema.sql
-- =============================================================================
-- Idempotent schema sync derived from shared/schema.ts.
-- Safe to run against a live production database with existing data.
--
-- What it does:
--   PHASE 1 — CREATE TABLE IF NOT EXISTS for every table (dependency order).
--   PHASE 2 — ALTER TABLE ... ADD COLUMN IF NOT EXISTS for every column.
--   PHASE 3 — CREATE INDEX IF NOT EXISTS for every index.
--
-- What it never does:
--   DROP TABLE, DROP COLUMN, TRUNCATE, or DELETE.
-- =============================================================================


-- =============================================================================
-- PHASE 1: TABLES
-- Tables are ordered so that referenced tables are always created first.
-- =============================================================================

-- ─── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
  "id"                              varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "firebase_uid"                    text            UNIQUE,
  "email"                           text            NOT NULL UNIQUE,
  "password"                        text,
  "name"                            text            NOT NULL,
  "phone"                           text,
  "address"                         text,
  "avatar_url"                      text,
  "role"                            text            NOT NULL DEFAULT 'customer',
  "stripe_customer_id"              text,
  "reset_token"                     text,
  "reset_token_expiry"              timestamp,
  "failed_login_attempts"           integer         NOT NULL DEFAULT 0,
  "locked_until"                    timestamp,
  "locked_by_admin"                 boolean         NOT NULL DEFAULT false,
  "lock_reason"                     text,
  "email_verified"                  boolean         NOT NULL DEFAULT false,
  "verification_token"              text,
  "verification_token_expiry"       timestamp,
  "phone_verified"                  boolean         NOT NULL DEFAULT false,
  "phone_verification_code"         text,
  "phone_verification_expiry"       timestamp,
  "has_completed_onboarding"        boolean         NOT NULL DEFAULT false,
  "has_used_first_move_discount"    boolean         NOT NULL DEFAULT false,
  "promo_uses_count"                integer         NOT NULL DEFAULT 0,
  "sms_job_alerts"                  boolean         NOT NULL DEFAULT true,
  "sms_booking_updates"             boolean         NOT NULL DEFAULT false,
  "email_job_alerts"                boolean         NOT NULL DEFAULT true,
  "email_booking_updates"           boolean         NOT NULL DEFAULT true,
  "email_earnings_reports"          boolean         NOT NULL DEFAULT true,
  "email_promotions"                boolean         NOT NULL DEFAULT false,
  "push_notifications"              boolean         NOT NULL DEFAULT true,
  "referral_code"                   varchar(6)      UNIQUE,
  "referral_credits"                integer         NOT NULL DEFAULT 0,
  "created_at"                      timestamp       NOT NULL DEFAULT now(),
  "last_login_at"                   timestamp,
  "last_logout_at"                  timestamp
);

-- ─── phone_verification_tokens ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "phone_verification_tokens" (
  "id"                varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "phone"             text        NOT NULL,
  "verification_code" text        NOT NULL,
  "expires_at"        timestamp   NOT NULL,
  "verified"          boolean     NOT NULL DEFAULT false,
  "verified_token"    text,
  "created_at"        timestamp   NOT NULL DEFAULT now()
);

-- ─── movers ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "movers" (
  "id"                        varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                   varchar         NOT NULL REFERENCES "users"("id"),
  "vehicle_type"              text            NOT NULL,
  "vehicle_capacity"          text,
  "vehicle_photo"             text,
  "vehicle_color"             text,
  "license_plate"             text,
  "license_number"            text,
  "mover_image"               text,
  "is_verified"               boolean         NOT NULL DEFAULT false,
  "profile_verified"          boolean         NOT NULL DEFAULT false,
  "documents_verified"        boolean         NOT NULL DEFAULT false,
  "rating"                    decimal(3,2)    DEFAULT 0,
  "total_moves"               integer         NOT NULL DEFAULT 0,
  "completed_trips"           integer         NOT NULL DEFAULT 0,
  "bio"                       text,
  "location"                  text,
  "latitude"                  double precision,
  "longitude"                 double precision,
  "last_location_update"      timestamp,
  "is_available"              boolean         NOT NULL DEFAULT true,
  "pilot_status"              text            DEFAULT 'none',
  "pilot_approved_by"         varchar         REFERENCES "users"("id"),
  "pilot_approved_at"         timestamp,
  "pilot_notes"               text,
  "pilot_expires_at"          timestamp,
  "onboarding_completed"      boolean         NOT NULL DEFAULT false,
  "profile_reminder_count"    integer         NOT NULL DEFAULT 0,
  "last_profile_reminder_at"  timestamp,
  "created_at"                timestamp       NOT NULL DEFAULT now()
);

-- ─── mover_terms_acceptance ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mover_terms_acceptance" (
  "id"                varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "mover_id"          varchar     NOT NULL REFERENCES "movers"("id"),
  "terms_version"     text        NOT NULL,
  "accepted_at"       timestamp   NOT NULL DEFAULT now(),
  "accepted_from_ip"  text,
  "user_agent"        text
);

-- ─── support_tickets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id"                      varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                 varchar     NOT NULL REFERENCES "users"("id"),
  "subject"                 text        NOT NULL,
  "category"                text        NOT NULL DEFAULT 'general',
  "message"                 text        NOT NULL,
  "status"                  text        NOT NULL DEFAULT 'open',
  "priority"                text        NOT NULL DEFAULT 'normal',
  "assigned_to"             varchar     REFERENCES "users"("id"),
  "resolved_at"             timestamp,
  "customer_last_read_at"   timestamp,
  "last_staff_reply_at"     timestamp,
  "created_at"              timestamp   NOT NULL DEFAULT now(),
  "updated_at"              timestamp   NOT NULL DEFAULT now()
);

-- ─── support_ticket_replies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "support_ticket_replies" (
  "id"          varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id"   varchar     NOT NULL REFERENCES "support_tickets"("id"),
  "user_id"     varchar     NOT NULL REFERENCES "users"("id"),
  "message"     text        NOT NULL,
  "is_staff"    boolean     NOT NULL DEFAULT false,
  "created_at"  timestamp   NOT NULL DEFAULT now()
);

-- ─── mover_stripe_accounts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mover_stripe_accounts" (
  "id"                  varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "mover_id"            varchar     NOT NULL UNIQUE REFERENCES "movers"("id"),
  "stripe_account_id"   text        NOT NULL UNIQUE,
  "account_type"        text        NOT NULL DEFAULT 'express',
  "onboarding_status"   text        NOT NULL DEFAULT 'pending',
  "charges_enabled"     boolean     NOT NULL DEFAULT false,
  "payouts_enabled"     boolean     NOT NULL DEFAULT false,
  "details_submitted"   boolean     NOT NULL DEFAULT false,
  "requirements_due"    text[],
  "currently_due"       text[],
  "default_currency"    text        DEFAULT 'cad',
  "country"             text        DEFAULT 'CA',
  "reminder_count"      integer     NOT NULL DEFAULT 0,
  "last_reminder_at"    timestamp,
  "created_at"          timestamp   NOT NULL DEFAULT now(),
  "updated_at"          timestamp   NOT NULL DEFAULT now()
);

-- ─── mover_payouts (must precede mover_earnings) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "mover_payouts" (
  "id"                varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "mover_id"          varchar         NOT NULL REFERENCES "movers"("id"),
  "stripe_payout_id"  text,
  "amount"            decimal(10,2)   NOT NULL,
  "currency"          text            NOT NULL DEFAULT 'cad',
  "status"            text            NOT NULL DEFAULT 'pending',
  "payout_type"       text            NOT NULL DEFAULT 'standard',
  "arrival_date"      timestamp,
  "failure_code"      text,
  "failure_message"   text,
  "initiated_at"      timestamp       NOT NULL DEFAULT now(),
  "completed_at"      timestamp,
  "created_at"        timestamp       NOT NULL DEFAULT now()
);

-- ─── bookings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bookings" (
  "id"                            varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "customer_id"                   varchar         NOT NULL REFERENCES "users"("id"),
  "mover_id"                      varchar         REFERENCES "movers"("id"),
  "pre_selected_mover_id"         varchar         REFERENCES "movers"("id"),
  "pickup_address"                text            NOT NULL,
  "dropoff_address"               text            NOT NULL,
  "pickup_latitude"               double precision NOT NULL DEFAULT 0,
  "pickup_longitude"              double precision NOT NULL DEFAULT 0,
  "dropoff_latitude"              double precision NOT NULL DEFAULT 0,
  "dropoff_longitude"             double precision NOT NULL DEFAULT 0,
  "load_size"                     text            NOT NULL,
  "description"                   text,
  "images"                        text[],
  "preferred_date"                timestamp       NOT NULL,
  "status"                        text            NOT NULL DEFAULT 'pending',
  "pickup_difficulty"             text            NOT NULL DEFAULT 'ground',
  "dropoff_difficulty"            text            NOT NULL DEFAULT 'ground',
  "heavy_item"                    boolean         NOT NULL DEFAULT false,
  "number_of_movers"              integer         NOT NULL DEFAULT 1,
  "acknowledged_single_mover_policy" boolean      NOT NULL DEFAULT false,
  "distance"                      decimal(8,2)    NOT NULL DEFAULT 0,
  "price"                         decimal(10,2)   NOT NULL DEFAULT 0,
  "base_fee"                      decimal(10,2)   NOT NULL DEFAULT 0,
  "distance_fee"                  decimal(10,2)   NOT NULL DEFAULT 0,
  "load_fee"                      decimal(10,2)   NOT NULL DEFAULT 0,
  "mover_travel_fee"              decimal(10,2)   NOT NULL DEFAULT 0,
  "pickup_difficulty_fee"         decimal(10,2)   NOT NULL DEFAULT 0,
  "dropoff_difficulty_fee"        decimal(10,2)   NOT NULL DEFAULT 0,
  "heavy_item_fee"                decimal(10,2)   NOT NULL DEFAULT 0,
  "subtotal"                      decimal(10,2)   NOT NULL DEFAULT 0,
  "promo_code"                    text,
  "discount_percent"              decimal(5,2)    NOT NULL DEFAULT 0,
  "discount_amount"               decimal(10,2)   NOT NULL DEFAULT 0,
  "discount_reason"               text,
  "mover_balance_owed"            decimal(10,2)   NOT NULL DEFAULT 0,
  "mover_balance_paid"            boolean         NOT NULL DEFAULT false,
  "ai_estimate"                   text,
  "ai_explanation"                text,
  "ai_photo_analysis"             text,
  "ai_weight_class"               text,
  "ai_recommended_vehicle"        text,
  "ai_confidence_score"           decimal(3,2),
  "detected_items"                text,
  "payment_status"                text            DEFAULT 'pending',
  "stripe_payment_intent_id"      text,
  "notified_at"                   timestamp,
  "accepted_at"                   timestamp,
  "platform_fee_percent"          decimal(5,2)    NOT NULL DEFAULT 15.00,
  "platform_fee_amount"           decimal(10,2)   NOT NULL DEFAULT 0,
  "mover_net_amount"              decimal(10,2)   NOT NULL DEFAULT 0,
  "current_latitude"              double precision,
  "current_longitude"             double precision,
  "location_updated_at"           timestamp,
  "flagged_for_review"            boolean         NOT NULL DEFAULT false,
  "flagged_reason"                text,
  "enterprise_partner_id"         varchar,
  "enterprise_status"             text,
  "routed_to_partner_at"          timestamp,
  "enterprise_accepted_at"        timestamp,
  "enterprise_rejected_at"        timestamp,
  "enterprise_rejection_reason"   text,
  "created_at"                    timestamp       NOT NULL DEFAULT now(),
  "updated_at"                    timestamp       NOT NULL DEFAULT now()
);

-- ─── messages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "messages" (
  "id"          varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id"  varchar     NOT NULL REFERENCES "bookings"("id"),
  "sender_id"   varchar     NOT NULL REFERENCES "users"("id"),
  "text"        text        NOT NULL,
  "created_at"  timestamp   NOT NULL DEFAULT now(),
  "read_at"     timestamp
);

-- ─── reviews ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reviews" (
  "id"          varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id"  varchar     NOT NULL REFERENCES "bookings"("id"),
  "mover_id"    varchar     REFERENCES "movers"("id"),
  "customer_id" varchar     NOT NULL REFERENCES "users"("id"),
  "rating"      integer     NOT NULL,
  "comment"     text,
  "created_at"  timestamp   NOT NULL DEFAULT now()
);

-- ─── job_notifications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "job_notifications" (
  "id"                    varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id"            varchar         NOT NULL REFERENCES "bookings"("id"),
  "mover_id"              varchar         NOT NULL REFERENCES "movers"("id"),
  "distance_to_pickup"    decimal(8,2)    NOT NULL,
  "estimated_earnings"    decimal(10,2)   NOT NULL,
  "status"                text            NOT NULL DEFAULT 'pending',
  "notified_at"           timestamp       NOT NULL DEFAULT now(),
  "responded_at"          timestamp,
  "expires_at"            timestamp       NOT NULL,
  UNIQUE ("booking_id", "mover_id")
);

-- ─── verification_items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "verification_items" (
  "id"                varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "mover_id"          varchar     NOT NULL REFERENCES "movers"("id"),
  "type"              text        NOT NULL,
  "status"            text        NOT NULL DEFAULT 'pending',
  "data"              text,
  "file_urls"         text[],
  "rejection_reason"  text,
  "expiry_date"       timestamp,
  "submitted_at"      timestamp,
  "reviewed_at"       timestamp,
  "reviewed_by"       varchar     REFERENCES "users"("id"),
  "created_at"        timestamp   NOT NULL DEFAULT now(),
  "updated_at"        timestamp   NOT NULL DEFAULT now()
);

-- ─── identified_items ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "identified_items" (
  "id"                  varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id"          varchar         NOT NULL REFERENCES "bookings"("id"),
  "photo_url"           text            NOT NULL,
  "item_name"           text,
  "category"            text,
  "weight_kg"           decimal(8,2),
  "dimensions_l_cm"     decimal(8,2),
  "dimensions_w_cm"     decimal(8,2),
  "dimensions_h_cm"     decimal(8,2),
  "volume_cuft"         decimal(8,2),
  "handling_complexity" text,
  "vehicle_type"        text,
  "recommended_movers"  integer,
  "insurance_level"     text,
  "confidence"          decimal(3,2),
  "source_metadata"     text,
  "processing_status"   text            NOT NULL DEFAULT 'pending',
  "error_message"       text,
  "created_at"          timestamp       NOT NULL DEFAULT now(),
  "updated_at"          timestamp       NOT NULL DEFAULT now()
);

-- ─── ai_runs ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ai_runs" (
  "id"              varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id"      varchar         REFERENCES "bookings"("id"),
  "provider"        text            NOT NULL,
  "operation"       text            NOT NULL,
  "input_tokens"    integer,
  "output_tokens"   integer,
  "total_cost"      decimal(10,4),
  "status"          text            NOT NULL DEFAULT 'success',
  "error_message"   text,
  "response_time"   integer,
  "created_at"      timestamp       NOT NULL DEFAULT now()
);

-- ─── ai_support_insights ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ai_support_insights" (
  "id"                    varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id"             varchar     NOT NULL REFERENCES "support_tickets"("id"),
  "summary"               text        NOT NULL,
  "category"              text        NOT NULL,
  "suggested_priority"    text        NOT NULL,
  "root_cause"            text,
  "recommendations"       text[]      NOT NULL,
  "suggested_response"    text,
  "customer_response"     text,
  "internal_notes"        text,
  "similar_cases"         text[],
  "confidence"            integer     NOT NULL DEFAULT 80,
  "processing_time_ms"    integer,
  "model_used"            text        DEFAULT 'gpt-4o',
  "created_at"            timestamp   NOT NULL DEFAULT now(),
  "expires_at"            timestamp
);

-- ─── mover_earnings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mover_earnings" (
  "id"                    varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "mover_id"              varchar         NOT NULL REFERENCES "movers"("id"),
  "booking_id"            varchar         NOT NULL UNIQUE REFERENCES "bookings"("id"),
  "gross_amount"          decimal(10,2)   NOT NULL,
  "platform_fee_percent"  decimal(5,2)    NOT NULL DEFAULT 15.00,
  "platform_fee_amount"   decimal(10,2)   NOT NULL,
  "net_amount"            decimal(10,2)   NOT NULL,
  "stripe_transfer_id"    text,
  "status"                text            NOT NULL DEFAULT 'pending',
  "available_at"          timestamp,
  "paid_at"               timestamp,
  "payout_id"             varchar         REFERENCES "mover_payouts"("id"),
  "created_at"            timestamp       NOT NULL DEFAULT now()
);

-- ─── booking_metrics ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "booking_metrics" (
  "id"                          varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id"                  varchar         NOT NULL UNIQUE REFERENCES "bookings"("id"),
  "estimated_vehicle_class"     text,
  "estimated_volume_cuft"       decimal(8,2),
  "estimated_weight_kg"         decimal(8,2),
  "estimated_duration_minutes"  integer,
  "estimated_price"             decimal(10,2),
  "actual_vehicle_class"        text,
  "actual_volume_cuft"          decimal(8,2),
  "actual_weight_kg"            decimal(8,2),
  "actual_duration_minutes"     integer,
  "actual_price"                decimal(10,2),
  "volume_accuracy_percent"     decimal(5,2),
  "price_accuracy_percent"      decimal(5,2),
  "vehicle_class_match"         boolean,
  "customer_satisfaction_rating" integer,
  "estimate_accuracy_rating"    integer,
  "customer_notes"              text,
  "mover_difficulty_rating"     integer,
  "mover_notes"                 text,
  "loading_time_minutes"        integer,
  "unloading_time_minutes"      integer,
  "used_for_training"           boolean         NOT NULL DEFAULT false,
  "outlier_flag"                boolean         NOT NULL DEFAULT false,
  "reviewed_by_admin"           boolean         NOT NULL DEFAULT false,
  "created_at"                  timestamp       NOT NULL DEFAULT now(),
  "updated_at"                  timestamp       NOT NULL DEFAULT now()
);

-- ─── item_feedback ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "item_feedback" (
  "id"                        varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "identified_item_id"        varchar         NOT NULL REFERENCES "identified_items"("id"),
  "booking_id"                varchar         NOT NULL REFERENCES "bookings"("id"),
  "submitted_by"              varchar         NOT NULL REFERENCES "users"("id"),
  "submitter_role"            text            NOT NULL,
  "original_item_name"        text,
  "original_category"         text,
  "original_weight_kg"        decimal(8,2),
  "original_volume_cuft"      decimal(8,2),
  "original_vehicle_type"     text,
  "corrected_item_name"       text,
  "corrected_category"        text,
  "corrected_weight_kg"       decimal(8,2),
  "corrected_volume_cuft"     decimal(8,2),
  "corrected_vehicle_type"    text,
  "feedback_reason"           text,
  "feedback_notes"            text,
  "processed_for_learning"    boolean         NOT NULL DEFAULT false,
  "processed_at"              timestamp,
  "created_at"                timestamp       NOT NULL DEFAULT now()
);

-- ─── mover_performance ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mover_performance" (
  "id"                        varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "mover_id"                  varchar         NOT NULL REFERENCES "movers"("id"),
  "booking_id"                varchar         NOT NULL REFERENCES "bookings"("id"),
  "accepted_at"               timestamp,
  "arrived_at_pickup_at"      timestamp,
  "loading_started_at"        timestamp,
  "loading_completed_at"      timestamp,
  "arrived_at_dropoff_at"     timestamp,
  "unloading_completed_at"    timestamp,
  "arrival_delay_minutes"     integer,
  "total_move_minutes"        integer,
  "communication_score"       integer,
  "professionalism_score"     integer,
  "care_with_items_score"     integer,
  "load_class"                text,
  "distance_km"               decimal(8,2),
  "had_issues"                boolean         NOT NULL DEFAULT false,
  "issue_description"         text,
  "was_rejected"              boolean         NOT NULL DEFAULT false,
  "rejection_reason"          text,
  "was_good_match"            boolean,
  "match_score"               decimal(5,2),
  "created_at"                timestamp       NOT NULL DEFAULT now()
);

-- ─── learning_insights ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "learning_insights" (
  "id"                        varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  "insight_type"              text            NOT NULL,
  "period_start"              timestamp       NOT NULL,
  "period_end"                timestamp       NOT NULL,
  "sample_size"               integer         NOT NULL,
  "accuracy_percent"          decimal(5,2),
  "avg_error_percent"         decimal(5,2),
  "category_breakdown"        text,
  "vehicle_class_breakdown"   text,
  "recommendations"           text[],
  "adjustment_factors"        text,
  "created_at"                timestamp       NOT NULL DEFAULT now()
);

-- ─── email_campaigns ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "email_campaigns" (
  "id"              varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "subject"         text        NOT NULL,
  "content"         text        NOT NULL,
  "type"            text        NOT NULL,
  "audience_type"   text        NOT NULL,
  "recipient_ids"   text[],
  "recipient_count" integer     NOT NULL DEFAULT 0,
  "sent_by"         varchar     NOT NULL REFERENCES "users"("id"),
  "status"          text        NOT NULL DEFAULT 'draft',
  "sent_at"         timestamp,
  "created_at"      timestamp   NOT NULL DEFAULT now()
);

-- ─── abandoned_bookings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "abandoned_bookings" (
  "id"                    varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"               varchar     REFERENCES "users"("id"),
  "email"                 text,
  "phone"                 text,
  "pickup_address"        text,
  "dropoff_address"       text,
  "load_size"             text,
  "preferred_date"        text,
  "selected_mover_id"     varchar     REFERENCES "movers"("id"),
  "last_step"             integer     NOT NULL DEFAULT 1,
  "reminder_sent_at"      timestamp,
  "reminder_count"        integer     NOT NULL DEFAULT 0,
  "recovered"             boolean     NOT NULL DEFAULT false,
  "recovered_booking_id"  varchar     REFERENCES "bookings"("id"),
  "created_at"            timestamp   NOT NULL DEFAULT now(),
  "updated_at"            timestamp   NOT NULL DEFAULT now()
);

-- ─── in_app_notifications ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "in_app_notifications" (
  "id"                varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"           varchar     NOT NULL REFERENCES "users"("id"),
  "type"              text        NOT NULL,
  "title"             text        NOT NULL,
  "message"           text        NOT NULL,
  "booking_id"        varchar     REFERENCES "bookings"("id"),
  "support_ticket_id" varchar     REFERENCES "support_tickets"("id"),
  "action_url"        text,
  "is_read"           boolean     NOT NULL DEFAULT false,
  "read_at"           timestamp,
  "metadata"          text,
  "created_at"        timestamp   NOT NULL DEFAULT now()
);

-- ─── analytics_events ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id"          varchar       PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_name"  varchar(100)  NOT NULL,
  "user_id"     varchar       REFERENCES "users"("id"),
  "session_id"  varchar(100),
  "page"        varchar(200),
  "properties"  text,
  "created_at"  timestamp     NOT NULL DEFAULT now()
);

-- ─── partners ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partners" (
  "id"                        varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"                      text        NOT NULL,
  "legal_name"                text        NOT NULL,
  "operating_name"            text,
  "status"                    text        NOT NULL DEFAULT 'invited',
  "onboarding_step"           integer     NOT NULL DEFAULT 1,
  "billing_email"             text,
  "primary_ops_contact"       text,
  "primary_ops_email"         text,
  "primary_ops_phone"         text,
  "dispatch_contact"          text,
  "escalation_contact"        text,
  "address"                   text,
  "phone"                     text,
  "service_description"       text,
  "dispatch_method"           text        DEFAULT 'manual',
  "dispatch_phone"            text,
  "dispatch_email"            text,
  "dispatch_notes"            text,
  "profile_complete"          boolean     NOT NULL DEFAULT false,
  "coverage_complete"         boolean     NOT NULL DEFAULT false,
  "compliance_complete"       boolean     NOT NULL DEFAULT false,
  "dispatch_complete"         boolean     NOT NULL DEFAULT false,
  "terms_accepted"            boolean     NOT NULL DEFAULT false,
  "terms_accepted_at"         timestamp,
  "test_booking_complete"     boolean     NOT NULL DEFAULT false,
  "activated_at"              timestamp,
  "activated_by"              varchar     REFERENCES "users"("id"),
  "suspended_at"              timestamp,
  "suspended_reason"          text,
  "stripe_account_id"         text,
  "stripe_connect_status"     text        DEFAULT 'not_connected',
  "stripe_payouts_enabled"    boolean     DEFAULT false,
  "stripe_details_submitted"  boolean     DEFAULT false,
  "logo_url"                  text,
  "admin_notes"               text,
  "created_at"                timestamp   NOT NULL DEFAULT now(),
  "updated_at"                timestamp   NOT NULL DEFAULT now()
);

-- ─── partner_users ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partner_users" (
  "id"            varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"       varchar     NOT NULL REFERENCES "users"("id"),
  "partner_id"    varchar     NOT NULL REFERENCES "partners"("id"),
  "partner_role"  text        NOT NULL DEFAULT 'partner_viewer',
  "is_active"     boolean     NOT NULL DEFAULT true,
  "created_at"    timestamp   NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "partner_id")
);

-- ─── partner_invites ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partner_invites" (
  "id"          varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_id"  varchar     NOT NULL REFERENCES "partners"("id"),
  "email"       text        NOT NULL,
  "name"        text,
  "role"        text        NOT NULL DEFAULT 'partner_admin',
  "token"       text        NOT NULL UNIQUE,
  "expires_at"  timestamp   NOT NULL,
  "used_at"     timestamp,
  "invited_by"  varchar     REFERENCES "users"("id"),
  "created_at"  timestamp   NOT NULL DEFAULT now()
);

-- ─── coverage_zones ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "coverage_zones" (
  "id"                        varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_id"                varchar     NOT NULL REFERENCES "partners"("id"),
  "zone_name"                 text        NOT NULL,
  "city"                      text        NOT NULL,
  "province"                  text,
  "postal_code_prefixes"      text[],
  "service_radius_km"         integer,
  "operating_hours_start"     text        DEFAULT '08:00',
  "operating_hours_end"       text        DEFAULT '18:00',
  "operating_days"            text[],
  "same_day_available"        boolean     NOT NULL DEFAULT false,
  "supported_vehicle_classes" text[],
  "supported_load_sizes"      text[],
  "excluded_categories"       text[],
  "is_active"                 boolean     NOT NULL DEFAULT true,
  "created_at"                timestamp   NOT NULL DEFAULT now(),
  "updated_at"                timestamp   NOT NULL DEFAULT now()
);

-- ─── compliance_docs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "compliance_docs" (
  "id"              varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_id"      varchar     NOT NULL REFERENCES "partners"("id"),
  "doc_type"        text        NOT NULL,
  "file_url"        text,
  "file_name"       text,
  "file_size"       integer,
  "expiry_date"     timestamp,
  "review_status"   text        NOT NULL DEFAULT 'pending',
  "review_notes"    text,
  "reviewed_by"     varchar     REFERENCES "users"("id"),
  "reviewed_at"     timestamp,
  "uploaded_by"     varchar     REFERENCES "users"("id"),
  "created_at"      timestamp   NOT NULL DEFAULT now(),
  "updated_at"      timestamp   NOT NULL DEFAULT now()
);

-- ─── partner_team_members ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partner_team_members" (
  "id"            varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_id"    varchar     NOT NULL REFERENCES "partners"("id"),
  "name"          text        NOT NULL,
  "member_type"   text        NOT NULL DEFAULT 'driver',
  "phone"         text,
  "vehicle_type"  text,
  "vehicle_plate" text,
  "vehicle_color" text,
  "driver_photo"  text,
  "vehicle_photo" text,
  "is_available"  boolean     NOT NULL DEFAULT true,
  "notes"         text,
  "created_at"    timestamp   NOT NULL DEFAULT now()
);

-- ─── booking_assignments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "booking_assignments" (
  "id"                varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id"        varchar     NOT NULL REFERENCES "bookings"("id"),
  "partner_id"        varchar     NOT NULL REFERENCES "partners"("id"),
  "team_member_id"    varchar     REFERENCES "partner_team_members"("id"),
  "driver_name"       text,
  "driver_phone"      text,
  "team_name"         text,
  "vehicle_type"      text,
  "vehicle_plate"     text,
  "estimated_arrival" timestamp,
  "assigned_by"       varchar     REFERENCES "users"("id"),
  "assigned_at"       timestamp   NOT NULL DEFAULT now(),
  "notes"             text
);

-- ─── booking_status_events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "booking_status_events" (
  "id"                varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id"        varchar     NOT NULL REFERENCES "bookings"("id"),
  "partner_id"        varchar     REFERENCES "partners"("id"),
  "from_status"       text,
  "to_status"         text        NOT NULL,
  "changed_by"        varchar     REFERENCES "users"("id"),
  "notes"             text,
  "customer_visible"  boolean     NOT NULL DEFAULT false,
  "created_at"        timestamp   NOT NULL DEFAULT now()
);

-- ─── partner_incidents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partner_incidents" (
  "id"                varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id"        varchar     NOT NULL REFERENCES "bookings"("id"),
  "partner_id"        varchar     NOT NULL REFERENCES "partners"("id"),
  "category"          text        NOT NULL,
  "severity"          text        NOT NULL DEFAULT 'medium',
  "status"            text        NOT NULL DEFAULT 'open',
  "title"             text        NOT NULL,
  "notes"             text        NOT NULL,
  "file_urls"         text[],
  "escalation_flag"   boolean     NOT NULL DEFAULT false,
  "reported_by"       varchar     REFERENCES "users"("id"),
  "resolved_by"       varchar     REFERENCES "users"("id"),
  "resolved_at"       timestamp,
  "resolution_notes"  text,
  "created_at"        timestamp   NOT NULL DEFAULT now(),
  "updated_at"        timestamp   NOT NULL DEFAULT now()
);

-- ─── proof_of_completion ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "proof_of_completion" (
  "id"          varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id"  varchar     NOT NULL REFERENCES "bookings"("id"),
  "partner_id"  varchar     NOT NULL REFERENCES "partners"("id"),
  "file_url"    text        NOT NULL,
  "file_name"   text,
  "file_type"   text,
  "proof_type"  text        NOT NULL DEFAULT 'photo',
  "notes"       text,
  "uploaded_by" varchar     REFERENCES "users"("id"),
  "uploaded_at" timestamp   NOT NULL DEFAULT now()
);

-- ─── partner_audit_log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partner_audit_log" (
  "id"          varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_id"  varchar     NOT NULL REFERENCES "partners"("id"),
  "actor_id"    varchar     REFERENCES "users"("id"),
  "action"      text        NOT NULL,
  "object_type" text,
  "object_id"   text,
  "notes"       text,
  "ip_address"  text,
  "created_at"  timestamp   NOT NULL DEFAULT now()
);

-- ─── partner_direct_messages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partner_direct_messages" (
  "id"          varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_id"  varchar     NOT NULL REFERENCES "partners"("id"),
  "sender_id"   varchar     NOT NULL REFERENCES "users"("id"),
  "sender_role" text        NOT NULL,
  "text"        text        NOT NULL,
  "created_at"  timestamp   NOT NULL DEFAULT now(),
  "read_at"     timestamp
);

-- ─── saved_addresses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "saved_addresses" (
  "id"          varchar           PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     varchar           NOT NULL REFERENCES "users"("id"),
  "label"       text              NOT NULL,
  "address"     text              NOT NULL,
  "latitude"    double precision,
  "longitude"   double precision,
  "created_at"  timestamp         NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "label")
);

-- ─── feedback_surveys ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "feedback_surveys" (
  "id"            varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id"    varchar     NOT NULL UNIQUE REFERENCES "bookings"("id"),
  "user_id"       varchar     NOT NULL REFERENCES "users"("id"),
  "nps_score"     integer     NOT NULL,
  "ease_rating"   integer     NOT NULL,
  "mover_rating"  integer     NOT NULL,
  "comments"      text,
  "submitted_at"  timestamp   NOT NULL DEFAULT now()
);

-- ─── mover_availability ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mover_availability" (
  "id"              varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"         varchar     NOT NULL REFERENCES "users"("id"),
  "available_date"  date        NOT NULL,
  "start_time"      time,
  "end_time"        time,
  "created_at"      timestamp   NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "available_date")
);

-- ─── referrals ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "referrals" (
  "id"              varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "referrer_id"     varchar     NOT NULL REFERENCES "users"("id"),
  "referred_id"     varchar     NOT NULL UNIQUE REFERENCES "users"("id"),
  "code"            varchar(6)  NOT NULL,
  "credit_awarded"  boolean     NOT NULL DEFAULT false,
  "created_at"      timestamp   NOT NULL DEFAULT now()
);

-- ─── ai_incident_insights ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ai_incident_insights" (
  "id"                    varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "incident_id"           varchar     NOT NULL REFERENCES "partner_incidents"("id"),
  "summary"               text        NOT NULL,
  "severity_assessment"   text        NOT NULL,
  "root_cause"            text,
  "recommendations"       text[]      NOT NULL,
  "partner_communication" text,
  "internal_notes"        text,
  "escalation_advice"     text,
  "confidence"            integer     NOT NULL DEFAULT 80,
  "processing_time_ms"    integer,
  "model_used"            text        DEFAULT 'gpt-4o',
  "created_at"            timestamp   NOT NULL DEFAULT now(),
  "expires_at"            timestamp
);


-- =============================================================================
-- PHASE 2: COLUMNS
-- Adds any column that may be missing from an older schema version.
-- Safe to run repeatedly — PostgreSQL skips columns that already exist.
-- =============================================================================

-- ─── users ───────────────────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "firebase_uid"                    text,
  ADD COLUMN IF NOT EXISTS "password"                        text,
  ADD COLUMN IF NOT EXISTS "phone"                           text,
  ADD COLUMN IF NOT EXISTS "address"                         text,
  ADD COLUMN IF NOT EXISTS "avatar_url"                      text,
  ADD COLUMN IF NOT EXISTS "role"                            text            NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS "stripe_customer_id"              text,
  ADD COLUMN IF NOT EXISTS "reset_token"                     text,
  ADD COLUMN IF NOT EXISTS "reset_token_expiry"              timestamp,
  ADD COLUMN IF NOT EXISTS "failed_login_attempts"           integer         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "locked_until"                    timestamp,
  ADD COLUMN IF NOT EXISTS "locked_by_admin"                 boolean         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lock_reason"                     text,
  ADD COLUMN IF NOT EXISTS "email_verified"                  boolean         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "verification_token"              text,
  ADD COLUMN IF NOT EXISTS "verification_token_expiry"       timestamp,
  ADD COLUMN IF NOT EXISTS "phone_verified"                  boolean         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "phone_verification_code"         text,
  ADD COLUMN IF NOT EXISTS "phone_verification_expiry"       timestamp,
  ADD COLUMN IF NOT EXISTS "has_completed_onboarding"        boolean         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "has_used_first_move_discount"    boolean         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "promo_uses_count"                integer         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sms_job_alerts"                  boolean         NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "sms_booking_updates"             boolean         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "email_job_alerts"                boolean         NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "email_booking_updates"           boolean         NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "email_earnings_reports"          boolean         NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "email_promotions"                boolean         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "push_notifications"              boolean         NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "referral_code"                   varchar(6),
  ADD COLUMN IF NOT EXISTS "referral_credits"                integer         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_login_at"                   timestamp,
  ADD COLUMN IF NOT EXISTS "last_logout_at"                  timestamp;

-- ─── phone_verification_tokens ───────────────────────────────────────────────
ALTER TABLE "phone_verification_tokens"
  ADD COLUMN IF NOT EXISTS "verified"       boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "verified_token" text;

-- ─── movers ──────────────────────────────────────────────────────────────────
ALTER TABLE "movers"
  ADD COLUMN IF NOT EXISTS "vehicle_capacity"           text,
  ADD COLUMN IF NOT EXISTS "vehicle_photo"              text,
  ADD COLUMN IF NOT EXISTS "vehicle_color"              text,
  ADD COLUMN IF NOT EXISTS "license_plate"              text,
  ADD COLUMN IF NOT EXISTS "license_number"             text,
  ADD COLUMN IF NOT EXISTS "mover_image"                text,
  ADD COLUMN IF NOT EXISTS "profile_verified"           boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "documents_verified"         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "completed_trips"            integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bio"                        text,
  ADD COLUMN IF NOT EXISTS "location"                   text,
  ADD COLUMN IF NOT EXISTS "latitude"                   double precision,
  ADD COLUMN IF NOT EXISTS "longitude"                  double precision,
  ADD COLUMN IF NOT EXISTS "last_location_update"       timestamp,
  ADD COLUMN IF NOT EXISTS "pilot_status"               text        DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "pilot_approved_by"          varchar,
  ADD COLUMN IF NOT EXISTS "pilot_approved_at"          timestamp,
  ADD COLUMN IF NOT EXISTS "pilot_notes"                text,
  ADD COLUMN IF NOT EXISTS "pilot_expires_at"           timestamp,
  ADD COLUMN IF NOT EXISTS "onboarding_completed"       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "profile_reminder_count"     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_profile_reminder_at"   timestamp;

-- ─── mover_terms_acceptance ──────────────────────────────────────────────────
ALTER TABLE "mover_terms_acceptance"
  ADD COLUMN IF NOT EXISTS "accepted_from_ip" text,
  ADD COLUMN IF NOT EXISTS "user_agent"        text;

-- ─── bookings ────────────────────────────────────────────────────────────────
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "pre_selected_mover_id"            varchar,
  ADD COLUMN IF NOT EXISTS "pickup_latitude"                  double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pickup_longitude"                 double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "dropoff_latitude"                 double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "dropoff_longitude"                double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "description"                      text,
  ADD COLUMN IF NOT EXISTS "images"                           text[],
  ADD COLUMN IF NOT EXISTS "pickup_difficulty"                text        NOT NULL DEFAULT 'ground',
  ADD COLUMN IF NOT EXISTS "dropoff_difficulty"               text        NOT NULL DEFAULT 'ground',
  ADD COLUMN IF NOT EXISTS "heavy_item"                       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "number_of_movers"                 integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "acknowledged_single_mover_policy" boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "distance"                         decimal(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "base_fee"                         decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "distance_fee"                     decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "load_fee"                         decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "mover_travel_fee"                 decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pickup_difficulty_fee"            decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "dropoff_difficulty_fee"           decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "heavy_item_fee"                   decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "subtotal"                         decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "promo_code"                       text,
  ADD COLUMN IF NOT EXISTS "discount_percent"                 decimal(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discount_amount"                  decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discount_reason"                  text,
  ADD COLUMN IF NOT EXISTS "mover_balance_owed"               decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "mover_balance_paid"               boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_estimate"                      text,
  ADD COLUMN IF NOT EXISTS "ai_explanation"                   text,
  ADD COLUMN IF NOT EXISTS "ai_photo_analysis"                text,
  ADD COLUMN IF NOT EXISTS "ai_weight_class"                  text,
  ADD COLUMN IF NOT EXISTS "ai_recommended_vehicle"           text,
  ADD COLUMN IF NOT EXISTS "ai_confidence_score"              decimal(3,2),
  ADD COLUMN IF NOT EXISTS "detected_items"                   text,
  ADD COLUMN IF NOT EXISTS "notified_at"                      timestamp,
  ADD COLUMN IF NOT EXISTS "accepted_at"                      timestamp,
  ADD COLUMN IF NOT EXISTS "platform_fee_percent"             decimal(5,2)  NOT NULL DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS "platform_fee_amount"              decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "mover_net_amount"                 decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "current_latitude"                 double precision,
  ADD COLUMN IF NOT EXISTS "current_longitude"                double precision,
  ADD COLUMN IF NOT EXISTS "location_updated_at"              timestamp,
  ADD COLUMN IF NOT EXISTS "flagged_for_review"               boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "flagged_reason"                   text,
  ADD COLUMN IF NOT EXISTS "enterprise_partner_id"            varchar,
  ADD COLUMN IF NOT EXISTS "enterprise_status"                text,
  ADD COLUMN IF NOT EXISTS "routed_to_partner_at"             timestamp,
  ADD COLUMN IF NOT EXISTS "enterprise_accepted_at"           timestamp,
  ADD COLUMN IF NOT EXISTS "enterprise_rejected_at"           timestamp,
  ADD COLUMN IF NOT EXISTS "enterprise_rejection_reason"      text,
  ADD COLUMN IF NOT EXISTS "updated_at"                       timestamp   NOT NULL DEFAULT now();

-- ─── messages ────────────────────────────────────────────────────────────────
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "read_at" timestamp;

-- ─── reviews ─────────────────────────────────────────────────────────────────
ALTER TABLE "reviews"
  ADD COLUMN IF NOT EXISTS "mover_id"  varchar,
  ADD COLUMN IF NOT EXISTS "comment"   text;

-- ─── support_tickets ─────────────────────────────────────────────────────────
ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "priority"               text      NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "assigned_to"            varchar,
  ADD COLUMN IF NOT EXISTS "resolved_at"            timestamp,
  ADD COLUMN IF NOT EXISTS "customer_last_read_at"  timestamp,
  ADD COLUMN IF NOT EXISTS "last_staff_reply_at"    timestamp,
  ADD COLUMN IF NOT EXISTS "updated_at"             timestamp NOT NULL DEFAULT now();

-- ─── verification_items ──────────────────────────────────────────────────────
ALTER TABLE "verification_items"
  ADD COLUMN IF NOT EXISTS "data"               text,
  ADD COLUMN IF NOT EXISTS "file_urls"          text[],
  ADD COLUMN IF NOT EXISTS "rejection_reason"   text,
  ADD COLUMN IF NOT EXISTS "expiry_date"        timestamp,
  ADD COLUMN IF NOT EXISTS "submitted_at"       timestamp,
  ADD COLUMN IF NOT EXISTS "reviewed_at"        timestamp,
  ADD COLUMN IF NOT EXISTS "reviewed_by"        varchar,
  ADD COLUMN IF NOT EXISTS "updated_at"         timestamp NOT NULL DEFAULT now();

-- ─── identified_items ────────────────────────────────────────────────────────
ALTER TABLE "identified_items"
  ADD COLUMN IF NOT EXISTS "item_name"           text,
  ADD COLUMN IF NOT EXISTS "category"            text,
  ADD COLUMN IF NOT EXISTS "weight_kg"           decimal(8,2),
  ADD COLUMN IF NOT EXISTS "dimensions_l_cm"     decimal(8,2),
  ADD COLUMN IF NOT EXISTS "dimensions_w_cm"     decimal(8,2),
  ADD COLUMN IF NOT EXISTS "dimensions_h_cm"     decimal(8,2),
  ADD COLUMN IF NOT EXISTS "volume_cuft"         decimal(8,2),
  ADD COLUMN IF NOT EXISTS "handling_complexity" text,
  ADD COLUMN IF NOT EXISTS "vehicle_type"        text,
  ADD COLUMN IF NOT EXISTS "recommended_movers"  integer,
  ADD COLUMN IF NOT EXISTS "insurance_level"     text,
  ADD COLUMN IF NOT EXISTS "confidence"          decimal(3,2),
  ADD COLUMN IF NOT EXISTS "source_metadata"     text,
  ADD COLUMN IF NOT EXISTS "error_message"       text,
  ADD COLUMN IF NOT EXISTS "updated_at"          timestamp NOT NULL DEFAULT now();

-- ─── ai_runs ─────────────────────────────────────────────────────────────────
ALTER TABLE "ai_runs"
  ADD COLUMN IF NOT EXISTS "booking_id"     varchar,
  ADD COLUMN IF NOT EXISTS "input_tokens"   integer,
  ADD COLUMN IF NOT EXISTS "output_tokens"  integer,
  ADD COLUMN IF NOT EXISTS "total_cost"     decimal(10,4),
  ADD COLUMN IF NOT EXISTS "error_message"  text,
  ADD COLUMN IF NOT EXISTS "response_time"  integer;

-- ─── ai_support_insights ─────────────────────────────────────────────────────
ALTER TABLE "ai_support_insights"
  ADD COLUMN IF NOT EXISTS "root_cause"           text,
  ADD COLUMN IF NOT EXISTS "suggested_response"   text,
  ADD COLUMN IF NOT EXISTS "customer_response"    text,
  ADD COLUMN IF NOT EXISTS "internal_notes"       text,
  ADD COLUMN IF NOT EXISTS "similar_cases"        text[],
  ADD COLUMN IF NOT EXISTS "processing_time_ms"   integer,
  ADD COLUMN IF NOT EXISTS "model_used"           text DEFAULT 'gpt-4o',
  ADD COLUMN IF NOT EXISTS "expires_at"           timestamp;

-- ─── mover_stripe_accounts ───────────────────────────────────────────────────
ALTER TABLE "mover_stripe_accounts"
  ADD COLUMN IF NOT EXISTS "account_type"       text    NOT NULL DEFAULT 'express',
  ADD COLUMN IF NOT EXISTS "requirements_due"   text[],
  ADD COLUMN IF NOT EXISTS "currently_due"      text[],
  ADD COLUMN IF NOT EXISTS "default_currency"   text    DEFAULT 'cad',
  ADD COLUMN IF NOT EXISTS "country"            text    DEFAULT 'CA',
  ADD COLUMN IF NOT EXISTS "reminder_count"     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_reminder_at"   timestamp,
  ADD COLUMN IF NOT EXISTS "updated_at"         timestamp NOT NULL DEFAULT now();

-- ─── mover_earnings ──────────────────────────────────────────────────────────
ALTER TABLE "mover_earnings"
  ADD COLUMN IF NOT EXISTS "stripe_transfer_id"   text,
  ADD COLUMN IF NOT EXISTS "available_at"         timestamp,
  ADD COLUMN IF NOT EXISTS "paid_at"              timestamp,
  ADD COLUMN IF NOT EXISTS "payout_id"            varchar;

-- ─── mover_payouts ───────────────────────────────────────────────────────────
ALTER TABLE "mover_payouts"
  ADD COLUMN IF NOT EXISTS "stripe_payout_id" text,
  ADD COLUMN IF NOT EXISTS "failure_code"      text,
  ADD COLUMN IF NOT EXISTS "failure_message"   text,
  ADD COLUMN IF NOT EXISTS "completed_at"      timestamp;

-- ─── booking_metrics ─────────────────────────────────────────────────────────
ALTER TABLE "booking_metrics"
  ADD COLUMN IF NOT EXISTS "estimated_vehicle_class"      text,
  ADD COLUMN IF NOT EXISTS "estimated_volume_cuft"        decimal(8,2),
  ADD COLUMN IF NOT EXISTS "estimated_weight_kg"          decimal(8,2),
  ADD COLUMN IF NOT EXISTS "estimated_duration_minutes"   integer,
  ADD COLUMN IF NOT EXISTS "estimated_price"              decimal(10,2),
  ADD COLUMN IF NOT EXISTS "actual_vehicle_class"         text,
  ADD COLUMN IF NOT EXISTS "actual_volume_cuft"           decimal(8,2),
  ADD COLUMN IF NOT EXISTS "actual_weight_kg"             decimal(8,2),
  ADD COLUMN IF NOT EXISTS "actual_duration_minutes"      integer,
  ADD COLUMN IF NOT EXISTS "actual_price"                 decimal(10,2),
  ADD COLUMN IF NOT EXISTS "volume_accuracy_percent"      decimal(5,2),
  ADD COLUMN IF NOT EXISTS "price_accuracy_percent"       decimal(5,2),
  ADD COLUMN IF NOT EXISTS "vehicle_class_match"          boolean,
  ADD COLUMN IF NOT EXISTS "customer_satisfaction_rating" integer,
  ADD COLUMN IF NOT EXISTS "estimate_accuracy_rating"     integer,
  ADD COLUMN IF NOT EXISTS "customer_notes"               text,
  ADD COLUMN IF NOT EXISTS "mover_difficulty_rating"      integer,
  ADD COLUMN IF NOT EXISTS "mover_notes"                  text,
  ADD COLUMN IF NOT EXISTS "loading_time_minutes"         integer,
  ADD COLUMN IF NOT EXISTS "unloading_time_minutes"       integer,
  ADD COLUMN IF NOT EXISTS "outlier_flag"                 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewed_by_admin"            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "updated_at"                   timestamp NOT NULL DEFAULT now();

-- ─── item_feedback ───────────────────────────────────────────────────────────
ALTER TABLE "item_feedback"
  ADD COLUMN IF NOT EXISTS "original_item_name"     text,
  ADD COLUMN IF NOT EXISTS "original_category"      text,
  ADD COLUMN IF NOT EXISTS "original_weight_kg"     decimal(8,2),
  ADD COLUMN IF NOT EXISTS "original_volume_cuft"   decimal(8,2),
  ADD COLUMN IF NOT EXISTS "original_vehicle_type"  text,
  ADD COLUMN IF NOT EXISTS "corrected_item_name"    text,
  ADD COLUMN IF NOT EXISTS "corrected_category"     text,
  ADD COLUMN IF NOT EXISTS "corrected_weight_kg"    decimal(8,2),
  ADD COLUMN IF NOT EXISTS "corrected_volume_cuft"  decimal(8,2),
  ADD COLUMN IF NOT EXISTS "corrected_vehicle_type" text,
  ADD COLUMN IF NOT EXISTS "feedback_reason"        text,
  ADD COLUMN IF NOT EXISTS "feedback_notes"         text,
  ADD COLUMN IF NOT EXISTS "processed_at"           timestamp;

-- ─── mover_performance ───────────────────────────────────────────────────────
ALTER TABLE "mover_performance"
  ADD COLUMN IF NOT EXISTS "accepted_at"             timestamp,
  ADD COLUMN IF NOT EXISTS "arrived_at_pickup_at"    timestamp,
  ADD COLUMN IF NOT EXISTS "loading_started_at"      timestamp,
  ADD COLUMN IF NOT EXISTS "loading_completed_at"    timestamp,
  ADD COLUMN IF NOT EXISTS "arrived_at_dropoff_at"   timestamp,
  ADD COLUMN IF NOT EXISTS "unloading_completed_at"  timestamp,
  ADD COLUMN IF NOT EXISTS "arrival_delay_minutes"   integer,
  ADD COLUMN IF NOT EXISTS "total_move_minutes"      integer,
  ADD COLUMN IF NOT EXISTS "communication_score"     integer,
  ADD COLUMN IF NOT EXISTS "professionalism_score"   integer,
  ADD COLUMN IF NOT EXISTS "care_with_items_score"   integer,
  ADD COLUMN IF NOT EXISTS "load_class"              text,
  ADD COLUMN IF NOT EXISTS "distance_km"             decimal(8,2),
  ADD COLUMN IF NOT EXISTS "issue_description"       text,
  ADD COLUMN IF NOT EXISTS "rejection_reason"        text,
  ADD COLUMN IF NOT EXISTS "was_good_match"          boolean,
  ADD COLUMN IF NOT EXISTS "match_score"             decimal(5,2);

-- ─── email_campaigns ─────────────────────────────────────────────────────────
ALTER TABLE "email_campaigns"
  ADD COLUMN IF NOT EXISTS "recipient_ids"    text[],
  ADD COLUMN IF NOT EXISTS "recipient_count"  integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sent_at"          timestamp;

-- ─── abandoned_bookings ──────────────────────────────────────────────────────
ALTER TABLE "abandoned_bookings"
  ADD COLUMN IF NOT EXISTS "user_id"                varchar,
  ADD COLUMN IF NOT EXISTS "email"                  text,
  ADD COLUMN IF NOT EXISTS "phone"                  text,
  ADD COLUMN IF NOT EXISTS "pickup_address"         text,
  ADD COLUMN IF NOT EXISTS "dropoff_address"        text,
  ADD COLUMN IF NOT EXISTS "load_size"              text,
  ADD COLUMN IF NOT EXISTS "preferred_date"         text,
  ADD COLUMN IF NOT EXISTS "selected_mover_id"      varchar,
  ADD COLUMN IF NOT EXISTS "reminder_sent_at"       timestamp,
  ADD COLUMN IF NOT EXISTS "reminder_count"         integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "recovered_booking_id"   varchar,
  ADD COLUMN IF NOT EXISTS "updated_at"             timestamp NOT NULL DEFAULT now();

-- ─── in_app_notifications ────────────────────────────────────────────────────
ALTER TABLE "in_app_notifications"
  ADD COLUMN IF NOT EXISTS "booking_id"         varchar,
  ADD COLUMN IF NOT EXISTS "support_ticket_id"  varchar,
  ADD COLUMN IF NOT EXISTS "action_url"         text,
  ADD COLUMN IF NOT EXISTS "read_at"            timestamp,
  ADD COLUMN IF NOT EXISTS "metadata"           text;

-- ─── partners ────────────────────────────────────────────────────────────────
ALTER TABLE "partners"
  ADD COLUMN IF NOT EXISTS "operating_name"          text,
  ADD COLUMN IF NOT EXISTS "billing_email"            text,
  ADD COLUMN IF NOT EXISTS "primary_ops_contact"      text,
  ADD COLUMN IF NOT EXISTS "primary_ops_email"        text,
  ADD COLUMN IF NOT EXISTS "primary_ops_phone"        text,
  ADD COLUMN IF NOT EXISTS "dispatch_contact"         text,
  ADD COLUMN IF NOT EXISTS "escalation_contact"       text,
  ADD COLUMN IF NOT EXISTS "address"                  text,
  ADD COLUMN IF NOT EXISTS "phone"                    text,
  ADD COLUMN IF NOT EXISTS "service_description"      text,
  ADD COLUMN IF NOT EXISTS "dispatch_method"          text    DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "dispatch_phone"           text,
  ADD COLUMN IF NOT EXISTS "dispatch_email"           text,
  ADD COLUMN IF NOT EXISTS "dispatch_notes"           text,
  ADD COLUMN IF NOT EXISTS "coverage_complete"        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "compliance_complete"      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dispatch_complete"        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "terms_accepted_at"        timestamp,
  ADD COLUMN IF NOT EXISTS "test_booking_complete"    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "activated_at"             timestamp,
  ADD COLUMN IF NOT EXISTS "activated_by"             varchar,
  ADD COLUMN IF NOT EXISTS "suspended_at"             timestamp,
  ADD COLUMN IF NOT EXISTS "suspended_reason"         text,
  ADD COLUMN IF NOT EXISTS "stripe_account_id"        text,
  ADD COLUMN IF NOT EXISTS "stripe_connect_status"    text    DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS "stripe_payouts_enabled"   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stripe_details_submitted" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "logo_url"                 text,
  ADD COLUMN IF NOT EXISTS "admin_notes"              text,
  ADD COLUMN IF NOT EXISTS "updated_at"               timestamp NOT NULL DEFAULT now();

-- ─── partner_invites ─────────────────────────────────────────────────────────
ALTER TABLE "partner_invites"
  ADD COLUMN IF NOT EXISTS "name"       text,
  ADD COLUMN IF NOT EXISTS "used_at"    timestamp,
  ADD COLUMN IF NOT EXISTS "invited_by" varchar;

-- ─── coverage_zones ──────────────────────────────────────────────────────────
ALTER TABLE "coverage_zones"
  ADD COLUMN IF NOT EXISTS "province"                   text,
  ADD COLUMN IF NOT EXISTS "postal_code_prefixes"       text[],
  ADD COLUMN IF NOT EXISTS "service_radius_km"          integer,
  ADD COLUMN IF NOT EXISTS "operating_hours_start"      text  DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS "operating_hours_end"        text  DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS "operating_days"             text[],
  ADD COLUMN IF NOT EXISTS "same_day_available"         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "supported_vehicle_classes"  text[],
  ADD COLUMN IF NOT EXISTS "supported_load_sizes"       text[],
  ADD COLUMN IF NOT EXISTS "excluded_categories"        text[],
  ADD COLUMN IF NOT EXISTS "updated_at"                 timestamp NOT NULL DEFAULT now();

-- ─── compliance_docs ─────────────────────────────────────────────────────────
ALTER TABLE "compliance_docs"
  ADD COLUMN IF NOT EXISTS "file_url"     text,
  ADD COLUMN IF NOT EXISTS "file_name"    text,
  ADD COLUMN IF NOT EXISTS "file_size"    integer,
  ADD COLUMN IF NOT EXISTS "expiry_date"  timestamp,
  ADD COLUMN IF NOT EXISTS "review_notes" text,
  ADD COLUMN IF NOT EXISTS "reviewed_by"  varchar,
  ADD COLUMN IF NOT EXISTS "reviewed_at"  timestamp,
  ADD COLUMN IF NOT EXISTS "uploaded_by"  varchar,
  ADD COLUMN IF NOT EXISTS "updated_at"   timestamp NOT NULL DEFAULT now();

-- ─── partner_team_members ────────────────────────────────────────────────────
ALTER TABLE "partner_team_members"
  ADD COLUMN IF NOT EXISTS "member_type"   text  NOT NULL DEFAULT 'driver',
  ADD COLUMN IF NOT EXISTS "phone"         text,
  ADD COLUMN IF NOT EXISTS "vehicle_type"  text,
  ADD COLUMN IF NOT EXISTS "vehicle_plate" text,
  ADD COLUMN IF NOT EXISTS "vehicle_color" text,
  ADD COLUMN IF NOT EXISTS "driver_photo"  text,
  ADD COLUMN IF NOT EXISTS "vehicle_photo" text,
  ADD COLUMN IF NOT EXISTS "notes"         text;

-- ─── booking_assignments ─────────────────────────────────────────────────────
ALTER TABLE "booking_assignments"
  ADD COLUMN IF NOT EXISTS "team_member_id"    varchar,
  ADD COLUMN IF NOT EXISTS "driver_name"       text,
  ADD COLUMN IF NOT EXISTS "driver_phone"      text,
  ADD COLUMN IF NOT EXISTS "team_name"         text,
  ADD COLUMN IF NOT EXISTS "vehicle_type"      text,
  ADD COLUMN IF NOT EXISTS "vehicle_plate"     text,
  ADD COLUMN IF NOT EXISTS "estimated_arrival" timestamp,
  ADD COLUMN IF NOT EXISTS "assigned_by"       varchar,
  ADD COLUMN IF NOT EXISTS "notes"             text;

-- ─── booking_status_events ───────────────────────────────────────────────────
ALTER TABLE "booking_status_events"
  ADD COLUMN IF NOT EXISTS "partner_id"       varchar,
  ADD COLUMN IF NOT EXISTS "from_status"      text,
  ADD COLUMN IF NOT EXISTS "changed_by"       varchar,
  ADD COLUMN IF NOT EXISTS "notes"            text,
  ADD COLUMN IF NOT EXISTS "customer_visible" boolean NOT NULL DEFAULT false;

-- ─── partner_incidents ───────────────────────────────────────────────────────
ALTER TABLE "partner_incidents"
  ADD COLUMN IF NOT EXISTS "file_urls"         text[],
  ADD COLUMN IF NOT EXISTS "escalation_flag"   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reported_by"       varchar,
  ADD COLUMN IF NOT EXISTS "resolved_by"       varchar,
  ADD COLUMN IF NOT EXISTS "resolved_at"       timestamp,
  ADD COLUMN IF NOT EXISTS "resolution_notes"  text,
  ADD COLUMN IF NOT EXISTS "updated_at"        timestamp NOT NULL DEFAULT now();

-- ─── proof_of_completion ─────────────────────────────────────────────────────
ALTER TABLE "proof_of_completion"
  ADD COLUMN IF NOT EXISTS "file_name"   text,
  ADD COLUMN IF NOT EXISTS "file_type"   text,
  ADD COLUMN IF NOT EXISTS "proof_type"  text  NOT NULL DEFAULT 'photo',
  ADD COLUMN IF NOT EXISTS "notes"       text,
  ADD COLUMN IF NOT EXISTS "uploaded_by" varchar;

-- ─── partner_audit_log ───────────────────────────────────────────────────────
ALTER TABLE "partner_audit_log"
  ADD COLUMN IF NOT EXISTS "actor_id"    varchar,
  ADD COLUMN IF NOT EXISTS "object_type" text,
  ADD COLUMN IF NOT EXISTS "object_id"   text,
  ADD COLUMN IF NOT EXISTS "notes"       text,
  ADD COLUMN IF NOT EXISTS "ip_address"  text;

-- ─── partner_direct_messages ─────────────────────────────────────────────────
ALTER TABLE "partner_direct_messages"
  ADD COLUMN IF NOT EXISTS "read_at" timestamp;

-- ─── saved_addresses ─────────────────────────────────────────────────────────
ALTER TABLE "saved_addresses"
  ADD COLUMN IF NOT EXISTS "latitude"  double precision,
  ADD COLUMN IF NOT EXISTS "longitude" double precision;

-- ─── mover_availability ──────────────────────────────────────────────────────
ALTER TABLE "mover_availability"
  ADD COLUMN IF NOT EXISTS "start_time" time,
  ADD COLUMN IF NOT EXISTS "end_time"   time;

-- ─── ai_incident_insights ────────────────────────────────────────────────────
ALTER TABLE "ai_incident_insights"
  ADD COLUMN IF NOT EXISTS "root_cause"               text,
  ADD COLUMN IF NOT EXISTS "partner_communication"    text,
  ADD COLUMN IF NOT EXISTS "internal_notes"           text,
  ADD COLUMN IF NOT EXISTS "escalation_advice"        text,
  ADD COLUMN IF NOT EXISTS "processing_time_ms"       integer,
  ADD COLUMN IF NOT EXISTS "model_used"               text DEFAULT 'gpt-4o',
  ADD COLUMN IF NOT EXISTS "expires_at"               timestamp;


-- =============================================================================
-- PHASE 3: INDEXES
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "users_firebase_uid_unique"
  ON "users" ("firebase_uid") WHERE "firebase_uid" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_unique"
  ON "users" ("referral_code") WHERE "referral_code" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "phone_verification_tokens_phone_idx"
  ON "phone_verification_tokens" ("phone");

CREATE INDEX IF NOT EXISTS "phone_verification_tokens_token_idx"
  ON "phone_verification_tokens" ("verified_token");

CREATE INDEX IF NOT EXISTS "movers_user_id_idx"
  ON "movers" ("user_id");

CREATE INDEX IF NOT EXISTS "movers_availability_idx"
  ON "movers" ("is_available");

CREATE INDEX IF NOT EXISTS "movers_pilot_status_idx"
  ON "movers" ("pilot_status");

CREATE INDEX IF NOT EXISTS "mover_terms_acceptance_mover_id_idx"
  ON "mover_terms_acceptance" ("mover_id");

CREATE INDEX IF NOT EXISTS "mover_terms_acceptance_version_idx"
  ON "mover_terms_acceptance" ("terms_version");

CREATE INDEX IF NOT EXISTS "bookings_customer_id_idx"
  ON "bookings" ("customer_id");

CREATE INDEX IF NOT EXISTS "bookings_mover_id_idx"
  ON "bookings" ("mover_id");

CREATE INDEX IF NOT EXISTS "bookings_status_idx"
  ON "bookings" ("status");

CREATE INDEX IF NOT EXISTS "bookings_payment_status_idx"
  ON "bookings" ("payment_status");

CREATE INDEX IF NOT EXISTS "messages_booking_id_idx"
  ON "messages" ("booking_id");

CREATE INDEX IF NOT EXISTS "reviews_mover_id_idx"
  ON "reviews" ("mover_id");

CREATE INDEX IF NOT EXISTS "reviews_booking_id_idx"
  ON "reviews" ("booking_id");

CREATE INDEX IF NOT EXISTS "mover_status_idx"
  ON "job_notifications" ("mover_id", "status");

CREATE INDEX IF NOT EXISTS "support_tickets_user_id_idx"
  ON "support_tickets" ("user_id");

CREATE INDEX IF NOT EXISTS "support_tickets_status_idx"
  ON "support_tickets" ("status");

CREATE INDEX IF NOT EXISTS "support_ticket_replies_ticket_id_idx"
  ON "support_ticket_replies" ("ticket_id");

CREATE INDEX IF NOT EXISTS "verification_items_mover_id_idx"
  ON "verification_items" ("mover_id");

CREATE INDEX IF NOT EXISTS "verification_items_status_idx"
  ON "verification_items" ("status");

CREATE INDEX IF NOT EXISTS "verification_items_type_idx"
  ON "verification_items" ("type");

CREATE INDEX IF NOT EXISTS "identified_items_booking_id_idx"
  ON "identified_items" ("booking_id");

CREATE INDEX IF NOT EXISTS "identified_items_status_idx"
  ON "identified_items" ("processing_status");

CREATE INDEX IF NOT EXISTS "ai_runs_booking_id_idx"
  ON "ai_runs" ("booking_id");

CREATE INDEX IF NOT EXISTS "ai_runs_provider_idx"
  ON "ai_runs" ("provider");

CREATE INDEX IF NOT EXISTS "ai_runs_created_at_idx"
  ON "ai_runs" ("created_at");

CREATE INDEX IF NOT EXISTS "ai_support_insights_ticket_id_idx"
  ON "ai_support_insights" ("ticket_id");

CREATE INDEX IF NOT EXISTS "mover_stripe_accounts_mover_id_idx"
  ON "mover_stripe_accounts" ("mover_id");

CREATE INDEX IF NOT EXISTS "mover_stripe_accounts_stripe_account_idx"
  ON "mover_stripe_accounts" ("stripe_account_id");

CREATE INDEX IF NOT EXISTS "mover_earnings_mover_id_idx"
  ON "mover_earnings" ("mover_id");

CREATE INDEX IF NOT EXISTS "mover_earnings_booking_id_idx"
  ON "mover_earnings" ("booking_id");

CREATE INDEX IF NOT EXISTS "mover_earnings_status_idx"
  ON "mover_earnings" ("status");

CREATE INDEX IF NOT EXISTS "mover_payouts_mover_id_idx"
  ON "mover_payouts" ("mover_id");

CREATE INDEX IF NOT EXISTS "mover_payouts_status_idx"
  ON "mover_payouts" ("status");

CREATE INDEX IF NOT EXISTS "mover_payouts_stripe_payout_idx"
  ON "mover_payouts" ("stripe_payout_id");

CREATE INDEX IF NOT EXISTS "booking_metrics_booking_id_idx"
  ON "booking_metrics" ("booking_id");

CREATE INDEX IF NOT EXISTS "booking_metrics_training_idx"
  ON "booking_metrics" ("used_for_training");

CREATE INDEX IF NOT EXISTS "item_feedback_identified_item_idx"
  ON "item_feedback" ("identified_item_id");

CREATE INDEX IF NOT EXISTS "item_feedback_booking_id_idx"
  ON "item_feedback" ("booking_id");

CREATE INDEX IF NOT EXISTS "item_feedback_processed_idx"
  ON "item_feedback" ("processed_for_learning");

CREATE INDEX IF NOT EXISTS "mover_performance_mover_id_idx"
  ON "mover_performance" ("mover_id");

CREATE INDEX IF NOT EXISTS "mover_performance_booking_id_idx"
  ON "mover_performance" ("booking_id");

CREATE INDEX IF NOT EXISTS "mover_performance_load_class_idx"
  ON "mover_performance" ("load_class");

CREATE INDEX IF NOT EXISTS "learning_insights_type_idx"
  ON "learning_insights" ("insight_type");

CREATE INDEX IF NOT EXISTS "learning_insights_period_idx"
  ON "learning_insights" ("period_start", "period_end");

CREATE INDEX IF NOT EXISTS "email_campaigns_sent_by_idx"
  ON "email_campaigns" ("sent_by");

CREATE INDEX IF NOT EXISTS "email_campaigns_status_idx"
  ON "email_campaigns" ("status");

CREATE INDEX IF NOT EXISTS "email_campaigns_type_idx"
  ON "email_campaigns" ("type");

CREATE INDEX IF NOT EXISTS "abandoned_bookings_user_id_idx"
  ON "abandoned_bookings" ("user_id");

CREATE INDEX IF NOT EXISTS "abandoned_bookings_email_idx"
  ON "abandoned_bookings" ("email");

CREATE INDEX IF NOT EXISTS "abandoned_bookings_recovered_idx"
  ON "abandoned_bookings" ("recovered");

CREATE INDEX IF NOT EXISTS "abandoned_bookings_created_at_idx"
  ON "abandoned_bookings" ("created_at");

CREATE INDEX IF NOT EXISTS "in_app_notifications_user_id_idx"
  ON "in_app_notifications" ("user_id");

CREATE INDEX IF NOT EXISTS "in_app_notifications_user_read_idx"
  ON "in_app_notifications" ("user_id", "is_read");

CREATE INDEX IF NOT EXISTS "in_app_notifications_type_idx"
  ON "in_app_notifications" ("type");

CREATE INDEX IF NOT EXISTS "in_app_notifications_created_at_idx"
  ON "in_app_notifications" ("created_at");

CREATE INDEX IF NOT EXISTS "analytics_events_name_idx"
  ON "analytics_events" ("event_name");

CREATE INDEX IF NOT EXISTS "analytics_events_user_id_idx"
  ON "analytics_events" ("user_id");

CREATE INDEX IF NOT EXISTS "analytics_events_created_at_idx"
  ON "analytics_events" ("created_at");

CREATE INDEX IF NOT EXISTS "partners_status_idx"
  ON "partners" ("status");

CREATE INDEX IF NOT EXISTS "partner_users_partner_id_idx"
  ON "partner_users" ("partner_id");

CREATE INDEX IF NOT EXISTS "partner_users_user_id_idx"
  ON "partner_users" ("user_id");

CREATE INDEX IF NOT EXISTS "partner_invites_token_idx"
  ON "partner_invites" ("token");

CREATE INDEX IF NOT EXISTS "partner_invites_partner_id_idx"
  ON "partner_invites" ("partner_id");

CREATE INDEX IF NOT EXISTS "coverage_zones_partner_id_idx"
  ON "coverage_zones" ("partner_id");

CREATE INDEX IF NOT EXISTS "compliance_docs_partner_id_idx"
  ON "compliance_docs" ("partner_id");

CREATE INDEX IF NOT EXISTS "compliance_docs_review_status_idx"
  ON "compliance_docs" ("review_status");

CREATE INDEX IF NOT EXISTS "partner_team_members_partner_id_idx"
  ON "partner_team_members" ("partner_id");

CREATE INDEX IF NOT EXISTS "booking_assignments_booking_id_idx"
  ON "booking_assignments" ("booking_id");

CREATE INDEX IF NOT EXISTS "booking_assignments_partner_id_idx"
  ON "booking_assignments" ("partner_id");

CREATE INDEX IF NOT EXISTS "booking_status_events_booking_id_idx"
  ON "booking_status_events" ("booking_id");

CREATE INDEX IF NOT EXISTS "booking_status_events_partner_id_idx"
  ON "booking_status_events" ("partner_id");

CREATE INDEX IF NOT EXISTS "partner_incidents_booking_id_idx"
  ON "partner_incidents" ("booking_id");

CREATE INDEX IF NOT EXISTS "partner_incidents_partner_id_idx"
  ON "partner_incidents" ("partner_id");

CREATE INDEX IF NOT EXISTS "partner_incidents_status_idx"
  ON "partner_incidents" ("status");

CREATE INDEX IF NOT EXISTS "proof_of_completion_booking_id_idx"
  ON "proof_of_completion" ("booking_id");

CREATE INDEX IF NOT EXISTS "proof_of_completion_partner_id_idx"
  ON "proof_of_completion" ("partner_id");

CREATE INDEX IF NOT EXISTS "partner_audit_log_partner_id_idx"
  ON "partner_audit_log" ("partner_id");

CREATE INDEX IF NOT EXISTS "partner_audit_log_created_at_idx"
  ON "partner_audit_log" ("created_at");

CREATE INDEX IF NOT EXISTS "saved_addresses_user_id_idx"
  ON "saved_addresses" ("user_id");

CREATE INDEX IF NOT EXISTS "feedback_surveys_booking_id_idx"
  ON "feedback_surveys" ("booking_id");

CREATE INDEX IF NOT EXISTS "feedback_surveys_user_id_idx"
  ON "feedback_surveys" ("user_id");

CREATE INDEX IF NOT EXISTS "mover_availability_user_id_idx"
  ON "mover_availability" ("user_id");

CREATE INDEX IF NOT EXISTS "mover_availability_date_idx"
  ON "mover_availability" ("available_date");

CREATE INDEX IF NOT EXISTS "referrals_referrer_id_idx"
  ON "referrals" ("referrer_id");

CREATE INDEX IF NOT EXISTS "referrals_code_idx"
  ON "referrals" ("code");

CREATE INDEX IF NOT EXISTS "ai_incident_insights_incident_id_idx"
  ON "ai_incident_insights" ("incident_id");
