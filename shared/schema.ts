import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, boolean, doublePrecision, unique, index } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  isAvailable: boolean("is_available").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("movers_user_id_idx").on(table.userId),
  availabilityIdx: index("movers_availability_idx").on(table.isAvailable),
}));

export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => users.id).notNull(),
  moverId: varchar("mover_id").references(() => movers.id),
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
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  customerIdIdx: index("bookings_customer_id_idx").on(table.customerId),
  moverIdIdx: index("bookings_mover_id_idx").on(table.moverId),
  statusIdx: index("bookings_status_idx").on(table.status),
  paymentStatusIdx: index("bookings_payment_status_idx").on(table.paymentStatus),
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
  moverId: varchar("mover_id").references(() => movers.id).notNull(),
  customerId: varchar("customer_id").references(() => users.id).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  moverIdIdx: index("reviews_mover_id_idx").on(table.moverId),
  bookingIdIdx: index("reviews_booking_id_idx").on(table.bookingId),
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
  // boxes: 1-10 ft³, medium: 11-50 ft³, large: 50-170 ft³, apartment: 170+ ft³
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
  handlingComplexity: z.enum(['low', 'medium', 'high', 'very_high']).optional(),
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
export type InsertMoverPayout = z.infer<typeof insertMoverPayoutSchema>;
export type MoverPayout = typeof moverPayouts.$inferSelect;

// ===== BOOKING STATUS FLOW =====
// Defines the granular stages of a move for real-time tracking

export const BOOKING_STATUSES = {
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
export const ACTIVE_STATUSES: BookingStatus[] = [
  BOOKING_STATUSES.EN_ROUTE_TO_PICKUP,
  BOOKING_STATUSES.LOADING,
  BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF,
  BOOKING_STATUSES.UNLOADING,
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
