import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { insertUserSchema, insertMoverSchema, insertBookingSchema, insertMessageSchema, insertReviewSchema, jobNotifications, insertSupportTicketSchema, insertSupportTicketReplySchema, supportTickets, supportTicketReplies, bookings, users as usersTable, movers as moversTable, verificationItems, insertVerificationItemSchema, identifiedItems } from "@shared/schema";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./auth";
import { calculateDistance } from "./utils/distance";
import multer from "multer";
import path from "path";
import fs from "fs";
import Stripe from "stripe";
import { notificationService } from "./notifications";
import { format } from "date-fns";

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
if (process.env.STRIPE_SECRET_KEY.startsWith('pk_')) {
  throw new Error('STRIPE_SECRET_KEY must be a secret key (starts with sk_), not a publishable key (starts with pk_). Please update the secret.');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-10-28.acacia" as any,
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
  
  // ===== GOOGLE PLACES API PROXY =====
  // Secure proxy for Google Places Autocomplete API
  app.get("/api/places/autocomplete", async (req: Request, res: Response) => {
    try {
      const { input, sessiontoken } = req.query;
      
      // Validate input parameters
      if (!input || typeof input !== 'string') {
        return res.status(400).json({ error: "Input parameter is required" });
      }
      
      if (input.length < 3) {
        return res.json({ predictions: [] });
      }
      
      // Sanitize input (prevent injection attacks)
      const sanitizedInput = input.trim().slice(0, 200); // Limit length
      
      // Get API key from server environment (never expose to client)
      const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error('[PLACES API] Missing Google Maps API key');
        return res.status(500).json({ error: "API configuration error" });
      }
      
      // Build Google Places Autocomplete API URL
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      url.searchParams.append('input', sanitizedInput);
      url.searchParams.append('key', apiKey);
      url.searchParams.append('types', 'address');
      url.searchParams.append('components', 'country:ca');
      
      // Bias to Calgary
      url.searchParams.append('location', '51.0447,-114.0719');
      url.searchParams.append('radius', '50000');
      
      // Add session token if provided (for billing optimization)
      if (sessiontoken && typeof sessiontoken === 'string') {
        url.searchParams.append('sessiontoken', sessiontoken);
      }
      
      // Make request to Google Places API
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        console.error('[PLACES API] Google API error:', response.status);
        return res.status(500).json({ error: "Failed to fetch predictions" });
      }
      
      const data = await response.json();
      
      // Return predictions to client (without exposing API key)
      res.json({
        predictions: data.predictions || [],
        status: data.status
      });
      
    } catch (error) {
      console.error('[PLACES API] Error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
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
      
      console.log("[LOGIN DEBUG] Email received:", email);
      console.log("[LOGIN DEBUG] Password length:", password.length);
      
      const user = await storage.getUserByEmail(email);
      console.log("[LOGIN DEBUG] User found:", user ? "YES" : "NO");
      console.log("[LOGIN DEBUG] User has password:", user?.password ? "YES" : "NO");
      
      if (!user || !user.password) {
        console.log("[LOGIN DEBUG] Failed: User not found or no password");
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const isValid = verifyPassword(password, user.password);
      console.log("[LOGIN DEBUG] Password valid:", isValid);
      
      if (!isValid) {
        console.log("[LOGIN DEBUG] Failed: Invalid password");
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      console.log("[LOGIN DEBUG] Login successful for:", email);
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.log("[LOGIN DEBUG] Error:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const forgotPasswordSchema = z.object({
        email: z.string().email(),
      });
      const { email } = validateBody(forgotPasswordSchema, req.body);
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ message: "If the email exists, a password reset link has been sent." });
      }
      
      const { randomBytes } = await import("crypto");
      const resetToken = randomBytes(32).toString("hex");
      const resetTokenExpiry = new Date(Date.now() + 3600000);
      
      await storage.updateUser(user.id, {
        resetToken,
        resetTokenExpiry,
      });
      
      const { sendPasswordResetEmail } = await import("./notifications");
      await sendPasswordResetEmail(user.email, user.name, resetToken);
      
      res.json({ message: "If the email exists, a password reset link has been sent." });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const resetPasswordSchema = z.object({
        token: z.string().min(1),
        password: z.string().min(6),
      });
      const { token, password } = validateBody(resetPasswordSchema, req.body);
      
      const allUsers = await storage.getAllUsers();
      const user = allUsers.find(u => u.resetToken === token);
      
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      if (!user.resetTokenExpiry) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      const expiryDate = new Date(user.resetTokenExpiry);
      const now = new Date();
      
      if (now > expiryDate) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      const hashedPassword = hashPassword(password);
      await storage.updateUser(user.id, {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      });
      
      res.json({ message: "Password has been reset successfully" });
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
          if (userLat && userLng && mover.latitude !== null && mover.longitude !== null) {
            distance = calculateDistance(
              userLat,
              userLng,
              mover.latitude,
              mover.longitude
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
      // SECURITY: Require authentication
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Verify the user is updating their own mover profile
      const mover = await storage.getMover(req.params.id);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      // Only the mover themselves or an admin can update the profile
      if (mover.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "You can only update your own profile" });
      }
      
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
        vehicleColor: true,
        licensePlate: true,
        vehiclePhoto: true,
        moverImage: true,
      });
      const updates = validateBody(updateSchema, req.body);
      
      // VERIFICATION CHECK: If trying to go online, verify all requirements are met
      if (updates.isAvailable === true && user.role !== "admin") {
        const requiredTypes = ['ID', 'DRIVERS_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_PHOTOS', 'INSURANCE', 'BACKGROUND_CHECK', 'PAYOUT_SETUP'];
        const items = await db.select().from(verificationItems).where(eq(verificationItems.moverId, req.params.id));
        
        const now = new Date();
        const missingItems: string[] = [];
        const incompleteItems: { type: string; status: string }[] = [];
        
        for (const type of requiredTypes) {
          const item = items.find(i => i.type === type);
          
          if (!item) {
            missingItems.push(type);
            incompleteItems.push({ type, status: 'missing' });
          } else if (item.expiryDate && item.expiryDate < now) {
            incompleteItems.push({ type, status: 'expired' });
          } else if (item.status !== 'approved') {
            incompleteItems.push({ type, status: item.status });
          }
        }
        
        if (incompleteItems.length > 0) {
          return res.status(400).json({ 
            error: "VERIFICATION_INCOMPLETE",
            message: "You must complete all verification requirements before going online",
            missingItems,
            incompleteItems
          });
        }
      }
      
      const updatedMover = await storage.updateMover(req.params.id, updates);
      res.json(updatedMover);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== VERIFICATION HELPER FUNCTIONS =====
  
  async function getDriverVerificationSummary(moverId: string) {
    const REQUIRED_TYPES = [
      'GOVERNMENT_ID_SELFIE',
      'DRIVERS_LICENSE',
      'VEHICLE_REGISTRATION',
      'VEHICLE_PHOTOS',
      'INSURANCE_PROOF',
      'BACKGROUND_CHECK',
      'PAYOUT_SETUP'
    ];

    const items = await db.select().from(verificationItems).where(eq(verificationItems.moverId, moverId));
    const now = new Date();

    let approvedCount = 0;
    let hasExpired = false;
    let hasRejected = false;

    for (const type of REQUIRED_TYPES) {
      const item = items.find(i => i.type === type);
      if (item) {
        if (item.status === 'Approved') {
          if (item.expiresAt && new Date(item.expiresAt) < now) {
            hasExpired = true;
          } else {
            approvedCount++;
          }
        } else if (item.status === 'Rejected') {
          hasRejected = true;
        } else if (item.expiresAt && new Date(item.expiresAt) < now) {
          hasExpired = true;
        }
      }
    }

    let overallStatus = 'INCOMPLETE';
    if (hasExpired || hasRejected) {
      overallStatus = 'ATTENTION';
    } else if (approvedCount === REQUIRED_TYPES.length) {
      overallStatus = 'APPROVED';
    }

    return {
      approvedCount,
      totalRequired: REQUIRED_TYPES.length,
      hasExpired,
      hasRejected,
      overallStatus,
      items
    };
  }
  
  // ===== VERIFICATION ROUTES =====
  
  app.get("/api/movers/:moverId/verification", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const mover = await storage.getMover(req.params.moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      if (mover.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const items = await db.select().from(verificationItems).where(eq(verificationItems.moverId, req.params.moverId));
      
      const now = new Date();
      const itemsWithExpiry = items.map(item => {
        if (item.expiryDate && item.expiryDate < now && item.status === 'approved') {
          return { ...item, status: 'expired' };
        }
        return item;
      });
      
      res.json(itemsWithExpiry);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const uploadDocs = multer({
    storage: storage_multer,
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/pdf';
      
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error("Only images and PDF files are allowed"));
      }
    }
  });

  app.post("/api/movers/:moverId/verification/:type", uploadDocs.array('files', 10), async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const mover = await storage.getMover(req.params.moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      if (mover.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const fileUrls = (req.files as Express.Multer.File[] || []).map(file => `/uploads/${file.filename}`);
      
      const itemData = {
        moverId: req.params.moverId,
        type: req.params.type.toUpperCase(),
        data: req.body.data || null,
        fileUrls: fileUrls.length > 0 ? fileUrls : null,
        status: 'under_review',
        submittedAt: new Date(),
        expiryDate: req.body.expiryDate || null,
      };
      
      const validatedData = validateBody(insertVerificationItemSchema, itemData);
      
      const existing = await db.select().from(verificationItems)
        .where(and(
          eq(verificationItems.moverId, req.params.moverId),
          eq(verificationItems.type, req.params.type.toUpperCase())
        ))
        .limit(1);
      
      let result;
      if (existing.length > 0) {
        result = await db.update(verificationItems)
          .set({
            ...validatedData,
            updatedAt: new Date()
          })
          .where(eq(verificationItems.id, existing[0].id))
          .returning();
      } else {
        result = await db.insert(verificationItems)
          .values(validatedData)
          .returning();
      }
      
      res.json(result[0]);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/movers/:moverId/verification-status", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const mover = await storage.getMover(req.params.moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      if (mover.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const requiredTypes = ['ID', 'DRIVERS_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_PHOTOS', 'INSURANCE', 'BACKGROUND_CHECK', 'PAYOUT_SETUP'];
      
      const items = await db.select().from(verificationItems).where(eq(verificationItems.moverId, req.params.moverId));
      
      const now = new Date();
      const missingItems: string[] = [];
      const incompleteItems: { type: string; status: string; reason?: string }[] = [];
      
      for (const type of requiredTypes) {
        const item = items.find(i => i.type === type);
        
        if (!item) {
          missingItems.push(type);
          incompleteItems.push({ type, status: 'missing' });
        } else if (item.expiryDate && item.expiryDate < now) {
          incompleteItems.push({ type, status: 'expired', reason: 'Document has expired' });
        } else if (item.status !== 'approved') {
          incompleteItems.push({ 
            type, 
            status: item.status, 
            reason: item.rejectionReason || undefined 
          });
        }
      }
      
      const isComplete = incompleteItems.length === 0;
      
      res.json({
        isComplete,
        requiredItems: requiredTypes,
        missingItems,
        incompleteItems,
        canGoOnline: isComplete
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/movers/:moverId/verification/:id/review", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const user = (req as any).user;
      
      const { status, rejectionReason } = req.body;
      
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
      }
      
      const result = await db.update(verificationItems)
        .set({
          status,
          rejectionReason: status === 'rejected' ? rejectionReason : null,
          reviewedAt: new Date(),
          reviewedBy: user.id,
          updatedAt: new Date()
        })
        .where(eq(verificationItems.id, req.params.id))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "Verification item not found" });
      }
      
      res.json(result[0]);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== ADMIN VERIFICATION DASHBOARD ROUTES =====
  
  // GET /api/admin/verification/drivers - List all drivers with verification summaries
  app.get("/api/admin/verification/drivers", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { search, statusFilter, page = '1', pageSize = '20' } = req.query;
      const pageNum = parseInt(page as string);
      const pageSizeNum = parseInt(pageSize as string);
      const offset = (pageNum - 1) * pageSizeNum;

      // Get all movers with their users
      const moversQuery = await db
        .select({
          mover: moversTable,
          user: usersTable
        })
        .from(moversTable)
        .leftJoin(usersTable, eq(moversTable.userId, usersTable.id))
        .limit(pageSizeNum)
        .offset(offset);

      // Filter by search term
      let filteredMovers = moversQuery;
      if (search) {
        const searchLower = (search as string).toLowerCase();
        filteredMovers = moversQuery.filter(({ mover, user }) => 
          user?.name.toLowerCase().includes(searchLower) ||
          user?.email.toLowerCase().includes(searchLower) ||
          user?.phone?.toLowerCase().includes(searchLower) ||
          mover.id.includes(searchLower)
        );
      }

      // Get verification summaries for each mover
      const driversWithVerification = await Promise.all(
        filteredMovers.map(async ({ mover, user }) => {
          const summary = await getDriverVerificationSummary(mover.id);
          const lastVerificationItem = summary.items.length > 0 
            ? summary.items.sort((a, b) => 
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
              )[0]
            : null;

          return {
            driverId: mover.id,
            name: user?.name || 'Unknown',
            email: user?.email || '',
            phone: user?.phone || '',
            rating: mover.rating,
            overallStatus: summary.overallStatus,
            approvedCount: summary.approvedCount,
            totalRequired: summary.totalRequired,
            hasExpired: summary.hasExpired,
            hasRejected: summary.hasRejected,
            isAvailable: mover.isAvailable,
            lastUpdated: lastVerificationItem?.updatedAt || mover.createdAt,
          };
        })
      );

      // Filter by status
      let finalDrivers = driversWithVerification;
      if (statusFilter && statusFilter !== 'ALL') {
        finalDrivers = driversWithVerification.filter(d => {
          if (statusFilter === 'MISSING_REQUIRED') {
            return d.approvedCount < d.totalRequired;
          }
          return d.overallStatus === statusFilter;
        });
      }

      res.json({
        drivers: finalDrivers,
        total: finalDrivers.length,
        page: pageNum,
        pageSize: pageSizeNum,
      });
    } catch (error) {
      console.error('Admin verification drivers error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/verification/driver/:driverId - Get detailed driver verification info
  app.get("/api/admin/verification/driver/:driverId", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { driverId } = req.params;

      // Get mover and user info
      const mover = await storage.getMover(driverId);
      if (!mover) {
        return res.status(404).json({ error: "Driver not found" });
      }

      const user = await storage.getUser(mover.userId);
      const summary = await getDriverVerificationSummary(driverId);

      res.json({
        driver: {
          id: mover.id,
          userId: mover.userId,
          name: user?.name || 'Unknown',
          email: user?.email || '',
          phone: user?.phone || '',
          moverImage: mover.moverImage,
          bio: mover.bio,
          rating: mover.rating,
          totalMoves: mover.totalMoves,
          isAvailable: mover.isAvailable,
          vehicleType: mover.vehicleType,
          vehicleColor: mover.vehicleColor,
          licensePlate: mover.licensePlate,
          vehiclePhoto: mover.vehiclePhoto,
          profileVerified: mover.profileVerified,
          documentsVerified: mover.documentsVerified,
        },
        verificationSummary: {
          overallStatus: summary.overallStatus,
          approvedCount: summary.approvedCount,
          totalRequired: summary.totalRequired,
          hasExpired: summary.hasExpired,
          hasRejected: summary.hasRejected,
        },
        verificationItems: summary.items,
      });
    } catch (error) {
      console.error('Admin driver detail error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/admin/verification/item/:id - Approve/reject verification item
  app.patch("/api/admin/verification/item/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const user = (req as any).user;
      
      const { status, rejectionReason } = req.body;
      
      if (!['Approved', 'Rejected', 'Under Review'].includes(status)) {
        return res.status(400).json({ error: "Status must be 'Approved', 'Rejected', or 'Under Review'" });
      }
      
      if (status === 'Rejected' && !rejectionReason) {
        return res.status(400).json({ error: "Rejection reason is required when rejecting" });
      }
      
      const result = await db.update(verificationItems)
        .set({
          status,
          rejectionReason: status === 'Rejected' ? rejectionReason : null,
          reviewedAt: new Date(),
          reviewedBy: user.id,
          updatedAt: new Date()
        })
        .where(eq(verificationItems.id, parseInt(req.params.id)))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "Verification item not found" });
      }

      // Stub notification hook
      const item = result[0];
      if (status === 'Approved') {
        console.log(`[Notification] Verification item ${item.type} approved for mover ${item.moverId}`);
        // TODO: Send notification: "Your ${item.type} has been approved. You're one step closer to going online."
      } else if (status === 'Rejected') {
        console.log(`[Notification] Verification item ${item.type} rejected for mover ${item.moverId}: ${rejectionReason}`);
        // TODO: Send notification: "Your ${item.type} was rejected: ${rejectionReason}. Please upload a corrected version."
      }
      
      res.json(result[0]);
    } catch (error) {
      console.error('Admin verification item update error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== BOOKING ROUTES =====
  app.post("/api/bookings", async (req: Request, res: Response) => {
    try {
      // SECURITY: Require authentication
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Only customers can create bookings
      if (user.role !== "customer") {
        return res.status(403).json({ error: "Only customers can create bookings" });
      }
      
      // Validate booking data - customerId will be added from authenticated user
      const bookingData = validateBody(
        insertBookingSchema.extend({
          customerId: z.string().optional(),
          pickupAddress: z.string().min(1, "Pickup address is required"),
          dropoffAddress: z.string().min(1, "Dropoff address is required")
        }),
        { ...req.body, customerId: user.id }
      );
      
      // Geocode addresses to get coordinates
      const { geocodeAddress } = await import("@shared/geocoding");
      const { calculatePrice } = await import("@shared/pricing");
      const { findNearestMovers, calculateExpiryTime } = await import("@shared/matching");
      const { toDecimalString } = await import("@shared/utils");
      const { getDrivingDistance } = await import("./google-maps");
      
      const pickupGeo = geocodeAddress(bookingData.pickupAddress);
      const dropoffGeo = geocodeAddress(bookingData.dropoffAddress);
      
      // Calculate driving distance and duration using Google Distance Matrix API
      const drivingDistanceResult = await getDrivingDistance(pickupGeo.coordinates, dropoffGeo.coordinates);
      const distance = drivingDistanceResult.distanceKm;
      const priceBreakdown = calculatePrice(
        distance,
        bookingData.loadSize as 'small' | 'medium' | 'large',
        bookingData.pickupDifficulty as any,
        bookingData.dropoffDifficulty as any,
        bookingData.heavyItem || false,
        bookingData.numberOfMovers as 1 | 2
      );
      
      // Create booking with geocoded data, price breakdown, and AI metadata
      // SECURITY: Use authenticated user's ID, not from request body
      const booking = await storage.createBooking({
        customerId: user.id,
        pickupAddress: bookingData.pickupAddress,
        dropoffAddress: bookingData.dropoffAddress,
        loadSize: bookingData.loadSize,
        preferredDate: typeof bookingData.preferredDate === 'string' ? new Date(bookingData.preferredDate) : bookingData.preferredDate,
        pickupDifficulty: bookingData.pickupDifficulty,
        dropoffDifficulty: bookingData.dropoffDifficulty,
        heavyItem: bookingData.heavyItem || false,
        numberOfMovers: bookingData.numberOfMovers,
        ...(bookingData.additionalDetails && { additionalDetails: bookingData.additionalDetails }),
        ...(bookingData.images && { images: bookingData.images }),
        ...(bookingData.aiWeightClass && { aiWeightClass: bookingData.aiWeightClass }),
        ...(bookingData.aiRecommendedVehicle && { aiRecommendedVehicle: bookingData.aiRecommendedVehicle }),
        ...(bookingData.aiConfidenceScore !== undefined && { aiConfidenceScore: bookingData.aiConfidenceScore }),
        ...(bookingData.estimatedWeightLbs !== undefined && { estimatedWeightLbs: bookingData.estimatedWeightLbs }),
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
      } as any);
      
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
      
      // Use AI-recommended vehicle type for intelligent mover filtering
      const nearestMovers = findNearestMovers(
        pickupGeo.coordinates,
        dropoffGeo.coordinates,
        bookingData.loadSize as 'small' | 'medium' | 'large',
        moversWithUserData,
        {},
        bookingData.aiRecommendedVehicle || null
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
      
      // Send email notifications
      const customer = await storage.getUser(bookingData.customerId);
      if (customer) {
        // Send booking confirmation to customer
        await notificationService.sendBookingConfirmation(customer, booking);
        
        // Send job assignment emails to movers
        await Promise.all(
          nearestMovers.map(async (mover) => {
            const moverUser = await storage.getUser(mover.userId);
            if (moverUser) {
              await notificationService.sendJobAssignment(
                moverUser,
                booking,
                mover.estimatedEarnings.toFixed(2)
              );
            }
          })
        );
      }
      
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
      // CRITICAL SECURITY: Require authentication
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      let bookings;
      
      // SECURITY: Force filtering based on user role - ignore query parameters
      if (user.role === "customer") {
        // Customers can ONLY see their own bookings
        bookings = await storage.getBookingsByCustomer(user.id);
      } else if (user.role === "mover") {
        // Movers can see:
        // 1. Bookings assigned to them
        // 2. Available/unassigned bookings (pending status, moverId = null)
        const movers = await storage.getMoversByUserId(user.id);
        if (movers.length === 0) {
          return res.json([]); // Mover profile not set up yet
        }
        const moverId = movers[0].id;
        
        // Get assigned bookings
        const assignedBookings = await storage.getBookingsByMover(moverId);
        
        // Get all pending bookings (available to accept)
        const allPendingBookings = await storage.getAllBookings();
        const availableBookings = allPendingBookings.filter(
          (b) => b.status === "pending" && b.moverId === null
        );
        
        // Combine both sets (remove duplicates)
        const bookingMap = new Map();
        [...assignedBookings, ...availableBookings].forEach((b) => bookingMap.set(b.id, b));
        bookings = Array.from(bookingMap.values());
      } else if (user.role === "admin") {
        // Admins can filter by customerId or moverId or see all
        const customerId = req.query.customerId as string | undefined;
        const moverId = req.query.moverId as string | undefined;
        
        if (customerId) {
          bookings = await storage.getBookingsByCustomer(customerId);
        } else if (moverId) {
          bookings = await storage.getBookingsByMover(moverId);
        } else {
          bookings = await storage.getAllBookings();
        }
      } else {
        return res.status(403).json({ error: "Access denied" });
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
              userId: moverUser.id,
              moverImage: mover.moverImage,
              user: { id: moverUser.id, name: moverUser.name },
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
      
      // 4. Send email notifications
      const customer = await storage.getUser(updatedBooking.customerId);
      const mover = await storage.getMover(moverId);
      if (customer && mover) {
        const moverUser = await storage.getUser(mover.userId);
        if (moverUser) {
          await notificationService.sendMoverAssigned(customer, moverUser, updatedBooking);
        }
      }
      
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
      const updateSchema = z.object({
        status: z.string().optional(),
        preferredDate: z.union([z.string(), z.date()]).optional(),
        distance: z.string().optional(),
        price: z.string().optional(),
        paymentStatus: z.string().optional(),
        stripePaymentIntentId: z.string().optional(),
        currentLatitude: z.number().optional(),
        currentLongitude: z.number().optional(),
        locationUpdatedAt: z.date().optional(),
      });
      let updates = validateBody(updateSchema, req.body);
      
      // Convert preferredDate to Date if it's a string
      if (updates.preferredDate && typeof updates.preferredDate === 'string') {
        updates = { ...updates, preferredDate: new Date(updates.preferredDate) };
      }
      
      // SECURITY: If status is being changed to in_transit, require authentication and verify authorization
      if (updates.status === "in_transit") {
        if (!requireUser(req, res)) return;
        const user = (req as any).user;
        
        const booking = await storage.getBooking(req.params.id);
        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }
        
        if (!booking.moverId) {
          return res.status(403).json({ error: "No mover assigned to this booking" });
        }
        
        const mover = await storage.getMover(booking.moverId);
        if (!mover || mover.userId !== user.id) {
          return res.status(403).json({ error: "You are not authorized to start this trip" });
        }
        
        // Verify booking is in confirmed status before allowing in_transit
        if (booking.status !== "confirmed") {
          return res.status(400).json({ error: "Booking must be confirmed before starting trip" });
        }
      }
      
      const booking = await storage.updateBooking(req.params.id, updates as any);
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
            description: `LervIT booking from ${booking.pickupAddress} to ${booking.dropoffAddress}`,
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
          description: `LervIT booking from ${booking.pickupAddress} to ${booking.dropoffAddress}`,
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
            
            // Send payment receipt email
            const customer = await storage.getUser(booking.customerId);
            if (customer) {
              await notificationService.sendPaymentReceipt(
                customer,
                booking,
                booking.price || '0'
              );
            }
            
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
            
          }
          break;
          
        default:
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

  // ===== EARNINGS ROUTES =====
  app.get("/api/movers/:moverId/earnings", async (req: Request, res: Response) => {
    try {
      const moverId = req.params.moverId;
      
      // Verify mover exists
      const mover = await storage.getMover(moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      // Get all bookings for this mover (returns empty array if none found)
      const allBookings = await storage.getBookingsByMover(moverId);
      
      // Calculate earnings from completed bookings with payment succeeded
      const completedBookings = allBookings.filter(
        b => b.status === 'completed' && b.paymentStatus === 'succeeded'
      );
      
      // Calculate earnings from confirmed bookings with payment succeeded (pending payout)
      const confirmedBookings = allBookings.filter(
        b => (b.status === 'confirmed' || b.status === 'in_progress') && b.paymentStatus === 'succeeded'
      );
      
      const totalEarnings = completedBookings.reduce(
        (sum, b) => sum + parseFloat(b.price || '0'),
        0
      );
      
      const pendingEarnings = confirmedBookings.reduce(
        (sum, b) => sum + parseFloat(b.price || '0'),
        0
      );
      
      // Get earnings breakdown by month
      const earningsByMonth: Record<string, { earnings: number; count: number }> = {};
      completedBookings.forEach(booking => {
        const month = format(new Date(booking.createdAt), 'MMM yyyy');
        if (!earningsByMonth[month]) {
          earningsByMonth[month] = { earnings: 0, count: 0 };
        }
        earningsByMonth[month].earnings += parseFloat(booking.price || '0');
        earningsByMonth[month].count += 1;
      });
      
      res.json({
        totalEarnings: totalEarnings.toFixed(2),
        pendingEarnings: pendingEarnings.toFixed(2),
        completedJobs: completedBookings.length,
        pendingJobs: confirmedBookings.length,
        earningsByMonth: Object.entries(earningsByMonth).map(([month, data]) => ({
          month,
          earnings: data.earnings.toFixed(2),
          jobCount: data.count,
        })),
        recentBookings: completedBookings.slice(0, 10).map(b => ({
          id: b.id,
          customerName: (b as any).customer?.name || 'Unknown',
          pickupAddress: b.pickupAddress,
          dropoffAddress: b.dropoffAddress,
          date: b.preferredDate,
          earnings: b.price,
          status: b.status,
          paymentStatus: b.paymentStatus,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch earnings" });
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

  // ===== STRICT LOAD SIZE CATEGORIZATION RULES =====
  // These mappings are MANDATORY and cannot be overridden
  const STRICT_LARGE_ITEMS = [
    'sofa', 'couch', 'sectional', 'loveseat', 'futon',
    'bed', 'mattress', 'bedframe',
    'fridge', 'refrigerator', 'freezer',
    'washer', 'dryer', 'dishwasher',
    'dresser', 'wardrobe', 'armoire',
    'bookcase', 'bookshelf',
    'treadmill', 'elliptical', 'exercise equipment'
  ];

  const STRICT_APARTMENT_ITEMS = [
    'bedroom set', 'living room set', 'dining room set',
    'apartment', 'studio', 'room furniture'
  ];

  const STRICT_BOXES_ITEMS = [
    'shoe', 'shoes', 'bag', 'backpack', 'suitcase', 'luggage',
    'box', 'boxes', 'lamp', 'monitor', 'keyboard',
    'book', 'books', 'toy', 'toys', 'pillow', 'cushion'
  ];

  // Mock AI photo analysis (fallback when OpenAI is unavailable)
  function mockPhotoAnalysis(fileSize: number, filename: string) {
    // Analyze file size in MB to estimate load
    const sizeMB = fileSize / (1024 * 1024);
    
    // New volume-based load size categories:
    // boxes: 1-10 ft³ (small personal items, boxes, bags)
    // medium: 11-50 ft³ (chairs, small tables, TVs)
    // large: 50-150 ft³ (sofas, beds, fridges, appliances)
    // apartment: 150+ ft³ (full room furniture)
    let loadSize: "boxes" | "medium" | "large" | "apartment" = "medium";
    let heavyItem = false;
    let recommendedMovers = 1;
    let itemType = "Household item";
    let estimatedWeight: "light" | "medium" | "heavy" = "medium";
    let weightClass: "light" | "medium" | "heavy" = "medium";
    let estimatedWeightLbs = 200;
    let recommendedVehicle = "Cargo Van";
    
    // Filename pattern detection - Enhanced with more specific descriptions
    const lowerName = filename.toLowerCase();
    
    // ===== STRICT ENFORCEMENT: Check against mandatory categorization lists =====
    // PRIORITY 1: Apartment-sized items (MUST be "apartment")
    for (const item of STRICT_APARTMENT_ITEMS) {
      if (lowerName.includes(item)) {
        loadSize = "apartment";
        break;
      }
    }
    
    // PRIORITY 2: Large items (MUST be "large") - SOFAS, BEDS, FRIDGES, etc.
    if (loadSize !== "apartment") {
      for (const item of STRICT_LARGE_ITEMS) {
        if (lowerName.includes(item)) {
          loadSize = "large";
          break;
        }
      }
    }
    
    // PRIORITY 3: Small items (MUST be "boxes")
    if (loadSize !== "apartment" && loadSize !== "large") {
      for (const item of STRICT_BOXES_ITEMS) {
        if (lowerName.includes(item)) {
          loadSize = "boxes";
          break;
        }
      }
    }
    
    // File size analysis ONLY if no strict match was found
    if (loadSize === "medium") {
      if (sizeMB < 1) {
        loadSize = "boxes";
        estimatedWeight = "light";
        weightClass = "light";
        estimatedWeightLbs = 30;
        recommendedMovers = 1;
        recommendedVehicle = "SUV";
        itemType = "Small item or personal belonging";
      } else if (sizeMB > 3) {
        loadSize = "large";
        estimatedWeight = "heavy";
        weightClass = "heavy";
        estimatedWeightLbs = 600;
        heavyItem = true;
        recommendedMovers = 2;
        recommendedVehicle = "Cube Truck";
        itemType = "Large furniture piece";
      }
    }
    
    // Furniture - Seating
    if (lowerName.includes('sofa') || lowerName.includes('couch') || lowerName.includes('sectional')) {
      itemType = lowerName.includes('sectional') ? "Sectional sofa" : "Sofa";
      loadSize = "large"; // 50-150 ft³: Large furniture
      weightClass = "medium";
      estimatedWeightLbs = 300;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cargo Van";
    } else if (lowerName.includes('chair')) {
      if (lowerName.includes('office') || lowerName.includes('desk')) {
        itemType = "Office chair";
      } else if (lowerName.includes('dining')) {
        itemType = "Dining chair";
      } else if (lowerName.includes('arm')) {
        itemType = "Armchair";
      } else {
        itemType = "Chair";
      }
      loadSize = "medium"; // 11-50 ft³: Small furniture
      weightClass = "light";
      estimatedWeightLbs = 40;
      recommendedMovers = 1;
      recommendedVehicle = "SUV";
    } else if (lowerName.includes('stool')) {
      itemType = "Stool";
      loadSize = "boxes"; // 1-10 ft³: Very small items
      weightClass = "light";
      estimatedWeightLbs = 25;
      recommendedMovers = 1;
      recommendedVehicle = "SUV";
    }
    
    // Furniture - Tables
    else if (lowerName.includes('table')) {
      if (lowerName.includes('coffee')) {
        itemType = "Coffee table";
        loadSize = "medium"; // 11-50 ft³
        estimatedWeightLbs = 80;
      } else if (lowerName.includes('dining')) {
        itemType = "Dining table";
        loadSize = "large"; // 50-150 ft³: Large furniture
        estimatedWeightLbs = 200;
        recommendedMovers = 2;
      } else if (lowerName.includes('side') || lowerName.includes('end')) {
        itemType = "Side table";
        loadSize = "boxes"; // 1-10 ft³: Very small items
        estimatedWeightLbs = 40;
      } else {
        itemType = "Table";
        loadSize = "medium"; // 11-50 ft³
        estimatedWeightLbs = 120;
      }
      weightClass = "medium";
      recommendedVehicle = "Pickup";
    } else if (lowerName.includes('desk')) {
      itemType = lowerName.includes('standing') ? "Standing desk" : "Desk";
      loadSize = "medium"; // 11-50 ft³: Small furniture
      weightClass = "medium";
      estimatedWeightLbs = 150;
      recommendedMovers = 1;
      recommendedVehicle = "Pickup";
    }
    
    // Furniture - Beds
    else if (lowerName.includes('bed')) {
      if (lowerName.includes('king')) {
        itemType = "King-size bed";
        estimatedWeightLbs = 350;
      } else if (lowerName.includes('queen')) {
        itemType = "Queen-size bed";
        estimatedWeightLbs = 280;
      } else if (lowerName.includes('twin') || lowerName.includes('single')) {
        itemType = "Twin bed";
        estimatedWeightLbs = 180;
      } else {
        itemType = "Bed frame";
        estimatedWeightLbs = 250;
      }
      loadSize = "large"; // 50-150 ft³: Large furniture
      weightClass = "medium";
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cargo Van";
    } else if (lowerName.includes('mattress')) {
      if (lowerName.includes('king')) {
        itemType = "King-size mattress";
        estimatedWeightLbs = 150;
      } else if (lowerName.includes('queen')) {
        itemType = "Queen-size mattress";
        estimatedWeightLbs = 120;
      } else {
        itemType = "Mattress";
        estimatedWeightLbs = 100;
      }
      loadSize = "large"; // 50-150 ft³: Large item
      weightClass = "medium";
      recommendedMovers = 2;
      recommendedVehicle = "Cargo Van";
    }
    
    // Appliances
    else if (lowerName.includes('fridge') || lowerName.includes('refrigerator')) {
      itemType = lowerName.includes('mini') ? "Mini fridge" : "Refrigerator";
      loadSize = "large"; // 50-150 ft³: Large appliance
      weightClass = "heavy";
      estimatedWeightLbs = lowerName.includes('mini') ? 100 : 550;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    } else if (lowerName.includes('washer') || lowerName.includes('dryer')) {
      itemType = lowerName.includes('washer') ? "Washing machine" : "Dryer";
      loadSize = "large"; // 50-150 ft³: Large appliance
      weightClass = "heavy";
      estimatedWeightLbs = 500;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    } else if (lowerName.includes('appliance') || lowerName.includes('stove') || lowerName.includes('oven')) {
      itemType = "Kitchen appliance";
      loadSize = "large"; // 50-150 ft³: Large appliance
      weightClass = "heavy";
      estimatedWeightLbs = 400;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    } else if (lowerName.includes('treadmill') || lowerName.includes('exercise')) {
      itemType = "Treadmill";
      loadSize = "large"; // 50-150 ft³: Large equipment
      weightClass = "heavy";
      estimatedWeightLbs = 450;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    }
    
    // Storage & Shelving
    else if (lowerName.includes('dresser') || lowerName.includes('drawer')) {
      itemType = "Dresser";
      loadSize = "large"; // 50-150 ft³: Large furniture
      weightClass = "medium";
      estimatedWeightLbs = 250;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cargo Van";
    } else if (lowerName.includes('bookshelf') || lowerName.includes('bookcase')) {
      itemType = "Bookshelf";
      loadSize = "medium"; // 11-50 ft³: Medium furniture
      weightClass = "medium";
      estimatedWeightLbs = 120;
      recommendedMovers = 1;
      recommendedVehicle = "Pickup";
    } else if (lowerName.includes('cabinet') || lowerName.includes('cupboard')) {
      itemType = "Cabinet";
      loadSize = "medium"; // 11-50 ft³: Medium furniture
      weightClass = "medium";
      estimatedWeightLbs = 180;
      recommendedMovers = 2;
      recommendedVehicle = "Pickup";
    }
    
    // Small items & Personal belongings
    else if (lowerName.includes('box') || lowerName.includes('boxes')) {
      itemType = "Moving boxes";
      loadSize = "boxes"; // 1-10 ft³: Boxes category
      weightClass = "light";
      estimatedWeightLbs = 40;
      recommendedMovers = 1;
      recommendedVehicle = "SUV";
    } else if (lowerName.includes('shoe') || lowerName.includes('sneaker') || lowerName.includes('boot')) {
      itemType = "Shoes";
      loadSize = "boxes"; // 1-10 ft³: Very small items
      weightClass = "light";
      estimatedWeightLbs = 5;
      recommendedMovers = 1;
      recommendedVehicle = "Car";
    } else if (lowerName.includes('bag') || lowerName.includes('luggage') || lowerName.includes('suitcase')) {
      itemType = lowerName.includes('suitcase') ? "Suitcase" : (lowerName.includes('backpack') ? "Backpack" : "Bag");
      loadSize = "boxes"; // 1-10 ft³: Very small items
      weightClass = "light";
      estimatedWeightLbs = 15;
      recommendedMovers = 1;
      recommendedVehicle = "Car";
    } else if (lowerName.includes('lamp') || lowerName.includes('light')) {
      itemType = lowerName.includes('floor') || lowerName.includes('standing') ? "Standing lamp" : "Lamp";
      loadSize = "boxes"; // 1-10 ft³: Small items
      weightClass = "light";
      estimatedWeightLbs = 20;
      recommendedMovers = 1;
      recommendedVehicle = "SUV";
    }
    
    // Electronics
    else if (lowerName.includes('tv') || lowerName.includes('television')) {
      itemType = "Television";
      loadSize = "medium"; // 11-50 ft³: Medium electronics
      weightClass = "medium";
      estimatedWeightLbs = 60;
      recommendedMovers = 1;
      recommendedVehicle = "SUV";
    } else if (lowerName.includes('monitor') || lowerName.includes('screen')) {
      itemType = "Monitor";
      loadSize = "boxes"; // 1-10 ft³: Small electronics
      weightClass = "light";
      estimatedWeightLbs = 25;
      recommendedMovers = 1;
      recommendedVehicle = "Car";
    }
    
    return {
      loadSize,
      heavyItem,
      recommendedMovers,
      itemType,
      estimatedWeight,
      weightClass,
      estimatedWeightLbs,
      recommendedVehicle,
      confidence: 75,
      explanation: `Based on image analysis, this appears to be a ${itemType.toLowerCase()} with ${estimatedWeight} weight (~${estimatedWeightLbs} lbs). We recommend ${recommendedMovers} mover${recommendedMovers > 1 ? 's' : ''} and a ${recommendedVehicle} for safe handling.`,
      allowManualOverride: true
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
                      text: `You are an expert moving estimator analyzing photos of items that need to be moved. Provide SPECIFIC, DETAILED item descriptions.

CRITICAL: Be very specific about what you see. Don't use generic terms like "furniture" or "item".

Examples of GOOD descriptions:
✅ "Queen-size bed frame"
✅ "L-shaped sectional sofa"
✅ "Leather office chair"
✅ "Cardboard moving boxes (3 stacked)"
✅ "Pair of running shoes"
✅ "Large suitcase"
✅ "King-size mattress"
✅ "Wooden dining table (6-seater)"
✅ "Mini fridge"
✅ "Standing lamp"
✅ "Backpack"
✅ "Coffee table (glass top)"

Examples of BAD descriptions (too generic):
❌ "Furniture"
❌ "Item"
❌ "Object"
❌ "Thing"

Analyze the image and determine:
1. **Specific item description** - Be detailed! (e.g., "Sectional sofa", "Queen bed", "Running shoes", "Luggage bag")
2. Load size based on VOLUME (FT³):
   - "boxes": 1-10 ft³ (small personal items: shoes, bags, boxes, lamps, monitors)
   - "medium": 11-50 ft³ (small furniture: chairs, small tables, TVs, bookshelves)
   - "large": 50-150 ft³ (large furniture: sofas, beds, fridges, appliances, dressers, treadmills)
   - "apartment": 150+ ft³ (full room furniture or multiple large items)
3. Is it heavy/fragile requiring special care? (true/false)
4. Recommended movers: 1 or 2
5. Weight category: light (<100 lbs), medium (100-500 lbs), heavy (>500 lbs)
6. Approximate weight in pounds
7. Recommended vehicle: Car, SUV, Pickup, Cargo Van, Cube Truck, or Flatbed

⚠️ STRICT MANDATORY CATEGORIZATION RULES (CANNOT BE OVERRIDDEN):

MUST classify as "large" (50-150 ft³):
- ALL sofas, couches, sectionals, loveseats, futons
- ALL beds, mattresses, bed frames (twin, full, queen, king)
- ALL refrigerators, freezers, fridges
- ALL washers, dryers, dishwashers
- ALL dressers, wardrobes, armoires
- ALL bookcases, bookshelves
- ALL treadmills, ellipticals, exercise equipment

MUST classify as "apartment" (150+ ft³):
- Bedroom sets, living room sets, dining room sets
- Full room furniture or multiple large items

MUST classify as "boxes" (1-10 ft³):
- Shoes, bags, backpacks, suitcases, luggage
- Boxes, lamps, monitors, keyboards
- Books, toys, pillows, cushions

Load Size Classification Guidelines:
- If you see a SOFA, COUCH, SECTIONAL, BED, FRIDGE, DRESSER, or BOOKSHELF → MUST be "large"
- Shoes, bags, boxes, lamps, monitors → "boxes" (1-10 ft³)
- Chairs, small tables, TVs → "medium" (11-50 ft³)
- Full room furniture sets → "apartment" (150+ ft³)

Respond with VALID JSON only:
{
  "loadSize": "boxes" | "medium" | "large" | "apartment",
  "heavyItem": true | false,
  "recommendedMovers": 1 | 2,
  "itemType": "SPECIFIC description here (e.g., 'Queen-size bed', 'Leather sofa', 'Running shoes')",
  "estimatedWeight": "light" | "medium" | "heavy",
  "weightClass": "light" | "medium" | "heavy",
  "estimatedWeightLbs": number,
  "recommendedVehicle": "Car" | "SUV" | "Pickup" | "Cargo Van" | "Cube Truck" | "Flatbed",
  "confidence": 0-100,
  "explanation": "brief explanation with specific item details and volume estimate",
  "allowManualOverride": true
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
                let analysis = JSON.parse(jsonMatch[0]);
                
                // ===== STRICT VALIDATION: Enforce mandatory categorization rules =====
                const itemTypeLower = (analysis.itemType || '').toLowerCase();
                
                // Force "large" for specific items (SOFAS, BEDS, FRIDGES, etc.)
                for (const item of STRICT_LARGE_ITEMS) {
                  if (itemTypeLower.includes(item)) {
                    if (analysis.loadSize !== "large" && analysis.loadSize !== "apartment") {
                      console.log(`[AI Validation] Correcting ${analysis.itemType} from "${analysis.loadSize}" to "large" (strict rule)`);
                      analysis.loadSize = "large";
                      analysis.heavyItem = true;
                      analysis.recommendedMovers = 2;
                    }
                    break;
                  }
                }
                
                // Force "apartment" for furniture sets
                for (const item of STRICT_APARTMENT_ITEMS) {
                  if (itemTypeLower.includes(item)) {
                    if (analysis.loadSize !== "apartment") {
                      console.log(`[AI Validation] Correcting ${analysis.itemType} from "${analysis.loadSize}" to "apartment" (strict rule)`);
                      analysis.loadSize = "apartment";
                      analysis.heavyItem = true;
                      analysis.recommendedMovers = 2;
                    }
                    break;
                  }
                }
                
                // Force "boxes" for small items
                for (const item of STRICT_BOXES_ITEMS) {
                  if (itemTypeLower.includes(item)) {
                    if (analysis.loadSize !== "boxes") {
                      console.log(`[AI Validation] Correcting ${analysis.itemType} from "${analysis.loadSize}" to "boxes" (strict rule)`);
                      analysis.loadSize = "boxes";
                      analysis.heavyItem = false;
                      analysis.recommendedMovers = 1;
                    }
                    break;
                  }
                }
                
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
      
      // Use Google Maps Geocoding API and Distance Matrix API for accurate results
      const { geocodeAddress, getDrivingDistance } = await import("./google-maps");
      
      // Geocode both addresses
      const pickupGeo = await geocodeAddress(pickupAddress);
      const dropoffGeo = await geocodeAddress(dropoffAddress);
      
      // Calculate actual driving distance using Google Distance Matrix API
      const result = await getDrivingDistance(pickupGeo.coordinates, dropoffGeo.coordinates);
      
      console.log(`[Distance API] ${pickupAddress} → ${dropoffAddress}: ${result.distanceKm}km (${result.success ? 'Google Maps' : 'Haversine fallback'})`);
      
      res.json({ 
        distance: result.distanceKm,
        durationMinutes: result.durationMinutes,
        success: result.success 
      });
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

  // Seed endpoint - ADMIN ONLY (for demo/development)
  app.post("/api/seed", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Only admins can seed data
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      // Delete existing test users to avoid conflicts
      const testEmails = [
        "john.doe@example.com",
        "mike.johnson@moveit.com",
        "sarah.chen@moveit.com"
      ];
      
      for (const email of testEmails) {
        const existingUsers = await db.select().from(usersTable).where(eq(usersTable.email, email));
        if (existingUsers.length > 0) {
          const existingUser = existingUsers[0];
          // Delete user's movers first (foreign key constraint)
          const movers = await storage.getMovers({ userId: existingUser.id });
          for (const mover of movers) {
            await db.delete(moversTable).where(eq(moversTable.id, mover.id));
          }
          // Delete user
          await db.delete(usersTable).where(eq(usersTable.id, existingUser.id));
        }
      }
      
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
        latitude: 51.0447,
        longitude: -114.0719,
        bio: "Professional mover with 5+ years experience",
        isAvailable: true
      });

      const mover2 = await storage.createMover({
        userId: moverUser2.id,
        vehicleType: "Cargo Van",
        vehicleCapacity: "1500 lbs",
        isVerified: true,
        location: "Calgary, AB",
        latitude: 51.0786,
        longitude: -113.9656,
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

  // ===== REAL-TIME LOCATION TRACKING =====
  
  // Update mover's current location during active trip
  app.post("/api/bookings/:bookingId/location", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const { bookingId } = req.params;
      const { latitude, longitude } = req.body;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ error: "Latitude and longitude are required" });
      }
      
      // Verify booking exists and is in transit
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // SECURITY: Verify the user is the assigned mover
      if (!booking.moverId) {
        return res.status(403).json({ error: "No mover assigned to this booking" });
      }
      
      const mover = await storage.getMover(booking.moverId);
      if (!mover || mover.userId !== user.id) {
        return res.status(403).json({ error: "You are not authorized to update location for this booking" });
      }
      
      if (booking.status !== 'in_transit') {
        return res.status(400).json({ error: "Booking is not in transit" });
      }
      
      // Update location
      const updatedBooking = await storage.updateBooking(bookingId, {
        currentLatitude: latitude,
        currentLongitude: longitude,
        locationUpdatedAt: new Date()
      });
      
      res.json({
        success: true,
        location: {
          latitude: updatedBooking?.currentLatitude,
          longitude: updatedBooking?.currentLongitude,
          updatedAt: updatedBooking?.locationUpdatedAt
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to update location" });
    }
  });
  
  // Get current location for tracking
  app.get("/api/bookings/:bookingId/location", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const { bookingId } = req.params;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // SECURITY: Verify the user is either the customer or the mover for this booking
      const isCustomer = booking.customerId === user.id;
      const isMover = booking.moverId && (await storage.getMover(booking.moverId))?.userId === user.id;
      const isAdmin = user?.role === "admin";
      
      if (!isCustomer && !isMover && !isAdmin) {
        return res.status(403).json({ error: "You are not authorized to view this booking's location" });
      }
      
      res.json({
        bookingId: booking.id,
        status: booking.status,
        pickup: {
          address: booking.pickupAddress,
          latitude: booking.pickupLatitude,
          longitude: booking.pickupLongitude
        },
        dropoff: {
          address: booking.dropoffAddress,
          latitude: booking.dropoffLatitude,
          longitude: booking.dropoffLongitude
        },
        currentLocation: booking.currentLatitude && booking.currentLongitude ? {
          latitude: booking.currentLatitude,
          longitude: booking.currentLongitude,
          updatedAt: booking.locationUpdatedAt
        } : null
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch location" });
    }
  });

  // ===== AI PRODUCT IDENTIFIER ROUTES =====
  
  // POST /api/ai/items/identify - Identify items from photos
  // Supports pre-booking identification (without bookingId) or post-booking identification (with bookingId)
  app.post("/api/ai/items/identify", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const { bookingId, photoUrls } = req.body;
      
      if (!photoUrls || !Array.isArray(photoUrls) || photoUrls.length === 0) {
        return res.status(400).json({ error: "photoUrls array required" });
      }
      
      const user = (req as any).user;
      
      // If bookingId provided, verify it exists and belongs to user
      if (bookingId) {
        const booking = await storage.getBooking(bookingId);
        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }
        if (booking.customerId !== user.id && user.role !== 'admin') {
          return res.status(403).json({ error: "Not authorized" });
        }
      }
      
      // Import AI identifier (dynamic to avoid loading on startup)
      const { identifyAndCategorizeItem } = await import('./ai-identifier');
      
      console.log(`[AI Identifier] Processing ${photoUrls.length} photos in parallel...`);
      const startTime = Date.now();
      
      // Process ALL photos in parallel for speed
      const results = await Promise.allSettled(
        photoUrls.map(async (photoUrl: string, i: number) => {
          console.log(`[AI Identifier] Starting photo ${i + 1}/${photoUrls.length}: ${photoUrl}`);
          const result = await identifyAndCategorizeItem(photoUrl);
          console.log(`[AI Identifier] Completed photo ${i + 1}: ${result.itemName}`);
          return { photoUrl, result, index: i };
        })
      );
      
      const processingTime = Date.now() - startTime;
      console.log(`[AI Identifier] All ${photoUrls.length} photos processed in ${processingTime}ms`);
      
      // Collect results
      const items: any[] = [];
      const errors: any[] = [];
      
      for (const settled of results) {
        if (settled.status === 'fulfilled') {
          const { photoUrl, result, index } = settled.value;
          
          if (bookingId) {
            const identifiedItem = await storage.createIdentifiedItem({
              bookingId,
              photoUrl,
              processingStatus: 'completed',
              itemName: result.itemName,
              category: result.category,
              weightKg: result.weightKg.toString() as any,
              dimensionsLcm: result.dimensionsLcm.toString() as any,
              dimensionsWcm: result.dimensionsWcm.toString() as any,
              dimensionsHcm: result.dimensionsHcm.toString() as any,
              volumeCuft: result.volumeCuft.toString() as any,
              handlingComplexity: result.handlingComplexity,
              vehicleType: result.vehicleType,
              recommendedMovers: result.recommendedMovers,
              insuranceLevel: result.insuranceLevel,
              confidence: result.confidence.toString() as any,
              sourceMetadata: result.sourceMetadata,
            });
            items.push(identifiedItem);
          } else {
            items.push({
              id: `temp-${index}`,
              photoUrl,
              processingStatus: 'completed',
              itemName: result.itemName,
              category: result.category,
              weightKg: result.weightKg.toString(),
              dimensionsLcm: result.dimensionsLcm.toString(),
              dimensionsWcm: result.dimensionsWcm.toString(),
              dimensionsHcm: result.dimensionsHcm.toString(),
              volumeCuft: result.volumeCuft.toString(),
              handlingComplexity: result.handlingComplexity,
              vehicleType: result.vehicleType,
              recommendedMovers: result.recommendedMovers,
              insuranceLevel: result.insuranceLevel,
              confidence: result.confidence.toString(),
              sourceMetadata: result.sourceMetadata,
            });
          }
        } else {
          const error = settled.reason;
          const photoUrl = photoUrls[results.indexOf(settled)];
          console.error(`[AI Identifier] Error processing photo:`, error);
          
          items.push({
            id: `temp-${results.indexOf(settled)}`,
            photoUrl,
            processingStatus: 'failed',
            errorMessage: error?.message || 'Unknown error',
          });
          
          errors.push({
            photoUrl,
            error: error?.message || 'Unknown error',
          });
        }
      }
      
      res.json({
        success: true,
        items,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          total: photoUrls.length,
          successful: items.filter(i => i.processingStatus === 'completed').length,
          failed: errors.length,
        },
      });
    } catch (error: any) {
      console.error('[AI Identifier] Route error:', error);
      res.status(500).json({ error: "Failed to identify items" });
    }
  });
  
  // GET /api/ai/items/:bookingId - Get identified items for a booking
  app.get("/api/ai/items/:bookingId", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const { bookingId } = req.params;
      
      // Verify booking exists and user has access
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const user = (req as any).user;
      const isMover = booking.moverId && (await storage.getMover(booking.moverId))?.userId === user.id;
      
      if (booking.customerId !== user.id && !isMover && user.role !== 'admin') {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const items = await storage.getIdentifiedItemsByBooking(bookingId);
      res.json(items);
    } catch (error) {
      console.error('[AI Identifier] Get items error:', error);
      res.status(500).json({ error: "Failed to fetch identified items" });
    }
  });
  
  // PATCH /api/ai/items/:itemId - Manual override for identified item
  app.patch("/api/ai/items/:itemId", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const { itemId } = req.params;
      const updates = req.body;
      
      // Get the item to verify ownership
      const items = await db.select().from(identifiedItems).where(eq(identifiedItems.id, itemId)).limit(1);
      const item = items[0];
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Verify booking ownership
      const booking = await storage.getBooking(item.bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const user = (req as any).user;
      if (booking.customerId !== user.id && user.role !== 'admin') {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Update item
      const updated = await storage.updateIdentifiedItem(itemId, updates);
      res.json(updated);
    } catch (error) {
      console.error('[AI Identifier] Update item error:', error);
      res.status(500).json({ error: "Failed to update item" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
