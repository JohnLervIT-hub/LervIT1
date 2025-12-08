import { randomUUID } from "crypto";
import type { User, InsertUser, Mover, InsertMover, Booking, InsertBooking, Message, InsertMessage, Review, InsertReview, JobNotification, InsertJobNotification, IdentifiedItem, InsertIdentifiedItem, AiRun, InsertAiRun } from "@shared/schema";
import { db } from "./db";
import { users, movers, bookings, messages, reviews, jobNotifications, identifiedItems, aiRuns } from "@shared/schema";
import { eq, and, desc, sql, lt } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(insertUser: InsertUser): Promise<User>;

  // Movers
  getMover(id: string): Promise<Mover | undefined>;
  getMovers(filters?: { location?: string; isAvailable?: boolean }): Promise<Mover[]>;
  createMover(insertMover: InsertMover): Promise<Mover>;
  updateMover(id: string, updates: Partial<Mover>): Promise<Mover | undefined>;

  // Bookings
  getBooking(id: string): Promise<Booking | undefined>;
  getBookingsByCustomer(customerId: string): Promise<Booking[]>;
  getBookingsByMover(moverId: string): Promise<Booking[]>;
  getAllBookings(): Promise<Booking[]>;
  createBooking(insertBooking: InsertBooking): Promise<Booking>;
  updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined>;

  // Messages
  getMessagesByBooking(bookingId: string): Promise<Message[]>;
  createMessage(insertMessage: InsertMessage): Promise<Message>;
  getUnreadMessagesForUser(userId: string): Promise<{ bookingId: string; count: number; latestMessage: Message }[]>;
  markMessagesAsRead(bookingId: string, userId: string): Promise<void>;

  // Reviews
  getReviewsByMover(moverId: string): Promise<Review[]>;
  createReview(insertReview: InsertReview): Promise<Review>;

  // Job Notifications
  getJobNotificationsByBooking(bookingId: string): Promise<JobNotification[]>;
  getJobNotificationsByMover(moverId: string, status?: string): Promise<JobNotification[]>;
  getExpiredNotifications(): Promise<JobNotification[]>;
  createJobNotification(insertNotification: InsertJobNotification): Promise<JobNotification>;
  updateJobNotification(id: string, updates: Partial<JobNotification>): Promise<JobNotification | undefined>;
  getMoverByUserId(userId: string): Promise<Mover | undefined>;
  getAvailableMoversWithCoordinates(): Promise<Mover[]>;
  
  // Identified Items (AI Product Identifier)
  getIdentifiedItemsByBooking(bookingId: string): Promise<IdentifiedItem[]>;
  createIdentifiedItem(insertItem: InsertIdentifiedItem): Promise<IdentifiedItem>;
  updateIdentifiedItem(id: string, updates: Partial<IdentifiedItem>): Promise<IdentifiedItem | undefined>;
  
  // AI Runs (tracking)
  createAiRun(insertRun: InsertAiRun): Promise<AiRun>;
}

class PostgresStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid)).limit(1);
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const result = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
  }

  // Movers
  async getMover(id: string): Promise<Mover | undefined> {
    const result = await db.select().from(movers).where(eq(movers.id, id)).limit(1);
    return result[0];
  }

  async getMovers(filters?: { location?: string; isAvailable?: boolean; userId?: string }): Promise<Mover[]> {
    let query = db.select().from(movers);
    
    const conditions = [];
    if (filters?.isAvailable !== undefined) {
      conditions.push(eq(movers.isAvailable, filters.isAvailable));
    }
    if (filters?.location) {
      conditions.push(eq(movers.location, filters.location));
    }
    if (filters?.userId) {
      conditions.push(eq(movers.userId, filters.userId));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query.orderBy(desc(movers.rating), desc(movers.createdAt));
  }

  async createMover(insertMover: InsertMover): Promise<Mover> {
    const result = await db.insert(movers).values(insertMover).returning();
    return result[0];
  }

  async updateMover(id: string, updates: Partial<Mover>): Promise<Mover | undefined> {
    const result = await db.update(movers).set(updates).where(eq(movers.id, id)).returning();
    return result[0];
  }

  // Bookings
  async getBooking(id: string): Promise<Booking | undefined> {
    const result = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    return result[0];
  }

  async getBookingsByCustomer(customerId: string): Promise<Booking[]> {
    return await db.select().from(bookings).where(eq(bookings.customerId, customerId)).orderBy(desc(bookings.createdAt));
  }

  async getBookingsByMover(moverId: string): Promise<Booking[]> {
    return await db.select().from(bookings).where(eq(bookings.moverId, moverId)).orderBy(desc(bookings.createdAt));
  }

  async getAllBookings(): Promise<Booking[]> {
    return await db.select().from(bookings).orderBy(desc(bookings.createdAt));
  }

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const result = await db.insert(bookings).values(insertBooking).returning();
    return result[0];
  }

  async updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined> {
    const result = await db.update(bookings).set({ ...updates, updatedAt: new Date() }).where(eq(bookings.id, id)).returning();
    return result[0];
  }

  // Messages
  async getMessagesByBooking(bookingId: string): Promise<Message[]> {
    return await db.select().from(messages).where(eq(messages.bookingId, bookingId)).orderBy(messages.createdAt);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(insertMessage).returning();
    return result[0];
  }

  async getUnreadMessagesForUser(userId: string): Promise<{ bookingId: string; count: number; latestMessage: Message }[]> {
    // Get all bookings where user is either customer or mover
    const userBookings = await db.select().from(bookings).where(
      sql`${bookings.customerId} = ${userId} OR ${bookings.moverId} = ${userId}`
    );
    
    const unreadByBooking: { bookingId: string; count: number; latestMessage: Message }[] = [];
    
    for (const booking of userBookings) {
      // Get messages not sent by this user AND not yet read (readAt is null)
      const unreadMessages = await db.select().from(messages)
        .where(and(
          eq(messages.bookingId, booking.id),
          sql`${messages.senderId} != ${userId}`,
          sql`${messages.readAt} IS NULL`
        ))
        .orderBy(desc(messages.createdAt));
      
      if (unreadMessages.length > 0) {
        unreadByBooking.push({
          bookingId: booking.id,
          count: unreadMessages.length,
          latestMessage: unreadMessages[0]
        });
      }
    }
    
    return unreadByBooking;
  }

  async markMessagesAsRead(bookingId: string, userId: string): Promise<void> {
    // Mark all messages in this booking as read for the user (except their own messages)
    await db.update(messages)
      .set({ readAt: new Date() })
      .where(and(
        eq(messages.bookingId, bookingId),
        sql`${messages.senderId} != ${userId}`,
        sql`${messages.readAt} IS NULL`
      ));
  }

  // Reviews
  async getReviewsByMover(moverId: string): Promise<Review[]> {
    return await db.select().from(reviews).where(eq(reviews.moverId, moverId)).orderBy(desc(reviews.createdAt));
  }

  async createReview(insertReview: InsertReview): Promise<Review> {
    const result = await db.insert(reviews).values(insertReview).returning();
    return result[0];
  }

  // Job Notifications
  async getJobNotificationsByBooking(bookingId: string): Promise<JobNotification[]> {
    return await db.select().from(jobNotifications).where(eq(jobNotifications.bookingId, bookingId)).orderBy(jobNotifications.notifiedAt);
  }

  async getJobNotificationsByMover(moverId: string, status?: string): Promise<JobNotification[]> {
    const conditions = [eq(jobNotifications.moverId, moverId)];
    if (status) {
      conditions.push(eq(jobNotifications.status, status));
    }
    return await db.select().from(jobNotifications).where(and(...conditions)).orderBy(desc(jobNotifications.notifiedAt));
  }

  async getExpiredNotifications(): Promise<JobNotification[]> {
    return await db.select().from(jobNotifications)
      .where(and(
        eq(jobNotifications.status, 'pending'),
        lt(jobNotifications.expiresAt, new Date())
      ));
  }

  async createJobNotification(insertNotification: InsertJobNotification): Promise<JobNotification> {
    const result = await db.insert(jobNotifications).values(insertNotification).returning();
    return result[0];
  }

  async updateJobNotification(id: string, updates: Partial<JobNotification>): Promise<JobNotification | undefined> {
    const result = await db.update(jobNotifications).set(updates).where(eq(jobNotifications.id, id)).returning();
    return result[0];
  }

  async getMoverByUserId(userId: string): Promise<Mover | undefined> {
    const result = await db.select().from(movers).where(eq(movers.userId, userId)).limit(1);
    return result[0];
  }

  async getAvailableMoversWithCoordinates(): Promise<Mover[]> {
    return await db.select().from(movers)
      .where(and(
        eq(movers.isAvailable, true),
        sql`${movers.latitude} IS NOT NULL AND ${movers.longitude} IS NOT NULL`
      ))
      .orderBy(desc(movers.rating));
  }
  
  // Identified Items (AI Product Identifier)
  async getIdentifiedItemsByBooking(bookingId: string): Promise<IdentifiedItem[]> {
    return await db.select().from(identifiedItems)
      .where(eq(identifiedItems.bookingId, bookingId))
      .orderBy(desc(identifiedItems.createdAt));
  }
  
  async createIdentifiedItem(insertItem: InsertIdentifiedItem): Promise<IdentifiedItem> {
    const result = await db.insert(identifiedItems).values(insertItem).returning();
    return result[0];
  }
  
  async updateIdentifiedItem(id: string, updates: Partial<IdentifiedItem>): Promise<IdentifiedItem | undefined> {
    const result = await db.update(identifiedItems).set(updates).where(eq(identifiedItems.id, id)).returning();
    return result[0];
  }
  
  // AI Runs (tracking)
  async createAiRun(insertRun: InsertAiRun): Promise<AiRun> {
    const result = await db.insert(aiRuns).values(insertRun).returning();
    return result[0];
  }
}

export const storage = new PostgresStorage();
