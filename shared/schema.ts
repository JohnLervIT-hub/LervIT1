import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, boolean, doublePrecision, unique, index, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firebaseUid: text("firebase_uid").unique(),
  email: text("email").notNull().unique(),
  password: text("password"),
  name: text("name").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default("customer"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
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
  detectedItems: json("detected_items"),
  
  paymentStatus: text("payment_status").default("pending"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  notifiedAt: timestamp("notified_at"),
  acceptedAt: timestamp("accepted_at"),
  
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
  loadSize: z.enum(['small', 'medium', 'large']),
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
  distanceToPickup: true,
  estimatedEarnings: true,
  expiresAt: true,
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
