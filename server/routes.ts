import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { insertUserSchema, insertMoverSchema, insertBookingSchema, insertMessageSchema, insertReviewSchema, jobNotifications, insertSupportTicketSchema, insertSupportTicketReplySchema, supportTickets, supportTicketReplies, bookings } from "@shared/schema";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./auth";
import { calculateDistance } from "./utils/distance";
import multer from "multer";
import path from "path";
import fs from "fs";
import Stripe from "stripe";

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
if (process.env.STRIPE_SECRET_KEY.startsWith('pk_')) {
  throw new Error('STRIPE_SECRET_KEY must be a secret key (starts with sk_), not a publishable key (starts with pk_). Please update the secret.');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-11-20.acacia",
});

// Middleware to parse JSON
function jsonMiddleware(req: Request, res: Response, next: Function) {
  if (req.is('json')) {
    next();
  } else {
    next();
  }
}

// Helper to validate request body with Zod
function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// Auth middleware to attach user to req
async function authMiddleware(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const userId = authHeader.substring(7);
    try {
      const user = await storage.getUser(userId);
      if (user) {
        (req as any).user = user;
      }
    } catch (error) {
      // User not found, continue without auth
    }
  }
  next();
}

// Auth guards
function requireUser(req: Request, res: Response): boolean {
  if (!(req as any).user) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  return true;
}

function requireAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage_multer = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage_multer,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Register auth middleware globally
  app.use(authMiddleware);
  
  // Serve uploaded files statically with express.static (secure against path traversal)
  const express = await import('express');
  app.use('/uploads', express.default.static(uploadDir, {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    },
  }));
  
  // ===== AUTH ROUTES =====
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const signupSchema = insertUserSchema.extend({
        password: z.string().min(6, "Password must be at least 6 characters"),
      });
      const userData = validateBody(signupSchema, req.body);
      
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      const hashedPassword = hashPassword(userData.password);
      const user = await storage.createUser({ ...userData, password: hashedPassword });
      
      // If user signed up as a mover, automatically create a mover profile
      if (user.role === "mover") {
        const { generateRandomCalgaryCoordinates } = await import("@shared/geocoding");
        const coords = generateRandomCalgaryCoordinates();
        await storage.createMover({
          userId: user.id,
          vehicleType: "van", // Default vehicle type
          isAvailable: true,
          location: "Calgary, AB", // Default location
          latitude: coords.lat,
          longitude: coords.lng,
        });
      }
      
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const loginSchema = z.object({
        email: z.string().email(),
        password: z.string().min(1),
      });
      const { email, password } = validateBody(loginSchema, req.body);
      
      const user = await storage.getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const isValid = verifyPassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });
  
  // ===== USER ROUTES =====
  app.post("/api/users", async (req: Request, res: Response) => {
    try {
      const userData = validateBody(insertUserSchema, req.body);
      const hashedPassword = userData.password ? hashPassword(userData.password) : null;
      const user = await storage.createUser({ ...userData, password: hashedPassword });
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/users", async (req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      const usersWithoutPasswords = allUsers.map((user) => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      res.json(usersWithoutPasswords);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/email/:email", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByEmail(req.params.email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== MOVER ROUTES =====
  app.post("/api/movers", async (req: Request, res: Response) => {
    try {
      const moverData = validateBody(insertMoverSchema, req.body);
      const mover = await storage.createMover(moverData);
      res.json(mover);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/movers", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string | undefined;
      let location = req.query.location as string | undefined;
      const isAvailable = req.query.isAvailable === 'true' ? true : req.query.isAvailable === 'false' ? false : undefined;
      const userLat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
      const userLng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
      
      // Normalize location for matching
      if (location) {
        location = location.toLowerCase().trim();
      }
      
      let movers = await storage.getMovers({ isAvailable });
      
      // Filter by userId if provided
      if (userId) {
        movers = movers.filter(m => m.userId === userId);
      }
      
      // Apply location filter with case-insensitive matching
      if (location) {
        movers = movers.filter(m => 
          m.location && m.location.toLowerCase().includes(location.toLowerCase())
        );
      }
      
      // Enrich movers with user data and calculate distance
      let enrichedMovers = await Promise.all(
        movers.map(async (mover) => {
          const user = await storage.getUser(mover.userId);
          
          let distance: number | null = null;
          if (userLat && userLng && mover.latitude && mover.longitude) {
            distance = calculateDistance(
              userLat,
              userLng,
              parseFloat(mover.latitude),
              parseFloat(mover.longitude)
            );
          }
          
          return {
            ...mover,
            distance,
            user: user ? { name: user.name, email: user.email, phone: user.phone } : null
          };
        })
      );
      
      // Sort by distance if coordinates provided
      if (userLat && userLng) {
        enrichedMovers.sort((a, b) => {
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });
      }
      
      res.json(enrichedMovers);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/movers/:id", async (req: Request, res: Response) => {
    try {
      const mover = await storage.getMover(req.params.id);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      const user = await storage.getUser(mover.userId);
      const reviews = await storage.getReviewsByMover(mover.id);
      
      res.json({
        ...mover,
        user: user ? { name: user.name, email: user.email, phone: user.phone } : null,
        reviews
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/movers/:id", async (req: Request, res: Response) => {
    try {
      // Validate allowed update fields
      const updateSchema = insertMoverSchema.partial().pick({
        vehicleType: true,
        vehicleCapacity: true,
        licenseNumber: true,
        isVerified: true,
        bio: true,
        location: true,
        latitude: true,
        longitude: true,
        isAvailable: true,
      });
      const updates = validateBody(updateSchema, req.body);
      const mover = await storage.updateMover(req.params.id, updates);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      res.json(mover);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== BOOKING ROUTES =====
  app.post("/api/bookings", async (req: Request, res: Response) => {
    try {
      const bookingData = validateBody(insertBookingSchema, req.body);
      
      // Geocode addresses to get coordinates
      const { geocodeAddress } = await import("@shared/geocoding");
      const { calculateDistance } = await import("@shared/geocoding");
      const { calculatePrice } = await import("@shared/pricing");
      const { findNearestMovers, calculateExpiryTime } = await import("@shared/matching");
      const { toDecimalString } = await import("@shared/utils");
      
      const pickupGeo = geocodeAddress(bookingData.pickupAddress);
      const dropoffGeo = geocodeAddress(bookingData.dropoffAddress);
      
      // Calculate distance and price
      const distance = calculateDistance(pickupGeo.coordinates, dropoffGeo.coordinates);
      const priceBreakdown = calculatePrice(
        distance,
        bookingData.loadSize as 'small' | 'medium' | 'large',
        bookingData.pickupDifficulty as any,
        bookingData.dropoffDifficulty as any,
        bookingData.heavyItem,
        bookingData.numberOfMovers as 1 | 2
      );
      
      // Create booking with geocoded data and price breakdown
      const booking = await storage.createBooking({
        ...bookingData,
        pickupLatitude: pickupGeo.coordinates.lat,
        pickupLongitude: pickupGeo.coordinates.lng,
        dropoffLatitude: dropoffGeo.coordinates.lat,
        dropoffLongitude: dropoffGeo.coordinates.lng,
        distance: toDecimalString(distance),
        price: toDecimalString(priceBreakdown.totalCost),
        baseFee: toDecimalString(priceBreakdown.baseFee),
        distanceFee: toDecimalString(priceBreakdown.distanceFee),
        loadFee: toDecimalString(priceBreakdown.loadFee),
        moverTravelFee: toDecimalString(priceBreakdown.moverTravelFee),
        pickupDifficultyFee: toDecimalString(priceBreakdown.pickupDifficultyFee),
        dropoffDifficultyFee: toDecimalString(priceBreakdown.dropoffDifficultyFee),
        heavyItemFee: toDecimalString(priceBreakdown.heavyItemFee),
        subtotal: toDecimalString(priceBreakdown.subtotal),
        notifiedAt: new Date(),
      });
      
      // Find nearest available movers
      const allMovers = await storage.getAvailableMoversWithCoordinates();
      const moversWithUserData = await Promise.all(
        allMovers.map(async (m) => {
          const user = await storage.getUser(m.userId);
          if (!user || m.latitude === null || m.longitude === null) {
            return null;
          }
          return {
            moverId: m.id,
            userId: m.userId,
            name: user.name,
            vehicleType: m.vehicleType,
            rating: m.rating || '0',
            totalMoves: m.totalMoves,
            isAvailable: m.isAvailable,
            latitude: m.latitude as number,
            longitude: m.longitude as number,
          };
        })
      ).then(results => results.filter((m): m is NonNullable<typeof m> => m !== null));
      
      const nearestMovers = findNearestMovers(
        pickupGeo.coordinates,
        dropoffGeo.coordinates,
        bookingData.loadSize as 'small' | 'medium' | 'large',
        moversWithUserData
      );
      
      // Create job notifications for top movers
      const expiresAt = calculateExpiryTime(10); // 10 minutes
      await Promise.all(
        nearestMovers.map(mover =>
          storage.createJobNotification({
            bookingId: booking.id,
            moverId: mover.moverId,
            distanceToPickup: toDecimalString(mover.distanceToPickup),
            estimatedEarnings: toDecimalString(mover.estimatedEarnings),
            status: 'pending',
            expiresAt,
          })
        )
      );
      
      res.json({
        ...booking,
        notifiedMovers: nearestMovers.length,
        nearestMovers: nearestMovers.map(m => ({
          id: m.moverId,
          name: m.name,
          distanceToPickup: m.distanceToPickup,
          estimatedEarnings: m.estimatedEarnings,
        })),
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/bookings", async (req: Request, res: Response) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const moverId = req.query.moverId as string | undefined;
      
      let bookings;
      if (customerId) {
        bookings = await storage.getBookingsByCustomer(customerId);
      } else if (moverId) {
        bookings = await storage.getBookingsByMover(moverId);
      } else {
        bookings = await storage.getAllBookings();
      }
      
      // Enrich with customer and mover data
      const enrichedBookings = await Promise.all(
        bookings.map(async (booking) => {
          const customer = await storage.getUser(booking.customerId);
          const mover = booking.moverId ? await storage.getMover(booking.moverId) : null;
          const moverUser = mover ? await storage.getUser(mover.userId) : null;
          
          return {
            ...booking,
            customer: customer ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone } : null,
            mover: mover && moverUser ? {
              id: mover.id,
              name: moverUser.name,
              vehicleType: mover.vehicleType,
              rating: mover.rating
            } : null
          };
        })
      );
      
      res.json(enrichedBookings);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/bookings/:id", async (req: Request, res: Response) => {
    try {
      const booking = await storage.getBooking(req.params.id);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const customer = await storage.getUser(booking.customerId);
      const mover = booking.moverId ? await storage.getMover(booking.moverId) : null;
      const moverUser = mover ? await storage.getUser(mover.userId) : null;
      
      res.json({
        ...booking,
        customer: customer ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone } : null,
        mover: mover && moverUser ? {
          id: mover.id,
          name: moverUser.name,
          phone: moverUser.phone,
          vehicleType: mover.vehicleType,
          rating: mover.rating
        } : null
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mover accepts a job (with race condition protection)
  app.post("/api/bookings/:id/accept", async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.id;
      const { moverId } = validateBody(z.object({
        moverId: z.string(),
      }), req.body);
      
      // Get the booking
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Check if already accepted by someone (race condition check)
      if (booking.moverId) {
        return res.status(409).json({ 
          error: "Job already accepted by another mover",
          acceptedBy: booking.moverId 
        });
      }
      
      // Check if mover was actually notified
      const notifications = await db
        .select()
        .from(jobNotifications)
        .where(and(
          eq(jobNotifications.bookingId, bookingId),
          eq(jobNotifications.moverId, moverId)
        ));
      
      const moverNotification = notifications[0];
      if (!moverNotification) {
        return res.status(403).json({ error: "You were not notified about this job" });
      }
      
      // Check if notification expired
      if (new Date() > moverNotification.expiresAt) {
        return res.status(410).json({ error: "Job notification has expired" });
      }
      
      // Check if mover already declined
      if (moverNotification.status === 'declined') {
        return res.status(400).json({ error: "You already declined this job" });
      }
      
      // ATOMIC OPERATION: Update booking and notifications
      // 1. Update the booking with moverId
      const updatedBooking = await storage.updateBooking(bookingId, {
        moverId,
        status: 'confirmed',
      });
      
      if (!updatedBooking) {
        return res.status(500).json({ error: "Failed to accept booking" });
      }
      
      // 2. Mark this mover's notification as accepted
      await db
        .update(jobNotifications)
        .set({ 
          status: 'accepted',
          respondedAt: new Date(),
        })
        .where(eq(jobNotifications.id, moverNotification.id));
      
      // 3. Expire all other pending notifications for this booking
      await db
        .update(jobNotifications)
        .set({ 
          status: 'expired',
          respondedAt: new Date(),
        })
        .where(and(
          eq(jobNotifications.bookingId, bookingId),
          eq(jobNotifications.status, 'pending')
        ));
      
      res.json({
        ...updatedBooking,
        message: "Job accepted successfully"
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });
  
  // Mover declines a job
  app.post("/api/bookings/:id/decline", async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.id;
      const { moverId } = validateBody(z.object({
        moverId: z.string(),
      }), req.body);
      
      // Find the notification
      const notifications = await db
        .select()
        .from(jobNotifications)
        .where(and(
          eq(jobNotifications.bookingId, bookingId),
          eq(jobNotifications.moverId, moverId)
        ));
      
      const moverNotification = notifications[0];
      if (!moverNotification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      // Update notification status to declined
      await db
        .update(jobNotifications)
        .set({ 
          status: 'declined',
          respondedAt: new Date(),
        })
        .where(eq(jobNotifications.id, moverNotification.id));
      
      res.json({ message: "Job declined successfully" });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.patch("/api/bookings/:id", async (req: Request, res: Response) => {
    try {
      // Validate allowed update fields (removed moverId - must use /accept endpoint)
      const updateSchema = insertBookingSchema.partial().pick({
        status: true,
        preferredDate: true,
        distance: true,
        price: true,
      }).extend({
        paymentStatus: z.string().optional(),
        stripePaymentIntentId: z.string().optional(),
      });
      const updates = validateBody(updateSchema, req.body);
      const booking = await storage.updateBooking(req.params.id, updates);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      res.json(booking);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== PAYMENT ROUTES =====
  
  // Create payment intent for a booking
  app.post("/api/bookings/:id/create-payment-intent", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const bookingId = req.params.id;
      
      // Get the booking
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Verify user owns this booking
      if (booking.customerId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Check if booking is in valid state for payment
      if (booking.status !== 'confirmed') {
        return res.status(400).json({ error: "Booking must be confirmed before payment" });
      }
      
      // Check if already paid
      if (booking.paymentStatus === 'succeeded') {
        return res.status(400).json({ error: "Booking has already been paid" });
      }
      
      // Calculate amount in cents (Stripe requires cents)
      const amountInCents = Math.round(parseFloat(booking.price || '0') * 100);
      
      if (amountInCents <= 0) {
        return res.status(400).json({ error: "Invalid booking price" });
      }
      
      // Create or retrieve payment intent
      let paymentIntent;
      
      if (booking.stripePaymentIntentId) {
        // Retrieve existing payment intent
        try {
          paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
        } catch (error) {
          // If payment intent doesn't exist, create a new one
          paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: "cad",
            metadata: {
              bookingId: booking.id,
              customerId: user.id,
              customerName: user.name,
            },
            description: `MoveIt booking from ${booking.pickupAddress} to ${booking.dropoffAddress}`,
          });
          
          // Update booking with payment intent ID
          await storage.updateBooking(bookingId, {
            stripePaymentIntentId: paymentIntent.id,
            paymentStatus: 'pending',
          });
        }
      } else {
        // Create new payment intent
        paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "cad",
          metadata: {
            bookingId: booking.id,
            customerId: user.id,
            customerName: user.name,
          },
          description: `MoveIt booking from ${booking.pickupAddress} to ${booking.dropoffAddress}`,
        });
        
        // Update booking with payment intent ID
        await storage.updateBooking(bookingId, {
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: 'pending',
        });
      }
      
      res.json({ 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ 
        error: "Error creating payment intent: " + error.message 
      });
    }
  });
  
  // Get payment status for a booking
  app.get("/api/bookings/:id/payment-status", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const bookingId = req.params.id;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Verify user has access (customer or assigned mover)
      if (booking.customerId !== user.id && booking.moverId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json({
        paymentStatus: booking.paymentStatus || 'pending',
        stripePaymentIntentId: booking.stripePaymentIntentId,
        amount: booking.price,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payment status" });
    }
  });
  
  // Stripe webhook handler for payment events
  app.post("/api/stripe-webhook", async (req: Request, res: Response) => {
    try {
      const sig = req.headers['stripe-signature'];
      
      if (!sig) {
        return res.status(400).json({ error: 'No stripe signature' });
      }
      
      // Note: In production, you should verify the webhook signature
      // For now, we'll process the event directly
      const event = req.body;
      
      // Handle the event
      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object;
          
          // Find booking by payment intent ID
          const successBookings = await db
            .select()
            .from(bookings)
            .where(eq(bookings.stripePaymentIntentId, paymentIntent.id))
            .limit(1);
          
          if (successBookings.length > 0) {
            const booking = successBookings[0];
            
            // Update booking payment status
            await storage.updateBooking(booking.id, {
              paymentStatus: 'succeeded',
            });
            
            console.log(`Payment succeeded for booking ${booking.id}`);
          }
          break;
          
        case 'payment_intent.payment_failed':
          const failedIntent = event.data.object;
          
          // Find booking by payment intent ID
          const failedBookings = await db
            .select()
            .from(bookings)
            .where(eq(bookings.stripePaymentIntentId, failedIntent.id))
            .limit(1);
          
          if (failedBookings.length > 0) {
            const booking = failedBookings[0];
            
            // Update booking payment status
            await storage.updateBooking(booking.id, {
              paymentStatus: 'failed',
            });
            
            console.log(`Payment failed for booking ${booking.id}`);
          }
          break;
          
        default:
          console.log(`Unhandled event type ${event.type}`);
      }
      
      res.json({ received: true });
    } catch (error: any) {
      console.error("Webhook error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // ===== MESSAGE ROUTES =====
  app.get("/api/messages", async (req: Request, res: Response) => {
    try {
      const bookingId = req.query.bookingId as string;
      if (!bookingId) {
        return res.status(400).json({ error: "bookingId is required" });
      }
      
      const messages = await storage.getMessagesByBooking(bookingId);
      
      // Enrich with sender data
      const enrichedMessages = await Promise.all(
        messages.map(async (message) => {
          const sender = await storage.getUser(message.senderId);
          return {
            ...message,
            sender: sender ? { id: sender.id, name: sender.name } : null
          };
        })
      );
      
      res.json(enrichedMessages);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/messages", async (req: Request, res: Response) => {
    try {
      const messageData = validateBody(insertMessageSchema, req.body);
      const message = await storage.createMessage(messageData);
      
      const sender = await storage.getUser(message.senderId);
      res.json({
        ...message,
        sender: sender ? { id: sender.id, name: sender.name } : null
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== REVIEW ROUTES =====
  app.get("/api/reviews", async (req: Request, res: Response) => {
    try {
      const moverId = req.query.moverId as string;
      if (!moverId) {
        return res.status(400).json({ error: "moverId is required" });
      }
      
      const reviews = await storage.getReviewsByMover(moverId);
      
      // Enrich with customer data
      const enrichedReviews = await Promise.all(
        reviews.map(async (review) => {
          const customer = await storage.getUser(review.customerId);
          return {
            ...review,
            customer: customer ? { id: customer.id, name: customer.name } : null
          };
        })
      );
      
      res.json(enrichedReviews);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/reviews", async (req: Request, res: Response) => {
    try {
      const reviewData = validateBody(insertReviewSchema, req.body);
      
      // Validate that the booking is completed before allowing a review
      const booking = await storage.getBooking(reviewData.bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      if (booking.status !== "completed") {
        return res.status(400).json({ error: "You can only leave a review after the move is completed" });
      }
      
      const review = await storage.createReview(reviewData);
      
      const customer = await storage.getUser(review.customerId);
      res.json({
        ...review,
        customer: customer ? { id: customer.id, name: customer.name } : null
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== FILE UPLOAD ROUTES =====
  app.post("/api/upload/images", upload.array('images', 10), async (req: Request, res: Response) => {
    try {
      if (!req.files || !Array.isArray(req.files)) {
        return res.status(400).json({ error: "No images uploaded" });
      }
      
      const imageUrls = req.files.map(file => `/uploads/${file.filename}`);
      res.json({ urls: imageUrls });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Upload failed" });
    }
  });

  // Mock AI photo analysis (fallback when OpenAI is unavailable)
  function mockPhotoAnalysis(fileSize: number, filename: string) {
    // Analyze file size in MB to estimate load
    const sizeMB = fileSize / (1024 * 1024);
    
    // Simple heuristics based on file size and name
    let loadSize: "small" | "medium" | "large" = "medium";
    let heavyItem = false;
    let recommendedMovers = 1;
    let itemType = "Furniture item";
    let estimatedWeight: "light" | "medium" | "heavy" = "medium";
    
    // File size analysis (smaller photos often = smaller items)
    if (sizeMB < 1) {
      loadSize = "small";
      estimatedWeight = "light";
      recommendedMovers = 1;
    } else if (sizeMB > 3) {
      loadSize = "large";
      estimatedWeight = "heavy";
      heavyItem = true;
      recommendedMovers = 2;
    }
    
    // Filename pattern detection
    const lowerName = filename.toLowerCase();
    if (lowerName.includes('sofa') || lowerName.includes('couch')) {
      itemType = "Sofa/Couch";
      loadSize = "large";
      heavyItem = true;
      recommendedMovers = 2;
    } else if (lowerName.includes('table') || lowerName.includes('desk')) {
      itemType = "Table/Desk";
      loadSize = "medium";
      recommendedMovers = 1;
    } else if (lowerName.includes('bed') || lowerName.includes('mattress')) {
      itemType = "Bed/Mattress";
      loadSize = "large";
      recommendedMovers = 2;
    } else if (lowerName.includes('chair') || lowerName.includes('stool')) {
      itemType = "Chair";
      loadSize = "small";
      recommendedMovers = 1;
    } else if (lowerName.includes('appliance') || lowerName.includes('fridge') || lowerName.includes('washer')) {
      itemType = "Appliance";
      loadSize = "large";
      heavyItem = true;
      recommendedMovers = 2;
    }
    
    return {
      loadSize,
      heavyItem,
      recommendedMovers,
      itemType,
      estimatedWeight,
      confidence: 75,
      explanation: `Based on image analysis, this appears to be a ${itemType.toLowerCase()} with ${estimatedWeight} weight. We recommend ${recommendedMovers} mover${recommendedMovers > 1 ? 's' : ''} for safe handling.`
    };
  }

  // AI photo analysis endpoint with free mock fallback
  app.post("/api/ai/analyze-photo", upload.single('photo'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No photo uploaded" });
      }
      
      const imagePath = `/uploads/${req.file.filename}`;
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      
      // Try OpenAI Vision API first if key is available
      if (OPENAI_API_KEY) {
        try {
          const fullImageUrl = `${req.protocol}://${req.get('host')}${imagePath}`;
          
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Analyze this furniture/item photo for a moving service. Determine:
1. Load size (small/medium/large)
2. Is it a heavy item? (true/false)
3. Recommended number of movers (1 or 2)
4. Item type/category
5. Estimated weight category (light/medium/heavy)

Respond ONLY with valid JSON in this exact format:
{
  "loadSize": "small" | "medium" | "large",
  "heavyItem": true | false,
  "recommendedMovers": 1 | 2,
  "itemType": "string",
  "estimatedWeight": "light" | "medium" | "heavy",
  "confidence": 0-100,
  "explanation": "brief explanation"
}`
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: fullImageUrl
                      }
                    }
                  ]
                }
              ],
              max_tokens: 500
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            const content = data.choices[0]?.message?.content;
            
            if (content) {
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[0]);
                return res.json({
                  ...analysis,
                  imageUrl: imagePath
                });
              }
            }
          } else {
            const errorData = await response.json();
            console.log('OpenAI API unavailable, using mock analysis:', errorData.error?.code);
          }
        } catch (openaiError) {
          console.log('OpenAI Vision failed, falling back to mock analysis');
        }
      }
      
      // Fallback to mock analysis
      console.log('Using mock AI analysis for photo');
      const mockResult = mockPhotoAnalysis(req.file.size, req.file.originalname);
      
      res.json({
        ...mockResult,
        imageUrl: imagePath
      });
    } catch (error) {
      console.error('Photo analysis error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Analysis failed" });
    }
  });

  // Geocoding distance endpoint for AI auto-quote predictor
  app.post("/api/geocode/distance", async (req: Request, res: Response) => {
    try {
      const distanceSchema = z.object({
        pickupAddress: z.string(),
        dropoffAddress: z.string(),
      });
      
      const { pickupAddress, dropoffAddress } = validateBody(distanceSchema, req.body);
      
      const { geocodeAddress, calculateDistance } = await import("@shared/geocoding");
      
      const pickupGeo = geocodeAddress(pickupAddress);
      const dropoffGeo = geocodeAddress(dropoffAddress);
      
      const distance = calculateDistance(pickupGeo.coordinates, dropoffGeo.coordinates);
      
      res.json({ distance });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== SUPPORT TICKET ROUTES =====
  
  // Create a new support ticket
  app.post("/api/support/tickets", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const ticketData = validateBody(insertSupportTicketSchema, req.body);
      
      const ticket = await db.insert(supportTickets).values({
        ...ticketData,
        userId: user.id,
      }).returning();
      
      res.status(201).json(ticket[0]);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create ticket" });
    }
  });
  
  // Get all support tickets for the authenticated user
  app.get("/api/support/tickets", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const tickets = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.userId, user.id))
        .orderBy(supportTickets.createdAt);
      
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });
  
  // Get all support tickets (admin only)
  app.get("/api/support/tickets/all", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const tickets = await db.select()
        .from(supportTickets)
        .orderBy(supportTickets.createdAt);
      
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });
  
  // Get a specific ticket with replies
  app.get("/api/support/tickets/:id", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const ticket = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, req.params.id))
        .limit(1);
      
      if (!ticket.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      // Check if user owns the ticket or is admin
      if (ticket[0].userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const replies = await db.select()
        .from(supportTicketReplies)
        .where(eq(supportTicketReplies.ticketId, req.params.id))
        .orderBy(supportTicketReplies.createdAt);
      
      res.json({ ticket: ticket[0], replies });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  });
  
  // Add a reply to a ticket
  app.post("/api/support/tickets/:id/replies", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const replySchema = z.object({
        message: z.string().min(1),
      });
      
      const { message } = validateBody(replySchema, req.body);
      
      // Check if ticket exists and user has access
      const ticket = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, req.params.id))
        .limit(1);
      
      if (!ticket.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      if (ticket[0].userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const reply = await db.insert(supportTicketReplies).values({
        ticketId: req.params.id,
        userId: user.id,
        message,
        isStaff: user.role === "admin",
      }).returning();
      
      // Update ticket's updatedAt
      await db.update(supportTickets)
        .set({ updatedAt: new Date() })
        .where(eq(supportTickets.id, req.params.id));
      
      res.status(201).json(reply[0]);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to add reply" });
    }
  });
  
  // Update ticket status (admin only)
  app.patch("/api/support/tickets/:id/status", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const statusSchema = z.object({
        status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
        assignedTo: z.string().optional(),
      });
      
      const { status, assignedTo } = validateBody(statusSchema, req.body);
      
      const updateData: any = { 
        status,
        updatedAt: new Date(),
      };
      
      if (status === 'resolved' || status === 'closed') {
        updateData.resolvedAt = new Date();
      }
      
      if (assignedTo) {
        updateData.assignedTo = assignedTo;
      }
      
      const ticket = await db.update(supportTickets)
        .set(updateData)
        .where(eq(supportTickets.id, req.params.id))
        .returning();
      
      if (!ticket.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      res.json(ticket[0]);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update ticket" });
    }
  });

  // ===== UTILITY ROUTES =====
  app.post("/api/calculate-price", async (req: Request, res: Response) => {
    try {
      const priceSchema = z.object({
        distance: z.number().positive(),
        loadSize: z.enum(["small", "medium", "large", "full"]),
      });
      
      const { distance, loadSize } = validateBody(priceSchema, req.body);
      
      const loadMultipliers: Record<string, number> = {
        small: 1.0,
        medium: 1.5,
        large: 2.0,
        full: 3.0,
      };
      
      const baseRate = 15; // CAD per km
      const multiplier = loadMultipliers[loadSize];
      
      // Calculate total cost: base rate * distance * load multiplier
      const totalCost = Number((baseRate * distance * multiplier).toFixed(2));
      
      // For display: show base distance cost and load surcharge
      const baseCost = Number((baseRate * distance).toFixed(2));
      const loadSurcharge = Number((totalCost - baseCost).toFixed(2));
      
      res.json({
        distance: Number(distance.toFixed(2)),
        loadSize,
        baseRate,
        baseCost,
        loadSurcharge,
        totalCost
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Seed some initial data for testing
  app.post("/api/seed", async (req: Request, res: Response) => {
    try {
      // Create test users with passwords
      const customer1 = await storage.createUser({
        email: "john.doe@example.com",
        password: hashPassword("password123"),
        name: "John Doe",
        phone: "+1-403-555-0100",
        role: "customer"
      });

      const moverUser1 = await storage.createUser({
        email: "mike.johnson@moveit.com",
        password: hashPassword("password123"),
        name: "Mike Johnson",
        phone: "+1-403-555-0101",
        role: "mover"
      });

      const moverUser2 = await storage.createUser({
        email: "sarah.chen@moveit.com",
        password: hashPassword("password123"),
        name: "Sarah Chen",
        phone: "+1-403-555-0102",
        role: "mover"
      });

      // Create movers (Calgary GPS coordinates)
      const mover1 = await storage.createMover({
        userId: moverUser1.id,
        vehicleType: "Large Truck (26ft)",
        vehicleCapacity: "3000 lbs",
        isVerified: true,
        location: "Calgary, AB",
        latitude: "51.0447",
        longitude: "-114.0719",
        bio: "Professional mover with 5+ years experience",
        isAvailable: true
      });

      const mover2 = await storage.createMover({
        userId: moverUser2.id,
        vehicleType: "Cargo Van",
        vehicleCapacity: "1500 lbs",
        isVerified: true,
        location: "Calgary, AB",
        latitude: "51.0786",
        longitude: "-113.9656",
        bio: "Fast and reliable service",
        isAvailable: true
      });

      // Update ratings
      await storage.updateMover(mover1.id, { rating: "4.9", totalMoves: 142 });
      await storage.updateMover(mover2.id, { rating: "4.8", totalMoves: 98 });

      res.json({ message: "Seed data created successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to seed data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
