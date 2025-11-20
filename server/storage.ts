import { 
  type User, type InsertUser,
  type Mover, type InsertMover,
  type Booking, type InsertBooking,
  type Message, type InsertMessage,
  type Review, type InsertReview
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Movers
  getMover(id: string): Promise<Mover | undefined>;
  getMoverByUserId(userId: string): Promise<Mover | undefined>;
  getMovers(filters?: { location?: string; isAvailable?: boolean }): Promise<Mover[]>;
  createMover(mover: InsertMover): Promise<Mover>;
  updateMover(id: string, updates: Partial<Mover>): Promise<Mover | undefined>;
  
  // Bookings
  getBooking(id: string): Promise<Booking | undefined>;
  getBookingsByCustomer(customerId: string): Promise<Booking[]>;
  getBookingsByMover(moverId: string): Promise<Booking[]>;
  getAllBookings(): Promise<Booking[]>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined>;
  
  // Messages
  getMessagesByBooking(bookingId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  
  // Reviews
  getReviewsByMover(moverId: string): Promise<Review[]>;
  createReview(review: InsertReview): Promise<Review>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private movers: Map<string, Mover>;
  private bookings: Map<string, Booking>;
  private messages: Map<string, Message>;
  private reviews: Map<string, Review>;

  constructor() {
    this.users = new Map();
    this.movers = new Map();
    this.bookings = new Map();
    this.messages = new Map();
    this.reviews = new Map();
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.email === email);
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.firebaseUid === firebaseUid);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      firebaseUid: null,
      password: insertUser.password || null,
      phone: insertUser.phone || null,
      role: insertUser.role || "customer",
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  // Movers
  async getMover(id: string): Promise<Mover | undefined> {
    return this.movers.get(id);
  }

  async getMoverByUserId(userId: string): Promise<Mover | undefined> {
    return Array.from(this.movers.values()).find((mover) => mover.userId === userId);
  }

  async getMovers(filters?: { location?: string; isAvailable?: boolean }): Promise<Mover[]> {
    let movers = Array.from(this.movers.values());
    
    if (filters?.location) {
      movers = movers.filter(m => m.location === filters.location);
    }
    if (filters?.isAvailable !== undefined) {
      movers = movers.filter(m => m.isAvailable === filters.isAvailable);
    }
    
    return movers;
  }

  async createMover(insertMover: InsertMover): Promise<Mover> {
    const id = randomUUID();
    const mover: Mover = {
      ...insertMover,
      id,
      vehicleCapacity: insertMover.vehicleCapacity || null,
      licenseNumber: insertMover.licenseNumber || null,
      bio: insertMover.bio || null,
      location: insertMover.location || null,
      isVerified: insertMover.isVerified || false,
      isAvailable: insertMover.isAvailable !== undefined ? insertMover.isAvailable : true,
      rating: "0",
      totalMoves: 0,
      createdAt: new Date()
    };
    this.movers.set(id, mover);
    return mover;
  }

  async updateMover(id: string, updates: Partial<Mover>): Promise<Mover | undefined> {
    const mover = this.movers.get(id);
    if (!mover) return undefined;
    
    const updated = { ...mover, ...updates };
    this.movers.set(id, updated);
    return updated;
  }

  // Bookings
  async getBooking(id: string): Promise<Booking | undefined> {
    return this.bookings.get(id);
  }

  async getBookingsByCustomer(customerId: string): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(
      (booking) => booking.customerId === customerId
    );
  }

  async getBookingsByMover(moverId: string): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(
      (booking) => booking.moverId === moverId
    );
  }

  async getAllBookings(): Promise<Booking[]> {
    return Array.from(this.bookings.values());
  }

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const id = randomUUID();
    const booking: Booking = {
      ...insertBooking,
      id,
      moverId: insertBooking.moverId || null,
      description: insertBooking.description || null,
      distance: insertBooking.distance || null,
      price: insertBooking.price || null,
      status: insertBooking.status || "pending",
      paymentStatus: "pending",
      stripePaymentIntentId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.bookings.set(id, booking);
    return booking;
  }

  async updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined> {
    const booking = this.bookings.get(id);
    if (!booking) return undefined;
    
    const updated = { ...booking, ...updates, updatedAt: new Date() };
    this.bookings.set(id, updated);
    return updated;
  }

  // Messages
  async getMessagesByBooking(bookingId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((message) => message.bookingId === bookingId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      id,
      createdAt: new Date()
    };
    this.messages.set(id, message);
    return message;
  }

  // Reviews
  async getReviewsByMover(moverId: string): Promise<Review[]> {
    return Array.from(this.reviews.values()).filter(
      (review) => review.moverId === moverId
    );
  }

  async createReview(insertReview: InsertReview): Promise<Review> {
    const id = randomUUID();
    const review: Review = {
      ...insertReview,
      comment: insertReview.comment || null,
      id,
      createdAt: new Date()
    };
    this.reviews.set(id, review);
    
    // Update mover rating
    const reviews = await this.getReviewsByMover(insertReview.moverId);
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    const mover = this.movers.get(insertReview.moverId);
    if (mover) {
      await this.updateMover(insertReview.moverId, {
        rating: avgRating.toFixed(2),
        totalMoves: (mover.totalMoves || 0) + 1
      });
    }
    
    return review;
  }
}

export const storage = new MemStorage();
