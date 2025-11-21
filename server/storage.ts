import { randomUUID } from "crypto";
import type { User, InsertUser, Mover, InsertMover, Booking, InsertBooking, Message, InsertMessage, Review, InsertReview, JobNotification, InsertJobNotification } from "@shared/schema";
import { db } from "./db";
import { users, movers, bookings, messages, reviews, jobNotifications } from "@shared/schema";
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

  async getMovers(filters?: { location?: string; isAvailable?: boolean }): Promise<Mover[]> {
    let query = db.select().from(movers);
    
    const conditions = [];
    if (filters?.isAvailable !== undefined) {
      conditions.push(eq(movers.isAvailable, filters.isAvailable));
    }
    if (filters?.location) {
      conditions.push(eq(movers.location, filters.location));
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
}

export const storage = new PostgresStorage();
