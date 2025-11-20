import { randomUUID } from "crypto";
import type { User, InsertUser, Mover, InsertMover, Booking, InsertBooking, Message, InsertMessage, Review, InsertReview } from "@shared/schema";
import { db } from "./db";
import { users, movers, bookings, messages, reviews } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
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
}

export const storage = new PostgresStorage();
