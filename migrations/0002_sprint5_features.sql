-- Sprint 5: Saved addresses and feedback surveys

CREATE TABLE IF NOT EXISTS "saved_addresses" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "label" text NOT NULL,
  "address" text NOT NULL,
  "latitude" double precision,
  "longitude" double precision,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "saved_addresses_user_label_uniq" UNIQUE ("user_id", "label")
);
CREATE INDEX IF NOT EXISTS "saved_addresses_user_id_idx" ON "saved_addresses" ("user_id");

CREATE TABLE IF NOT EXISTS "feedback_surveys" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" varchar NOT NULL UNIQUE REFERENCES "bookings"("id"),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "nps_score" integer NOT NULL,
  "ease_rating" integer NOT NULL,
  "mover_rating" integer NOT NULL,
  "comments" text,
  "submitted_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "feedback_surveys_booking_id_idx" ON "feedback_surveys" ("booking_id");
CREATE INDEX IF NOT EXISTS "feedback_surveys_user_id_idx" ON "feedback_surveys" ("user_id");
