CREATE TABLE "abandoned_bookings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"email" text,
	"phone" text,
	"pickup_address" text,
	"dropoff_address" text,
	"load_size" text,
	"preferred_date" text,
	"selected_mover_id" varchar,
	"last_step" integer DEFAULT 1 NOT NULL,
	"reminder_sent_at" timestamp,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"recovered" boolean DEFAULT false NOT NULL,
	"recovered_booking_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_cost" numeric(10, 4),
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"response_time" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_support_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" varchar NOT NULL,
	"summary" text NOT NULL,
	"category" text NOT NULL,
	"suggested_priority" text NOT NULL,
	"root_cause" text,
	"recommendations" text[] NOT NULL,
	"suggested_response" text,
	"customer_response" text,
	"internal_notes" text,
	"similar_cases" text[],
	"confidence" integer DEFAULT 80 NOT NULL,
	"processing_time_ms" integer,
	"model_used" text DEFAULT 'gpt-4o',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" varchar(100) NOT NULL,
	"user_id" varchar,
	"session_id" varchar(100),
	"page" varchar(200),
	"properties" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"partner_id" varchar NOT NULL,
	"team_member_id" varchar,
	"driver_name" text,
	"driver_phone" text,
	"team_name" text,
	"vehicle_type" text,
	"vehicle_plate" text,
	"estimated_arrival" timestamp,
	"assigned_by" varchar,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "booking_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"estimated_vehicle_class" text,
	"estimated_volume_cuft" numeric(8, 2),
	"estimated_weight_kg" numeric(8, 2),
	"estimated_duration_minutes" integer,
	"estimated_price" numeric(10, 2),
	"actual_vehicle_class" text,
	"actual_volume_cuft" numeric(8, 2),
	"actual_weight_kg" numeric(8, 2),
	"actual_duration_minutes" integer,
	"actual_price" numeric(10, 2),
	"volume_accuracy_percent" numeric(5, 2),
	"price_accuracy_percent" numeric(5, 2),
	"vehicle_class_match" boolean,
	"customer_satisfaction_rating" integer,
	"estimate_accuracy_rating" integer,
	"customer_notes" text,
	"mover_difficulty_rating" integer,
	"mover_notes" text,
	"loading_time_minutes" integer,
	"unloading_time_minutes" integer,
	"used_for_training" boolean DEFAULT false NOT NULL,
	"outlier_flag" boolean DEFAULT false NOT NULL,
	"reviewed_by_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_metrics_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "booking_status_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"partner_id" varchar,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" varchar,
	"notes" text,
	"customer_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"mover_id" varchar,
	"pre_selected_mover_id" varchar,
	"pickup_address" text NOT NULL,
	"dropoff_address" text NOT NULL,
	"pickup_latitude" double precision DEFAULT 0 NOT NULL,
	"pickup_longitude" double precision DEFAULT 0 NOT NULL,
	"dropoff_latitude" double precision DEFAULT 0 NOT NULL,
	"dropoff_longitude" double precision DEFAULT 0 NOT NULL,
	"load_size" text NOT NULL,
	"description" text,
	"images" text[],
	"preferred_date" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"pickup_difficulty" text DEFAULT 'ground' NOT NULL,
	"dropoff_difficulty" text DEFAULT 'ground' NOT NULL,
	"heavy_item" boolean DEFAULT false NOT NULL,
	"number_of_movers" integer DEFAULT 1 NOT NULL,
	"acknowledged_single_mover_policy" boolean DEFAULT false NOT NULL,
	"distance" numeric(8, 2) DEFAULT '0' NOT NULL,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"base_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"distance_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"load_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"mover_travel_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"pickup_difficulty_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"dropoff_difficulty_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"heavy_item_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"promo_code" text,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount_reason" text,
	"mover_balance_owed" numeric(10, 2) DEFAULT '0' NOT NULL,
	"mover_balance_paid" boolean DEFAULT false NOT NULL,
	"ai_estimate" text,
	"ai_explanation" text,
	"ai_photo_analysis" text,
	"ai_weight_class" text,
	"ai_recommended_vehicle" text,
	"ai_confidence_score" numeric(3, 2),
	"detected_items" text,
	"payment_status" text DEFAULT 'pending',
	"stripe_payment_intent_id" text,
	"notified_at" timestamp,
	"accepted_at" timestamp,
	"platform_fee_percent" numeric(5, 2) DEFAULT '15.00' NOT NULL,
	"platform_fee_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"mover_net_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"current_latitude" double precision,
	"current_longitude" double precision,
	"location_updated_at" timestamp,
	"flagged_for_review" boolean DEFAULT false NOT NULL,
	"flagged_reason" text,
	"enterprise_partner_id" varchar,
	"enterprise_status" text,
	"routed_to_partner_at" timestamp,
	"enterprise_accepted_at" timestamp,
	"enterprise_rejected_at" timestamp,
	"enterprise_rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_docs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" varchar NOT NULL,
	"doc_type" text NOT NULL,
	"file_url" text,
	"file_name" text,
	"file_size" integer,
	"expiry_date" timestamp,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_zones" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" varchar NOT NULL,
	"zone_name" text NOT NULL,
	"city" text NOT NULL,
	"province" text,
	"postal_code_prefixes" text[],
	"service_radius_km" integer,
	"operating_hours_start" text DEFAULT '08:00',
	"operating_hours_end" text DEFAULT '18:00',
	"operating_days" text[],
	"same_day_available" boolean DEFAULT false NOT NULL,
	"supported_vehicle_classes" text[],
	"supported_load_sizes" text[],
	"excluded_categories" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"type" text NOT NULL,
	"audience_type" text NOT NULL,
	"recipient_ids" text[],
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_by" varchar NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identified_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"photo_url" text NOT NULL,
	"item_name" text,
	"category" text,
	"weight_kg" numeric(8, 2),
	"dimensions_l_cm" numeric(8, 2),
	"dimensions_w_cm" numeric(8, 2),
	"dimensions_h_cm" numeric(8, 2),
	"volume_cuft" numeric(8, 2),
	"handling_complexity" text,
	"vehicle_type" text,
	"recommended_movers" integer,
	"insurance_level" text,
	"confidence" numeric(3, 2),
	"source_metadata" text,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "in_app_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"booking_id" varchar,
	"support_ticket_id" varchar,
	"action_url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_feedback" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identified_item_id" varchar NOT NULL,
	"booking_id" varchar NOT NULL,
	"submitted_by" varchar NOT NULL,
	"submitter_role" text NOT NULL,
	"original_item_name" text,
	"original_category" text,
	"original_weight_kg" numeric(8, 2),
	"original_volume_cuft" numeric(8, 2),
	"original_vehicle_type" text,
	"corrected_item_name" text,
	"corrected_category" text,
	"corrected_weight_kg" numeric(8, 2),
	"corrected_volume_cuft" numeric(8, 2),
	"corrected_vehicle_type" text,
	"feedback_reason" text,
	"feedback_notes" text,
	"processed_for_learning" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"mover_id" varchar NOT NULL,
	"distance_to_pickup" numeric(8, 2) NOT NULL,
	"estimated_earnings" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notified_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "job_notifications_booking_id_mover_id_unique" UNIQUE("booking_id","mover_id")
);
--> statement-breakpoint
CREATE TABLE "learning_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insight_type" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"sample_size" integer NOT NULL,
	"accuracy_percent" numeric(5, 2),
	"avg_error_percent" numeric(5, 2),
	"category_breakdown" text,
	"vehicle_class_breakdown" text,
	"recommendations" text[],
	"adjustment_factors" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mover_earnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mover_id" varchar NOT NULL,
	"booking_id" varchar NOT NULL,
	"gross_amount" numeric(10, 2) NOT NULL,
	"platform_fee_percent" numeric(5, 2) DEFAULT '15.00' NOT NULL,
	"platform_fee_amount" numeric(10, 2) NOT NULL,
	"net_amount" numeric(10, 2) NOT NULL,
	"stripe_transfer_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"available_at" timestamp,
	"paid_at" timestamp,
	"payout_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mover_earnings_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "mover_payouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mover_id" varchar NOT NULL,
	"stripe_payout_id" text,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'cad' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payout_type" text DEFAULT 'standard' NOT NULL,
	"arrival_date" timestamp,
	"failure_code" text,
	"failure_message" text,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mover_performance" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mover_id" varchar NOT NULL,
	"booking_id" varchar NOT NULL,
	"accepted_at" timestamp,
	"arrived_at_pickup_at" timestamp,
	"loading_started_at" timestamp,
	"loading_completed_at" timestamp,
	"arrived_at_dropoff_at" timestamp,
	"unloading_completed_at" timestamp,
	"arrival_delay_minutes" integer,
	"total_move_minutes" integer,
	"communication_score" integer,
	"professionalism_score" integer,
	"care_with_items_score" integer,
	"load_class" text,
	"distance_km" numeric(8, 2),
	"had_issues" boolean DEFAULT false NOT NULL,
	"issue_description" text,
	"was_rejected" boolean DEFAULT false NOT NULL,
	"rejection_reason" text,
	"was_good_match" boolean,
	"match_score" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mover_stripe_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mover_id" varchar NOT NULL,
	"stripe_account_id" text NOT NULL,
	"account_type" text DEFAULT 'express' NOT NULL,
	"onboarding_status" text DEFAULT 'pending' NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"requirements_due" text[],
	"currently_due" text[],
	"default_currency" text DEFAULT 'cad',
	"country" text DEFAULT 'CA',
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"last_reminder_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mover_stripe_accounts_mover_id_unique" UNIQUE("mover_id"),
	CONSTRAINT "mover_stripe_accounts_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
CREATE TABLE "mover_terms_acceptance" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mover_id" varchar NOT NULL,
	"terms_version" text NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL,
	"accepted_from_ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "movers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"vehicle_type" text NOT NULL,
	"vehicle_capacity" text,
	"vehicle_photo" text,
	"vehicle_color" text,
	"license_plate" text,
	"license_number" text,
	"mover_image" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"profile_verified" boolean DEFAULT false NOT NULL,
	"documents_verified" boolean DEFAULT false NOT NULL,
	"rating" numeric(3, 2) DEFAULT '0',
	"total_moves" integer DEFAULT 0 NOT NULL,
	"completed_trips" integer DEFAULT 0 NOT NULL,
	"bio" text,
	"location" text,
	"latitude" double precision,
	"longitude" double precision,
	"last_location_update" timestamp,
	"is_available" boolean DEFAULT true NOT NULL,
	"pilot_status" text DEFAULT 'none',
	"pilot_approved_by" varchar,
	"pilot_approved_at" timestamp,
	"pilot_notes" text,
	"pilot_expires_at" timestamp,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"profile_reminder_count" integer DEFAULT 0 NOT NULL,
	"last_profile_reminder_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" varchar NOT NULL,
	"actor_id" varchar,
	"action" text NOT NULL,
	"object_type" text,
	"object_id" text,
	"notes" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_incidents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"partner_id" varchar NOT NULL,
	"category" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"notes" text NOT NULL,
	"file_urls" text[],
	"escalation_flag" boolean DEFAULT false NOT NULL,
	"reported_by" varchar,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" varchar NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'partner_admin' NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"invited_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partner_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "partner_team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" varchar NOT NULL,
	"name" text NOT NULL,
	"member_type" text DEFAULT 'driver' NOT NULL,
	"phone" text,
	"vehicle_type" text,
	"vehicle_plate" text,
	"vehicle_color" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"partner_id" varchar NOT NULL,
	"partner_role" text DEFAULT 'partner_viewer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partner_users_user_id_partner_id_unique" UNIQUE("user_id","partner_id")
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text NOT NULL,
	"operating_name" text,
	"status" text DEFAULT 'invited' NOT NULL,
	"onboarding_step" integer DEFAULT 1 NOT NULL,
	"billing_email" text,
	"primary_ops_contact" text,
	"dispatch_contact" text,
	"escalation_contact" text,
	"address" text,
	"phone" text,
	"service_description" text,
	"dispatch_method" text DEFAULT 'manual',
	"dispatch_phone" text,
	"dispatch_email" text,
	"dispatch_notes" text,
	"profile_complete" boolean DEFAULT false NOT NULL,
	"coverage_complete" boolean DEFAULT false NOT NULL,
	"compliance_complete" boolean DEFAULT false NOT NULL,
	"dispatch_complete" boolean DEFAULT false NOT NULL,
	"terms_accepted" boolean DEFAULT false NOT NULL,
	"terms_accepted_at" timestamp,
	"test_booking_complete" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp,
	"activated_by" varchar,
	"suspended_at" timestamp,
	"suspended_reason" text,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_verification_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"verification_code" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_of_completion" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"partner_id" varchar NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text,
	"file_type" text,
	"proof_type" text DEFAULT 'photo' NOT NULL,
	"notes" text,
	"uploaded_by" varchar,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"mover_id" varchar NOT NULL,
	"customer_id" varchar NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_replies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"message" text NOT NULL,
	"is_staff" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"subject" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assigned_to" varchar,
	"resolved_at" timestamp,
	"customer_last_read_at" timestamp,
	"last_staff_reply_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" text,
	"email" text NOT NULL,
	"password" text,
	"name" text NOT NULL,
	"phone" text,
	"address" text,
	"avatar_url" text,
	"role" text DEFAULT 'customer' NOT NULL,
	"stripe_customer_id" text,
	"reset_token" text,
	"reset_token_expiry" timestamp,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"locked_by_admin" boolean DEFAULT false NOT NULL,
	"lock_reason" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"verification_token" text,
	"verification_token_expiry" timestamp,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"phone_verification_code" text,
	"phone_verification_expiry" timestamp,
	"has_completed_onboarding" boolean DEFAULT false NOT NULL,
	"has_used_first_move_discount" boolean DEFAULT false NOT NULL,
	"promo_uses_count" integer DEFAULT 0 NOT NULL,
	"sms_job_alerts" boolean DEFAULT true NOT NULL,
	"sms_booking_updates" boolean DEFAULT false NOT NULL,
	"email_job_alerts" boolean DEFAULT true NOT NULL,
	"email_booking_updates" boolean DEFAULT true NOT NULL,
	"email_earnings_reports" boolean DEFAULT true NOT NULL,
	"email_promotions" boolean DEFAULT false NOT NULL,
	"push_notifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	"last_logout_at" timestamp,
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mover_id" varchar NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"data" text,
	"file_urls" text[],
	"rejection_reason" text,
	"expiry_date" timestamp,
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"reviewed_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "abandoned_bookings" ADD CONSTRAINT "abandoned_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandoned_bookings" ADD CONSTRAINT "abandoned_bookings_selected_mover_id_movers_id_fk" FOREIGN KEY ("selected_mover_id") REFERENCES "public"."movers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandoned_bookings" ADD CONSTRAINT "abandoned_bookings_recovered_booking_id_bookings_id_fk" FOREIGN KEY ("recovered_booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_support_insights" ADD CONSTRAINT "ai_support_insights_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_assignments" ADD CONSTRAINT "booking_assignments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_assignments" ADD CONSTRAINT "booking_assignments_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_assignments" ADD CONSTRAINT "booking_assignments_team_member_id_partner_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."partner_team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_assignments" ADD CONSTRAINT "booking_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_metrics" ADD CONSTRAINT "booking_metrics_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_events" ADD CONSTRAINT "booking_status_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_events" ADD CONSTRAINT "booking_status_events_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_events" ADD CONSTRAINT "booking_status_events_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_mover_id_movers_id_fk" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pre_selected_mover_id_movers_id_fk" FOREIGN KEY ("pre_selected_mover_id") REFERENCES "public"."movers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_docs" ADD CONSTRAINT "compliance_docs_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_docs" ADD CONSTRAINT "compliance_docs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_docs" ADD CONSTRAINT "compliance_docs_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_zones" ADD CONSTRAINT "coverage_zones_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identified_items" ADD CONSTRAINT "identified_items_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_support_ticket_id_support_tickets_id_fk" FOREIGN KEY ("support_ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_feedback" ADD CONSTRAINT "item_feedback_identified_item_id_identified_items_id_fk" FOREIGN KEY ("identified_item_id") REFERENCES "public"."identified_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_feedback" ADD CONSTRAINT "item_feedback_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_feedback" ADD CONSTRAINT "item_feedback_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notifications" ADD CONSTRAINT "job_notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notifications" ADD CONSTRAINT "job_notifications_mover_id_movers_id_fk" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mover_earnings" ADD CONSTRAINT "mover_earnings_mover_id_movers_id_fk" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mover_earnings" ADD CONSTRAINT "mover_earnings_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mover_earnings" ADD CONSTRAINT "mover_earnings_payout_id_mover_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."mover_payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mover_payouts" ADD CONSTRAINT "mover_payouts_mover_id_movers_id_fk" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mover_performance" ADD CONSTRAINT "mover_performance_mover_id_movers_id_fk" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mover_performance" ADD CONSTRAINT "mover_performance_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mover_stripe_accounts" ADD CONSTRAINT "mover_stripe_accounts_mover_id_movers_id_fk" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mover_terms_acceptance" ADD CONSTRAINT "mover_terms_acceptance_mover_id_movers_id_fk" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movers" ADD CONSTRAINT "movers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movers" ADD CONSTRAINT "movers_pilot_approved_by_users_id_fk" FOREIGN KEY ("pilot_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_audit_log" ADD CONSTRAINT "partner_audit_log_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_audit_log" ADD CONSTRAINT "partner_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_incidents" ADD CONSTRAINT "partner_incidents_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_incidents" ADD CONSTRAINT "partner_incidents_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_incidents" ADD CONSTRAINT "partner_incidents_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_incidents" ADD CONSTRAINT "partner_incidents_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_team_members" ADD CONSTRAINT "partner_team_members_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_users" ADD CONSTRAINT "partner_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_users" ADD CONSTRAINT "partner_users_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_completion" ADD CONSTRAINT "proof_of_completion_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_completion" ADD CONSTRAINT "proof_of_completion_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_completion" ADD CONSTRAINT "proof_of_completion_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_mover_id_movers_id_fk" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_replies" ADD CONSTRAINT "support_ticket_replies_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_replies" ADD CONSTRAINT "support_ticket_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_items" ADD CONSTRAINT "verification_items_mover_id_movers_id_fk" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_items" ADD CONSTRAINT "verification_items_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abandoned_bookings_user_id_idx" ON "abandoned_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "abandoned_bookings_email_idx" ON "abandoned_bookings" USING btree ("email");--> statement-breakpoint
CREATE INDEX "abandoned_bookings_recovered_idx" ON "abandoned_bookings" USING btree ("recovered");--> statement-breakpoint
CREATE INDEX "abandoned_bookings_created_at_idx" ON "abandoned_bookings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_runs_booking_id_idx" ON "ai_runs" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "ai_runs_provider_idx" ON "ai_runs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "ai_runs_created_at_idx" ON "ai_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_support_insights_ticket_id_idx" ON "ai_support_insights" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "analytics_events_name_idx" ON "analytics_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "analytics_events_user_id_idx" ON "analytics_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "booking_assignments_booking_id_idx" ON "booking_assignments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_assignments_partner_id_idx" ON "booking_assignments" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "booking_metrics_booking_id_idx" ON "booking_metrics" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_metrics_training_idx" ON "booking_metrics" USING btree ("used_for_training");--> statement-breakpoint
CREATE INDEX "booking_status_events_booking_id_idx" ON "booking_status_events" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_status_events_partner_id_idx" ON "booking_status_events" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "bookings_customer_id_idx" ON "bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "bookings_mover_id_idx" ON "bookings" USING btree ("mover_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_payment_status_idx" ON "bookings" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "compliance_docs_partner_id_idx" ON "compliance_docs" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "compliance_docs_review_status_idx" ON "compliance_docs" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "coverage_zones_partner_id_idx" ON "coverage_zones" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "email_campaigns_sent_by_idx" ON "email_campaigns" USING btree ("sent_by");--> statement-breakpoint
CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_campaigns_type_idx" ON "email_campaigns" USING btree ("type");--> statement-breakpoint
CREATE INDEX "identified_items_booking_id_idx" ON "identified_items" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "identified_items_status_idx" ON "identified_items" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "in_app_notifications_user_id_idx" ON "in_app_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "in_app_notifications_user_read_idx" ON "in_app_notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "in_app_notifications_type_idx" ON "in_app_notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "in_app_notifications_created_at_idx" ON "in_app_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "item_feedback_identified_item_idx" ON "item_feedback" USING btree ("identified_item_id");--> statement-breakpoint
CREATE INDEX "item_feedback_booking_id_idx" ON "item_feedback" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "item_feedback_processed_idx" ON "item_feedback" USING btree ("processed_for_learning");--> statement-breakpoint
CREATE INDEX "mover_status_idx" ON "job_notifications" USING btree ("mover_id","status");--> statement-breakpoint
CREATE INDEX "learning_insights_type_idx" ON "learning_insights" USING btree ("insight_type");--> statement-breakpoint
CREATE INDEX "learning_insights_period_idx" ON "learning_insights" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "messages_booking_id_idx" ON "messages" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "mover_earnings_mover_id_idx" ON "mover_earnings" USING btree ("mover_id");--> statement-breakpoint
CREATE INDEX "mover_earnings_booking_id_idx" ON "mover_earnings" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "mover_earnings_status_idx" ON "mover_earnings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mover_payouts_mover_id_idx" ON "mover_payouts" USING btree ("mover_id");--> statement-breakpoint
CREATE INDEX "mover_payouts_status_idx" ON "mover_payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mover_payouts_stripe_payout_idx" ON "mover_payouts" USING btree ("stripe_payout_id");--> statement-breakpoint
CREATE INDEX "mover_performance_mover_id_idx" ON "mover_performance" USING btree ("mover_id");--> statement-breakpoint
CREATE INDEX "mover_performance_booking_id_idx" ON "mover_performance" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "mover_performance_load_class_idx" ON "mover_performance" USING btree ("load_class");--> statement-breakpoint
CREATE INDEX "mover_stripe_accounts_mover_id_idx" ON "mover_stripe_accounts" USING btree ("mover_id");--> statement-breakpoint
CREATE INDEX "mover_stripe_accounts_stripe_account_idx" ON "mover_stripe_accounts" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE INDEX "mover_terms_acceptance_mover_id_idx" ON "mover_terms_acceptance" USING btree ("mover_id");--> statement-breakpoint
CREATE INDEX "mover_terms_acceptance_version_idx" ON "mover_terms_acceptance" USING btree ("terms_version");--> statement-breakpoint
CREATE INDEX "movers_user_id_idx" ON "movers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "movers_availability_idx" ON "movers" USING btree ("is_available");--> statement-breakpoint
CREATE INDEX "movers_pilot_status_idx" ON "movers" USING btree ("pilot_status");--> statement-breakpoint
CREATE INDEX "partner_audit_log_partner_id_idx" ON "partner_audit_log" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_audit_log_created_at_idx" ON "partner_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "partner_incidents_booking_id_idx" ON "partner_incidents" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "partner_incidents_partner_id_idx" ON "partner_incidents" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_incidents_status_idx" ON "partner_incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "partner_invites_token_idx" ON "partner_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "partner_invites_partner_id_idx" ON "partner_invites" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_team_members_partner_id_idx" ON "partner_team_members" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_users_partner_id_idx" ON "partner_users" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_users_user_id_idx" ON "partner_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "partners_status_idx" ON "partners" USING btree ("status");--> statement-breakpoint
CREATE INDEX "phone_verification_tokens_phone_idx" ON "phone_verification_tokens" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "phone_verification_tokens_token_idx" ON "phone_verification_tokens" USING btree ("verified_token");--> statement-breakpoint
CREATE INDEX "proof_of_completion_booking_id_idx" ON "proof_of_completion" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "proof_of_completion_partner_id_idx" ON "proof_of_completion" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "reviews_mover_id_idx" ON "reviews" USING btree ("mover_id");--> statement-breakpoint
CREATE INDEX "reviews_booking_id_idx" ON "reviews" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "support_ticket_replies_ticket_id_idx" ON "support_ticket_replies" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_tickets_user_id_idx" ON "support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "verification_items_mover_id_idx" ON "verification_items" USING btree ("mover_id");--> statement-breakpoint
CREATE INDEX "verification_items_status_idx" ON "verification_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "verification_items_type_idx" ON "verification_items" USING btree ("type");