CREATE TABLE "promo_code_uses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" text NOT NULL,
	"user_id" varchar NOT NULL,
	"booking_id" varchar NOT NULL,
	"used_at" timestamp DEFAULT now() NOT NULL,
	"discount_amount" numeric(10, 2) NOT NULL,
	CONSTRAINT "promo_code_uses_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
ALTER TABLE "promo_code_uses" ADD CONSTRAINT "promo_code_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "promo_code_uses" ADD CONSTRAINT "promo_code_uses_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "promo_code_uses_user_id_idx" ON "promo_code_uses" ("user_id");
--> statement-breakpoint
CREATE INDEX "promo_code_uses_promo_code_id_idx" ON "promo_code_uses" ("promo_code_id");
--> statement-breakpoint
CREATE INDEX "promo_code_uses_used_at_idx" ON "promo_code_uses" ("used_at");
