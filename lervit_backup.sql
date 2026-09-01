--
-- PostgreSQL database dump
--

\restrict XwbTsvXcW9TQ1ihvIAZMGoZJ3MCh2jchK8GAdlsTHXt2HehSDRJcJFHL6WHXBYm

-- Dumped from database version 16.15 (ef25dd3)
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: _system; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA _system;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: replit_database_migrations_v1; Type: TABLE; Schema: _system; Owner: -
--

CREATE TABLE _system.replit_database_migrations_v1 (
    id bigint NOT NULL,
    build_id text NOT NULL,
    deployment_id text NOT NULL,
    statement_count bigint NOT NULL,
    applied_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: replit_database_migrations_v1_id_seq; Type: SEQUENCE; Schema: _system; Owner: -
--

CREATE SEQUENCE _system.replit_database_migrations_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: replit_database_migrations_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: _system; Owner: -
--

ALTER SEQUENCE _system.replit_database_migrations_v1_id_seq OWNED BY _system.replit_database_migrations_v1.id;


--
-- Name: abandoned_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abandoned_bookings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    email text,
    phone text,
    pickup_address text,
    dropoff_address text,
    load_size text,
    preferred_date text,
    selected_mover_id character varying,
    last_step integer DEFAULT 1 NOT NULL,
    reminder_sent_at timestamp without time zone,
    reminder_count integer DEFAULT 0 NOT NULL,
    recovered boolean DEFAULT false NOT NULL,
    recovered_booking_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_incident_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_incident_insights (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    incident_id character varying NOT NULL,
    summary text NOT NULL,
    severity_assessment text NOT NULL,
    root_cause text,
    recommendations text[] NOT NULL,
    partner_communication text,
    internal_notes text,
    escalation_advice text,
    confidence integer DEFAULT 80 NOT NULL,
    processing_time_ms integer,
    model_used text DEFAULT 'gpt-4o'::text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone
);


--
-- Name: ai_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_runs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying,
    provider text NOT NULL,
    operation text NOT NULL,
    input_tokens integer,
    output_tokens integer,
    total_cost numeric(10,4),
    status text DEFAULT 'success'::text NOT NULL,
    error_message text,
    response_time integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_support_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_support_insights (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    ticket_id character varying NOT NULL,
    summary text NOT NULL,
    category text NOT NULL,
    suggested_priority text NOT NULL,
    root_cause text,
    recommendations text[] NOT NULL,
    suggested_response text,
    similar_cases text[],
    confidence integer DEFAULT 80 NOT NULL,
    processing_time_ms integer,
    model_used text DEFAULT 'gpt-4o'::text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone,
    customer_response text,
    internal_notes text
);


--
-- Name: booking_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_assignments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    partner_id character varying NOT NULL,
    team_member_id character varying,
    driver_name text,
    driver_phone text,
    team_name text,
    vehicle_type text,
    vehicle_plate text,
    estimated_arrival timestamp without time zone,
    assigned_by character varying,
    assigned_at timestamp without time zone DEFAULT now() NOT NULL,
    notes text
);


--
-- Name: booking_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_metrics (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    estimated_vehicle_class text,
    estimated_volume_cuft numeric(8,2),
    estimated_weight_kg numeric(8,2),
    estimated_duration_minutes integer,
    estimated_price numeric(10,2),
    actual_vehicle_class text,
    actual_volume_cuft numeric(8,2),
    actual_weight_kg numeric(8,2),
    actual_duration_minutes integer,
    actual_price numeric(10,2),
    volume_accuracy_percent numeric(5,2),
    price_accuracy_percent numeric(5,2),
    vehicle_class_match boolean,
    customer_satisfaction_rating integer,
    estimate_accuracy_rating integer,
    customer_notes text,
    mover_difficulty_rating integer,
    mover_notes text,
    loading_time_minutes integer,
    unloading_time_minutes integer,
    used_for_training boolean DEFAULT false NOT NULL,
    outlier_flag boolean DEFAULT false NOT NULL,
    reviewed_by_admin boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_status_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_status_events (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    partner_id character varying,
    from_status text,
    to_status text NOT NULL,
    changed_by character varying,
    notes text,
    customer_visible boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    customer_id character varying NOT NULL,
    mover_id character varying,
    pickup_address text NOT NULL,
    dropoff_address text NOT NULL,
    load_size text NOT NULL,
    description text,
    preferred_date timestamp without time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    distance numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    price numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    payment_status text DEFAULT 'pending'::text,
    stripe_payment_intent_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    images text[],
    pickup_latitude double precision DEFAULT 0 NOT NULL,
    pickup_longitude double precision DEFAULT 0 NOT NULL,
    dropoff_latitude double precision DEFAULT 0 NOT NULL,
    dropoff_longitude double precision DEFAULT 0 NOT NULL,
    base_fee numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    distance_fee numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    load_fee numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    mover_travel_fee numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    notified_at timestamp without time zone,
    accepted_at timestamp without time zone,
    pickup_difficulty text DEFAULT 'ground'::text NOT NULL,
    dropoff_difficulty text DEFAULT 'ground'::text NOT NULL,
    heavy_item boolean DEFAULT false NOT NULL,
    number_of_movers integer DEFAULT 1 NOT NULL,
    pickup_difficulty_fee numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    dropoff_difficulty_fee numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    heavy_item_fee numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    subtotal numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    ai_estimate text,
    ai_explanation text,
    ai_photo_analysis text,
    current_latitude double precision,
    current_longitude double precision,
    location_updated_at timestamp without time zone,
    ai_weight_class text,
    ai_recommended_vehicle text,
    ai_confidence_score numeric(3,2),
    detected_items text,
    acknowledged_single_mover_policy boolean DEFAULT false NOT NULL,
    platform_fee_percent numeric(5,2) DEFAULT 15.00 NOT NULL,
    platform_fee_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    mover_net_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    flagged_for_review boolean DEFAULT false NOT NULL,
    flagged_reason text,
    discount_percent numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    discount_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    discount_reason text,
    pre_selected_mover_id character varying,
    promo_code text,
    mover_balance_owed numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    mover_balance_paid boolean DEFAULT false NOT NULL
);


--
-- Name: compliance_docs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_docs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    partner_id character varying NOT NULL,
    doc_type text NOT NULL,
    file_url text,
    file_name text,
    file_size integer,
    expiry_date timestamp without time zone,
    review_status text DEFAULT 'pending'::text NOT NULL,
    review_notes text,
    reviewed_by character varying,
    reviewed_at timestamp without time zone,
    uploaded_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: coverage_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coverage_zones (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    partner_id character varying NOT NULL,
    zone_name text NOT NULL,
    city text NOT NULL,
    province text,
    postal_code_prefixes text[],
    service_radius_km integer,
    operating_hours_start text DEFAULT '08:00'::text,
    operating_hours_end text DEFAULT '18:00'::text,
    operating_days text[],
    same_day_available boolean DEFAULT false NOT NULL,
    supported_vehicle_classes text[],
    supported_load_sizes text[],
    excluded_categories text[],
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaigns (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    subject text NOT NULL,
    content text NOT NULL,
    type text NOT NULL,
    audience_type text NOT NULL,
    recipient_ids text[],
    recipient_count integer DEFAULT 0 NOT NULL,
    sent_by character varying NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: identified_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identified_items (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    photo_url text NOT NULL,
    item_name text,
    category text,
    weight_kg numeric(8,2),
    dimensions_l_cm numeric(8,2),
    dimensions_w_cm numeric(8,2),
    dimensions_h_cm numeric(8,2),
    volume_cuft numeric(8,2),
    handling_complexity text,
    vehicle_type text,
    recommended_movers integer,
    insurance_level text,
    confidence numeric(3,2),
    source_metadata text,
    processing_status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: in_app_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.in_app_notifications (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    booking_id character varying,
    support_ticket_id character varying,
    action_url text,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp without time zone,
    metadata text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: item_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_feedback (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    identified_item_id character varying NOT NULL,
    booking_id character varying NOT NULL,
    submitted_by character varying NOT NULL,
    submitter_role text NOT NULL,
    original_item_name text,
    original_category text,
    original_weight_kg numeric(8,2),
    original_volume_cuft numeric(8,2),
    original_vehicle_type text,
    corrected_item_name text,
    corrected_category text,
    corrected_weight_kg numeric(8,2),
    corrected_volume_cuft numeric(8,2),
    corrected_vehicle_type text,
    feedback_reason text,
    feedback_notes text,
    processed_for_learning boolean DEFAULT false NOT NULL,
    processed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: job_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_notifications (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    mover_id character varying NOT NULL,
    distance_to_pickup numeric(8,2) NOT NULL,
    estimated_earnings numeric(10,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notified_at timestamp without time zone DEFAULT now() NOT NULL,
    responded_at timestamp without time zone,
    expires_at timestamp without time zone NOT NULL
);


--
-- Name: learning_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_insights (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    insight_type text NOT NULL,
    period_start timestamp without time zone NOT NULL,
    period_end timestamp without time zone NOT NULL,
    sample_size integer NOT NULL,
    accuracy_percent numeric(5,2),
    avg_error_percent numeric(5,2),
    category_breakdown text,
    vehicle_class_breakdown text,
    recommendations text[],
    adjustment_factors text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    sender_id character varying NOT NULL,
    text text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    read_at timestamp without time zone
);


--
-- Name: mover_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mover_availability (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    available_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mover_earnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mover_earnings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mover_id character varying NOT NULL,
    booking_id character varying NOT NULL,
    gross_amount numeric(10,2) NOT NULL,
    platform_fee_percent numeric(5,2) DEFAULT 15.00 NOT NULL,
    platform_fee_amount numeric(10,2) NOT NULL,
    net_amount numeric(10,2) NOT NULL,
    stripe_transfer_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    available_at timestamp without time zone,
    paid_at timestamp without time zone,
    payout_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mover_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mover_payouts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mover_id character varying NOT NULL,
    stripe_payout_id text,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'cad'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payout_type text DEFAULT 'standard'::text NOT NULL,
    arrival_date timestamp without time zone,
    failure_code text,
    failure_message text,
    initiated_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mover_performance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mover_performance (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mover_id character varying NOT NULL,
    booking_id character varying NOT NULL,
    accepted_at timestamp without time zone,
    arrived_at_pickup_at timestamp without time zone,
    loading_started_at timestamp without time zone,
    loading_completed_at timestamp without time zone,
    arrived_at_dropoff_at timestamp without time zone,
    unloading_completed_at timestamp without time zone,
    arrival_delay_minutes integer,
    total_move_minutes integer,
    communication_score integer,
    professionalism_score integer,
    care_with_items_score integer,
    load_class text,
    distance_km numeric(8,2),
    had_issues boolean DEFAULT false NOT NULL,
    issue_description text,
    was_rejected boolean DEFAULT false NOT NULL,
    rejection_reason text,
    was_good_match boolean,
    match_score numeric(5,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mover_stripe_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mover_stripe_accounts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mover_id character varying NOT NULL,
    stripe_account_id text NOT NULL,
    account_type text DEFAULT 'express'::text NOT NULL,
    onboarding_status text DEFAULT 'pending'::text NOT NULL,
    charges_enabled boolean DEFAULT false NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    details_submitted boolean DEFAULT false NOT NULL,
    requirements_due text[],
    currently_due text[],
    default_currency text DEFAULT 'cad'::text,
    country text DEFAULT 'CA'::text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    reminder_count integer DEFAULT 0 NOT NULL,
    last_reminder_at timestamp without time zone
);


--
-- Name: mover_terms_acceptance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mover_terms_acceptance (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mover_id character varying NOT NULL,
    terms_version text NOT NULL,
    accepted_at timestamp without time zone DEFAULT now() NOT NULL,
    accepted_from_ip text,
    user_agent text
);


--
-- Name: movers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    vehicle_type text NOT NULL,
    vehicle_capacity text,
    license_number text,
    is_verified boolean DEFAULT false NOT NULL,
    rating numeric(3,2) DEFAULT '0'::numeric,
    total_moves integer DEFAULT 0 NOT NULL,
    bio text,
    location text,
    is_available boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    latitude double precision,
    longitude double precision,
    vehicle_photo text,
    vehicle_color text,
    license_plate text,
    mover_image text,
    profile_verified boolean DEFAULT false NOT NULL,
    documents_verified boolean DEFAULT false NOT NULL,
    completed_trips integer DEFAULT 0 NOT NULL,
    pilot_status text DEFAULT 'none'::text,
    pilot_approved_by character varying,
    pilot_approved_at timestamp without time zone,
    pilot_notes text,
    pilot_expires_at timestamp without time zone,
    last_location_update timestamp without time zone,
    onboarding_completed boolean DEFAULT false NOT NULL,
    profile_reminder_count integer DEFAULT 0 NOT NULL,
    last_profile_reminder_at timestamp without time zone
);


--
-- Name: partner_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    partner_id character varying NOT NULL,
    actor_id character varying,
    action text NOT NULL,
    object_type text,
    object_id text,
    notes text,
    ip_address text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: partner_direct_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_direct_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    partner_id character varying NOT NULL,
    sender_id character varying NOT NULL,
    sender_role text NOT NULL,
    text text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    read_at timestamp without time zone
);


--
-- Name: partner_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_incidents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    partner_id character varying NOT NULL,
    category text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    title text NOT NULL,
    notes text NOT NULL,
    file_urls text[],
    escalation_flag boolean DEFAULT false NOT NULL,
    reported_by character varying,
    resolved_by character varying,
    resolved_at timestamp without time zone,
    resolution_notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: partner_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_invites (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    partner_id character varying NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'partner_admin'::text NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    invited_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    name text
);


--
-- Name: partner_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_team_members (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    partner_id character varying NOT NULL,
    name text NOT NULL,
    member_type text DEFAULT 'driver'::text NOT NULL,
    phone text,
    vehicle_type text,
    vehicle_plate text,
    vehicle_color text,
    is_available boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    driver_photo text,
    vehicle_photo text
);


--
-- Name: partner_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    partner_id character varying NOT NULL,
    partner_role text DEFAULT 'partner_viewer'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partners (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    legal_name text NOT NULL,
    operating_name text,
    status text DEFAULT 'invited'::text NOT NULL,
    onboarding_step integer DEFAULT 1 NOT NULL,
    billing_email text,
    primary_ops_contact text,
    dispatch_contact text,
    escalation_contact text,
    address text,
    phone text,
    service_description text,
    dispatch_method text DEFAULT 'manual'::text,
    dispatch_phone text,
    dispatch_email text,
    dispatch_notes text,
    profile_complete boolean DEFAULT false NOT NULL,
    coverage_complete boolean DEFAULT false NOT NULL,
    compliance_complete boolean DEFAULT false NOT NULL,
    dispatch_complete boolean DEFAULT false NOT NULL,
    terms_accepted boolean DEFAULT false NOT NULL,
    terms_accepted_at timestamp without time zone,
    test_booking_complete boolean DEFAULT false NOT NULL,
    activated_at timestamp without time zone,
    activated_by character varying,
    suspended_at timestamp without time zone,
    suspended_reason text,
    admin_notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    stripe_account_id text,
    stripe_connect_status text DEFAULT 'not_connected'::text,
    stripe_payouts_enabled boolean DEFAULT false,
    stripe_details_submitted boolean DEFAULT false,
    primary_ops_email text,
    primary_ops_phone text,
    logo_url text,
    contact_email text
);


--
-- Name: phone_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_verification_tokens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    verification_code text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    verified_token text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: proof_of_completion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proof_of_completion (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    partner_id character varying NOT NULL,
    file_url text NOT NULL,
    file_name text,
    file_type text,
    proof_type text DEFAULT 'photo'::text NOT NULL,
    notes text,
    uploaded_by character varying,
    uploaded_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    referrer_id character varying NOT NULL,
    referred_id character varying NOT NULL,
    code character varying(6) NOT NULL,
    credit_awarded boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    mover_id character varying NOT NULL,
    customer_id character varying NOT NULL,
    rating integer NOT NULL,
    comment text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_addresses (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    label text NOT NULL,
    address text NOT NULL,
    latitude double precision,
    longitude double precision,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: support_ticket_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_replies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    ticket_id character varying NOT NULL,
    user_id character varying NOT NULL,
    message text NOT NULL,
    is_staff boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    subject text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    assigned_to character varying,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    customer_last_read_at timestamp without time zone,
    last_staff_reply_at timestamp without time zone
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    firebase_uid text,
    email text NOT NULL,
    name text NOT NULL,
    phone text,
    role text DEFAULT 'customer'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    password text,
    reset_token text,
    reset_token_expiry timestamp without time zone,
    address text,
    avatar_url text,
    stripe_customer_id text,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp without time zone,
    locked_by_admin boolean DEFAULT false NOT NULL,
    lock_reason text,
    has_completed_onboarding boolean DEFAULT false NOT NULL,
    has_used_first_move_discount boolean DEFAULT false NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    verification_token text,
    verification_token_expiry timestamp without time zone,
    phone_verified boolean DEFAULT false NOT NULL,
    phone_verification_code text,
    phone_verification_expiry timestamp without time zone,
    sms_job_alerts boolean DEFAULT true NOT NULL,
    sms_booking_updates boolean DEFAULT false NOT NULL,
    email_job_alerts boolean DEFAULT true NOT NULL,
    email_booking_updates boolean DEFAULT true NOT NULL,
    email_earnings_reports boolean DEFAULT true NOT NULL,
    push_notifications boolean DEFAULT true NOT NULL,
    email_promotions boolean DEFAULT false NOT NULL,
    last_login_at timestamp without time zone,
    last_logout_at timestamp without time zone,
    promo_uses_count integer DEFAULT 0 NOT NULL,
    referral_code character varying(6),
    referral_credits integer DEFAULT 0 NOT NULL,
    referral_count integer DEFAULT 0 NOT NULL
);


--
-- Name: verification_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_items (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mover_id character varying NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    data text,
    file_urls text[],
    rejection_reason text,
    expiry_date timestamp without time zone,
    submitted_at timestamp without time zone,
    reviewed_at timestamp without time zone,
    reviewed_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: replit_database_migrations_v1 id; Type: DEFAULT; Schema: _system; Owner: -
--

ALTER TABLE ONLY _system.replit_database_migrations_v1 ALTER COLUMN id SET DEFAULT nextval('_system.replit_database_migrations_v1_id_seq'::regclass);


--
-- Data for Name: replit_database_migrations_v1; Type: TABLE DATA; Schema: _system; Owner: -
--

COPY _system.replit_database_migrations_v1 (id, build_id, deployment_id, statement_count, applied_at) FROM stdin;
1	240043bf-cbbd-4410-b5d3-7f349f1660fa	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-11-21 21:43:52.321223+00
2	e88ed517-ddb1-4981-99a2-4656cf6a8966	e70f3ded-34a4-48d5-bb68-c94eb5256edc	10	2025-11-24 01:18:20.650839+00
3	d7c86766-c493-423e-8f61-3beaf6061104	e70f3ded-34a4-48d5-bb68-c94eb5256edc	6	2025-11-24 03:45:05.223455+00
4	4e91fbc9-831e-4af0-a33e-c5bf88c14413	e70f3ded-34a4-48d5-bb68-c94eb5256edc	1	2025-11-24 19:28:14.409533+00
5	af3fae77-6f86-43c5-a38f-4ab456af99e9	e70f3ded-34a4-48d5-bb68-c94eb5256edc	1	2025-11-25 00:44:37.267541+00
6	0d21cfec-180d-4da7-afb0-7110950a6296	e70f3ded-34a4-48d5-bb68-c94eb5256edc	10	2025-11-25 04:15:38.606499+00
7	e007f572-e819-425d-9e6d-3830a1642a23	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-11-26 01:01:46.018526+00
8	a5ebcd5b-4d81-4e9c-8de2-3b95dc456c01	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-06 22:59:10.852205+00
9	2059c8de-fc6e-4650-bd28-7e5d19017e1c	e70f3ded-34a4-48d5-bb68-c94eb5256edc	1	2025-12-06 23:31:50.816152+00
10	d8062764-197b-44ff-a32d-72d45a894cf0	e70f3ded-34a4-48d5-bb68-c94eb5256edc	4	2025-12-06 23:45:22.907088+00
11	c3889436-135f-4074-bb64-8b7308b70695	e70f3ded-34a4-48d5-bb68-c94eb5256edc	3	2025-12-07 00:45:24.960734+00
12	b5cd6183-7655-46ac-8281-34a047d65d57	e70f3ded-34a4-48d5-bb68-c94eb5256edc	6	2025-12-07 02:18:18.896401+00
13	28610f01-2283-41fb-9495-d889d9889689	e70f3ded-34a4-48d5-bb68-c94eb5256edc	19	2025-12-07 02:44:28.673157+00
14	312c4f3f-751f-4e5e-860e-dc6bf69f04ac	e70f3ded-34a4-48d5-bb68-c94eb5256edc	22	2025-12-08 17:52:32.685749+00
15	a0e75d18-3728-4243-b788-9697a71c1a38	e70f3ded-34a4-48d5-bb68-c94eb5256edc	1	2025-12-08 18:32:31.289224+00
16	824618f7-29a8-4d65-ae51-05cadec19398	e70f3ded-34a4-48d5-bb68-c94eb5256edc	20	2025-12-09 01:08:34.134536+00
17	d27d225c-cb21-4da9-a906-9679f117ec46	e70f3ded-34a4-48d5-bb68-c94eb5256edc	22	2025-12-11 00:30:57.355775+00
18	cbab8f32-e37a-4cdf-a2aa-d784891005c8	e70f3ded-34a4-48d5-bb68-c94eb5256edc	3	2025-12-11 05:54:48.646657+00
19	efb481be-6cfc-45e5-b470-dfd2b49c1c65	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-11 06:08:18.232702+00
20	55464946-5661-4d8a-817b-079618aad4ba	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-11 06:54:49.022269+00
21	a3cddc29-42b1-4f82-ac8b-37a20693b9eb	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-11 07:10:27.613091+00
22	66c9bbdd-0933-4c1c-b1e7-cf5435e2c1e6	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-11 17:35:06.951357+00
23	37f48cd9-dea2-4515-86c1-a859d9ee277e	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-11 17:46:12.153413+00
24	92333f19-a91d-4c60-bcff-27ff1156d3f2	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-11 18:08:39.765631+00
25	0f8d7d08-9dd7-4d99-8435-1a5fc23eccfb	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-11 19:01:28.456185+00
26	d839a0bd-072c-458a-b449-8684c1cda987	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-11 22:00:54.619739+00
27	2538590a-cbfe-4c18-9326-76e208eed90f	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-12 06:49:14.583469+00
28	7e50b74c-5f96-4f41-8fcf-12bc06f82dd4	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-12 22:10:23.264366+00
29	d3ce065f-92d4-4f9f-b2f2-a206307013d9	e70f3ded-34a4-48d5-bb68-c94eb5256edc	19	2025-12-13 03:55:23.307019+00
30	873bd422-46e8-4a8a-85b6-4127df1ebd44	e70f3ded-34a4-48d5-bb68-c94eb5256edc	7	2025-12-13 22:21:25.422926+00
31	7ab99b16-9e9b-4be1-9772-8830a41e766c	e70f3ded-34a4-48d5-bb68-c94eb5256edc	11	2025-12-14 19:13:43.96335+00
32	31955403-c9be-4f77-9f3e-27288067a0b4	e70f3ded-34a4-48d5-bb68-c94eb5256edc	6	2025-12-15 22:14:16.403798+00
33	086fc18e-a7d8-4ace-adb2-5e8ce2d4c526	e70f3ded-34a4-48d5-bb68-c94eb5256edc	7	2025-12-16 20:31:57.83801+00
34	95cd4610-a52f-47c7-9477-63ae3cbc95f5	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2025-12-17 02:36:54.24678+00
35	3ca90929-4147-4c6b-a350-53bb00e93675	e70f3ded-34a4-48d5-bb68-c94eb5256edc	1	2025-12-17 03:51:58.285043+00
36	e0f106b4-ad3e-45be-8636-7f628d775327	e70f3ded-34a4-48d5-bb68-c94eb5256edc	1	2026-01-05 18:45:58.688684+00
37	5596b52d-f18b-4864-9840-110a7aea1371	e70f3ded-34a4-48d5-bb68-c94eb5256edc	8	2026-01-05 20:51:54.738773+00
38	c9940f26-1d71-4b8d-a0dd-615bef2c0083	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2026-01-08 22:32:38.588643+00
39	277e9667-4d40-4af4-8bce-d944b2dca90f	e70f3ded-34a4-48d5-bb68-c94eb5256edc	7	2026-01-17 19:43:03.17606+00
40	fdc9dcb0-37dd-42a9-8f2f-64d8c487eb6d	e70f3ded-34a4-48d5-bb68-c94eb5256edc	2	2026-01-19 18:57:10.956493+00
41	03bfceec-d04d-491b-b3f0-aeb60e332a36	e70f3ded-34a4-48d5-bb68-c94eb5256edc	4	2026-02-11 23:19:50.852053+00
42	ee0848e5-3d11-4259-b12f-c7fb258b98f6	e70f3ded-34a4-48d5-bb68-c94eb5256edc	5	2026-04-14 01:11:50.390593+00
43	a883aa5d-20ad-44ad-94d5-2eab89abb05e	e70f3ded-34a4-48d5-bb68-c94eb5256edc	74	2026-05-05 22:49:26.754503+00
44	ed555088-bc90-43e1-ac42-f7d72d47321b	e70f3ded-34a4-48d5-bb68-c94eb5256edc	1	2026-05-06 00:21:59.96064+00
45	41952284-b278-475c-a987-b8f3075b8a47	e70f3ded-34a4-48d5-bb68-c94eb5256edc	26	2026-06-21 00:57:00.89186+00
46	05159239-dd86-4a6a-b774-5d846c2e211e	e70f3ded-34a4-48d5-bb68-c94eb5256edc	42	2026-09-01 04:02:17.05388+00
\.


--
-- Data for Name: abandoned_bookings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.abandoned_bookings (id, user_id, email, phone, pickup_address, dropoff_address, load_size, preferred_date, selected_mover_id, last_step, reminder_sent_at, reminder_count, recovered, recovered_booking_id, created_at, updated_at) FROM stdin;
3f84e412-67da-4fe2-b76f-42d625d41f11	bea15756-b2a3-405b-8834-3b7d224c67b5	ekijohn111@gmail.com	4039235355	13 Crystal Ridge Gate, Okotoks, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	\N	2	\N	0	t	bdfef8db-909b-45f3-b92b-80786dbaff8d	2026-01-05 22:46:53.611322	2026-01-05 22:49:17.528
b960964f-2529-4993-8b62-0567a300bb1e	1d803abc-bf4d-4d29-8536-393987304033	adewaledaniel360@gmail.com	3068074780	Country Hills Blvd, Calgary, AB, Canada	\N	medium	\N	\N	1	2026-02-01 08:30:04.798	3	f	\N	2026-02-01 05:11:30.654084	2026-02-01 08:30:04.798
b413ae97-8b5e-4be3-857d-a19b4d5b39a8	c7ba5412-2021-4d8c-a59e-3e658d9dc0bc	dimonkermen@gmail.com	6477616967	20 Mahogany mews SE, 103	6212 90 Ave SE	medium	\N	b9f8d7a9-892c-48a7-a62d-dd255d482660	2	2026-01-16 19:30:05.667	3	f	\N	2026-01-16 16:53:18.772618	2026-01-16 19:30:05.667
34fb273b-935a-4d0c-b2d3-d4f6edd8585a	d9ba6e2a-56d4-4a98-b3b1-3122001beb0d	kenekim121@gmail.com	\N	12 Mahogany Manor SE, Calgary, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	medium	\N	\N	2	\N	0	t	4dfe91ef-c5f6-4840-b11f-1afc4fc0b8e4	2026-02-21 02:01:02.39393	2026-02-21 02:15:53.215
c7619ebd-539a-417a-bd28-56996fed67ee	bea15756-b2a3-405b-8834-3b7d224c67b5	ekijohn111@gmail.com	4039235355	7 Baywater Court Southwest, Airdrie, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	medium	\N	\N	2	2026-01-17 05:00:07.876	3	t	496d7bee-baf6-409d-9621-6845ca2f20d7	2026-01-17 01:45:57.474259	2026-02-06 01:15:57.33
3a48cbcb-b915-4ee8-a757-7d90adccc604	02073e48-8786-455f-96ec-789cfb40b633	hannasabdulwahab@gmail.com	3689969002	10349 Cityscape Drive Northeast, Calgary, AB, Canada	291 Nolanhurst Crescent Northwest, Calgary, AB, Canada	large	\N	\N	3	\N	0	t	af96a642-2419-4b11-88de-b1a2902984f5	2026-04-12 17:31:23.030205	2026-04-12 17:32:03.07
38c1c28b-6667-4607-8036-8ff64dc81700	452a351c-c308-4a11-8539-ea23394a8ab9	biodunogunjimi@gmail.com	4038051953	10 Evansbrooke Terrace Northwest, Calgary, AB, Canada	211 Redstone Heights Northeast, Calgary, AB, Canada	medium	\N	\N	3	2026-01-17 20:00:06.378	3	f	\N	2026-01-17 17:15:11.900905	2026-01-18 04:51:35.761
0bce3dae-fabb-4230-aa22-e5eb3004743e	a8e52fd4-a66a-46d3-9f17-19c18088e8f4	foodjuk@gmail.com	5877196455	1711 52 St. SE, Calgary, AB, Canada	4310 104 Avenue Northeast, Calgary, AB, Canada	medium	\N	\N	2	\N	0	t	af491d8b-6ea6-4d0c-bf53-8ef5e4b1f4e6	2026-01-18 20:04:24.747314	2026-01-18 20:08:45.688
0fa4f789-46a8-4963-8519-5cc9f573f4b6	3724c9bc-c17c-46e4-91eb-c6763ab09999	j_emmie@hotmail.com	8255612231	315 50 Ave SW #105, Calgary, AB, Canada	5210 77 Ave SE, Calgary, AB, Canada	apartment	\N	\N	2	2026-04-21 03:45:04.405	3	t	b2bf0412-acec-4ae2-a6ec-58e5822cbe8c	2026-04-21 01:03:43.285836	2026-04-25 15:47:23.145
3414e780-0f61-4677-8a75-cf2493871ff2	33db1671-5c9a-4b1d-995b-8fa28e347ead	bonafide.smt@gmail.com	6474050816	10349 Cityscape Dr NE, Calgary, AB T3N 2A1, Canada	194 Cornerstone Avenue Northeast, Calgary, AB, Canada	medium	\N	\N	2	\N	0	f	\N	2026-07-29 01:13:41.437216	2026-07-29 01:17:27.804
ccdcdd0f-e36a-49b5-b8bb-067c2cf725e5	1dd4c7e6-e5cb-4e12-9ac0-19b0d3974354	chineduchilekezi@gmail.com	3065809752	Airport Road Northeast, Calgary, AB, Canada	308 4th Avenue Southwest, Calgary, AB, Canada	medium	\N	\N	2	\N	0	t	701f53be-a9ab-4b45-a90a-d0b27778b87c	2026-01-26 00:01:28.599029	2026-01-26 00:03:43.344
74a6f921-08cb-4f83-98ba-9421e964c8dc	ac43dfba-a25b-4da5-a433-92ad09a23e0b	jlosocloset91@gmail.com	7787915375	10349 Cityscape Dr NE, Calgary, AB T3N 1N5, Canada	25 Belvedere Park Southeast, Calgary, AB, Canada	large	\N	\N	2	\N	0	t	ffc36ceb-21d1-47a0-97cf-1563428a8cb0	2026-05-05 16:26:22.412087	2026-05-05 16:30:21.856
debc48e4-0f67-4889-9533-0c86aec9d506	806ed749-27ad-40bf-b7b8-ce16ea0abaf2	Meghanmckenna90@gmail.com	14034793508	516 Northmount Place Northwest, Calgary, AB, Canada	10349 Cityscape Dr NE, Calgary, AB, Canada	large	\N	\N	2	2026-04-11 23:15:01.691	3	f	\N	2026-04-11 20:16:08.261256	2026-04-11 23:15:01.691
717baf10-14aa-4cd5-9455-4ad044fc8a6b	3724c9bc-c17c-46e4-91eb-c6763ab09999	j_emmie@hotmail.com	8255612231	315 50 Ave SW #105, Calgary, AB, Canada	5075 26 Ave SE, Calgary, AB, Canada	apartment	2026-04-26T14:00	\N	2	2026-04-25 18:45:01.949	3	t	11161561-7b74-421e-915a-2ab1bbd1ad69	2026-04-25 15:55:51.250418	2026-04-25 23:18:37.782
02b403d5-b720-43e3-924c-aecd6018adc7	bea15756-b2a3-405b-8834-3b7d224c67b5	ekijohn111@gmail.com	4039235355	21 Riviera Point, Cochrane, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	\N	2	2026-02-12 01:30:12.957	3	t	2cb3dbf3-a880-44bd-82f9-93ca2a111081	2026-02-11 21:52:06.122404	2026-02-18 21:53:47.387
a78142bb-ca47-49a0-9c7c-84d64c78c1e6	008bbd4d-55f1-4b6c-aafd-b9908cfffcdc	fereshte.hsnzde@gmail.com	5878995559	Crowsnest Hall, 250 Collegiate Blvd NW, Calgary, AB T2N 5A6, Canada	5256 19 Ave NW, Calgary, AB T3B 0T2, Canada	medium	2026-08-15T15:00	\N	3	\N	0	t	24376126-5a19-4a17-bd08-117a73a68c5c	2026-08-10 20:35:33.332282	2026-08-10 20:48:12.428
5416af5e-b60f-4e37-867f-c2bf5cd7e190	1cf4ad96-9a77-4af4-8770-ca904e939a50	szarusky@hotmail.com	4038754025	1608 18 Avenue Northwest, Calgary, AB, Canada	927 25 Avenue Northwest, Calgary, AB, Canada	medium	2026-07-15T09:00	\N	3	\N	0	t	53b35671-65f9-4c35-9d69-f00536754c34	2026-07-08 18:38:28.366565	2026-07-08 21:02:34.208
03a2d0d0-a71f-4790-ab9c-d14313db926b	02073e48-8786-455f-96ec-789cfb40b633	hannasabdulwahab@gmail.com	3689969002	10349 Cityscape Drive Northeast, Calgary, AB, Canada	\N	medium	\N	\N	1	\N	0	t	844d12be-9706-4e1b-892f-45851cf0ab70	2026-04-12 17:27:18.495788	2026-04-12 17:28:35.907
5d7ca1ce-e5cf-4e12-b764-b6f190574d43	cd7e2137-ec2d-4248-8e4a-cc7074256a0f	tawanachinwada@icloud.com	2505716459	2613 3 Ave NW, Linden, AB, Canada	70 Saddlepeace Manor Northeast, Calgary, AB, Canada	medium	\N	\N	2	2026-05-06 04:15:02.073	3	f	\N	2026-05-06 01:30:24.695221	2026-05-06 04:15:02.073
4aacc58f-72e7-4f7d-9cf8-82d4469e9721	bea15756-b2a3-405b-8834-3b7d224c67b5	ekijohn111@gmail.com	4039235355	10349 Cityscape Dr NE, Calgary, AB T3N 1N5, Canada	Real Canadian Superstore Country Hills Boulevard, Country Hills Boulevard Northwest, Calgary, AB, Canada	medium	\N	\N	2	2026-02-21 05:30:00.933	3	f	\N	2026-02-21 01:45:47.770249	2026-04-26 01:41:14.164
a4cdbd30-d99b-42a7-b2e8-2e9a009df56e	5e33efa5-cfb6-4083-9860-61668eb028f3	mohamedjliban20@gmail.com	3432626332	180 Calhoun Common Northeast, Calgary, AB T3P 1T3, Canada	85b Savanna Link Northeast, Calgary, AB, Canada	medium	2026-08-07T14:30	\N	3	\N	0	f	\N	2026-08-07 20:18:15.191206	2026-08-07 20:22:24.998
592c982b-4baa-4e62-8dc2-697a7a05b4d7	167f2a72-4c3e-4dbc-aa1b-58522ae0caf2	zach.melin1888@gmail.com	4039696712	118 Walden Cir SE, Calgary, AB, Canada	222 Riverfront Avenue Southwest, Calgary, AB, Canada	large	\N	\N	2	\N	0	f	\N	2026-08-11 16:43:59.53614	2026-08-11 17:35:02.898
a7d2b3f9-fbf4-4ae2-b4c0-09d6ecb34e29	446c5dfe-bd26-4387-aa1a-af333b7e503a	haleemahsanni4@gmail.com	9023189284	450 Carringvue Grove Northwest, Calgary, AB, Canada	743 Livingston Way Northeast, Balzac, AB, Canada	large	\N	\N	2	\N	0	t	32d5a107-1f38-4465-9b4b-ffd492d10f5f	2026-08-28 19:33:15.268346	2026-08-28 19:34:21.059
\.


--
-- Data for Name: ai_incident_insights; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ai_incident_insights (id, incident_id, summary, severity_assessment, root_cause, recommendations, partner_communication, internal_notes, escalation_advice, confidence, processing_time_ms, model_used, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: ai_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ai_runs (id, booking_id, provider, operation, input_tokens, output_tokens, total_cost, status, error_message, response_time, created_at) FROM stdin;
\.


--
-- Data for Name: ai_support_insights; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ai_support_insights (id, ticket_id, summary, category, suggested_priority, root_cause, recommendations, suggested_response, similar_cases, confidence, processing_time_ms, model_used, created_at, expires_at, customer_response, internal_notes) FROM stdin;
32b37429-1f67-474d-8760-e31a8acc5fd6	01ff44e7-838e-448f-be62-49506783ce69	Customers are unable to complete bookings due to a failure in the Stripe payment process, resulting in a critical revenue blockage and potential customer loss.	payment	urgent	The Stripe payment session fails because the pricing engine does not pass the required 'priceId' or 'amount' to the Stripe API, causing a TypeError and preventing payment intent creation.	{"Verify that the pricing engine correctly passes 'priceId' and 'amount' to the Stripe session request.","Inspect recent changes to the create-session API route for potential errors or omissions.","Roll back the latest deployment if the issue persists and test the payment flow using Stripe's test mode."}	Dear [Customer Name],\n\nWe sincerely apologize for the inconvenience you experienced while trying to complete your booking. Our team is actively investigating the issue with the payment process and working on a solution to restore full functionality as quickly as possible. We appreciate your patience and understanding during this time. Please let us know if there's anything else we can assist you with.\n\nBest regards,\n[Your Name] - LervIT Support Team	{"A previous incident where the payment API failed due to incorrect parameters, resolved by correcting the API payload.","An earlier issue where a deployment caused a payment flow disruption, fixed by rolling back the changes."}	85	4426	gpt-4o	2025-12-07 01:05:32.579782	2025-12-08 01:05:32.558	\N	\N
a8ec4778-5ca7-4f60-8982-67502ca1126f	eb1b0d91-edf3-4b8d-9980-614478f076ec	The customer is experiencing a delay in the review of their documents, which is affecting their ability to proceed with a booking.	booking	normal	The document review process is taking longer than expected, possibly due to a backlog or system delay.	{"Check the document review queue for any backlogs or delays.","Verify if there are any system issues affecting document processing times.","Communicate with the document review team to expedite the process for this customer."}	\N	{"Document review delays due to system maintenance, resolved by prioritizing the queue.","Backlog in document verification, resolved by temporarily increasing staff resources."}	85	5568	gpt-4o	2026-02-01 00:51:45.395977	2026-02-02 00:51:45.376	Dear Tim, thank you for reaching out to us. I understand how important it is for you to get your documents reviewed promptly so you can proceed with your booking. I'm truly sorry for the delay you're experiencing. Rest assured, we are looking into this matter and will do our best to expedite the process. We appreciate your patience and understanding. Please feel free to reach out if you have any further questions or need assistance.	The issue seems to be related to the document review process within the booking workflow. Check the document review API for any pending requests or errors. Ensure that the document review service is operational and not experiencing delays. If necessary, escalate to the document review team to prioritize this case. No error codes or logs are available in the ticket details.
335a2614-2b73-4583-8797-27aa9992228b	72a35df0-0b5d-470f-a46e-9ae536726676	The customer is inquiring about setting their availability for bookings from Monday to Saturday, between 12:00 noon and 8:00 p.m.	general	low	The customer is likely seeking assistance on how to update their availability settings within the platform.	{"Guide the customer on how to update their availability in the app settings.","Verify if there are any current issues with the availability settings feature.","Ensure the customer receives confirmation once their availability is updated."}	\N	{"User unable to update availability due to app glitch - resolved by app update.","Availability settings not saving - resolved by clearing app cache and re-logging in."}	85	6051	gpt-4o	2026-02-01 22:12:48.976064	2026-02-02 22:12:48.957	Thank you for reaching out to us! We understand how important it is for you to set your availability accurately. You can update your availability by navigating to the settings section of your profile in the app. If you need any further assistance or encounter any issues, please let us know, and we'll be more than happy to help. We appreciate your patience and look forward to ensuring your schedule is set just right!	Check if the availability settings feature is functioning correctly. Verify if the customer's profile settings reflect the correct availability times. If there are any discrepancies, investigate potential issues with the database entries related to user availability settings.
149bca35-0fc3-4914-8e81-0a9b2925f6bf	29e4c350-03d0-45e0-9e6b-bf86e936f79e	The customer is unable to update their payment information on the platform and is seeking assistance.	payment	normal	The issue is likely due to a temporary glitch in the payment update process or a problem with the Stripe payment gateway integration.	{"Verify if the payment update feature is functioning correctly on the platform.","Check for any recent changes or updates to the Stripe integration that might affect payment updates.","Guide the customer through clearing cache or trying a different browser if the issue persists."}	\N	{"Case where customers couldn't update payment info due to browser cache issues, resolved by clearing cache.","Issue with Stripe integration causing payment update failures, resolved by updating API keys."}	85	5177	gpt-4o	2026-02-19 01:27:37.084905	2026-02-20 01:27:37.066	Thank you for reaching out to us. I'm sorry to hear you're having trouble updating your payment information. Let's get this sorted out for you. Could you please try clearing your browser's cache or using a different browser? If the issue continues, let us know, and we'll be happy to assist further. We appreciate your patience and understanding.	Investigate the payment update endpoint for any recent changes or issues. Check logs for any error codes related to Stripe API calls during payment info updates. Ensure that the customer's session is correctly authenticated and that there are no permission issues. Consider testing the payment update process in a controlled environment to replicate the issue.
69e3a0ed-8c96-4260-b46b-491d66d77a0e	4137c7b2-aab2-4317-b31c-b8935eb192c5	The customer is awaiting an update on a promised job booking confirmation, which they have not yet received.	booking	normal	The delay in sending the booking confirmation could be due to a system glitch or a delay in processing the booking request.	{"Verify the booking status in the system to ensure it was processed correctly.","Check if there are any delays or errors in the booking confirmation dispatch system.","Contact the customer with an update on their booking status and provide a timeline for resolution."}	\N	{"Delayed booking confirmation due to email dispatch system error, resolved by manual resend.","Booking not processed due to system glitch, resolved by re-processing the booking."}	85	5474	gpt-4o	2026-02-20 04:10:49.630073	2026-02-21 04:10:49.589	Thank you for reaching out to us. I apologize for the delay in receiving your booking confirmation. We are currently looking into this for you and will provide you with an update as soon as possible. Your patience is greatly appreciated, and we are committed to resolving this promptly. Please let us know if there's anything else we can assist you with in the meantime.	Check the booking system for the customer's booking ID and verify its status. Ensure that the booking confirmation email or notification was triggered. Investigate any potential delays in the email dispatch system. Check logs for any errors related to booking confirmation dispatch. If necessary, manually resend the confirmation to the customer.
72d2182b-e591-4d75-ae3a-6d20e4a4e517	29e4c350-03d0-45e0-9e6b-bf86e936f79e	The customer is unable to update their payment information on the platform and is seeking assistance.	payment	normal	The likely cause is a technical issue with the payment update interface, possibly due to a recent update or a temporary glitch.	{"Verify if the payment update functionality is working correctly on the platform.","Check for any recent updates or changes to the payment module that might have caused this issue.","Guide the customer through an alternative method to update their payment information if necessary."}	\N	{"Users unable to update payment info due to a temporary Stripe API outage, resolved by retrying after the service was restored.","Payment update failures caused by browser cache issues, resolved by clearing cache and cookies."}	85	5568	gpt-4o	2026-02-26 21:06:28.799501	2026-02-27 21:06:28.779	Thank you for reaching out to us. I'm sorry to hear that you're having trouble updating your payment information. Let's get this sorted out for you as quickly as possible. Please try refreshing the page and attempting the update again. If the issue persists, feel free to provide us with any additional details, and we'll be more than happy to assist further. We apologize for any inconvenience this may have caused and appreciate your patience.	The issue seems to be related to the payment update functionality. Check the Stripe payment integration logs for any errors during the update attempt. Verify if there are any recent changes in the payment module that could have affected the update process. Ensure that the customer's account is in good standing and that there are no restrictions preventing payment updates.
7e6bc464-231b-49ce-8309-7eb739d95700	a9009571-ed23-4e26-88db-22ad53588ce6	The customer has submitted the necessary documents and is awaiting verification to become a mover on the platform.	general	normal	The verification process for new movers may be delayed due to pending document review or system backlog.	{"Check the document submission queue for any pending verification tasks.","Ensure that all submitted documents meet the platform's requirements for mover verification.","Communicate with the verification team to expedite the process if necessary."}	\N	{"Mover verification delays due to incomplete document submission, typically resolved by requesting additional documents.","System backlog causing delays in verification, usually resolved by prioritizing tasks in the queue."}	85	9105	gpt-4o	2026-03-19 22:42:14.851791	2026-03-20 22:42:14.831	Thank you for reaching out to us and for submitting your documents. We understand how important it is for you to get verified as a mover, and we're here to help. Our team is currently reviewing your documents, and we'll make sure to update you as soon as the verification is complete. We appreciate your patience and are excited to have you join our community of movers!	Check the document verification system for the customer's submission. Ensure that the documents are in the correct format and meet all requirements. If the documents are pending review, prioritize this task in the verification queue. Verify that there are no system errors causing delays in the verification process.
b8715f28-4ba4-4865-9ff6-53a43ad00aab	4a9be2bb-a0fb-4fe0-a616-f13e997cfa38	The customer is experiencing difficulty in receiving job offers despite being online on the platform.	general	normal	The issue may be due to a lack of demand in the customer's area or potential visibility issues on the platform.	{"Verify the customer's profile is fully completed and optimized for visibility.","Check the platform's demand in the customer's location to ensure there are available jobs.","Ensure there are no technical issues affecting the customer's visibility to potential clients."}	\N	{"Profile visibility issues resolved by ensuring complete profile information and active status.","Low demand in specific areas addressed by advising customers on peak times and popular service areas."}	85	6355	gpt-4o	2026-04-02 02:09:45.404137	2026-04-03 02:09:45.383	Thank you for reaching out and letting us know about your experience. We understand how important it is for you to receive job offers promptly. Our team is here to help. We will review your profile and settings to ensure everything is optimized for you to receive more job opportunities. Please bear with us as we look into this, and we will get back to you shortly with more information. We appreciate your patience and are committed to resolving this for you.	Investigate the customer's profile status in the database to ensure it is complete and active. Check the job matching algorithm logs to see if the customer is being matched with available jobs. Review the demand analytics for the customer's area to determine if there is a low demand issue. If necessary, escalate to the technical team to check for any visibility bugs affecting the customer's account.
\.


--
-- Data for Name: booking_assignments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.booking_assignments (id, booking_id, partner_id, team_member_id, driver_name, driver_phone, team_name, vehicle_type, vehicle_plate, estimated_arrival, assigned_by, assigned_at, notes) FROM stdin;
\.


--
-- Data for Name: booking_metrics; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.booking_metrics (id, booking_id, estimated_vehicle_class, estimated_volume_cuft, estimated_weight_kg, estimated_duration_minutes, estimated_price, actual_vehicle_class, actual_volume_cuft, actual_weight_kg, actual_duration_minutes, actual_price, volume_accuracy_percent, price_accuracy_percent, vehicle_class_match, customer_satisfaction_rating, estimate_accuracy_rating, customer_notes, mover_difficulty_rating, mover_notes, loading_time_minutes, unloading_time_minutes, used_for_training, outlier_flag, reviewed_by_admin, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: booking_status_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.booking_status_events (id, booking_id, partner_id, from_status, to_status, changed_by, notes, customer_visible, created_at) FROM stdin;
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bookings (id, customer_id, mover_id, pickup_address, dropoff_address, load_size, description, preferred_date, status, distance, price, payment_status, stripe_payment_intent_id, created_at, updated_at, images, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, base_fee, distance_fee, load_fee, mover_travel_fee, notified_at, accepted_at, pickup_difficulty, dropoff_difficulty, heavy_item, number_of_movers, pickup_difficulty_fee, dropoff_difficulty_fee, heavy_item_fee, subtotal, ai_estimate, ai_explanation, ai_photo_analysis, current_latitude, current_longitude, location_updated_at, ai_weight_class, ai_recommended_vehicle, ai_confidence_score, detected_items, acknowledged_single_mover_policy, platform_fee_percent, platform_fee_amount, mover_net_amount, flagged_for_review, flagged_reason, discount_percent, discount_amount, discount_reason, pre_selected_mover_id, promo_code, mover_balance_owed, mover_balance_paid) FROM stdin;
55784d4a-806b-4d2c-b94e-6d1c5c2857b4	fcb9627c-280b-4fa3-a84e-7334b55aece3	\N	10349 Cityscape Drive Northeast, Calgary, AB, Canada	365 Skyview Parkway Northeast, Calgary, AB, Canada	large	\N	2026-04-19 18:28:00	payment_failed	1.98	58.29	failed	\N	2026-04-18 18:29:18.306876	2026-04-18 18:29:18.306876	{/objects/uploads/0e7398a0-e983-4c28-bb63-922f52ed41a9.jpg}	51.1442523	-113.9660178	51.1503087	-113.9527717	24.00	3.80	18.64	0.00	2026-04-18 18:29:18.287	\N	ground	elevator	t	2	0.00	9.60	0.00	56.04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	20.00	14.57	LERVIT20 promo - 20% off (1 use remaining)	\N	LERVIT20	12.38	f
8bf9cad6-8414-473a-8906-e818d5b4c152	bea15756-b2a3-405b-8834-3b7d224c67b5	aa2cde65-b901-4fc5-895c-c8baad294a2e	164 Covepark Way Northeast, Calgary, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	medium	\N	2025-12-11 23:00:00	completed	8.87	56.09	succeeded	pi_3Sci9QRphcrPZtHD1x3SAaLZ	2025-12-10 07:49:20.803707	2026-01-02 18:13:33.164	{/objects/uploads/079ade43-7eb6-4275-83ff-4d0ff58f493a.jpg}	51.1659013	-114.0550984	51.1442523	-113.9660178	30.00	11.09	0.00	0.00	2025-12-10 07:49:20.784	\N	ground	ground	f	1	0.00	0.00	0.00	56.09	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	8.41	47.68	f	\N	0.00	0.00	\N	\N	\N	0.00	f
b2bf0412-acec-4ae2-a6ec-58e5822cbe8c	3724c9bc-c17c-46e4-91eb-c6763ab09999	\N	315 50 Ave SW #105, Calgary, AB, Canada	5210 77 Ave SE, Calgary, AB, Canada	apartment		2026-04-26 20:00:00	cancelled	11.03	245.01	pending	\N	2026-04-25 15:47:22.717667	2026-04-25 16:30:59.518	{/objects/uploads/6c97d1db-6e0d-4537-8b25-2aa9ba6e01b3.jpeg,/objects/uploads/055b7a87-fd08-4bd9-b350-22a6ae674439.jpg,/objects/uploads/2220fd0d-20b4-4e05-a3c9-fa408bdb91f9.jpg}	51.0084307	-114.0707171	50.98363430000001	-113.9594015	48.00	26.47	54.00	0.00	2026-04-25 15:47:22.698	\N	ground	ground	t	2	0.00	0.00	0.00	188.47	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	36.75	208.26	f	\N	0.00	0.00	\N	\N	\N	0.00	f
26ca3232-d410-4a37-bb10-15f3f431a2d6	bea15756-b2a3-405b-8834-3b7d224c67b5	aa2cde65-b901-4fc5-895c-c8baad294a2e	544 Crescent Road Northwest, Calgary, AB, Canada	6635 106 Avenue Southeast, Calgary, AB, Canada	medium	\N	2025-12-08 06:27:00	cancelled	9.27	90.05	succeeded	pi_3SbxvYRphcrPZtHD15aoagvg	2025-12-08 06:27:56.30296	2026-01-04 20:57:00.271	{/objects/uploads/07dc3332-6acc-46cf-a711-58e08bfaaa02.jpg}	51.12813469555608	-113.93101793258498	51.14210340958187	-113.91458429666449	30.00	9.27	15.00	0.00	2025-12-08 06:27:56.283	\N	ground	ground	t	2	0.00	0.00	15.00	69.27	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
38c0211f-2e9e-4e7d-9ecb-61dc14f5d647	1cf4ad96-9a77-4af4-8770-ca904e939a50	\N	1608 18 Avenue Northwest, Calgary, AB, Canada	927 25 Avenue Northwest, Calgary, AB, Canada	medium	\N	2026-07-15 15:00:00	pending_payment	1.61	62.06	pending	\N	2026-07-08 19:54:28.925583	2026-07-08 19:54:28.925583	{/objects/uploads/5e3f1c9b-08cb-4677-ae65-d399c54d4d08.png,/objects/uploads/157e601a-bd02-4b5f-96ed-e91df3c123db.png}	51.0691208	-114.0977116	51.0745977	-114.0827811	20.00	2.90	9.84	0.00	2026-07-08 19:54:28.907	\N	ground	ground	t	2	0.00	0.00	15.00	47.74	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
496d7bee-baf6-409d-9621-6845ca2f20d7	bea15756-b2a3-405b-8834-3b7d224c67b5	a003a8cb-58c2-4b66-8154-17cc72c46e56	7 Baywater Court Southwest, Airdrie, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	2026-02-06 01:15:00	completed	19.97	81.95	succeeded	pi_3SxdfsRxppl2FbkT0IUzYEzI	2026-02-06 01:15:56.976062	2026-02-06 02:41:56.451	{/objects/uploads/89cd46c3-48c0-489d-a3e9-25d092773ad4.jpg}	51.2779463	-114.0345301	51.1442523	-113.9660178	20.00	31.95	30.00	0.00	2026-02-06 01:15:56.954	\N	ground	ground	t	1	0.00	0.00	0.00	81.95	\N	\N	\N	51.14433088556368	-113.96571671453987	2026-02-06 02:41:54.279	\N	\N	\N	\N	f	15.00	12.29	69.66	f	\N	0.00	0.00	\N	\N	\N	0.00	f
2cb3dbf3-a880-44bd-82f9-93ca2a111081	bea15756-b2a3-405b-8834-3b7d224c67b5	64d3cbb5-bba3-429c-9d4a-cdd69237152c	21 Riviera Point, Cochrane, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	2026-02-18 21:53:00	completed	49.61	114.91	succeeded	pi_3T2IgtRxppl2FbkT1WhAqZ7d	2026-02-18 21:53:47.066273	2026-02-19 00:28:00.161	{/objects/uploads/30b0a53f-5155-4828-a60c-de9e8eb3fd92.jpg}	51.17057519999999	-114.4588179	51.1442523	-113.9660178	20.00	79.38	15.53	0.00	2026-02-18 21:53:47.041	\N	ground	ground	t	1	0.00	0.00	0.00	114.91	\N	\N	\N	51.14445077313457	-113.96623857507048	2026-02-19 00:27:57.543	\N	\N	\N	\N	f	15.00	17.24	97.67	f	\N	0.00	0.00	\N	\N	\N	0.00	f
9adafd35-e273-403b-8aa8-1bb602c7b6c7	d9ba6e2a-56d4-4a98-b3b1-3122001beb0d	\N	12 Mahogany Manor SE, Calgary, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	2026-02-21 02:15:00	payment_failed	35.16	73.43	failed	\N	2026-02-21 02:15:52.320617	2026-02-21 02:15:52.320617	{/objects/uploads/bef2515a-aeec-4e9d-9090-e5fb9f78350c.jpeg}	50.9024204	-113.9311059	51.1442523	-113.9660178	20.00	56.26	15.53	0.00	2026-02-21 02:15:52.301	\N	ground	ground	t	1	0.00	0.00	0.00	91.79	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	20.00	18.36	LERVIT20 promo - 20% off (1 use remaining)	\N	LERVIT20	15.61	f
4dfe91ef-c5f6-4840-b11f-1afc4fc0b8e4	d9ba6e2a-56d4-4a98-b3b1-3122001beb0d	64d3cbb5-bba3-429c-9d4a-cdd69237152c	12 Mahogany Manor SE, Calgary, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	2026-02-21 02:15:00	completed	35.16	73.43	succeeded	pi_3T35jbRxppl2FbkT1oICoQjt	2026-02-21 02:15:52.836607	2026-02-21 22:40:48.318	{/objects/uploads/bef2515a-aeec-4e9d-9090-e5fb9f78350c.jpeg}	50.9024204	-113.9311059	51.1442523	-113.9660178	20.00	56.26	15.53	0.00	2026-02-21 02:15:52.817	\N	ground	ground	t	1	0.00	0.00	0.00	91.79	\N	\N	\N	51.14458081182525	-113.96624076085689	2026-02-21 04:21:51.533	\N	\N	\N	\N	f	15.00	11.01	62.42	f	\N	20.00	18.36	LERVIT20 promo - 20% off (0 uses remaining)	\N	LERVIT20	15.61	t
d8431b18-73d9-4982-a93e-683d55e98b35	bea15756-b2a3-405b-8834-3b7d224c67b5	aa2cde65-b901-4fc5-895c-c8baad294a2e	450 8 Avenue Southeast, Calgary, AB, Canada	8710 Horton Road Southwest, Calgary, AB, Canada	large	\N	2025-12-09 04:00:00	completed	20.96	124.75	succeeded	pi_3Sc7lSRphcrPZtHD0m7kTdGJ	2025-12-08 05:57:50.920832	2025-12-09 06:41:03.316	{/objects/uploads/1104e099-a1c7-4477-bcc0-a7ed9b0806e6.jpg}	50.89172887878107	-114.20914256819484	50.989179093311165	-114.09449525698297	30.00	20.96	30.00	0.00	2025-12-08 05:57:50.901	\N	ground	ground	t	2	0.00	0.00	15.00	95.96	\N	\N	\N	51.14421944739321	-113.96595513358237	2025-12-08 18:08:02.642	\N	\N	\N	\N	f	15.00	18.71	106.04	f	\N	0.00	0.00	\N	\N	\N	0.00	f
1f9ce5c9-7603-4f16-ba84-49fd3acdf273	bea15756-b2a3-405b-8834-3b7d224c67b5	aa2cde65-b901-4fc5-895c-c8baad294a2e	450 8 Avenue Southeast, Calgary, AB, Canada	566 Aero Drive Northeast, Calgary, AB, Canada	medium	\N	2025-12-10 00:00:00	completed	15.20	49.00	succeeded	pi_3ScKgRRphcrPZtHD0S1UAvVy	2025-12-09 06:45:56.914925	2025-12-09 06:59:21.239	{/objects/uploads/904fe131-4e88-4767-baba-5f13de020db3.jpg}	51.0454243	-114.0538972	51.1339756	-114.0343215	30.00	19.00	0.00	0.00	2025-12-09 06:45:56.895	\N	ground	ground	f	1	0.00	0.00	0.00	49.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	7.35	41.65	f	\N	0.00	0.00	\N	\N	\N	0.00	f
90404d34-a976-49a7-8336-c75762799e59	3d67e96a-ad34-4eec-8830-8c9a699a41f5	\N	83 Nolanfield Court Northwest, Calgary, AB, Canada	12 Sage Hill Terrace Northwest, Calgary, AB, Canada	large	\N	2025-12-20 23:00:00	payment_failed	4.43	101.89	failed	\N	2025-12-14 00:48:15.202547	2025-12-14 00:48:15.202547	{/objects/uploads/96e6a90a-17e5-47b8-b4e5-dd6e18ab2a2a.jpg}	51.178614	-114.1604461	51.1705881	-114.1361329	40.00	7.09	30.00	0.00	2025-12-14 00:48:15.183	\N	ground	basement	t	2	0.00	10.00	0.00	87.09	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	10.00	11.32	First-move 10% discount	\N	\N	0.00	f
e5dfd4ff-a989-4696-80d5-971885ca3c9e	7e454eca-11fc-4fe2-a4ce-2de1d894e137	\N	2323 32 Avenue Northeast, Calgary, AB, Canada	3400 39 Avenue Northeast, Calgary, AB, Canada	boxes	\N	2026-01-02 06:39:00	cancelled	3.03	27.73	pending	\N	2026-01-02 06:39:34.223571	2026-01-02 06:58:15.314	{/objects/uploads/e86abcb0-6caa-4d3a-b067-9f9fc7c34637.jpg}	51.0808395	-114.0065776	51.09104869999999	-113.9886695	15.00	2.73	5.00	0.00	2026-01-02 06:39:34.204	\N	ground	stairs	f	1	0.00	5.00	0.00	27.73	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
d0514af0-1ac1-470c-903f-597c236ac4a7	7e454eca-11fc-4fe2-a4ce-2de1d894e137	\N	11435 8 St SW, Calgary, AB, Canada	191 Anaheim Circle Northeast, Calgary, AB, Canada	boxes	\N	2026-01-03 06:35:00	cancelled	29.21	50.66	pending	\N	2026-01-02 06:36:44.501116	2026-01-02 06:58:17.053	{/objects/uploads/c6c800d2-8412-4d08-9e9c-b359ff75e930.jpg}	50.951441	-114.083498	51.0885445	-113.9267899	15.00	26.29	5.00	0.00	2026-01-02 06:36:44.481	\N	basement	ground	f	1	10.00	0.00	0.00	56.29	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	10.00	5.63	First-move 10% discount	\N	\N	0.00	f
79ef413f-139d-4cd0-ad2d-f8cc4bb1c063	7e454eca-11fc-4fe2-a4ce-2de1d894e137	\N	261 Skyview Ranch Way, Calgary, AB, Canada	BMO Center stampede park calgary, 1912 Flores Ladue Parade SE, Calgary, AB, Canada	boxes	\N	2026-01-03 06:44:00	cancelled	26.31	53.68	pending	pi_3Sl26SRxppl2FbkT1tyIo7jF	2026-01-02 06:44:45.305153	2026-01-02 06:58:12.568	{/objects/uploads/011cd080-56d6-40bb-bae3-1aac137e2a5e.jpg}	51.1621336	-113.966236	51.0394472	-114.0563167	15.00	23.68	5.00	0.00	2026-01-02 06:44:45.285	\N	basement	ground	f	1	10.00	0.00	0.00	53.68	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
ee122851-a6df-43c0-a373-6efb64f366fe	bea15756-b2a3-405b-8834-3b7d224c67b5	2437c092-cd4a-4b58-826e-504858d822fa	10349 Cityscape Drive Northeast, Calgary, AB, Canada	4610 Hubalta Road Southeast #308, Calgary, AB T2B 2P3, Canada	medium	\N	2026-01-03 00:27:00	cancelled	19.44	69.30	succeeded	pi_3SlIgpRxppl2FbkT0K5iGlrO	2026-01-03 00:27:28.911232	2026-01-04 20:57:00.271	{/objects/uploads/54740fb6-a69b-49c6-921b-7e0308c5375b.jpg}	51.1442523	-113.9660178	51.027753	-113.9689835	30.00	24.30	15.00	0.00	2026-01-03 00:27:28.892	\N	ground	ground	t	1	0.00	0.00	0.00	69.30	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
07c63257-4036-4560-87c1-2e33e57e6a1a	1cf4ad96-9a77-4af4-8770-ca904e939a50	\N	1608 18 Avenue Northwest, Calgary, AB, Canada	927 25 Avenue Northwest, Calgary, AB, Canada	medium	\N	2026-07-11 16:00:00	pending_payment	1.61	69.86	pending	\N	2026-07-08 22:00:06.768868	2026-07-08 22:00:06.768868	{/objects/uploads/d6c90fa8-4c3c-4547-9afa-47cbd0058db4.png,/objects/uploads/c41d9342-01a0-47d5-b28d-20d9ed50a7c9.png}	51.0691208	-114.0977116	51.0745977	-114.0827811	20.00	2.90	9.84	0.00	2026-07-08 22:00:06.748	\N	stairs	ground	t	2	6.00	0.00	15.00	53.74	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
21058baf-da16-43fd-a551-9bda716d3f51	7e454eca-11fc-4fe2-a4ce-2de1d894e137	\N	261 Skyview Ranch Way, Calgary, AB, Canada	187 Anaheim Circle Northeast, Calgary, AB, Canada	boxes	\N	2026-01-03 06:59:00	payment_failed	17.00	55.30	failed	pi_3Sl2O4Rxppl2FbkT1g2J5KWd	2026-01-02 06:59:46.520742	2026-01-02 07:03:04.919	{/objects/uploads/be294e64-0e37-4906-aee0-50d40f21514a.jpg}	51.1621336	-113.966236	51.0885206	-113.9266397	15.00	15.30	5.00	0.00	2026-01-02 06:59:46.499	\N	basement	basement	f	1	10.00	10.00	0.00	55.30	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
c62d54e1-a721-44c7-9a73-09156c2a1792	6f8f7816-407d-4cf7-8dbe-a86798e048c8	\N	Cityscape Drive Northeast, Calgary, AB, Canada	2704 Brentwood Boulevard Northwest, Calgary, AB, Canada	large	\N	2026-01-04 21:00:00	payment_failed	18.41	104.66	failed	\N	2026-01-04 17:06:52.974771	2026-01-04 17:06:52.974771	{/objects/uploads/7d170e51-13c8-4c5f-843a-ae9d06b037c3.jpg}	51.1470642	-113.966213	51.0854274	-114.1228343	20.00	29.46	30.00	0.00	2026-01-04 17:06:52.955	\N	ground	basement	t	2	0.00	10.00	0.00	89.46	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	10.00	11.63	First-move 10% discount	\N	\N	0.00	f
71f31b14-3b7d-4f51-bbc7-7c442e826759	bea15756-b2a3-405b-8834-3b7d224c67b5	aa2cde65-b901-4fc5-895c-c8baad294a2e	4448 Front Street Southeast, Calgary, AB, Canada	4420 10 Street Northeast, Calgary, AB, Canada	large	\N	2025-12-07 23:00:00	cancelled	3.70	102.31	succeeded	pi_3SbUzpRphcrPZtHD0OJwHO0o	2025-12-06 21:43:21.763079	2026-01-04 20:57:00.271	{/objects/uploads/64d4caaa-7e0b-4481-a7b7-25e82119b014.jpg}	50.87806988645256	-114.22521182564795	50.88740029592412	-114.21423501861479	30.00	3.70	30.00	0.00	2025-12-06 21:43:21.743	\N	ground	ground	t	2	0.00	0.00	15.00	78.70	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
9d854498-a691-43c0-9530-61983c558d57	bea15756-b2a3-405b-8834-3b7d224c67b5	aa2cde65-b901-4fc5-895c-c8baad294a2e	164 Covepark Way Northeast, Calgary, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	2025-12-12 04:00:00	cancelled	8.87	122.45	succeeded	pi_3ScrC6RphcrPZtHD1DTlpPSr	2025-12-10 17:28:44.999449	2026-01-04 20:57:00.271	{/objects/uploads/ff305214-fedc-44be-ab95-305bfc763e2b.jpg}	51.1659013	-114.0550984	51.1442523	-113.9660178	40.00	14.19	0.00	0.00	2025-12-10 17:28:44.979	\N	basement	ground	t	2	10.00	0.00	0.00	94.19	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
ab33710c-04f2-46a7-834a-8cdd6c59a324	bea15756-b2a3-405b-8834-3b7d224c67b5	2437c092-cd4a-4b58-826e-504858d822fa	302 Elgin View Southeast, Calgary, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	2026-01-04 18:49:00	completed	36.42	108.27	succeeded	pi_3SlwNORxppl2FbkT0DQO0NDx	2026-01-04 18:50:02.656724	2026-01-04 21:14:19.203	{/objects/uploads/8b51ae01-a214-4263-9300-142427d9972f.jpeg}	50.9028223	-113.970222	51.1442523	-113.9660178	20.00	58.27	30.00	0.00	2026-01-04 18:50:02.636	\N	ground	ground	t	1	0.00	0.00	0.00	108.27	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	16.24	92.03	f	\N	0.00	0.00	\N	\N	\N	0.00	f
bdfef8db-909b-45f3-b92b-80786dbaff8d	bea15756-b2a3-405b-8834-3b7d224c67b5	26548dcf-bb3b-4b42-b11e-90adcae7f52f	13 Crystal Ridge Gate, Okotoks, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	2026-01-05 22:49:00	completed	56.79	140.86	succeeded	pi_3SmMr5Rxppl2FbkT1eYlhBpI	2026-01-05 22:49:17.146985	2026-01-06 00:00:00.05	{/objects/uploads/b56379b9-8f39-4ceb-b3c2-858b052e9854.jpeg}	50.7270986	-113.9531641	51.1442523	-113.9660178	20.00	90.86	30.00	0.00	2026-01-05 22:49:17.127	\N	ground	ground	t	1	0.00	0.00	0.00	140.86	\N	\N	\N	51.04271817957148	-113.93467655416013	2026-01-05 23:47:04.605	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
d5ad70ce-324a-40bf-ac77-22ed9a8b44b3	014395ad-5920-49dd-9291-a4189bb8ce9e	\N	253 Cityscape Boulevard Northeast, Calgary, AB, Canada	34 Sage Bluff Heights NW, Calgary, AB, Canada	boxes		2026-01-10 15:41:00	payment_failed	17.85	31.07	failed	\N	2026-01-10 20:41:42.232724	2026-01-10 21:05:58.651	{/objects/uploads/448460f4-7296-40cf-be1d-18ca1097810c.jpg}	51.1469759	-113.9617462	51.1781842	-114.1352468	10.00	16.07	5.00	0.00	2026-01-10 20:41:42.211	\N	ground	ground	f	1	0.00	0.00	0.00	31.07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	4.66	26.41	f	\N	0.00	0.00	\N	\N	\N	0.00	f
af491d8b-6ea6-4d0c-bf53-8ef5e4b1f4e6	a8e52fd4-a66a-46d3-9f17-19c18088e8f4	2e29a98e-4529-436a-a611-998981566645	1711 52 St. SE, Calgary, AB, Canada	4310 104 Avenue Northeast, Calgary, AB, Canada	boxes	I need to pick 4 boxes of chicken and turkey in Se. The drop off address is units 2114, 4310 104 ave NE\nJuk African and Caribbean food store 	2026-01-18 13:05:00	completed	19.52	32.57	succeeded	pi_3Sr2LzRxppl2FbkT1VJ17ENH	2026-01-18 20:08:45.185288	2026-01-18 23:26:25.086	{/objects/uploads/d3215025-16f6-41f4-beee-79e516789f14.jpg}	51.03895550000001	-113.959042	51.1478824	-113.9736544	10.00	17.57	5.00	0.00	2026-01-18 20:08:45.167	\N	ground	ground	f	1	0.00	0.00	0.00	32.57	\N	\N	\N	51.155881478858184	-113.95196124388042	2026-01-18 23:26:18.517	\N	\N	\N	\N	f	15.00	4.89	27.68	f	\N	0.00	0.00	\N	\N	\N	0.00	f
701f53be-a9ab-4b45-a90a-d0b27778b87c	1dd4c7e6-e5cb-4e12-9ac0-19b0d3974354	\N	Airport Road Northeast, Calgary, AB, Canada	308 4th Avenue Southwest, Calgary, AB, Canada	large	\N	2026-01-31 16:00:00	payment_failed	18.56	102.60	failed	\N	2026-01-26 00:03:43.0285	2026-01-26 00:03:43.0285	{/objects/uploads/fb3b5fd3-1e12-435b-93b0-15257e746954.webp}	51.133493	-114.004916	51.05010009999999	-114.0681814	20.00	29.70	30.00	0.00	2026-01-26 00:03:43.004	\N	ground	elevator	t	2	0.00	8.00	0.00	87.70	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	10.00	11.40	First-move 10% discount	\N	\N	0.00	f
920ddece-eadc-4806-b4d9-b8069a88579b	bea15756-b2a3-405b-8834-3b7d224c67b5	\N	2340 22 Street Northeast, Calgary, AB, Canada	MAYFAIR PLACE, 6707 Elbow Drive Southwest, Calgary, AB, Canada	medium	\N	2026-01-21 21:30:00	cancelled	15.78	49.72	pending	pi_3Ss8zQRxppl2FbkT0EXTDpeG	2026-01-21 21:30:49.811047	2026-01-21 22:22:55.335	{/objects/uploads/47fe499e-f38d-410e-af91-2346d777120f.jpg}	51.0728453	-114.0062506	50.9933329	-114.0842536	15.00	19.72	15.00	0.00	2026-01-21 21:30:49.788	\N	ground	ground	f	1	0.00	0.00	0.00	49.72	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	7.46	42.26	f	\N	0.00	0.00	\N	\N	\N	0.00	f
0a70cba1-6634-4498-bec1-3f61736102e6	b5799ff2-a70d-4bef-aed5-c289d9509792	\N	1777 1 Street Northeast, Calgary, AB, Canada	Olympic Way Southeast, Calgary, AB, Canada	large	\N	2026-01-27 23:51:00	payment_failed	3.41	74.24	failed	\N	2026-01-26 23:51:13.504388	2026-01-26 23:51:13.504388	{/objects/uploads/a52fc36b-fb27-445b-822d-d92c6f03cd8c.jpg}	51.0676378	-114.0602634	51.0411544	-114.0535127	20.00	5.46	30.00	0.00	2026-01-26 23:51:13.484	\N	ground	elevator	t	2	0.00	8.00	0.00	63.46	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	10.00	8.25	First-move 10% discount	\N	\N	0.00	f
85ac89ac-b9ee-4ec4-9e9b-b91d1cc78d4d	2cdd1c03-4421-4711-88c0-40e99865f5ed	605c6dad-cfed-43ba-99a1-8cb89c0516f8	10349 Cityscape Drive Northeast, Calgary, AB, Canada	14786 1 Street Northwest, Calgary, AB, Canada	large	\N	2026-08-05 17:17:00	completed	13.21	69.29	succeeded	pi_3U18SARxppl2FbkT1yqIUN0C	2026-08-05 17:18:02.218033	2026-08-05 20:09:47.529	{/objects/uploads/b1a81a00-cb2a-4f77-8467-f16008fb3c87.jpg}	51.1442523	-113.9660178	51.1860758	-114.0732106	20.00	23.78	25.51	0.00	2026-08-05 17:18:02.198	\N	ground	ground	t	1	0.00	0.00	0.00	69.29	\N	\N	\N	51.19094414208529	-114.04669257097795	2026-08-05 20:04:32.291	\N	\N	\N	\N	f	15.00	10.39	58.90	f	\N	0.00	0.00	\N	\N	\N	0.00	f
11161561-7b74-421e-915a-2ab1bbd1ad69	3724c9bc-c17c-46e4-91eb-c6763ab09999	2437c092-cd4a-4b58-826e-504858d822fa	315 50 Ave SW #105, Calgary, AB, Canada	5075 26 Ave SE, Calgary, AB, Canada	apartment	\N	2026-04-26 20:00:00	completed	13.71	210.74	succeeded	pi_3TQFUFRxppl2FbkT0YcIMa0s	2026-04-25 23:18:37.27351	2026-04-27 04:03:01.693	{/objects/uploads/af31bc3a-b184-4afd-8325-1357583c32eb.jpg,/objects/uploads/e33b096f-0886-4dd4-96da-3964c6501db6.jpg,/objects/uploads/a4258383-7749-4454-9c34-0230cf908986.jpg,/objects/uploads/3eafca6e-4285-4722-97ef-0a8ea32df96d.jpg,/objects/uploads/dc51188d-1f2a-49a6-905d-bf533cdeccd7.jpg,/objects/uploads/59abc587-1dab-4ac6-b0ee-850b84fc48d6.jpg,/objects/uploads/98387d4d-0c62-43d0-a37c-ba8b9b8b6aea.jpeg}	51.0084307	-114.0707171	51.03026209999999	-113.9596065	48.00	32.90	61.73	0.00	2026-04-25 23:18:37.253	\N	ground	ground	t	2	0.00	0.00	0.00	202.64	\N	\N	\N	51.147133876169754	-113.92642585531765	2026-04-27 04:02:56.697	\N	\N	\N	\N	f	15.00	31.61	179.13	f	\N	20.00	52.69	LERVIT20 promo - 20% off (1 use remaining)	\N	LERVIT20	44.79	f
d3d9252c-c2ca-4f4c-a100-9fed17ceb209	5e33efa5-cfb6-4083-9860-61668eb028f3	\N	180 Calhoun Common NE, Calgary, AB T3P 1T3	85b Savanna Link Northeast, Calgary, AB, Canada	medium	\N	2026-08-07 20:30:00	pending_payment	13.51	51.97	pending	\N	2026-08-07 20:26:00.307297	2026-08-07 20:26:00.307297	{/objects/uploads/fab6cc48-aaaa-4097-ab6c-183724562d19.jpg}	51.1861994	-114.0491965	51.1385476	-113.9623352	20.00	24.32	7.65	0.00	2026-08-07 20:26:00.287	\N	ground	ground	t	1	0.00	0.00	0.00	51.97	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	bea15756-b2a3-405b-8834-3b7d224c67b5	a003a8cb-58c2-4b66-8154-17cc72c46e56	237 Bridlewood Lane Southwest, Southwest Calgary, Calgary, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	2026-02-05 19:58:00	completed	46.24	123.98	succeeded	pi_3SxYhuRxppl2FbkT0SPmz6T6	2026-02-05 19:59:05.552552	2026-02-05 21:51:45.025	{/objects/uploads/b7aa2eb1-7d4a-4b57-a843-2c5b6994b848.jpg}	50.89606819999999	-114.1001621	51.1442523	-113.9660178	20.00	73.98	30.00	0.00	2026-02-05 19:59:05.531	\N	ground	ground	t	1	0.00	0.00	0.00	123.98	\N	\N	\N	51.14420880887268	-113.96618020739574	2026-02-05 21:48:24.271	\N	\N	\N	\N	f	15.00	18.60	105.38	f	\N	0.00	0.00	\N	\N	\N	0.00	f
ffc36ceb-21d1-47a0-97cf-1563428a8cb0	ac43dfba-a25b-4da5-a433-92ad09a23e0b	aa2cde65-b901-4fc5-895c-c8baad294a2e	10349 Cityscape Dr NE, Calgary, AB T3N 1N5, Canada	25 Belvedere Park Southeast, Calgary, AB, Canada	large	\N	2026-05-05 16:29:00	completed	17.30	76.15	succeeded	pi_3TTlroRxppl2FbkT045h13Pp	2026-05-05 16:30:21.385111	2026-05-05 18:54:56.647	{/objects/uploads/61b3a38c-7b6b-41f1-aa96-c0015c23880f.jpeg}	51.1442523	-113.9660178	51.0397946	-113.9066526	18.00	25.95	19.68	0.00	2026-05-05 16:30:21.365	\N	ground	elevator	t	2	0.00	9.60	0.00	73.23	\N	\N	\N	51.04021219894238	-113.90584779328935	2026-05-05 18:02:47.33	\N	\N	\N	\N	f	15.00	11.42	64.73	f	\N	20.00	19.04	LERVIT20 promo - 20% off (1 use remaining)	\N	LERVIT20	16.18	f
53b35671-65f9-4c35-9d69-f00536754c34	1cf4ad96-9a77-4af4-8770-ca904e939a50	\N	1608 18 Avenue Northwest, Calgary, AB, Canada	927 25 Avenue Northwest, Calgary, AB, Canada	medium	\N	2026-07-11 16:00:00	pending_payment	1.61	62.06	pending	pi_3Tr3TRRxppl2FbkT1it6i2zz	2026-07-08 21:02:33.734878	2026-07-08 21:57:46.096	{/objects/uploads/5e3f1c9b-08cb-4677-ae65-d399c54d4d08.png,/objects/uploads/157e601a-bd02-4b5f-96ed-e91df3c123db.png}	51.0691208	-114.0977116	51.0745977	-114.0827811	20.00	2.90	9.84	0.00	2026-07-08 21:02:33.716	\N	ground	ground	t	2	0.00	0.00	15.00	47.74	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	9.31	52.75	f	\N	0.00	0.00	\N	\N	\N	0.00	f
ef3411ba-5b1c-494f-b753-314ff8b5bc46	bea15756-b2a3-405b-8834-3b7d224c67b5	\N	10349 Cityscape Dr NE, Calgary, AB T3N 2A1, Canada	10441 25 Street Northeast, Calgary, AB, Canada	large	\N	2026-08-07 14:27:00	cancelled	5.38	71.76	cancelled	pi_3U1okDRxppl2FbkT02x4dhaN	2026-08-07 14:27:28.26284	2026-08-07 21:13:11.74	{/objects/uploads/64137db1-6331-43a2-9436-98bd9c6ea16c.jpeg}	51.1442523	-113.9660178	51.1489011	-114.0006076	20.00	9.68	25.51	0.00	2026-08-07 14:27:28.24	\N	ground	ground	t	2	0.00	0.00	0.00	55.20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	10.76	61.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
32e361d9-afa5-458c-ac10-498d6d509b7a	bea15756-b2a3-405b-8834-3b7d224c67b5	\N	3202 1 St SW, Calgary, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	boxes	\N	2026-07-11 21:25:00	cancelled	25.13	45.14	succeeded	pi_3Ts8P3Rxppl2FbkT0GJlGL5G	2026-07-11 21:25:37.167544	2026-07-11 22:09:22.201	{/objects/uploads/2a6cec7a-5258-4ee3-99d6-e411f6d5b33f.jpg}	51.0261383	-114.0667426	51.1442523	-113.9660178	12.00	27.14	6.00	0.00	2026-07-11 21:25:37.148	\N	ground	ground	f	1	0.00	0.00	0.00	45.14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	6.77	38.37	f	\N	0.00	0.00	\N	\N	\N	0.00	f
5c653d68-23c8-4d1a-835d-7bed22ee5a95	bea15756-b2a3-405b-8834-3b7d224c67b5	605c6dad-cfed-43ba-99a1-8cb89c0516f8	425 36 Ave NW, Calgary, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	2026-07-10 18:43:00	completed	15.17	101.42	succeeded	pi_3TrjPwRxppl2FbkT0vxZaewd	2026-07-10 18:44:50.354176	2026-07-10 20:00:46.4	{/objects/uploads/7ac7be24-17e1-446d-99b3-54e42061d125.jpeg}	51.0848485	-114.0696091	51.1442523	-113.9660178	20.00	27.31	20.71	0.00	2026-07-10 18:44:50.336	\N	ground	ground	t	2	0.00	0.00	10.00	78.02	\N	\N	\N	51.14419600784022	-113.96564168281894	2026-07-10 20:00:44.385	\N	\N	\N	\N	f	15.00	15.21	86.21	f	\N	0.00	0.00	\N	\N	\N	0.00	f
d86cbb19-c971-401c-a4ab-eba90424e4b6	02073e48-8786-455f-96ec-789cfb40b633	1abbfcc3-03d0-4887-a557-54cda5dddf19	4523 75 Street Northwest, Calgary, AB, Canada	14540 1 Street Northwest, Calgary, AB, Canada	large	\N	2026-07-12 03:00:00	completed	21.75	71.57	succeeded	pi_3TsDdbRxppl2FbkT1uz2usAZ	2026-07-12 03:00:55.382773	2026-07-12 05:41:21.464	{/objects/uploads/e7e57174-93ca-44fd-b14c-260cae13c714.jpg}	51.0914734	-114.1988991	51.184103	-114.0727476	20.00	39.15	20.71	0.00	2026-07-12 03:00:55.364	\N	ground	elevator	t	1	0.00	9.60	0.00	89.46	\N	\N	\N	51.189189189189186	-114.0732327832257	2026-07-12 05:40:20.598	\N	\N	\N	\N	f	15.00	10.74	60.83	f	\N	20.00	17.89	LERVIT20 promo - 20% off (0 uses remaining)	\N	LERVIT20	15.21	f
6ac14c1a-838e-4b99-943a-457e970be405	50d5c5cf-d522-4aff-a090-2f317304e556	605c6dad-cfed-43ba-99a1-8cb89c0516f8	10349 Cityscape Drive Northeast, Calgary, AB, Canada	194 Cornerstone Avenue Northeast, Calgary, AB, Canada	large	\N	2026-07-29 01:22:00	completed	3.53	47.07	succeeded	pi_3TyMD0Rxppl2FbkT1khtJtjC	2026-07-29 01:22:42.174235	2026-07-29 02:11:39.624	{/objects/uploads/68ba061e-3c57-48c0-8630-a8ef00667518.jpg}	51.1442523	-113.9660178	51.1611938	-113.9416155	20.00	6.35	20.71	0.00	2026-07-29 01:22:42.155	\N	ground	ground	t	1	0.00	0.00	0.00	47.07	\N	\N	\N	51.16101473289373	-113.94177573113589	2026-07-29 02:04:18.977	\N	\N	\N	\N	f	15.00	7.06	40.01	f	\N	0.00	0.00	\N	\N	\N	0.00	f
a32f4978-535c-4639-a58d-113add6fd860	ac72e389-defb-4204-baa1-c291b6d3fb5f	a003a8cb-58c2-4b66-8154-17cc72c46e56	95 Skyview close NE 	40 Livingston Parade NE 	large	\N	2026-02-28 18:00:00	completed	10.02	77.24	succeeded	pi_3T5i2xRxppl2FbkT0YboM9wJ	2026-02-28 07:33:52.840401	2026-02-28 21:20:24.535	{/objects/uploads/f4e3be99-8ec5-44a6-8be2-52eeea759ac0.heic,/objects/uploads/a37e7a89-26a6-444f-9bda-7f025e82a489.heic,/objects/uploads/18bb8462-4f77-41e5-9b61-ec5f90820aa4.heic,/objects/uploads/af54f8b8-6a6f-4ac0-a17d-86b84d98b2d9.heic,/objects/uploads/13b691ac-bf15-4a29-af54-2a5bf4edc520.heic}	51.17657411871319	-113.87403037592956	51.104102360552226	-113.95929141316995	20.00	16.03	13.38	0.00	2026-02-28 07:33:52.819	\N	stairs	stairs	t	2	5.00	5.00	0.00	59.41	\N	\N	\N	51.185855898122476	-114.07005686323537	2026-02-28 21:20:22.292	\N	\N	\N	\N	f	15.00	11.59	65.65	f	\N	0.00	0.00	\N	\N	\N	0.00	f
4eb15b25-2b65-4397-a6c0-92065c8da2fa	6ea5f58e-1c64-4074-a426-b30ac60e5097	f7f7a53f-fb27-4301-9d9d-a051544be171	10349 Cityscape Drive Northeast, Calgary, AB, Canada	183 Auburn Bay Avenue Southeast, Calgary, AB, Canada	large	\N	2026-04-16 15:00:00	completed	35.25	120.98	succeeded	pi_3TMdaURxppl2FbkT0Vy2wQSP	2026-04-16 00:15:12.212572	2026-04-16 03:00:36.276	{/objects/uploads/069b24ed-d0f2-451d-8c3d-ae48ea0241bb.jpg}	51.1442523	-113.9660178	50.89275800000001	-113.9554976	24.00	67.68	18.64	0.00	2026-04-16 00:15:12.191	\N	ground	stairs	t	2	0.00	6.00	0.00	116.32	\N	\N	\N	50.8851867036957	-113.95687867397011	2026-04-16 03:00:36.276	\N	\N	\N	\N	f	15.00	18.15	102.83	f	\N	20.00	30.24	LERVIT20 promo - 20% off (1 use remaining)	\N	LERVIT20	25.70	f
146e4a91-b9f4-44fd-825f-72538a508811	806ed749-27ad-40bf-b7b8-ce16ea0abaf2	\N	516 Northmount Place Northwest, Calgary, AB, Canada	10349 Cityscape Drive Northeast, Calgary, AB, Canada	large	\N	2026-04-11 23:00:00	payment_failed	12.51	102.26	failed	\N	2026-04-11 20:18:33.452684	2026-04-11 20:18:33.452684	{/objects/uploads/43acc73a-57ef-41c5-8b4f-9b1dcb58395c.jpg}	51.1029748	-114.0725279	51.1442523	-113.9660178	24.00	24.02	18.64	0.00	2026-04-11 20:18:33.431	\N	basement	ground	t	2	12.00	0.00	0.00	78.66	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
844d12be-9706-4e1b-892f-45851cf0ab70	02073e48-8786-455f-96ec-789cfb40b633	\N	10349 Cityscape Drive Northeast, Calgary, AB, Canada	291 Nolanhurst Crescent Northwest, Calgary, AB, Canada	large	\N	2026-04-12 17:40:00	cancelled	22.08	110.54	pending	pi_3TLRoqRxppl2FbkT0NLt7rYP	2026-04-12 17:28:35.514856	2026-04-12 17:33:39.085	{/objects/uploads/435072e1-30d2-43e7-b3c4-59086a2590d5.jpeg}	51.1442523	-113.9660178	51.1783671	-114.1747212	24.00	42.39	18.64	0.00	2026-04-12 17:28:35.495	\N	ground	ground	t	2	0.00	0.00	0.00	85.03	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	16.58	93.96	f	\N	0.00	0.00	\N	\N	\N	0.00	f
2aac34d5-1d66-4724-8437-6aeb6d76b559	fcb9627c-280b-4fa3-a84e-7334b55aece3	1b901406-1947-49ba-80a9-3e8a477c8957	7180 80 Ave NE, Calgary, AB, Canada	395 Skyview Parkway Northeast, Calgary, AB, Canada	large	\N	2026-04-27 01:00:00	completed	6.57	82.07	succeeded	pi_3TQcO1Rxppl2FbkT06Qs6Haj	2026-04-26 23:46:46.163104	2026-04-27 02:37:12.374	{/objects/uploads/47ec35b7-82a9-4d34-9410-dc388b3dcf6a.jpg}	51.1255634	-113.932215	51.1517403	-113.9535902	18.00	9.86	19.68	0.00	2026-04-26 23:46:46.144	\N	stairs	elevator	t	2	6.00	9.60	0.00	63.13	\N	\N	\N	51.15118546983605	-113.95287012827211	2026-04-27 02:37:09.643	\N	\N	\N	\N	f	15.00	12.31	69.76	f	\N	0.00	0.00	\N	\N	\N	0.00	f
c8d1754c-016d-4c3e-bbf6-60d48da9062e	cd7e2137-ec2d-4248-8e4a-cc7074256a0f	\N	4736 17 Avenue Northwest, Calgary, AB, Canada	70 Saddlepeace Manor Northeast, Calgary, AB, Canada	large	\N	2026-05-02 18:33:00	payment_failed	21.79	83.16	failed	\N	2026-05-02 18:33:55.537799	2026-05-02 18:33:55.537799	{/objects/uploads/5ec68856-3379-4178-bceb-a02ce7f57af6.jpeg}	51.0731782	-114.1625964	51.1313403	-113.9662138	18.00	32.69	19.68	0.00	2026-05-02 18:33:55.518	\N	ground	elevator	t	2	0.00	9.60	0.00	79.96	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	20.00	20.79	LERVIT20 promo - 20% off (1 use remaining)	\N	LERVIT20	17.67	f
af96a642-2419-4b11-88de-b1a2902984f5	02073e48-8786-455f-96ec-789cfb40b633	64d3cbb5-bba3-429c-9d4a-cdd69237152c	10349 Cityscape Drive Northeast, Calgary, AB, Canada	291 Nolanhurst Crescent Northwest, Calgary, AB, Canada	large	\N	2026-04-12 17:40:00	completed	22.08	68.02	succeeded	pi_3TLRreRxppl2FbkT04ZeT02m	2026-04-12 17:32:02.761113	2026-04-12 19:05:34.548	{/objects/uploads/c1e47027-d390-4d61-a07b-f77109d1166a.jpeg}	51.1442523	-113.9660178	51.1783671	-114.1747212	24.00	42.39	18.64	0.00	2026-04-12 17:32:02.742	\N	ground	ground	t	1	0.00	0.00	0.00	85.03	\N	\N	\N	51.1830695784154	-114.16829863900517	2026-04-12 19:05:33.387	\N	\N	\N	\N	f	15.00	10.20	57.82	f	\N	20.00	17.01	LERVIT20 promo - 20% off (1 use remaining)	\N	LERVIT20	14.46	f
f540f733-a278-4230-8b64-0bd6c09de586	cd7e2137-ec2d-4248-8e4a-cc7074256a0f	\N	4736 17 Avenue Northwest, Calgary, AB, Canada	70 Saddlepeace Manor Northeast, Calgary, AB, Canada	large	\N	2026-05-02 18:33:00	payment_failed	21.79	103.95	failed	\N	2026-05-02 18:33:32.661124	2026-05-02 18:33:32.661124	{/objects/uploads/5ec68856-3379-4178-bceb-a02ce7f57af6.jpeg}	51.0731782	-114.1625964	51.1313403	-113.9662138	18.00	32.69	19.68	0.00	2026-05-02 18:33:32.642	\N	ground	elevator	t	2	0.00	9.60	0.00	79.96	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	0.00	0.00	f	\N	0.00	0.00	\N	\N	\N	0.00	f
763dbbae-612d-4668-b16a-55582e9f92ef	5e33efa5-cfb6-4083-9860-61668eb028f3	605c6dad-cfed-43ba-99a1-8cb89c0516f8	180 Calhoun Common NE, Calgary, AB T3P 1T3	85b Savanna Link Northeast, Calgary, AB, Canada	medium	\N	2026-08-07 20:30:00	completed	13.51	51.97	succeeded	pi_3U1uRDRxppl2FbkT1f6ynEiQ	2026-08-07 20:32:13.955709	2026-08-07 21:58:45.582	{/objects/uploads/fab6cc48-aaaa-4097-ab6c-183724562d19.jpg}	51.1861994	-114.0491965	51.1385476	-113.9623352	20.00	24.32	7.65	0.00	2026-08-07 20:32:13.937	\N	ground	ground	t	1	0.00	0.00	0.00	51.97	\N	\N	\N	51.13863477310279	-113.96208109903678	2026-08-07 21:58:45.156	\N	\N	\N	\N	f	15.00	7.80	44.17	f	\N	0.00	0.00	\N	\N	\N	0.00	f
24376126-5a19-4a17-bd08-117a73a68c5c	008bbd4d-55f1-4b6c-aafd-b9908cfffcdc	1abbfcc3-03d0-4887-a557-54cda5dddf19	Crowsnest Hall, 250 Collegiate Blvd NW, Calgary, AB T2N 5A6, Canada	5256 19 Ave NW, Calgary, AB T3B 0T2, Canada	medium	\N	2026-08-15 21:00:00	completed	3.07	44.33	succeeded	pi_3U309LRxppl2FbkT1C66asSY	2026-08-10 20:48:11.953155	2026-08-15 22:30:36.682	{/objects/uploads/84bea40f-4bbd-4082-a52e-0f3e8c119dbe.jpg,/objects/uploads/7b04dff5-f22e-45c6-8834-46eda76315ce.jpg}	51.0789939	-114.1351655	51.0789898	-114.1667317	20.00	5.53	14.13	0.00	2026-08-10 20:48:11.934	\N	elevator	ground	t	1	9.60	0.00	0.00	49.26	\N	\N	\N	51.08108108108108	-114.17931622443004	2026-08-15 22:30:09.974	\N	\N	\N	\N	f	15.00	6.65	37.68	f	\N	10.00	4.93	LERVIT10 promo - 10% off (first Move discount)	\N	LERVIT10	4.19	f
32d5a107-1f38-4465-9b4b-ffd492d10f5f	446c5dfe-bd26-4387-aa1a-af333b7e503a	\N	450 Carringvue Grove Northwest, Calgary, AB, Canada	743 Livingston Way Northeast, Balzac, AB, Canada	large		2026-08-30 22:00:00	cancelled	2.25	119.67	cancelled	pi_3U9VavRxppl2FbkT1xj05sP8	2026-08-28 19:34:20.646877	2026-08-28 19:38:50.558	{/objects/uploads/10ce145d-5ace-4acc-a85a-ea0c3883182f.jpg,/objects/uploads/053474b4-d829-40ef-a4a8-3d217c8609e0.jpg,/objects/uploads/0590cdcc-eb3d-4e86-bd99-56589efdf59f.jpg,/objects/uploads/434dc0be-e112-4087-8c9f-f0cfdab8d9ab.jpg,/objects/uploads/c03a8246-eedb-4038-8831-27ecfc3f9c73.jpg,/objects/uploads/7294aa17-8e4a-4a4d-aa96-6fc005328c5a.jpg}	51.17789879999999	-114.0772395	51.18463449999999	-114.0563856	20.00	4.05	58.00	0.00	2026-08-28 19:34:20.628	\N	ground	ground	t	2	0.00	0.00	10.00	92.05	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	17.95	101.72	f	\N	0.00	0.00	\N	\N	\N	0.00	f
be06ce8a-b02e-4106-834d-3e65d4f07883	fb6f03ed-996c-482c-8312-934d14a9d630	e55370ff-6128-4b54-96d7-6b97faa1e305	40 Kingsland Pl SW, Calgary, AB, Canada	923 15 Ave SW, Calgary, AB, Canada	medium	\N	2026-09-01 21:30:00	confirmed	7.31	67.96	succeeded	pi_3UAgvJRxppl2FbkT1eKBq3lD	2026-09-01 01:55:13.422406	2026-09-01 03:14:05.727	{/objects/uploads/8bb0b69c-985d-4eae-a1cf-eeaa938300a8.jpg,/objects/uploads/2f24b0df-8416-4f23-a488-7893626bd3ef.jpg,/objects/uploads/f0130898-720d-4524-b1ac-9b8d94b146b5.jpg,/objects/uploads/9cc8cd70-2be0-4412-932d-49ca16251fea.jpg}	50.9853932	-114.0803068	51.0389825	-114.0829111	20.00	13.16	9.32	0.00	2026-09-01 01:55:13.403	\N	stairs	elevator	f	2	6.00	9.60	0.00	58.08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	15.00	10.19	57.77	f	\N	10.00	7.55	LERVIT10 promo - 10% off (first Move discount)	\N	LERVIT10	6.42	f
0e07fbd6-fb32-4924-86a0-c87d3b47b294	446c5dfe-bd26-4387-aa1a-af333b7e503a	605c6dad-cfed-43ba-99a1-8cb89c0516f8	450 Carringvue Grove Northwest, Calgary, AB, Canada	743 Livingston Way Northeast, Balzac, AB, Canada	large	\N	2026-08-30 22:00:00	completed	2.25	95.68	succeeded	pi_3U9Vf0Rxppl2FbkT0njNrcrz	2026-08-28 19:41:53.708162	2026-09-01 04:21:44.538	{/objects/uploads/4fc99044-8437-42d4-8c9e-d316a782ee75.jpg,/objects/uploads/9c977ad7-c440-4c05-9313-b2c5c0281657.jpg,/objects/uploads/e27b0cd6-359d-4591-b333-3d8ed3c60423.jpg,/objects/uploads/3c1937cc-a99c-48c3-bd54-59d7ab22252a.jpg,/objects/uploads/b72d3566-a991-493c-a69c-f9b4d22c17f6.jpg}	51.17789879999999	-114.0772395	51.18463449999999	-114.0563856	20.00	4.05	27.72	0.00	2026-08-28 19:41:53.687	\N	ground	ground	t	2	0.00	0.00	30.00	81.77	\N	\N	\N	51.14425027009849	-113.96602892471897	2026-09-01 04:21:44.538	\N	\N	\N	\N	f	15.00	14.35	81.33	f	\N	10.00	10.63	LERVIT10 promo - 10% off (first Move discount)	\N	LERVIT10	9.04	f
\.


--
-- Data for Name: compliance_docs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.compliance_docs (id, partner_id, doc_type, file_url, file_name, file_size, expiry_date, review_status, review_notes, reviewed_by, reviewed_at, uploaded_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: coverage_zones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.coverage_zones (id, partner_id, zone_name, city, province, postal_code_prefixes, service_radius_km, operating_hours_start, operating_hours_end, operating_days, same_day_available, supported_vehicle_classes, supported_load_sizes, excluded_categories, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: email_campaigns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_campaigns (id, subject, content, type, audience_type, recipient_ids, recipient_count, sent_by, status, sent_at, created_at) FROM stdin;
8fc29529-35c8-4cd9-bd1c-8527e2609f5b	Welcome to LervIT - Your Moving Partner	We're excited to have you join LervIT! Whether you're moving across town or need help with a delivery, our trusted movers are here to help.\n\nHere's what you can do:\n- Request a move in minutes\n- Get matched with verified movers\n- Track your move in real-time\n\nGet started today!\n\nFrom the LervIT Team\n\nQuestions? Contact us at support@lervit.com	news	specific	{568683dc-b8bb-47c2-8b63-02823ca4409b,ed09e63f-d510-4b13-ab65-cb976c9f5145,b23e5c31-ac7a-425a-aeed-b595c4e4b834,31d181d0-796d-45b2-9b9c-503ea60f50cb,3d67e96a-ad34-4eec-8830-8c9a699a41f5,905344d1-9b84-4eca-a3b2-2227b25ccd83}	6	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2025-12-14 02:32:17.308	2025-12-14 02:32:16.377388
876a22b6-a1b9-4692-a3ad-d896ac66b1f0	Welcome to LervIT - Your Moving Partner	We're excited to have you join LervIT! Whether you're moving across town or need help with a delivery, our trusted movers are here to help.\n\nHere's what you can do:\n- Request a move in minutes\n- Get matched with verified movers\n- Track your move in real-time\n\nGet started today!\n\nFrom the LervIT Team\n\nQuestions? Contact us at support@lervit.com	news	specific	{bea15756-b2a3-405b-8834-3b7d224c67b5}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2025-12-14 02:33:13.141	2025-12-14 02:33:12.953822
c3a264f4-4b61-43fe-9d0e-4de095a814a6	Welcome to LervIT - Your Moving Partner	We're excited to have you join LervIT! Whether you're moving across town or need help with a delivery, our trusted movers are here to help.\n\nHere's what you can do:\n- Request a move in minutes\n- Get matched with verified movers\n- Track your move in real-time\n\nGet started today!\n\nFrom the LervIT Team\n\nQuestions? Contact us at support@lervit.com	news	specific	{d9ba6e2a-56d4-4a98-b3b1-3122001beb0d}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2025-12-14 02:48:39.998	2025-12-14 02:48:39.716179
dde0203e-5948-4d42-8478-e85c5a2e76ee	Welcome to LervIT - Your Moving Partner	We're excited to have you join LervIT! Whether you're moving across town or need help with a delivery, our trusted movers are here to help.\n\nHere's what you can do:\n- Request a move in minutes\n- Get matched with verified movers\n- Track your move in real-time\n\nGet started today!\n\nFrom the LervIT Team\n\nQuestions? Contact us at support@lervit.com	news	specific	{bea15756-b2a3-405b-8834-3b7d224c67b5}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2025-12-14 02:49:18.463	2025-12-14 02:49:18.242269
f0df99ee-2ede-4d4f-b4f7-9157916a50bd	Welcome to LervIT - Your Moving Partner	Hello Ken,\n\nWe're excited to have you join LervIT! Whether you're moving across town or need help with a delivery, our trusted movers are here to help.\n\nHere's what you can do:\n- Request a move in minutes\n- Get matched with verified movers\n- Track your move in real-time\n\nGet started today!\n\nFrom the LervIT Team\n\nQuestions? Contact us at support@lervit.com	news	specific	{d9ba6e2a-56d4-4a98-b3b1-3122001beb0d}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2025-12-16 05:05:14.122	2025-12-16 05:05:13.826138
e4479f27-0c13-4584-937d-f2fa3010e983	 Help Updating Your Lervit Account Type	Hi Justus,\n\nIt looks like your account was created as a Customer instead of a Mover. No worries — we can help fix that.\n\nPlease reply to this email to confirm you’d like your account updated to Mover, and we’ll take care of it right away.\n\nIf you have any questions, please don't hesitate to let us know.\n\nBest regards,\nLervit Support Team\nsupport@lervit.com	account_update	specific	{c8930b20-e428-4e25-87b9-f79bff41bec3}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2025-12-17 01:35:12.847	2025-12-17 01:35:12.563821
7dd1aa93-dc39-4003-a908-6657d28dbbb1	Almost There! Finish Your LervIT Mover Profile.	\n\nThanks for signing up to drive with LervIT!!\n\nWe noticed your mover profile isn’t fully completed yet, so you’re just one quick step away from getting matched with jobs.\n\nIt only takes a few minutes to finish setting things up — once you’re done, you’ll be ready to start receiving local moving and delivery requests.\n\n👉 Complete your profile here:\n[Insert Mover Profile Link]\n\nIf you run into any issues or have questions, just reply to this email, and we’ll be happy to help.\n\nLooking forward to having you on the road with us!\n\nBest regards,\n\nLervIT Support Team\nsupport@lervit.com	account_update	specific	{38fa65dc-8d0e-488b-888c-8e0d030a370f}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2025-12-17 20:21:41.383	2025-12-17 20:21:41.07701
fa8a5be4-24c9-4a8a-8354-7e551a972232	Almost There! Finish Your LervIT Mover Profile	\nThanks for signing up to drive with LervIT!\n\nWe noticed your mover profile isn’t fully completed yet, so you’re just one quick step away from getting matched with jobs.\n\nIt only takes a few minutes to finish setting things up — once you’re done, you’ll be ready to start receiving local moving and delivery requests.\n\nComplete your profile here:\nhttps://app.lervit.com/mover-profile\n\nIf you run into any issues or have questions, just reply to this email, and we’ll be happy to help.\n\nLooking forward to having you on the road with us!\n\nBest,\n\nLervIT Support Team\nsupport@lervit.com\n	account_update	movers	{4b3c1688-3f1b-4138-ad0e-d39c8cc5ef08,a3e3a896-7063-45f6-84e1-1cb0e252675e,a597a226-387a-4c13-b5e7-61230779e9a1,5bfb9a7d-9bdb-4b98-8089-83cc81ad067e,63b9d475-4715-4717-a87e-63c7d7dfabb6,38fa65dc-8d0e-488b-888c-8e0d030a370f,c8930b20-e428-4e25-87b9-f79bff41bec3}	7	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2025-12-17 20:29:29.442	2025-12-17 20:29:28.274498
7cbefe3c-b347-41e3-9cea-c30235f4aebb	Friendly Reminder — Complete Your Lervit Mover Profile.	\nJust a quick reminder from the Lervit team.\n\nYou’ve successfully signed up as a mover, but your profile isn’t fully completed yet. Completing it helps us match you with local moving and delivery jobs that fit your vehicle and availability.\n\nIt only takes a few minutes. If you’ve already completed it, you can ignore this message. If you need any help, just reply; we’re happy to assist.\n\nThanks, and we hope to get you matched soon!\n\nBest Regards,\n\nLervit Support Team\nsupport@lervit.com	account_update	movers	{38fa65dc-8d0e-488b-888c-8e0d030a370f,a3e3a896-7063-45f6-84e1-1cb0e252675e,a597a226-387a-4c13-b5e7-61230779e9a1,5bfb9a7d-9bdb-4b98-8089-83cc81ad067e,63b9d475-4715-4717-a87e-63c7d7dfabb6,c8930b20-e428-4e25-87b9-f79bff41bec3}	6	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2025-12-19 04:51:55.417	2025-12-19 04:51:54.533117
ea44fbfb-f527-4824-87a3-0acacd46bd91	Help Updating Your LervIT Account Type	Hello Mick,\n\nFrom us at LervIT we wish you a happy new year!! We noticed there have been less activity on your account and the system has not matched you to any move. \n\nHere is a quick fix, update your mover profile by uploading a clear mover photo, Plate Number, Vehicle colour and photo and proceed to save. The system will recognise the action as complete and begin matching you with moves. Hope this Helps.\n\nIf you have any questions, feel free to let us know.\n\nBest regards,\nLervIT Support Team\nsupport@lervit.com	account_update	specific	{5bfb9a7d-9bdb-4b98-8089-83cc81ad067e}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-01-04 05:03:45.843	2026-01-04 05:03:45.541532
3fae33ab-c033-49fa-9405-acf91a503c73	Welcome to LervIT -  Complete your Lervit profile to start getting jobs	\nHi [First Name],\n\nWelcome to Lervit — thanks for signing up.\n\nTo start receiving job requests, please take a moment to complete your mover profile in the app. We just need a few remaining details:\n\n*Profile photo\n*Vehicle photo\n*License plate number\n*Vehicle details (type & capacity)\n\nThis helps us verify your account and accurately match you to jobs.\n\nComplete your profile here: https://app.lervit.com\n\nIf you have any questions or need help, feel free to reply to this email.\n\nLooking forward to getting you your first job on Lervit.\n\nBest regards,\n\nJohn E.\nFounder, Lervit\nhttps://lervit.com\n\n	news	specific	{0e6e000b-ea4c-4a40-8d9c-237f865633ba,bcd90e7c-f434-48d4-9bda-02c3f019fd8e}	2	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-01-06 18:57:37.225	2026-01-06 18:57:36.817966
213ef275-840e-44fe-ab1d-37d3edddab31	New Feature: Real-Time Move Tracking	We're excited to announce our latest feature - Real-Time Move Tracking!\n\nNow you can:\n- Track your mover's location live\n- Get accurate ETAs\n- Receive instant updates\n\nTry it on your next booking!\n\nFrom the LervIT Team\n\nQuestions? Contact us at support@lervit.com	news	specific	{bea15756-b2a3-405b-8834-3b7d224c67b5}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-01-06 22:38:07.014	2026-01-06 22:38:06.722242
d8d56e71-9642-4696-a3d0-784965f40716	Help Updating Your LervIT Mover Profile	Hi [First Name],\n\nWe hope you’re doing well.\n\nWe noticed that your Lervit mover profile is not yet fully completed. As a result, your profile may not be visible to customers, and you may not receive job requests.\n\nTo make this easy, we’ve created a short video that walks you through how to complete your profile step by step:\n\nCompleting your profile helps customers identify you and ensures accurate job matching. You’ll be guided to upload:\n\n1. A clear profile photo\n\n2. Your vehicle details\n\n3. A vehicle photo and license plate\n\nOnce these steps are completed, your profile will become eligible for verification and increased visibility on the platform.\n\nIf you have any questions or need assistance, please reply to this email — our support team is happy to help.\n\nThank you for being part of Lervit.\n\nKind regards,\nLervit Support Team	account_update	specific	{4f58bec8-80c9-40af-af80-697b7e9c1092,5bfb9a7d-9bdb-4b98-8089-83cc81ad067e,0e6e000b-ea4c-4a40-8d9c-237f865633ba,a597a226-387a-4c13-b5e7-61230779e9a1,bcd90e7c-f434-48d4-9bda-02c3f019fd8e,344cb1d8-88b1-45a7-896e-1fcf2fc3687b}	6	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-01-07 15:55:34.029	2026-01-07 15:55:27.460213
04b7d06e-c3c1-4952-9d95-392585843145	Help Updating Your LervIT Account 	Hi [First Name],\n\nWe hope you’re doing well.\n\nWe noticed that your Lervit mover profile is not yet fully completed. As a result, your profile may not be visible to customers, and you may not receive job requests.\n\nTo make this easy, we’ve created a short video that walks you through how to complete your profile step by step:\n\nCompleting your profile helps customers identify you and ensures accurate job matching. You’ll be guided to upload:\n\n1. A clear profile photo\n\n2. Your vehicle details\n\n3. A vehicle photo and license plate\n\nOnce these steps are completed, your profile will become eligible for verification and increased visibility on the platform.\n\nIf you have any questions or need assistance, please reply to this email — our support team is happy to help.\n\nThank you for being part of Lervit.\n\nKind regards,\nLervit Support Team	account_update	specific	{bea15756-b2a3-405b-8834-3b7d224c67b5}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-01-07 15:56:48.837	2026-01-07 15:56:48.572593
f0693840-5ba5-4758-aa2b-51495e9b03fe	Help Updating Your LervIT Account Type	Thanks for reaching out to LervIT Support.\n\nIt looks like your account was created as a Customer instead of a Mover. No worries — we can help fix that.\n\nPlease reply to this email to confirm you'd like your account updated to Mover, and we'll take care of it right away.\n\nIf you have any questions, feel free to let us know.\n\nBest regards,\nLervIT Support Team\nsupport@lervit.com	account_update	specific	{bea15756-b2a3-405b-8834-3b7d224c67b5}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-01-07 16:03:40.136	2026-01-07 16:03:39.831638
23d3c908-ded6-48fb-810c-8e63777fee3e	Help Updating Your LervIT Account Type	\nWe hope you’re doing well.\n\nWe noticed that your Lervit mover profile is not yet fully completed. As a result, your profile may not be visible to customers, and you may not receive job requests.\n\nTo make this easy, we’ve created a short video that walks you through how to complete your profile step by step:\n\nCompleting your profile helps customers identify you and ensures accurate job matching. You’ll be guided to upload:\n\n1. A clear profile photo\n\n2. Your vehicle details\n\n3. A vehicle photo and license plate\n\nOnce these steps are completed, your profile will become eligible for verification and increased visibility on the platform.\n\nIf you have any questions or need assistance, please reply to this email — our support team is happy to help.\n\nThank you for being part of Lervit.\n\nKind regards,\nLervit Support Team	account_update	specific	{bea15756-b2a3-405b-8834-3b7d224c67b5}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-01-07 16:05:41.909	2026-01-07 16:05:41.507171
5a3a8325-bf23-4c91-a3b0-8f0eba7a5e46	Help Updating Your LervIT Mover Account 	\nWe hope you’re doing well.\n\nWe noticed that your Lervit mover profile is not yet fully completed. As a result, your profile may not be visible to customers, and you may not receive job requests.\n\nTo make this easy, we’ve created a short video that walks you through how to complete your profile step by step:\n\nCompleting your profile helps customers identify you and ensures accurate job matching. You’ll be guided to upload:\n\n1. A clear profile photo\n\n2. Your vehicle details\n\n3. A vehicle photo and license plate\n\nOnce these steps are completed, your profile will become eligible for verification and increased visibility on the platform.\n\nIf you have any questions or need assistance, please reply to this email — our support team is happy to help.\n\nThank you for being part of Lervit.\n\nKind regards,\nLervit Support Team	account_update	specific	{4f58bec8-80c9-40af-af80-697b7e9c1092,5bfb9a7d-9bdb-4b98-8089-83cc81ad067e,0e6e000b-ea4c-4a40-8d9c-237f865633ba,bea15756-b2a3-405b-8834-3b7d224c67b5,a597a226-387a-4c13-b5e7-61230779e9a1,bcd90e7c-f434-48d4-9bda-02c3f019fd8e,344cb1d8-88b1-45a7-896e-1fcf2fc3687b}	7	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-01-07 16:08:45.075	2026-01-07 16:08:38.2522
9cc46cd6-a68f-4c3f-82c9-1ed155413bcb	Profile Update	Hi [Name],\n\nOnce again, Welcome to Lervit, the future of micro-logistics. \n\nJust a quick update reminder on your mover profile.\n\nFor you to attract booking visibility for a move, a snapshot or uploaded copy of your Vehicle image is required. This helps customers to identify mover and vehicle prior to booking request and mover confirmation\nPls click the link below for a brief tutorial on how to optimise your mover profile.\n\nhttps://youtu.be/jvSFzfeM0ps?si=XcLK4CVopuvGsT6c\n\nFor future enquiries and support, contact the email or Toll Free number : support@lervit.com, 833-636-2879, \n\nBest Regards,\n\nLervIT Support Team\n\n	account_update	specific	{4f58bec8-80c9-40af-af80-697b7e9c1092,5bfb9a7d-9bdb-4b98-8089-83cc81ad067e,0e6e000b-ea4c-4a40-8d9c-237f865633ba,bea15756-b2a3-405b-8834-3b7d224c67b5}	4	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-01-16 20:29:22.573	2026-01-16 20:29:21.87488
27fd7a71-23e3-4c0b-9354-7eb6b8505acb	Image	Hi Tim,\n\nHere is a sample photo of how you have to upload the vehicle image.\n\n\nRegards,\n\nLervit team	account_update	specific	{65d807fc-eaae-4407-8a8b-85a28a699047}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-01-16 22:18:41.154	2026-01-16 22:18:40.551857
742a79f2-8016-4f95-9142-28163623fd35	Account Update	\nYour account has been updated with your Vehicle Image: White Cargo Van.\n\nYou can view the update listing by clicking the menu tab and choosing "Find Movers"\n\nShould you have any further concerns, contact support at info@lervit.com\n\n\nRegards\n\nLervit Team	account_update	specific	{65d807fc-eaae-4407-8a8b-85a28a699047}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-01-16 23:08:20.95	2026-01-16 23:08:20.628228
39922ee7-417a-4fbf-9223-e2ea0974f9a9	Limited Time Offer - 20% Off Your First 2  Move!	For a limited time, enjoy 20% off your next 2 booking with LervIT!\n\nUse code: LERVIT20 at checkout.\n\nTerms apply. Offer valid for moves booked within the next 15 days.\n\nQuestions? Contact us at 888-982-0885 OR  support@lervit.com\n\nFrom the LervIT Team\n\n	promotion	customers	{568683dc-b8bb-47c2-8b63-02823ca4409b,7e454eca-11fc-4fe2-a4ce-2de1d894e137,31d181d0-796d-45b2-9b9c-503ea60f50cb,528c9186-d2fd-46fb-ad68-592db7eedff2,3d67e96a-ad34-4eec-8830-8c9a699a41f5,905344d1-9b84-4eca-a3b2-2227b25ccd83,d9ba6e2a-56d4-4a98-b3b1-3122001beb0d,6befe13b-ce4a-4ee8-9184-f7ea4b50155a,b23e5c31-ac7a-425a-aeed-b595c4e4b834,6f8f7816-407d-4cf7-8dbe-a86798e048c8,dd5d2815-4649-4563-b756-c9b471971de0,014395ad-5920-49dd-9291-a4189bb8ce9e,6fb03540-7b08-46e6-9568-bbdc9072c3d9,452a351c-c308-4a11-8539-ea23394a8ab9,bea15756-b2a3-405b-8834-3b7d224c67b5,fd70b1ca-a265-4ab1-b63d-0e1aff61394e,8f131487-4c92-4edf-8168-6126a2782c2f,b5799ff2-a70d-4bef-aed5-c289d9509792,1dd4c7e6-e5cb-4e12-9ac0-19b0d3974354,a8e52fd4-a66a-46d3-9f17-19c18088e8f4,962ee291-2a94-4f31-9064-579a1e67c10b,1d803abc-bf4d-4d29-8536-393987304033,d6aafff1-06e2-486d-b380-963ec850ee80,3724c9bc-c17c-46e4-91eb-c6763ab09999,6952e76e-4306-4634-9d98-ef0bc2579905,bad01057-9591-4e67-beeb-4e15027e7736}	26	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-02-13 18:56:20.752	2026-02-13 18:55:59.467086
5f252f9f-8d52-4f67-a00a-c89318824c24	Payment Update 	Congratulations on your recently completed move. Kindly forward an interact email address for manual payment of $15.61.\n\nThanks for building with Lervit.\n\nFor further concerns, contact support@lervit.com.\n\nRegards,\n\nLervIT Team	personal	specific	{65d807fc-eaae-4407-8a8b-85a28a699047}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-02-21 05:18:14.905	2026-02-21 05:18:14.547268
71b91340-a6f2-4d39-bfdb-d0f6cff4cddf	HI	Once again, Thank you for signing up with LervIT - your on-demand AI powered moving platform. \n\nI  see you have not yet uploaded a photo of your vehicle. \n\nI have attached to this email a step-by-step video guide to assist you with completing your mover profile.\n\nShould you have any concerns, reach out via the support tool in your account .\n\nThanks again\n\nLervIT™	account_update	specific	{4f58bec8-80c9-40af-af80-697b7e9c1092,0e6e000b-ea4c-4a40-8d9c-237f865633ba,f40c6fcf-bb8e-43a5-b88e-eb3ce6540786,459ff44d-52b4-40c7-8b6d-d69142dd1807,2a6d2a42-be38-455f-a7d1-2e86c548ec14,bea15756-b2a3-405b-8834-3b7d224c67b5,27a91efa-09e1-43e7-930f-b538862b97ac}	7	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-04-10 01:26:27.425	2026-04-10 01:26:19.928025
408e0dd9-2e19-4cb6-bbc3-3939308dafc9	Help Updating Your LervIT Mover Account 	\nWe hope you’re doing well.\n\nWe noticed that your Lervit mover profile is not yet fully completed. As a result, your profile may not be visible to customers, and you may not receive job requests.\n\nTo make this easy, we’ve created a short video that walks you through how to complete your profile step by step:\n\nCompleting your profile helps customers identify you and ensures accurate job matching. You’ll be guided to upload:\n\n1. A clear profile photo\n\n2. Your vehicle details\n\n3. A vehicle photo and license plate\n\nOnce these steps are completed, your profile will become eligible for verification and increased visibility on the platform.\n\nIf you have any questions or need assistance, please reply to this email  -  our support team is happy to help.\n\nThank you for being part of Lervit.\n\nKind regards,\nLervit Support Team	account_update	specific	{8b74e5a1-a6d8-4cb2-84ed-a5c238a5cae8}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-05-01 04:06:03.304	2026-05-01 04:06:02.191803
8dca303c-f323-4934-ab33-622952cbdd0c	Account Update 	\nThe following documents need updating;\n1. Upload 4 clear photos of the vehicle \n2.  Place the ID on a flat surface and take both front and back photos\n3. Set up payout through the mover platform. Click the tab PAYOUT and follow the steps. Payout setup is routed via STRIPE  \n\nRegards\nLervIT\n	account_update	specific	{58413582-e6f3-4bf2-b488-b899f7babd31}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-07-03 19:56:37.819	2026-07-03 19:56:37.592152
8165ebaa-d396-4941-a0d2-38adddca62ae	Your August 15th Move 	With regards to your August 15th Move, the app indicates you have 5 boxes and 1 swivel chair. Kindly note that moves are only oblige to pickup exact items uploaded during booking. \n\nHowever, should you have more items to pickup, kindly contact mover with additional images or description so a preferred sub charge can be negotiated. This you can do on the app through our in-app messaging platform.\n\nShould you have further concerns, pls kindly contact support@lervit.com.\n\nRegards, \n\nLervIT Team\n\n	personal	specific	{008bbd4d-55f1-4b6c-aafd-b9908cfffcdc}	1	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	sent	2026-08-13 21:36:21.951	2026-08-13 21:36:21.655876
\.


--
-- Data for Name: identified_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.identified_items (id, booking_id, photo_url, item_name, category, weight_kg, dimensions_l_cm, dimensions_w_cm, dimensions_h_cm, volume_cuft, handling_complexity, vehicle_type, recommended_movers, insurance_level, confidence, source_metadata, processing_status, error_message, created_at, updated_at) FROM stdin;
a132475d-d2b3-4840-a52e-9f2ac5b65537	a32f4978-535c-4639-a58d-113add6fd860	/objects/uploads/f4e3be99-8ec5-44a6-8be2-52eeea759ac0.heic	Stainless steel trash can with foot pedal	Other	3.00	35.00	35.00	60.00	2.60	low	car	1	standard	0.95	{"visionEngine":"2.0","source":"vision_estimate","processingTime":15284,"subcategory":"Trash Can","quantity":1,"perItemVolumeFt3":2.6,"perItemWeightKg":3}	completed	\N	2026-02-28 07:33:53.28673	2026-02-28 07:33:53.28673
02fcf164-e47b-4ca0-9c12-18d7bda07b3b	a32f4978-535c-4639-a58d-113add6fd860	/objects/uploads/a37e7a89-26a6-444f-9bda-7f025e82a489.heic	Chest freezer	Appliance	55.00	110.00	65.00	85.00	21.46	high	pickup	2	high	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"FREEZER_CHEST_001","processingTime":14811,"subcategory":"Freezer","quantity":1,"perItemVolumeFt3":21.46,"perItemWeightKg":55}	completed	\N	2026-02-28 07:33:53.335351	2026-02-28 07:33:53.335351
5460bcae-0f73-4e19-b910-8e0d8e1880ec	a32f4978-535c-4639-a58d-113add6fd860	/objects/uploads/18bb8462-4f77-41e5-9b61-ec5f90820aa4.heic	Large filled garbage bag	Other	5.00	85.00	55.00	70.00	11.56	medium	car	1	medium	0.81	{"visionEngine":"2.0","source":"vision_estimate","corrections":["Length reduced from 120cm to 85cm (max for Luggage)","Width reduced from 70cm to 55cm (max for Luggage)"],"processingTime":14264,"subcategory":"Other","quantity":1,"perItemVolumeFt3":11.56,"perItemWeightKg":5}	completed	\N	2026-02-28 07:33:53.380303	2026-02-28 07:33:53.380303
0934730d-05cb-4675-9d1b-e8e4d3562704	a32f4978-535c-4639-a58d-113add6fd860	/objects/uploads/af54f8b8-6a6f-4ac0-a17d-86b84d98b2d9.heic	Queen platform bed	Furniture	55.00	203.00	152.00	40.00	43.59	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BED_QUEEN_001","processingTime":13981,"subcategory":"Queen","quantity":1,"perItemVolumeFt3":43.59,"perItemWeightKg":55}	completed	\N	2026-02-28 07:33:53.425557	2026-02-28 07:33:53.425557
19636dce-af74-4963-8f5e-826a528bad82	a32f4978-535c-4639-a58d-113add6fd860	/objects/uploads/13b691ac-bf15-4a29-af54-2a5bf4edc520.heic	Rolling storage cart with toiletries	Furniture	15.00	40.00	30.00	70.00	10.00	low	car	1	standard	0.86	{"visionEngine":"2.0","source":"vision_estimate","corrections":["Weight increased from 5kg to 15kg (min for Storage)","Volume increased to 10ft³ (minimum for category)"],"processingTime":14395,"subcategory":"Trolley","quantity":1,"perItemVolumeFt3":10,"perItemWeightKg":15}	completed	\N	2026-02-28 07:33:53.469779	2026-02-28 07:33:53.469779
9abedcd9-1920-4ea7-b4ff-0c3b900e8507	146e4a91-b9f4-44fd-825f-72538a508811	/objects/uploads/43acc73a-57ef-41c5-8b4f-9b1dcb58395c.jpg	Medium L-shaped sectional sofa	Furniture	70.00	230.00	150.00	85.00	103.56	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_SECTIONAL_L_SM_001","processingTime":4068,"subcategory":"Sectional","quantity":1,"perItemVolumeFt3":103.56,"perItemWeightKg":70}	completed	\N	2026-04-11 20:18:33.965835	2026-04-11 20:18:33.965835
0d8b12d7-c008-4832-b268-612ca314b109	844d12be-9706-4e1b-892f-45851cf0ab70	/objects/uploads/435072e1-30d2-43e7-b3c4-59086a2590d5.jpeg	Medium L-shaped sectional sofa	Furniture	70.00	230.00	150.00	85.00	103.56	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_SECTIONAL_L_SM_001","processingTime":2263,"subcategory":"Sectional","quantity":1,"perItemVolumeFt3":103.56,"perItemWeightKg":70}	completed	\N	2026-04-12 17:28:35.884193	2026-04-12 17:28:35.884193
bdca6c10-f4af-4702-884d-39e328cddbd4	af96a642-2419-4b11-88de-b1a2902984f5	/objects/uploads/c1e47027-d390-4d61-a07b-f77109d1166a.jpeg	Medium L-shaped sectional sofa	Furniture	70.00	230.00	150.00	85.00	103.56	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_SECTIONAL_L_SM_001","processingTime":2187,"subcategory":"Sectional","quantity":1,"perItemVolumeFt3":103.56,"perItemWeightKg":70}	completed	\N	2026-04-12 17:32:03.170731	2026-04-12 17:32:03.170731
c7057fbd-eea1-4c3c-af3a-d1a50de5d582	4eb15b25-2b65-4397-a6c0-92065c8da2fa	/objects/uploads/069b24ed-d0f2-451d-8c3d-ae48ea0241bb.jpg	Large L-shaped sectional sofa	Furniture	70.00	230.00	150.00	85.00	103.56	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_SECTIONAL_L_SM_001","processingTime":2883,"subcategory":"Sectional","quantity":1,"perItemVolumeFt3":103.56,"perItemWeightKg":70}	completed	\N	2026-04-16 00:15:12.851636	2026-04-16 00:15:12.851636
972aae5c-703b-4283-b7f8-0c07db819dfd	55784d4a-806b-4d2c-b94e-6d1c5c2857b4	/objects/uploads/0e7398a0-e983-4c28-bb63-922f52ed41a9.jpg	Small L-shaped sectional sofa	Furniture	70.00	230.00	150.00	85.00	103.56	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_SECTIONAL_L_SM_001","processingTime":3613,"subcategory":"Sectional","quantity":1,"perItemVolumeFt3":103.56,"perItemWeightKg":70}	completed	\N	2026-04-18 18:29:18.999798	2026-04-18 18:29:18.999798
4ec65cf1-9d25-4491-a358-b4b31aa2b85f	b2bf0412-acec-4ae2-a6ec-58e5822cbe8c	/objects/uploads/6c97d1db-6e0d-4537-8b25-2aa9ba6e01b3.jpeg	Queen bed frame	Furniture	35.00	191.00	99.00	40.00	26.71	medium	pickup	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BED_TWIN_001","processingTime":1714,"subcategory":"Twin","quantity":1,"perItemVolumeFt3":26.71,"perItemWeightKg":35}	completed	\N	2026-04-25 15:47:23.255445	2026-04-25 15:47:23.255445
9e77ae53-01ae-425c-a9ed-eae14ca0eba2	b2bf0412-acec-4ae2-a6ec-58e5822cbe8c	/objects/uploads/055b7a87-fd08-4bd9-b350-22a6ae674439.jpg	Stacked cardboard boxes	Other	50.00	40.00	30.00	30.00	12.70	low	car	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BOXES_SMALL_001","processingTime":3171,"subcategory":"Boxes","quantity":1,"perItemVolumeFt3":12.7,"perItemWeightKg":50}	completed	\N	2026-04-25 15:47:23.305086	2026-04-25 15:47:23.305086
a6dbb429-ec1e-43e7-b08e-82dc62c6c6d4	b2bf0412-acec-4ae2-a6ec-58e5822cbe8c	/objects/uploads/2220fd0d-20b4-4e05-a3c9-fa408bdb91f9.jpg	Standard refrigerator	Appliance	90.00	75.00	70.00	170.00	31.52	very_high	pickup	2	premium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"FRIDGE_STANDARD_001","processingTime":3096,"subcategory":"Refrigerator","quantity":1,"perItemVolumeFt3":31.52,"perItemWeightKg":90}	completed	\N	2026-04-25 15:47:23.351005	2026-04-25 15:47:23.351005
8c6babd5-522e-4156-adaa-134fca0981c6	11161561-7b74-421e-915a-2ab1bbd1ad69	/objects/uploads/af31bc3a-b184-4afd-8325-1357583c32eb.jpg	Upright freezer	Appliance	55.00	110.00	65.00	85.00	21.46	high	pickup	2	high	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"FREEZER_CHEST_001","processingTime":3045,"subcategory":"Freezer","quantity":1,"perItemVolumeFt3":21.46,"perItemWeightKg":55}	completed	\N	2026-04-25 23:18:37.89554	2026-04-25 23:18:37.89554
76461fe8-4945-4d93-8042-a0ad919f938f	11161561-7b74-421e-915a-2ab1bbd1ad69	/objects/uploads/e33b096f-0886-4dd4-96da-3964c6501db6.jpg	2-door wardrobe	Furniture	100.00	120.00	60.00	200.00	50.85	very_high	pickup	2	high	0.95	{"visionEngine":"2.0","source":"database_match","matchedItem":"WARDROBE_001","processingTime":3029,"subcategory":"Wardrobe","quantity":1,"perItemVolumeFt3":50.85,"perItemWeightKg":100}	completed	\N	2026-04-25 23:18:37.941239	2026-04-25 23:18:37.941239
ffa5ffe8-75a8-43f7-ab18-5bb033d57c88	11161561-7b74-421e-915a-2ab1bbd1ad69	/objects/uploads/a4258383-7749-4454-9c34-0230cf908986.jpg	7 moving boxes (medium)	Other	350.00	40.00	30.00	30.00	88.90	low	pickup	2	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BOXES_SMALL_001","processingTime":3307,"subcategory":"Boxes","quantity":7,"perItemVolumeFt3":12.7,"perItemWeightKg":50}	completed	\N	2026-04-25 23:18:37.983486	2026-04-25 23:18:37.983486
32be4a45-9e72-48f6-a35b-151fb834547a	11161561-7b74-421e-915a-2ab1bbd1ad69	/objects/uploads/3eafca6e-4285-4722-97ef-0a8ea32df96d.jpg	5 moving boxes (medium)	Other	250.00	40.00	30.00	30.00	63.50	low	pickup	2	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BOXES_SMALL_001","processingTime":2986,"subcategory":"Boxes","quantity":5,"perItemVolumeFt3":12.7,"perItemWeightKg":50}	completed	\N	2026-04-25 23:18:38.025579	2026-04-25 23:18:38.025579
538286ca-4b9b-4580-8ace-6bc7fe610005	11161561-7b74-421e-915a-2ab1bbd1ad69	/objects/uploads/dc51188d-1f2a-49a6-905d-bf533cdeccd7.jpg	5 moving boxes (large)	Other	250.00	40.00	30.00	30.00	63.50	low	pickup	2	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BOXES_SMALL_001","processingTime":3932,"subcategory":"Boxes","quantity":5,"perItemVolumeFt3":12.7,"perItemWeightKg":50}	completed	\N	2026-04-25 23:18:38.070815	2026-04-25 23:18:38.070815
6bae7cf8-322d-41b0-9d7c-c225f60c3115	11161561-7b74-421e-915a-2ab1bbd1ad69	/objects/uploads/59abc587-1dab-4ac6-b0ee-850b84fc48d6.jpg	White tilt-out laundry hamper	Furniture	15.00	50.00	40.00	80.00	10.00	low	car	1	standard	0.86	{"visionEngine":"2.0","source":"vision_estimate","corrections":["Weight increased from 10kg to 15kg (min for Storage)","Volume increased to 10ft³ (minimum for category)"],"processingTime":3348,"subcategory":"Hamper","quantity":1,"perItemVolumeFt3":10,"perItemWeightKg":15}	completed	\N	2026-04-25 23:18:38.114143	2026-04-25 23:18:38.114143
f81216cd-8ac5-446d-af21-d6b7a219320d	11161561-7b74-421e-915a-2ab1bbd1ad69	/objects/uploads/98387d4d-0c62-43d0-a37c-ba8b9b8b6aea.jpeg	Queen bed frame	Furniture	35.00	191.00	99.00	40.00	26.71	medium	pickup	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BED_TWIN_001","processingTime":3220,"subcategory":"Twin","quantity":1,"perItemVolumeFt3":26.71,"perItemWeightKg":35}	completed	\N	2026-04-25 23:18:38.157155	2026-04-25 23:18:38.157155
f9397f36-06f0-41d6-8900-9dbcc2f376fe	2aac34d5-1d66-4724-8437-6aeb6d76b559	/objects/uploads/47ec35b7-82a9-4d34-9410-dc388b3dcf6a.jpg	Medium L-shaped sectional sofa	Furniture	70.00	230.00	150.00	85.00	103.56	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_SECTIONAL_L_SM_001","processingTime":3114,"subcategory":"Sectional","quantity":1,"perItemVolumeFt3":103.56,"perItemWeightKg":70}	completed	\N	2026-04-26 23:46:46.816424	2026-04-26 23:46:46.816424
c76fef6f-3cab-4e7e-8099-3a43b971108b	f540f733-a278-4230-8b64-0bd6c09de586	/objects/uploads/5ec68856-3379-4178-bceb-a02ce7f57af6.jpeg	Medium L-shaped sectional sofa	Furniture	70.00	230.00	150.00	85.00	103.56	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_SECTIONAL_L_SM_001","processingTime":3601,"subcategory":"Sectional","quantity":1,"perItemVolumeFt3":103.56,"perItemWeightKg":70}	completed	\N	2026-05-02 18:33:33.276013	2026-05-02 18:33:33.276013
16eecef2-0824-472c-9559-39ffc372d7c3	ffc36ceb-21d1-47a0-97cf-1563428a8cb0	/objects/uploads/61b3a38c-7b6b-41f1-aa96-c0015c23880f.jpeg	Medium L-shaped sectional sofa	Furniture	70.00	230.00	150.00	85.00	103.56	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_SECTIONAL_L_SM_001","processingTime":3662,"subcategory":"Sectional","quantity":1,"perItemVolumeFt3":103.56,"perItemWeightKg":70}	completed	\N	2026-05-05 16:30:21.81083	2026-05-05 16:30:21.81083
f34013fe-9be1-41cd-b018-f44ec7f78325	38c0211f-2e9e-4e7d-9ecb-61dc14f5d647	/objects/uploads/5e3f1c9b-08cb-4677-ae65-d399c54d4d08.png	6-drawer dresser	Furniture	70.00	150.00	50.00	85.00	22.51	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"DRESSER_6DRAWER_001","processingTime":3301,"subcategory":"Dresser","quantity":1,"perItemVolumeFt3":22.51,"perItemWeightKg":70}	completed	\N	2026-07-08 19:54:29.49229	2026-07-08 19:54:29.49229
384f1ad7-592c-43ea-8574-eb5bbf970848	38c0211f-2e9e-4e7d-9ecb-61dc14f5d647	/objects/uploads/157e601a-bd02-4b5f-96ed-e91df3c123db.png	Queen bed frame	Furniture	35.00	191.00	99.00	40.00	26.71	medium	pickup	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BED_TWIN_001","processingTime":2381,"subcategory":"Twin","quantity":1,"perItemVolumeFt3":26.71,"perItemWeightKg":35}	completed	\N	2026-07-08 19:54:29.545493	2026-07-08 19:54:29.545493
0b807aef-c450-4122-9530-6ecd032b5981	07c63257-4036-4560-87c1-2e33e57e6a1a	/objects/uploads/d6c90fa8-4c3c-4547-9afa-47cbd0058db4.png	Queen bed frame	Furniture	35.00	191.00	99.00	40.00	26.71	medium	pickup	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BED_TWIN_001","processingTime":2381,"subcategory":"Twin","quantity":1,"perItemVolumeFt3":26.71,"perItemWeightKg":35}	completed	\N	2026-07-08 22:00:07.348407	2026-07-08 22:00:07.348407
c438c811-5c1f-4a91-9984-2242d6dc86ce	07c63257-4036-4560-87c1-2e33e57e6a1a	/objects/uploads/c41d9342-01a0-47d5-b28d-20d9ed50a7c9.png	6-drawer dresser	Furniture	70.00	150.00	50.00	85.00	22.51	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"DRESSER_6DRAWER_001","processingTime":3301,"subcategory":"Dresser","quantity":1,"perItemVolumeFt3":22.51,"perItemWeightKg":70}	completed	\N	2026-07-08 22:00:07.400268	2026-07-08 22:00:07.400268
d8511ac9-7076-448f-b1f5-279c35207bc8	5c653d68-23c8-4d1a-835d-7bed22ee5a95	/objects/uploads/7ac7be24-17e1-446d-99b3-54e42061d125.jpeg	Medium L-shaped sectional sofa	Furniture	70.00	230.00	150.00	85.00	103.56	moderate	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_SECTIONAL_L_SM_001","processingTime":2888,"subcategory":"Sectional","quantity":1,"perItemVolumeFt3":103.56,"perItemWeightKg":70}	completed	\N	2026-07-10 18:44:51.110022	2026-07-10 18:44:51.110022
e1e736a0-78b3-432c-ada1-1893c94c0198	32e361d9-afa5-458c-ac10-498d6d509b7a	/objects/uploads/2a6cec7a-5258-4ee3-99d6-e411f6d5b33f.jpg	Upholstered armchair	Furniture	12.00	75.00	70.00	95.00	15.80	low	car	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"CHAIR_ACCENT_001","processingTime":3451,"subcategory":"Accent","quantity":1,"perItemVolumeFt3":15.8,"perItemWeightKg":12}	completed	\N	2026-07-11 21:25:37.811307	2026-07-11 21:25:37.811307
fb866d84-11da-475a-af07-90224d8ab6b2	d86cbb19-c971-401c-a4ab-eba90424e4b6	/objects/uploads/e7e57174-93ca-44fd-b14c-260cae13c714.jpg	Small L-shaped sectional sofa	Furniture	70.00	230.00	150.00	85.00	103.56	medium	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_SECTIONAL_L_SM_001","processingTime":3370,"subcategory":"Sectional","quantity":1,"perItemVolumeFt3":103.56,"perItemWeightKg":70}	completed	\N	2026-07-12 03:00:55.891742	2026-07-12 03:00:55.891742
253d962f-a429-4b3c-9866-80eb8b049da4	6ac14c1a-838e-4b99-943a-457e970be405	/objects/uploads/68ba061e-3c57-48c0-8630-a8ef00667518.jpg	Medium L-shaped sectional sofa	Furniture	70.00	230.00	150.00	85.00	103.56	medium	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_SECTIONAL_L_SM_001","processingTime":5974,"subcategory":"Sectional","quantity":1,"perItemVolumeFt3":103.56,"perItemWeightKg":70}	completed	\N	2026-07-29 01:22:42.677587	2026-07-29 01:22:42.677587
4d848b86-5798-4110-b0a5-c27d8b2859f7	85ac89ac-b9ee-4ec4-9e9b-b91d1cc78d4d	/objects/uploads/b1a81a00-cb2a-4f77-8467-f16008fb3c87.jpg	Medium sectional sofa bed	Furniture	110.00	250.00	170.00	85.00	127.57	medium	pickup	2	medium	0.91	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_BED_SECTIONAL_SM_001","processingTime":3743,"subcategory":"Sofa Bed","quantity":1,"perItemVolumeFt3":127.57,"perItemWeightKg":110}	completed	\N	2026-08-05 17:18:02.891975	2026-08-05 17:18:02.891975
783d566e-b3bf-4995-95f5-082cde225378	ef3411ba-5b1c-494f-b753-314ff8b5bc46	/objects/uploads/64137db1-6331-43a2-9436-98bd9c6ea16c.jpeg	Small sectional sofa bed	Furniture	110.00	250.00	170.00	85.00	127.57	medium	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_BED_SECTIONAL_SM_001","processingTime":3216,"subcategory":"Sofa Bed","quantity":1,"perItemVolumeFt3":127.57,"perItemWeightKg":110}	completed	\N	2026-08-07 14:27:28.889056	2026-08-07 14:27:28.889056
11583938-7313-4219-b69e-0a4644f550e4	d3d9252c-c2ca-4f4c-a100-9fed17ceb209	/objects/uploads/fab6cc48-aaaa-4097-ab6c-183724562d19.jpg	3-seater sofa	Furniture	45.00	150.00	85.00	85.00	38.27	medium	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_2SEAT_001","processingTime":3355,"subcategory":"Loveseat","quantity":1,"perItemVolumeFt3":38.27,"perItemWeightKg":45}	completed	\N	2026-08-07 20:26:00.868622	2026-08-07 20:26:00.868622
0291457e-7312-4a91-b6d6-b9db690ddbc9	24376126-5a19-4a17-bd08-117a73a68c5c	/objects/uploads/84bea40f-4bbd-4082-a52e-0f3e8c119dbe.jpg	5 moving boxes (medium)	Other	250.00	40.00	30.00	30.00	63.50	low	pickup	2	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BOXES_SMALL_001","processingTime":1808,"subcategory":"Boxes","quantity":5,"perItemVolumeFt3":12.7,"perItemWeightKg":50}	completed	\N	2026-08-10 20:48:12.601243	2026-08-10 20:48:12.601243
c0ca7fd4-f3bc-4c68-9aeb-87bf9003000c	24376126-5a19-4a17-bd08-117a73a68c5c	/objects/uploads/7b04dff5-f22e-45c6-8834-46eda76315ce.jpg	Office chair	Furniture	8.00	45.00	50.00	90.00	7.15	low	car	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"CHAIR_DINING_001","processingTime":1417,"subcategory":"Dining","quantity":1,"perItemVolumeFt3":7.15,"perItemWeightKg":8}	completed	\N	2026-08-10 20:48:12.653639	2026-08-10 20:48:12.653639
50ecda71-36cb-41c3-b142-a0f09d636ce5	32d5a107-1f38-4465-9b4b-ffd492d10f5f	/objects/uploads/10ce145d-5ace-4acc-a85a-ea0c3883182f.jpg	Queen platform bed	Furniture	55.00	203.00	152.00	40.00	43.59	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BED_QUEEN_001","processingTime":5374,"subcategory":"Queen","quantity":1,"perItemVolumeFt3":43.59,"perItemWeightKg":55}	completed	\N	2026-08-28 19:34:21.250524	2026-08-28 19:34:21.250524
5bc45a9d-e963-417d-9069-36ad45814321	32d5a107-1f38-4465-9b4b-ffd492d10f5f	/objects/uploads/053474b4-d829-40ef-a4a8-3d217c8609e0.jpg	Large suitcase	Other	23.00	78.00	52.00	32.00	4.60	low	car	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SUITCASE_LARGE_001","processingTime":4450,"subcategory":"Suitcase","quantity":1,"perItemVolumeFt3":4.6,"perItemWeightKg":23}	completed	\N	2026-08-28 19:34:21.303944	2026-08-28 19:34:21.303944
b710d3db-4414-4d8b-a59b-6b5248a7e323	32d5a107-1f38-4465-9b4b-ffd492d10f5f	/objects/uploads/0590cdcc-eb3d-4e86-bd99-56589efdf59f.jpg	Chest freezer	Appliance	55.00	110.00	65.00	85.00	21.46	high	pickup	2	high	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"FREEZER_CHEST_001","processingTime":6305,"subcategory":"Freezer","quantity":1,"perItemVolumeFt3":21.46,"perItemWeightKg":55}	completed	\N	2026-08-28 19:34:21.352952	2026-08-28 19:34:21.352952
26ac019c-c526-4bc5-b65a-aa10d2d3866b	32d5a107-1f38-4465-9b4b-ffd492d10f5f	/objects/uploads/434dc0be-e112-4087-8c9f-f0cfdab8d9ab.jpg	Curved 3-seater sofa	Furniture	70.00	210.00	90.00	85.00	56.73	low	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_3SEAT_001","processingTime":6316,"subcategory":"3-Seater","quantity":1,"perItemVolumeFt3":56.73,"perItemWeightKg":70}	completed	\N	2026-08-28 19:34:21.402571	2026-08-28 19:34:21.402571
9102d393-3a85-4845-a4ed-c1d80a424f7e	32d5a107-1f38-4465-9b4b-ffd492d10f5f	/objects/uploads/c03a8246-eedb-4038-8831-27ecfc3f9c73.jpg	55" TV	Electronics	18.00	125.00	8.00	72.00	2.54	low	car	1	medium	0.95	{"visionEngine":"2.0","source":"vision_estimate","processingTime":5602,"subcategory":"Television","quantity":1,"perItemVolumeFt3":2.54,"perItemWeightKg":18}	completed	\N	2026-08-28 19:34:21.45137	2026-08-28 19:34:21.45137
4ee0c2ff-a9c3-4a32-9936-3e63b2f00895	32d5a107-1f38-4465-9b4b-ffd492d10f5f	/objects/uploads/7294aa17-8e4a-4a4d-aa96-6fc005328c5a.jpg	Set of two bar stools	Furniture	30.00	45.00	45.00	100.00	14.30	low	car	1	standard	0.86	{"visionEngine":"2.0","source":"vision_estimate","corrections":["Length increased from 40cm to 45cm (min for Chair)","Width increased from 40cm to 45cm (min for Chair)"],"processingTime":5196,"subcategory":"Bar Stool","quantity":2,"perItemVolumeFt3":7.15,"perItemWeightKg":15}	completed	\N	2026-08-28 19:34:21.500292	2026-08-28 19:34:21.500292
04af623c-8756-44ad-87dc-2c6f1d663532	0e07fbd6-fb32-4924-86a0-c87d3b47b294	/objects/uploads/4fc99044-8437-42d4-8c9e-d316a782ee75.jpg	Queen platform bed	Furniture	55.00	203.00	152.00	40.00	43.59	high	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"BED_QUEEN_001","processingTime":5374,"subcategory":"Queen","quantity":1,"perItemVolumeFt3":43.59,"perItemWeightKg":55}	completed	\N	2026-08-28 19:41:54.66168	2026-08-28 19:41:54.66168
a5ae7e8e-7712-465f-8751-67abf025f8e8	0e07fbd6-fb32-4924-86a0-c87d3b47b294	/objects/uploads/9c977ad7-c440-4c05-9313-b2c5c0281657.jpg	Chest freezer	Appliance	55.00	110.00	65.00	85.00	21.46	high	pickup	2	high	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"FREEZER_CHEST_001","processingTime":6305,"subcategory":"Freezer","quantity":1,"perItemVolumeFt3":21.46,"perItemWeightKg":55}	completed	\N	2026-08-28 19:41:54.712505	2026-08-28 19:41:54.712505
a0460401-73ea-40d7-9826-26ee72115ee9	0e07fbd6-fb32-4924-86a0-c87d3b47b294	/objects/uploads/e27b0cd6-359d-4591-b333-3d8ed3c60423.jpg	55" TV	Electronics	18.00	125.00	8.00	72.00	2.54	low	car	1	medium	0.95	{"visionEngine":"2.0","source":"vision_estimate","processingTime":5602,"subcategory":"Television","quantity":1,"perItemVolumeFt3":2.54,"perItemWeightKg":18}	completed	\N	2026-08-28 19:41:54.761457	2026-08-28 19:41:54.761457
d3686ab2-ed2d-4370-8149-587d5dd86ff9	0e07fbd6-fb32-4924-86a0-c87d3b47b294	/objects/uploads/3c1937cc-a99c-48c3-bd54-59d7ab22252a.jpg	Curved 3-seater sofa	Furniture	70.00	210.00	90.00	85.00	56.73	low	pickup	2	medium	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"SOFA_3SEAT_001","processingTime":6316,"subcategory":"3-Seater","quantity":1,"perItemVolumeFt3":56.73,"perItemWeightKg":70}	completed	\N	2026-08-28 19:41:54.811808	2026-08-28 19:41:54.811808
b4ec26d5-03e5-46e0-afff-1e77431dfee5	0e07fbd6-fb32-4924-86a0-c87d3b47b294	/objects/uploads/b72d3566-a991-493c-a69c-f9b4d22c17f6.jpg	Set of two bar stools	Furniture	30.00	45.00	45.00	100.00	14.30	low	car	1	standard	0.86	{"visionEngine":"2.0","source":"vision_estimate","corrections":["Length increased from 40cm to 45cm (min for Chair)","Width increased from 40cm to 45cm (min for Chair)"],"processingTime":5196,"subcategory":"Bar Stool","quantity":2,"perItemVolumeFt3":7.15,"perItemWeightKg":15}	completed	\N	2026-08-28 19:41:54.860599	2026-08-28 19:41:54.860599
b16283ee-f1e0-4326-b142-1d4a824590ba	be06ce8a-b02e-4106-834d-3e65d4f07883	/objects/uploads/8bb0b69c-985d-4eae-a1cf-eeaa938300a8.jpg	Wooden coffee table	Furniture	25.00	120.00	60.00	45.00	11.44	low	car	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"TABLE_COFFEE_001","processingTime":2847,"subcategory":"Coffee","quantity":1,"perItemVolumeFt3":11.44,"perItemWeightKg":25}	completed	\N	2026-09-01 01:55:14.103506	2026-09-01 01:55:14.103506
9fda878b-5dfc-495d-9ecb-03f4cf00d479	be06ce8a-b02e-4106-834d-3e65d4f07883	/objects/uploads/2f24b0df-8416-4f23-a488-7893626bd3ef.jpg	Wooden coffee table	Furniture	25.00	120.00	60.00	45.00	11.44	low	car	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"TABLE_COFFEE_001","processingTime":3503,"subcategory":"Coffee","quantity":1,"perItemVolumeFt3":11.44,"perItemWeightKg":25}	completed	\N	2026-09-01 01:55:14.159005	2026-09-01 01:55:14.159005
a7e00d53-97bc-47e2-bead-c1c859a3e06f	be06ce8a-b02e-4106-834d-3e65d4f07883	/objects/uploads/f0130898-720d-4524-b1ac-9b8d94b146b5.jpg	Long wooden console table	Furniture	20.00	120.00	35.00	80.00	11.87	low	car	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"TABLE_CONSOLE_001","processingTime":3712,"subcategory":"Console","quantity":1,"perItemVolumeFt3":11.87,"perItemWeightKg":20}	completed	\N	2026-09-01 01:55:14.211256	2026-09-01 01:55:14.211256
2ca1eabb-a4a9-47b0-b89a-f37fd495316e	be06ce8a-b02e-4106-834d-3e65d4f07883	/objects/uploads/9cc8cd70-2be0-4412-932d-49ca16251fea.jpg	Long wooden console table	Furniture	20.00	120.00	35.00	80.00	11.87	low	car	1	standard	0.99	{"visionEngine":"2.0","source":"database_match","matchedItem":"TABLE_CONSOLE_001","processingTime":3491,"subcategory":"Console","quantity":1,"perItemVolumeFt3":11.87,"perItemWeightKg":20}	completed	\N	2026-09-01 01:55:14.263749	2026-09-01 01:55:14.263749
\.


--
-- Data for Name: in_app_notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.in_app_notifications (id, user_id, type, title, message, booking_id, support_ticket_id, action_url, is_read, read_at, metadata, created_at) FROM stdin;
50dac452-eaf6-4958-a9c4-619d88e141cd	bea15756-b2a3-405b-8834-3b7d224c67b5	new_message	New message from Mbeku o	i am on my way to dropoff 	8bf9cad6-8414-473a-8906-e818d5b4c152	\N	/messages/8bf9cad6-8414-473a-8906-e818d5b4c152	t	2025-12-23 23:19:07.017	\N	2025-12-23 23:13:29.76249
86a5558b-be06-42c3-8567-c5737a33016a	38fa65dc-8d0e-488b-888c-8e0d030a370f	new_message	New message from John Eki	Thank you	8bf9cad6-8414-473a-8906-e818d5b4c152	\N	/messages/8bf9cad6-8414-473a-8906-e818d5b4c152	t	2025-12-26 01:46:58.305	\N	2025-12-23 23:15:31.852429
a213c761-e277-4a65-a9da-f547ba665e0f	bea15756-b2a3-405b-8834-3b7d224c67b5	new_message	New message from justus bwoburu	Hello. Got a job from you. Can we come now ? Please thanks 	ee122851-a6df-43c0-a373-6efb64f366fe	\N	/messages/ee122851-a6df-43c0-a373-6efb64f366fe	t	2026-01-04 19:01:19.262	\N	2026-01-04 18:55:51.565351
b89b9cef-db37-49e8-9cca-5c84c7a28e5e	bea15756-b2a3-405b-8834-3b7d224c67b5	new_message	New message from justus bwoburu	Here for the move 	ee122851-a6df-43c0-a373-6efb64f366fe	\N	/messages/ee122851-a6df-43c0-a373-6efb64f366fe	f	\N	\N	2026-01-04 19:23:28.176146
5b3a57ff-7cb4-4ccf-ae31-abe07885dcba	c8930b20-e428-4e25-87b9-f79bff41bec3	new_message	New message from John Eki	Yes accept the job  and proceed to pickup 	ee122851-a6df-43c0-a373-6efb64f366fe	\N	/messages/ee122851-a6df-43c0-a373-6efb64f366fe	t	2026-01-06 02:35:06.41	\N	2026-01-04 19:01:39.858232
17669286-c258-4f4f-9023-d8f9fdd14ccb	65d807fc-eaae-4407-8a8b-85a28a699047	support_ticket_update	Support Reply	Support has replied to your ticket: "Review of documents "	\N	\N	/support/eb1b0d91-edf3-4b8d-9980-614478f076ec	f	\N	\N	2026-02-01 00:53:14.254524
781fa775-f028-4083-ae22-4a6f015adc97	65d807fc-eaae-4407-8a8b-85a28a699047	support_ticket_update	Support Reply	Support has replied to your ticket: "Review of documents "	\N	\N	/support/eb1b0d91-edf3-4b8d-9980-614478f076ec	f	\N	\N	2026-02-01 01:00:08.813702
ee191eb7-16f5-4c55-b902-8ded937f42be	65d807fc-eaae-4407-8a8b-85a28a699047	support_ticket_update	Support Reply	Support has replied to your ticket: "Days available "	\N	\N	/support/72a35df0-0b5d-470f-a46e-9ae536726676	f	\N	\N	2026-02-01 22:16:35.912527
ccbd4fec-15df-4d36-8e6d-4d53ca54e29f	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	new_message	New message from John Eki	Hi Luke 	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	\N	/messages/e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	f	\N	\N	2026-02-05 20:55:11.2429
b57c8bcf-68b1-4d0c-868d-3cae606d6dc8	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	new_message	New message from John Eki	What's the ETA ?	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	\N	/messages/e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	f	\N	\N	2026-02-05 20:55:24.462715
47407c8e-d352-4e2a-bfc6-14efdc3b93d9	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	new_message	New message from John Eki	Pls come to back Alley.... Garage 	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	\N	/messages/e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	f	\N	\N	2026-02-05 21:45:15.029949
c9604cf2-7de6-4e96-a025-6d9c28c84d71	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	new_message	New message from John Eki	Let me know when you arrive 	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	\N	/messages/e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	f	\N	\N	2026-02-05 21:45:26.514439
f4f9daf0-732f-419e-94da-9e7170f7bfcd	bea15756-b2a3-405b-8834-3b7d224c67b5	new_message	New message from Luke Saunders	At front seeing message now will drive around 	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	\N	/messages/e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	f	\N	\N	2026-02-05 21:49:05.444873
0be9cc4c-0814-4f80-867a-a520997f75fd	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	new_message	New message from John Eki	Thank you 	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	\N	/messages/e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	f	\N	\N	2026-02-05 21:50:14.473104
ede9104a-3e5d-4ccc-a8d5-cd773f16b60e	bea15756-b2a3-405b-8834-3b7d224c67b5	new_message	New message from Luke Saunders	Can you see my location on this trip 	496d7bee-baf6-409d-9621-6845ca2f20d7	\N	/messages/496d7bee-baf6-409d-9621-6845ca2f20d7	f	\N	\N	2026-02-06 01:34:07.534481
4b69a0df-e238-4144-b3a7-54a8819dd14c	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	new_message	New message from John Eki	Yes I can 	496d7bee-baf6-409d-9621-6845ca2f20d7	\N	/messages/496d7bee-baf6-409d-9621-6845ca2f20d7	f	\N	\N	2026-02-06 01:34:21.071678
b48157a3-3c93-4d66-83d3-b2c0d373b303	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	new_message	New message from John Eki	It's live 	496d7bee-baf6-409d-9621-6845ca2f20d7	\N	/messages/496d7bee-baf6-409d-9621-6845ca2f20d7	f	\N	\N	2026-02-06 01:34:27.61504
528a8b2d-5a2e-47db-bf67-0c0cc71dcb1f	65d807fc-eaae-4407-8a8b-85a28a699047	support_ticket_update	Support Reply	Support has replied to your ticket: "Update"	\N	\N	/support/4137c7b2-aab2-4317-b31c-b8935eb192c5	f	\N	\N	2026-02-20 04:13:16.606166
9f5b1d10-4229-49d7-a3c8-ca923ae9fd3b	ac72e389-defb-4204-baa1-c291b6d3fb5f	new_message	New message from Luke Saunders	Greetings gps does not appear to be accurate I am	a32f4978-535c-4639-a58d-113add6fd860	\N	/messages/a32f4978-535c-4639-a58d-113add6fd860	f	\N	\N	2026-02-28 18:04:12.708128
776e4782-00e7-4535-90d0-8e1c1f8bec7f	ac72e389-defb-4204-baa1-c291b6d3fb5f	new_message	New message from Luke Saunders	In back alley near locationn	a32f4978-535c-4639-a58d-113add6fd860	\N	/messages/a32f4978-535c-4639-a58d-113add6fd860	f	\N	\N	2026-02-28 18:04:22.130644
1bca621c-02b8-41dd-a492-f9ce0f0c1015	ac72e389-defb-4204-baa1-c291b6d3fb5f	new_message	New message from Luke Saunders	What is unit number 	a32f4978-535c-4639-a58d-113add6fd860	\N	/messages/a32f4978-535c-4639-a58d-113add6fd860	f	\N	\N	2026-02-28 18:07:22.400266
e20fa0ea-3ea7-485c-9f4d-63815b0d26e4	ac72e389-defb-4204-baa1-c291b6d3fb5f	support_ticket_update	Support Reply	Support has replied to your ticket: "I want to cancel "	\N	\N	/support/e5eafd80-2611-4c09-b7be-faaf9ae7799c	f	\N	\N	2026-03-01 19:54:31.530404
a4615330-ac97-42de-a417-f33facf8cea5	66904619-efab-45ee-988f-1a94af36a287	support_ticket_update	Support Reply	Support has replied to your ticket: "Need verification "	\N	\N	/support/a9009571-ed23-4e26-88db-22ad53588ce6	f	\N	\N	2026-03-19 22:46:49.164146
74218424-fe5a-4b93-9419-aac09a74a6fe	66904619-efab-45ee-988f-1a94af36a287	support_ticket_update	Support Reply	Support has replied to your ticket: "Need verification "	\N	\N	/support/a9009571-ed23-4e26-88db-22ad53588ce6	f	\N	\N	2026-03-23 22:40:58.448017
74b9c981-c19b-407e-a658-c4d00aa42591	66904619-efab-45ee-988f-1a94af36a287	support_ticket_update	Support Reply	Support has replied to your ticket: "Need verification "	\N	\N	/support/a9009571-ed23-4e26-88db-22ad53588ce6	f	\N	\N	2026-03-25 21:10:50.780523
d1c6ea6f-7d60-4a23-a55c-66a6bafb66fa	bea15756-b2a3-405b-8834-3b7d224c67b5	new_message	New message from Luke Saunders	Arrived 	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	\N	/messages/e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	t	2026-03-27 21:44:10.227	\N	2026-02-05 21:50:29.160066
a56147ea-1c5c-420b-9865-049ac4fe0c72	66904619-efab-45ee-988f-1a94af36a287	support_ticket_update	Support Reply	Support has replied to your ticket: "Difficult to get job"	\N	\N	/support/4a9be2bb-a0fb-4fe0-a616-f13e997cfa38	f	\N	\N	2026-04-02 02:10:37.390434
5607f6f8-8775-4bd3-97df-c840e1011027	6ea5f58e-1c64-4074-a426-b30ac60e5097	new_message	New message from Akwarandu chukwudi 	Hi	4eb15b25-2b65-4397-a6c0-92065c8da2fa	\N	/messages/4eb15b25-2b65-4397-a6c0-92065c8da2fa	f	\N	\N	2026-04-16 01:17:32.093
8fc45ff9-e9af-4f97-a2ed-649f841e8a1a	6ea5f58e-1c64-4074-a426-b30ac60e5097	new_message	New message from Akwarandu chukwudi 	Good evening, how are doing today	4eb15b25-2b65-4397-a6c0-92065c8da2fa	\N	/messages/4eb15b25-2b65-4397-a6c0-92065c8da2fa	f	\N	\N	2026-04-16 01:17:54.269856
841b4398-d113-412a-a2f0-a6e390b48f2b	c8930b20-e428-4e25-87b9-f79bff41bec3	job_assigned	New Job Assigned	You have been assigned a move from 315 50 Ave SW #105, Calgary, AB, Canada to 5075 26 Ave SE, Calgary, AB, Canada	11161561-7b74-421e-915a-2ab1bbd1ad69	\N	\N	f	\N	\N	2026-04-26 00:14:42.51094
4725324f-a88a-4853-ad7d-87c8b9b968ca	3724c9bc-c17c-46e4-91eb-c6763ab09999	mover_assigned	Mover Assigned	justus bwoburu has been assigned to your move	11161561-7b74-421e-915a-2ab1bbd1ad69	\N	\N	f	\N	\N	2026-04-26 00:14:42.612578
51852dc6-b5f6-47ed-afee-29b8ef45d308	3724c9bc-c17c-46e4-91eb-c6763ab09999	new_message	New message from justus bwoburu	Hello. Can we come now 	11161561-7b74-421e-915a-2ab1bbd1ad69	\N	/messages/11161561-7b74-421e-915a-2ab1bbd1ad69	f	\N	\N	2026-04-26 18:11:05.894621
41e45aab-2d38-47c9-a213-31a143a68136	c0f633be-1dd5-4c59-a440-f79aebc8c596	job_assigned	New Job Assigned	You have been assigned a move from 7180 80 Ave NE, Calgary, AB, Canada to 395 Skyview Parkway Northeast, Calgary, AB, Canada	2aac34d5-1d66-4724-8437-6aeb6d76b559	\N	\N	f	\N	\N	2026-04-27 00:29:43.50123
33ade229-4358-4ca5-90f5-049e5b0e6436	fcb9627c-280b-4fa3-a84e-7334b55aece3	mover_assigned	Mover Assigned	Fernando Salinas  has been assigned to your move	2aac34d5-1d66-4724-8437-6aeb6d76b559	\N	\N	f	\N	\N	2026-04-27 00:29:43.650143
b3f57ba5-fc78-436b-97f4-db931a05c3f5	a3e3a896-7063-45f6-84e1-1cb0e252675e	job_assigned	New Job Assigned	You have been assigned a move from 7180 80 Ave NE, Calgary, AB, Canada to 395 Skyview Parkway Northeast, Calgary, AB, Canada	2aac34d5-1d66-4724-8437-6aeb6d76b559	\N	\N	f	\N	\N	2026-04-27 01:31:39.334637
1af45a53-dd71-44f5-9c5e-964a6763bf92	fcb9627c-280b-4fa3-a84e-7334b55aece3	mover_assigned	Mover Assigned	Ali raza has been assigned to your move	2aac34d5-1d66-4724-8437-6aeb6d76b559	\N	\N	f	\N	\N	2026-04-27 01:31:39.425647
de7f57c4-887b-4a73-9cf1-9040cfa5f64f	fcb9627c-280b-4fa3-a84e-7334b55aece3	new_message	New message from Ali raza	Which building 	2aac34d5-1d66-4724-8437-6aeb6d76b559	\N	/messages/2aac34d5-1d66-4724-8437-6aeb6d76b559	f	\N	\N	2026-04-27 02:22:40.631467
40f9ede8-4aeb-4a74-91a3-de5b2354e977	38fa65dc-8d0e-488b-888c-8e0d030a370f	job_assigned	New Job Assigned	You have been assigned a move from 10349 Cityscape Dr NE, Calgary, AB T3N 1N5, Canada to 25 Belvedere Park Southeast, Calgary, AB, Canada	ffc36ceb-21d1-47a0-97cf-1563428a8cb0	\N	\N	f	\N	\N	2026-05-05 17:01:50.366288
431f8774-d35b-493b-b9fa-9e250ef95e18	ac43dfba-a25b-4da5-a433-92ad09a23e0b	mover_assigned	Mover Assigned	Mbeku o has been assigned to your move	ffc36ceb-21d1-47a0-97cf-1563428a8cb0	\N	\N	f	\N	\N	2026-05-05 17:01:50.463625
de616819-e9bd-4e06-87fe-4bee45f7fce2	58413582-e6f3-4bf2-b488-b899f7babd31	verification_update	BACKGROUND_CHECK Approved	Your BACKGROUND_CHECK has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-06-27 20:13:27.121378
918f09ed-85f2-401a-a800-c81b7b1e42f3	58413582-e6f3-4bf2-b488-b899f7babd31	verification_update	ID Approved	Your ID has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-06-27 20:13:55.83678
7786462b-08a0-4c8a-8cc4-8ced4bcdaecb	58413582-e6f3-4bf2-b488-b899f7babd31	verification_update	DRIVERS_LICENSE Approved	Your DRIVERS_LICENSE has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-06-27 20:14:15.370435
64cc952d-184c-45a2-aef9-18101468b677	58413582-e6f3-4bf2-b488-b899f7babd31	verification_update	BACKGROUND_CHECK Approved	Your BACKGROUND_CHECK has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-07-01 21:11:21.272732
02133066-73fb-4890-8203-6210c2537a4f	58413582-e6f3-4bf2-b488-b899f7babd31	verification_update	INSURANCE Approved	Your INSURANCE has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-07-01 21:12:46.179273
600e8869-5aaf-40af-870a-5bd7b587c56c	58413582-e6f3-4bf2-b488-b899f7babd31	verification_update	VEHICLE_REGISTRATION Approved	Your VEHICLE_REGISTRATION has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-07-01 21:13:21.64227
1ce7bd12-ee80-47d4-80e4-da50906ce132	58413582-e6f3-4bf2-b488-b899f7babd31	verification_update	ID Approved	Your ID has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-07-07 20:14:38.558103
3b663d82-8ba9-4ff1-875d-64f31be4d53f	58413582-e6f3-4bf2-b488-b899f7babd31	verification_update	VEHICLE_PHOTOS Approved	Your VEHICLE_PHOTOS has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-07-07 20:15:13.815942
337c6091-7c1d-40bf-9e91-d99e46c966ab	58413582-e6f3-4bf2-b488-b899f7babd31	verification_update	PAYOUT_SETUP Approved	Your PAYOUT_SETUP has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-07-07 20:21:29.101082
0bf94955-0d3a-4637-bcdc-f332b58c8e58	bea15756-b2a3-405b-8834-3b7d224c67b5	mover_assigned	Mover Assigned	Great news! Khushal Khushal has been assigned to your move.	5c653d68-23c8-4d1a-835d-7bed22ee5a95	\N	/my-bookings	f	\N	\N	2026-07-10 18:51:44.548268
f38de901-3faa-404a-9e2f-2f072555e4e3	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	job_opportunity	Job Accepted	You've successfully accepted a new job!	5c653d68-23c8-4d1a-835d-7bed22ee5a95	\N	/mover-dashboard	f	\N	\N	2026-07-10 18:51:44.617989
7e81e6d2-da1d-4a52-a958-c5bb11c6cdbd	58413582-e6f3-4bf2-b488-b899f7babd31	job_assigned	New Job Assigned	You have been assigned a move from 4523 75 Street Northwest, Calgary, AB, Canada to 14540 1 Street Northwest, Calgary, AB, Canada	d86cbb19-c971-401c-a4ab-eba90424e4b6	\N	\N	f	\N	\N	2026-07-12 03:14:20.101148
d4d02586-b4bc-4f2a-9a29-0320705ecf8f	02073e48-8786-455f-96ec-789cfb40b633	mover_assigned	Mover Assigned	Tasfit kleta has been assigned to your move	d86cbb19-c971-401c-a4ab-eba90424e4b6	\N	\N	f	\N	\N	2026-07-12 03:14:20.210453
100a0dbf-fc01-43e3-8c48-82def9d330d6	50d5c5cf-d522-4aff-a090-2f317304e556	mover_assigned	Mover Assigned	Great news! Khushal Khushal has been assigned to your move.	6ac14c1a-838e-4b99-943a-457e970be405	\N	/my-bookings	f	\N	\N	2026-07-29 01:25:09.866046
53822631-056f-4aa2-88d4-f3a09b1c7e79	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	job_opportunity	Job Accepted	You've successfully accepted a new job!	6ac14c1a-838e-4b99-943a-457e970be405	\N	/mover-dashboard	f	\N	\N	2026-07-29 01:25:09.926639
f2ae1547-f4ff-4e3b-b95f-6ea0a36e97d8	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	job_assigned	New Job Assigned	You have been assigned a move from 10349 Cityscape Drive Northeast, Calgary, AB, Canada to 14786 1 Street Northwest, Calgary, AB, Canada	85ac89ac-b9ee-4ec4-9e9b-b91d1cc78d4d	\N	\N	f	\N	\N	2026-08-05 19:02:02.705164
a429b98d-f5a4-4061-bf00-3ed916b655cf	2cdd1c03-4421-4711-88c0-40e99865f5ed	mover_assigned	Mover Assigned	Khushal Khushal has been assigned to your move	85ac89ac-b9ee-4ec4-9e9b-b91d1cc78d4d	\N	\N	f	\N	\N	2026-08-05 19:02:02.810121
a45108f3-0dc3-42a4-84c7-3b42324c1ce5	2cdd1c03-4421-4711-88c0-40e99865f5ed	new_message	New message from Khushal Khushal	Hii i am here 	85ac89ac-b9ee-4ec4-9e9b-b91d1cc78d4d	\N	/messages/85ac89ac-b9ee-4ec4-9e9b-b91d1cc78d4d	f	\N	\N	2026-08-05 20:04:41.621654
dfd5a2ac-73aa-404d-8473-f61e4a143bf9	5e33efa5-cfb6-4083-9860-61668eb028f3	mover_assigned	Mover Assigned	Great news! Khushal Khushal has been assigned to your move.	763dbbae-612d-4668-b16a-55582e9f92ef	\N	/my-bookings	f	\N	\N	2026-08-07 21:10:19.292103
6ca58e5b-c603-4599-b941-8a05ca502cbf	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	job_opportunity	Job Accepted	You've successfully accepted a new job!	763dbbae-612d-4668-b16a-55582e9f92ef	\N	/mover-dashboard	f	\N	\N	2026-08-07 21:10:19.350363
9a6b169a-dda5-47ee-8be6-1eeb486e9cc8	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	new_message	New message from Mohamed jliban 	Hello the sofa is back of the house 	763dbbae-612d-4668-b16a-55582e9f92ef	\N	/messages/763dbbae-612d-4668-b16a-55582e9f92ef	f	\N	\N	2026-08-07 21:22:18.130382
51b83398-9699-4b5a-8388-2678f1235c88	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	new_message	New message from Mohamed jliban 	Are you in the way 	763dbbae-612d-4668-b16a-55582e9f92ef	\N	/messages/763dbbae-612d-4668-b16a-55582e9f92ef	f	\N	\N	2026-08-07 21:22:31.261163
0386c9c6-235e-407a-9405-f10a10c6ce85	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	new_message	New message from Mohamed jliban 	I will go outside are you near	763dbbae-612d-4668-b16a-55582e9f92ef	\N	/messages/763dbbae-612d-4668-b16a-55582e9f92ef	f	\N	\N	2026-08-07 21:47:03.830682
bacb39d5-aa1a-467b-afcb-fcd71521e830	65d807fc-eaae-4407-8a8b-85a28a699047	verification_update	DRIVERS_LICENSE Approved	Your DRIVERS_LICENSE has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-08-13 21:05:13.080341
ed1aafc9-a9df-42f3-a8f7-91ffd4561f61	65d807fc-eaae-4407-8a8b-85a28a699047	verification_update	ID Approved	Your ID has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-08-13 21:06:38.773243
42d3a7b3-9a08-4d0e-94f2-1c6454c860ab	65d807fc-eaae-4407-8a8b-85a28a699047	verification_update	INSURANCE Not Approved	One or more documents were not approved. Please re-upload.	\N	\N	/mover-verification	f	\N	\N	2026-08-13 21:08:49.530418
4d49411f-4eea-4d22-afa0-1b1a4cc19554	008bbd4d-55f1-4b6c-aafd-b9908cfffcdc	mover_assigned	Mover Assigned	Great news! Tasfit kleta has been assigned to your move.	24376126-5a19-4a17-bd08-117a73a68c5c	\N	/my-bookings	f	\N	\N	2026-08-13 22:04:05.200016
e1a99cee-d1bd-41d2-ace6-b1159315d67e	58413582-e6f3-4bf2-b488-b899f7babd31	job_opportunity	Job Accepted	You've successfully accepted a new job!	24376126-5a19-4a17-bd08-117a73a68c5c	\N	/mover-dashboard	f	\N	\N	2026-08-13 22:04:05.260138
9a286b33-a655-48ea-a54b-44444aefaf98	58413582-e6f3-4bf2-b488-b899f7babd31	new_message	New message from Fereshteh hasanzadeh	Hi, I hope you are doing well!	24376126-5a19-4a17-bd08-117a73a68c5c	\N	/messages/24376126-5a19-4a17-bd08-117a73a68c5c	f	\N	\N	2026-08-15 20:19:34.66873
7af6afad-6af9-4700-a0e8-b082f4ed6139	58413582-e6f3-4bf2-b488-b899f7babd31	new_message	New message from Fereshteh hasanzadeh	May I know when exactly you will in pick up position?	24376126-5a19-4a17-bd08-117a73a68c5c	\N	/messages/24376126-5a19-4a17-bd08-117a73a68c5c	f	\N	\N	2026-08-15 20:19:57.505173
1eea835c-62f4-4805-b978-2340e2d84ff0	58413582-e6f3-4bf2-b488-b899f7babd31	new_message	New message from Fereshteh hasanzadeh	Do you have my phone number?	24376126-5a19-4a17-bd08-117a73a68c5c	\N	/messages/24376126-5a19-4a17-bd08-117a73a68c5c	f	\N	\N	2026-08-15 20:20:13.531885
e7e8ff13-58f5-4967-9f5f-66330c9a67b7	58413582-e6f3-4bf2-b488-b899f7babd31	new_message	New message from Fereshteh hasanzadeh	it is 5878995559 please call me whenever you arrived	24376126-5a19-4a17-bd08-117a73a68c5c	\N	/messages/24376126-5a19-4a17-bd08-117a73a68c5c	f	\N	\N	2026-08-15 20:20:38.095581
e0e21c99-b5cf-4439-bf35-8a94cc60d425	58413582-e6f3-4bf2-b488-b899f7babd31	new_message	New message from Fereshteh hasanzadeh	Fereshteh	24376126-5a19-4a17-bd08-117a73a68c5c	\N	/messages/24376126-5a19-4a17-bd08-117a73a68c5c	f	\N	\N	2026-08-15 20:20:53.214751
5df71260-2771-457c-8e61-b7b32da33eed	58413582-e6f3-4bf2-b488-b899f7babd31	new_message	New message from Fereshteh hasanzadeh	Hi	24376126-5a19-4a17-bd08-117a73a68c5c	\N	/messages/24376126-5a19-4a17-bd08-117a73a68c5c	f	\N	\N	2026-08-15 20:52:38.041438
d4370216-66d2-4390-ac3c-6d882d911da3	58413582-e6f3-4bf2-b488-b899f7babd31	new_message	New message from Fereshteh hasanzadeh	Hello	24376126-5a19-4a17-bd08-117a73a68c5c	\N	/messages/24376126-5a19-4a17-bd08-117a73a68c5c	f	\N	\N	2026-08-15 21:02:14.781078
2ecbddc2-d903-4a30-b7c2-bb991a271593	58413582-e6f3-4bf2-b488-b899f7babd31	verification_update	INSURANCE Approved	Your INSURANCE has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-08-21 20:27:58.327875
abb245b8-2c6b-4de9-afc5-c0cadbc02558	c0f633be-1dd5-4c59-a440-f79aebc8c596	verification_update	ID Approved	Your ID has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-08-21 20:28:36.624057
a97f710c-2ce7-4bec-bd74-6e1cee91b714	c0f633be-1dd5-4c59-a440-f79aebc8c596	verification_update	DRIVERS_LICENSE Approved	Your DRIVERS_LICENSE has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-08-21 20:28:53.823374
7611c7df-33f7-4a6a-ba3a-cfb4fc81a0f2	c0f633be-1dd5-4c59-a440-f79aebc8c596	verification_update	VEHICLE_PHOTOS Approved	Your VEHICLE_PHOTOS has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-08-21 20:29:14.041745
e5a131bf-578e-47b3-825d-d6eed4b26ad9	c0f633be-1dd5-4c59-a440-f79aebc8c596	verification_update	INSURANCE Not Approved	One or more documents were not approved. Please re-upload.	\N	\N	/mover-verification	f	\N	\N	2026-08-21 20:30:25.893829
ae5a1371-c806-40dd-8f1a-4b1acea2f340	c0f633be-1dd5-4c59-a440-f79aebc8c596	verification_update	VEHICLE_REGISTRATION Approved	Your VEHICLE_REGISTRATION has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-08-21 20:30:46.475678
bdbb21e2-5cf8-492a-8892-69a92b721eec	c0f633be-1dd5-4c59-a440-f79aebc8c596	verification_update	PAYOUT_SETUP Approved	Your PAYOUT_SETUP has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-08-21 20:30:55.564281
61e5dba8-096b-4dfb-9caf-9b4de2f9dae2	446c5dfe-bd26-4387-aa1a-af333b7e503a	mover_assigned	Mover Assigned	Great news! Khushal Khushal has been assigned to your move.	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	/my-bookings	f	\N	\N	2026-08-28 20:11:29.413433
2ea2a4d9-5bc1-49b8-882a-0a2b8b39955a	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	job_opportunity	Job Accepted	You've successfully accepted a new job!	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	/mover-dashboard	f	\N	\N	2026-08-28 20:11:29.475567
89e0b9c2-7986-4a39-b436-3ff6ee182c43	446c5dfe-bd26-4387-aa1a-af333b7e503a	booking_update	Your Mover Cancelled	Your mover had to cancel. We're finding another great mover nearby — hang tight!	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	/my-bookings	f	\N	\N	2026-08-28 20:12:28.926615
4d9223d3-8099-4eee-83a2-4faeb1d03849	bcd90e7c-f434-48d4-9bda-02c3f019fd8e	verification_update	ID Approved	Your ID has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-08-28 20:36:34.951227
b04d5226-dca0-4759-8c23-af7b470f8a6c	bcd90e7c-f434-48d4-9bda-02c3f019fd8e	verification_update	ID Approved	Your ID has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-08-28 20:36:54.681181
40da97be-3f83-45b2-af78-27181a4bf5d2	bcd90e7c-f434-48d4-9bda-02c3f019fd8e	verification_update	DRIVERS_LICENSE Approved	Your DRIVERS_LICENSE has been approved. You're one step closer to going online!	\N	\N	/mover-verification	f	\N	\N	2026-08-28 20:37:15.284271
768959cc-c513-4687-adfc-151ed46fd762	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	job_assigned	New Job Assigned	You have been assigned a move from 450 Carringvue Grove Northwest, Calgary, AB, Canada to 743 Livingston Way Northeast, Balzac, AB, Canada	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	\N	f	\N	\N	2026-08-29 01:45:44.562546
51d02ef7-329d-48e4-a051-fabed416da1b	446c5dfe-bd26-4387-aa1a-af333b7e503a	mover_assigned	Mover Assigned	Khushal Khushal has been assigned to your move	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	\N	f	\N	\N	2026-08-29 01:45:44.672011
198b32d9-5376-49e8-a207-ea97956b248e	446c5dfe-bd26-4387-aa1a-af333b7e503a	new_message	New message from Khushal Khushal	Hello,  I&#x2019;m writing to confirm that I will be arriving tomorrow at approx...	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	/messages/0e07fbd6-fb32-4924-86a0-c87d3b47b294	f	\N	\N	2026-08-30 02:32:49.698269
515263c9-645e-4dd2-bcc7-e53aa276deaa	446c5dfe-bd26-4387-aa1a-af333b7e503a	new_message	New message from Khushal Khushal	I am*	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	/messages/0e07fbd6-fb32-4924-86a0-c87d3b47b294	f	\N	\N	2026-08-30 02:33:21.443365
091b7dea-3a8d-4348-9d40-0676c9c582fd	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	new_message	New message from Halimah Sanni-mubarak	Thanks for reaching out.	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	/messages/0e07fbd6-fb32-4924-86a0-c87d3b47b294	f	\N	\N	2026-08-30 18:00:47.422432
cdf3d3f0-9636-4e7d-ba8c-20b6550e323b	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	new_message	New message from Halimah Sanni-mubarak	Moving is now on Tuesday, will update you tomorrow 	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	/messages/0e07fbd6-fb32-4924-86a0-c87d3b47b294	f	\N	\N	2026-08-30 18:01:16.395651
3656b0ac-a17c-4424-ad49-4e6a42759a41	38fa65dc-8d0e-488b-888c-8e0d030a370f	job_assigned	New Job Assigned	You have been assigned a move from 450 Carringvue Grove Northwest, Calgary, AB, Canada to 743 Livingston Way Northeast, Balzac, AB, Canada	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	\N	f	\N	\N	2026-09-01 00:57:34.535035
6c5a1ab3-c734-45a9-98fe-254baee7c780	446c5dfe-bd26-4387-aa1a-af333b7e503a	mover_assigned	Mover Assigned	Mbeku o has been assigned to your move	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	\N	f	\N	\N	2026-09-01 00:57:34.64676
d98bb425-eb92-4074-86c6-7bb504a73635	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	job_assigned	New Job Assigned	You have been assigned a move from 450 Carringvue Grove Northwest, Calgary, AB, Canada to 743 Livingston Way Northeast, Balzac, AB, Canada	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	\N	f	\N	\N	2026-09-01 00:59:10.148893
4b56e4b0-030f-42ca-a823-8efcd3b34368	446c5dfe-bd26-4387-aa1a-af333b7e503a	mover_assigned	Mover Assigned	Khushal Khushal has been assigned to your move	0e07fbd6-fb32-4924-86a0-c87d3b47b294	\N	\N	f	\N	\N	2026-09-01 00:59:10.25099
4fd4d93a-822a-44b0-a5c8-3a2a1a935e76	bcd90e7c-f434-48d4-9bda-02c3f019fd8e	job_assigned	New Job Assigned	You have been assigned a move from 40 Kingsland Pl SW, Calgary, AB, Canada to 923 15 Ave SW, Calgary, AB, Canada	be06ce8a-b02e-4106-834d-3e65d4f07883	\N	\N	f	\N	\N	2026-09-01 03:14:07.168371
4e1c1128-31b1-4f0f-a667-722307ab7256	fb6f03ed-996c-482c-8312-934d14a9d630	mover_assigned	Mover Assigned	Aaron Atat has been assigned to your move	be06ce8a-b02e-4106-834d-3e65d4f07883	\N	\N	f	\N	\N	2026-09-01 03:14:07.255228
\.


--
-- Data for Name: item_feedback; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.item_feedback (id, identified_item_id, booking_id, submitted_by, submitter_role, original_item_name, original_category, original_weight_kg, original_volume_cuft, original_vehicle_type, corrected_item_name, corrected_category, corrected_weight_kg, corrected_volume_cuft, corrected_vehicle_type, feedback_reason, feedback_notes, processed_for_learning, processed_at, created_at) FROM stdin;
\.


--
-- Data for Name: job_notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.job_notifications (id, booking_id, mover_id, distance_to_pickup, estimated_earnings, status, notified_at, responded_at, expires_at) FROM stdin;
17d5a357-6788-4452-b407-9c0cfbab321a	85ac89ac-b9ee-4ec4-9e9b-b91d1cc78d4d	605c6dad-cfed-43ba-99a1-8cb89c0516f8	0.00	69.29	accepted	2026-08-05 19:02:01.558025	\N	2026-08-12 19:02:01.539
1d0b11d9-eb9d-42c7-8c19-722054eb27b9	11161561-7b74-421e-915a-2ab1bbd1ad69	2437c092-cd4a-4b58-826e-504858d822fa	0.00	179.13	accepted	2026-04-26 00:14:41.681325	\N	2026-05-03 00:14:41.661
3b8f98bf-e813-4708-8e26-1b28d534005b	763dbbae-612d-4668-b16a-55582e9f92ef	605c6dad-cfed-43ba-99a1-8cb89c0516f8	7.44	51.97	accepted	2026-08-07 21:07:50.041433	2026-08-07 21:10:18.255	2026-08-07 21:17:50.023
f1abc7d2-a5f2-447c-8243-cf26273dd099	763dbbae-612d-4668-b16a-55582e9f92ef	233e4ec8-9cd2-4bfe-b7a6-51072118a347	6.59	51.97	expired	2026-08-07 20:34:26.015255	2026-08-07 21:10:18.309	2026-08-07 20:44:25.992
4f09e5ca-9103-456b-95b2-2216a187a3a4	763dbbae-612d-4668-b16a-55582e9f92ef	0b73ed6b-5f7c-4db2-b50d-b4cde41bbfd2	7.06	51.97	expired	2026-08-07 20:34:26.161285	2026-08-07 21:10:18.309	2026-08-07 20:44:25.992
f1a54cd6-10b9-4cd3-809a-33702b2c2663	763dbbae-612d-4668-b16a-55582e9f92ef	157317e3-27e1-4691-9042-e219ad1f4db5	6.68	51.97	expired	2026-08-07 20:34:26.177042	2026-08-07 21:10:18.309	2026-08-07 20:44:25.992
27c17ca0-f715-4ce2-85de-f32c6db5538b	24376126-5a19-4a17-bd08-117a73a68c5c	1abbfcc3-03d0-4887-a557-54cda5dddf19	12.05	44.33	accepted	2026-08-13 22:03:35.420833	2026-08-13 22:04:04.229	2026-08-13 22:13:35.402
e432c8df-18ef-42da-add5-61ebfbcbbc73	24376126-5a19-4a17-bd08-117a73a68c5c	30bba7ff-a9e9-48f4-bdcd-0b196fd22b11	3.50	44.33	expired	2026-08-10 20:51:08.933863	2026-08-13 22:04:04.279	2026-08-10 21:01:08.913
8bb40f47-9190-4055-871f-51fb478688b7	24376126-5a19-4a17-bd08-117a73a68c5c	9993c884-11f1-4eb8-a2e8-c2b4938d69dd	7.00	44.33	expired	2026-08-10 20:51:09.084259	2026-08-13 22:04:04.279	2026-08-10 21:01:08.913
48c4f7ee-fc26-4f84-ad02-40cd33837e4b	24376126-5a19-4a17-bd08-117a73a68c5c	b1ebaf48-757d-498a-8c91-f41a17a60664	8.83	44.33	expired	2026-08-10 20:51:09.08974	2026-08-13 22:04:04.279	2026-08-10 21:01:08.913
8c259b5e-c185-48af-8c4a-19b70ab8cc71	24376126-5a19-4a17-bd08-117a73a68c5c	aa2cde65-b901-4fc5-895c-c8baad294a2e	13.86	44.33	expired	2026-08-13 21:11:23.959593	2026-08-13 22:04:04.279	2026-08-13 21:21:23.939
82e4c707-ef79-4e73-b7cc-f767a57a4e15	2aac34d5-1d66-4724-8437-6aeb6d76b559	1b901406-1947-49ba-80a9-3e8a477c8957	0.00	69.76	accepted	2026-04-27 01:31:38.415457	\N	2026-05-04 01:31:38.395
13a06da3-3094-4e74-8902-955bc3362977	ffc36ceb-21d1-47a0-97cf-1563428a8cb0	aa2cde65-b901-4fc5-895c-c8baad294a2e	0.00	64.73	accepted	2026-05-05 17:01:49.76735	\N	2026-05-12 17:01:49.749
02d8936c-6925-4ab9-b707-064ccb32e09f	be06ce8a-b02e-4106-834d-3e65d4f07883	e55370ff-6128-4b54-96d7-6b97faa1e305	0.00	67.96	accepted	2026-09-01 03:14:05.862956	\N	2026-09-08 03:14:05.844
37f93cb9-f496-4b21-aa2b-f12eed80e579	5c653d68-23c8-4d1a-835d-7bed22ee5a95	605c6dad-cfed-43ba-99a1-8cb89c0516f8	9.79	101.42	accepted	2026-07-10 18:50:25.055744	2026-07-10 18:51:43.558	2026-07-10 19:00:24.875
321afeb7-9c0d-49ba-96a6-01e70f69fd14	5c653d68-23c8-4d1a-835d-7bed22ee5a95	1abbfcc3-03d0-4887-a557-54cda5dddf19	3.59	101.42	expired	2026-07-10 18:50:24.897565	2026-07-10 18:51:43.608	2026-07-10 19:00:24.875
be1a9e53-f2f4-4d88-9eb9-3e6f1194fe1a	5c653d68-23c8-4d1a-835d-7bed22ee5a95	30bba7ff-a9e9-48f4-bdcd-0b196fd22b11	4.56	101.42	expired	2026-07-10 18:50:24.896957	2026-07-10 18:51:43.608	2026-07-10 19:00:24.875
4e7ba728-670f-4a7c-a47a-66315224d8bd	5c653d68-23c8-4d1a-835d-7bed22ee5a95	a003a8cb-58c2-4b66-8154-17cc72c46e56	7.80	101.42	expired	2026-07-10 18:50:25.051416	2026-07-10 18:51:43.608	2026-07-10 19:00:24.875
3edda260-2d21-4873-add1-2ca0999d3b55	5c653d68-23c8-4d1a-835d-7bed22ee5a95	15a904b7-4267-4b96-8a9f-548f603fda3d	8.07	101.42	expired	2026-07-10 18:50:25.055404	2026-07-10 18:51:43.608	2026-07-10 19:00:24.875
549d9ed3-ca79-49c6-aaf2-7bec48eef7ce	32e361d9-afa5-458c-ac10-498d6d509b7a	9993c884-11f1-4eb8-a2e8-c2b4938d69dd	2.00	45.14	pending	2026-07-11 21:28:36.357583	\N	2026-07-11 21:38:36.337
454dc509-a3f0-4276-ab97-29f5fdb3d490	32e361d9-afa5-458c-ac10-498d6d509b7a	b1ebaf48-757d-498a-8c91-f41a17a60664	1.31	45.14	pending	2026-07-11 21:28:36.358603	\N	2026-07-11 21:38:36.337
6baa6bf6-bbb0-44fb-a994-07476425a412	32e361d9-afa5-458c-ac10-498d6d509b7a	8a964228-a8fc-41c9-a49e-d393cd29f1c6	2.56	45.14	pending	2026-07-11 21:28:36.358138	\N	2026-07-11 21:38:36.337
c0a0e864-6c4a-451d-b114-c408a0e2a830	32e361d9-afa5-458c-ac10-498d6d509b7a	7cba5209-a0b9-4ad6-82d4-643a085c5405	5.68	45.14	pending	2026-07-11 21:28:36.503155	\N	2026-07-11 21:38:36.337
7d4fb959-7632-4d5c-82e6-d042cf5a73e8	32e361d9-afa5-458c-ac10-498d6d509b7a	eb7dfc14-6c71-4def-ae98-8d1abdd07fc7	6.46	45.14	pending	2026-07-11 21:28:36.50659	\N	2026-07-11 21:38:36.337
c120a390-0208-4992-a5fa-77edab0b36a5	d86cbb19-c971-401c-a4ab-eba90424e4b6	1abbfcc3-03d0-4887-a557-54cda5dddf19	0.00	71.57	accepted	2026-07-12 03:14:19.235807	\N	2026-07-19 03:14:19.218
42877c38-f307-4570-afe6-2d6721b6db1c	763dbbae-612d-4668-b16a-55582e9f92ef	64d3cbb5-bba3-429c-9d4a-cdd69237152c	1.74	51.97	expired	2026-08-07 20:34:26.014157	2026-08-07 21:10:18.309	2026-08-07 20:44:25.992
3a231cc7-aca9-447a-9b07-b48113a7e6d2	763dbbae-612d-4668-b16a-55582e9f92ef	e55370ff-6128-4b54-96d7-6b97faa1e305	7.15	51.97	expired	2026-08-07 20:34:26.170519	2026-08-07 21:10:18.309	2026-08-07 20:44:25.992
c8a00c4c-a1fa-424c-8d7e-1741c7b914ba	6ac14c1a-838e-4b99-943a-457e970be405	605c6dad-cfed-43ba-99a1-8cb89c0516f8	0.00	47.07	accepted	2026-07-29 01:24:46.911212	2026-07-29 01:25:09.057	2026-07-29 01:34:46.891
d8f3c3fc-7478-4721-9df8-aa5f6e78d377	6ac14c1a-838e-4b99-943a-457e970be405	157317e3-27e1-4691-9042-e219ad1f4db5	1.17	47.07	expired	2026-07-29 01:24:46.910549	2026-07-29 01:25:09.104	2026-07-29 01:34:46.891
277a2cbf-4602-4ac7-992d-9fdff3c1f538	6ac14c1a-838e-4b99-943a-457e970be405	15a904b7-4267-4b96-8a9f-548f603fda3d	4.07	47.07	expired	2026-07-29 01:24:47.056253	2026-07-29 01:25:09.104	2026-07-29 01:34:46.891
2b19ea3b-b9dd-4532-b894-cc567f7b053f	6ac14c1a-838e-4b99-943a-457e970be405	f7f7a53f-fb27-4301-9d9d-a051544be171	2.54	47.07	expired	2026-07-29 01:24:47.062814	2026-07-29 01:25:09.104	2026-07-29 01:34:46.891
3d81f9a0-4001-492d-89f4-9f5473538637	6ac14c1a-838e-4b99-943a-457e970be405	0b73ed6b-5f7c-4db2-b50d-b4cde41bbfd2	3.02	47.07	expired	2026-07-29 01:24:47.066108	2026-07-29 01:25:09.104	2026-07-29 01:34:46.891
4fe10dee-8c36-4bc5-9ac3-a7b4d92456b5	24376126-5a19-4a17-bd08-117a73a68c5c	8a964228-a8fc-41c9-a49e-d393cd29f1c6	6.66	44.33	expired	2026-08-10 20:51:08.933382	2026-08-13 22:04:04.279	2026-08-10 21:01:08.913
280c3373-1053-4366-8fe0-d23ac47fe68d	24376126-5a19-4a17-bd08-117a73a68c5c	233e4ec8-9cd2-4bfe-b7a6-51072118a347	7.71	44.33	expired	2026-08-10 20:51:09.087	2026-08-13 22:04:04.279	2026-08-10 21:01:08.913
61d440d7-9016-4a0b-9fa4-849b5f611490	0e07fbd6-fb32-4924-86a0-c87d3b47b294	605c6dad-cfed-43ba-99a1-8cb89c0516f8	0.00	95.68	accepted	2026-09-01 00:59:08.983699	\N	2026-09-08 00:59:08.964
\.


--
-- Data for Name: learning_insights; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.learning_insights (id, insight_type, period_start, period_end, sample_size, accuracy_percent, avg_error_percent, category_breakdown, vehicle_class_breakdown, recommendations, adjustment_factors, created_at) FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.messages (id, booking_id, sender_id, text, created_at, read_at) FROM stdin;
c92c6d6f-cd92-436e-bf4d-22cc54a9aa8a	d8431b18-73d9-4982-a93e-683d55e98b35	bea15756-b2a3-405b-8834-3b7d224c67b5	Hi	2025-12-08 13:58:42.633421	\N
ab400c60-165f-4565-a6ca-e5fcd40e1af1	d8431b18-73d9-4982-a93e-683d55e98b35	bea15756-b2a3-405b-8834-3b7d224c67b5	Hi	2025-12-08 17:39:26.267095	\N
b9bb2520-12a5-4721-96df-8cc52ccf1bda	d8431b18-73d9-4982-a93e-683d55e98b35	bea15756-b2a3-405b-8834-3b7d224c67b5	Thank you for accepting to pickup 	2025-12-08 19:15:52.239631	\N
dd2a6c0a-80c4-43ff-bdc1-1b50ffdfc7dd	496d7bee-baf6-409d-9621-6845ca2f20d7	bea15756-b2a3-405b-8834-3b7d224c67b5	It's live 	2026-02-06 01:34:27.429565	2026-02-06 01:55:46.986
db1285cd-1082-4884-863a-95eb80376f25	1f9ce5c9-7603-4f16-ba84-49fd3acdf273	bea15756-b2a3-405b-8834-3b7d224c67b5	Thank you and see you soon	2025-12-09 06:54:56.829048	2025-12-09 06:56:30.302
e10a42b6-1998-435e-8324-1a211622a6f5	a32f4978-535c-4639-a58d-113add6fd860	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	Greetings gps does not appear to be accurate I am	2026-02-28 18:04:12.520574	\N
276793bb-90ad-433b-a4e9-9a80d7a97af8	a32f4978-535c-4639-a58d-113add6fd860	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	In back alley near locationn	2026-02-28 18:04:21.947301	\N
e71c8b24-25bc-4f78-befd-16d936da3d76	8bf9cad6-8414-473a-8906-e818d5b4c152	38fa65dc-8d0e-488b-888c-8e0d030a370f	i am on my way to dropoff 	2025-12-23 23:13:29.563501	2025-12-23 23:15:20.248
72fc583d-ab67-42f9-9aa6-58d06f762c93	8bf9cad6-8414-473a-8906-e818d5b4c152	bea15756-b2a3-405b-8834-3b7d224c67b5	Thank you	2025-12-23 23:15:31.673051	2025-12-26 01:46:58.763
09ccc40a-0529-43cf-825d-ecef947722ec	ee122851-a6df-43c0-a373-6efb64f366fe	c8930b20-e428-4e25-87b9-f79bff41bec3	Hello. Got a job from you. Can we come now ? Please thanks 	2026-01-04 18:55:51.372928	2026-01-04 19:01:20.409
a77bab92-1857-4523-8cb4-3bf7944b0593	ee122851-a6df-43c0-a373-6efb64f366fe	bea15756-b2a3-405b-8834-3b7d224c67b5	Yes accept the job  and proceed to pickup 	2026-01-04 19:01:39.662366	2026-01-04 19:23:21.519
dc0f4232-54ba-45eb-889b-66c128d8ce85	ee122851-a6df-43c0-a373-6efb64f366fe	c8930b20-e428-4e25-87b9-f79bff41bec3	Here for the move 	2026-01-04 19:23:27.973984	2026-02-05 20:36:10.451
33b88975-c6e1-4ad1-b83e-215fc761ba73	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	bea15756-b2a3-405b-8834-3b7d224c67b5	Hi Luke 	2026-02-05 20:55:11.049874	2026-02-05 21:48:43.468
458fd3a0-3ccf-49ff-94d6-88bbc7118c39	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	bea15756-b2a3-405b-8834-3b7d224c67b5	What's the ETA ?	2026-02-05 20:55:24.28813	2026-02-05 21:48:43.468
82989106-20ea-427a-bb84-66d59f91b97b	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	bea15756-b2a3-405b-8834-3b7d224c67b5	Pls come to back Alley.... Garage 	2026-02-05 21:45:14.842924	2026-02-05 21:48:43.468
0dc93a0c-4ab2-4aa8-8087-12155671cb68	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	bea15756-b2a3-405b-8834-3b7d224c67b5	Let me know when you arrive 	2026-02-05 21:45:26.33118	2026-02-05 21:48:43.468
042872d6-e784-4398-b979-5fb6d88c3ea3	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	At front seeing message now will drive around 	2026-02-05 21:49:05.258455	2026-02-05 21:49:55.732
53a35047-855f-479f-bffe-b4b981935de6	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	bea15756-b2a3-405b-8834-3b7d224c67b5	Thank you 	2026-02-05 21:50:14.286558	2026-02-05 21:50:17.313
a6d7a0c1-7e10-408d-9ae0-317eb5b05f1c	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	Arrived 	2026-02-05 21:50:28.976363	2026-02-05 21:50:32.786
f61a11f9-782b-45cf-845d-a48c2cb7fa3a	496d7bee-baf6-409d-9621-6845ca2f20d7	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	Can you see my location on this trip 	2026-02-06 01:34:07.289068	2026-02-06 01:34:14.243
b475eb81-b3a5-4c98-9e06-041a9f585cd3	496d7bee-baf6-409d-9621-6845ca2f20d7	bea15756-b2a3-405b-8834-3b7d224c67b5	Yes I can 	2026-02-06 01:34:20.898513	2026-02-06 01:34:21.854
51904614-aaad-4a6f-9c43-ebdaae60ce92	a32f4978-535c-4639-a58d-113add6fd860	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	What is unit number 	2026-02-28 18:07:22.203736	\N
084c0a30-ae18-4c56-b513-cbcc822515be	af96a642-2419-4b11-88de-b1a2902984f5	c8930b20-e428-4e25-87b9-f79bff41bec3	Hey that needs 2 people to move it. 	2026-04-12 17:34:42.119397	2026-04-12 18:11:29.602
3b7ea818-7a8c-4761-9337-7bbc58548a71	4eb15b25-2b65-4397-a6c0-92065c8da2fa	3b3c15a3-e4b4-4773-b055-8e2c71f27410	Hi	2026-04-16 01:17:31.908875	2026-04-16 02:27:16.475
d45f65bf-65f1-448c-afb7-3be3fbc70b00	4eb15b25-2b65-4397-a6c0-92065c8da2fa	3b3c15a3-e4b4-4773-b055-8e2c71f27410	Good evening, how are doing today	2026-04-16 01:17:54.071193	2026-04-16 02:27:16.475
260bda52-880a-4d14-9de3-01536a7c329e	11161561-7b74-421e-915a-2ab1bbd1ad69	c8930b20-e428-4e25-87b9-f79bff41bec3	Hello. Can we come now 	2026-04-26 18:11:05.722258	\N
4b4a619d-ea2a-4924-a33a-c845560b7814	2aac34d5-1d66-4724-8437-6aeb6d76b559	a3e3a896-7063-45f6-84e1-1cb0e252675e	Which building 	2026-04-27 02:22:40.396499	\N
d4507452-7c7b-4d5f-8c31-fe420ee16888	85ac89ac-b9ee-4ec4-9e9b-b91d1cc78d4d	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	Hii i am here 	2026-08-05 20:04:41.476014	\N
eb2e42a7-4601-4ddc-b375-f2c6ba58b218	763dbbae-612d-4668-b16a-55582e9f92ef	5e33efa5-cfb6-4083-9860-61668eb028f3	Hello the sofa is back of the house 	2026-08-07 21:22:17.934782	\N
e749bdce-3f23-40cb-ad01-360237df91a5	763dbbae-612d-4668-b16a-55582e9f92ef	5e33efa5-cfb6-4083-9860-61668eb028f3	Are you in the way 	2026-08-07 21:22:31.068429	\N
097dee76-328e-4e34-a30b-a3f08583bb86	763dbbae-612d-4668-b16a-55582e9f92ef	5e33efa5-cfb6-4083-9860-61668eb028f3	I will go outside are you near	2026-08-07 21:47:03.625261	\N
d321a9d9-4982-474d-8162-b9ad757578f6	24376126-5a19-4a17-bd08-117a73a68c5c	008bbd4d-55f1-4b6c-aafd-b9908cfffcdc	Hi, I hope you are doing well!	2026-08-15 20:19:34.474323	\N
19bb0858-176a-447d-96b0-88f5e55480a0	24376126-5a19-4a17-bd08-117a73a68c5c	008bbd4d-55f1-4b6c-aafd-b9908cfffcdc	May I know when exactly you will in pick up position?	2026-08-15 20:19:57.30772	\N
3bfdf122-c4b4-42be-9750-ba271ee1aa27	24376126-5a19-4a17-bd08-117a73a68c5c	008bbd4d-55f1-4b6c-aafd-b9908cfffcdc	Do you have my phone number?	2026-08-15 20:20:13.336732	\N
fa962c26-a73c-4841-a354-db4cc7492515	24376126-5a19-4a17-bd08-117a73a68c5c	008bbd4d-55f1-4b6c-aafd-b9908cfffcdc	it is 5878995559 please call me whenever you arrived	2026-08-15 20:20:37.899121	\N
6cfd263d-d4bd-4a18-bba9-4b859047201c	24376126-5a19-4a17-bd08-117a73a68c5c	008bbd4d-55f1-4b6c-aafd-b9908cfffcdc	Fereshteh	2026-08-15 20:20:53.019086	\N
f5ae3f20-6cea-42bd-ab93-0cafdafcbe32	24376126-5a19-4a17-bd08-117a73a68c5c	008bbd4d-55f1-4b6c-aafd-b9908cfffcdc	Hi	2026-08-15 20:52:37.825833	\N
91d2a83e-668b-43d6-88ab-19ebdc3a6fb8	24376126-5a19-4a17-bd08-117a73a68c5c	008bbd4d-55f1-4b6c-aafd-b9908cfffcdc	Hello	2026-08-15 21:02:14.548165	\N
c41b5271-ee6c-465e-8ef1-b33bf259e4a8	0e07fbd6-fb32-4924-86a0-c87d3b47b294	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	Hello,  I&#x2019;m writing to confirm that I will be arriving tomorrow at approximately 4:00 PM to complete the moving job. Please let me know if there are any specific instructions or requirements I should be aware of prior to my arrival.  Thank you, and I look forward to assisting you.	2026-08-30 02:32:49.500583	2026-08-30 18:00:35.454
7f06a295-7635-4296-af6e-f892f360e073	0e07fbd6-fb32-4924-86a0-c87d3b47b294	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	I am*	2026-08-30 02:33:21.248244	2026-08-30 18:00:35.454
1cb97098-3afe-422f-aa28-3c01d50d1d1d	0e07fbd6-fb32-4924-86a0-c87d3b47b294	446c5dfe-bd26-4387-aa1a-af333b7e503a	Thanks for reaching out.	2026-08-30 18:00:47.228124	\N
c3d3a506-ec4c-4675-b007-da435c61a32c	0e07fbd6-fb32-4924-86a0-c87d3b47b294	446c5dfe-bd26-4387-aa1a-af333b7e503a	Moving is now on Tuesday, will update you tomorrow 	2026-08-30 18:01:16.205268	\N
\.


--
-- Data for Name: mover_availability; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mover_availability (id, user_id, available_date, start_time, end_time, created_at) FROM stdin;
\.


--
-- Data for Name: mover_earnings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mover_earnings (id, mover_id, booking_id, gross_amount, platform_fee_percent, platform_fee_amount, net_amount, stripe_transfer_id, status, available_at, paid_at, payout_id, created_at) FROM stdin;
80709832-e8e8-4473-bf01-16acf53ecb08	2437c092-cd4a-4b58-826e-504858d822fa	ab33710c-04f2-46a7-834a-8cdd6c59a324	108.27	15.00	16.24	92.03	RBC-ECN 384	paid	2026-01-06 21:14:19.401	2026-01-08 21:24:14.117	\N	2026-01-04 21:14:19.420222
4c280d8f-c32c-409d-be96-db47c7b3581b	aa2cde65-b901-4fc5-895c-c8baad294a2e	8bf9cad6-8414-473a-8906-e818d5b4c152	56.09	15.00	8.41	47.68	manual_bank_transfer_2026-01-08	paid	2026-01-04 18:13:33.366	2026-01-08 21:25:02.513	\N	2026-01-02 18:13:33.383947
46571aba-40d9-456b-aca7-b7ba00406cb2	aa2cde65-b901-4fc5-895c-c8baad294a2e	d8431b18-73d9-4982-a93e-683d55e98b35	124.75	15.00	18.71	106.04	manual_bank_transfer_2026-01-08	paid	2026-01-02 20:14:55.048	2026-01-08 21:25:02.604	\N	2026-01-02 20:14:55.048
f27f3165-31cd-48e3-952d-0b7a19396098	aa2cde65-b901-4fc5-895c-c8baad294a2e	1f9ce5c9-7603-4f16-ba84-49fd3acdf273	49.00	15.00	7.35	41.65	manual_bank_transfer_2026-01-08	paid	2026-01-02 20:14:55.137	2026-01-08 21:25:02.695	\N	2026-01-02 20:14:55.137
df659878-7d6e-4230-ab91-253a91cba93c	26548dcf-bb3b-4b42-b11e-90adcae7f52f	bdfef8db-909b-45f3-b92b-80786dbaff8d	140.86	15.00	21.13	119.73	manual_bank_transfer_2026-01-15	paid	2026-01-08 18:55:23.74	2026-01-15 04:11:59.28	\N	2026-01-08 18:55:23.74
1fc2b826-1af8-4fc0-8960-55886c2827c2	2e29a98e-4529-436a-a611-998981566645	af491d8b-6ea6-4d0c-bf53-8ef5e4b1f4e6	32.57	15.00	4.89	27.68	RBC - ETR 5643	paid	2026-01-20 23:26:25.503	2026-01-24 21:12:20.144	\N	2026-01-18 23:26:25.521638
3cfa0027-cdd5-4dfa-8479-35f8580f4de0	a003a8cb-58c2-4b66-8154-17cc72c46e56	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	123.98	15.00	18.60	105.38	E - transfer. #5583	paid	2026-02-07 21:51:45.783	2026-02-05 22:08:25.947	\N	2026-02-05 21:51:45.800825
17844d2c-6b7e-4e7e-8a56-0105c4a43675	a003a8cb-58c2-4b66-8154-17cc72c46e56	496d7bee-baf6-409d-9621-6845ca2f20d7	81.95	15.00	12.29	69.66	tr_3SxdfsRxppl2FbkT05wQnNZ7	paid	2026-02-08 02:41:57.16	2026-02-06 03:15:14.896	\N	2026-02-06 02:41:57.179778
753cd08e-2a01-49f8-ae92-418a8deceafd	64d3cbb5-bba3-429c-9d4a-cdd69237152c	2cb3dbf3-a880-44bd-82f9-93ca2a111081	114.91	15.00	17.24	97.67	tr_3T2IgtRxppl2FbkT1cyaaBnD	available	2026-02-21 00:28:02.108	\N	\N	2026-02-19 00:28:02.129658
5a3cddd3-36cb-415a-9f3b-e008f534f744	64d3cbb5-bba3-429c-9d4a-cdd69237152c	4dfe91ef-c5f6-4840-b11f-1afc4fc0b8e4	73.43	15.00	11.01	62.42	tr_3T35jbRxppl2FbkT1jJL2psG	available	2026-02-23 04:22:03.182	\N	\N	2026-02-21 04:22:03.202441
b91d39f4-b978-4fcc-8f8d-d92b5ee1ae1d	a003a8cb-58c2-4b66-8154-17cc72c46e56	a32f4978-535c-4639-a58d-113add6fd860	77.24	15.00	11.59	65.65	tr_3T5i2xRxppl2FbkT0sZyBAXJ	available	2026-03-02 21:20:26.312	\N	\N	2026-02-28 21:20:26.331732
e819a1a5-105a-47de-bbb6-30c0ecc37eff	64d3cbb5-bba3-429c-9d4a-cdd69237152c	af96a642-2419-4b11-88de-b1a2902984f5	68.02	15.00	10.20	57.82	tr_3TLRreRxppl2FbkT0yB8dBDj	available	2026-04-14 19:05:36.355	\N	\N	2026-04-12 19:05:36.373815
1a6af2bd-2adc-461b-bbf3-5326f6807a0f	f7f7a53f-fb27-4301-9d9d-a051544be171	4eb15b25-2b65-4397-a6c0-92065c8da2fa	120.98	15.00	18.15	102.83	tr_3TMdaURxppl2FbkT0WbsH494	available	2026-04-18 03:00:35.836	\N	\N	2026-04-16 03:00:35.854627
11c4fa47-1ac3-48b2-9f06-6e871e0fdbc4	2437c092-cd4a-4b58-826e-504858d822fa	11161561-7b74-421e-915a-2ab1bbd1ad69	210.74	15.00	31.61	179.13	tr_3TQFUFRxppl2FbkT0nqttl3Z	available	2026-04-29 04:03:03.819	\N	\N	2026-04-27 04:03:03.838163
2a2ceb9a-f6b5-4528-bc5b-9b82dad7af7b	1b901406-1947-49ba-80a9-3e8a477c8957	2aac34d5-1d66-4724-8437-6aeb6d76b559	82.07	15.00	12.31	69.76	Etransfer confirmation 	paid	2026-04-29 02:37:12.886	2026-04-28 04:47:16.921	\N	2026-04-27 02:37:12.90703
7273f821-392d-469e-b857-7e968920f026	aa2cde65-b901-4fc5-895c-c8baad294a2e	ffc36ceb-21d1-47a0-97cf-1563428a8cb0	76.15	15.00	11.42	64.73	\N	pending	2026-05-07 18:54:57.17	\N	\N	2026-05-05 18:54:57.188088
1c3a2ded-584d-4dfb-8da6-8e52f2c8aa69	605c6dad-cfed-43ba-99a1-8cb89c0516f8	5c653d68-23c8-4d1a-835d-7bed22ee5a95	101.42	15.00	15.21	86.21	tr_3TrjPwRxppl2FbkT0Ll5pcX7	paid	2026-07-12 20:00:46.881	2026-07-11 22:13:27.104	\N	2026-07-10 20:00:46.899795
b25fd9e4-5856-4f96-9339-ad7a00209928	1abbfcc3-03d0-4887-a557-54cda5dddf19	d86cbb19-c971-401c-a4ab-eba90424e4b6	71.57	15.00	10.74	60.83	tr_3TsDdbRxppl2FbkT14Cttrpg	available	2026-07-14 05:41:23.315	\N	\N	2026-07-12 05:41:23.333276
5a88f71b-5457-46ba-9a1f-28280bfc5f3e	605c6dad-cfed-43ba-99a1-8cb89c0516f8	6ac14c1a-838e-4b99-943a-457e970be405	47.07	15.00	7.06	40.01	tr_3TyMD0Rxppl2FbkT1gELmzMm	available	2026-07-31 02:11:41.412	\N	\N	2026-07-29 02:11:41.429669
e5c21882-c945-42c7-b736-e3a281afe94c	605c6dad-cfed-43ba-99a1-8cb89c0516f8	85ac89ac-b9ee-4ec4-9e9b-b91d1cc78d4d	69.29	15.00	10.39	58.90	tr_3U18SARxppl2FbkT19hbj6pz	available	2026-08-07 20:09:49.41	\N	\N	2026-08-05 20:09:49.428216
ce001149-3093-4461-ae51-081f69c44930	605c6dad-cfed-43ba-99a1-8cb89c0516f8	763dbbae-612d-4668-b16a-55582e9f92ef	51.97	15.00	7.80	44.17	tr_3U1uRDRxppl2FbkT1wjTmYcA	available	2026-08-09 21:58:47.457	\N	\N	2026-08-07 21:58:47.474468
352e309d-2158-401d-a1e0-4c38b0f12e95	1abbfcc3-03d0-4887-a557-54cda5dddf19	24376126-5a19-4a17-bd08-117a73a68c5c	44.33	15.00	6.65	37.68	\N	pending	2026-08-17 22:30:37.767	\N	\N	2026-08-15 22:30:37.785104
8b46b0b1-690a-4004-9efe-1f18a74d5c38	605c6dad-cfed-43ba-99a1-8cb89c0516f8	0e07fbd6-fb32-4924-86a0-c87d3b47b294	95.68	15.00	14.35	81.33	tr_3U9Vf0Rxppl2FbkT0n6IHHnv	available	2026-09-03 04:21:45.012	\N	\N	2026-09-01 04:21:45.032788
\.


--
-- Data for Name: mover_payouts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mover_payouts (id, mover_id, stripe_payout_id, amount, currency, status, payout_type, arrival_date, failure_code, failure_message, initiated_at, completed_at, created_at) FROM stdin;
\.


--
-- Data for Name: mover_performance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mover_performance (id, mover_id, booking_id, accepted_at, arrived_at_pickup_at, loading_started_at, loading_completed_at, arrived_at_dropoff_at, unloading_completed_at, arrival_delay_minutes, total_move_minutes, communication_score, professionalism_score, care_with_items_score, load_class, distance_km, had_issues, issue_description, was_rejected, rejection_reason, was_good_match, match_score, created_at) FROM stdin;
4793c4db-e58b-4064-82f7-6221a19d7363	aa2cde65-b901-4fc5-895c-c8baad294a2e	8bf9cad6-8414-473a-8906-e818d5b4c152	2025-12-10 07:49:20.803	\N	\N	\N	\N	2026-01-02 18:13:33.164	\N	33744	\N	\N	\N	\N	8.87	f	\N	f	\N	\N	\N	2026-02-19 01:10:40.824128
743eee67-1897-47f1-9cf9-48a871ab9145	a003a8cb-58c2-4b66-8154-17cc72c46e56	496d7bee-baf6-409d-9621-6845ca2f20d7	2026-02-06 01:15:56.976	\N	\N	\N	\N	2026-02-06 02:41:56.451	\N	86	\N	\N	\N	\N	19.97	f	\N	f	\N	\N	\N	2026-02-19 01:10:40.880653
7841243b-f048-4c03-a909-19128a35fab0	64d3cbb5-bba3-429c-9d4a-cdd69237152c	2cb3dbf3-a880-44bd-82f9-93ca2a111081	2026-02-18 21:53:47.066	\N	\N	\N	\N	2026-02-19 00:28:00.161	\N	154	\N	\N	\N	\N	49.61	f	\N	f	\N	\N	\N	2026-02-19 01:10:40.927402
eb257513-3445-4c04-b0ca-ad5422000e39	aa2cde65-b901-4fc5-895c-c8baad294a2e	d8431b18-73d9-4982-a93e-683d55e98b35	2025-12-08 05:57:50.92	\N	\N	\N	\N	2025-12-09 06:41:03.316	\N	1483	\N	\N	\N	\N	20.96	f	\N	f	\N	\N	\N	2026-02-19 01:10:40.974133
18c6c6cc-e746-4019-98a1-6f531891877b	aa2cde65-b901-4fc5-895c-c8baad294a2e	1f9ce5c9-7603-4f16-ba84-49fd3acdf273	2025-12-09 06:45:56.914	\N	\N	\N	\N	2025-12-09 06:59:21.239	\N	13	\N	\N	\N	\N	15.20	f	\N	f	\N	\N	\N	2026-02-19 01:10:41.020555
4251e996-97e5-4216-bdd6-4e834e8c51e8	2437c092-cd4a-4b58-826e-504858d822fa	ab33710c-04f2-46a7-834a-8cdd6c59a324	2026-01-04 18:50:02.656	\N	\N	\N	\N	2026-01-04 21:14:19.203	\N	144	\N	\N	\N	\N	36.42	f	\N	f	\N	\N	\N	2026-02-19 01:10:41.06671
f7979a78-e8be-418a-ae92-3ea7185484be	26548dcf-bb3b-4b42-b11e-90adcae7f52f	bdfef8db-909b-45f3-b92b-80786dbaff8d	2026-01-05 22:49:17.146	\N	\N	\N	\N	2026-01-06 00:00:00.05	\N	71	\N	\N	\N	\N	56.79	f	\N	f	\N	\N	\N	2026-02-19 01:10:41.114824
1ddfc12f-c1ef-40b6-8685-3de289f15778	2e29a98e-4529-436a-a611-998981566645	af491d8b-6ea6-4d0c-bf53-8ef5e4b1f4e6	2026-01-18 20:08:45.185	\N	\N	\N	\N	2026-01-18 23:26:25.086	\N	198	\N	\N	\N	\N	19.52	f	\N	f	\N	\N	\N	2026-02-19 01:10:41.160745
19c2afa5-c806-4553-8c21-5a526bf322ee	a003a8cb-58c2-4b66-8154-17cc72c46e56	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	2026-02-05 19:59:05.552	\N	\N	\N	\N	2026-02-05 21:51:45.025	\N	113	\N	\N	\N	\N	46.24	f	\N	f	\N	\N	\N	2026-02-19 01:10:41.207295
bf18ec40-cc96-4b92-8c03-8a66f628864f	64d3cbb5-bba3-429c-9d4a-cdd69237152c	4dfe91ef-c5f6-4840-b11f-1afc4fc0b8e4	2026-02-21 03:21:01.676	2026-02-21 03:21:01.624	2026-02-21 03:21:01.624	2026-02-21 03:41:43.258	2026-02-21 04:21:57.518	2026-02-21 04:22:03.326	\N	61	\N	\N	\N	\N	35.16	f	\N	f	\N	\N	\N	2026-02-21 03:21:01.694655
743d0ef5-4288-4e6d-b7ac-97abc1966237	605c6dad-cfed-43ba-99a1-8cb89c0516f8	763dbbae-612d-4668-b16a-55582e9f92ef	2026-08-07 21:10:17.638	2026-08-07 21:34:55.982	2026-08-07 21:34:55.982	2026-08-07 21:34:59.675	2026-08-07 21:57:31.984	2026-08-07 21:58:47.607	\N	48	\N	\N	\N	\N	13.51	f	\N	f	\N	\N	\N	2026-08-07 21:10:17.656619
c029aa03-86bd-482e-b8a6-b1ef882861ff	a003a8cb-58c2-4b66-8154-17cc72c46e56	a32f4978-535c-4639-a58d-113add6fd860	2026-02-28 18:03:52.12	2026-02-28 18:03:52.068	2026-02-28 18:03:52.068	2026-02-28 19:40:14.555	2026-02-28 20:11:31.577	2026-02-28 21:20:26.457	\N	197	\N	\N	\N	\N	10.02	f	\N	f	\N	\N	\N	2026-02-28 18:03:52.141433
f9942261-12eb-45f8-9611-d206615e3053	605c6dad-cfed-43ba-99a1-8cb89c0516f8	5c653d68-23c8-4d1a-835d-7bed22ee5a95	2026-07-10 18:51:42.469	2026-07-10 19:31:36.643	2026-07-10 19:31:36.643	2026-07-10 19:39:19.757	2026-07-10 20:00:40.275	2026-07-10 20:00:47.045	\N	69	\N	\N	\N	\N	15.17	f	\N	f	\N	\N	\N	2026-07-10 18:51:42.487392
b66ab4a4-855c-4525-b93c-7c029e444c1a	64d3cbb5-bba3-429c-9d4a-cdd69237152c	af96a642-2419-4b11-88de-b1a2902984f5	2026-04-12 18:14:20.373	2026-04-12 18:14:20.323	2026-04-12 18:14:20.323	2026-04-12 18:20:26.483	2026-04-12 18:48:04.95	2026-04-12 19:05:36.501	\N	51	\N	\N	\N	\N	22.08	f	\N	f	\N	\N	\N	2026-04-12 18:14:20.391853
4b25382e-3dff-4c83-8a55-debde160888c	f7f7a53f-fb27-4301-9d9d-a051544be171	4eb15b25-2b65-4397-a6c0-92065c8da2fa	2026-04-16 01:45:20.619	2026-04-16 01:45:20.575	2026-04-16 01:45:20.575	2026-04-16 01:56:59.984	2026-04-16 03:00:25.141	2026-04-16 03:00:35.979	\N	75	\N	\N	\N	\N	35.25	f	\N	f	\N	\N	\N	2026-04-16 01:45:20.639337
cee468de-96c7-49c5-8111-9414a7f18d5e	1abbfcc3-03d0-4887-a557-54cda5dddf19	d86cbb19-c971-401c-a4ab-eba90424e4b6	2026-07-12 05:40:17.512	2026-07-12 05:40:17.456	2026-07-12 05:40:17.456	2026-07-12 05:41:05.112	2026-07-12 05:41:08.707	2026-07-12 05:41:23.43	\N	1	\N	\N	\N	\N	21.75	f	\N	f	\N	\N	\N	2026-07-12 05:40:17.530498
e57cfd4a-9c78-4239-bc62-ef94c8b9916b	1b901406-1947-49ba-80a9-3e8a477c8957	2aac34d5-1d66-4724-8437-6aeb6d76b559	2026-04-27 02:17:04.57	2026-04-27 02:17:04.515	2026-04-27 02:17:04.515	2026-04-27 02:17:07.994	2026-04-27 02:24:10.58	2026-04-27 02:37:13.034	\N	20	\N	\N	\N	\N	6.57	f	\N	f	\N	\N	\N	2026-04-27 02:17:04.592381
6e138551-8fe9-4d1b-8557-b80b70945303	1abbfcc3-03d0-4887-a557-54cda5dddf19	24376126-5a19-4a17-bd08-117a73a68c5c	2026-08-13 22:04:03.6	2026-08-15 22:30:17.699	2026-08-15 22:30:17.699	2026-08-15 22:30:26.664	2026-08-15 22:30:32.232	2026-08-15 22:30:37.926	\N	2907	\N	\N	\N	\N	3.07	f	\N	f	\N	\N	\N	2026-08-13 22:04:03.620034
9ae0e720-9b93-41fa-84d4-e4b1f0f4f32d	2437c092-cd4a-4b58-826e-504858d822fa	11161561-7b74-421e-915a-2ab1bbd1ad69	2026-04-27 04:02:51.176	2026-04-27 04:02:51.13	2026-04-27 04:02:51.13	2026-04-27 04:02:55.535	2026-04-27 04:02:58.462	2026-04-27 04:03:03.959	\N	0	\N	\N	\N	\N	13.71	f	\N	f	\N	\N	\N	2026-04-27 04:02:51.195991
7ea7e9ca-3a29-4dd3-aaa4-0fd793504bd3	605c6dad-cfed-43ba-99a1-8cb89c0516f8	6ac14c1a-838e-4b99-943a-457e970be405	2026-07-29 01:25:08.529	2026-07-29 01:33:12.419	2026-07-29 01:33:12.419	2026-07-29 01:36:44.112	2026-07-29 01:53:10.599	2026-07-29 02:11:41.531	\N	47	\N	\N	\N	\N	3.53	f	\N	f	\N	\N	\N	2026-07-29 01:25:08.547482
a7087260-8693-4ec4-b9d4-dfcdc7592ecf	aa2cde65-b901-4fc5-895c-c8baad294a2e	ffc36ceb-21d1-47a0-97cf-1563428a8cb0	2026-05-05 17:28:09.935	2026-05-05 17:28:09.884	2026-05-05 17:28:09.884	2026-05-05 17:31:47.284	2026-05-05 18:02:29.658	2026-05-05 18:54:57.321	\N	87	\N	\N	\N	\N	17.30	f	\N	f	\N	\N	\N	2026-05-05 17:28:09.953147
e6b14c43-66a9-451d-941a-f8e267001177	605c6dad-cfed-43ba-99a1-8cb89c0516f8	85ac89ac-b9ee-4ec4-9e9b-b91d1cc78d4d	2026-08-05 19:38:52.815	2026-08-05 19:38:52.514	2026-08-05 19:38:52.514	2026-08-05 20:03:40.398	2026-08-05 20:03:43.302	2026-08-05 20:09:49.579	\N	31	\N	\N	\N	\N	13.21	f	\N	f	\N	\N	\N	2026-08-05 19:38:52.854271
fab0e3a4-6623-4a20-aacd-c7eafe70a719	605c6dad-cfed-43ba-99a1-8cb89c0516f8	0e07fbd6-fb32-4924-86a0-c87d3b47b294	2026-08-28 20:11:27.643	2026-09-01 04:21:29.945	2026-09-01 04:21:29.945	2026-09-01 04:21:32.041	2026-09-01 04:21:38.388	2026-09-01 04:21:45.178	\N	4810	\N	\N	\N	\N	2.25	f	\N	f	\N	\N	\N	2026-08-28 20:11:27.661289
\.


--
-- Data for Name: mover_stripe_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mover_stripe_accounts (id, mover_id, stripe_account_id, account_type, onboarding_status, charges_enabled, payouts_enabled, details_submitted, requirements_due, currently_due, default_currency, country, created_at, updated_at, reminder_count, last_reminder_at) FROM stdin;
edc8e81c-1e1f-46d0-9726-39bf7bd31d26	2437c092-cd4a-4b58-826e-504858d822fa	acct_1SlydORshFHPBL9f	express	complete	t	t	t	{}	{}	cad	CA	2026-01-04 21:14:50.014239	2026-04-27 04:04:12.688	0	\N
04e1cc49-5d16-459a-a1dd-ea0d998ccf2d	15a904b7-4267-4b96-8a9f-548f603fda3d	acct_1T9AaqRv0ruBSka4	express	in_progress	f	f	f	\N	\N	cad	CA	2026-03-09 20:40:03.536699	2026-03-17 00:10:01.055	3	2026-03-17 00:10:01.055
3914cf50-5362-4810-a296-b734cc72f949	30bba7ff-a9e9-48f4-bdcd-0b196fd22b11	acct_1TQfsF2MHQtD9p4A	express	restricted	f	f	f	{external_account,individual.address.city,individual.address.line1,individual.address.postal_code,individual.address.state,individual.dob.day,individual.dob.month,individual.dob.year,individual.relationship.title,tos_acceptance.date,tos_acceptance.ip}	{external_account,individual.address.city,individual.address.line1,individual.address.postal_code,individual.address.state,individual.dob.day,individual.dob.month,individual.dob.year,individual.relationship.title,tos_acceptance.date,tos_acceptance.ip}	cad	CA	2026-04-27 03:30:22.713359	2026-05-04 18:10:01.458	3	2026-05-04 18:10:01.458
13341138-8934-4c63-be9d-252f7490fd72	605c6dad-cfed-43ba-99a1-8cb89c0516f8	acct_1Trkd9RsCw9S5X3H	express	complete	t	t	t	{}	{}	cad	CA	2026-07-10 20:02:42.446288	2026-07-12 03:11:19.446	0	\N
b234b481-420e-4dc2-83e9-82bdff62c496	1abbfcc3-03d0-4887-a557-54cda5dddf19	acct_1Ta7dDRt1DtxYxxV	express	complete	t	t	t	{}	{}	cad	CA	2026-05-23 04:57:54.930384	2026-07-12 05:42:24.427	0	\N
01d5f5a1-32a7-4f13-afda-6cc93ffa3fa9	dbad7eb8-5574-482c-9c25-9c74da29cc03	acct_1TClltRrX5e652JD	express	in_progress	f	f	f	{external_account,individual.address.city,individual.address.line1,individual.address.postal_code,individual.address.state,individual.dob.day,individual.dob.month,individual.dob.year,individual.relationship.title,tos_acceptance.date,tos_acceptance.ip}	{external_account,individual.address.city,individual.address.line1,individual.address.postal_code,individual.address.state,individual.dob.day,individual.dob.month,individual.dob.year,individual.relationship.title,tos_acceptance.date,tos_acceptance.ip}	cad	CA	2026-03-19 18:58:21.001782	2026-03-28 21:38:56.732	3	2026-03-27 00:10:03.494
c3f72a26-b58f-46ee-8188-f83aaa8b38ad	f7f7a53f-fb27-4301-9d9d-a051544be171	acct_1T5wbERopLYLsS33	express	complete	t	t	t	{individual.verification.proof_of_liveness}	{individual.verification.proof_of_liveness}	cad	CA	2026-02-28 23:07:08.319416	2026-03-02 19:37:57.91	0	\N
52188570-8aed-47c2-b74f-85bf55094e0b	64d3cbb5-bba3-429c-9d4a-cdd69237152c	acct_1SyHPgRzYwp8J2vF	express	complete	t	t	t	\N	\N	cad	CA	2026-02-07 19:43:31.75748	2026-03-02 19:37:57.999	1	2026-02-09 00:00:07.658
364e2e46-36f4-4d15-8e2f-31016471022e	ac3fed3b-31a3-4c4d-8cce-1d0bbf7503ed	acct_1SwquhRpAPNErhzo	express	complete	t	t	t	\N	\N	cad	CA	2026-02-03 21:13:39.369821	2026-03-02 19:37:58.087	2	2026-02-07 00:00:01.892
be75b9dd-02c2-4e92-a7b1-c25720a11254	efed7a9f-3c49-463a-9005-e48e0229208d	acct_1SsFM6RvmVcOhgez	express	pending	t	f	t	\N	\N	cad	CA	2026-01-22 04:18:54.301446	2026-03-02 19:37:58.264	0	\N
c226378f-0671-4bea-bae3-119b3746b882	2e29a98e-4529-436a-a611-998981566645	acct_1Sr63S2NSkQGU66l	express	complete	t	t	t	{}	{}	cad	CA	2026-01-19 00:10:53.735055	2026-03-02 19:37:58.352	0	\N
aaeb2c1e-eb6a-4dc8-a9a3-d6f150605e7f	26548dcf-bb3b-4b42-b11e-90adcae7f52f	acct_1SmPBPRuy9poSfFM	express	pending	t	f	t	{individual.verification.proof_of_liveness}	{individual.verification.proof_of_liveness}	cad	CA	2026-01-06 01:35:43.479825	2026-03-02 19:37:58.44	0	\N
9ff6dd41-4ca0-4d99-a0a0-22060ac37254	aa2cde65-b901-4fc5-895c-c8baad294a2e	acct_1ScuK72LqGRd72z5	express	restricted	f	f	f	{business_profile.mcc,business_profile.product_description,business_profile.url,external_account,individual.address.city,individual.address.line1,individual.address.postal_code,individual.address.state,individual.dob.day,individual.dob.month,individual.dob.year,individual.email,individual.first_name,individual.last_name,individual.phone,individual.relationship.title,tos_acceptance.date,tos_acceptance.ip}	{business_profile.mcc,business_profile.product_description,business_profile.url,external_account,individual.address.city,individual.address.line1,individual.address.postal_code,individual.address.state,individual.dob.day,individual.dob.month,individual.dob.year,individual.email,individual.first_name,individual.last_name,individual.phone,individual.relationship.title,tos_acceptance.date,tos_acceptance.ip}	cad	CA	2026-01-06 00:36:10.281149	2026-07-11 22:12:31.248	3	2026-02-17 06:00:18.139
4ae15068-a031-4f8f-a5cb-5c2e84975897	a003a8cb-58c2-4b66-8154-17cc72c46e56	acct_1Sw7J3RuOivvUDuU	express	complete	t	t	t	{}	{}	cad	CA	2026-02-01 20:31:46.312068	2026-03-02 21:18:34.813	1	2026-02-03 00:00:07.96
\.


--
-- Data for Name: mover_terms_acceptance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mover_terms_acceptance (id, mover_id, terms_version, accepted_at, accepted_from_ip, user_agent) FROM stdin;
fea8e1e3-120d-4328-85a5-8921da71749f	1b901406-1947-49ba-80a9-3e8a477c8957	EA-1.0	2025-12-13 20:22:50.345085	104.197.154.30	Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/398.0.839721620 Mobile/15E148 Safari/604.1
d51594c5-2965-4e03-b961-0a4dd78844ee	26548dcf-bb3b-4b42-b11e-90adcae7f52f	EA-1.0	2025-12-17 16:36:44.353252	35.224.23.137	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1
4d0e6d93-d2b1-4054-9d17-9c8e70237fbe	2437c092-cd4a-4b58-826e-504858d822fa	EA-1.0	2025-12-17 17:36:34.124799	136.112.69.229	Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.7444.128 Mobile/15E148 Safari/604.1
34cd51ce-33a0-41a2-96fd-9e5b1ff3c0a3	efed7a9f-3c49-463a-9005-e48e0229208d	EA-1.0	2025-12-17 17:46:47.083364	34.9.246.53	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36
1b2400bb-b8fe-40e3-8172-6c6296b0b94e	aa2cde65-b901-4fc5-895c-c8baad294a2e	EA-1.0	2025-12-17 18:24:36.873948	34.9.246.53	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36
33ecf3cb-3df1-40dd-9f1b-1942a658fc43	2e29a98e-4529-436a-a611-998981566645	EA-1.0	2026-01-18 22:02:40.93029	136.119.30.108	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1
c77fc0d0-20de-4937-86e5-96d03d7513ae	64d3cbb5-bba3-429c-9d4a-cdd69237152c	EA-1.0	2026-01-18 22:45:27.232412	34.57.112.90	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1
646aa749-81c7-41af-8d58-e436d7288e42	b9f8d7a9-892c-48a7-a62d-dd255d482660	EA-1.0	2026-01-18 22:48:22.583838	34.9.32.149	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36
2c206fa9-2af6-4d76-99ef-84a5a044a128	e55370ff-6128-4b54-96d7-6b97faa1e305	EA-1.0	2026-01-18 22:53:17.72429	35.192.213.80	Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/144.0.7559.85 Mobile/15E148 Safari/604.1
12401662-650f-4b3a-b461-383c3d9ccf4b	aa56c69a-0409-49c8-9aa0-2e922ac75f88	EA-1.0	2026-01-18 23:12:59.725005	136.111.203.8	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36
c350ec63-7c87-42fb-8d13-9e314f5a5d9d	15a904b7-4267-4b96-8a9f-548f603fda3d	EA-1.0	2026-02-03 21:36:51.176248	35.238.224.71	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36
78dc10ff-f0e2-4029-80a6-f6c664a9516d	8a964228-a8fc-41c9-a49e-d393cd29f1c6	EA-1.0	2026-02-03 21:38:12.43694	34.66.166.88	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1
6968dca8-9daf-471c-bec3-74d619d0204f	ac3fed3b-31a3-4c4d-8cce-1d0bbf7503ed	EA-1.0	2026-02-03 21:38:24.828513	34.42.217.230	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/546.0.0.17.107;FBBV/870347821;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/26.2.1;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/80]
409fc432-a87b-4003-b293-44ee72bfb8f8	a003a8cb-58c2-4b66-8154-17cc72c46e56	EA-1.0	2026-02-03 21:46:51.310237	34.9.222.8	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1
67ae72a5-fa46-4aae-8697-616faaebf0f1	bca8c7b0-8fd4-4ecc-97b8-82ebaceaae1e	EA-1.0	2026-02-05 16:36:53.211499	104.197.96.79	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/29.0 Chrome/136.0.0.0 Mobile Safari/537.36
599e0486-39a2-476e-8cc0-81a61bb0201e	f7f7a53f-fb27-4301-9d9d-a051544be171	EA-1.0	2026-02-28 22:20:50.378647	34.57.125.103	Mozilla/5.0 (iPhone; CPU iPhone OS 26_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/145.0.7632.108 Mobile/15E148 Safari/604.1
4d6848cb-3e09-4ca0-a0a1-dec0ecd64493	0b9451dd-126a-47d7-8efa-4c0859c53615	EA-1.0	2026-03-05 20:27:22.597964	34.173.193.110	Mozilla/5.0 (iPhone; CPU iPhone OS 26_3_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/145.0.7632.108 Mobile/15E148 Safari/604.1
898f8b8a-1abc-4da8-98fc-e0fff91773f2	9993c884-11f1-4eb8-a2e8-c2b4938d69dd	EA-1.0	2026-03-08 18:35:52.980016	136.111.59.74	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36
4e5a25de-c45d-4927-87cf-72d783cdd67d	dbad7eb8-5574-482c-9c25-9c74da29cc03	EA-1.0	2026-03-17 15:40:07.408685	34.69.143.84	Mozilla/5.0 (iPhone; CPU iPhone OS 18_5_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/377.0.781279791 Mobile/15E148 Safari/604.1
cc491568-5738-44a2-8246-ec8156de9935	ef0834ff-1dba-46ce-bc09-e60f9d954594	EA-1.0	2026-03-21 23:39:47.184477	34.135.198.110	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36
5a024d0e-4aae-47c3-85cd-61248d7cbf61	4319a7c7-2ecc-4a3a-af74-77ba337bedf0	EA-1.0	2026-04-22 19:47:11.570296	104.199.54.221	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36
9ff06a93-7381-4a6f-8307-36829aa12b1d	30bba7ff-a9e9-48f4-bdcd-0b196fd22b11	EA-1.0	2026-04-27 03:29:39.382403	34.69.222.100	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1
3d44f979-6ce2-4f58-9d3e-392a285e3f2e	0b73ed6b-5f7c-4db2-b50d-b4cde41bbfd2	EA-1.0	2026-05-01 18:37:39.026467	34.71.170.209	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36
8a90141b-0caf-4fc3-b8c0-8f104511ab86	1abbfcc3-03d0-4887-a557-54cda5dddf19	EA-1.0	2026-05-23 03:42:29.191323	34.121.19.169	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36
a0ffdf02-215a-415e-9bf5-bfdfc9b25555	7cba5209-a0b9-4ad6-82d4-643a085c5405	EA-1.0	2026-05-26 17:39:15.222933	35.193.20.0	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36
b79ea7a0-b867-4222-a3c5-42e64aeb5a0c	b1ebaf48-757d-498a-8c91-f41a17a60664	EA-1.0	2026-06-02 22:31:00.799759	34.59.96.150	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1
66e76c47-cc1b-4563-b08a-03d44eb26dfe	605c6dad-cfed-43ba-99a1-8cb89c0516f8	EA-1.0	2026-07-09 03:38:55.827812	136.115.177.6	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15
350c7cf9-9b04-4f17-bdee-80916b9cefa6	4606d606-4da5-4c09-868a-e23deff003c9	EA-1.0	2026-07-11 22:10:42.209857	34.28.198.86	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36
4efafb86-b114-41e5-b732-6a45b00d759d	132f82ec-e0d6-46ac-960b-5d1a4f85c615	EA-1.0	2026-08-26 23:05:47.624107	34.16.168.22	Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/151.0.7922.112 Mobile/15E148 Safari/604.1
\.


--
-- Data for Name: movers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.movers (id, user_id, vehicle_type, vehicle_capacity, license_number, is_verified, rating, total_moves, bio, location, is_available, created_at, latitude, longitude, vehicle_photo, vehicle_color, license_plate, mover_image, profile_verified, documents_verified, completed_trips, pilot_status, pilot_approved_by, pilot_approved_at, pilot_notes, pilot_expires_at, last_location_update, onboarding_completed, profile_reminder_count, last_profile_reminder_at) FROM stdin;
64d3cbb5-bba3-429c-9d4a-cdd69237152c	65d807fc-eaae-4407-8a8b-85a28a699047	van	\N	\N	f	5.00	3	\n\n	153 Aero Way NE, Calgary, AB T2E 6K2, Canada	t	2026-01-16 09:59:41.477625	51.13204838897364	-114.03470840248184	/objects/uploads/5c48aebf-83ab-41c2-b9ec-1188fa479181.jpeg	White	0EB623	/objects/uploads/f4c079c9-7084-4414-b538-f09d2b128a35.jpeg	f	f	2	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-06-27 20:11:01.547	\N	2026-08-31 00:00:00	2026-08-07 21:47:08.89	t	0	\N
2e29a98e-4529-436a-a611-998981566645	2b515463-1126-4e10-bff7-9749c51804ca	car	\N	\N	f	0.00	1		10349 Cityscape Dr NE, Calgary, AB T3N 1N5, Canada	t	2026-01-11 00:21:05.054469	51.14423234933327	-113.9660890631253	/objects/uploads/8cf43b50-873b-48a4-9d19-381abe0ff0a9.jpeg	White	CSF9577	/objects/uploads/cf065bf7-d3b7-4657-a1ad-09a5e4893ff5.jpeg	f	f	1	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-01 00:01:23.78	\N	2026-03-31 00:00:00	2026-01-19 00:28:47.239	t	0	\N
f7f7a53f-fb27-4301-9d9d-a051544be171	3b3c15a3-e4b4-4773-b055-8e2c71f27410	van	\N	\N	f	0.00	1	I’m a professional mover 	71 Cornerstone Gdns NE, Calgary, AB T3N 2A6, Canada	t	2026-02-28 21:46:59.893133	51.157024849143966	-113.93584346233224	/objects/uploads/0f3fa015-fbb1-4ddd-8194-9e23c0de020d.jpeg	Red	0-GJ816	/objects/uploads/b34b9b51-9b5a-4ba4-a794-cbd48956fe92.jpg	f	f	1	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-28 22:20:40.148	\N	2026-03-31 00:00:00	2026-04-27 02:27:20.515	t	0	\N
1abbfcc3-03d0-4887-a557-54cda5dddf19	58413582-e6f3-4bf2-b488-b899f7babd31	van	\N	\N	t	0.00	2	I am a reliable mover	32X4+J7 Calgary, AB, Canada	t	2026-05-23 03:29:32.750003	51.0990990990991	-113.99427050919269	/objects/uploads/3210cf8b-8817-4a01-a5c5-1866d3e684ca.jpg	Grey	cww-8204	/objects/uploads/163162ed-8b2a-47f9-9a6b-cb4927adba08.jpg	f	t	2	pending	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	\N	The following documents need updating;\n1. Upload 4 clear photos of the vehicle \n2.  Place the ID on a flat surface and take both front and back photos\n3. Set up payout through the mover platform. Click the tab PAYOUT and follow the steps. Payout setup is routed via STRIPE  \n\n	2026-07-09 00:00:00	2026-08-22 03:14:09.952	t	0	\N
605c6dad-cfed-43ba-99a1-8cb89c0516f8	3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	van	\N	\N	f	5.00	5	Trust me with your delivery - professional mover 	10349 Cityscape Dr NE, Calgary, AB T3N 2A1, Canada	t	2026-07-09 03:33:47.172872	51.14425027009849	-113.96602892471897	/objects/uploads/dfc27bbb-80d4-4184-96f5-4b44acf28faa.jpeg	White	0-GH930	/objects/uploads/75b96138-571c-4ec7-b677-93d03f84437e.jpeg	f	f	3	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-08-15 23:13:31.101	\N	2026-10-15 00:00:00	2026-09-01 04:21:44.568	t	0	\N
7cba5209-a0b9-4ad6-82d4-643a085c5405	d13c3557-4958-4239-b0b7-017e59615a5c	car	\N	\N	f	0.00	0	I am a reliable and hardworking professional with hands-on experience in physical, fast-paced environments where efficiency, safety, and attention to detail are essential. \n\nWhat makes me a great mover is my strong work ethic, physical s\n\nLervIT should hire me because I bring dependability, a positive attitude, and a strong sense of responsibility to every job. I take pride in doing the work properly the first time and making sure customers feel confident that their belongings are in good hands.	3248 Rae Crescent SE, Calgary, AB T2A 1Y3, Canada	t	2026-05-26 17:04:11.549957	51.04270383769402	-113.98983758090371	/objects/uploads/2900e569-64a9-4aa5-8827-94b09842838a.jfif	Black	CTB 4886	/objects/uploads/e2c1fda8-a0c4-45ae-b209-ae5d481839dd.jpg	f	f	0	none	\N	\N	\N	\N	2026-05-27 05:07:14.907	t	0	\N
132f82ec-e0d6-46ac-960b-5d1a4f85c615	368f245f-acd9-4c2d-9a74-6a706f6367f7	car	\N	\N	f	0.00	0	I am quick,professional and reliable. 	SB 37 St SW @ 13 Av SW, 37 St SW & 13 Ave SW, Calgary, AB T3C 1S6, Canada	t	2026-08-26 16:14:02.974014	51.0411342167523	-114.14082539476696	/objects/uploads/58cd58b8-29fc-498b-b1b9-e1ccb7fb1a43.jpg	Silver	CKD1641	/objects/uploads/48f14e18-be7f-4cdf-8977-a4ec6381740f.jpg	f	f	0	none	\N	\N	\N	\N	2026-08-27 01:03:35.517	t	0	\N
0b73ed6b-5f7c-4db2-b50d-b4cde41bbfd2	8b74e5a1-a6d8-4cb2-84ed-a5c238a5cae8	van	\N	\N	f	0.00	0	TB service plus is a company that works in moving, delivery, junk removal, cleaning, snow removal for about 2 years we have been serving everyone. 	277 Redstone Blvd NE, Northeast, AB T3N 1V6, Canada	t	2026-04-30 23:07:23.370634	51.1698453	-113.9514084	/objects/uploads/f3def7bb-59ec-4766-8914-45ba7246e787.jpg	White		/objects/uploads/40d9ec96-0da5-42c8-a4ff-ff672bd8e0bb.jpg	f	f	0	none	\N	\N	\N	\N	2026-05-10 16:53:39.316	t	0	\N
9993c884-11f1-4eb8-a2e8-c2b4938d69dd	c9e88876-66e5-46a8-b98b-a3d4a341043f	pickup	\N	\N	f	0.00	0	I have 7 years of moving experience, I have a large trailer, moving blankets, dollies/carts. I will get your stuff where you need it safely without damaging it! 	438 11 Ave SE Suite 600, Calgary, AB T2G 0Y4, Canada	t	2026-03-08 18:30:22.932227	51.0422072	-114.0539601	/objects/uploads/7342e8ca-4075-43bf-a0da-01335cd0c3d0.jpg	Red	Chm8004	/objects/uploads/29c78089-8787-4ceb-9fa5-0fe9ded0337d.jpg	f	f	0	none	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	\N	\N	2026-04-30 00:00:00	2026-03-08 21:36:53.551	t	0	\N
0b9451dd-126a-47d7-8efa-4c0859c53615	721b0ad5-6cb4-40e4-b141-213241bd8b8f	van	\N	\N	f	0.00	0	I have a vast  experience in moving company, from small to big job. I ensure that each job is treated with care. I listened to customer’s request and would go above and beyond to see them happy.	50.9795, -114.0768	t	2026-03-05 17:37:38.893028	50.979498432045396	-114.07677060813151	/objects/uploads/9b43a6fa-ed62-479f-adf5-a9e3b618ce98.jpeg	White	CVX3844	/objects/uploads/ec60eba7-6db9-4c04-b6d2-e233d5532e50.jpeg	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-23 22:39:06.5	\N	2026-04-30 00:00:00	2026-03-05 23:36:25.906	t	0	\N
b1ebaf48-757d-498a-8c91-f41a17a60664	9a89ec0a-12f0-4939-8da3-47222481f37f	pickup	\N	\N	f	0.00	0	I am a young and professional mover	Calgary, AB	t	2026-06-02 22:28:24.611384	51.019646000232434	-114.05117592990696	/objects/uploads/6f1273a3-238a-4776-961c-d7ce353f8274.jpeg	Grey	116 MUP	/objects/uploads/87c1d2d7-5927-486d-b6a2-42f87a9ec98f.jpg	f	f	0	none	\N	\N	\N	\N	\N	t	0	\N
60f82f05-7792-4d38-860e-1321e7fcd631	6fe46edc-2a64-4cca-9fc5-549b71ea2330	van	\N	\N	f	0.00	0	\N	Calgary, AB	t	2026-06-27 21:39:19.872095	50.86604675371682	-114.11970478364688	\N	\N	\N	\N	f	f	0	none	\N	\N	\N	\N	\N	f	0	\N
b2377137-ed6f-46e7-88a9-362c4383aaf1	7032efb7-d7d4-4e71-aad6-2289363cbedb	van	\N	\N	f	0.00	0	\N	Calgary, AB	t	2026-07-10 20:54:12.228289	50.931541732257145	-114.1641303137574	\N			/objects/uploads/9c32676f-ee81-4089-adfe-71ee378c0a19.jpg	f	f	0	none	\N	\N	\N	\N	\N	f	0	\N
4606d606-4da5-4c09-868a-e23deff003c9	bb9664eb-5bf5-4895-a4c6-cc1ad648edc9	car	\N	\N	f	0.00	0	I'm a reliable, hardworking mover with a string work ethic and customer-first attitude. I have experience safely handling furniture and household items with care. I show up on time and treat every move as if it were my own. If you're looking for someone who's dependable, careful and committed to making your move stress-free, I'm the right choice.\n	42 Kincora Cres NW, Calgary, AB T3R 0N4, Canada	t	2026-07-11 21:56:35.732557	51.165149	-114.1444166	/objects/uploads/ecaf7bca-8758-454a-923f-a5bbe23edd89.jpg	Grey	CHB9350	/objects/uploads/f630db1c-9821-4197-9884-fe047dfb403f.jpg	f	f	0	none	\N	\N	\N	\N	2026-07-11 23:56:59.549	t	0	\N
2437c092-cd4a-4b58-826e-504858d822fa	c8930b20-e428-4e25-87b9-f79bff41bec3	truck	\N	\N	f	5.00	2	As a seasoned moving professional with 14 years of experience, I, offer comprehensive moving services with my own company in Calgary, Alberta. We handle local and long distance moves, direct moves to medmonton,and provide white glove service. Our expertise includes packing, unpacking, loading, and unloading. We have a reliable moving crew and serve a 200-mile radius around Calgary.	425 Corner Meadows Way NE, Calgary, AB T3N 1Y6, Canada	f	2025-12-17 17:29:25.544282	51.14723891617212	-113.9264018956441	/objects/uploads/ebbf81d1-57d4-43e6-8d47-a5b368056f43.HEIC	White 	16P610	/objects/uploads/0c383761-5b55-42f1-915b-5e49d7161b3b.jpeg	f	f	2	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-01 00:01:47.004	\N	2026-03-31 00:00:00	2026-04-27 10:03:53.366	t	0	\N
dbad7eb8-5574-482c-9c25-9c74da29cc03	66904619-efab-45ee-988f-1a94af36a287	car	\N	\N	t	0.00	0	I’m an experienced driver.	112 10 Ave SW, Calgary, AB T2R 0A3, Canada	f	2026-03-17 15:36:17.291564	51.04361257262025	-114.06390952380112	/objects/uploads/bd992d78-981f-49d0-b467-f74290550aee.jpg	Grey	OBS337	/objects/uploads/742f16cc-3efc-42a0-9c3a-5ec899bf9c0b.jpg	f	t	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-18 19:55:46.73	\N	2026-03-18 00:00:00	2026-07-23 19:06:12.175	t	0	\N
ac3fed3b-31a3-4c4d-8cce-1d0bbf7503ed	f562d263-dd70-4ebb-b30f-b14686c6b58a	truck	\N	\N	f	0.00	0	Reliable Swift Movers, based at 282 Cornerstone Cr NE in Calgary, offers residential and office moving services, including out-of-city, with a fleet of 26ft trucks. Operating as a licensed, non-BBB accredited business, they provide moving accessories and are available for inquiries at +1 587-429-5350. \nKey Details for Reliable Swift Movers (Calgary):\nServices: Local and out-of-city moves, residential and office relocation.\nEquipment: 3x 26ft trucks and various packing/moving accessories.\n	51.0378, -113.9097	t	2026-02-03 20:36:24.696146	51.03782177327889	-113.90969266113665	/objects/uploads/3e46352f-d6d3-408d-ad09-d4139afaf70c.jpeg	White		/objects/uploads/bb6e415d-6392-4d70-9fab-183025fef533.jpeg	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-01 00:13:15.932	Pls kindly update your License Plate number on your profile.	2026-03-31 00:00:00	2026-03-01 19:19:00.105	t	0	\N
a5a7ec25-91cb-414d-a5fe-953232de6851	d3714b32-ebab-4e11-a6b9-b545b66916d0	pickup	\N	\N	f	0.00	0	Moving professional 	10353 Cityscape Dr NE, Calgary, AB T3N 1N5, Canada	t	2026-04-04 21:21:00.235174	51.144301577481755	-113.96615377857273	/objects/uploads/ae4ddc8f-e3f8-4d90-b0ae-3c36bf581edd.jpg	Grey 	CSJ5774	/objects/uploads/156b2fdf-b083-4bed-a196-4a3be2cb80a5.jpeg	f	f	0	none	\N	\N	\N	\N	2026-04-04 21:22:30.145	f	3	2026-04-12 03:20:01.754
eb7dfc14-6c71-4def-ae98-8d1abdd07fc7	27a91efa-09e1-43e7-930f-b538862b97ac	car	\N	\N	f	0.00	0	\N	2 Fenton Rd SE, Calgary, AB T2H 1Y7, Canada	t	2026-04-09 01:53:54.435094	50.9836265	-114.06167	\N	Black	CJV9108	/objects/uploads/54e49c83-a727-4969-a776-d4c4bea36b05.jpg	f	f	0	none	\N	\N	\N	\N	2026-07-12 00:26:33.591	f	3	2026-04-16 03:20:01.347
4319a7c7-2ecc-4a3a-af74-77ba337bedf0	1df30f3b-1f46-47e9-9046-70a554484394	van	\N	\N	f	0.00	0	test project	Calgary, AB	t	2026-04-22 19:35:30.518155	51.07629010313354	-113.90640787647406	/objects/uploads/36dfcbee-c55a-40e1-ab12-d2b60e92404c.avif			/objects/uploads/37b0a566-5ba8-4cc5-b800-83a3b6db0c5f.png	f	f	0	none	\N	\N	\N	\N	\N	t	0	\N
aa56c69a-0409-49c8-9aa0-2e922ac75f88	ad51e115-0eb8-460f-850c-f4e21ea8045b	car	\N	\N	f	0.00	0	Hello there. My name is Chris. Growing up on a farm it seems like all we ever did was move stuff from point A to point B.  Our word was our bond and we did things to the best of our abilities.  Helping people puts a smile on my face. Let me help you with whatever you need. 	92 Everwillow Green SW, Calgary, AB T2Y 4P1, Canada	t	2026-01-18 19:38:26.794702	50.9157131	-114.1005348	/objects/uploads/bf9590c2-f83a-404d-92df-9926f24dffb2.heif	White	CXZ4025	/objects/uploads/e993ee9b-3b61-43ea-806f-bb4d5e2528da.heif	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-01 00:02:04.076	\N	2026-04-25 00:00:00	2026-04-16 00:18:20.458	t	0	\N
30bba7ff-a9e9-48f4-bdcd-0b196fd22b11	459ff44d-52b4-40c7-8b6d-d69142dd1807	van	\N	\N	f	0.00	0	Hey! I’m Haben, a Calgary mover with a spacious cargo van ready to go. I’m reliable, careful with your stuff, and easy to work with. I’ve helped with moves across the city and know how to load efficiently to protect your items. Let’s make your move simple	6635 106 Ave SE, Calgary, AB, Canada	t	2026-01-17 07:47:37.013129	50.95915038810868	-113.94099163766244	/objects/uploads/b645f621-cc8a-4430-8a8a-f8c723b3dadc.png		CNJ405	/objects/uploads/d0f75b93-545f-4711-87ff-2735dda571f3.jpeg	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-01 00:02:35.645	\N	2026-03-31 00:00:00	2026-08-10 20:52:11.751	t	3	2026-01-25 03:00:00.872
b9f8d7a9-892c-48a7-a62d-dd255d482660	c7ba5412-2021-4d8c-a59e-3e658d9dc0bc	car	\N	\N	f	0.00	0	I’m a reliable and careful mover who treats your belongings with respect. I always arrive on time, work efficiently, and make sure everything is transported safely.	143 Masters St SE, Calgary, AB T3M 2R8, Canada	t	2026-01-16 00:03:30.555331	50.89405765781236	-113.90893885273405	/objects/uploads/b1515505-795f-4b56-b044-1f5fa736005e.jpeg	Black	CVT5188	/objects/uploads/07a9abb0-bddc-4502-9700-a6ef2212de4b.jpeg	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-01 00:02:17.484	\N	2026-04-23 00:00:00	2026-04-16 00:21:27.69	t	0	\N
1c007ab6-7f9a-429d-bc20-79fe07893fad	2a6d2a42-be38-455f-a7d1-2e86c548ec14	car	\N	\N	f	0.00	0	\N	Gv Northeast, 811 Skyview Ranch Grove NE, Calgary, AB T3N 0R7, Canada	t	2026-02-09 02:44:00.274254	51.162041	-113.9484625	\N	Grey		/objects/uploads/3a395d68-cac9-4d08-870d-1c7db0527dcd.jpg	f	f	0	none	\N	\N	\N	\N	2026-02-09 02:46:44.69	f	3	2026-02-18 03:00:01.953
e55370ff-6128-4b54-96d7-6b97faa1e305	bcd90e7c-f434-48d4-9bda-02c3f019fd8e	van	\N	\N	f	0.00	0	Smart and pays attention to details.\n……………………………..	487 Sage Hill Rd NW, Calgary, AB T3R 2A6, Canada	t	2026-01-06 12:48:54.099179	51.17436587087708	-114.14990533465833	/objects/uploads/d7165fdc-e6de-47e9-be5d-b15f42d328ce.jpg	Grey	CVL 6205	/objects/uploads/f4c16caa-e516-467e-9d9b-f58cd22461dd.jpg	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-08-28 20:32:59.535	\N	2026-11-28 00:00:00	2026-09-01 03:21:52.458	t	0	\N
ef0834ff-1dba-46ce-bc09-e60f9d954594	a597a226-387a-4c13-b5e7-61230779e9a1	car	\N	\N	f	0.00	0	Professional mover	10353 Cityscape Dr NE, Calgary, AB T3N 1N5, Canada	t	2025-12-17 02:41:43.348794	51.1442975	-113.9660125	/objects/uploads/82f54896-3668-4523-a239-2f1a1a64230b.jpg	BLACK	CTC 2847	/objects/uploads/170d449d-82a1-40ef-8595-413d19441d98.jpg	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2025-12-17 03:02:17.979	\N	2026-01-16 00:00:00	2026-03-21 23:40:48.98	t	3	2026-01-22 03:00:14.534
f8ed3493-b67c-4550-853c-0a7725e05a55	c15c648e-e21b-4670-b10b-a3fe72f954f1	car	\N	\N	f	0.00	0		10345 Cityscape Dr NE, Calgary, AB T3N 1N5, Canada	t	2026-01-16 23:30:21.691931	51.1441852	-113.9659196	/objects/uploads/09e4c1cd-50c3-4f72-a5d6-cde88fd83790.jpg	Black	B29332	/objects/uploads/54ae39e8-192a-4411-8585-d9256102d740.jpg	f	f	0	none	\N	\N	\N	\N	2026-01-17 00:00:07.716	t	0	\N
c43202f4-84cd-4bb4-9836-475a8b79d109	4f58bec8-80c9-40af-af80-697b7e9c1092	van	\N	\N	f	0.00	0	\N	Calgary, AB	t	2026-01-05 04:04:05.414185	50.913065580916744	-113.98490575614134	\N	\N	\N	\N	f	f	0	none	\N	\N	\N	\N	2026-01-05 19:15:35.286	f	3	2026-01-22 03:00:14.534
69ab690b-1317-4a96-b2a9-cdec9deb0823	f40c6fcf-bb8e-43a5-b88e-eb3ce6540786	van	\N	\N	f	0.00	0	\N	16 Sackville Dr SW, Calgary, AB T2W 0W2, Canada	t	2026-01-22 18:53:57.530259	50.9572317	-114.0855102	\N	\N	\N	\N	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-01 00:03:07.026	\N	2026-03-31 00:00:00	2026-01-22 19:01:52.112	f	3	2026-01-30 09:00:08.199
efed7a9f-3c49-463a-9005-e48e0229208d	5bfb9a7d-9bdb-4b98-8089-83cc81ad067e	pickup	\N	\N	f	0.00	0	For service you can trust never satisfied  until you are 	50.9680, -114.0714	t	2025-12-17 16:35:25.188217	50.9679623	-114.0714376	/objects/uploads/7b5fb2a2-62e1-4716-8d21-0c5d6eddc7b9.jpg	Black 	cbx4256 	/objects/uploads/89ab3119-9fae-4c7c-9ac3-e4f97ac07753.jpg	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-01 00:02:49.755	\N	2026-03-31 00:00:00	2026-03-01 00:19:12.988	t	3	2026-01-22 03:00:14.534
8a964228-a8fc-41c9-a49e-d393cd29f1c6	4f57f73d-fe0c-4535-82ca-3d8a71411d3f	pickup	\N	\N	f	0.00	0	5+ experience with moving quick no damage	425 5 Ave SE, Calgary, AB T2G 0E5, Canada	t	2026-02-03 01:30:35.709642	51.04774740027472	-114.05392868650402	/objects/uploads/50b944bc-6f7d-4dfa-80ce-8b37f9141232.jpeg		Cjs1149	/objects/uploads/76b7c3b8-64b5-4a6b-9905-f5a6af97cdc4.jpeg	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-03 21:35:00.427	\N	2026-02-28 00:00:00	2026-02-03 02:03:07.171	t	0	\N
233e4ec8-9cd2-4bfe-b7a6-51072118a347	d3c90fe2-1bf7-48f3-ba93-cf1afb9aa3d8	pickup	\N	\N	f	0.00	0		Calgary, AB	t	2026-01-04 04:25:51.128372	51.147827124391405	-114.12131415397498	/objects/uploads/1e0bbc37-ed9c-4f0e-90bb-090988b00a56.jpeg	Grey	CGX 7819	/objects/uploads/8dd856a3-3ac7-4e82-bb3f-308e1be9002a.jpeg	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-01-18 22:46:42.309	\N	2026-02-28 00:00:00	2026-01-05 19:15:35.286	t	0	\N
dc19c4be-d113-4932-8d4d-b4ff0d07ebdc	344cb1d8-88b1-45a7-896e-1fcf2fc3687b	van	\N	\N	f	0.00	0	\N	186 Prairie Springs Crescent SW, Airdrie, AB T4B 0G1, Canada	t	2026-01-07 06:25:59.751528	51.2643622	-114.029227	\N	\N	\N	\N	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-03 21:43:17.977	\N	\N	2026-02-07 02:59:43.488	f	3	2026-01-22 03:00:14.534
157317e3-27e1-4691-9042-e219ad1f4db5	0e6e000b-ea4c-4a40-8d9c-237f865633ba	van	\N	\N	f	0.00	0	\N	272 Skyview Shores Manor NE, Calgary, AB T3N 0A5, Canada	t	2026-01-06 18:32:24.203353	51.1546783896488	-113.96767241970248	\N	\N	\N	\N	f	f	0	none	\N	\N	\N	\N	2026-01-06 18:36:37.394	f	3	2026-01-22 03:00:14.534
a003a8cb-58c2-4b66-8154-17cc72c46e56	45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	truck	\N	\N	f	5.00	3	Hey friends I am\nMR MOVE IT ALL a local family owned moving and delivery company.\n\nWe are a people\nFirst company and that is always on display while\nWe are servicing our clients.\n\nBig or small \nWe move it all \n\n\nLuke 	388 Country Hills Blvd NE Unit 200, Calgary, AB T3K 5J6, Canada	t	2026-02-01 19:23:49.811525	51.15493867508209	-114.06534466163788	/objects/uploads/3d9b630d-4d5e-46b8-a073-a1cfd8ef11d8.jpeg	White 	CWJ5587	/objects/uploads/b57d04fd-aacc-4565-9ed8-0369159a8f24.jpeg	f	f	3	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-01 00:13:00.321	Pls kindly upload at least 3 photos of different angles of your truck for compliance 	2026-03-31 00:00:00	2026-04-12 17:44:30.76	t	0	\N
df69e2e8-99a3-4dc9-904d-246d82702969	f7d86b73-7f22-4b9a-b2e2-dc0a4db7c89a	car	\N	\N	f	0.00	0	I’m a professional mover with quality service and very reliable at any time . 	10349 Cityscape Dr NE, Calgary, AB T3N 1N5, Canada	t	2026-02-07 02:00:23.973414	51.144240016014685	-113.9660474192426	/objects/uploads/282d68da-c3bf-4d7c-866d-3fc1db6b1e0b.jpeg	White 	0-cr160	/objects/uploads/9c311e8b-b32c-4504-a99c-5e0975cc2842.jpeg	f	f	0	none	\N	\N	\N	\N	2026-02-07 02:13:55.656	t	0	\N
c854acad-1264-4788-9240-23c40bf77dd3	bb854b34-d1b4-4f78-9b3a-2867b681bec5	van	\N	\N	f	0.00	0	\N	506 W 33rd St, Connersville, IN 47331, USA	t	2026-01-19 11:29:44.414823	39.6746899	-85.1352626	\N	\N	\N	\N	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-03 21:35:48.136	\N	2026-02-28 00:00:00	2026-01-19 11:41:04.675	f	3	2026-01-26 21:00:10.529
bca8c7b0-8fd4-4ecc-97b8-82ebaceaae1e	530dfe4e-205c-48e8-aa4d-42fbd5eb86be	van	\N	\N	f	0.00	0	Service provider for the greater Calgary area. Small moves, single item, courier 	270074 Range Rd 45, Rocky View County, AB T0l, Canada	t	2026-01-31 21:20:07.642297	51.2731949	-114.5395052	/objects/uploads/32ecb976-4d6c-4538-a529-340f83a1100c.jpg	White	BLT9579	/objects/uploads/e8a6de85-573f-4953-9856-8be1c36bc421.jpg	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-03 21:35:35.403	\N	2026-02-28 00:00:00	2026-02-05 21:48:29.938	t	2	2026-02-04 03:00:09.841
dca8dd3e-2c97-4f23-9db8-9621470f674d	278a5425-c7a9-475e-8db7-dd99a4274506	car	\N	\N	f	0.00	0		Calgary, AB	t	2026-01-05 02:33:36.11968	50.93047996729978	-113.87607342001903	/objects/uploads/0beacced-bfcd-4bad-a5ff-1917518a2961.jpeg	Blue	0AW736	/objects/uploads/efb42ffd-2d4a-4132-ace7-0e77adc5f65f.jpeg	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-01-18 22:42:58.166	\N	2026-02-28 00:00:00	2026-01-05 19:15:35.286	t	0	\N
1b901406-1947-49ba-80a9-3e8a477c8957	a3e3a896-7063-45f6-84e1-1cb0e252675e	pickup	\N	\N	f	0.00	1		111 Savanna Wy NE, Calgary, AB T3J 0Y6, Canada	t	2025-12-13 16:37:40.884545	51.136542728592474	-113.9698147047412	/objects/uploads/0165178f-a617-40df-9bef-13461d418d5e.jpeg	Grey	0eh681	/objects/uploads/958a630f-e89d-44c6-98ec-1557c04ce46e.jpg	f	f	1	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2025-12-13 20:21:01.023	Congratulations! \n\nYou have been approved for the early access program. Review the terms and click the check box via a pop-up window for you to be matched by the system for jobs.	2026-01-13 00:00:00	2026-04-27 02:37:39.176	t	0	\N
26548dcf-bb3b-4b42-b11e-90adcae7f52f	63b9d475-4715-4717-a87e-63c7d7dfabb6	pickup	\N	\N	f	5.00	1		319 Applestone Park SE, Calgary, AB T2A 7S4, Canada	t	2025-12-16 23:45:06.67999	51.04216957093881	-113.92540679018508	/objects/uploads/48e0030a-8a8b-4dd1-aec1-c4cb248e3ddc.jpeg	White 	CNY0893	/objects/uploads/bf8af5c6-eb67-4668-b8cd-11a3014a28ac.png	f	f	1	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2025-12-17 03:06:12.232	\N	2026-01-16 00:00:00	2026-02-19 02:23:11.553	t	0	\N
15a904b7-4267-4b96-8a9f-548f603fda3d	c0f633be-1dd5-4c59-a440-f79aebc8c596	van	\N	\N	f	0.00	0	\N	WB Castleridge DR @ Castledale CR NE, Calgary, AB T3J 1X3, Canada	t	2026-02-03 01:58:29.613596	51.10782295922047	-113.9599371655016	/objects/uploads/b71df9b6-53f9-4543-b975-38b6a476f4d8.jpeg	White	Csv-0930	/objects/uploads/94365919-0c17-4dc9-a0a4-aceb7d039ac5.png	f	f	0	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-03 21:35:13.092	\N	2026-02-28 00:00:00	2026-04-27 00:48:48.614	t	3	2026-02-10 21:00:08.202
aa2cde65-b901-4fc5-895c-c8baad294a2e	38fa65dc-8d0e-488b-888c-8e0d030a370f	pickup	\N	\N	f	5.00	4	Great at work 	10349 Cityscape Dr NE, Calgary, AB T3N 2A1, Canada	t	2025-12-06 22:26:21.79845	51.144220219361095	-113.96595983648326	/objects/uploads/2602be7b-bb67-4791-b8b9-43b5dcc2621d.PNG	Grey	AB4567	/objects/uploads/837c4bea-bead-4822-a806-e36341c89cd2.jpg	f	f	4	approved	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2025-12-17 18:24:06.442	\N	2026-01-17 00:00:00	2026-09-01 00:57:51.098	t	0	\N
\.


--
-- Data for Name: partner_audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.partner_audit_log (id, partner_id, actor_id, action, object_type, object_id, notes, ip_address, created_at) FROM stdin;
31c01e3a-6344-493d-8238-288df72d9805	cd5cef54-dcf9-4196-9678-3a92fef01d13	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	partner.invited	partner	cd5cef54-dcf9-4196-9678-3a92fef01d13	Invited: john@lervit.com	\N	2026-05-05 23:23:48.746892
\.


--
-- Data for Name: partner_direct_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.partner_direct_messages (id, partner_id, sender_id, sender_role, text, created_at, read_at) FROM stdin;
\.


--
-- Data for Name: partner_incidents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.partner_incidents (id, booking_id, partner_id, category, severity, status, title, notes, file_urls, escalation_flag, reported_by, resolved_by, resolved_at, resolution_notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: partner_invites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.partner_invites (id, partner_id, email, role, token, expires_at, used_at, invited_by, created_at, name) FROM stdin;
a598d712-bbb2-4698-bc32-ec30b89400fb	cd5cef54-dcf9-4196-9678-3a92fef01d13	john@lervit.com	partner_admin	5549caeda9f943d0d5ff8179720294e03d48f3ec4b4c4042ede858a4f50bc2c2	2026-05-12 23:23:48.669	\N	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-05-05 23:23:48.690213	\N
\.


--
-- Data for Name: partner_team_members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.partner_team_members (id, partner_id, name, member_type, phone, vehicle_type, vehicle_plate, vehicle_color, is_available, notes, created_at, driver_photo, vehicle_photo) FROM stdin;
\.


--
-- Data for Name: partner_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.partner_users (id, user_id, partner_id, partner_role, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: partners; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.partners (id, name, legal_name, operating_name, status, onboarding_step, billing_email, primary_ops_contact, dispatch_contact, escalation_contact, address, phone, service_description, dispatch_method, dispatch_phone, dispatch_email, dispatch_notes, profile_complete, coverage_complete, compliance_complete, dispatch_complete, terms_accepted, terms_accepted_at, test_booking_complete, activated_at, activated_by, suspended_at, suspended_reason, admin_notes, created_at, updated_at, stripe_account_id, stripe_connect_status, stripe_payouts_enabled, stripe_details_submitted, primary_ops_email, primary_ops_phone, logo_url, contact_email) FROM stdin;
cd5cef54-dcf9-4196-9678-3a92fef01d13	Apex consults Ltd 	Apex consults Ltd	\N	invited	1	\N	\N	\N	\N	\N	\N	\N	manual	\N	\N	\N	f	f	f	f	f	\N	f	\N	\N	\N	\N	\N	2026-05-05 23:23:48.636838	2026-05-05 23:23:48.636838	\N	not_connected	f	f	\N	\N	\N	\N
\.


--
-- Data for Name: phone_verification_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.phone_verification_tokens (id, phone, verification_code, expires_at, verified, verified_token, created_at) FROM stdin;
1eb70b12-a1cf-430e-9215-fba0dff65b9b	4039235355	477826	2025-12-15 22:26:19.872	f	\N	2025-12-15 22:16:19.939879
ffd65ed1-796f-45fe-ab24-3593f2f79e6b	8257369216	637292	2026-01-10 20:47:07.771	f	\N	2026-01-10 20:37:07.838059
3a1051a0-57da-46da-9b85-2bc0309cc8b3	4035614820	695202	2026-02-03 17:18:31.368	t	d6b694d5952f5427100a62270bc6541ae5a598817f74fbe823ae8052bff2e3b1	2026-02-03 16:48:06.920224
a49c79a4-a439-458b-a326-57abc18e7c02	5874379637	551493	2026-07-10 20:59:20.943	f	\N	2026-07-10 20:49:21.010734
d9761822-dd7d-4315-87b9-b969a4d41bb9	12049300497	335370	2026-01-16 23:38:04.658	f	\N	2026-01-16 23:28:04.724612
4eaad949-7816-40e9-8d05-91525da75376	8253652510	338374	2026-08-20 14:20:37.494	f	\N	2026-08-20 14:10:37.573554
fe63fc7e-b0f0-48a8-b3da-0f5d44c92811	8255618662	637514	2026-08-20 15:21:18.82	f	\N	2026-08-20 15:11:18.908585
3469c0cd-e366-4fbc-8927-b49bf73bc223	5876649014	821220	2026-01-06 20:43:59.748	f	\N	2026-01-06 20:33:59.815824
fcc11bcc-999e-4401-99a6-13b5ec1548e4	8254545170	955544	2026-01-06 20:49:37.039	f	\N	2026-01-06 20:39:37.117483
f6adf5d9-9ce4-49bb-a2d1-16ec5b0aea0e	3072047305	267688	2026-01-08 04:33:38.794	f	\N	2026-01-08 04:23:38.85951
7da49a71-626d-4667-9692-5c9ec3672f18	4038622500	444800	2026-04-08 12:21:02.182	f	\N	2026-04-08 12:11:02.254377
162a20c6-05b7-4541-85fc-483600c48b68	6046385073	423804	2026-04-10 15:14:08.442	f	\N	2026-04-10 15:04:08.508069
628f1f04-9bc9-4625-8be7-79cba31cae5f	6047541708	299768	2026-01-31 02:25:05.375	f	\N	2026-01-31 02:15:05.442031
7dcd7a6a-01de-4527-b968-4f4f9e3fd445	4039096588	170561	2026-04-27 03:32:01.98	f	\N	2026-04-27 03:22:02.052954
\.


--
-- Data for Name: proof_of_completion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.proof_of_completion (id, booking_id, partner_id, file_url, file_name, file_type, proof_type, notes, uploaded_by, uploaded_at) FROM stdin;
\.


--
-- Data for Name: referrals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.referrals (id, referrer_id, referred_id, code, credit_awarded, created_at) FROM stdin;
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reviews (id, booking_id, mover_id, customer_id, rating, comment, created_at) FROM stdin;
77363150-44ae-410e-a13e-79bd2e3deda4	ab33710c-04f2-46a7-834a-8cdd6c59a324	2437c092-cd4a-4b58-826e-504858d822fa	bea15756-b2a3-405b-8834-3b7d224c67b5	5	Justus was exceptional. Great Job!	2026-01-04 22:37:15.694893
2614eff1-0fa2-4eb3-9204-048a5bb5ffa6	ab33710c-04f2-46a7-834a-8cdd6c59a324	2437c092-cd4a-4b58-826e-504858d822fa	bea15756-b2a3-405b-8834-3b7d224c67b5	5	Justus was exceptional. Great Job!	2026-01-04 22:37:55.57133
0780cf7f-63ee-4159-b25c-aa7eee5d76a4	d8431b18-73d9-4982-a93e-683d55e98b35	aa2cde65-b901-4fc5-895c-c8baad294a2e	bea15756-b2a3-405b-8834-3b7d224c67b5	5	Great job	2026-01-04 23:23:33.14034
38d8c4d6-18c7-4784-988f-3f204d58b34c	8bf9cad6-8414-473a-8906-e818d5b4c152	aa2cde65-b901-4fc5-895c-c8baad294a2e	bea15756-b2a3-405b-8834-3b7d224c67b5	5	Great job 	2026-01-04 23:23:55.545118
f783c5d8-a4c1-41a6-86cd-0a46b67f708e	1f9ce5c9-7603-4f16-ba84-49fd3acdf273	aa2cde65-b901-4fc5-895c-c8baad294a2e	bea15756-b2a3-405b-8834-3b7d224c67b5	5	\N	2026-01-04 23:27:06.639225
186fd7ad-43ad-4851-b82d-1c727c303b65	bdfef8db-909b-45f3-b92b-80786dbaff8d	26548dcf-bb3b-4b42-b11e-90adcae7f52f	bea15756-b2a3-405b-8834-3b7d224c67b5	5	This was excellent	2026-01-06 01:35:23.63089
6114c2f1-610c-4b9f-8e22-69a37b9fc052	e3010d43-1042-4224-b4fe-e5c7e8bfe6a0	a003a8cb-58c2-4b66-8154-17cc72c46e56	bea15756-b2a3-405b-8834-3b7d224c67b5	5	Luke was awesome, sofa was delivered as expected 	2026-02-05 22:03:43.395363
cd6ef80b-d418-4b48-97a0-cf1fa530c75c	496d7bee-baf6-409d-9621-6845ca2f20d7	a003a8cb-58c2-4b66-8154-17cc72c46e56	bea15756-b2a3-405b-8834-3b7d224c67b5	5	Awesome Driver 	2026-02-06 02:42:54.672684
610e8f63-8748-460e-b074-8ce797e18ca9	2cb3dbf3-a880-44bd-82f9-93ca2a111081	64d3cbb5-bba3-429c-9d4a-cdd69237152c	bea15756-b2a3-405b-8834-3b7d224c67b5	5	\N	2026-02-19 00:55:03.689716
6330bacd-34a3-4f81-b1ea-181cb6d03e41	5c653d68-23c8-4d1a-835d-7bed22ee5a95	605c6dad-cfed-43ba-99a1-8cb89c0516f8	bea15756-b2a3-405b-8834-3b7d224c67b5	5	\N	2026-07-10 20:17:58.774611
8723ba47-5bbd-407e-bf73-51ee78b8201e	af96a642-2419-4b11-88de-b1a2902984f5	64d3cbb5-bba3-429c-9d4a-cdd69237152c	02073e48-8786-455f-96ec-789cfb40b633	5	\N	2026-07-12 02:58:30.841771
555a8e57-48ed-4005-b082-4a8ef5301969	763dbbae-612d-4668-b16a-55582e9f92ef	605c6dad-cfed-43ba-99a1-8cb89c0516f8	5e33efa5-cfb6-4083-9860-61668eb028f3	5	\N	2026-08-07 22:15:21.005379
\.


--
-- Data for Name: saved_addresses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.saved_addresses (id, user_id, label, address, latitude, longitude, created_at) FROM stdin;
\.


--
-- Data for Name: support_ticket_replies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.support_ticket_replies (id, ticket_id, user_id, message, is_staff, created_at) FROM stdin;
752e594e-ddc4-465c-a914-2ae55d82895c	01ff44e7-838e-448f-be62-49506783ce69	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	Dear [Customer Name],\n\nWe sincerely apologize for the inconvenience you experienced while trying to complete your booking. Our team is actively investigating the issue with the payment process and working on a solution to restore full functionality as quickly as possible. We appreciate your patience and understanding during this time. Please let us know if there's anything else we can assist you with.\n\nBest regards,\n[Your Name] - LervIT Support Team	t	2025-12-07 01:08:51.440786
a4304c6b-52e9-4d84-abcc-6975cbd5b605	eb1b0d91-edf3-4b8d-9980-614478f076ec	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	Dear Tim,\n\n Thank you for reaching out to us. I understand how important it is for you to get your documents reviewed promptly so you can proceed with your booking. \n\nI'm truly sorry for the delay you're experiencing. Rest assured, we are looking into this matter and will do our best to expedite the process. \n\nWe appreciate your patience and understanding. Please feel free to reach out if you have any further questions or need assistance.	t	2026-02-01 00:53:14.199957
86e3edfb-d715-411a-b227-91e83c8fcf0c	eb1b0d91-edf3-4b8d-9980-614478f076ec	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	Hello Tim,\n\nThanks for your patience as we try to resolve your issue. We realised the documents were not properly upload and we advice you upload the documents in JPG and PDF format. \n\nAs soon as this is done, we will expedite your request and get you started. Also, the review process takes 2 business days for approval. \n\nThanks again for your patience.	t	2026-02-01 01:00:08.762493
fdcbbaf0-a958-46d9-bd9d-e50471e67f1c	72a35df0-0b5d-470f-a46e-9ae536726676	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	Thank you for reaching out to us! We understand how important it is for you to set your availability accurately.  If you need any further assistance or encounter any issues, please let us know, and we'll be more than happy to help. We appreciate your patience and look forward to ensuring your schedule is set just right!	t	2026-02-01 22:16:35.858392
aa7c271c-b522-4756-ad9e-fc5d27c4fe5d	4137c7b2-aab2-4317-b31c-b8935eb192c5	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	Thank you for reaching out to us. I apologize for the delay in job assignment. We are updating our systems for more prompt job assignment 	t	2026-02-20 04:13:16.533783
ada1c971-1c9f-4694-8aa6-285d5e49915b	e5eafd80-2611-4c09-b7be-faaf9ae7799c	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	This ticket is closed 	t	2026-03-01 19:54:31.476277
706e6052-215e-4cf7-af48-28d10797b530	a9009571-ed23-4e26-88db-22ad53588ce6	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	Thank you for reaching out to us and for submitting your documents. We understand how important it is for you to get verified as a mover, and we're here to help. Our team is currently reviewing your documents, and we'll make sure to update you as soon as the verification is complete. We appreciate your patience and are excited to have you join our community of movers!	t	2026-03-19 22:46:49.113912
d23de91d-2caa-41fc-beba-9ded94834fcb	a9009571-ed23-4e26-88db-22ad53588ce6	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	After reviewing your documents, please upload multiple photos of the vehicle from different sides. 	t	2026-03-23 22:40:58.395038
d85dc64d-25a1-4ad2-a9c8-48766360b6b9	a9009571-ed23-4e26-88db-22ad53588ce6	66904619-efab-45ee-988f-1a94af36a287	Please I have uploaded different photos for your approval.\nThank you	f	2026-03-24 18:11:56.834766
6b42c634-8f58-4b3b-af06-a82e9858868f	a9009571-ed23-4e26-88db-22ad53588ce6	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	Your documents are now approved. Should you have any concerns, do not hesitate to contact support. I will move to close this ticket. 	t	2026-03-25 21:10:50.721217
31cf9b2e-bf2e-4ddb-af22-69fc250d152a	4a9be2bb-a0fb-4fe0-a616-f13e997cfa38	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	Thank you for reaching out and letting us know about your experience. We understand how important it is for you to receive job offers promptly. Our team is here to help. We will review your profile and settings to ensure everything is optimized for you to receive more job opportunities. Please bear with us as we look into this, and we will get back to you shortly with more information. We appreciate your patience and are committed to resolving this for you.	t	2026-04-02 02:10:37.335087
\.


--
-- Data for Name: support_tickets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.support_tickets (id, user_id, subject, category, message, status, priority, assigned_to, resolved_at, created_at, updated_at, customer_last_read_at, last_staff_reply_at) FROM stdin;
a9009571-ed23-4e26-88db-22ad53588ce6	66904619-efab-45ee-988f-1a94af36a287	Need verification 	general	Please I submitted the  necessary docs and need verification for movers.\nThank you	resolved	normal	\N	2026-03-25 21:10:55.667	2026-03-19 19:15:31.926061	2026-03-25 21:10:55.667	2026-03-27 23:03:52.438	2026-03-25 21:10:50.759
4a9be2bb-a0fb-4fe0-a616-f13e997cfa38	66904619-efab-45ee-988f-1a94af36a287	Difficult to get job	general	Please I was stayed online but difficult to get job.\nHow can you assist me?\nThank you 	open	normal	\N	\N	2026-03-28 01:04:26.931202	2026-04-02 02:10:37.371	2026-03-31 16:17:23.51	2026-04-02 02:10:37.371
72a35df0-0b5d-470f-a46e-9ae536726676	65d807fc-eaae-4407-8a8b-85a28a699047	Days available 	general	My availability is Monday to Saturday from 12:00 noon to 8:00 p.m	closed	low	\N	2026-02-20 04:13:37.285	2026-02-01 01:07:30.791992	2026-02-20 04:13:37.285	2026-02-07 20:09:27.68	2026-02-01 22:16:35.894
01ff44e7-838e-448f-be62-49506783ce69	bea15756-b2a3-405b-8834-3b7d224c67b5	Customer is unable to complete a booking. The final payment step fails, causing the entire booking flow to break. This affects all users attempting to make payments and prevents revenue generation.	billing	\n\n🔍 Detailed Description\n\nA customer attempted to book a small-goods pickup. After selecting item type, calculating distance, choosing number of movers, and confirming the price, the “Pay Now” button triggers a Stripe checkout error.\n\nObserved Behavior:\n\nAfter clicking Pay Now, the screen loads for 2 seconds\n\nA red error banner appears:\n“Payment session could not be created. Please try again.”\n\nThe customer is sent back to the previous step\n\nBooking is not logged in the database\n\nNo booking confirmation email is sent\n\nStripe logs show no payment intent created\n\nCustomer Impact:\n\nCannot complete any booking\n\nCustomer attempted 3 times → same failure\n\nCustomer abandoned the process\n\nBusiness Impact:\n\nCritical revenue blockage\n\nAll payments may be affected\n\nPotential loss of customers during early traction\n\n🧩 Relevant Technical Data\n\nAsset involved:\n\nStripe Payment Intent Handler\n\nAPI Route: POST /api/payment/create-session\n\nLogs indicate:\n\n{\n  "error": "Missing priceId or amount",\n  "status": 500\n}\n\n\nDatabase:\n\nNo new entry created in bookings table\n\nSession ID not generated\n\nFrontend:\n\nPayment button triggers onclick event but fails silently before Stripe redirect\n\nConsole warning:\n\nUncaught TypeError: Cannot read property 'amount' of undefined\n\n📌 Steps to Reproduce\n\nOpen app.lervit.com/request-move\n\nUpload an item photo\n\nAdd pickup & dropoff addresses\n\nSelect mover option\n\nProceed to checkout page\n\nClick Pay Now\n\nObserve error and failed payment flow\n\n🎯 Expected Behavior\n\nStripe payment session should be created successfully\n\nUser should be redirected to Stripe Checkout\n\nBooking should be logged with status "Pending Payment"\n\nEmail confirmation should be sent via Resend\n\n🛠 Suggested Immediate Actions (For the AI Copilot)\n\nCheck if the pricing engine is passing amount properly into the Stripe session request\n\nVerify that priceId or amount is created before calling Stripe API\n\nInspect logs for recent changes to create-session API route\n\nRecommend rolling back latest deployment if needed\n\nAuto-generate a corrected API payload based on available asset metadata\n\nTest a simulated booking using internal test card (Stripe test mode)\n\n📎 Attachments\n\nScreenshot of the error (placeholder)\n\nConsole log snippet\n\nPayload example failing\n\n✔ This is a perfect P1 ticket for testing your AI support copilot.\n\nIf you want variations (driver-side P1, admin dashboard P1, map location bug, tracking bug, pricing engine bug), I can generate more.	closed	high	\N	2026-02-20 04:13:49.391	2025-12-07 00:55:23.439269	2026-02-20 04:13:49.391	2025-12-07 02:21:08.097	\N
e5eafd80-2611-4c09-b7be-faaf9ae7799c	ac72e389-defb-4204-baa1-c291b6d3fb5f	I want to cancel 	general	I want to cancel because you guys don't provide assembly of furniture and I want a refund	closed	high	\N	2026-03-01 19:54:35.23	2026-02-28 16:32:06.488573	2026-03-01 19:54:35.23	\N	2026-03-01 19:54:31.511
4137c7b2-aab2-4317-b31c-b8935eb192c5	65d807fc-eaae-4407-8a8b-85a28a699047	Update	booking	You promised to send me job am still waiting 	closed	normal	\N	2026-03-01 19:54:57.36	2026-02-05 16:54:59.566556	2026-03-01 19:54:57.36	2026-02-20 21:18:23.208	2026-02-20 04:13:16.565
eb1b0d91-edf3-4b8d-9980-614478f076ec	65d807fc-eaae-4407-8a8b-85a28a699047	Review of documents 	booking	Tim Okosun document under review it talking time for me to go onboard 	closed	normal	\N	2026-03-01 19:55:05.32	2026-02-01 00:38:39.456742	2026-03-01 19:55:05.32	2026-02-07 20:09:12.779	2026-02-01 01:00:08.796
29e4c350-03d0-45e0-9e6b-bf86e936f79e	c8930b20-e428-4e25-87b9-f79bff41bec3	Payment info	billing	The system does not let me update payment info. Kindly help thenks	closed	normal	\N	2026-03-01 19:55:13.887	2026-01-05 21:04:45.639347	2026-03-01 19:55:13.887	\N	\N
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_sessions (sid, sess, expire) FROM stdin;
Cez188i_dxnga3hoPN9gFljnDOEMXxRd	{"cookie":{"originalMaxAge":28800000,"expires":"2026-09-01T11:14:37.318Z","secure":true,"httpOnly":true,"path":"/","sameSite":"strict"},"userId":"bcd90e7c-f434-48d4-9bda-02c3f019fd8e","userRole":"mover"}	2026-09-01 11:21:53
YDvXNtDvCe6Iovy8lJEJ82ProRm3MqIL	{"cookie":{"originalMaxAge":28800000,"expires":"2026-09-01T10:02:53.742Z","secure":true,"httpOnly":true,"path":"/","sameSite":"strict"},"userId":"5bfb9a7d-9bdb-4b98-8089-83cc81ad067e","userRole":"mover"}	2026-09-01 10:03:08
PMu34XIibe7kusLuvCNSSJY_aNL-hVjz	{"cookie":{"originalMaxAge":28800000,"expires":"2026-09-01T08:59:47.265Z","secure":true,"httpOnly":true,"path":"/","sameSite":"strict"},"userId":"3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8","userRole":"mover"}	2026-09-01 12:22:01
qP2pc7vitOvb9IO7NzUXdwH7fBMKzHqW	{"cookie":{"originalMaxAge":28800000,"expires":"2026-09-01T09:48:41.657Z","secure":true,"httpOnly":true,"path":"/","sameSite":"strict"},"userId":"fb6f03ed-996c-482c-8312-934d14a9d630","userRole":"customer"}	2026-09-01 11:58:13
hvPdiIowzHgV6DPGT8Sx52ZLYiyOhW60	{"cookie":{"originalMaxAge":28800000,"expires":"2026-09-01T11:08:21.197Z","secure":true,"httpOnly":true,"path":"/","sameSite":"strict"},"userId":"ecbaa1cf-179f-4195-adf8-0f5da3c24a27","userRole":"admin"}	2026-09-01 12:40:29
Ax6sFXDKz8oq_qrPbepPuufa_WoppdC4	{"cookie":{"originalMaxAge":28800000,"expires":"2026-09-01T09:00:13.419Z","secure":true,"httpOnly":true,"path":"/","sameSite":"strict"},"userId":"3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8","userRole":"mover"}	2026-09-01 12:23:18
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, firebase_uid, email, name, phone, role, created_at, password, reset_token, reset_token_expiry, address, avatar_url, stripe_customer_id, failed_login_attempts, locked_until, locked_by_admin, lock_reason, has_completed_onboarding, has_used_first_move_discount, email_verified, verification_token, verification_token_expiry, phone_verified, phone_verification_code, phone_verification_expiry, sms_job_alerts, sms_booking_updates, email_job_alerts, email_booking_updates, email_earnings_reports, push_notifications, email_promotions, last_login_at, last_logout_at, promo_uses_count, referral_code, referral_credits, referral_count) FROM stdin;
568683dc-b8bb-47c2-8b63-02823ca4409b	\N	sydneyent@gmail.com	Ruth	4033331029	customer	2025-11-21 04:22:53.662646	36d7196ffb9bfb623016d7bf544ab040:85edd8e8d1b43e36a2e7da23f9adf769d251ff93532e2dcbcbb7f3d65e441036	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	f	\N	\N	f	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
a597a226-387a-4c13-b5e7-61230779e9a1	\N	JOYC.IKORO@GMAIL.COM	Joy lkoro	5874368560	mover	2025-12-17 02:41:42.989381	12806fcf1a2200a01539699b89cdbd5c:25b9e3f6131ee9c0fd92fd51f60a0c7197558e8d0604444a271760e06e3b6d25	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-03-21 23:30:09.766	\N	0	\N	0	0
31d181d0-796d-45b2-9b9c-503ea60f50cb	\N	hilbanito@gmail.com	ime ekeno	7805314864	customer	2025-11-22 19:39:32.188195	0676b406e579fbc2f9210fbef13b7076:d095c7186772c5d4aa183d5d448e0a12dd2d298e890ac351c0e289b60fa5a567	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	f	\N	\N	f	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
528c9186-d2fd-46fb-ad68-592db7eedff2	\N	el4uandme@hotmail.com	Mbeku E Ellis	09098149115	customer	2025-11-23 17:50:24.902946	140bfc36188d3bd2ba6bb63b6565622d:c8b105df8b317d52b74e2a3c4984b471e9ab0cdb1d129b3e24102f5d3ee19e68	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	f	\N	\N	f	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
3d67e96a-ad34-4eec-8830-8c9a699a41f5	\N	atakon2000@gmail.com	Agim Takon	5879738848	customer	2025-12-14 00:44:57.821509	d49835d9a94fa698faaf63aef61574f4:814567d92957367f84d85415192122721ea6eaab8152508320e3d84609021d7d	\N	\N	\N	\N	\N	0	\N	f	\N	t	t	f	\N	\N	f	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
905344d1-9b84-4eca-a3b2-2227b25ccd83	\N	Modasonsinc@gmail.com	Mo	4039034107	customer	2025-11-29 00:15:44.651593	8c7514a25d6ba74cc0c5bfaf7c57c314:c57e3d81186b52fddbd13c77b746467f50e57d93b1efba663ff71b85fbdcc078	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	f	\N	\N	f	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
4f58bec8-80c9-40af-af80-697b7e9c1092	\N	falana.tunde03@gmail.com	babatunde falana	4038908699	mover	2026-01-05 04:04:05.081744	4911706a678b873fad47ea720f30a15a:1c89d0e8c7e5f788620bc5529b890c7c4aa0cb8cba618a0c9c29eb357ba7045b	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
bcd90e7c-f434-48d4-9bda-02c3f019fd8e	\N	atat.aaron@gmail.com	Aaron Atat	4038881937	mover	2026-01-06 12:48:53.710507	$2b$12$FSTsH4dYuEX8rGBK68i50uoh84U2cTYTxKP5s7J6U5bFpPv6NkWyW	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-09-01 03:14:37.169	2026-01-18 21:06:10.98	0	\N	0	0
278a5425-c7a9-475e-8db7-dd99a4274506	\N	ezemonek@gmail.com	Chibueze Moneke	4033977435	mover	2026-01-05 02:33:35.679754	a148ef8ce7dbf4290cb55383c425a729:9e47ab4e3ad4b5d79fe000011dc506d586bcfd5af87bd002d25a8a0e30e15355	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-01-05 02:34:17.831	2026-01-05 02:41:09.351	0	\N	0	0
5bfb9a7d-9bdb-4b98-8089-83cc81ad067e	\N	imperialenterprises2009@gmail.com	Mick	5878889344	mover	2025-12-17 16:35:24.809552	$2b$12$fXCV04JQFpKijGbwjzQTxuH/F2Fkxj2tzyAwWWrCBcmLtLRv0LwJO	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-09-01 02:02:53.59	\N	0	\N	0	0
d3c90fe2-1bf7-48f3-ba93-cf1afb9aa3d8	\N	faeqabdalmohammed@hotmail.com	Alekbar	4039039060	mover	2026-01-04 04:25:50.762216	a7628e92ce0185c21a8a5888ba736bcc:2aa6cc23a07451e2ec9443827569e6bb22d2af68cce7b31ac14f404ac2614838	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-01-05 23:10:58.832	2026-01-04 04:35:35.222	0	\N	0	0
38fa65dc-8d0e-488b-888c-8e0d030a370f	\N	ekijohn101@hotmail.com	Mbeku o	4039235355	mover	2025-12-06 22:26:21.70869	$2b$12$ZpLuZfboiToGdx5du5f8secRkbAE8e/hHwPQoDOLUuywYBZJeauFe	\N	\N	10349 Cityscape Dr NE, Calgary	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	t	t	t	t	t	f	2026-09-01 00:58:28.524	2026-09-01 01:00:29.547	0	\N	0	0
0e6e000b-ea4c-4a40-8d9c-237f865633ba	\N	mntufail2000@yahoo.com	Muhammad 	4038293355	mover	2026-01-06 18:32:23.868106	4acd208ea7815a93b6207df40f412746:eca374054ec1fab378fc0f975601433dbffdc4dd09057557e77f67f0e1e24274	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-01-06 18:33:46.736	\N	0	\N	0	0
6befe13b-ce4a-4ee8-9184-f7ea4b50155a	\N	akinkuye@outlook.com	Akin Kuye	5873361967	customer	2026-01-14 19:16:09.079797	4127ea45f2e74acea4cd28f29b29c06b:a5a0c8e8d477a137d48da2956f4a625abb6cf68f70eb53e6a926c8894bf7e321	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-01-28 06:28:37.659	\N	0	\N	0	0
b23e5c31-ac7a-425a-aeed-b595c4e4b834	\N	leonardo_alzueta@outlook.com	Leonardo Alzueta	4039253110	customer	2025-11-22 18:18:21.127451	828eb393361a28a6cd450b2a0097dab8:df2f044c52e77cc0ff46802f57713fd9ee0da7c4356d1ea84d9374914b3e6c90	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	f	530261	2026-01-03 19:58:17.625	t	f	t	t	t	t	f	2026-01-03 19:47:21.756	\N	0	\N	0	0
a3e3a896-7063-45f6-84e1-1cb0e252675e	\N	razachuhdry53@gmail.com	Ali raza	4033992884	mover	2025-12-13 16:37:40.826695	8149b1251f35fc007a0229b29dc8d255:ca4f6587dbde217246932645c2b8bab9a82e3e89f0c822db027cabacdd872e37	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	f	\N	\N	t	f	t	t	t	t	f	2026-04-27 01:57:07.263	2026-04-27 01:56:59.232	0	\N	0	0
63b9d475-4715-4717-a87e-63c7d7dfabb6	\N	Shahzairullah@yahoo.ca	Shah	4036506963	mover	2025-12-16 23:45:06.294904	468eba2af352be391a133ac684cdeaa3:e3ba7462b3140a003b70cb5650a643c95ccb7d079d8e9b5104f75f42161c3c78	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-02-19 02:22:36.087	2026-01-06 01:44:46.902	0	\N	0	0
2b515463-1126-4e10-bff7-9749c51804ca	\N	Isaiahtope99@gmail.com	Isaiah Tope	8254541287	mover	2026-01-11 00:21:04.678643	eee937346b9855be43196dca4178ccf9:f1bd8546e936acbd6fdd3efa976f51844a8ad84cdd421931b4a3d601dbfd6777	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-01-18 21:44:47.655	2026-01-11 00:57:10.763	0	\N	0	0
6f8f7816-407d-4cf7-8dbe-a86798e048c8	\N	elianyarias2323@gmail.com	Eliany Arias	3683990109	customer	2026-01-04 17:04:06.573506	0da4c45b7f2ec48ffef2b3f034d567ea:80fbd81b06278c4e7926570b30e88dc06d9ab92a16162e9adc5f5a4a687dbd9e	\N	\N	\N	\N	\N	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-01-04 17:04:57.016	\N	0	\N	0	0
dd5d2815-4649-4563-b756-c9b471971de0	\N	johndoings1990@gmail.com	John Doe	5879757890	customer	2026-01-08 05:07:51.944374	039f5a4f174c452c0e8737dc63b7156b:8af55c4c3daf180450ba71bc513453e7b3319c1764727ce689ce8d667a0fd3b4	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	2026-01-08 16:01:12.743	0	\N	0	0
7e454eca-11fc-4fe2-a4ce-2de1d894e137	\N	alayan4sure@yahoo.com	Seun alayande	4038631590	customer	2026-01-02 01:43:21.440097	a3ce01574b2a7cd12f545c2bd314cbcb:301eb4003e0a5ce8c53bc902802a03440941ca71253d217f7ea56bf3d9c1c3fc	\N	\N		/objects/uploads/bc85f9e8-2b8c-41d3-b7f2-3f5de19ec621.jpg	\N	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	t	t	t	t	t	t	2026-05-09 17:18:50.346	2026-04-18 19:15:50.212	0	\N	0	0
c8930b20-e428-4e25-87b9-f79bff41bec3	\N	justusmovers2024@outlook.com	justus bwoburu	4036179167	mover	2025-12-17 00:09:35.205641	db3b1470900f5b1770013da2e1bef0a0:28998705881acdf7d7351c15177f5b5e16c1b745af670a5a9b4a41117156baaa	\N	\N	425 corner meadows way ne	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	t	t	t	t	t	f	2026-04-25 23:53:01.619	2026-01-06 02:35:38.713	0	\N	0	0
344cb1d8-88b1-45a7-896e-1fcf2fc3687b	\N	sethxeflide_1@yahoo.ca	Seth Xeflide	5872253699	mover	2026-01-07 06:25:59.373284	2e0e3615cceb1654b996d4442b2c4bd6:26ba5fdca9fa3e7f3d302f50964bfdd795b83981d5a1dd1e889ad7b0d57640de	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-02-07 02:59:32.078	\N	0	\N	0	0
014395ad-5920-49dd-9291-a4189bb8ce9e	\N	ogoelumeze@gmail.com	Ogo Elumeze	8257359216	customer	2026-01-10 20:38:00.141752	e9a30ba3967383630e7a4d2cadd0fbe5:57ef8384cc11f731966938526fe1eeeee0da6452ab7786a309da49f690bc5d33	\N	\N	\N	\N	\N	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
ecbaa1cf-179f-4195-adf8-0f5da3c24a27	\N	admin@lervit.com	LervIT Admin	403-555-9999	admin	2025-11-21 21:22:14.296662	$2b$12$sRyFjkbMXNWAp1151rTzP.p3F4zaEcgJARQ7TAWRs2C4xqx4JR.3O	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	f	\N	\N	f	\N	\N	t	f	t	t	t	t	f	2026-09-01 03:08:20.97	2026-08-30 02:48:38.711	0	\N	0	0
d9ba6e2a-56d4-4a98-b3b1-3122001beb0d	\N	kenekim121@gmail.com	Ken Ekim		customer	2025-12-14 02:44:38.377182	1afff71ab80937bde0c6b4e3e90c3c1b:1bfdb409228dc3ab2a601443da464b4c7007fc0357683d0d91c8f849f38f514a	\N	\N	\N	\N	cus_U17zzNu2TA3mSl	0	\N	f	\N	t	t	t	\N	\N	f	\N	\N	t	f	t	t	t	t	f	2026-02-21 02:13:09.28	2026-02-21 02:13:01.939	2	\N	0	0
6fb03540-7b08-46e6-9568-bbdc9072c3d9	\N	femi.olojola@gmail.com	Oluwafemi Olojola	07771020403	customer	2025-11-23 16:58:53.582413	9bb4e57d7aa48c5fc388784a462a6175:b22f36ecfe869eb39aad4aa1b162f51784a522d330515446cf621d13b5d5cddb	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	f	\N	\N	t	f	t	t	t	t	f	2026-01-17 21:06:48.892	\N	0	\N	0	0
452a351c-c308-4a11-8539-ea23394a8ab9	\N	biodunogunjimi@gmail.com	Folarin	4038051953	customer	2026-01-17 16:40:13.277162	bafdf6470d4662aadebb7893c08f4891:936f6c087e19c9e197f86741da77dfc3068f0443e61b92aa15af446d9356d1f1	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
bb854b34-d1b4-4f78-9b3a-2867b681bec5	\N	sm9603811@gmail.com	Steve Miller	7654228432	mover	2026-01-19 11:29:44.121044	88b2137ca9361d1153855f29a3de54bd:a91b38104e85ab19175bdab27e19f943dfe20b7ba20930dab24ef5f1232444ab	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
c7ba5412-2021-4d8c-a59e-3e658d9dc0bc	\N	dimonkermen@gmail.com	Dmytro Kermen	6477616967	mover	2026-01-16 00:03:30.172973	0694b8b36e47faae48c3d41e4f3cf74e:57070c01a9df4e8cb46967c345836813e3af49244168a56e2b418389a87b3689	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-04-16 00:16:22.578	2026-01-18 20:41:29.02	0	\N	0	0
fd70b1ca-a265-4ab1-b63d-0e1aff61394e	\N	joyu8465@gmail.com	Joy Okpokiri	4033975317	customer	2026-01-25 16:20:32.083665	d91960c66a48216ca37fdd9f2bef59b1:eb11ff16d60ee04f2aed58795b7113a0fb9926d7e7657098b0e281820790a945	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
8f131487-4c92-4edf-8168-6126a2782c2f	\N	dhairyarai@gmail.com	Dhairya Rai	8259620386	customer	2026-01-29 03:21:08.337816	7ef502bfc93fd50a610dda983f639b50:ac5d138cb4dd3806fa654f11ed6eb85eb9e4020fce48da05817c70e615a5560b	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	2026-01-29 03:22:38.122	0	\N	0	0
f40c6fcf-bb8e-43a5-b88e-eb3ce6540786	\N	iykefixy3@gmail.com	Godspower Nwaeke	4038363930	mover	2026-01-22 18:53:57.140529	4c5b8467729d1acbfdbc5a13bff5a41e:0043783ef41a2612d1106c3bc7dd0c440729c5f04f851c4fd4ed6072d85d5030	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
b5799ff2-a70d-4bef-aed5-c289d9509792	\N	joelwabo@yahoo.fr	Jay	4039719188	customer	2026-01-26 23:44:39.488403	0a279734722dd5a3563620a35c6010d2:74842f015cbc3d9770dcb01b06980b2f5139ab86439516149475c301a273ad9e	\N	\N	\N	\N	\N	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
1dd4c7e6-e5cb-4e12-9ac0-19b0d3974354	\N	chineduchilekezi@gmail.com	Chinedu Chilekezi	3065809752	customer	2026-01-25 23:54:47.734503	be1b47186acc4b8841d9c4d713d5cbe6:ab59c98fbc63fdf6f8f0fe80b3a94b3a2f89dfc31710b9762cc81b0496551b96	\N	\N	\N	\N	\N	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
c15c648e-e21b-4670-b10b-a3fe72f954f1	\N	Baspipe9@gmail.com	Emmanuel  Ola	2049300497	mover	2026-01-16 23:30:21.318904	26c094ca49bb9872c3c8f4b7f41fdf59:03a0365d6937cf04ccc548f3b7265a31b9996196f414cd2ab99cfc1c398cdb0b	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-01-16 23:56:23.026	2026-01-16 23:56:12.071	0	\N	0	0
bea15756-b2a3-405b-8834-3b7d224c67b5	\N	ekijohn111@gmail.com	John Eki	4039235355	customer	2025-11-23 18:07:23.387615	$2b$12$CvycO8lvV.Ir.9yHZQflcObn.9NEDdK13mYsJN1Y/12iElX7F0s9a	0797158c5900f5b7c168258e54a4e46bf5c2ba284b8bbdc2b23790caa978483a	2026-01-17 18:02:25.119		/objects/uploads/5be72de9-1bfd-41cc-a52f-6112c8414b04.jpg	cus_TjqYgOUwM4cTXC	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	t	t	t	t	t	t	2026-08-13 21:11:00.869	2026-08-13 21:11:07.904	0	\N	0	0
45ecae42-fddf-4c15-80c2-3dfbae8a6fb0	\N	mrmoveitallyyc@gmail.com	Luke Saunders	4034023802	mover	2026-02-01 19:23:49.427735	f1f6d940479978f039abd1eb2927caf5:c9d2180e48dfd3dbb9dfd3c9b811f127638a1b998917cd808275c04822885e99	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-04-12 17:36:57.661	\N	0	\N	0	0
a8e52fd4-a66a-46d3-9f17-19c18088e8f4	\N	foodjuk@gmail.com	Mireille 	5877196455	customer	2026-01-18 19:59:35.532295	8c8fce681b29d637996199db3690ff95:5d7184930e1bc41a1ce20df343a6f7f48a9e5bc056abe503d23ebafa70111088	\N	\N	\N	\N	cus_TofhtRBcGo40lH	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-01-18 20:01:08.97	\N	0	\N	0	0
f562d263-dd70-4ebb-b30f-b14686c6b58a	\N	carlsonchenwi@gmail.com	Carlson Chenwi 	5874295350	mover	2026-02-03 20:36:24.317748	a4744593fe6e819df49714b9f5285d6d:6dc857a528885a7176ddeb624e1f04a5cd10049322ecaefeb597342a27b32a8e	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-03-01 19:18:24.52	\N	0	\N	0	0
459ff44d-52b4-40c7-8b6d-d69142dd1807	\N	habentesfamichael95@gmail.com	Haben Tesfamichael	4039096585	mover	2026-01-17 07:47:36.617593	$2b$12$LZ5YOaHBHkGjmt8T3rRCAO5j6yzfHbJ4nl7kcGtlrkYsQfg8IRZh6	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-08-10 20:52:08.798	\N	0	\N	0	0
f7d86b73-7f22-4b9a-b2e2-dc0a4db7c89a	\N	seth.ameyaw@yahoo.com	seth Ameyaw	8252880457	mover	2026-02-07 02:00:23.613231	de4bcb0ab8b19e48f2725784e000ef3a:82a25c40dc8ee4a33b093627d83fd053b8e0aff18988dd6b9fb63b5ea00ffb00	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-02-07 02:07:06.583	2026-02-07 02:06:59.017	0	\N	0	0
962ee291-2a94-4f31-9064-579a1e67c10b	\N	gameher@live.ca	D4 Damo 	5874075549	customer	2026-01-30 17:28:52.694252	ea3a9f19f665693c9fed836829d70c53:20fdcdb0517ba76db47e9ef2f87cd844edf25beec335a591a92a18799f8d95d2	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
1d803abc-bf4d-4d29-8536-393987304033	\N	adewaledaniel360@gmail.com	Adewale Daniel 	3068074780	customer	2026-01-27 06:16:02.514225	fc23ac1cb6fd8da096beff0f5e85af23:bc12128a098dc5361584c0101ae82cf6648789a9ca39ff5c426b17e7cf006542	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	t	t	t	t	t	t	2026-01-27 06:16:33.36	\N	0	\N	0	0
4f57f73d-fe0c-4535-82ca-3d8a71411d3f	\N	galalibrahim86@gmail.com	Galal Elhussain	5878993890	mover	2026-02-03 01:30:35.368869	28dfa2ed8b0f2980b712ed13b79ce208:faf0cde9abe22b3a8660b8ad2328e075b7144ee898c80a8d0b5e17e87ff789d1	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-02-18 22:14:28.732	\N	0	\N	0	0
530dfe4e-205c-48e8-aa4d-42fbd5eb86be	\N	christopherharbidge@hotmail.com	Chris harbidge 	4037977260	mover	2026-01-31 21:20:07.361957	072fb7c93fc2141e890c21a111013850:46e12eabfd36e4aa657c083829b4e5021305d10da3f5e87ee70b96571026cbf5	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-02-04 20:14:23.344	\N	0	\N	0	0
d6aafff1-06e2-486d-b380-963ec850ee80	\N	ogaholuchi0@gmail.com	Loveth	2505057919	customer	2026-01-31 21:20:04.573404	3dac95eefe2c09af907752fcffe76685:692e3f0a5c64570934bb992d2d9c587b5bd051e2d7a3411026347874e72748fe	\N	\N		\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	t	t	t	t	t	t	2026-02-01 22:10:19.605	2026-02-01 22:11:24.791	0	\N	0	0
c0f633be-1dd5-4c59-a440-f79aebc8c596	\N	fermarymk@yahoo.com.mx	Fernando Salinas 	8254377003	mover	2026-02-03 01:58:29.128746	6844b698b035e115deeecf0fa4b9ad98:7c12c3c5bc28b526c9ae0f0d0844e76c0184ab9511f7f27d91dc8fb51261da9f	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-04-27 00:47:04.776	\N	0	\N	0	0
6952e76e-4306-4634-9d98-ef0bc2579905	\N	kashif.b.jz161@gmail.com	Kashif Mahmood Bhatti	4188037776	customer	2026-02-07 16:00:53.3805	25394cc6672c4da401f06abe2fc58aed:916394e6c62740f31277639b17affd3cd0c0f697e971a6c8da3c9c8e43ad6c51	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	f	befac4a60b4642b281f167cab4406002e872d3a07570e0cd48666696a5252270	2026-02-08 16:02:01.016	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
2a6d2a42-be38-455f-a7d1-2e86c548ec14	\N	gmsokeraza@gmail.com	M RRaza	7822349823	mover	2026-02-09 02:43:59.917014	5d6e79302f4fc9b9bb5686c7277d74ca:7b73c0f3d31771646eb3f6fb774e8a2aab53b55d9a5117ccd80517c45739582e	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
bad01057-9591-4e67-beeb-4e15027e7736	\N	jenny_jazzy2k1@yahoo.com	Obiageli E		customer	2026-02-11 05:33:21.804194	5a4bbdfe7e6c4f7d3544a4ebac514593:994b846b499078261b93ecdbbfb7870cd13efe36359bdc93c06da973f3efd0bc	\N	\N		\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	f	f	\N	2026-02-11 05:35:49.742	0	\N	0	0
3724c9bc-c17c-46e4-91eb-c6763ab09999	\N	j_emmie@hotmail.com	Ose Eki	8255612231	customer	2026-02-08 23:44:56.56843	f5c087099386a9e96a95263a90a30eea:13c76cfa51021dd278f41aa0609c953ab01ea987853f19e16d8ca62b401f27e8	\N	\N	\N	\N	cus_UP3bWJVlMP7z2m	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-04-21 01:02:19.105	\N	1	\N	0	0
ad51e115-0eb8-460f-850c-f4e21ea8045b	\N	thechriscowell@gmail.com	Chris Cowell	2505071244	mover	2026-01-18 19:38:26.463417	160170e24322102ac61d2b55d8d8b074:b62f4c72da906f9e639a5d1935eb8a86e7b58f53ca9048e045f94f1dbe3a44d6	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-04-16 00:16:30.014	2026-01-18 22:33:28.171	0	\N	0	0
65d807fc-eaae-4407-8a8b-85a28a699047	\N	tcoleslogistics@gmail.com	Tim Okosun	4384554871	mover	2026-01-16 09:59:41.126266	$2b$12$aZBFbJCDaRau.8eWXyZWr.rUZNwrl3BRSGBbT7yoBxnTV11liGFgO	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-08-07 21:47:02.009	\N	0	\N	0	0
d3714b32-ebab-4e11-a6b9-b545b66916d0	\N	antikangubang@gmail.com	Roweneil Ramos	4034613309	mover	2026-04-04 21:20:59.815583	fb0ad154b81d85fbb121d014b1715447:4e72d0c4b4cdaa638120ac3fde864a9418971374d1f11154191735fa4f8074ea	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-04-04 21:22:21.471	2026-04-04 21:28:31.232	0	\N	0	0
02073e48-8786-455f-96ec-789cfb40b633	\N	hannasabdulwahab@gmail.com	Hannas Abdulwahab	3689969002	customer	2026-04-12 17:25:54.336916	$2b$12$kA2abiaTx8XexnQrO5OdLeZEBbSm2Pl7TblZfb9N9gYhKmcuuTqk.	\N	\N	\N	\N	cus_UK60VojCdeuSh6	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-07-12 02:58:20.499	\N	2	\N	0	0
ac72e389-defb-4204-baa1-c291b6d3fb5f	\N	onome_johanna@yahoo.com	Johanna Akpojovwo	5879669784	customer	2026-02-28 07:26:37.711986	4ffc82479426ed7d7bdb0350874db89a:d54c30340215f9ff9db7fcdcc20872613e6d9e63989c2f2b495ed69226db8567	\N	\N	\N	\N	cus_U3pi5pcTWa9NGF	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
0d414293-5f49-416b-ae5d-cfc39bf3bc30	\N	quiambao_marlon@yahoo.com	Jay Quiambao	5874353980	customer	2026-04-04 21:29:01.477432	00695093810e8af5d24812ab4d7e27ba:c51394e237e97b6599c354368498f357317422f80f1585e0ee56c4cb1ff74b8e	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-04-04 21:29:43.36	\N	0	\N	0	0
8b74e5a1-a6d8-4cb2-84ed-a5c238a5cae8	\N	toussaintbahizire22@gmail.com	Alain 	4039264063	mover	2026-04-30 23:07:23.051067	42ef27c2047a94878d8c63507cc7a157:6e4bf235bc8c7200379e8aa1bc1996f244a3168a317dbf03e73c3eedcf6bdbb1	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-05-05 16:45:01.578	2026-05-10 16:53:41.008	0	\N	0	0
66904619-efab-45ee-988f-1a94af36a287	\N	alexbekelej@gmail.com	Alemayehu Jaleta 	4035401966	mover	2026-03-17 15:36:16.890987	$2b$12$cIzt9.990OwSZ.bUCWUOk..tksit3xK2Ye4vE7vDRDh8bVIpHI7Li	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-07-23 19:06:07.004	2026-03-28 21:39:40.21	0	\N	0	0
27a91efa-09e1-43e7-930f-b538862b97ac	\N	sarfarazrahman60@gmail.com	Sarfaraz Rahman	5878392911	mover	2026-04-09 01:53:54.068084	$2b$12$UZQLEIvmIG1g7QmPIoNIseSHDNhre/WOozpjJcqRYr3orqx3C77Yy	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-07-12 00:26:28.068	\N	0	\N	0	0
721b0ad5-6cb4-40e4-b141-213241bd8b8f	\N	earthangels549@gmail.com	Komalym Muyco	6393178051	mover	2026-03-05 17:37:38.556425	9c55228dd38058c91b25e3ad6d47586e:177ca17819979da9918cd36efbf05b2cf93dd5b77950a80b3bc5be3e5e9f94ec	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-03-05 17:40:21.902	\N	0	\N	0	0
806ed749-27ad-40bf-b7b8-ce16ea0abaf2	\N	Meghanmckenna90@gmail.com	Meghan Mckenna	14034793508	customer	2026-04-11 20:12:55.171667	38cb1c027fbe677c30ec5d5c981d9e3c:bd55989246dc3a0ac35ccb43ebbe54adedf386c33c55379c9850c8698a1cdd4f	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
c9e88876-66e5-46a8-b98b-a3d4a341043f	\N	diduckjay@gmail.com	Jesse Diduck	5875981067	mover	2026-03-08 18:30:22.573525	a2386fcffe4879407081b31f61b76983:ec5d4b581b8964a6e410203b141094d9bca8c01304278dd896b00291eac57788	\N	\N	\N	\N	\N	2	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
3fde1eaa-f556-4cf7-893d-e224eee045ea	\N	bd.hamzajamil@gmail.com	hamza	03224602246	customer	2026-04-22 19:49:55.014563	5c81ad2ba9cb7da131b8b4ae51878d3f:0b7042d6d751e2ead38f934285398e38eb0845236c04cf1b9b34f7d3af189b1a	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-04-22 19:50:52.19	\N	0	\N	0	0
6fe46edc-2a64-4cca-9fc5-549b71ea2330	\N	h7176622@gmail.com	Habteab Gebrehiwet	4039032877	mover	2026-06-27 21:39:19.517634	$2b$12$UVa.MItCMPlfPLcyHOciTuNrYrDDqrSvgUomTOme1vO3Pla9EXJN.	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
6ea5f58e-1c64-4074-a426-b30ac60e5097	\N	jbhasky@gmail.com	Joel Bhasky	2045091104	customer	2026-04-16 00:11:33.850042	d21800e7f8a6ac8402da2751f661a3aa:bb74663a822b02fb400753ae829f96a29b6c82c15280bf89fa0e0658b5521717	\N	\N	\N	\N	cus_ULKE82MgD8HJOw	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-04-16 00:16:47.728	2026-04-16 00:16:12.927	1	\N	0	0
ac43dfba-a25b-4da5-a433-92ad09a23e0b	\N	jlosocloset91@gmail.com	Destiny	7787915375	customer	2026-05-05 16:23:50.090933	3c04122a338edd4a8315bc133f6359ee:4e978d10bf9e0a7406665d98ba3bdd87d89a7ba70c452cefd839c92d382d91fd	\N	\N	\N	\N	cus_UShGKb1oWIfTkm	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	1	\N	0	0
fcb9627c-280b-4fa3-a84e-7334b55aece3	\N	aikinsyao@gmail.com	Aikman  AK	4034470206	customer	2026-04-18 18:26:08.885403	fe2f6b68aafc29823929632a5c21ed20:2a1ba35a0f153fabbcc1876e0e26c61da852c8a12ca3b1d4788f23d751ad3791	\N	\N	\N	\N	cus_UPRGFLaZiZdEWm	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-04-26 23:45:11.037	\N	1	\N	0	0
3b3c15a3-e4b4-4773-b055-8e2c71f27410	\N	akwaranduchukwudi154@gmail.com	Akwarandu chukwudi 	3063164451	mover	2026-02-28 21:46:59.525059	de7ecf010f4e74c3d8226b8110965aa1:4785db4a97d30e872da77bd9c0fa6c3c4b6aee239d759adea4cb08dfc6a3bf49	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-04-27 01:54:24.908	2026-04-16 04:07:03.872	0	\N	0	0
d13c3557-4958-4239-b0b7-017e59615a5c	\N	arvinsanjuan89@gmail.com	Arvin San Juan	5874476092	mover	2026-05-26 17:04:11.197167	85620f04ded2906f931b66b1d663e0ab:453cf2585aa5ce9df291583820953390d4877310042aa9dba5f5da6b340b7601	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
1df30f3b-1f46-47e9-9046-70a554484394	\N	bds.hamzajamil@gmail.com	hamza jamil	3224602246	mover	2026-04-22 19:35:30.169753	e3c782cad6196d942121354c48834321:7f30b5233258c2ced72808372d550746910c2a785c3d700f0d921049b32e6cab	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	2026-04-22 19:48:36.321	0	\N	0	0
cd7e2137-ec2d-4248-8e4a-cc7074256a0f	\N	tawanachinwada@icloud.com	Tawana Chinwada	2505716459	customer	2026-05-02 18:31:46.332257	a49c2e643535b9fbb9e316a6af047a44:fec12f69d998e51fa1776523a1bc45aa5d492bd3b976c17d858ce4ff2bbc4c7b	\N	\N	\N	\N	\N	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	1	\N	0	0
8d6f4fd2-88ee-424d-bdbd-8e223c5c2192	\N	yonasyemane514@gmail.com	Yonas yemane ghebresilase	5877003682	customer	2026-07-05 07:39:02.488738	$2b$12$uOzdlVVlW8vx5wz5QxE2SeAc94L02flJAUbmBL6iXCJ/ETuvA5oGK	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-07-05 07:41:46.292	\N	0	\N	0	0
0a5133bd-88da-4f76-85db-53a92a78aa66	\N	medinatu1995@gmail.com	Medinatu Conteh	5875002664	customer	2026-06-08 03:30:43.353528	861217890bed5f0edafac87e8389a63f:3e0abc56a531e3d6eaef3a5f8f4796ec88d909bf0b164764c9358ed7d86946b4	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-06-08 03:31:41.2	2026-06-08 03:32:41.481	0	\N	0	0
1cf4ad96-9a77-4af4-8770-ca904e939a50	\N	szarusky@hotmail.com	Suzanne Zarusky	4038754025	customer	2026-07-08 18:36:49.437084	$2b$12$niie7in5t5sQ.Z1ce0E4puAOlYMgaHJdTGOY1JWYTEh.yB/GPMWyq	\N	\N	\N	\N	cus_Uqkze7HQisxEDo	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
9a89ec0a-12f0-4939-8da3-47222481f37f	\N	brandan24cameron@outlook.com	Brandan Cameron	3062169075	mover	2026-06-02 22:28:24.249437	$2b$12$IkEnmAVJoemPV0JZ6wzPsOthTZjq1fx4lVPUH91owgzzrNgyJ51ji	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-07-03 19:03:19.616	2026-06-02 22:32:03.399	0	\N	0	0
7032efb7-d7d4-4e71-aad6-2289363cbedb	\N	nafise.zomorrodi@gmail.com	Nafiseh	5874352075	mover	2026-07-10 20:54:11.841209	$2b$12$VUpEEVdP8jzcFAjFTeB.e.L43qRrHPr4tRdfSap0WkVYmsCpOhPIK	\N	\N	\N	\N	\N	0	\N	f	\N	f	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
3b930a1f-6b6c-4e3e-9acc-fd6b4aaa17b8	\N	bansalkhushal69@gmail.com	Khushal Khushal	4163885485	mover	2026-07-09 03:33:46.729264	$2b$12$mEBQTTHaZC1OzO9FLsRQ0OY2bvagjcmGisyxmBYW864NAYyohlj1S	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-09-01 01:00:13.267	2026-09-01 00:59:36.874	0	\N	0	0
bb9664eb-5bf5-4895-a4c6-cc1ad648edc9	\N	atbamisaiye@gmail.com	Yemi Bamisaiye	4036159116	mover	2026-07-11 21:56:35.367379	$2b$12$bxrfgwAK8vcUgYYAX/eYm.757ZNgFL7Y2n2fdC7E8Eb2/OwPyb1V.	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
33db1671-5c9a-4b1d-995b-8fa28e347ead	\N	bonafide.smt@gmail.com	Bonafide 	6474050816	customer	2026-07-29 01:09:33.39045	$2b$12$4twH54mgiMQhrlB91XGmMuH0LhLN3gDABoAE9L1xAqgqv2wMUSXF2	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-07-29 01:10:38.942	\N	0	\N	0	0
50d5c5cf-d522-4aff-a090-2f317304e556	\N	izuchukwuth646@gmail.com	Precious 	2639998448	customer	2026-07-29 01:18:37.07811	$2b$12$ODdLu2uA2VjqMBwn7bNHp.H2C2cn9H0BUYk/gK20afHDFKVUAPLPy	\N	\N	\N	\N	cus_UyIo23g4cqG2dU	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
446c5dfe-bd26-4387-aa1a-af333b7e503a	\N	haleemahsanni4@gmail.com	Halimah Sanni-mubarak	9023189284	customer	2026-08-28 19:28:36.196521	$2b$12$1la9nbo70mMxTIVDNLqXZ.PAnQxqFbY6nXgyNdFHXclL6D6OTvmSO	\N	\N	\N	\N	cus_V9pCENE1yu9Ktu	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-08-30 17:57:59.883	\N	1	\N	0	0
2cdd1c03-4421-4711-88c0-40e99865f5ed	\N	godsonoladipupo6@gmail.com	Godson Oladipupo	5878397900	customer	2026-08-05 17:15:03.447183	$2b$12$.6dG3dxc.s0BfkqmlOf5D.mEC29U9P4TPNTuuWbJpn64uoi0wZuiC	\N	\N	\N	\N	cus_V1AnioWsTMOkdI	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
008bbd4d-55f1-4b6c-aafd-b9908cfffcdc	\N	fereshte.hsnzde@gmail.com	Fereshteh hasanzadeh	5878995559	customer	2026-08-10 20:34:06.77233	$2b$12$CBRC930sbPR1Qc5HLz3Kuu7ftfXXGfjlfZCcplZsqcr6WqAyzDPTO	\N	\N	\N	\N	cus_V36MAbd6l5rtiZ	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-08-15 20:34:18.806	\N	1	\N	0	0
5e33efa5-cfb6-4083-9860-61668eb028f3	\N	mohamedjliban20@gmail.com	Mohamed jliban 	3432626332	customer	2026-08-07 20:14:47.931955	$2b$12$V7w/KTGeKkJcQYI4x/rc3uQcYTog0fB7AP6JRpC4.MjI.0jUPnhf2	\N	\N	\N	\N	cus_V1yNn8Whqdrltg	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
fb6f03ed-996c-482c-8312-934d14a9d630	\N	andrewclinton@gmail.com	Andy Clinton	8259822264	customer	2026-09-01 01:48:41.176154	$2b$12$l/nXmK46nF0gXt9OUuU2uOgfMRPgBCseUpijDZUGKVadFuLR6xNuO	\N	\N	\N	\N	cus_VB31mrhteimxFD	0	\N	f	\N	t	t	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	1	\N	0	0
58413582-e6f3-4bf2-b488-b899f7babd31	\N	tesfitt1989@gmail.com	Tasfit kleta	5878973118	mover	2026-05-23 03:29:32.351719	$2b$12$YKx.1TlaC84QILoKkr0vQOBKfco5VKWChA9eXJPlHPuwx3w.pXshy	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-08-22 02:54:17.602	2026-05-23 03:40:37.468	0	\N	0	0
368f245f-acd9-4c2d-9a74-6a706f6367f7	\N	tonyoboma@gmail.com	Anthony obomagbaeghian	4039197379	mover	2026-08-26 16:14:02.65138	$2b$12$umaL6DIqTusP1Rr5KV.xa.Mbeo38hK97xCWXqLrIdAoNDromJrkDm	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	2026-08-27 01:00:27.758	\N	0	\N	0	0
167f2a72-4c3e-4dbc-aa1b-58522ae0caf2	\N	zach.melin1888@gmail.com	Zach	4039696712	customer	2026-08-11 16:41:02.310442	$2b$12$e.L7yZvPPX7nFZrhv9xcKew7VM8N0ubGmik1nyEx22YQq0IR92Xey	\N	\N	\N	\N	\N	0	\N	f	\N	t	f	t	\N	\N	t	\N	\N	t	f	t	t	t	t	f	\N	\N	0	\N	0	0
\.


--
-- Data for Name: verification_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.verification_items (id, mover_id, type, status, data, file_urls, rejection_reason, expiry_date, submitted_at, reviewed_at, reviewed_by, created_at, updated_at) FROM stdin;
1c5896a1-029d-47dc-835d-6d2152ec2bab	aa2cde65-b901-4fc5-895c-c8baad294a2e	ID	Approved	{"fullName":"Mbeku ","idNumber":"5678889","expiryDate":"2028-04-01"}	{/objects/uploads/7953f1bd-9b99-4953-aaa2-f5afa0649084.jpeg}	\N	2028-04-01 00:00:00	2026-02-01 22:19:26.617	2026-02-01 22:20:19.13	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-01 22:19:26.684392	2026-02-01 22:20:19.13
2a3a93f8-3bea-4737-9325-104b75da1322	64d3cbb5-bba3-429c-9d4a-cdd69237152c	PAYOUT_SETUP	under_review	{"accountHolderName":"Tcoles logistics Inc ","bankName":"ATB bank","transitNumber":"08899","institutionNumber":"219","accountNumber":"00062296678"}	{/uploads/files-1768601200890-272384617.jpeg}	\N	\N	2026-01-16 22:06:40.948	\N	\N	2026-01-16 22:06:41.012768	2026-01-16 22:06:41.012768
e49eb733-6810-4864-8c34-116ba3d7727e	64d3cbb5-bba3-429c-9d4a-cdd69237152c	BACKGROUND_CHECK	Approved	{"checkDate":"2026-01-01","referenceNumber":"af66e6be-9965-478c-b7b8-139f6dc0825d"}	{/objects/uploads/b3f8f4fc-a940-4e8c-8c53-405236c96cce.jpeg}	\N	\N	2026-02-07 20:00:27.551	2026-02-09 03:15:47.442	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-01-16 10:14:52.432988	2026-02-09 03:15:47.442
bb48e337-2441-43f7-9820-b68966ef524a	c854acad-1264-4788-9240-23c40bf77dd3	ID	under_review	{"fullName":"Steve Miller","idNumber":"0300174696","expiryDate":"2031-07-03"}	{/uploads/files-1768822428874-553613883.jpg}	\N	2031-07-03 00:00:00	2026-01-19 11:33:48.933	\N	\N	2026-01-19 11:33:48.99947	2026-01-19 11:33:48.99947
c377283e-ba31-417e-9074-f6259f4bdb1d	c854acad-1264-4788-9240-23c40bf77dd3	DRIVERS_LICENSE	under_review	{"licenseNumber":"0300174696","province":"Indiana","expiryDate":"2031-07-03"}	{/uploads/files-1768822465410-884192527.jpg}	\N	2031-07-03 00:00:00	2026-01-19 11:34:25.471	\N	\N	2026-01-19 11:34:25.532346	2026-01-19 11:34:25.532346
4e28cd77-135d-4595-bb6a-74fc6b14af0c	c854acad-1264-4788-9240-23c40bf77dd3	BACKGROUND_CHECK	under_review	{"checkDate":"2024-12-05"}	{/uploads/files-1768822904265-27234987.png}	\N	\N	2026-01-19 11:41:44.313	\N	\N	2026-01-19 11:41:44.376865	2026-01-19 11:41:44.376865
a39d5238-2fbe-4b46-9966-9bb1d817cfe0	ac3fed3b-31a3-4c4d-8cce-1d0bbf7503ed	VEHICLE_PHOTOS	Approved	{}	{/objects/uploads/d1272d3e-847d-46d5-a664-ab6b4c5614bd.jpeg,/objects/uploads/0f0cd7b6-cfe9-4490-9b5a-025f939920a7.jpeg,/objects/uploads/e56d9c48-7fd7-44ab-a2ad-597409543192.jpeg}	\N	\N	2026-02-03 21:02:21.986	2026-02-03 21:38:39.185	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-03 21:02:22.20091	2026-02-03 21:38:39.185
895be8e0-f7a2-4681-8c96-cb253b113204	ac3fed3b-31a3-4c4d-8cce-1d0bbf7503ed	DRIVERS_LICENSE	Approved	{"licenseNumber":"181074-568","province":"AB","expiryDate":"2026-11-10"}	{/objects/uploads/14b275b5-ab03-48e1-b404-7327e96c7a73.jpeg}	\N	2026-11-10 00:00:00	2026-02-03 21:03:58.18	2026-02-03 21:38:57.652	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-03 21:03:58.257897	2026-02-03 21:38:57.652
73be404a-2fa0-4c79-a394-fe89c8d48ed0	ac3fed3b-31a3-4c4d-8cce-1d0bbf7503ed	ID	Approved	{"fullName":"Carlson ndieshe chenwi","idNumber":"181074-568","expiryDate":"2026-11-10"}	{/objects/uploads/0f30163a-0d00-48a4-89ef-ff1f66a832af.jpeg}	\N	2026-11-10 00:00:00	2026-02-03 21:00:48.619	2026-02-03 21:39:08.631	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-03 21:00:48.690209	2026-02-03 21:39:08.631
b0958a02-2a25-490e-acf9-8b7d77f719ee	a003a8cb-58c2-4b66-8154-17cc72c46e56	PAYOUT_SETUP	Approved	{"accountHolderName":"Luke Saunders","bankName":"BMO","transitNumber":"02279","institutionNumber":"001","accountNumber":"3963872"}	{/objects/uploads/8c795d2b-c9eb-4cd8-bbf3-7ab411fde0f3.jpeg}	\N	\N	2026-02-01 20:31:08.859	2026-02-03 21:40:22.805	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-01 20:31:08.922128	2026-02-03 21:40:22.805
27a5b91e-8bc9-42f4-ba60-c8a3a590388a	a003a8cb-58c2-4b66-8154-17cc72c46e56	DRIVERS_LICENSE	Approved	{"licenseNumber":"14444-090","province":"Alberta","expiryDate":"2030-01-03"}	{/objects/uploads/0a6178a9-6fc0-4641-99af-7d4212b928ac.jpeg}	\N	2030-01-03 00:00:00	2026-02-01 20:23:42.041	2026-02-03 21:40:39.368	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-01 20:23:42.27486	2026-02-03 21:40:39.368
64672f0b-e3b3-40de-b963-81368ae3515b	a003a8cb-58c2-4b66-8154-17cc72c46e56	INSURANCE	Approved	{"policyNumber":"205304","insurerName":"Leibel","effectiveDate":"2025-06-21","expiryDate":"2026-06-21"}	{/objects/uploads/ced5ae80-16e6-48b9-ae3a-76ea21ac52d4.jpeg}	\N	2026-06-21 00:00:00	2026-02-01 20:29:10.353	2026-02-03 21:41:54.149	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-01 20:29:10.418664	2026-02-03 21:41:54.149
66282f2a-952a-4791-8dbe-b7abd69f0a85	a003a8cb-58c2-4b66-8154-17cc72c46e56	VEHICLE_PHOTOS	Under Review	{}	{/objects/uploads/fbf63af0-2339-47b0-9e43-5cc461cd5ec2.jpeg}	\N	\N	2026-02-01 20:26:10.398	2026-02-03 21:42:08.621	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-01 20:26:10.461799	2026-02-03 21:42:08.621
814cf94f-84b3-46c3-bf4a-fb48f89b2631	a003a8cb-58c2-4b66-8154-17cc72c46e56	VEHICLE_REGISTRATION	Approved	{"plateNumber":"Cwj5587"}	{/objects/uploads/345fe7e5-7d28-4b4b-b741-02c64b7ad104.jpg}	\N	\N	2026-02-01 20:25:23.104	2026-02-03 21:42:36.485	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-02-01 20:25:23.16889	2026-02-03 21:42:36.485
cb4797e5-06d7-4277-81db-86fde09a7f82	ac3fed3b-31a3-4c4d-8cce-1d0bbf7503ed	VEHICLE_REGISTRATION	under_review	{"plateNumber":"O-AB291"}	{/objects/uploads/ee885fa7-fcfa-4bc1-b830-b7485ec103d8.jpeg}	\N	\N	2026-02-03 22:50:14.321	\N	\N	2026-02-03 22:50:14.383855	2026-02-03 22:50:14.383855
8f741307-14cb-40fa-bc80-c22a7dfaca6d	ac3fed3b-31a3-4c4d-8cce-1d0bbf7503ed	PAYOUT_SETUP	under_review	{"accountHolderName":"Carlson ndieshe Chenwi ","bankName":"Cibc","transitNumber":"07029","institutionNumber":"010","accountNumber":"5615585"}	{/objects/uploads/15b9c7ac-7e6e-4387-951b-f5b15c25c72f.jpg}	\N	\N	2026-02-03 22:59:17.046	\N	\N	2026-02-03 22:55:23.964235	2026-02-03 22:59:17.092
5916f456-bd11-411d-aebd-9a72d99eb498	64d3cbb5-bba3-429c-9d4a-cdd69237152c	INSURANCE	Rejected	{"policyNumber":"4002121713","insurerName":"Co-operator ","effectiveDate":"2025-11-24","expiryDate":"2026-05-03"}	{/objects/uploads/4546fc5d-e507-414e-ba18-1490c397e79d.jpeg}	Upload valid insurance certificate. 	2026-05-03 00:00:00	2026-02-07 20:06:03.797	2026-08-13 21:08:49.104	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-01-16 22:03:22.830075	2026-08-13 21:08:49.104
4b647658-e881-40f3-83d5-9ab7b3760990	64d3cbb5-bba3-429c-9d4a-cdd69237152c	ID	Approved	{"fullName":"Timothy Okosun","idNumber":"176728020","expiryDate":"2027-07-26"}	{/objects/uploads/bdc94d38-8c70-4550-9b65-a924fea5e2df.jpeg}	\N	2027-07-26 00:00:00	2026-02-07 19:52:24.917	2026-08-13 21:06:38.394	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-01-16 18:29:47.232976	2026-08-13 21:06:38.394
c314180f-729d-4aed-b59e-fa9a77318ece	64d3cbb5-bba3-429c-9d4a-cdd69237152c	VEHICLE_PHOTOS	Approved	{}	{/objects/uploads/b96dc7ca-5400-4d4d-942f-ff39571d5152.jpeg,/objects/uploads/bee86fdb-b547-4e82-8775-07ecc54a2756.jpeg}	\N	\N	2026-02-07 20:03:39.341	2026-02-09 03:16:13.956	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-01-16 18:31:00.572267	2026-02-09 03:16:13.956
2698e8fe-2477-41bb-9fa6-92e52fcc8bdd	64d3cbb5-bba3-429c-9d4a-cdd69237152c	VEHICLE_REGISTRATION	Approved	{"vin":"1FTBR1X86RKA63931","plateNumber":"0EB623"}	{/objects/uploads/fc791c99-72b1-4b2e-a8ba-074e84fd0d79.jpeg}	\N	\N	2026-02-07 20:03:02.378	2026-02-09 03:16:34.09	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-01-16 22:00:32.922601	2026-02-09 03:16:34.09
2fd305ef-9c13-422e-8293-87d4f33709c3	15a904b7-4267-4b96-8a9f-548f603fda3d	ID	Approved	{"fullName":"Fernando Salinas Gonzalez","idNumber":"173947-508","expiryDate":"2028-07-23"}	{/objects/uploads/049c3c41-dc71-40a9-b001-812582cb6273.jpg}	\N	2028-07-23 00:00:00	2026-03-09 20:00:46.526	2026-08-21 20:28:36.215	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-09 20:00:46.595404	2026-08-21 20:28:36.215
b783ac1d-9c41-4a9d-88b3-3791b93bc154	dbad7eb8-5574-482c-9c25-9c74da29cc03	DRIVERS_LICENSE	Approved	{"licenseNumber":"177602-182","province":"Alberta ","expiryDate":"2028-05-14"}	{/objects/uploads/9155bd95-cae2-425e-b89f-977cbbd9d13d.jpeg}	\N	2028-05-14 00:00:00	2026-03-17 15:47:57.661	2026-03-23 22:32:41.972	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-17 15:47:57.727809	2026-03-23 22:32:41.972
9570c2c2-0b1d-4d8b-9afc-9630003cae4d	dbad7eb8-5574-482c-9c25-9c74da29cc03	ID	Approved	{"fullName":"Alemayehu Jaleta ","idNumber":"177602-182","expiryDate":"2028-05-14"}	{/objects/uploads/d9214406-e28f-495c-b4e5-cc0f80e8f13b.jpeg}	\N	2028-05-14 00:00:00	2026-03-17 15:49:56.313	2026-03-23 22:33:17.373	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-17 15:49:56.376943	2026-03-23 22:33:17.373
65131e11-f267-4e5e-8aa0-f2623062be4c	dbad7eb8-5574-482c-9c25-9c74da29cc03	INSURANCE	Approved	{"policyNumber":"4001916782","insurerName":"Cooperators","effectiveDate":"2025-08-23","expiryDate":"2026-08-23"}	{/objects/uploads/2a4eb4f4-6a0c-40c9-80d8-cc78d76c7b99.jpg}	\N	2026-08-23 00:00:00	2026-03-17 15:53:03.165	2026-03-23 22:34:53.218	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-17 15:53:03.230292	2026-03-23 22:34:53.218
84afe135-47ae-482c-a9e7-6b4abb129dbd	dbad7eb8-5574-482c-9c25-9c74da29cc03	BACKGROUND_CHECK	Approved	{"checkDate":"2026-03-17","referenceNumber":"#AP47554698"}	{/objects/uploads/9bb6ccc4-7b36-4823-9bbb-c61a237b2dee.pdf}	\N	\N	2026-03-18 19:41:18.826	2026-03-23 22:36:20.788	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-18 19:41:18.901905	2026-03-23 22:36:20.788
dc1249df-659c-4cb8-a899-dfa1935d426e	dbad7eb8-5574-482c-9c25-9c74da29cc03	VEHICLE_REGISTRATION	Approved	{"plateNumber":"OBS-337","vin":"2T3RWRFV0RW226089"}	{/objects/uploads/8215a99e-79bf-49da-a219-661fdfa7baea.jpg}	\N	\N	2026-03-17 16:00:14.664	2026-03-23 22:36:42.501	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-17 16:00:14.72782	2026-03-23 22:36:42.501
883a10f2-fc24-4ad2-8c1e-62fad94b9fca	7cba5209-a0b9-4ad6-82d4-643a085c5405	VEHICLE_REGISTRATION	under_review	{"plateNumber":"CTB 4886","vin":"2HNYD28828H002041"}	{/objects/uploads/29832485-0bd1-4a47-90fe-870c9afabb22.pdf}	\N	\N	2026-05-26 18:48:13.463	\N	\N	2026-05-26 18:48:13.525668	2026-05-26 18:48:13.525668
b26d3593-71fe-4140-89b0-c8a29fc7f149	dbad7eb8-5574-482c-9c25-9c74da29cc03	PAYOUT_SETUP	Approved	{"accountHolderName":"Alemayehu Jaleta ","bankName":"CIBC","transitNumber":"07029","institutionNumber":"010","accountNumber":"5404592"}	{/objects/uploads/f51a9283-c06f-476c-a7e7-6de029331721.pdf}	\N	\N	2026-03-24 18:10:11.203	2026-03-25 20:45:17.656	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-17 15:56:26.032948	2026-03-25 20:45:17.656
318ecba9-2416-4451-b4cd-7f6d514b2e8e	dbad7eb8-5574-482c-9c25-9c74da29cc03	VEHICLE_PHOTOS	Approved	{}	{/objects/uploads/4908c036-4b4e-48a3-a760-f1d61523f7af.jpeg,/objects/uploads/d7f596ad-d3c8-43a2-afe4-9de6180f7b14.jpeg,/objects/uploads/a62c3f8e-37dd-44f8-baaa-bfe1ad55e2c0.jpeg,/objects/uploads/e839e3fa-8ca1-4b84-9a9e-da0f3ab8f4f9.jpeg,/objects/uploads/70c21bf4-279f-42ec-a342-7c0d90463039.jpeg}	\N	\N	2026-03-24 18:02:40.861	2026-03-25 21:08:31.499	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-17 15:51:11.691653	2026-03-25 21:08:31.499
430afd1b-16ee-4cb6-a2cb-c43aa42d3de2	1abbfcc3-03d0-4887-a557-54cda5dddf19	DRIVERS_LICENSE	Approved	{"licenseNumber":"177401-114 ","province":"Alberta","expiryDate":"2027-05-10"}	{/objects/uploads/132c961a-4717-4432-8676-bc2e03a06263.jpg}	\N	2027-05-10 00:00:00	2026-05-23 05:57:01.561	2026-06-27 20:14:15.016	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-05-23 05:57:01.77728	2026-06-27 20:14:15.016
0903764c-980d-4889-b7c9-a87410bfd873	7cba5209-a0b9-4ad6-82d4-643a085c5405	ID	under_review	{"fullName":"Arvin San Juan","idNumber":"174553-511","expiryDate":"2030-11-17"}	{/objects/uploads/846588bc-f0d2-4654-9d6c-df7419590549.jpg}	\N	2030-11-17 00:00:00	2026-05-26 18:44:31.47	\N	\N	2026-05-26 18:44:31.53632	2026-05-26 18:44:31.53632
7418aaeb-d7a4-468e-a16c-7639c2c3cb6f	7cba5209-a0b9-4ad6-82d4-643a085c5405	DRIVERS_LICENSE	under_review	{"licenseNumber":"174553-511","province":"Alberta","expiryDate":"2030-11-17"}	{/objects/uploads/b309b040-f58c-4cf7-b99a-ce2033a6492d.jpg}	\N	2030-11-17 00:00:00	2026-05-26 18:45:07.22	\N	\N	2026-05-26 18:45:07.28245	2026-05-26 18:45:07.28245
d3ea5398-233d-435d-b8b9-07fd92ec5bba	1abbfcc3-03d0-4887-a557-54cda5dddf19	VEHICLE_REGISTRATION	Approved	{"plateNumber":"CWW8204"}	{/objects/uploads/2d661016-ef0c-4be1-aec4-ac525b6f9fae.jpg}	\N	\N	2026-06-20 21:43:27.117	2026-07-01 21:13:21.296	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-06-20 21:43:27.202636	2026-07-01 21:13:21.297
cc21f114-7d2d-440d-82d6-09de750b5d90	1abbfcc3-03d0-4887-a557-54cda5dddf19	PAYOUT_SETUP	Approved	{"accountHolderName":"TASFIT KLETA ","bankName":"TD bank","transitNumber":"02939","institutionNumber":"004","accountNumber":"6022210"}	{/objects/uploads/6ae7db74-5d59-4088-86eb-b714af2bc78f.jpg}	\N	\N	2026-07-05 07:44:30.307	2026-07-07 20:21:28.673	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-06-20 21:55:46.422009	2026-07-07 20:21:28.673
8d99832b-2de4-432c-b3cc-c50f3278a87a	15a904b7-4267-4b96-8a9f-548f603fda3d	DRIVERS_LICENSE	Approved	{"licenseNumber":"173947-508","province":"Alberta","expiryDate":"2028-07-23"}	{/objects/uploads/e4f37b7d-de30-4756-8bdc-50ab99d28d5a.jpg}	\N	2028-07-23 00:00:00	2026-03-09 20:02:53.942	2026-08-21 20:28:53.414	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-09 20:02:54.008492	2026-08-21 20:28:53.414
c92d48eb-a0a2-40b3-a1dd-fc6c85968a62	1abbfcc3-03d0-4887-a557-54cda5dddf19	ID	Approved	{"fullName":"Tasfit Kleta","idNumber":"177401-114","expiryDate":"2027-05-10"}	{/objects/uploads/cbb3574b-2077-45ea-8098-614746c7d951.jpg}	\N	2027-05-10 00:00:00	2026-07-05 07:40:12.24	2026-07-07 20:14:38.16	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-05-23 05:48:42.389236	2026-07-07 20:14:38.16
2a37c5be-9284-4724-9c9b-1466a03b0dfc	1abbfcc3-03d0-4887-a557-54cda5dddf19	VEHICLE_PHOTOS	Approved	{}	{/objects/uploads/3e4b392f-e8f4-4017-b70e-ac886ceaff29.jpg}	\N	\N	2026-07-05 07:41:30.663	2026-07-07 20:15:13.474	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-06-20 21:46:38.315077	2026-07-07 20:15:13.474
3523589e-5a9e-4477-a3ad-44898d222825	15a904b7-4267-4b96-8a9f-548f603fda3d	VEHICLE_PHOTOS	Approved	{}	{/objects/uploads/86d81839-6d56-495b-8209-bd96c7e4a2ea.jpg,/objects/uploads/5938d7ce-a058-4a12-be50-2586895467a6.jpg,/objects/uploads/f55d7a02-f0eb-442f-9354-d56965b0aa4a.jpg,/objects/uploads/ae859ccf-ce53-444e-9415-f24f76c769f6.jpg}	\N	\N	2026-03-09 20:07:16.011	2026-08-21 20:29:13.649	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-09 20:07:16.075911	2026-08-21 20:29:13.649
dfd2ac36-7671-4cf7-b4ee-c581a95fbb15	15a904b7-4267-4b96-8a9f-548f603fda3d	INSURANCE	Rejected	{"policyNumber":"00139430958","insurerName":"TD","effectiveDate":"2025-08-19","expiryDate":"2026-08-19"}	{/objects/uploads/a54c0a3a-d505-42a5-9a92-3a971df7eb35.jpg}	Insurance expired 	2026-08-19 00:00:00	2026-03-09 20:39:09.92	2026-08-21 20:30:24.16	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-09 20:39:09.985123	2026-08-21 20:30:24.16
a059ad52-f35b-46e3-8a0f-5c971be238ad	15a904b7-4267-4b96-8a9f-548f603fda3d	VEHICLE_REGISTRATION	Approved	{"plateNumber":"CSV0930"}	{/objects/uploads/eca7f1e5-60d5-4520-a257-0b38cbeedd13.jpg}	\N	\N	2026-03-09 20:36:44.559	2026-08-21 20:30:46.083	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-09 20:36:44.772038	2026-08-21 20:30:46.083
f4c7ea2e-795c-403f-ba68-1e208838170e	1abbfcc3-03d0-4887-a557-54cda5dddf19	BACKGROUND_CHECK	Approved	{"checkDate":"2026-06-04"}	{/objects/uploads/d9557b58-52f2-4f6b-9091-beaaba08e01d.jpg}	\N	\N	2026-06-20 19:11:43.608	2026-07-01 21:11:20.755	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-06-20 19:11:43.692284	2026-07-01 21:11:20.755
0744039e-5740-4e82-9284-345597bdb6f0	64d3cbb5-bba3-429c-9d4a-cdd69237152c	DRIVERS_LICENSE	Approved	{"licenseNumber":"176728020","province":"AB","expiryDate":"2027-07-26"}	{/objects/uploads/cf72feb5-7282-426f-8fba-5fe1a4c09667.jpeg}	\N	2027-07-26 00:00:00	2026-02-07 19:54:25.605	2026-08-13 21:05:12.668	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-01-16 10:17:14.520113	2026-08-13 21:05:12.668
f6a4e9b1-d0aa-4518-a6b3-fde7862c8499	1abbfcc3-03d0-4887-a557-54cda5dddf19	INSURANCE	Approved	{"policyNumber":"00156713422","insurerName":"Td Insurance ","effectiveDate":"2026-08-17","expiryDate":"2027-08-17"}	{/objects/uploads/4b3a2813-ea03-463e-a3d1-956b074082a5.jpg}	\N	2027-08-17 00:00:00	2026-08-18 02:05:13.486	2026-08-21 20:27:57.906	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-06-20 20:46:25.310195	2026-08-21 20:27:57.906
46d72670-634a-480e-a3f1-920dc3c93354	15a904b7-4267-4b96-8a9f-548f603fda3d	PAYOUT_SETUP	Approved	{"accountHolderName":"Fernando Salinas Gonzalez","bankName":"RBC","transitNumber":"02089","institutionNumber":"003","accountNumber":"1066604"}	{/objects/uploads/7082a894-03b8-4d5d-9d95-47beae4d8bb0.jpg}	\N	\N	2026-03-09 20:23:10.572	2026-08-21 20:30:55.205	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-03-09 20:18:15.59825	2026-08-21 20:30:55.205
4815bfb4-f63f-46be-9598-b50099adaf93	e55370ff-6128-4b54-96d7-6b97faa1e305	PAYOUT_SETUP	under_review	{"accountHolderName":"Aaron Okon Atat","bankName":"TD Canada bank","transitNumber":"81759","institutionNumber":"004","accountNumber":"6169462"}	{/objects/uploads/9a0c10f1-a7f3-4bc6-b4f1-65258b7dcaea.pdf}	\N	\N	2026-08-28 20:28:45.774	\N	\N	2026-08-28 20:28:45.840183	2026-08-28 20:28:45.840183
e349748c-9e6b-49d5-9457-7ff56ed384c0	e55370ff-6128-4b54-96d7-6b97faa1e305	ID	Approved	{"fullName":"Aaron Atat","idNumber":"178347266","expiryDate":"2029-10-15"}	{/objects/uploads/12160120-3c11-46d7-a994-3edf98d0b9f4.jpg}	\N	2029-10-15 00:00:00	2026-08-28 20:21:12.614	2026-08-28 20:36:54.298	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-08-28 20:21:12.681133	2026-08-28 20:36:54.298
68fca63e-3950-405e-a10f-09236cb7b14c	e55370ff-6128-4b54-96d7-6b97faa1e305	DRIVERS_LICENSE	Approved	{"licenseNumber":"178347266","province":"Alberta","expiryDate":"2029-10-15"}	{/objects/uploads/2190c9bc-8035-40e1-8fe6-dd70497749a1.jpg}	\N	2029-10-15 00:00:00	2026-08-28 20:23:12.616	2026-08-28 20:37:14.959	ecbaa1cf-179f-4195-adf8-0f5da3c24a27	2026-08-28 20:23:12.681481	2026-08-28 20:37:14.959
1d26024a-406b-46e8-9368-5c9580ff906d	e55370ff-6128-4b54-96d7-6b97faa1e305	VEHICLE_REGISTRATION	under_review	{"plateNumber":"CVL6205","vin":"2D4RN4DE2AR454363"}	{/objects/uploads/8cf254df-3c7e-4c5a-b213-8db34fec45a7.jpg}	\N	\N	2026-08-28 21:57:35.29	\N	\N	2026-08-28 21:57:35.35771	2026-08-28 21:57:35.35771
c318967a-8eac-431f-97e1-f822ea6a67bd	e55370ff-6128-4b54-96d7-6b97faa1e305	VEHICLE_PHOTOS	under_review	{}	{/objects/uploads/3741e090-8bae-41f8-8430-8f24ee96b593.jpeg,/objects/uploads/35e4f51b-1db6-4d2d-b568-831b2ed1c73a.jpeg,/objects/uploads/01b9c91d-3a6d-43f3-b5b4-bf9531c70e65.jpeg}	\N	\N	2026-08-28 22:03:05.414	\N	\N	2026-08-28 22:03:05.482068	2026-08-28 22:03:05.482068
5aa77626-9b8a-46bc-a59b-1dd741d0ab05	e55370ff-6128-4b54-96d7-6b97faa1e305	INSURANCE	under_review	{"policyNumber":"4002284305","insurerName":"Co-operators","effectiveDate":"2025-10-12","expiryDate":"2026-10-12"}	{/objects/uploads/b75421dd-a6f4-4454-b259-b80ad3da2886.jpg}	\N	2026-10-12 00:00:00	2026-08-28 22:06:48.324	\N	\N	2026-08-28 22:06:48.39108	2026-08-28 22:06:48.39108
\.


--
-- Name: replit_database_migrations_v1_id_seq; Type: SEQUENCE SET; Schema: _system; Owner: -
--

SELECT pg_catalog.setval('_system.replit_database_migrations_v1_id_seq', 46, true);


--
-- Name: replit_database_migrations_v1 replit_database_migrations_v1_pkey; Type: CONSTRAINT; Schema: _system; Owner: -
--

ALTER TABLE ONLY _system.replit_database_migrations_v1
    ADD CONSTRAINT replit_database_migrations_v1_pkey PRIMARY KEY (id);


--
-- Name: abandoned_bookings abandoned_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_bookings
    ADD CONSTRAINT abandoned_bookings_pkey PRIMARY KEY (id);


--
-- Name: ai_incident_insights ai_incident_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_incident_insights
    ADD CONSTRAINT ai_incident_insights_pkey PRIMARY KEY (id);


--
-- Name: ai_runs ai_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_pkey PRIMARY KEY (id);


--
-- Name: ai_support_insights ai_support_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_support_insights
    ADD CONSTRAINT ai_support_insights_pkey PRIMARY KEY (id);


--
-- Name: booking_assignments booking_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_assignments
    ADD CONSTRAINT booking_assignments_pkey PRIMARY KEY (id);


--
-- Name: booking_metrics booking_metrics_booking_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_metrics
    ADD CONSTRAINT booking_metrics_booking_id_unique UNIQUE (booking_id);


--
-- Name: booking_metrics booking_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_metrics
    ADD CONSTRAINT booking_metrics_pkey PRIMARY KEY (id);


--
-- Name: booking_status_events booking_status_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_status_events
    ADD CONSTRAINT booking_status_events_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: compliance_docs compliance_docs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_docs
    ADD CONSTRAINT compliance_docs_pkey PRIMARY KEY (id);


--
-- Name: coverage_zones coverage_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_zones
    ADD CONSTRAINT coverage_zones_pkey PRIMARY KEY (id);


--
-- Name: email_campaigns email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: identified_items identified_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identified_items
    ADD CONSTRAINT identified_items_pkey PRIMARY KEY (id);


--
-- Name: in_app_notifications in_app_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.in_app_notifications
    ADD CONSTRAINT in_app_notifications_pkey PRIMARY KEY (id);


--
-- Name: item_feedback item_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_feedback
    ADD CONSTRAINT item_feedback_pkey PRIMARY KEY (id);


--
-- Name: job_notifications job_notifications_booking_id_mover_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_notifications
    ADD CONSTRAINT job_notifications_booking_id_mover_id_unique UNIQUE (booking_id, mover_id);


--
-- Name: job_notifications job_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_notifications
    ADD CONSTRAINT job_notifications_pkey PRIMARY KEY (id);


--
-- Name: learning_insights learning_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_insights
    ADD CONSTRAINT learning_insights_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: mover_availability mover_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_availability
    ADD CONSTRAINT mover_availability_pkey PRIMARY KEY (id);


--
-- Name: mover_availability mover_availability_user_id_available_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_availability
    ADD CONSTRAINT mover_availability_user_id_available_date_key UNIQUE (user_id, available_date);


--
-- Name: mover_earnings mover_earnings_booking_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_earnings
    ADD CONSTRAINT mover_earnings_booking_id_unique UNIQUE (booking_id);


--
-- Name: mover_earnings mover_earnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_earnings
    ADD CONSTRAINT mover_earnings_pkey PRIMARY KEY (id);


--
-- Name: mover_payouts mover_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_payouts
    ADD CONSTRAINT mover_payouts_pkey PRIMARY KEY (id);


--
-- Name: mover_performance mover_performance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_performance
    ADD CONSTRAINT mover_performance_pkey PRIMARY KEY (id);


--
-- Name: mover_stripe_accounts mover_stripe_accounts_mover_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_stripe_accounts
    ADD CONSTRAINT mover_stripe_accounts_mover_id_unique UNIQUE (mover_id);


--
-- Name: mover_stripe_accounts mover_stripe_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_stripe_accounts
    ADD CONSTRAINT mover_stripe_accounts_pkey PRIMARY KEY (id);


--
-- Name: mover_stripe_accounts mover_stripe_accounts_stripe_account_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_stripe_accounts
    ADD CONSTRAINT mover_stripe_accounts_stripe_account_id_unique UNIQUE (stripe_account_id);


--
-- Name: mover_terms_acceptance mover_terms_acceptance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_terms_acceptance
    ADD CONSTRAINT mover_terms_acceptance_pkey PRIMARY KEY (id);


--
-- Name: movers movers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movers
    ADD CONSTRAINT movers_pkey PRIMARY KEY (id);


--
-- Name: partner_audit_log partner_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_audit_log
    ADD CONSTRAINT partner_audit_log_pkey PRIMARY KEY (id);


--
-- Name: partner_direct_messages partner_direct_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_direct_messages
    ADD CONSTRAINT partner_direct_messages_pkey PRIMARY KEY (id);


--
-- Name: partner_incidents partner_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_incidents
    ADD CONSTRAINT partner_incidents_pkey PRIMARY KEY (id);


--
-- Name: partner_invites partner_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_invites
    ADD CONSTRAINT partner_invites_pkey PRIMARY KEY (id);


--
-- Name: partner_invites partner_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_invites
    ADD CONSTRAINT partner_invites_token_key UNIQUE (token);


--
-- Name: partner_team_members partner_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_team_members
    ADD CONSTRAINT partner_team_members_pkey PRIMARY KEY (id);


--
-- Name: partner_users partner_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_users
    ADD CONSTRAINT partner_users_pkey PRIMARY KEY (id);


--
-- Name: partner_users partner_users_user_id_partner_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_users
    ADD CONSTRAINT partner_users_user_id_partner_id_key UNIQUE (user_id, partner_id);


--
-- Name: partners partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);


--
-- Name: phone_verification_tokens phone_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_verification_tokens
    ADD CONSTRAINT phone_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: proof_of_completion proof_of_completion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proof_of_completion
    ADD CONSTRAINT proof_of_completion_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_referred_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_id_key UNIQUE (referred_id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: saved_addresses saved_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_addresses
    ADD CONSTRAINT saved_addresses_pkey PRIMARY KEY (id);


--
-- Name: saved_addresses saved_addresses_user_id_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_addresses
    ADD CONSTRAINT saved_addresses_user_id_label_key UNIQUE (user_id, label);


--
-- Name: user_sessions session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: support_ticket_replies support_ticket_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_replies
    ADD CONSTRAINT support_ticket_replies_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_firebase_uid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_firebase_uid_unique UNIQUE (firebase_uid);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_referral_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referral_code_unique UNIQUE (referral_code);


--
-- Name: verification_items verification_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_items
    ADD CONSTRAINT verification_items_pkey PRIMARY KEY (id);


--
-- Name: idx_replit_database_migrations_v1_build_id; Type: INDEX; Schema: _system; Owner: -
--

CREATE UNIQUE INDEX idx_replit_database_migrations_v1_build_id ON _system.replit_database_migrations_v1 USING btree (build_id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.user_sessions USING btree (expire);


--
-- Name: abandoned_bookings_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abandoned_bookings_created_at_idx ON public.abandoned_bookings USING btree (created_at);


--
-- Name: abandoned_bookings_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abandoned_bookings_email_idx ON public.abandoned_bookings USING btree (email);


--
-- Name: abandoned_bookings_recovered_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abandoned_bookings_recovered_idx ON public.abandoned_bookings USING btree (recovered);


--
-- Name: abandoned_bookings_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abandoned_bookings_user_id_idx ON public.abandoned_bookings USING btree (user_id);


--
-- Name: ai_incident_insights_incident_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_incident_insights_incident_id_idx ON public.ai_incident_insights USING btree (incident_id);


--
-- Name: ai_runs_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_runs_booking_id_idx ON public.ai_runs USING btree (booking_id);


--
-- Name: ai_runs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_runs_created_at_idx ON public.ai_runs USING btree (created_at);


--
-- Name: ai_runs_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_runs_provider_idx ON public.ai_runs USING btree (provider);


--
-- Name: ai_support_insights_ticket_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_support_insights_ticket_id_idx ON public.ai_support_insights USING btree (ticket_id);


--
-- Name: booking_assignments_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_assignments_booking_id_idx ON public.booking_assignments USING btree (booking_id);


--
-- Name: booking_assignments_partner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_assignments_partner_id_idx ON public.booking_assignments USING btree (partner_id);


--
-- Name: booking_metrics_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_metrics_booking_id_idx ON public.booking_metrics USING btree (booking_id);


--
-- Name: booking_metrics_training_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_metrics_training_idx ON public.booking_metrics USING btree (used_for_training);


--
-- Name: booking_status_events_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_status_events_booking_id_idx ON public.booking_status_events USING btree (booking_id);


--
-- Name: booking_status_events_partner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_status_events_partner_id_idx ON public.booking_status_events USING btree (partner_id);


--
-- Name: bookings_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_customer_id_idx ON public.bookings USING btree (customer_id);


--
-- Name: bookings_mover_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_mover_id_idx ON public.bookings USING btree (mover_id);


--
-- Name: bookings_payment_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_payment_status_idx ON public.bookings USING btree (payment_status);


--
-- Name: bookings_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_status_idx ON public.bookings USING btree (status);


--
-- Name: compliance_docs_partner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_docs_partner_id_idx ON public.compliance_docs USING btree (partner_id);


--
-- Name: compliance_docs_review_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_docs_review_status_idx ON public.compliance_docs USING btree (review_status);


--
-- Name: coverage_zones_partner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coverage_zones_partner_id_idx ON public.coverage_zones USING btree (partner_id);


--
-- Name: email_campaigns_sent_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_campaigns_sent_by_idx ON public.email_campaigns USING btree (sent_by);


--
-- Name: email_campaigns_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_campaigns_status_idx ON public.email_campaigns USING btree (status);


--
-- Name: email_campaigns_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_campaigns_type_idx ON public.email_campaigns USING btree (type);


--
-- Name: identified_items_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX identified_items_booking_id_idx ON public.identified_items USING btree (booking_id);


--
-- Name: identified_items_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX identified_items_status_idx ON public.identified_items USING btree (processing_status);


--
-- Name: in_app_notifications_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX in_app_notifications_created_at_idx ON public.in_app_notifications USING btree (created_at);


--
-- Name: in_app_notifications_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX in_app_notifications_type_idx ON public.in_app_notifications USING btree (type);


--
-- Name: in_app_notifications_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX in_app_notifications_user_id_idx ON public.in_app_notifications USING btree (user_id);


--
-- Name: in_app_notifications_user_read_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX in_app_notifications_user_read_idx ON public.in_app_notifications USING btree (user_id, is_read);


--
-- Name: item_feedback_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_feedback_booking_id_idx ON public.item_feedback USING btree (booking_id);


--
-- Name: item_feedback_identified_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_feedback_identified_item_idx ON public.item_feedback USING btree (identified_item_id);


--
-- Name: item_feedback_processed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_feedback_processed_idx ON public.item_feedback USING btree (processed_for_learning);


--
-- Name: learning_insights_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_insights_period_idx ON public.learning_insights USING btree (period_start, period_end);


--
-- Name: learning_insights_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_insights_type_idx ON public.learning_insights USING btree (insight_type);


--
-- Name: messages_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_booking_id_idx ON public.messages USING btree (booking_id);


--
-- Name: mover_availability_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_availability_date_idx ON public.mover_availability USING btree (available_date);


--
-- Name: mover_availability_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_availability_user_id_idx ON public.mover_availability USING btree (user_id);


--
-- Name: mover_earnings_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_earnings_booking_id_idx ON public.mover_earnings USING btree (booking_id);


--
-- Name: mover_earnings_mover_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_earnings_mover_id_idx ON public.mover_earnings USING btree (mover_id);


--
-- Name: mover_earnings_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_earnings_status_idx ON public.mover_earnings USING btree (status);


--
-- Name: mover_payouts_mover_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_payouts_mover_id_idx ON public.mover_payouts USING btree (mover_id);


--
-- Name: mover_payouts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_payouts_status_idx ON public.mover_payouts USING btree (status);


--
-- Name: mover_payouts_stripe_payout_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_payouts_stripe_payout_idx ON public.mover_payouts USING btree (stripe_payout_id);


--
-- Name: mover_performance_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_performance_booking_id_idx ON public.mover_performance USING btree (booking_id);


--
-- Name: mover_performance_load_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_performance_load_class_idx ON public.mover_performance USING btree (load_class);


--
-- Name: mover_performance_mover_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_performance_mover_id_idx ON public.mover_performance USING btree (mover_id);


--
-- Name: mover_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_status_idx ON public.job_notifications USING btree (mover_id, status);


--
-- Name: mover_stripe_accounts_mover_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_stripe_accounts_mover_id_idx ON public.mover_stripe_accounts USING btree (mover_id);


--
-- Name: mover_stripe_accounts_stripe_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_stripe_accounts_stripe_account_idx ON public.mover_stripe_accounts USING btree (stripe_account_id);


--
-- Name: mover_terms_acceptance_mover_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_terms_acceptance_mover_id_idx ON public.mover_terms_acceptance USING btree (mover_id);


--
-- Name: mover_terms_acceptance_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mover_terms_acceptance_version_idx ON public.mover_terms_acceptance USING btree (terms_version);


--
-- Name: movers_availability_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX movers_availability_idx ON public.movers USING btree (is_available);


--
-- Name: movers_pilot_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX movers_pilot_status_idx ON public.movers USING btree (pilot_status);


--
-- Name: movers_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX movers_user_id_idx ON public.movers USING btree (user_id);


--
-- Name: partner_audit_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partner_audit_log_created_at_idx ON public.partner_audit_log USING btree (created_at);


--
-- Name: partner_audit_log_partner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partner_audit_log_partner_id_idx ON public.partner_audit_log USING btree (partner_id);


--
-- Name: partner_incidents_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partner_incidents_booking_id_idx ON public.partner_incidents USING btree (booking_id);


--
-- Name: partner_incidents_partner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partner_incidents_partner_id_idx ON public.partner_incidents USING btree (partner_id);


--
-- Name: partner_incidents_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partner_incidents_status_idx ON public.partner_incidents USING btree (status);


--
-- Name: partner_invites_partner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partner_invites_partner_id_idx ON public.partner_invites USING btree (partner_id);


--
-- Name: partner_invites_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partner_invites_token_idx ON public.partner_invites USING btree (token);


--
-- Name: partner_team_members_partner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partner_team_members_partner_id_idx ON public.partner_team_members USING btree (partner_id);


--
-- Name: partner_users_partner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partner_users_partner_id_idx ON public.partner_users USING btree (partner_id);


--
-- Name: partner_users_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partner_users_user_id_idx ON public.partner_users USING btree (user_id);


--
-- Name: partners_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partners_status_idx ON public.partners USING btree (status);


--
-- Name: phone_verification_tokens_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phone_verification_tokens_phone_idx ON public.phone_verification_tokens USING btree (phone);


--
-- Name: phone_verification_tokens_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phone_verification_tokens_token_idx ON public.phone_verification_tokens USING btree (verified_token);


--
-- Name: proof_of_completion_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proof_of_completion_booking_id_idx ON public.proof_of_completion USING btree (booking_id);


--
-- Name: proof_of_completion_partner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proof_of_completion_partner_id_idx ON public.proof_of_completion USING btree (partner_id);


--
-- Name: referrals_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referrals_code_idx ON public.referrals USING btree (code);


--
-- Name: referrals_referrer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referrals_referrer_id_idx ON public.referrals USING btree (referrer_id);


--
-- Name: reviews_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_booking_id_idx ON public.reviews USING btree (booking_id);


--
-- Name: reviews_mover_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_mover_id_idx ON public.reviews USING btree (mover_id);


--
-- Name: saved_addresses_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_addresses_user_id_idx ON public.saved_addresses USING btree (user_id);


--
-- Name: support_ticket_replies_ticket_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_ticket_replies_ticket_id_idx ON public.support_ticket_replies USING btree (ticket_id);


--
-- Name: support_tickets_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_tickets_status_idx ON public.support_tickets USING btree (status);


--
-- Name: support_tickets_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_tickets_user_id_idx ON public.support_tickets USING btree (user_id);


--
-- Name: verification_items_mover_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_items_mover_id_idx ON public.verification_items USING btree (mover_id);


--
-- Name: verification_items_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_items_status_idx ON public.verification_items USING btree (status);


--
-- Name: verification_items_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_items_type_idx ON public.verification_items USING btree (type);


--
-- Name: abandoned_bookings abandoned_bookings_recovered_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_bookings
    ADD CONSTRAINT abandoned_bookings_recovered_booking_id_bookings_id_fk FOREIGN KEY (recovered_booking_id) REFERENCES public.bookings(id);


--
-- Name: abandoned_bookings abandoned_bookings_selected_mover_id_movers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_bookings
    ADD CONSTRAINT abandoned_bookings_selected_mover_id_movers_id_fk FOREIGN KEY (selected_mover_id) REFERENCES public.movers(id);


--
-- Name: abandoned_bookings abandoned_bookings_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_bookings
    ADD CONSTRAINT abandoned_bookings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: ai_incident_insights ai_incident_insights_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_incident_insights
    ADD CONSTRAINT ai_incident_insights_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.partner_incidents(id);


--
-- Name: ai_runs ai_runs_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: ai_support_insights ai_support_insights_ticket_id_support_tickets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_support_insights
    ADD CONSTRAINT ai_support_insights_ticket_id_support_tickets_id_fk FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id);


--
-- Name: booking_assignments booking_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_assignments
    ADD CONSTRAINT booking_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: booking_assignments booking_assignments_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_assignments
    ADD CONSTRAINT booking_assignments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: booking_assignments booking_assignments_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_assignments
    ADD CONSTRAINT booking_assignments_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: booking_assignments booking_assignments_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_assignments
    ADD CONSTRAINT booking_assignments_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.partner_team_members(id);


--
-- Name: booking_metrics booking_metrics_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_metrics
    ADD CONSTRAINT booking_metrics_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: booking_status_events booking_status_events_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_status_events
    ADD CONSTRAINT booking_status_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: booking_status_events booking_status_events_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_status_events
    ADD CONSTRAINT booking_status_events_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: booking_status_events booking_status_events_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_status_events
    ADD CONSTRAINT booking_status_events_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: bookings bookings_customer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_customer_id_users_id_fk FOREIGN KEY (customer_id) REFERENCES public.users(id);


--
-- Name: bookings bookings_mover_id_movers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_mover_id_movers_id_fk FOREIGN KEY (mover_id) REFERENCES public.movers(id);


--
-- Name: bookings bookings_pre_selected_mover_id_movers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pre_selected_mover_id_movers_id_fk FOREIGN KEY (pre_selected_mover_id) REFERENCES public.movers(id);


--
-- Name: compliance_docs compliance_docs_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_docs
    ADD CONSTRAINT compliance_docs_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: compliance_docs compliance_docs_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_docs
    ADD CONSTRAINT compliance_docs_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: compliance_docs compliance_docs_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_docs
    ADD CONSTRAINT compliance_docs_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: coverage_zones coverage_zones_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_zones
    ADD CONSTRAINT coverage_zones_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: email_campaigns email_campaigns_sent_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_sent_by_users_id_fk FOREIGN KEY (sent_by) REFERENCES public.users(id);


--
-- Name: identified_items identified_items_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identified_items
    ADD CONSTRAINT identified_items_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: in_app_notifications in_app_notifications_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.in_app_notifications
    ADD CONSTRAINT in_app_notifications_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: in_app_notifications in_app_notifications_support_ticket_id_support_tickets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.in_app_notifications
    ADD CONSTRAINT in_app_notifications_support_ticket_id_support_tickets_id_fk FOREIGN KEY (support_ticket_id) REFERENCES public.support_tickets(id);


--
-- Name: in_app_notifications in_app_notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.in_app_notifications
    ADD CONSTRAINT in_app_notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: item_feedback item_feedback_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_feedback
    ADD CONSTRAINT item_feedback_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: item_feedback item_feedback_identified_item_id_identified_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_feedback
    ADD CONSTRAINT item_feedback_identified_item_id_identified_items_id_fk FOREIGN KEY (identified_item_id) REFERENCES public.identified_items(id);


--
-- Name: item_feedback item_feedback_submitted_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_feedback
    ADD CONSTRAINT item_feedback_submitted_by_users_id_fk FOREIGN KEY (submitted_by) REFERENCES public.users(id);


--
-- Name: job_notifications job_notifications_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_notifications
    ADD CONSTRAINT job_notifications_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: job_notifications job_notifications_mover_id_movers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_notifications
    ADD CONSTRAINT job_notifications_mover_id_movers_id_fk FOREIGN KEY (mover_id) REFERENCES public.movers(id);


--
-- Name: messages messages_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: messages messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: mover_availability mover_availability_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_availability
    ADD CONSTRAINT mover_availability_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: mover_earnings mover_earnings_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_earnings
    ADD CONSTRAINT mover_earnings_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: mover_earnings mover_earnings_mover_id_movers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_earnings
    ADD CONSTRAINT mover_earnings_mover_id_movers_id_fk FOREIGN KEY (mover_id) REFERENCES public.movers(id);


--
-- Name: mover_earnings mover_earnings_payout_id_mover_payouts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_earnings
    ADD CONSTRAINT mover_earnings_payout_id_mover_payouts_id_fk FOREIGN KEY (payout_id) REFERENCES public.mover_payouts(id);


--
-- Name: mover_payouts mover_payouts_mover_id_movers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_payouts
    ADD CONSTRAINT mover_payouts_mover_id_movers_id_fk FOREIGN KEY (mover_id) REFERENCES public.movers(id);


--
-- Name: mover_performance mover_performance_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_performance
    ADD CONSTRAINT mover_performance_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: mover_performance mover_performance_mover_id_movers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_performance
    ADD CONSTRAINT mover_performance_mover_id_movers_id_fk FOREIGN KEY (mover_id) REFERENCES public.movers(id);


--
-- Name: mover_stripe_accounts mover_stripe_accounts_mover_id_movers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_stripe_accounts
    ADD CONSTRAINT mover_stripe_accounts_mover_id_movers_id_fk FOREIGN KEY (mover_id) REFERENCES public.movers(id);


--
-- Name: mover_terms_acceptance mover_terms_acceptance_mover_id_movers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mover_terms_acceptance
    ADD CONSTRAINT mover_terms_acceptance_mover_id_movers_id_fk FOREIGN KEY (mover_id) REFERENCES public.movers(id);


--
-- Name: movers movers_pilot_approved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movers
    ADD CONSTRAINT movers_pilot_approved_by_users_id_fk FOREIGN KEY (pilot_approved_by) REFERENCES public.users(id);


--
-- Name: movers movers_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movers
    ADD CONSTRAINT movers_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: partner_audit_log partner_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_audit_log
    ADD CONSTRAINT partner_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: partner_audit_log partner_audit_log_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_audit_log
    ADD CONSTRAINT partner_audit_log_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: partner_direct_messages partner_direct_messages_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_direct_messages
    ADD CONSTRAINT partner_direct_messages_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: partner_direct_messages partner_direct_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_direct_messages
    ADD CONSTRAINT partner_direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: partner_incidents partner_incidents_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_incidents
    ADD CONSTRAINT partner_incidents_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: partner_incidents partner_incidents_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_incidents
    ADD CONSTRAINT partner_incidents_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: partner_incidents partner_incidents_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_incidents
    ADD CONSTRAINT partner_incidents_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.users(id);


--
-- Name: partner_incidents partner_incidents_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_incidents
    ADD CONSTRAINT partner_incidents_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id);


--
-- Name: partner_invites partner_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_invites
    ADD CONSTRAINT partner_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id);


--
-- Name: partner_invites partner_invites_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_invites
    ADD CONSTRAINT partner_invites_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: partner_team_members partner_team_members_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_team_members
    ADD CONSTRAINT partner_team_members_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: partner_users partner_users_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_users
    ADD CONSTRAINT partner_users_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: partner_users partner_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_users
    ADD CONSTRAINT partner_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: partners partners_activated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_activated_by_fkey FOREIGN KEY (activated_by) REFERENCES public.users(id);


--
-- Name: proof_of_completion proof_of_completion_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proof_of_completion
    ADD CONSTRAINT proof_of_completion_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: proof_of_completion proof_of_completion_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proof_of_completion
    ADD CONSTRAINT proof_of_completion_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: proof_of_completion proof_of_completion_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proof_of_completion
    ADD CONSTRAINT proof_of_completion_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: referrals referrals_referred_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_id_fkey FOREIGN KEY (referred_id) REFERENCES public.users(id);


--
-- Name: referrals referrals_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.users(id);


--
-- Name: reviews reviews_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: reviews reviews_customer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_customer_id_users_id_fk FOREIGN KEY (customer_id) REFERENCES public.users(id);


--
-- Name: reviews reviews_mover_id_movers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_mover_id_movers_id_fk FOREIGN KEY (mover_id) REFERENCES public.movers(id);


--
-- Name: saved_addresses saved_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_addresses
    ADD CONSTRAINT saved_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: support_ticket_replies support_ticket_replies_ticket_id_support_tickets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_replies
    ADD CONSTRAINT support_ticket_replies_ticket_id_support_tickets_id_fk FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id);


--
-- Name: support_ticket_replies support_ticket_replies_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_replies
    ADD CONSTRAINT support_ticket_replies_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: support_tickets support_tickets_assigned_to_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_users_id_fk FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: support_tickets support_tickets_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: verification_items verification_items_mover_id_movers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_items
    ADD CONSTRAINT verification_items_mover_id_movers_id_fk FOREIGN KEY (mover_id) REFERENCES public.movers(id);


--
-- Name: verification_items verification_items_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_items
    ADD CONSTRAINT verification_items_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict XwbTsvXcW9TQ1ihvIAZMGoZJ3MCh2jchK8GAdlsTHXt2HehSDRJcJFHL6WHXBYm

