import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, boolean, doublePrecision, unique, index, date, time, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firebaseUid: text("firebase_uid").unique(),
  email: text("email").notNull().unique(),
  password: text("password"),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("customer"),
  stripeCustomerId: text("stripe_customer_id"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  // Account lockout security fields
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  lockedByAdmin: boolean("locked_by_admin").default(false).notNull(),
  lockReason: text("lock_reason"),
  // Email verification fields
  emailVerified: boolean("email_verified").default(false).notNull(),
  verificationToken: text("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry"),
  // Phone verification fields
  phoneVerified: boolean("phone_verified").default(false).notNull(),
  phoneVerificationCode: text("phone_verification_code"),
  phoneVerificationExpiry: timestamp("phone_verification_expiry"),
  // Onboarding and promo code fields
  hasCompletedOnboarding: boolean("has_completed_onboarding").default(false).notNull(),
  hasUsedFirstMoveDiscount: boolean("has_used_first_move_discount").default(false).notNull(),
  promoUsesCount: integer("promo_uses_count").default(0).notNull(),
  // Notification preference fields
  smsJobAlerts: boolean("sms_job_alerts").default(true).notNull(),
  smsBookingUpdates: boolean("sms_booking_updates").default(false).notNull(),
  emailJobAlerts: boolean("email_job_alerts").default(true).notNull(),
  emailBookingUpdates: boolean("email_booking_updates").default(true).notNull(),
  emailEarningsReports: boolean("email_earnings_reports").default(true).notNull(),
  emailPromotions: boolean("email_promotions").default(false).notNull(),
  pushNotifications: boolean("push_notifications").default(true).notNull(),
  // Referral program
  referralCode: varchar("referral_code", { length: 6 }).unique(),
  referralCredits: integer("referral_credits").default(0).notNull(),
  // Activity tracking timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
  lastLogoutAt: timestamp("last_logout_at"),
});

// Pre-signup phone verification for Uber-style OTP flow
export const phoneVerificationTokens = pgTable("phone_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull(),
  verificationCode: text("verification_code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false).notNull(),
  verifiedToken: text("verified_token"), // Token to use during signup to prove phone is verified
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  phoneIdx: index("phone_verification_tokens_phone_idx").on(table.phone),
  tokenIdx: index("phone_verification_tokens_token_idx").on(table.verifiedToken),
}));

export const insertPhoneVerificationTokenSchema = createInsertSchema(phoneVerificationTokens).omit({
  id: true,
  createdAt: true,
});

export type InsertPhoneVerificationToken = z.infer<typeof insertPhoneVerificationTokenSchema>;
export type PhoneVerificationToken = typeof phoneVerificationTokens.$inferSelect;

export const movers = pgTable("movers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  vehicleType: text("vehicle_type").notNull(),
  vehicleCapacity: text("vehicle_capacity"),
  vehiclePhoto: text("vehicle_photo"),
  vehicleColor: text("vehicle_color"),
  licensePlate: text("license_plate"),
  licenseNumber: text("license_number"),
  moverImage: text("mover_image"),
  isVerified: boolean("is_verified").default(false).notNull(),
  profileVerified: boolean("profile_verified").default(false).notNull(),
  documentsVerified: boolean("documents_verified").default(false).notNull(),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  totalMoves: integer("total_moves").default(0).notNull(),
  completedTrips: integer("completed_trips").default(0).notNull(),
  bio: text("bio"),
  location: text("location"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  lastLocationUpdate: timestamp("last_location_update"), // When GPS was last updated (for live location priority)
  isAvailable: boolean("is_available").default(true).notNull(),
  // Early Access (Pilot) program fields
  pilotStatus: text("pilot_status").default("none"), // none | pending | approved | rejected | suspended
  pilotApprovedBy: varchar("pilot_approved_by").references(() => users.id),
  pilotApprovedAt: timestamp("pilot_approved_at"),
  pilotNotes: text("pilot_notes"),
  pilotExpiresAt: timestamp("pilot_expires_at"),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  // Profile completion reminder tracking
  profileReminderCount: integer("profile_reminder_count").default(0).notNull(),
  lastProfileReminderAt: timestamp("last_profile_reminder_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("movers_user_id_idx").on(table.userId),
  availabilityIdx: index("movers_availability_idx").on(table.isAvailable),
  pilotStatusIdx: index("movers_pilot_status_idx").on(table.pilotStatus),
}));

// Early Access Mover Terms Acceptance - Legal consent tracking
export const moverTermsAcceptance = pgTable("mover_terms_acceptance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moverId: varchar("mover_id").references(() => movers.id).notNull(),
  termsVersion: text("terms_version").notNull(), // e.g., "EA-1.0"
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
  acceptedFromIp: text("accepted_from_ip"),
  userAgent: text("user_agent"),
}, (table) => ({
  moverIdIdx: index("mover_terms_acceptance_mover_id_idx").on(table.moverId),
  versionIdx: index("mover_terms_acceptance_version_idx").on(table.termsVersion),
}));

export const insertMoverTermsAcceptanceSchema = createInsertSchema(moverTermsAcceptance).omit({
  id: true,
  acceptedAt: true,
});

export type InsertMoverTermsAcceptance = z.infer<typeof insertMoverTermsAcceptanceSchema>;
export type MoverTermsAcceptance = typeof moverTermsAcceptance.$inferSelect;

export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => users.id).notNull(),
  moverId: varchar("mover_id").references(() => movers.id),
  preSelectedMoverId: varchar("pre_selected_mover_id").references(() => movers.id), // For direct mover selection from Browse Movers page
  pickupAddress: text("pickup_address").notNull(),
  dropoffAddress: text("dropoff_address").notNull(),
  pickupLatitude: doublePrecision("pickup_latitude").notNull().default(0),
  pickupLongitude: doublePrecision("pickup_longitude").notNull().default(0),
  dropoffLatitude: doublePrecision("dropoff_latitude").notNull().default(0),
  dropoffLongitude: doublePrecision("dropoff_longitude").notNull().default(0),
  loadSize: text("load_size").notNull(),
  description: text("description"),
  images: text("images").array(),
  preferredDate: timestamp("preferred_date").notNull(),
  status: text("status").notNull().default("pending"),
  
  // New pricing-related fields
  pickupDifficulty: text("pickup_difficulty").notNull().default("ground"),
  dropoffDifficulty: text("dropoff_difficulty").notNull().default("ground"),
  heavyItem: boolean("heavy_item").notNull().default(false),
  numberOfMovers: integer("number_of_movers").notNull().default(1),
  acknowledgedSingleMoverPolicy: boolean("acknowledged_single_mover_policy").notNull().default(false),
  
  // Distance and pricing
  distance: decimal("distance", { precision: 8, scale: 2 }).notNull().default("0"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull().default("0"),
  baseFee: decimal("base_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  distanceFee: decimal("distance_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  loadFee: decimal("load_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  moverTravelFee: decimal("mover_travel_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  pickupDifficultyFee: decimal("pickup_difficulty_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  dropoffDifficultyFee: decimal("dropoff_difficulty_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  heavyItemFee: decimal("heavy_item_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  
  // Promo code discount
  promoCode: text("promo_code"),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  discountReason: text("discount_reason"),
  moverBalanceOwed: decimal("mover_balance_owed", { precision: 10, scale: 2 }).notNull().default("0"),
  moverBalancePaid: boolean("mover_balance_paid").default(false).notNull(),
  
  // AI-powered features
  aiEstimate: text("ai_estimate"),
  aiExplanation: text("ai_explanation"),
  aiPhotoAnalysis: text("ai_photo_analysis"),
  aiWeightClass: text("ai_weight_class"),
  aiRecommendedVehicle: text("ai_recommended_vehicle"),
  aiConfidenceScore: decimal("ai_confidence_score", { precision: 3, scale: 2 }),
  detectedItems: text("detected_items"),
  
  paymentStatus: text("payment_status").default("pending"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  notifiedAt: timestamp("notified_at"),
  acceptedAt: timestamp("accepted_at"),
  
  // Platform commission tracking for mover payouts
  platformFeePercent: decimal("platform_fee_percent", { precision: 5, scale: 2 }).notNull().default("15.00"),
  platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  moverNetAmount: decimal("mover_net_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  
  // Real-time location tracking for active trips
  currentLatitude: doublePrecision("current_latitude"),
  currentLongitude: doublePrecision("current_longitude"),
  locationUpdatedAt: timestamp("location_updated_at"),
  
  // Stripe Radar fraud detection
  flaggedForReview: boolean("flagged_for_review").notNull().default(false),
  flaggedReason: text("flagged_reason"),

  // Enterprise partner fulfillment fields
  enterprisePartnerId: varchar("enterprise_partner_id"),
  enterpriseStatus: text("enterprise_status"),
  routedToPartnerAt: timestamp("routed_to_partner_at"),
  enterpriseAcceptedAt: timestamp("enterprise_accepted_at"),
  enterpriseRejectedAt: timestamp("enterprise_rejected_at"),
  enterpriseRejectionReason: text("enterprise_rejection_reason"),
  // Stripe transfer to the enterprise partner (set by recordPartnerEarnings)
  partnerStripeTransferId: text("partner_stripe_transfer_id"),

  // Attribution — captured on POST /api/bookings from query params / headers
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  sourceChannel: text("source_channel"),
  landingPage: text("landing_page"),

  // SLA fields — set when mover is assigned; used by PULSE for breach detection
  expectedCompletionAt: timestamp("expected_completion_at"),
  slaDeadlineAt: timestamp("sla_deadline_at"),

  // Actual completion timestamp — authoritative for RETAIN dormancy scans and
  // any analytics that need "when did the move end" rather than "when was the
  // row last touched" (updatedAt bumps on review-related mutations).
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  customerIdIdx: index("bookings_customer_id_idx").on(table.customerId),
  moverIdIdx: index("bookings_mover_id_idx").on(table.moverId),
  statusIdx: index("bookings_status_idx").on(table.status),
  paymentStatusIdx: index("bookings_payment_status_idx").on(table.paymentStatus),
  sourceChannelIdx: index("bookings_source_channel_idx").on(table.sourceChannel),
  slaDeadlineIdx: index("bookings_sla_deadline_idx").on(table.slaDeadlineAt),
}));

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  senderId: varchar("sender_id").references(() => users.id).notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
}, (table) => ({
  bookingIdIdx: index("messages_booking_id_idx").on(table.bookingId),
}));

export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  moverId: varchar("mover_id").references(() => movers.id),
  customerId: varchar("customer_id").references(() => users.id).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  moverIdIdx: index("reviews_mover_id_idx").on(table.moverId),
  bookingIdIdx: index("reviews_booking_id_idx").on(table.bookingId),
  bookingCustomerUnique: unique("reviews_booking_customer_unique").on(table.bookingId, table.customerId),
}));

export const jobNotifications = pgTable("job_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  moverId: varchar("mover_id").references(() => movers.id).notNull(),
  distanceToPickup: decimal("distance_to_pickup", { precision: 8, scale: 2 }).notNull(),
  estimatedEarnings: decimal("estimated_earnings", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  notifiedAt: timestamp("notified_at").defaultNow().notNull(),
  respondedAt: timestamp("responded_at"),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => ({
  uniqueBookingMover: unique().on(table.bookingId, table.moverId),
  moverStatusIdx: index("mover_status_idx").on(table.moverId, table.status),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  firebaseUid: true,
  emailVerified: true,
  verificationToken: true,
  verificationTokenExpiry: true,
});

export const insertMoverSchema = createInsertSchema(movers).omit({
  id: true,
  createdAt: true,
  rating: true,
  totalMoves: true,
  completedTrips: true,
});

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  paymentStatus: true,
  stripePaymentIntentId: true,
  notifiedAt: true,
  acceptedAt: true,
  pickupLatitude: true,
  pickupLongitude: true,
  dropoffLatitude: true,
  dropoffLongitude: true,
  distance: true,
  price: true,
  baseFee: true,
  distanceFee: true,
  loadFee: true,
  moverTravelFee: true,
  pickupDifficultyFee: true,
  dropoffDifficultyFee: true,
  heavyItemFee: true,
  subtotal: true,
}).extend({
  // Override preferredDate to accept ISO date strings from the frontend
  preferredDate: z.string().or(z.date()).transform((val) => new Date(val)),
  // Add enum validation for pricing-related fields
  pickupDifficulty: z.enum(['ground', 'basement', 'stairs', 'elevator']),
  dropoffDifficulty: z.enum(['ground', 'basement', 'stairs', 'elevator']),
  // Updated load size categories based on volume (FT³)
  // boxes: 0-20 ft³, medium: 21-165 ft³, large: 166-300 ft³, apartment: >300 ft³
  loadSize: z.enum(['boxes', 'medium', 'large', 'apartment']),
  numberOfMovers: z.number().int().min(1).max(2),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
}).extend({
  moverId: z.string().nullable().optional(),
});

export const insertJobNotificationSchema = createInsertSchema(jobNotifications).omit({
  id: true,
  notifiedAt: true,
});

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  subject: text("subject").notNull(),
  category: text("category").notNull().default("general"),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  // Track when customer last read the ticket to show unread notifications
  customerLastReadAt: timestamp("customer_last_read_at"),
  // Track when staff last replied (for notification purposes)
  lastStaffReplyAt: timestamp("last_staff_reply_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("support_tickets_user_id_idx").on(table.userId),
  statusIdx: index("support_tickets_status_idx").on(table.status),
}));

export const supportTicketReplies = pgTable("support_ticket_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").references(() => supportTickets.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  message: text("message").notNull(),
  isStaff: boolean("is_staff").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  ticketIdIdx: index("support_ticket_replies_ticket_id_idx").on(table.ticketId),
}));

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  assignedTo: true,
}).extend({
  category: z.enum(['general', 'booking', 'billing', 'technical']),
  priority: z.enum(['low', 'normal', 'high']),
});

export const insertSupportTicketReplySchema = createInsertSchema(supportTicketReplies).omit({
  id: true,
  createdAt: true,
});

export const verificationItems = pgTable("verification_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moverId: varchar("mover_id").references(() => movers.id).notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  data: text("data"),
  fileUrls: text("file_urls").array(),
  rejectionReason: text("rejection_reason"),
  expiryDate: timestamp("expiry_date"),
  // Aegis Ford (COMPLIANCE) reminder tracking — one-shot flags per warning window.
  // Flipped true once Aegis sends the email/SMS so we don't spam the mover.
  reminded30d: boolean("reminded_30d").default(false).notNull(),
  reminded14d: boolean("reminded_14d").default(false).notNull(),
  reminded7d: boolean("reminded_7d").default(false).notNull(),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  moverIdIdx: index("verification_items_mover_id_idx").on(table.moverId),
  statusIdx: index("verification_items_status_idx").on(table.status),
  typeIdx: index("verification_items_type_idx").on(table.type),
}));

export const insertVerificationItemSchema = createInsertSchema(verificationItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  reviewedAt: true,
  reviewedBy: true,
}).extend({
  type: z.enum(['ID', 'DRIVERS_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_PHOTOS', 'INSURANCE', 'BACKGROUND_CHECK', 'PAYOUT_SETUP']),
  status: z.enum(['pending', 'under_review', 'approved', 'rejected', 'expired']).optional(),
  expiryDate: z.string().or(z.date()).transform((val) => val ? new Date(val) : null).optional().nullable(),
});

export const identifiedItems = pgTable("identified_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  photoUrl: text("photo_url").notNull(),
  itemName: text("item_name"),
  category: text("category"),
  weightKg: decimal("weight_kg", { precision: 8, scale: 2 }),
  dimensionsLcm: decimal("dimensions_l_cm", { precision: 8, scale: 2 }),
  dimensionsWcm: decimal("dimensions_w_cm", { precision: 8, scale: 2 }),
  dimensionsHcm: decimal("dimensions_h_cm", { precision: 8, scale: 2 }),
  volumeCuft: decimal("volume_cuft", { precision: 8, scale: 2 }),
  handlingComplexity: text("handling_complexity"),
  // Keyed premium bucket from PRICING_CONFIG.itemPremiums (e.g. "piano_upright",
  // "refrigerator"). Populated by the vision engine; feeds the itemized
  // breakdown line in the price summary. Null for standard household items.
  premiumKey: text("premium_key"),
  vehicleType: text("vehicle_type"),
  recommendedMovers: integer("recommended_movers"),
  insuranceLevel: text("insurance_level"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  sourceMetadata: text("source_metadata"),
  processingStatus: text("processing_status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("identified_items_booking_id_idx").on(table.bookingId),
  statusIdx: index("identified_items_status_idx").on(table.processingStatus),
}));

export const aiRuns = pgTable("ai_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id),
  provider: text("provider").notNull(),
  operation: text("operation").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalCost: decimal("total_cost", { precision: 10, scale: 4 }),
  status: text("status").notNull().default("success"),
  errorMessage: text("error_message"),
  responseTime: integer("response_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("ai_runs_booking_id_idx").on(table.bookingId),
  providerIdx: index("ai_runs_provider_idx").on(table.provider),
  createdAtIdx: index("ai_runs_created_at_idx").on(table.createdAt),
}));

export const insertIdentifiedItemSchema = createInsertSchema(identifiedItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  category: z.enum(['Furniture', 'Appliance', 'Fragile', 'Oversized', 'Bulky', 'Electronics', 'Other']).optional(),
  handlingComplexity: z.enum(['low', 'medium', 'slight', 'moderate', 'high', 'very_high']).optional(),
  premiumKey: z.string().nullable().optional(),
  vehicleType: z.enum(['car', 'van', 'pickup', 'truck']).optional(),
  insuranceLevel: z.enum(['standard', 'medium', 'high', 'premium']).optional(),
  processingStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
});

export const insertAiRunSchema = createInsertSchema(aiRuns).omit({
  id: true,
  createdAt: true,
}).extend({
  provider: z.enum(['openai', 'serpapi', 'amazon', 'google']),
  operation: z.enum(['vision', 'search', 'categorization', 'spec_extraction']),
  status: z.enum(['success', 'failed', 'timeout']).optional(),
});

export const aiSupportInsights = pgTable("ai_support_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").references(() => supportTickets.id).notNull(),
  summary: text("summary").notNull(),
  category: text("category").notNull(),
  suggestedPriority: text("suggested_priority").notNull(),
  rootCause: text("root_cause"),
  recommendations: text("recommendations").array().notNull(),
  suggestedResponse: text("suggested_response"), // Legacy field for backwards compatibility
  customerResponse: text("customer_response"),   // Customer-friendly response (OK to send)
  internalNotes: text("internal_notes"),         // Staff-only technical details (NEVER send to customers)
  similarCases: text("similar_cases").array(),
  confidence: integer("confidence").notNull().default(80),
  processingTimeMs: integer("processing_time_ms"),
  modelUsed: text("model_used").default("gpt-4o"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  ticketIdIdx: index("ai_support_insights_ticket_id_idx").on(table.ticketId),
}));

export const insertAiSupportInsightSchema = createInsertSchema(aiSupportInsights).omit({
  id: true,
  createdAt: true,
});

// ===== MOVER PAYOUT SYSTEM (Uber-style) =====

// Mover Stripe Connect accounts for receiving payouts
export const moverStripeAccounts = pgTable("mover_stripe_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moverId: varchar("mover_id").references(() => movers.id).notNull().unique(),
  stripeAccountId: text("stripe_account_id").notNull().unique(),
  accountType: text("account_type").notNull().default("express"), // express, standard, custom
  onboardingStatus: text("onboarding_status").notNull().default("pending"), // pending, in_progress, complete, restricted
  chargesEnabled: boolean("charges_enabled").default(false).notNull(),
  payoutsEnabled: boolean("payouts_enabled").default(false).notNull(),
  detailsSubmitted: boolean("details_submitted").default(false).notNull(),
  requirementsDue: text("requirements_due").array(),
  currentlyDue: text("currently_due").array(),
  defaultCurrency: text("default_currency").default("cad"),
  country: text("country").default("CA"),
  reminderCount: integer("reminder_count").default(0).notNull(),
  lastReminderAt: timestamp("last_reminder_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  moverIdIdx: index("mover_stripe_accounts_mover_id_idx").on(table.moverId),
  stripeAccountIdx: index("mover_stripe_accounts_stripe_account_idx").on(table.stripeAccountId),
}));

// Mover earnings per completed booking
export const moverEarnings = pgTable("mover_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moverId: varchar("mover_id").references(() => movers.id).notNull(),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull().unique(),
  grossAmount: decimal("gross_amount", { precision: 10, scale: 2 }).notNull(), // Total customer paid
  platformFeePercent: decimal("platform_fee_percent", { precision: 5, scale: 2 }).notNull().default("15.00"), // Platform commission %
  platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }).notNull(), // Platform's cut
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }).notNull(), // Mover's earnings
  stripeTransferId: text("stripe_transfer_id"),
  status: text("status").notNull().default("pending"), // pending, available, paid, failed
  availableAt: timestamp("available_at"), // When funds become available for payout
  paidAt: timestamp("paid_at"), // When actually paid out
  payoutId: varchar("payout_id").references(() => moverPayouts.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  moverIdIdx: index("mover_earnings_mover_id_idx").on(table.moverId),
  bookingIdIdx: index("mover_earnings_booking_id_idx").on(table.bookingId),
  statusIdx: index("mover_earnings_status_idx").on(table.status),
}));

// Mover payout history
export const moverPayouts = pgTable("mover_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moverId: varchar("mover_id").references(() => movers.id).notNull(),
  stripePayoutId: text("stripe_payout_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("cad"),
  status: text("status").notNull().default("pending"), // pending, in_transit, paid, failed, canceled
  payoutType: text("payout_type").notNull().default("standard"), // standard, instant
  arrivalDate: timestamp("arrival_date"),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  initiatedAt: timestamp("initiated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  moverIdIdx: index("mover_payouts_mover_id_idx").on(table.moverId),
  statusIdx: index("mover_payouts_status_idx").on(table.status),
  stripePayoutIdx: index("mover_payouts_stripe_payout_idx").on(table.stripePayoutId),
}));

export const insertMoverStripeAccountSchema = createInsertSchema(moverStripeAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMoverEarningsSchema = createInsertSchema(moverEarnings).omit({
  id: true,
  createdAt: true,
});

export const insertMoverPayoutSchema = createInsertSchema(moverPayouts).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertMover = z.infer<typeof insertMoverSchema>;
export type Mover = typeof movers.$inferSelect;
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;
export type InsertJobNotification = z.infer<typeof insertJobNotificationSchema>;
export type JobNotification = typeof jobNotifications.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicketReply = z.infer<typeof insertSupportTicketReplySchema>;
export type SupportTicketReply = typeof supportTicketReplies.$inferSelect;
export type InsertVerificationItem = z.infer<typeof insertVerificationItemSchema>;
export type VerificationItem = typeof verificationItems.$inferSelect;
export type InsertIdentifiedItem = z.infer<typeof insertIdentifiedItemSchema>;
export type IdentifiedItem = typeof identifiedItems.$inferSelect;
export type InsertAiRun = z.infer<typeof insertAiRunSchema>;
export type AiRun = typeof aiRuns.$inferSelect;
export type InsertAiSupportInsight = z.infer<typeof insertAiSupportInsightSchema>;
export type AiSupportInsight = typeof aiSupportInsights.$inferSelect;
export type InsertMoverStripeAccount = z.infer<typeof insertMoverStripeAccountSchema>;
export type MoverStripeAccount = typeof moverStripeAccounts.$inferSelect;
export type InsertMoverEarnings = z.infer<typeof insertMoverEarningsSchema>;
export type MoverEarnings = typeof moverEarnings.$inferSelect;

// ===== LEARNING INTELLIGENCE SYSTEM (Vision Engine™ & PrecisionMatch™) =====

// Vehicle class reference for learning system
// Class A: Small Car (0-15 ft³, $15) - 1-2 boxes
// Class B: Sedan/SUV (15-40 ft³, $20) - Small furniture  
// Class C: Minivan/Cargo Van (40-120 ft³, $30) - Medium moves
// Class D: Full-Size Van (120-250 ft³, $40) - Full apartment
// Class E: Box Truck (250-450+ ft³, $50) - Full home

// Booking metrics - tracks actual vs estimated values after move completion
export const bookingMetrics = pgTable("booking_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull().unique(),
  
  // Estimated values (from AI/system at booking time)
  estimatedVehicleClass: text("estimated_vehicle_class"), // A, B, C, D, E
  estimatedVolumeCuft: decimal("estimated_volume_cuft", { precision: 8, scale: 2 }),
  estimatedWeightKg: decimal("estimated_weight_kg", { precision: 8, scale: 2 }),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  estimatedPrice: decimal("estimated_price", { precision: 10, scale: 2 }),
  
  // Actual values (collected after move)
  actualVehicleClass: text("actual_vehicle_class"), // A, B, C, D, E
  actualVolumeCuft: decimal("actual_volume_cuft", { precision: 8, scale: 2 }),
  actualWeightKg: decimal("actual_weight_kg", { precision: 8, scale: 2 }),
  actualDurationMinutes: integer("actual_duration_minutes"),
  actualPrice: decimal("actual_price", { precision: 10, scale: 2 }),
  
  // Accuracy metrics
  volumeAccuracyPercent: decimal("volume_accuracy_percent", { precision: 5, scale: 2 }),
  priceAccuracyPercent: decimal("price_accuracy_percent", { precision: 5, scale: 2 }),
  vehicleClassMatch: boolean("vehicle_class_match"),
  
  // Customer feedback
  customerSatisfactionRating: integer("customer_satisfaction_rating"), // 1-5
  estimateAccuracyRating: integer("estimate_accuracy_rating"), // 1-5 (how accurate was the quote)
  customerNotes: text("customer_notes"),
  
  // Mover feedback
  moverDifficultyRating: integer("mover_difficulty_rating"), // 1-5
  moverNotes: text("mover_notes"),
  loadingTimeMinutes: integer("loading_time_minutes"),
  unloadingTimeMinutes: integer("unloading_time_minutes"),
  
  // Learning flags
  usedForTraining: boolean("used_for_training").default(false).notNull(),
  outlierFlag: boolean("outlier_flag").default(false).notNull(),
  reviewedByAdmin: boolean("reviewed_by_admin").default(false).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("booking_metrics_booking_id_idx").on(table.bookingId),
  usedForTrainingIdx: index("booking_metrics_training_idx").on(table.usedForTraining),
}));

// Item feedback - corrections to AI-identified items for learning
export const itemFeedback = pgTable("item_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  identifiedItemId: varchar("identified_item_id").references(() => identifiedItems.id).notNull(),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  submittedBy: varchar("submitted_by").references(() => users.id).notNull(),
  submitterRole: text("submitter_role").notNull(), // customer, mover, admin
  
  // Original AI values
  originalItemName: text("original_item_name"),
  originalCategory: text("original_category"),
  originalWeightKg: decimal("original_weight_kg", { precision: 8, scale: 2 }),
  originalVolumeCuft: decimal("original_volume_cuft", { precision: 8, scale: 2 }),
  originalVehicleType: text("original_vehicle_type"),
  
  // Corrected values
  correctedItemName: text("corrected_item_name"),
  correctedCategory: text("corrected_category"),
  correctedWeightKg: decimal("corrected_weight_kg", { precision: 8, scale: 2 }),
  correctedVolumeCuft: decimal("corrected_volume_cuft", { precision: 8, scale: 2 }),
  correctedVehicleType: text("corrected_vehicle_type"),
  
  // Feedback reason
  feedbackReason: text("feedback_reason"), // wrong_item, wrong_size, wrong_category, missing_item, extra_item
  feedbackNotes: text("feedback_notes"),
  
  // Learning status
  processedForLearning: boolean("processed_for_learning").default(false).notNull(),
  processedAt: timestamp("processed_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  identifiedItemIdx: index("item_feedback_identified_item_idx").on(table.identifiedItemId),
  bookingIdIdx: index("item_feedback_booking_id_idx").on(table.bookingId),
  processedIdx: index("item_feedback_processed_idx").on(table.processedForLearning),
}));

// Mover performance metrics for PrecisionMatch™ learning
export const moverPerformance = pgTable("mover_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moverId: varchar("mover_id").references(() => movers.id).notNull(),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  
  // Time performance
  acceptedAt: timestamp("accepted_at"),
  arrivedAtPickupAt: timestamp("arrived_at_pickup_at"),
  loadingStartedAt: timestamp("loading_started_at"),
  loadingCompletedAt: timestamp("loading_completed_at"),
  arrivedAtDropoffAt: timestamp("arrived_at_dropoff_at"),
  unloadingCompletedAt: timestamp("unloading_completed_at"),
  
  // Time deltas (actual vs expected in minutes)
  arrivalDelayMinutes: integer("arrival_delay_minutes"),
  totalMoveMinutes: integer("total_move_minutes"),
  
  // Performance scores
  communicationScore: integer("communication_score"), // 1-5
  professionalismScore: integer("professionalism_score"), // 1-5
  careWithItemsScore: integer("care_with_items_score"), // 1-5
  
  // Load class performance
  loadClass: text("load_class"), // A, B, C, D, E
  distanceKm: decimal("distance_km", { precision: 8, scale: 2 }),
  
  // Issues encountered
  hadIssues: boolean("had_issues").default(false).notNull(),
  issueDescription: text("issue_description"),
  wasRejected: boolean("was_rejected").default(false).notNull(),
  rejectionReason: text("rejection_reason"),
  
  // Matching quality metrics
  wasGoodMatch: boolean("was_good_match"),
  matchScore: decimal("match_score", { precision: 5, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  moverIdIdx: index("mover_performance_mover_id_idx").on(table.moverId),
  bookingIdIdx: index("mover_performance_booking_id_idx").on(table.bookingId),
  loadClassIdx: index("mover_performance_load_class_idx").on(table.loadClass),
}));

// Learning insights - aggregated learning data for Vision Engine & PrecisionMatch
export const learningInsights = pgTable("learning_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  insightType: text("insight_type").notNull(), // vision_accuracy, price_accuracy, vehicle_match, mover_reliability
  
  // Time period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // Metrics
  sampleSize: integer("sample_size").notNull(),
  accuracyPercent: decimal("accuracy_percent", { precision: 5, scale: 2 }),
  avgErrorPercent: decimal("avg_error_percent", { precision: 5, scale: 2 }),
  
  // Breakdown by category
  categoryBreakdown: text("category_breakdown"), // JSON
  vehicleClassBreakdown: text("vehicle_class_breakdown"), // JSON
  
  // Recommendations
  recommendations: text("recommendations").array(),
  adjustmentFactors: text("adjustment_factors"), // JSON with learned weights
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  typeIdx: index("learning_insights_type_idx").on(table.insightType),
  periodIdx: index("learning_insights_period_idx").on(table.periodStart, table.periodEnd),
}));

export const insertBookingMetricsSchema = createInsertSchema(bookingMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  estimatedVehicleClass: z.enum(['A', 'B', 'C', 'D', 'E']).optional(),
  actualVehicleClass: z.enum(['A', 'B', 'C', 'D', 'E']).optional(),
  customerSatisfactionRating: z.number().int().min(1).max(5).optional(),
  estimateAccuracyRating: z.number().int().min(1).max(5).optional(),
  moverDifficultyRating: z.number().int().min(1).max(5).optional(),
});

export const insertItemFeedbackSchema = createInsertSchema(itemFeedback).omit({
  id: true,
  createdAt: true,
  processedAt: true,
}).extend({
  submitterRole: z.enum(['customer', 'mover', 'admin']),
  feedbackReason: z.enum(['wrong_item', 'wrong_size', 'wrong_category', 'missing_item', 'extra_item']).optional(),
  correctedCategory: z.enum(['Furniture', 'Appliance', 'Fragile', 'Oversized', 'Bulky', 'Electronics', 'Other']).optional(),
  correctedVehicleType: z.enum(['car', 'van', 'pickup', 'truck']).optional(),
});

export const insertMoverPerformanceSchema = createInsertSchema(moverPerformance).omit({
  id: true,
  createdAt: true,
}).extend({
  loadClass: z.enum(['A', 'B', 'C', 'D', 'E']).optional(),
  communicationScore: z.number().int().min(1).max(5).optional(),
  professionalismScore: z.number().int().min(1).max(5).optional(),
  careWithItemsScore: z.number().int().min(1).max(5).optional(),
});

export const insertLearningInsightSchema = createInsertSchema(learningInsights).omit({
  id: true,
  createdAt: true,
}).extend({
  insightType: z.enum(['vision_accuracy', 'price_accuracy', 'vehicle_match', 'mover_reliability']),
});

export type InsertBookingMetrics = z.infer<typeof insertBookingMetricsSchema>;
export type BookingMetrics = typeof bookingMetrics.$inferSelect;
export type InsertItemFeedback = z.infer<typeof insertItemFeedbackSchema>;
export type ItemFeedback = typeof itemFeedback.$inferSelect;
export type InsertMoverPerformance = z.infer<typeof insertMoverPerformanceSchema>;
export type MoverPerformance = typeof moverPerformance.$inferSelect;
export type InsertLearningInsight = z.infer<typeof insertLearningInsightSchema>;
export type LearningInsight = typeof learningInsights.$inferSelect;
export type InsertMoverPayout = z.infer<typeof insertMoverPayoutSchema>;
export type MoverPayout = typeof moverPayouts.$inferSelect;

// ===== BOOKING STATUS FLOW =====
// Defines the granular stages of a move for real-time tracking

export const BOOKING_STATUSES = {
  PENDING_PAYMENT: "pending_payment",
  PAYMENT_FAILED: "payment_failed",
  PENDING: "pending",
  CONFIRMED: "confirmed",
  EN_ROUTE_TO_PICKUP: "en_route_to_pickup",
  LOADING: "loading",
  EN_ROUTE_TO_DROPOFF: "en_route_to_dropoff",
  UNLOADING: "unloading",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type BookingStatus = typeof BOOKING_STATUSES[keyof typeof BOOKING_STATUSES];

// Valid status transitions - each status can only move to specific next statuses
export const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BOOKING_STATUSES.PENDING_PAYMENT]: [BOOKING_STATUSES.PENDING, BOOKING_STATUSES.PAYMENT_FAILED, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.PAYMENT_FAILED]: [BOOKING_STATUSES.PENDING_PAYMENT, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.PENDING]: [BOOKING_STATUSES.CONFIRMED, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.CONFIRMED]: [BOOKING_STATUSES.EN_ROUTE_TO_PICKUP, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.EN_ROUTE_TO_PICKUP]: [BOOKING_STATUSES.LOADING, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.LOADING]: [BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF]: [BOOKING_STATUSES.UNLOADING, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.UNLOADING]: [BOOKING_STATUSES.COMPLETED, BOOKING_STATUSES.CANCELLED],
  [BOOKING_STATUSES.COMPLETED]: [],
  [BOOKING_STATUSES.CANCELLED]: [],
};

// Statuses that count as "active" (mover is working on the job)
export const ACTIVE_STATUSES: string[] = [
  BOOKING_STATUSES.CONFIRMED,
  'accepted',
  BOOKING_STATUSES.EN_ROUTE_TO_PICKUP,
  BOOKING_STATUSES.LOADING,
  BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF,
  BOOKING_STATUSES.UNLOADING,
  BOOKING_STATUSES.COMPLETED,
];

// Helper to check if status transition is valid
export function isValidStatusTransition(from: string, to: string): boolean {
  const validTransitions = BOOKING_STATUS_TRANSITIONS[from as BookingStatus];
  return validTransitions?.includes(to as BookingStatus) ?? false;
}

// Get next valid status(es) for a booking
export function getNextValidStatuses(currentStatus: string): BookingStatus[] {
  return BOOKING_STATUS_TRANSITIONS[currentStatus as BookingStatus] || [];
}

// Status display info for UI
export const BOOKING_STATUS_INFO: Record<BookingStatus, { label: string; description: string; color: string }> = {
  [BOOKING_STATUSES.PENDING_PAYMENT]: { 
    label: "Awaiting Payment", 
    description: "Waiting for payment to be processed",
    color: "orange"
  },
  [BOOKING_STATUSES.PAYMENT_FAILED]: { 
    label: "Payment Failed", 
    description: "Payment could not be processed",
    color: "red"
  },
  [BOOKING_STATUSES.PENDING]: { 
    label: "Pending", 
    description: "Waiting for mover assignment",
    color: "yellow"
  },
  [BOOKING_STATUSES.CONFIRMED]: { 
    label: "Confirmed", 
    description: "Mover assigned, waiting to start",
    color: "blue"
  },
  [BOOKING_STATUSES.EN_ROUTE_TO_PICKUP]: { 
    label: "En Route to Pickup", 
    description: "Mover is heading to pickup location",
    color: "orange"
  },
  [BOOKING_STATUSES.LOADING]: { 
    label: "Loading", 
    description: "Mover arrived, loading items",
    color: "purple"
  },
  [BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF]: { 
    label: "En Route to Dropoff", 
    description: "Mover departed with your items",
    color: "indigo"
  },
  [BOOKING_STATUSES.UNLOADING]: { 
    label: "Unloading", 
    description: "Mover arrived at destination, unloading",
    color: "teal"
  },
  [BOOKING_STATUSES.COMPLETED]: { 
    label: "Completed", 
    description: "Move successfully finished",
    color: "green"
  },
  [BOOKING_STATUSES.CANCELLED]: { 
    label: "Cancelled", 
    description: "Move was cancelled",
    color: "red"
  },
};

// Email Campaigns - for admin to send bulk or personal emails
export const emailCampaigns = pgTable("email_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subject: text("subject").notNull(),
  content: text("content").notNull(), // HTML content
  type: text("type").notNull(), // 'account_update' | 'news' | 'promotion' | 'event' | 'personal'
  audienceType: text("audience_type").notNull(), // 'all' | 'customers' | 'movers' | 'specific'
  recipientIds: text("recipient_ids").array(), // specific user IDs if audienceType is 'specific'
  recipientCount: integer("recipient_count").notNull().default(0),
  sentBy: varchar("sent_by").references(() => users.id).notNull(),
  status: text("status").notNull().default("draft"), // 'draft' | 'sending' | 'sent' | 'failed'
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  sentByIdx: index("email_campaigns_sent_by_idx").on(table.sentBy),
  statusIdx: index("email_campaigns_status_idx").on(table.status),
  typeIdx: index("email_campaigns_type_idx").on(table.type),
}));

export const insertEmailCampaignSchema = createInsertSchema(emailCampaigns).omit({
  id: true,
  createdAt: true,
  sentAt: true,
});

export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;

// Email campaign types for UI
export const EMAIL_CAMPAIGN_TYPES = {
  ACCOUNT_UPDATE: "account_update",
  NEWS: "news",
  PROMOTION: "promotion",
  EVENT: "event",
  PERSONAL: "personal",
} as const;

export type EmailCampaignType = typeof EMAIL_CAMPAIGN_TYPES[keyof typeof EMAIL_CAMPAIGN_TYPES];

// ===== ABANDONED BOOKINGS =====
// Track users who started but didn't complete their booking for follow-up reminders

export const abandonedBookings = pgTable("abandoned_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  email: text("email"),
  phone: text("phone"),
  pickupAddress: text("pickup_address"),
  dropoffAddress: text("dropoff_address"),
  loadSize: text("load_size"),
  preferredDate: text("preferred_date"),
  selectedMoverId: varchar("selected_mover_id").references(() => movers.id),
  lastStep: integer("last_step").notNull().default(1),
  reminderSentAt: timestamp("reminder_sent_at"),
  reminderCount: integer("reminder_count").notNull().default(0),
  recovered: boolean("recovered").notNull().default(false),
  recoveredBookingId: varchar("recovered_booking_id").references(() => bookings.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("abandoned_bookings_user_id_idx").on(table.userId),
  emailIdx: index("abandoned_bookings_email_idx").on(table.email),
  recoveredIdx: index("abandoned_bookings_recovered_idx").on(table.recovered),
  createdAtIdx: index("abandoned_bookings_created_at_idx").on(table.createdAt),
}));

export const insertAbandonedBookingSchema = createInsertSchema(abandonedBookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  reminderSentAt: true,
  reminderCount: true,
  recovered: true,
  recoveredBookingId: true,
});

export type InsertAbandonedBooking = z.infer<typeof insertAbandonedBookingSchema>;
export type AbandonedBooking = typeof abandonedBookings.$inferSelect;

// ===== IN-APP NOTIFICATIONS (Inbox) =====
// Unified notification system for customers and movers

export const NOTIFICATION_TYPES = {
  BOOKING_CREATED: "booking_created",
  BOOKING_CONFIRMED: "booking_confirmed",
  BOOKING_STATUS_UPDATE: "booking_status_update",
  BOOKING_CANCELLED: "booking_cancelled",
  BOOKING_COMPLETED: "booking_completed",
  PAYMENT_RECEIVED: "payment_received",
  PAYMENT_FAILED: "payment_failed",
  MOVER_ASSIGNED: "mover_assigned",
  JOB_OPPORTUNITY: "job_opportunity",
  JOB_EXPIRED: "job_expired",
  NEW_MESSAGE: "new_message",
  REVIEW_RECEIVED: "review_received",
  REVIEW_REQUEST: "review_request",
  SUPPORT_TICKET_UPDATE: "support_ticket_update",
  EARNINGS_RECEIVED: "earnings_received",
  PAYOUT_COMPLETED: "payout_completed",
  VERIFICATION_UPDATE: "verification_update",
  SYSTEM_MESSAGE: "system_message",
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

export const inAppNotifications = pgTable("in_app_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // NotificationType
  title: text("title").notNull(),
  message: text("message").notNull(),
  
  // Optional references for navigation
  bookingId: varchar("booking_id").references(() => bookings.id),
  supportTicketId: varchar("support_ticket_id").references(() => supportTickets.id),
  
  // Action link for when user clicks the notification
  actionUrl: text("action_url"),
  
  // Read status
  isRead: boolean("is_read").default(false).notNull(),
  readAt: timestamp("read_at"),
  
  // Metadata for additional context
  metadata: text("metadata"), // JSON string for additional data
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("in_app_notifications_user_id_idx").on(table.userId),
  userReadIdx: index("in_app_notifications_user_read_idx").on(table.userId, table.isRead),
  typeIdx: index("in_app_notifications_type_idx").on(table.type),
  createdAtIdx: index("in_app_notifications_created_at_idx").on(table.createdAt),
}));

export const insertInAppNotificationSchema = createInsertSchema(inAppNotifications).omit({
  id: true,
  createdAt: true,
  readAt: true,
});

export type InsertInAppNotification = z.infer<typeof insertInAppNotificationSchema>;
export type InAppNotification = typeof inAppNotifications.$inferSelect;

// ============================================================
// ANALYTICS EVENTS - lightweight event tracking layer
// ============================================================
export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventName: varchar("event_name", { length: 100 }).notNull(),
  userId: varchar("user_id").references(() => users.id),
  sessionId: varchar("session_id", { length: 100 }),
  page: varchar("page", { length: 200 }),
  properties: jsonb("properties"), // Flexible metadata; queryable at DB level
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  eventNameIdx: index("analytics_events_name_idx").on(table.eventName),
  userIdIdx: index("analytics_events_user_id_idx").on(table.userId),
  createdAtIdx: index("analytics_events_created_at_idx").on(table.createdAt),
}));

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;

// ============================================================
// ENTERPRISE PARTNER PORTAL TABLES
// ============================================================

// Enterprise partner organizations (e.g. OOMovers)
export const partners = pgTable("partners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  legalName: text("legal_name").notNull(),
  operatingName: text("operating_name"),
  status: text("status").notNull().default("invited"), // invited | onboarding | pending_approval | active | suspended
  onboardingStep: integer("onboarding_step").notNull().default(1),
  billingEmail: text("billing_email"),
  primaryOpsContact: text("primary_ops_contact"),   // ops contact name
  primaryOpsEmail: text("primary_ops_email"),        // ops contact email — used for routing notifications
  primaryOpsPhone: text("primary_ops_phone"),        // ops contact phone
  dispatchContact: text("dispatch_contact"),          // dispatch contact name
  escalationContact: text("escalation_contact"),
  address: text("address"),
  phone: text("phone"),
  serviceDescription: text("service_description"),
  // Dispatch configuration
  dispatchMethod: text("dispatch_method").default("manual"), // manual | auto | hybrid
  dispatchPhone: text("dispatch_phone"),
  dispatchEmail: text("dispatch_email"),
  dispatchNotes: text("dispatch_notes"),
  // Onboarding completion flags
  profileComplete: boolean("profile_complete").default(false).notNull(),
  coverageComplete: boolean("coverage_complete").default(false).notNull(),
  complianceComplete: boolean("compliance_complete").default(false).notNull(),
  dispatchComplete: boolean("dispatch_complete").default(false).notNull(),
  termsAccepted: boolean("terms_accepted").default(false).notNull(),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  testBookingComplete: boolean("test_booking_complete").default(false).notNull(),
  // Go-live management
  activatedAt: timestamp("activated_at"),
  activatedBy: varchar("activated_by").references(() => users.id),
  suspendedAt: timestamp("suspended_at"),
  suspendedReason: text("suspended_reason"),
  // Stripe Connect for partner payouts
  stripeAccountId: text("stripe_account_id"),
  stripeConnectStatus: text("stripe_connect_status").default("not_connected"), // not_connected | pending | active | restricted
  stripePayoutsEnabled: boolean("stripe_payouts_enabled").default(false),
  stripeDetailsSubmitted: boolean("stripe_details_submitted").default(false),
  // Per-partner platform fee override (null → falls back to booking or default 15%)
  platformFeePercent: decimal("platform_fee_percent", { precision: 5, scale: 2 }),
  // Branding
  logoUrl: text("logo_url"),
  // Notes from Lervit admin
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("partners_status_idx").on(table.status),
}));

// Links users to partner orgs (partner-scoped roles)
export const partnerUsers = pgTable("partner_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  partnerId: varchar("partner_id").references(() => partners.id).notNull(),
  partnerRole: text("partner_role").notNull().default("partner_viewer"), // partner_admin | partner_dispatcher | partner_ops_manager | partner_viewer
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueUserPartner: unique().on(table.userId, table.partnerId),
  partnerIdIdx: index("partner_users_partner_id_idx").on(table.partnerId),
  userIdIdx: index("partner_users_user_id_idx").on(table.userId),
}));

// Invite tokens for onboarding new partner users
export const partnerInvites = pgTable("partner_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").references(() => partners.id).notNull(),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").notNull().default("partner_admin"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  invitedBy: varchar("invited_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index("partner_invites_token_idx").on(table.token),
  partnerIdIdx: index("partner_invites_partner_id_idx").on(table.partnerId),
}));

// Partner service coverage zones
export const coverageZones = pgTable("coverage_zones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").references(() => partners.id).notNull(),
  zoneName: text("zone_name").notNull(),
  city: text("city").notNull(),
  province: text("province"),
  postalCodePrefixes: text("postal_code_prefixes").array(),
  serviceRadiusKm: integer("service_radius_km"),
  operatingHoursStart: text("operating_hours_start").default("08:00"),
  operatingHoursEnd: text("operating_hours_end").default("18:00"),
  operatingDays: text("operating_days").array(), // ['mon','tue','wed','thu','fri','sat','sun']
  sameDayAvailable: boolean("same_day_available").default(false).notNull(),
  supportedVehicleClasses: text("supported_vehicle_classes").array(),
  supportedLoadSizes: text("supported_load_sizes").array(),
  excludedCategories: text("excluded_categories").array(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  partnerIdIdx: index("coverage_zones_partner_id_idx").on(table.partnerId),
}));

// Partner compliance documents
export const complianceDocs = pgTable("compliance_docs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").references(() => partners.id).notNull(),
  docType: text("doc_type").notNull(), // insurance_certificate | cargo_liability | business_registration | compliance_attestation | vehicle_registration | drivers_abstract
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  expiryDate: timestamp("expiry_date"),
  reviewStatus: text("review_status").notNull().default("pending"), // pending | under_review | approved | rejected
  reviewNotes: text("review_notes"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  partnerIdIdx: index("compliance_docs_partner_id_idx").on(table.partnerId),
  reviewStatusIdx: index("compliance_docs_review_status_idx").on(table.reviewStatus),
}));

// Partner drivers / teams (for assignment to bookings)
export const partnerTeamMembers = pgTable("partner_team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").references(() => partners.id).notNull(),
  name: text("name").notNull(),
  memberType: text("member_type").notNull().default("driver"), // driver | team
  phone: text("phone"),
  vehicleType: text("vehicle_type"),
  vehiclePlate: text("vehicle_plate"),
  vehicleColor: text("vehicle_color"),
  driverPhoto: text("driver_photo"),
  vehiclePhoto: text("vehicle_photo"),
  isAvailable: boolean("is_available").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  partnerIdIdx: index("partner_team_members_partner_id_idx").on(table.partnerId),
}));

// Assignment of partner driver/team to a booking
export const bookingAssignments = pgTable("booking_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  partnerId: varchar("partner_id").references(() => partners.id).notNull(),
  teamMemberId: varchar("team_member_id").references(() => partnerTeamMembers.id),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  teamName: text("team_name"),
  vehicleType: text("vehicle_type"),
  vehiclePlate: text("vehicle_plate"),
  estimatedArrival: timestamp("estimated_arrival"),
  assignedBy: varchar("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  notes: text("notes"),
}, (table) => ({
  bookingIdIdx: index("booking_assignments_booking_id_idx").on(table.bookingId),
  partnerIdIdx: index("booking_assignments_partner_id_idx").on(table.partnerId),
}));

// Enterprise booking status event audit trail
export const bookingStatusEvents = pgTable("booking_status_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  partnerId: varchar("partner_id").references(() => partners.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: varchar("changed_by").references(() => users.id),
  notes: text("notes"),
  customerVisible: boolean("customer_visible").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("booking_status_events_booking_id_idx").on(table.bookingId),
  partnerIdIdx: index("booking_status_events_partner_id_idx").on(table.partnerId),
}));

// Partner-reported incidents during a booking
export const partnerIncidents = pgTable("partner_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  partnerId: varchar("partner_id").references(() => partners.id).notNull(),
  category: text("category").notNull(), // delay | damage | access_issue | customer_complaint | vehicle_issue | weather | other
  severity: text("severity").notNull().default("medium"), // low | medium | high | critical
  status: text("status").notNull().default("open"), // open | under_review | resolved | escalated
  title: text("title").notNull(),
  notes: text("notes").notNull(),
  fileUrls: text("file_urls").array(),
  escalationFlag: boolean("escalation_flag").default(false).notNull(),
  reportedBy: varchar("reported_by").references(() => users.id),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("partner_incidents_booking_id_idx").on(table.bookingId),
  partnerIdIdx: index("partner_incidents_partner_id_idx").on(table.partnerId),
  statusIdx: index("partner_incidents_status_idx").on(table.status),
}));

// Proof of delivery / completion uploads
export const proofOfCompletion = pgTable("proof_of_completion", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  partnerId: varchar("partner_id").references(() => partners.id).notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  fileType: text("file_type"),
  proofType: text("proof_type").notNull().default("photo"), // photo | signature | document
  notes: text("notes"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("proof_of_completion_booking_id_idx").on(table.bookingId),
  partnerIdIdx: index("proof_of_completion_partner_id_idx").on(table.partnerId),
}));

// Partner action audit log
export const partnerAuditLog = pgTable("partner_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").references(() => partners.id).notNull(),
  actorId: varchar("actor_id").references(() => users.id),
  action: text("action").notNull(), // e.g. booking.accepted, profile.updated, compliance.uploaded
  objectType: text("object_type"), // booking | compliance_doc | incident | assignment | partner
  objectId: text("object_id"),
  notes: text("notes"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  partnerIdIdx: index("partner_audit_log_partner_id_idx").on(table.partnerId),
  createdAtIdx: index("partner_audit_log_created_at_idx").on(table.createdAt),
}));

// Admin action audit log. One row per mutating request (POST/PATCH/PUT/DELETE)
// that reaches /api/admin/*. Populated by the adminAudit middleware.
// Kept intentionally minimal (no before/after JSON diffs) — high-value
// admin mutations can additionally emit a business event via emitEvent().
export const adminAuditLog = pgTable("admin_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").references(() => users.id).notNull(),
  method: text("method").notNull(),          // POST | PATCH | PUT | DELETE
  path: text("path").notNull(),              // req.originalUrl (with query stripped)
  resourceType: text("resource_type"),       // parsed from path segment after /api/admin/
  resourceId: text("resource_id"),           // parsed from :id-shaped URL param
  requestBody: text("request_body"),         // JSON string, redacted (password/secret/token/apiKey removed)
  statusCode: integer("status_code"),        // HTTP response status
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  adminIdIdx: index("admin_audit_log_admin_id_idx").on(table.adminId),
  createdAtIdx: index("admin_audit_log_created_at_idx").on(table.createdAt),
  resourceIdx: index("admin_audit_log_resource_idx").on(table.resourceType, table.resourceId),
}));

// === Insert schemas and types ===

export const insertPartnerSchema = createInsertSchema(partners).omit({
  id: true, createdAt: true, updatedAt: true, activatedAt: true, activatedBy: true, suspendedAt: true,
}).extend({
  status: z.enum(['invited', 'onboarding', 'pending_approval', 'active', 'suspended']).optional(),
  dispatchMethod: z.enum(['manual', 'auto', 'hybrid']).optional(),
});

export const insertPartnerUserSchema = createInsertSchema(partnerUsers).omit({
  id: true, createdAt: true,
}).extend({
  partnerRole: z.enum(['partner_admin', 'partner_dispatcher', 'partner_ops_manager', 'partner_viewer']).optional(),
});

export const insertPartnerInviteSchema = createInsertSchema(partnerInvites).omit({
  id: true, createdAt: true, usedAt: true,
}).extend({
  role: z.enum(['partner_admin', 'partner_dispatcher', 'partner_ops_manager', 'partner_viewer']),
});

export const insertCoverageZoneSchema = createInsertSchema(coverageZones).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const insertComplianceDocSchema = createInsertSchema(complianceDocs).omit({
  id: true, createdAt: true, updatedAt: true, reviewedAt: true, reviewedBy: true,
}).extend({
  docType: z.enum(['insurance_certificate', 'cargo_liability', 'business_registration', 'compliance_attestation', 'vehicle_registration', 'drivers_abstract']),
});

export const insertPartnerTeamMemberSchema = createInsertSchema(partnerTeamMembers).omit({
  id: true, createdAt: true,
}).extend({
  memberType: z.enum(['driver', 'team']).optional(),
});

export const insertBookingAssignmentSchema = createInsertSchema(bookingAssignments).omit({
  id: true, assignedAt: true,
});

export const insertBookingStatusEventSchema = createInsertSchema(bookingStatusEvents).omit({
  id: true, createdAt: true,
});

export const insertPartnerIncidentSchema = createInsertSchema(partnerIncidents).omit({
  id: true, createdAt: true, updatedAt: true, resolvedAt: true, resolvedBy: true,
}).extend({
  category: z.enum(['delay', 'damage', 'access_issue', 'customer_complaint', 'vehicle_issue', 'weather', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

export const insertProofOfCompletionSchema = createInsertSchema(proofOfCompletion).omit({
  id: true, uploadedAt: true,
}).extend({
  proofType: z.enum(['photo', 'signature', 'document']).optional(),
});

export const insertPartnerAuditLogSchema = createInsertSchema(partnerAuditLog).omit({
  id: true, createdAt: true,
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLog).omit({
  id: true, createdAt: true,
});

export type Partner = typeof partners.$inferSelect;
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type PartnerUser = typeof partnerUsers.$inferSelect;
export type InsertPartnerUser = z.infer<typeof insertPartnerUserSchema>;
export type PartnerInvite = typeof partnerInvites.$inferSelect;
export type InsertPartnerInvite = z.infer<typeof insertPartnerInviteSchema>;
export type CoverageZone = typeof coverageZones.$inferSelect;
export type InsertCoverageZone = z.infer<typeof insertCoverageZoneSchema>;
export type ComplianceDoc = typeof complianceDocs.$inferSelect;
export type InsertComplianceDoc = z.infer<typeof insertComplianceDocSchema>;
export type PartnerTeamMember = typeof partnerTeamMembers.$inferSelect;
export type InsertPartnerTeamMember = z.infer<typeof insertPartnerTeamMemberSchema>;
export type BookingAssignment = typeof bookingAssignments.$inferSelect;
export type InsertBookingAssignment = z.infer<typeof insertBookingAssignmentSchema>;
export type BookingStatusEvent = typeof bookingStatusEvents.$inferSelect;
export type InsertBookingStatusEvent = z.infer<typeof insertBookingStatusEventSchema>;
export type PartnerIncident = typeof partnerIncidents.$inferSelect;
export type InsertPartnerIncident = z.infer<typeof insertPartnerIncidentSchema>;
export type ProofOfCompletion = typeof proofOfCompletion.$inferSelect;
export type InsertProofOfCompletion = z.infer<typeof insertProofOfCompletionSchema>;
export type PartnerAuditLog = typeof partnerAuditLog.$inferSelect;
export type InsertPartnerAuditLog = z.infer<typeof insertPartnerAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;

// Enterprise status model for partner-handled bookings
export const ENTERPRISE_STATUSES = {
  NEW: 'new',
  UNDER_REVIEW: 'under_review',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  ASSIGNED: 'assigned',
  EN_ROUTE_TO_PICKUP: 'en_route_to_pickup',
  ARRIVED_AT_PICKUP: 'arrived_at_pickup',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'in_transit',
  ARRIVED_AT_DROPOFF: 'arrived_at_dropoff',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  DELAYED: 'delayed',
  ISSUE_REPORTED: 'issue_reported',
  CANCELLED: 'cancelled',
} as const;

export type EnterpriseStatus = typeof ENTERPRISE_STATUSES[keyof typeof ENTERPRISE_STATUSES];

// ─── Admin ↔ Partner Direct Messages ────────────────────────────────────────
export const partnerDirectMessages = pgTable("partner_direct_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").notNull().references(() => partners.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  senderRole: text("sender_role").notNull(), // 'admin' | 'partner'
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
});

// ─── Partner Payouts (mirrors mover payout tables) ──────────────────────────
// Per-completed-booking partner earnings row. Populated by recordPartnerEarnings
// at booking completion; transitions pending → paid (or failed) when a Stripe
// transfer succeeds. The booking_id unique constraint makes the insert idempotent
// on retry — subsequent calls UPDATE the existing row in place.
export const partnerEarnings = pgTable("partner_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").notNull().references(() => partners.id),
  bookingId: varchar("booking_id").notNull().unique().references(() => bookings.id),
  grossAmount: decimal("gross_amount", { precision: 10, scale: 2 }).notNull(),
  platformFeePercent: decimal("platform_fee_percent", { precision: 5, scale: 2 }).notNull().default("15.00"),
  platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }).notNull(),
  partnerNetAmount: decimal("partner_net_amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("cad"),
  stripeTransferId: text("stripe_transfer_id"),
  status: text("status").notNull().default("pending"), // pending | processing | paid | failed
  paidAt: timestamp("paid_at"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  partnerIdIdx: index("partner_earnings_partner_id_idx").on(table.partnerId),
  bookingIdIdx: index("partner_earnings_booking_id_idx").on(table.bookingId),
  statusIdx: index("partner_earnings_status_idx").on(table.status),
}));

// Batch-payout envelope for future settlement flows. Not populated by the
// current per-transfer path; reserved for admin batch-payout endpoints.
export const partnerPayouts = pgTable("partner_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").notNull().references(() => partners.id),
  stripePayoutId: text("stripe_payout_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("cad"),
  status: text("status").notNull().default("pending"), // pending | in_transit | paid | failed | canceled
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  bookingCount: integer("booking_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  partnerIdIdx: index("partner_payouts_partner_id_idx").on(table.partnerId),
  statusIdx: index("partner_payouts_status_idx").on(table.status),
}));

// ─── Stripe Webhook Event Dedup ─────────────────────────────────────────────
// Primary key = Stripe event id. INSERT ... ON CONFLICT DO NOTHING at the top
// of the webhook handler; if 0 rows affected, the event was already seen and
// we short-circuit. Best-effort dedup — a crash between insert and processing
// loses the event. Sufficient hardening for two-transfer-paths blast radius.
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
}, (table) => ({
  typeIdx: index("stripe_webhook_events_type_idx").on(table.type),
  receivedAtIdx: index("stripe_webhook_events_received_at_idx").on(table.receivedAt),
}));

export const ENTERPRISE_STATUS_TRANSITIONS: Record<string, string[]> = {
  new: ['under_review', 'accepted', 'rejected', 'cancelled'],
  under_review: ['accepted', 'rejected', 'cancelled'],
  accepted: ['assigned', 'en_route_to_pickup', 'cancelled'],
  assigned: ['en_route_to_pickup', 'delayed', 'issue_reported', 'cancelled'],
  en_route_to_pickup: ['arrived_at_pickup', 'delayed', 'issue_reported', 'cancelled'],
  arrived_at_pickup: ['picked_up', 'delayed', 'issue_reported'],
  picked_up: ['in_transit', 'issue_reported'],
  in_transit: ['arrived_at_dropoff', 'delayed', 'issue_reported'],
  arrived_at_dropoff: ['delivered', 'issue_reported'],
  delivered: ['completed'],
  delayed: ['en_route_to_pickup', 'arrived_at_pickup', 'in_transit', 'arrived_at_dropoff', 'issue_reported', 'cancelled'],
  issue_reported: ['en_route_to_pickup', 'arrived_at_pickup', 'in_transit', 'completed', 'cancelled'],
};

// Maps enterprise status → customer-visible booking status
export const ENTERPRISE_TO_BOOKING_STATUS: Record<string, string> = {
  new: 'confirmed',
  under_review: 'confirmed',
  accepted: 'accepted',
  assigned: 'assigned',
  en_route_to_pickup: 'en_route_to_pickup',
  arrived_at_pickup: 'loading',
  picked_up: 'loading',
  in_transit: 'en_route_to_dropoff',
  arrived_at_dropoff: 'unloading',
  delivered: 'unloading',
  completed: 'completed',
  cancelled: 'cancelled',
};

// Saved addresses for quick booking selection
export const savedAddresses = pgTable("saved_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  label: text("label").notNull(),
  address: text("address").notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userLabelUniq: unique("saved_addresses_user_label_uniq").on(table.userId, table.label),
  userIdIdx: index("saved_addresses_user_id_idx").on(table.userId),
}));

export const insertSavedAddressSchema = createInsertSchema(savedAddresses).omit({ id: true, createdAt: true });
export type InsertSavedAddress = z.infer<typeof insertSavedAddressSchema>;

// Post-move feedback surveys
export const feedbackSurveys = pgTable("feedback_surveys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull().unique(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  npsScore: integer("nps_score").notNull(),
  easeRating: integer("ease_rating").notNull(),
  moverRating: integer("mover_rating").notNull(),
  comments: text("comments"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("feedback_surveys_booking_id_idx").on(table.bookingId),
  userIdIdx: index("feedback_surveys_user_id_idx").on(table.userId),
}));

export const insertFeedbackSurveySchema = createInsertSchema(feedbackSurveys).omit({ id: true, submittedAt: true });
export type InsertFeedbackSurvey = z.infer<typeof insertFeedbackSurveySchema>;

// Mover availability calendar
export const moverAvailability = pgTable("mover_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  availableDate: date("available_date").notNull(),
  startTime: time("start_time"),
  endTime: time("end_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userDateUniq: unique("mover_availability_user_date_uniq").on(table.userId, table.availableDate),
  userIdIdx: index("mover_availability_user_id_idx").on(table.userId),
  dateIdx: index("mover_availability_date_idx").on(table.availableDate),
}));

export const insertMoverAvailabilitySchema = createInsertSchema(moverAvailability).omit({ id: true, createdAt: true });
export type InsertMoverAvailability = z.infer<typeof insertMoverAvailabilitySchema>;
export type MoverAvailabilityDay = typeof moverAvailability.$inferSelect;

// Referral program
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").references(() => users.id).notNull(),
  referredId: varchar("referred_id").references(() => users.id).notNull().unique(),
  code: varchar("code", { length: 6 }).notNull(),
  creditAwarded: boolean("credit_awarded").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  referrerIdIdx: index("referrals_referrer_id_idx").on(table.referrerId),
  codeIdx: index("referrals_code_idx").on(table.code),
}));

export const insertReferralSchema = createInsertSchema(referrals).omit({ id: true, createdAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;

// AI-generated insights for partner incidents
export const aiIncidentInsights = pgTable("ai_incident_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  incidentId: varchar("incident_id").references(() => partnerIncidents.id).notNull(),
  summary: text("summary").notNull(),
  severity_assessment: text("severity_assessment").notNull(),
  rootCause: text("root_cause"),
  recommendations: text("recommendations").array().notNull(),
  partnerCommunication: text("partner_communication"),
  internalNotes: text("internal_notes"),
  escalationAdvice: text("escalation_advice"),
  confidence: integer("confidence").notNull().default(80),
  processingTimeMs: integer("processing_time_ms"),
  modelUsed: text("model_used").default("gpt-4o"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  incidentIdIdx: index("ai_incident_insights_incident_id_idx").on(table.incidentId),
}));

// ===== TELNYX ADMIN VOICE CENTER =====
// Credentials are deliberately never stored here. A profile only controls
// routing/presence policy for an authenticated administrator.
export const adminVoiceProfiles = pgTable("admin_voice_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  displayName: text("display_name"),
  callerIdNumber: text("caller_id_number"),
  // On-demand Telnyx credential identifier only; never store SIP username/password.
  telnyxCredentialId: text("telnyx_credential_id").unique(),
  telnyxSipUsername: text("telnyx_sip_username").unique(),
  telnyxCredentialExpiresAt: timestamp("telnyx_credential_expires_at"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  enabledIdx: index("admin_voice_profiles_enabled_idx").on(table.enabled),
}));

export const adminVoicePresence = pgTable("admin_voice_presence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  status: text("status").notNull().default("offline"), // offline | available | busy | away
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("admin_voice_presence_status_idx").on(table.status),
}));

export const voiceCalls = pgTable("voice_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  telnyxCallControlId: text("telnyx_call_control_id").unique(),
  telnyxCallLegId: text("telnyx_call_leg_id").unique(),
  direction: text("direction").notNull(), // inbound | outbound
  status: text("status").notNull().default("initiated"),
  fromNumber: text("from_number").notNull(),
  toNumber: text("to_number").notNull(),
  adminId: varchar("admin_id").references(() => users.id),
  matchedUserId: varchar("matched_user_id").references(() => users.id),
  bookingId: varchar("booking_id").references(() => bookings.id),
  startedAt: timestamp("started_at"),
  answeredAt: timestamp("answered_at"),
  endedAt: timestamp("ended_at"),
  missedAt: timestamp("missed_at"),
  durationSeconds: integer("duration_seconds"),
  recordingRequestedAt: timestamp("recording_requested_at"),
  routingState: text("routing_state").notNull().default("pending"),
  routingDeadlineAt: timestamp("routing_deadline_at"),
  routingLeaseUntil: timestamp("routing_lease_until"),
  fallbackRequestedAt: timestamp("fallback_requested_at"),
  lastEventAt: timestamp("last_event_at"),
  metadata: text("metadata"),
  clientState: text("client_state").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  controlIdx: index("voice_calls_control_idx").on(table.telnyxCallControlId),
  adminCreatedIdx: index("voice_calls_admin_created_idx").on(table.adminId, table.createdAt),
  bookingIdx: index("voice_calls_booking_idx").on(table.bookingId),
  phoneIdx: index("voice_calls_phone_idx").on(table.fromNumber, table.toNumber),
}));

// One inbound parent call can fan out to several private WebRTC/SIP agent legs.
// This preserves an audit trail and makes winner selection safe under concurrent webhooks.
export const voiceCallAttempts = pgTable("voice_call_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callId: varchar("call_id").references(() => voiceCalls.id).notNull(),
  adminId: varchar("admin_id").references(() => users.id).notNull(),
  telnyxCallControlId: text("telnyx_call_control_id").unique(),
  telnyxCallLegId: text("telnyx_call_leg_id").unique(),
  clientState: text("client_state").notNull().unique(),
  status: text("status").notNull().default("ringing"),
  expiresAt: timestamp("expires_at"),
  answeredAt: timestamp("answered_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  callIdx: index("voice_call_attempts_call_idx").on(table.callId),
  adminStatusIdx: index("voice_call_attempts_admin_status_idx").on(table.adminId, table.status),
  callAdminUnique: unique("voice_call_attempts_call_admin_uniq").on(table.callId, table.adminId),
}));

export const voiceWebhookEvents = pgTable("voice_webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  telnyxEventId: text("telnyx_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  callId: varchar("call_id").references(() => voiceCalls.id),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
  leaseUntil: timestamp("lease_until"),
  lastError: text("last_error"),
  payload: text("payload").notNull(),
  processingError: text("processing_error"),
}, (table) => ({
  callIdx: index("voice_webhook_events_call_idx").on(table.callId),
  typeReceivedIdx: index("voice_webhook_events_type_received_idx").on(table.eventType, table.receivedAt),
}));

export const voiceTransfers = pgTable("voice_transfers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callId: varchar("call_id").references(() => voiceCalls.id).notNull(),
  initiatedByAdminId: varchar("initiated_by_admin_id").references(() => users.id).notNull(),
  targetAdminId: varchar("target_admin_id").references(() => users.id),
  targetNumber: text("target_number"),
  status: text("status").notNull().default("requested"),
  telnyxCommandId: text("telnyx_command_id"),
  dialLeaseUntil: timestamp("dial_lease_until"),
  requestId: text("request_id").unique(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  callIdx: index("voice_transfers_call_idx").on(table.callId),
  activeTargetIdx: index("voice_transfers_active_target_idx").on(table.callId, table.targetAdminId, table.status),
  dialLeaseIdx: index("voice_transfers_dial_lease_idx").on(table.status, table.dialLeaseUntil),
}));

export const voiceMedia = pgTable("voice_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callId: varchar("call_id").references(() => voiceCalls.id).notNull(),
  kind: text("kind").notNull(), // recording | voicemail
  telnyxRecordingId: text("telnyx_recording_id").unique(),
  storageUrl: text("storage_url"),
  privateObjectKey: text("private_object_key").unique(),
  storageStatus: text("storage_status").notNull().default("pending"), // pending | stored | retry
  archiveAttemptCount: integer("archive_attempt_count").notNull().default(0),
  archiveNextAttemptAt: timestamp("archive_next_attempt_at").defaultNow().notNull(),
  archiveLastError: text("archive_last_error"),
  archiveLeaseUntil: timestamp("archive_lease_until"),
  contentType: text("content_type"),
  durationSeconds: integer("duration_seconds"),
  transcription: text("transcription"),
  availableAt: timestamp("available_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  callIdx: index("voice_media_call_idx").on(table.callId),
}));

export type AdminVoiceProfile = typeof adminVoiceProfiles.$inferSelect;
export type AdminVoicePresence = typeof adminVoicePresence.$inferSelect;
export type VoiceCall = typeof voiceCalls.$inferSelect;
export type VoiceWebhookEvent = typeof voiceWebhookEvents.$inferSelect;
export type VoiceTransfer = typeof voiceTransfers.$inferSelect;
export type VoiceMedia = typeof voiceMedia.$inferSelect;
export type VoiceCallAttempt = typeof voiceCallAttempts.$inferSelect;

// ============================================================
// AGENT-READY OPERATIONAL INTELLIGENCE FOUNDATION
// Migration: 0010_agent_foundation.sql
// ============================================================

// a) agent_logs — every agent action recorded
export const agentLogs = pgTable("agent_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentName: text("agent_name").notNull(),
  agentCode: text("agent_code").notNull(),
  action: text("action").notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  status: text("status").notNull().default("success"), // 'success' | 'failure' | 'skipped'
  durationMs: integer("duration_ms"),
  tokensUsed: integer("tokens_used"),
  costUsd: decimal("cost_usd", { precision: 10, scale: 6 }),
  bookingId: varchar("booking_id").references(() => bookings.id),
  moverId: varchar("mover_id").references(() => movers.id),
  partnerId: varchar("partner_id"),
  leadId: varchar("lead_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  agentCodeIdx: index("agent_logs_agent_code_idx").on(table.agentCode),
  statusIdx: index("agent_logs_status_idx").on(table.status),
  createdAtIdx: index("agent_logs_created_at_idx").on(table.createdAt),
  bookingIdIdx: index("agent_logs_booking_id_idx").on(table.bookingId),
  moverIdIdx: index("agent_logs_mover_id_idx").on(table.moverId),
}));

// b) agent_decisions — reasoned decisions + escalation trail
export const agentDecisions = pgTable("agent_decisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentName: text("agent_name").notNull(),
  decisionType: text("decision_type").notNull(),
  reasoning: text("reasoning"),
  outcome: text("outcome"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  escalatedToHuman: boolean("escalated_to_human").notNull().default(false),
  escalatedAt: timestamp("escalated_at"),
  resolvedAt: timestamp("resolved_at"),
  bookingId: varchar("booking_id").references(() => bookings.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  agentNameIdx: index("agent_decisions_agent_name_idx").on(table.agentName),
  escalatedIdx: index("agent_decisions_escalated_idx").on(table.escalatedToHuman),
  createdAtIdx: index("agent_decisions_created_at_idx").on(table.createdAt),
}));

// c) leads — pre-booking pipeline
export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  // 'kijiji' | 'google' | 'referral' | 'inbound' | 'phone' | 'social' | 'direct'
  sourceChannel: text("source_channel"),
  utmSource: text("utm_source"),
  utmCampaign: text("utm_campaign"),
  utmMedium: text("utm_medium"),
  landingPage: text("landing_page"),
  intentScore: integer("intent_score").notNull().default(0),
  // 'new' | 'contacted' | 'qualified' | 'converted' | 'cold' | 'lost'
  status: text("status").notNull().default("new"),
  touchpoints: integer("touchpoints").notNull().default(0),
  lastTouchedAt: timestamp("last_touched_at"),
  convertedBookingId: varchar("converted_booking_id").references(() => bookings.id),
  assignedAgent: text("assigned_agent"),
  notes: text("notes"),
  // CASL/CTIA evidence of express SMS consent. Stamped by the capture
  // handlers when the lead submits a form that showed the disclosure, with a
  // verbatim copy of the language they saw — the wording changes over time,
  // so the source list alone can't prove what was agreed to.
  smsConsentAt: timestamp("sms_consent_at"),
  smsConsentText: text("sms_consent_text"),
  // B2B sales pipeline (Sam Carter — SALES). All nullable so existing rows
  // stay valid; leadType defaults to 'b2c' to keep existing rows classified.
  companyName: text("company_name"),
  leadType: text("lead_type").notNull().default("b2c").$type<'b2c' | 'b2bm' | 'b2bp'>(), // b2c | b2bm (individual mover candidate) | b2bp (B2B fleet partner) — DB CHECK constraint enforces this set (migrations/0018_lead_type_check.sql)
  industry: text("industry"),                                          // 'real_estate' | 'property_management' | 'corporate' | 'university' | 'insurance' | 'moving_company' | 'other'
  dealStage: text("deal_stage").default("prospect"),                   // 'prospect' | 'contacted' | 'warm' | 'meeting' | 'closed' | 'lost'
  estimatedMonthlyMoves: integer("estimated_monthly_moves"),
  lastContactedAt: timestamp("last_contacted_at"),                     // Sam-specific touch timestamp (distinct from lastTouchedAt which Alex/Riley/Kai also use)
  // Anonymous quote captured before contact — see `quotes` table below.
  quoteId: varchar("quote_id").references((): any => quotes.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("leads_status_idx").on(table.status),
  sourceChannelIdx: index("leads_source_channel_idx").on(table.sourceChannel),
  createdAtIdx: index("leads_created_at_idx").on(table.createdAt),
  phoneIdx: index("leads_contact_phone_idx").on(table.contactPhone),
  emailIdx: index("leads_contact_email_idx").on(table.contactEmail),
  leadTypeIdx: index("leads_lead_type_idx").on(table.leadType),
  dealStageIdx: index("leads_deal_stage_idx").on(table.dealStage),
}));

// Anonymous quote persistence. Captured from the /request-move quote overlay
// before contact details are collected. Linked back to a lead once the
// visitor submits their name/phone/email, and to a booking on checkout.
// Quote IDs are prefixed with 'q_' for readability in URLs like /quote/q_...
export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`'q_' || gen_random_uuid()::text`),
  // Short base62 slug used for SMS-friendly quote URLs (/q/:shortId).
  // Nullable so pre-existing quotes remain valid.
  shortId: text("short_id").unique(),
  // Route
  pickupAddress: text("pickup_address").notNull(),
  dropoffAddress: text("dropoff_address"),
  // Geocoded coordinates. Persisted so /quote/:id links restore full precision
  // (address strings alone can't re-populate autocomplete geometry).
  pickupLat: decimal("pickup_lat", { precision: 10, scale: 7 }),
  pickupLng: decimal("pickup_lng", { precision: 10, scale: 7 }),
  dropoffLat: decimal("dropoff_lat", { precision: 10, scale: 7 }),
  dropoffLng: decimal("dropoff_lng", { precision: 10, scale: 7 }),
  distanceKm: decimal("distance_km", { precision: 8, scale: 2 }),
  // Load details
  loadSize: text("load_size"),
  itemsJson: jsonb("items_json"),
  vehicleType: text("vehicle_type"),
  numberOfMovers: integer("number_of_movers").default(1),
  // Price breakdown
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }),
  baseFee: decimal("base_fee", { precision: 10, scale: 2 }),
  distanceFee: decimal("distance_fee", { precision: 10, scale: 2 }),
  loadFee: decimal("load_fee", { precision: 10, scale: 2 }),
  // Relationships (populated lazily as the funnel advances)
  leadId: varchar("lead_id").references((): any => leads.id),
  bookingId: varchar("booking_id").references((): any => bookings.id),
  // Lifecycle: 'pending' → 'viewed' → 'booked' | 'expired'
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("quotes_status_idx").on(table.status),
  leadIdIdx: index("quotes_lead_id_idx").on(table.leadId),
  bookingIdIdx: index("quotes_booking_id_idx").on(table.bookingId),
  createdAtIdx: index("quotes_created_at_idx").on(table.createdAt),
}));

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;

// d) kpi_targets — revenue / retention / conversion goals
export const kpiTargets = pgTable("kpi_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricName: text("metric_name").notNull(),
  targetValue: decimal("target_value", { precision: 14, scale: 2 }).notNull(),
  period: text("period").notNull(), // 'daily' | 'weekly' | 'monthly'
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  metricNameIdx: index("kpi_targets_metric_name_idx").on(table.metricName),
  periodIdx: index("kpi_targets_period_idx").on(table.period),
}));

// e) business_events — unified event log agents poll with a cursor
export const businessEvents = pgTable("business_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(),
  // 'booking' | 'mover' | 'customer' | 'partner' | 'payment' | 'lead' | 'agent'
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  payload: jsonb("payload"),
  source: text("source").notNull().default("system"), // 'system' | 'webhook' | 'agent' | 'admin'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  eventTypeIdx: index("business_events_event_type_idx").on(table.eventType),
  entityIdx: index("business_events_entity_idx").on(table.entityType, table.entityId),
  createdAtIdx: index("business_events_created_at_idx").on(table.createdAt),
}));

// f) mover_activity_log — RETAIN inactivity + trend detection
export const moverActivityLog = pgTable("mover_activity_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moverId: varchar("mover_id").references(() => movers.id).notNull(),
  // 'job_completed' | 'job_declined' | 'went_online' | 'went_offline' | 'location_update' | 'login' | 'rollup'
  activityType: text("activity_type").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  moverIdIdx: index("mover_activity_log_mover_id_idx").on(table.moverId),
  activityTypeIdx: index("mover_activity_log_activity_type_idx").on(table.activityType),
  createdAtIdx: index("mover_activity_log_created_at_idx").on(table.createdAt),
}));

// g) zone_demand_log — DISPATCH supply/demand time-series
export const zoneDemandLog = pgTable("zone_demand_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  zoneName: text("zone_name").notNull(),
  city: text("city"),
  province: text("province"),
  date: date("date").notNull(),
  hour: integer("hour").notNull(),
  demandCount: integer("demand_count").notNull().default(0),
  supplyCount: integer("supply_count").notNull().default(0),
  ratio: decimal("ratio", { precision: 8, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  zoneIdx: index("zone_demand_log_zone_idx").on(table.zoneName),
  dateHourIdx: index("zone_demand_log_date_hour_idx").on(table.date, table.hour),
}));

export const insertAgentLogSchema = createInsertSchema(agentLogs).omit({ id: true, createdAt: true });
export const insertAgentDecisionSchema = createInsertSchema(agentDecisions).omit({ id: true, createdAt: true });
export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, createdAt: true, updatedAt: true });
export const insertKpiTargetSchema = createInsertSchema(kpiTargets).omit({ id: true, createdAt: true });
export const insertBusinessEventSchema = createInsertSchema(businessEvents).omit({ id: true, createdAt: true });
export const insertMoverActivityLogSchema = createInsertSchema(moverActivityLog).omit({ id: true, createdAt: true });
export const insertZoneDemandLogSchema = createInsertSchema(zoneDemandLog).omit({ id: true, createdAt: true });

export type AgentLog = typeof agentLogs.$inferSelect;
export type InsertAgentLog = z.infer<typeof insertAgentLogSchema>;
export type AgentDecision = typeof agentDecisions.$inferSelect;
export type InsertAgentDecision = z.infer<typeof insertAgentDecisionSchema>;
export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type KpiTarget = typeof kpiTargets.$inferSelect;
export type InsertKpiTarget = z.infer<typeof insertKpiTargetSchema>;
export type BusinessEvent = typeof businessEvents.$inferSelect;
export type InsertBusinessEvent = z.infer<typeof insertBusinessEventSchema>;
export type MoverActivityLog = typeof moverActivityLog.$inferSelect;
export type InsertMoverActivityLog = z.infer<typeof insertMoverActivityLogSchema>;
export type ZoneDemandLog = typeof zoneDemandLog.$inferSelect;
export type InsertZoneDemandLog = z.infer<typeof insertZoneDemandLogSchema>;

// ============================================================
// EMBER LANE (MAGNET) — content & marketing
// Migration: 0013_ember_content.sql
// ============================================================

export const blogPosts = pgTable("blog_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  category: text("category"),
  tags: text("tags").array(),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at"),
  generatedBy: text("generated_by").default("ember"),
  // Structured fields consumed by lervit.com/blog (BlogPage.tsx). See migration 0014.
  sections: jsonb("sections").$type<{ h2: string; paragraphs: string[] }[]>(),
  faq: jsonb("faq").$type<{ q: string; a: string }[]>(),
  topCta: jsonb("top_cta").$type<{ text: string; href: string }>(),
  bottomCta: jsonb("bottom_cta").$type<{ text: string; sub: string; href: string }>(),
  related: text("related").array(),
  image: text("image"),
  readTime: text("read_time"),
  oldPath: text("old_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("blog_posts_status_idx").on(table.status),
  slugIdx: index("blog_posts_slug_idx").on(table.slug),
}));

export const gmbPosts = pgTable("gmb_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  postType: text("post_type").default("STANDARD"),
  status: text("status").default("pending"),
  gmbPostId: text("gmb_post_id"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const socialPosts = pgTable("social_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  platform: text("platform").notNull(), // facebook | instagram | tiktok | linkedin
  content: text("content").notNull(),
  hashtags: text("hashtags").array(),
  status: text("status").default("draft"), // draft | approved | posted
  approvedBy: text("approved_by"),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  platformIdx: index("social_posts_platform_idx").on(table.platform),
}));

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGmbPostSchema = createInsertSchema(gmbPosts).omit({ id: true, createdAt: true });
export const insertSocialPostSchema = createInsertSchema(socialPosts).omit({ id: true, createdAt: true });

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;
export type GmbPost = typeof gmbPosts.$inferSelect;
export type InsertGmbPost = z.infer<typeof insertGmbPostSchema>;
export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;

// ============================================================
// EMBER PHASE 2 — campaigns + content items (video, cross-channel)
// Migration: 0015_campaigns.sql
// ============================================================

export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  objective: text("objective").notNull(),
  audience: text("audience").notNull(),
  offer: text("offer"),
  platforms: text("platforms").array(),
  durationDays: integer("duration_days").default(30),
  status: text("status").default("draft"), // draft | active | completed | paused
  contentPlan: jsonb("content_plan"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdBy: text("created_by").default("ember"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("idx_campaigns_status").on(table.status),
}));

export const contentItems = pgTable("content_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id),
  type: text("type").notNull(), // blog | social | heygen_video | higgsfield_video | newsletter | gmb
  objective: text("objective"),
  platform: text("platform"),
  status: text("status").default("draft"), // draft | generating | qa | approved | published | failed
  script: text("script"),
  creativeBrief: jsonb("creative_brief"),
  caption: text("caption"),
  hashtags: text("hashtags").array(),
  cta: text("cta"),
  aspectRatio: text("aspect_ratio"),
  generator: text("generator"), // heygen | higgsfield | ember | manual
  providerJobId: text("provider_job_id"),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  assetUrl: text("asset_url"),
  qaResults: jsonb("qa_results"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  publishedAt: timestamp("published_at"),
  costEstimate: text("cost_estimate"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  campaignIdx: index("idx_content_items_campaign").on(table.campaignId),
  statusIdx: index("idx_content_items_status").on(table.status),
}));

export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContentItemSchema = createInsertSchema(contentItems).omit({ id: true, createdAt: true, updatedAt: true });

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type ContentItem = typeof contentItems.$inferSelect;
export type InsertContentItem = z.infer<typeof insertContentItemSchema>;

// ─── Reid Calloway (DOCOPS) — document audit + irregularity tracking ───

export const documentAudits = pgTable("document_audits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moverId: varchar("mover_id").references(() => movers.id).notNull(),
  verificationItemId: varchar("verification_item_id"),
  documentType: text("document_type").notNull(),
  documentUrl: text("document_url"),
  status: text("status").default("pending_review"),
  irregularityScore: integer("irregularity_score").default(0),
  irregularities: jsonb("irregularities"),
  checksRun: jsonb("checks_run"),
  auditedBy: text("audited_by").default("reid"),
  reviewedBy: text("reviewed_by"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  clarificationRequested: timestamp("clarification_requested"),
  clarificationReceived: timestamp("clarification_received"),
  escalatedAt: timestamp("escalated_at"),
  escalationReason: text("escalation_reason"),
  notes: text("notes"),
  kpiData: jsonb("kpi_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  moverIdx: index("idx_doc_audits_mover").on(table.moverId),
  statusIdx: index("idx_doc_audits_status").on(table.status),
  verificationItemIdx: index("idx_doc_audits_verification_item").on(table.verificationItemId),
}));

export const documentIrregularities = pgTable("document_irregularities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditId: varchar("audit_id").references(() => documentAudits.id),
  moverId: varchar("mover_id").notNull(),
  checkName: text("check_name").notNull(),
  result: text("result").notNull(),
  severity: text("severity").notNull(),
  details: text("details"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  auditIdx: index("idx_doc_irregularities_audit").on(table.auditId),
}));

export type DocumentAudit = typeof documentAudits.$inferSelect;
export type InsertDocumentAudit = typeof documentAudits.$inferInsert;
export type DocumentIrregularity = typeof documentIrregularities.$inferSelect;
export type InsertDocumentIrregularity = typeof documentIrregularities.$inferInsert;

// Nova cross-channel identity mapping. One row per known customer; every
// channel handle they've been reached on lives on the same row so a
// customer who DMs on Instagram and later texts us gets identified as the
// same person once contact info is collected. Channel columns are nullable
// and independently indexed. `last_channel` records the most recent
// touchpoint so Nova can prefer that channel on outbound replies.
export const messengerIdentities = pgTable("messenger_identities", {
  id: varchar("id").primaryKey().default(sql`'mid_' || gen_random_uuid()::text`),
  userId: varchar("user_id").references(() => users.id),
  name: text("name"),
  phone: text("phone"),
  email: text("email"),
  // Per-channel handles — nullable, indexed individually.
  instagramSenderId: text("instagram_sender_id"),
  messengerSenderId: text("messenger_sender_id"),
  whatsappPhone: text("whatsapp_phone"),
  tiktokUserId: text("tiktok_user_id"),
  lastChannel: text("last_channel"),           // 'messenger' | 'instagram' | 'whatsapp' | 'tiktok' | 'voice' | 'sms'
  isResolved: boolean("is_resolved").notNull().default(false),
  isReturnCustomer: boolean("is_return_customer").notNull().default(false),
  totalMessages: integer("total_messages").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),             // 'auto_dm' | 'admin' | agent code
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("messenger_identities_user_id_idx").on(table.userId),
  instagramIdx: index("messenger_identities_instagram_idx").on(table.instagramSenderId),
  messengerIdx: index("messenger_identities_messenger_idx").on(table.messengerSenderId),
  whatsappIdx: index("messenger_identities_whatsapp_idx").on(table.whatsappPhone),
  tiktokIdx: index("messenger_identities_tiktok_idx").on(table.tiktokUserId),
  phoneIdx: index("messenger_identities_phone_idx").on(table.phone),
  emailIdx: index("messenger_identities_email_idx").on(table.email),
}));

export type MessengerIdentity = typeof messengerIdentities.$inferSelect;
export type InsertMessengerIdentity = typeof messengerIdentities.$inferInsert;
