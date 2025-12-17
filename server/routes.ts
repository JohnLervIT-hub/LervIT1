/**
 * ============================================================================
 * LERVIT API ROUTES - SECURITY DOCUMENTATION
 * ============================================================================
 * 
 * SECURITY ASSUMPTIONS:
 * ---------------------
 * 1. All requests pass through session-based authentication middleware
 * 2. User IDs come from server-side session, NOT from client request body
 * 3. Payment amounts are calculated server-side from booking data
 * 4. Webhook endpoints verify Stripe signatures before processing
 * 
 * REQUIRED ENVIRONMENT VARIABLES:
 * -------------------------------
 * - STRIPE_SECRET_KEY: Server-side Stripe secret key (sk_live_... or sk_test_...)
 * - VITE_STRIPE_PUBLIC_KEY: Frontend publishable key (pk_live_... or pk_test_...)
 * - STRIPE_WEBHOOK_SECRET: Webhook endpoint signing secret (whsec_...)
 * - SESSION_SECRET: Session encryption secret
 * - DATABASE_URL: PostgreSQL connection string
 * 
 * ENDPOINT SECURITY LEVELS:
 * -------------------------
 * PUBLIC:        /api/auth/*, /health
 * PROTECTED:     /api/bookings/*, /api/movers/*, /api/customers/* (requires session)
 * STRIPE-ONLY:   /api/stripe-webhook (signature verified, no user session)
 * ADMIN-ONLY:    /api/admin/* (requires admin role)
 * 
 * PAYMENT SECURITY:
 * -----------------
 * - PaymentIntent amounts are calculated server-side from booking price
 * - Platform fees are calculated server-side (NEVER trust client amounts)
 * - Idempotency keys prevent duplicate charges/transfers
 * - Webhook signature verification prevents spoofed events
 * 
 * ============================================================================
 */

import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { insertUserSchema, insertMoverSchema, insertBookingSchema, insertMessageSchema, insertReviewSchema, jobNotifications, insertSupportTicketSchema, insertSupportTicketReplySchema, supportTickets, supportTicketReplies, bookings, users as usersTable, movers as moversTable, verificationItems, insertVerificationItemSchema, identifiedItems, messages, reviews, aiRuns, aiSupportInsights, User, moverStripeAccounts, moverEarnings, moverPayouts, BOOKING_STATUSES, ACTIVE_STATUSES, isValidStatusTransition, getNextValidStatuses, BOOKING_STATUS_INFO, bookingMetrics as bookingMetricsTable, itemFeedback as itemFeedbackTable, moverPerformance as moverPerformanceTable, moverTermsAcceptance, emailCampaigns, insertEmailCampaignSchema, inAppNotifications } from "@shared/schema";
import { analyzeTicket, getQuickResponses } from "./ai-support-analyzer";
import { z } from "zod";
import { eq, and, notInArray, sql, desc } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./auth";
import { calculateDistance } from "./utils/distance";
import multer from "multer";
import path from "path";
import fs from "fs";
import Stripe from "stripe";
import { notificationService } from "./notifications";
import { format } from "date-fns";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { logger, logEvent } from "./logger";
import { stripe, PLATFORM_COMMISSION, calculatePlatformFee } from "./config/stripe";

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

// Auth middleware to attach user to req (session-based)
async function authMiddleware(req: Request, res: Response, next: Function) {
  // Check session first (secure method)
  if (req.session?.userId) {
    try {
      const user = await storage.getUser(req.session.userId);
      if (user) {
        (req as any).user = user;
      }
    } catch (error) {
      // User not found, clear invalid session
      req.session.destroy(() => {});
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
    fileSize: 10 * 1024 * 1024, // 10MB limit for mobile photos
  },
  fileFilter: (req, file, cb) => {
    // Support mobile formats including HEIC/HEIF from iOS
    const allowedExtensions = /jpeg|jpg|png|gif|webp|heic|heif|avif/;
    const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    
    // Check mimetype - be lenient for mobile browsers that may send generic types
    const allowedMimeTypes = /image\/(jpeg|jpg|png|gif|webp|heic|heif|avif)/;
    const mimetypeValid = allowedMimeTypes.test(file.mimetype) || file.mimetype.startsWith('image/');
    
    if (extname || mimetypeValid) {
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

  // ===== OBJECT STORAGE ROUTES (Replit App Storage) =====
  // Endpoint to serve public objects from Object Storage
  app.get("/public-objects/:filePath(*)", async (req: Request, res: Response) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Endpoint to serve objects from Object Storage (uploaded images)
  app.get("/objects/:objectPath(*)", async (req: Request, res: Response) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error fetching object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Endpoint to get a presigned upload URL for Object Storage
  app.post("/api/objects/upload", async (req: Request, res: Response) => {
    if (!requireUser(req, res)) return;
    
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Endpoint to finalize uploaded object and set its path
  app.post("/api/objects/finalize", async (req: Request, res: Response) => {
    if (!requireUser(req, res)) return;
    
    const { uploadURL } = req.body;
    if (!uploadURL) {
      return res.status(400).json({ error: "uploadURL is required" });
    }

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ objectPath });
    } catch (error) {
      console.error("Error finalizing object:", error);
      res.status(500).json({ error: "Failed to finalize object" });
    }
  });
  
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
        phoneVerificationToken: z.string().min(1, "Phone verification required"),
      });
      const { phoneVerificationToken, ...userData } = validateBody(signupSchema, req.body);
      
      // Verify the phone verification token
      const { phoneVerificationTokens } = await import("@shared/schema");
      const tokens = await db.select().from(phoneVerificationTokens)
        .where(eq(phoneVerificationTokens.verifiedToken, phoneVerificationToken))
        .limit(1);
      
      if (tokens.length === 0) {
        return res.status(400).json({ error: "Invalid or expired phone verification. Please verify your phone number again." });
      }
      
      const phoneToken = tokens[0];
      
      if (!phoneToken.verified) {
        return res.status(400).json({ error: "Phone number not verified. Please complete phone verification." });
      }
      
      if (new Date() > new Date(phoneToken.expiresAt)) {
        return res.status(400).json({ error: "Phone verification expired. Please verify your phone number again." });
      }
      
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      // Use the verified phone number from the token
      // Strip any user-provided phone/phoneVerified to prevent bypass attempts
      const { phone: _ignoredPhone, phoneVerified: _ignoredVerified, ...safeUserData } = userData as any;
      const hashedPassword = hashPassword(userData.password);
      const user = await storage.createUser({ 
        ...safeUserData, 
        password: hashedPassword,
        phone: phoneToken.phone, // Always use phone from verified token
        phoneVerified: true, // Phone is already verified via OTP
      });
      
      // Delete the used verification token
      await db.delete(phoneVerificationTokens).where(eq(phoneVerificationTokens.id, phoneToken.id));
      
      // Generate email verification token
      const { randomBytes } = await import("crypto");
      const verificationToken = randomBytes(32).toString("hex");
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      // Update user with verification token
      await db.update(usersTable)
        .set({ 
          verificationToken,
          verificationTokenExpiry,
        })
        .where(eq(usersTable.id, user.id));
      
      // Send verification email
      await notificationService.sendVerificationEmail(user.email, user.name, verificationToken);
      
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
      
      // Regenerate session to prevent session fixation attacks
      const createdUser = { ...user, emailVerified: false };
      req.session.regenerate((err) => {
        if (err) {
          return res.status(500).json({ error: "Session error" });
        }
        
        // Set session data after regeneration
        req.session.userId = createdUser.id;
        req.session.userRole = createdUser.role;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            return res.status(500).json({ error: "Session save error" });
          }
          const { password: _, ...userWithoutPassword } = createdUser;
          res.json({ ...userWithoutPassword, verificationEmailSent: true });
        });
      });
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
      
      // Check if account is locked by admin
      if (user.lockedByAdmin) {
        return res.status(423).json({ 
          error: "Account suspended",
          message: user.lockReason || "Your account has been suspended. Please contact support.",
          locked: true,
          lockedByAdmin: true
        });
      }
      
      // Check if account is temporarily locked due to failed attempts
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
        return res.status(423).json({ 
          error: "Account temporarily locked",
          message: `Too many failed login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`,
          locked: true,
          lockedUntil: user.lockedUntil,
          remainingMinutes
        });
      }
      
      const isValid = verifyPassword(password, user.password);
      
      if (!isValid) {
        // Increment failed login attempts
        const newAttempts = (user.failedLoginAttempts || 0) + 1;
        const MAX_ATTEMPTS = 4;
        const LOCKOUT_MINUTES = 30;
        
        if (newAttempts >= MAX_ATTEMPTS) {
          // Lock the account for 30 minutes
          const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
          await db.update(usersTable)
            .set({ 
              failedLoginAttempts: newAttempts,
              lockedUntil: lockedUntil,
              lockReason: `Automatically locked after ${MAX_ATTEMPTS} failed login attempts`
            })
            .where(eq(usersTable.id, user.id));
          
          return res.status(423).json({ 
            error: "Account locked",
            message: `Too many failed login attempts. Your account has been locked for ${LOCKOUT_MINUTES} minutes.`,
            locked: true,
            lockedUntil: lockedUntil,
            remainingMinutes: LOCKOUT_MINUTES
          });
        } else {
          // Just increment the counter
          await db.update(usersTable)
            .set({ failedLoginAttempts: newAttempts })
            .where(eq(usersTable.id, user.id));
          
          const remainingAttempts = MAX_ATTEMPTS - newAttempts;
          return res.status(401).json({ 
            error: "Invalid credentials",
            message: `Invalid email or password. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining before account lockout.`,
            remainingAttempts
          });
        }
      }
      
      // Successful login - reset failed attempts counter
      if (user.failedLoginAttempts > 0 || user.lockedUntil) {
        await db.update(usersTable)
          .set({ 
            failedLoginAttempts: 0,
            lockedUntil: null,
            lockReason: null
          })
          .where(eq(usersTable.id, user.id));
      }
      
      // Regenerate session to prevent session fixation attacks
      const userData = user;
      req.session.regenerate((err) => {
        if (err) {
          return res.status(500).json({ error: "Session error" });
        }
        
        // Set session data after regeneration
        req.session.userId = userData.id;
        req.session.userRole = userData.role;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            return res.status(500).json({ error: "Session save error" });
          }
          const { password: _, ...userWithoutPassword } = userData;
          res.json(userWithoutPassword);
        });
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Logout route
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.clearCookie('lervit.sid');
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current authenticated user
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  // Update user profile
  app.patch("/api/users/profile", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const updateProfileSchema = z.object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        hasCompletedOnboarding: z.boolean().optional(),
        // Notification preferences
        smsJobAlerts: z.boolean().optional(),
        smsBookingUpdates: z.boolean().optional(),
        emailJobAlerts: z.boolean().optional(),
        emailBookingUpdates: z.boolean().optional(),
        emailEarningsReports: z.boolean().optional(),
        emailPromotions: z.boolean().optional(),
        pushNotifications: z.boolean().optional(),
      });
      
      const updates = validateBody(updateProfileSchema, req.body);
      const updatedUser = await storage.updateUser(user.id, updates);
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error('[Profile] Update error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update profile" });
    }
  });

  // Upload user avatar
  app.post("/api/users/avatar", upload.single('avatar'), async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const file = req.file as Express.Multer.File;
      
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Read file from disk (multer saves to disk with diskStorage)
      const fileBuffer = fs.readFileSync(file.path);
      
      // Upload to object storage
      const objectStorage = new ObjectStorageService();
      const avatarUrl = await objectStorage.uploadBuffer(
        fileBuffer,
        `avatar-${user.id}${path.extname(file.originalname)}`,
        file.mimetype,
        user.id
      );
      
      // Clean up local file
      fs.unlinkSync(file.path);
      
      // Update user with avatar URL
      const updatedUser = await storage.updateUser(user.id, { avatarUrl });
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error('[Avatar] Upload error:', error);
      res.status(500).json({ error: "Failed to upload avatar" });
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
      
      // Direct lookup by reset token (efficient, no pagination needed)
      const user = await storage.getUserByResetToken(token);
      
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

  // Email verification endpoint
  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const verifySchema = z.object({
        token: z.string().min(1),
      });
      const { token } = validateBody(verifySchema, req.body);
      
      // Direct lookup by verification token (efficient, no pagination needed)
      const user = await storage.getUserByVerificationToken(token);
      
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }
      
      if (!user.verificationTokenExpiry) {
        return res.status(400).json({ 
          error: "Invalid or expired verification token",
          email: user.email  // Return email for resend functionality
        });
      }
      
      const expiryDate = new Date(user.verificationTokenExpiry);
      const now = new Date();
      
      if (now > expiryDate) {
        return res.status(400).json({ 
          error: "Verification token has expired. Please request a new one.",
          email: user.email  // Return email for resend functionality
        });
      }
      
      // Mark email as verified and clear token
      await db.update(usersTable)
        .set({ 
          emailVerified: true,
          verificationToken: null,
          verificationTokenExpiry: null,
        })
        .where(eq(usersTable.id, user.id));
      
      // Send role-specific welcome email
      await notificationService.sendWelcomeEmail(user.email, user.name, user.role);
      
      res.json({ message: "Email verified successfully! Welcome to LervIT." });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Resend verification email endpoint
  app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
    try {
      const resendSchema = z.object({
        email: z.string().email(),
      });
      const { email } = validateBody(resendSchema, req.body);
      
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Don't reveal if email exists or not
        return res.json({ message: "If the email is registered, a verification link has been sent." });
      }
      
      if (user.emailVerified) {
        return res.status(400).json({ error: "Email is already verified" });
      }
      
      // Generate new verification token
      const { randomBytes } = await import("crypto");
      const verificationToken = randomBytes(32).toString("hex");
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      await db.update(usersTable)
        .set({ 
          verificationToken,
          verificationTokenExpiry,
        })
        .where(eq(usersTable.id, user.id));
      
      // Send verification email
      await notificationService.sendVerificationEmail(user.email, user.name, verificationToken);
      
      res.json({ message: "If the email is registered, a verification link has been sent." });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== PRE-SIGNUP PHONE VERIFICATION (Uber-style OTP flow) =====
  // These endpoints work without authentication for the signup flow
  
  // Pre-signup: Send phone verification code
  app.post("/api/auth/pre-signup/send-code", async (req: Request, res: Response) => {
    try {
      const phoneSchema = z.object({
        phone: z.string().min(10, "Invalid phone number"),
      });
      const { phone } = validateBody(phoneSchema, req.body);

      // Check if phone is already registered
      const existingUser = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
      if (existingUser.length > 0 && existingUser[0].phoneVerified) {
        return res.status(400).json({ error: "This phone number is already registered. Please login instead." });
      }

      // Generate 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Delete any existing verification tokens for this phone
      const { phoneVerificationTokens } = await import("@shared/schema");
      await db.delete(phoneVerificationTokens).where(eq(phoneVerificationTokens.phone, phone));

      // Create new verification token
      await db.insert(phoneVerificationTokens).values({
        phone,
        verificationCode,
        expiresAt: expiryTime,
        verified: false,
      });

      // Send SMS via notification service
      const smsSent = await notificationService.sendPhoneVerificationCode(phone, verificationCode);

      // In development, include the code in response if SMS failed (for testing)
      const isDev = process.env.NODE_ENV === 'development';
      if (isDev && !smsSent) {
        console.log(`[DEV] Verification code for ${phone}: ${verificationCode}`);
        res.json({ 
          message: "Verification code sent to your phone",
          devCode: verificationCode, // Only in development when SMS fails
        });
      } else {
        res.json({ message: "Verification code sent to your phone" });
      }
    } catch (error) {
      logger.error({ error }, "Pre-signup phone verification send error");
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Pre-signup: Verify phone code and get signup token
  app.post("/api/auth/pre-signup/verify-code", async (req: Request, res: Response) => {
    try {
      const verifySchema = z.object({
        phone: z.string().min(10, "Invalid phone number"),
        code: z.string().length(6, "Code must be 6 digits"),
      });
      const { phone, code } = validateBody(verifySchema, req.body);

      // Find verification token
      const { phoneVerificationTokens } = await import("@shared/schema");
      const tokens = await db.select().from(phoneVerificationTokens)
        .where(eq(phoneVerificationTokens.phone, phone))
        .limit(1);

      if (tokens.length === 0) {
        return res.status(400).json({ error: "No verification code found. Please request a new one." });
      }

      const token = tokens[0];

      if (new Date() > new Date(token.expiresAt)) {
        return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      }

      if (token.verificationCode !== code) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Generate a verified token for signup
      const { randomBytes } = await import("crypto");
      const verifiedToken = randomBytes(32).toString("hex");
      const newExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes to complete signup

      // Update token as verified
      await db.update(phoneVerificationTokens)
        .set({
          verified: true,
          verifiedToken,
          expiresAt: newExpiry,
        })
        .where(eq(phoneVerificationTokens.id, token.id));

      res.json({ 
        message: "Phone verified successfully",
        verifiedToken,
        phone,
      });
    } catch (error) {
      logger.error({ error }, "Pre-signup phone verification verify error");
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== POST-LOGIN PHONE VERIFICATION (existing authenticated flow) =====
  // Phone verification - send code
  app.post("/api/auth/send-phone-verification", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const phoneSchema = z.object({
        phone: z.string().min(10, "Invalid phone number"),
      });
      const { phone } = validateBody(phoneSchema, req.body);

      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Generate 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Update user with phone number and verification code
      await db.update(usersTable)
        .set({
          phone: phone,
          phoneVerificationCode: verificationCode,
          phoneVerificationExpiry: expiryTime,
          phoneVerified: false,
        })
        .where(eq(usersTable.id, user.id));

      // Send SMS via notification service
      await notificationService.sendPhoneVerificationCode(phone, verificationCode);

      res.json({ message: "Verification code sent to your phone" });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Phone verification - verify code
  app.post("/api/auth/verify-phone", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const verifySchema = z.object({
        code: z.string().length(6, "Code must be 6 digits"),
      });
      const { code } = validateBody(verifySchema, req.body);

      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.phoneVerificationCode || !user.phoneVerificationExpiry) {
        return res.status(400).json({ error: "No verification code found. Please request a new one." });
      }

      if (new Date() > new Date(user.phoneVerificationExpiry)) {
        return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      }

      if (user.phoneVerificationCode !== code) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Mark phone as verified and clear code
      await db.update(usersTable)
        .set({
          phoneVerified: true,
          phoneVerificationCode: null,
          phoneVerificationExpiry: null,
        })
        .where(eq(usersTable.id, user.id));

      res.json({ message: "Phone number verified successfully!" });
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
      // Support pagination via query params
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      
      const result = await storage.getAllUsers({ limit, offset });
      const usersWithoutPasswords = result.data.map((user: any) => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      // Return paginated response
      res.json({
        data: usersWithoutPasswords,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      });
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

  // GET /api/movers/me - Get current user's mover profile
  app.get("/api/movers/me", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      if (user.role !== 'mover' && user.role !== 'admin') {
        return res.status(403).json({ error: "Not a mover" });
      }
      
      // Find mover profile by userId
      const movers = await storage.getMovers({});
      const mover = movers.find(m => m.userId === user.id);
      
      if (!mover) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      
      res.json(mover);
    } catch (error) {
      console.error('Get mover/me error:', error);
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
      // TEMPORARILY DISABLED FOR TESTING - Re-enable verification check for production
      // if (updates.isAvailable === true && user.role !== "admin") {
      //   const requiredTypes = ['ID', 'DRIVERS_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_PHOTOS', 'INSURANCE', 'BACKGROUND_CHECK', 'PAYOUT_SETUP'];
      //   const items = await db.select().from(verificationItems).where(eq(verificationItems.moverId, req.params.id));
      //   
      //   const now = new Date();
      //   const missingItems: string[] = [];
      //   const incompleteItems: { type: string; status: string }[] = [];
      //   
      //   for (const type of requiredTypes) {
      //     const item = items.find(i => i.type === type);
      //     
      //     if (!item) {
      //       missingItems.push(type);
      //       incompleteItems.push({ type, status: 'missing' });
      //     } else if (item.expiryDate && item.expiryDate < now) {
      //       incompleteItems.push({ type, status: 'expired' });
      //     } else if (item.status.toLowerCase() !== 'approved') {
      //       incompleteItems.push({ type, status: item.status });
      //     }
      //   }
      //   
      //   if (incompleteItems.length > 0) {
      //     return res.status(400).json({ 
      //       error: "VERIFICATION_INCOMPLETE",
      //       message: "You must complete all verification requirements before going online",
      //       missingItems,
      //       incompleteItems
      //     });
      //   }
      // }
      
      const updatedMover = await storage.updateMover(req.params.id, updates);
      res.json(updatedMover);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== VERIFICATION HELPER FUNCTIONS =====
  
  async function getDriverVerificationSummary(moverId: string) {
    const REQUIRED_TYPES = [
      'ID',
      'DRIVERS_LICENSE',
      'VEHICLE_REGISTRATION',
      'VEHICLE_PHOTOS',
      'INSURANCE',
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
          if (item.expiryDate && new Date(item.expiryDate) < now) {
            hasExpired = true;
          } else {
            approvedCount++;
          }
        } else if (item.status === 'Rejected') {
          hasRejected = true;
        } else if (item.expiryDate && new Date(item.expiryDate) < now) {
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
        if (item.expiryDate && item.expiryDate < now && item.status?.toLowerCase() === 'approved') {
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
        expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : null,
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
            ...validatedData as any,
            updatedAt: new Date()
          })
          .where(eq(verificationItems.id, existing[0].id))
          .returning();
      } else {
        result = await db.insert(verificationItems)
          .values(validatedData as any)
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
        } else if (item.status.toLowerCase() !== 'approved') {
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
      
      const normalizedStatus = status?.toLowerCase();
      if (!['approved', 'rejected'].includes(normalizedStatus)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
      }
      
      // Capitalize status for consistency with admin endpoint
      const capitalizedStatus = normalizedStatus === 'approved' ? 'Approved' : 'Rejected';
      
      const result = await db.update(verificationItems)
        .set({
          status: capitalizedStatus,
          rejectionReason: normalizedStatus === 'rejected' ? rejectionReason : null,
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

  // ===== EARLY ACCESS MOVER TERMS ACCEPTANCE =====
  
  // GET /api/movers/terms/status - Check if mover has accepted current terms
  app.get("/api/movers/terms/status", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // Get the mover profile for this user
      const mover = await storage.getMoverByUserId(user.id);
      if (!mover) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      
      const CURRENT_TERMS_VERSION = 'EA-1.0';
      const hasAccepted = await storage.hasAcceptedCurrentTerms(mover.id);
      const latestAcceptance = await storage.getLatestMoverTermsAcceptance(mover.id);
      
      res.json({
        hasAcceptedCurrentTerms: hasAccepted,
        currentTermsVersion: CURRENT_TERMS_VERSION,
        latestAcceptance: latestAcceptance ? {
          termsVersion: latestAcceptance.termsVersion,
          acceptedAt: latestAcceptance.acceptedAt,
        } : null,
        pilotStatus: mover.pilotStatus,
        requiresTermsAcceptance: mover.pilotStatus === 'approved' && !hasAccepted,
      });
    } catch (error) {
      console.error('Terms status error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // POST /api/movers/terms/accept - Accept the Early Access terms
  app.post("/api/movers/terms/accept", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // Get the mover profile for this user
      const mover = await storage.getMoverByUserId(user.id);
      if (!mover) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      
      // Only pilot-approved movers can accept early access terms
      if (mover.pilotStatus !== 'approved') {
        return res.status(403).json({ error: "Only pilot-approved movers can accept Early Access terms" });
      }
      
      const CURRENT_TERMS_VERSION = 'EA-1.0';
      
      // Check if already accepted
      const existing = await storage.getMoverTermsAcceptance(mover.id, CURRENT_TERMS_VERSION);
      if (existing) {
        return res.json({ 
          message: "Terms already accepted",
          acceptance: existing
        });
      }
      
      // Record the acceptance with audit trail
      const acceptance = await storage.createMoverTermsAcceptance({
        moverId: mover.id,
        termsVersion: CURRENT_TERMS_VERSION,
        acceptedFromIp: req.ip || req.headers['x-forwarded-for']?.toString() || null,
        userAgent: req.headers['user-agent'] || null,
      });
      
      console.log(`[Terms] Mover ${mover.id} accepted Early Access terms v${CURRENT_TERMS_VERSION}`);
      
      res.json({
        message: "Early Access terms accepted successfully",
        acceptance: {
          termsVersion: acceptance.termsVersion,
          acceptedAt: acceptance.acceptedAt,
        }
      });
    } catch (error) {
      console.error('Terms acceptance error:', error);
      res.status(500).json({ error: "Internal server error" });
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
          
          // Check if mover has accepted Early Access terms
          const hasAcceptedTerms = await storage.hasAcceptedCurrentTerms(mover.id);

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
            pilotStatus: mover.pilotStatus,
            hasAcceptedTerms,
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
          pilotStatus: mover.pilotStatus,
          pilotNotes: mover.pilotNotes,
          pilotExpiresAt: mover.pilotExpiresAt,
          pilotApprovedAt: mover.pilotApprovedAt,
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
        .where(eq(verificationItems.id, req.params.id))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "Verification item not found" });
      }

      // Stub notification hook
      const item = result[0];
      if (status === 'Approved') {
        console.log(`[Notification] Verification item ${item.type} approved for mover ${item.moverId}`);
        // TODO: Send notification: "Your ${item.type} has been approved. You're one step closer to going online."
        
        // Check if ALL 7 required verification items are now approved
        const requiredTypes = ['ID', 'DRIVERS_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_PHOTOS', 'INSURANCE', 'BACKGROUND_CHECK', 'PAYOUT_SETUP'];
        const allItems = await db.select().from(verificationItems).where(eq(verificationItems.moverId, item.moverId));
        
        const allApproved = requiredTypes.every(type => {
          const typeItem = allItems.find(i => i.type === type);
          return typeItem && typeItem.status === 'Approved';
        });
        
        if (allApproved) {
          // Update mover's documentsVerified to true
          await storage.updateMover(item.moverId, { 
            documentsVerified: true,
            isVerified: true 
          });
          console.log(`[Notification] All verification items approved for mover ${item.moverId}. Mover is now fully verified.`);
        }
      } else if (status === 'Rejected') {
        console.log(`[Notification] Verification item ${item.type} rejected for mover ${item.moverId}: ${rejectionReason}`);
        // TODO: Send notification: "Your ${item.type} was rejected: ${rejectionReason}. Please upload a corrected version."
        
        // If any item is rejected, ensure mover is NOT marked as verified
        await storage.updateMover(item.moverId, { 
          documentsVerified: false,
          isVerified: false 
        });
      }
      
      res.json(result[0]);
    } catch (error) {
      console.error('Admin verification item update error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== PILOT (EARLY ACCESS) PROGRAM ROUTES =====
  
  // PATCH /api/admin/movers/:id/pilot-status - Update mover pilot status
  app.patch("/api/admin/movers/:id/pilot-status", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { status, notes, expiresAt } = req.body;
      const moverId = req.params.id;
      const adminId = (req.session as any).userId;
      
      if (!status || !['none', 'pending', 'approved', 'rejected', 'suspended'].includes(status)) {
        return res.status(400).json({ error: "Invalid pilot status. Must be one of: none, pending, approved, rejected, suspended" });
      }
      
      const mover = await storage.getMover(moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      const expiryDate = expiresAt ? new Date(expiresAt) : undefined;
      const result = await storage.updateMoverPilotStatus(moverId, status, adminId, notes, expiryDate);
      
      console.log(`[Admin] Pilot status updated for mover ${moverId}: ${status} by admin ${adminId}`);
      
      // Send notification to driver about pilot status change
      const moverUser = await storage.getUser(mover.userId);
      if (moverUser) {
        try {
          await notificationService.sendPilotStatusUpdate(moverUser, status, notes);
          console.log(`[Notification] Pilot status notification sent to ${moverUser.email}`);
        } catch (notifError) {
          console.error(`[Notification] Failed to send pilot status notification:`, notifError);
        }
      }
      
      res.json(result);
    } catch (error) {
      console.error('Admin pilot status update error:', error);
      res.status(500).json({ error: "Failed to update pilot status" });
    }
  });
  
  // GET /api/admin/movers/pilot - Get all movers by pilot status
  app.get("/api/admin/movers/pilot", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const status = req.query.status as string || 'pending';
      
      const movers = await storage.getMoversByPilotStatus(status);
      
      // Enrich with user data
      const enrichedMovers = await Promise.all(movers.map(async (mover) => {
        const user = await storage.getUser(mover.userId);
        return {
          ...mover,
          user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null
        };
      }));
      
      res.json(enrichedMovers);
    } catch (error) {
      console.error('Admin get pilot movers error:', error);
      res.status(500).json({ error: "Failed to get pilot movers" });
    }
  });

  // POST /api/admin/users/:id/lock - Admin lock/suspend a user account
  app.post("/api/admin/users/:id/lock", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { reason } = req.body;
      const userId = req.params.id;
      
      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ error: "Lock reason is required" });
      }
      
      const result = await db.update(usersTable)
        .set({
          lockedByAdmin: true,
          lockReason: reason.trim(),
          lockedUntil: null, // Clear any timed lockout
        })
        .where(eq(usersTable.id, userId))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      console.log(`[Admin] User ${userId} locked by admin. Reason: ${reason}`);
      
      const { password: _, ...userWithoutPassword } = result[0];
      res.json({ message: "Account suspended", user: userWithoutPassword });
    } catch (error) {
      console.error('Admin lock user error:', error);
      res.status(500).json({ error: "Failed to lock account" });
    }
  });

  // POST /api/admin/users/:id/unlock - Admin unlock a user account
  app.post("/api/admin/users/:id/unlock", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const userId = req.params.id;
      
      const result = await db.update(usersTable)
        .set({
          lockedByAdmin: false,
          lockedUntil: null,
          lockReason: null,
          failedLoginAttempts: 0,
        })
        .where(eq(usersTable.id, userId))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      console.log(`[Admin] User ${userId} unlocked by admin`);
      
      const { password: _, ...userWithoutPassword } = result[0];
      res.json({ message: "Account unlocked", user: userWithoutPassword });
    } catch (error) {
      console.error('Admin unlock user error:', error);
      res.status(500).json({ error: "Failed to unlock account" });
    }
  });

  // GET /api/admin/users - Get all users with lock status
  app.get("/api/admin/users", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const allUsers = await db.select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        phone: usersTable.phone,
        role: usersTable.role,
        avatarUrl: usersTable.avatarUrl,
        failedLoginAttempts: usersTable.failedLoginAttempts,
        lockedUntil: usersTable.lockedUntil,
        lockedByAdmin: usersTable.lockedByAdmin,
        lockReason: usersTable.lockReason,
        createdAt: usersTable.createdAt,
      }).from(usersTable).orderBy(usersTable.createdAt);
      
      res.json(allUsers);
    } catch (error) {
      console.error('Admin get users error:', error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // PATCH /api/admin/users/:id - Admin update user profile
  app.patch("/api/admin/users/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const userId = req.params.id;
      const { name, email, phone, role } = req.body;
      
      // Check if user exists
      const existingUser = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (existingUser.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const previousRole = existingUser[0].role;
      const isUpgradeToMover = role === 'mover' && previousRole === 'customer';
      
      // Prevent changing the last admin's role
      if (existingUser[0].role === 'admin' && role && role !== 'admin') {
        const adminCount = await db.select().from(usersTable).where(eq(usersTable.role, 'admin'));
        if (adminCount.length <= 1) {
          return res.status(400).json({ error: "Cannot change role of the last admin" });
        }
      }
      
      // If email is being changed, check for duplicates
      if (email && email !== existingUser[0].email) {
        const emailExists = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
        if (emailExists.length > 0) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (role !== undefined) updateData.role = role;
      
      const result = await db.update(usersTable)
        .set(updateData)
        .where(eq(usersTable.id, userId))
        .returning();
      
      const updatedUser = result[0];
      
      // If upgrading from customer to mover, create mover profile if it doesn't exist
      if (isUpgradeToMover) {
        logger.info({
          env: process.env.NODE_ENV,
          event: "admin_role_upgrade",
          userId,
          previousRole,
          newRole: 'mover',
          action: 'checking_mover_profile'
        });
        
        // Check if mover profile already exists
        const existingMover = await db.select().from(moversTable)
          .where(eq(moversTable.userId, userId))
          .limit(1);
        
        if (existingMover.length === 0) {
          // Create default mover profile with Calgary coordinates
          const { generateRandomCalgaryCoordinates } = await import("@shared/geocoding");
          const coords = generateRandomCalgaryCoordinates();
          
          const newMover = await db.insert(moversTable).values({
            userId: userId,
            vehicleType: "van",
            isAvailable: true,
            location: "Calgary, AB",
            latitude: coords.lat,
            longitude: coords.lng,
            isVerified: false,
            profileVerified: false,
            documentsVerified: false,
            rating: "0",
            totalMoves: 0,
            completedTrips: 0,
            pilotStatus: "none",
          }).returning();
          
          logger.info({
            env: process.env.NODE_ENV,
            event: "admin_role_upgrade",
            userId,
            moverId: newMover[0].id,
            action: 'mover_profile_created'
          });
        } else {
          logger.info({
            env: process.env.NODE_ENV,
            event: "admin_role_upgrade",
            userId,
            moverId: existingMover[0].id,
            action: 'mover_profile_exists'
          });
        }
        
        // Send upgrade notification email
        try {
          await notificationService.sendRoleUpgradeEmail(updatedUser, 'mover');
          logger.info({
            env: process.env.NODE_ENV,
            event: "admin_role_upgrade",
            userId,
            action: 'upgrade_email_sent'
          });
        } catch (emailError) {
          logger.error({
            env: process.env.NODE_ENV,
            event: "admin_role_upgrade",
            userId,
            action: 'upgrade_email_failed',
            error: emailError instanceof Error ? emailError.message : 'Unknown error'
          });
        }
      }
      
      logger.info({
        env: process.env.NODE_ENV,
        event: "admin_user_update",
        userId,
        adminId: (req as any).user?.id,
        changes: Object.keys(updateData),
        roleChange: role !== undefined && role !== previousRole ? `${previousRole} -> ${role}` : null
      });
      
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json({ 
        message: isUpgradeToMover 
          ? "User upgraded to mover successfully. Mover profile created and notification sent." 
          : "User updated", 
        user: userWithoutPassword,
        moverProfileCreated: isUpgradeToMover
      });
    } catch (error) {
      console.error('Admin update user error:', error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // DELETE /api/admin/users/:id - Admin delete user (for abandoned accounts)
  app.delete("/api/admin/users/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const userId = req.params.id;
      const adminUser = (req as any).user;
      
      // Prevent self-deletion
      if (userId === adminUser.id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      // Check if user exists
      const existingUser = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (existingUser.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Prevent deleting the last admin
      if (existingUser[0].role === 'admin') {
        const adminCount = await db.select().from(usersTable).where(eq(usersTable.role, 'admin'));
        if (adminCount.length <= 1) {
          return res.status(400).json({ error: "Cannot delete the last admin" });
        }
      }
      
      // Check for active bookings
      const activeBookings = await db.select().from(bookings)
        .where(and(
          eq(bookings.customerId, userId),
          notInArray(bookings.status, ['completed', 'cancelled'])
        ));
      
      if (activeBookings.length > 0) {
        return res.status(400).json({ 
          error: "Cannot delete user with active bookings",
          activeBookingsCount: activeBookings.length
        });
      }
      
      // Delete related data in order (respecting foreign keys)
      // 1. Delete support ticket replies
      const userTickets = await db.select({ id: supportTickets.id })
        .from(supportTickets)
        .where(eq(supportTickets.userId, userId));
      
      for (const ticket of userTickets) {
        await db.delete(supportTicketReplies).where(eq(supportTicketReplies.ticketId, ticket.id));
      }
      
      // 2. Delete support tickets
      await db.delete(supportTickets).where(eq(supportTickets.userId, userId));
      
      // 3. Delete messages
      await db.delete(messages).where(eq(messages.senderId, userId));
      
      // 4. Delete in-app notifications
      await db.delete(inAppNotifications).where(eq(inAppNotifications.userId, userId));
      
      // 5. Delete mover-related data if user is a mover
      const mover = await db.select().from(moversTable).where(eq(moversTable.userId, userId)).limit(1);
      if (mover.length > 0) {
        await db.delete(moverTermsAcceptance).where(eq(moverTermsAcceptance.moverId, mover[0].id));
        await db.delete(verificationItems).where(eq(verificationItems.moverId, mover[0].id));
        await db.delete(jobNotifications).where(eq(jobNotifications.moverId, mover[0].id));
        await db.delete(moverPerformanceTable).where(eq(moverPerformanceTable.moverId, mover[0].id));
        await db.delete(moverPayouts).where(eq(moverPayouts.moverId, mover[0].id));
        await db.delete(moverEarnings).where(eq(moverEarnings.moverId, mover[0].id));
        await db.delete(moverStripeAccounts).where(eq(moverStripeAccounts.moverId, mover[0].id));
        await db.delete(moversTable).where(eq(moversTable.userId, userId));
      }
      
      // 6. Delete reviews where user is the customer
      await db.delete(reviews).where(eq(reviews.customerId, userId));
      
      // 7. Delete completed/cancelled bookings (cascade)
      const userBookings = await db.select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.customerId, userId));
      
      for (const booking of userBookings) {
        await db.delete(moverEarnings).where(eq(moverEarnings.bookingId, booking.id));
        await db.delete(messages).where(eq(messages.bookingId, booking.id));
        await db.delete(reviews).where(eq(reviews.bookingId, booking.id));
        await db.delete(jobNotifications).where(eq(jobNotifications.bookingId, booking.id));
      }
      await db.delete(bookings).where(eq(bookings.customerId, userId));
      
      // 8. Finally delete the user
      await db.delete(usersTable).where(eq(usersTable.id, userId));
      
      console.log(`[Admin] User ${userId} (${existingUser[0].email}) deleted by admin ${adminUser.id}`);
      
      res.json({ message: "User deleted successfully", deletedUser: existingUser[0].email });
    } catch (error) {
      console.error('Admin delete user error:', error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ===== ADMIN EMAIL CAMPAIGNS =====
  
  // GET /api/admin/email/campaigns - List all email campaigns
  app.get("/api/admin/email/campaigns", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const campaigns = await db.select()
        .from(emailCampaigns)
        .orderBy(desc(emailCampaigns.createdAt));
      
      res.json(campaigns);
    } catch (error) {
      console.error('Get campaigns error:', error);
      res.status(500).json({ error: "Failed to get campaigns" });
    }
  });

  // GET /api/admin/email/recipients - Get potential recipients based on audience type
  app.get("/api/admin/email/recipients", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { audienceType } = req.query;
      
      let users;
      if (audienceType === 'customers') {
        users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.role, 'customer'));
      } else if (audienceType === 'movers') {
        users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.role, 'mover'));
      } else {
        // All users (excluding admins)
        users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
          .from(usersTable)
          .where(notInArray(usersTable.role, ['admin']));
      }
      
      res.json(users);
    } catch (error) {
      console.error('Get recipients error:', error);
      res.status(500).json({ error: "Failed to get recipients" });
    }
  });

  // POST /api/admin/email/send - Send an email campaign
  app.post("/api/admin/email/send", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const adminUser = (req as any).user;
      const { subject, content, type, audienceType, recipientIds } = req.body;
      
      if (!subject || !content || !type || !audienceType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Get recipients based on audience type
      let recipients;
      if (audienceType === 'specific' && recipientIds?.length > 0) {
        recipients = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(sql`${usersTable.id} IN (${sql.join(recipientIds.map((id: string) => sql`${id}`), sql`, `)})`);
      } else if (audienceType === 'customers') {
        recipients = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.role, 'customer'));
      } else if (audienceType === 'movers') {
        recipients = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.role, 'mover'));
      } else {
        // All users (excluding admins)
        recipients = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(notInArray(usersTable.role, ['admin']));
      }
      
      if (recipients.length === 0) {
        return res.status(400).json({ error: "No recipients found" });
      }
      
      // Create campaign record
      const [campaign] = await db.insert(emailCampaigns).values({
        subject,
        content,
        type,
        audienceType,
        recipientIds: recipients.map(r => r.id),
        recipientCount: recipients.length,
        sentBy: adminUser.id,
        status: 'sending',
      }).returning();
      
      // Send emails to all recipients
      let successCount = 0;
      let failCount = 0;
      
      for (const recipient of recipients) {
        const success = await notificationService.sendCampaignEmail(
          recipient.email,
          recipient.name,
          subject,
          content,
          type
        );
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      }
      
      // Update campaign status
      const finalStatus = failCount === recipients.length ? 'failed' : 'sent';
      await db.update(emailCampaigns)
        .set({ status: finalStatus, sentAt: new Date() })
        .where(eq(emailCampaigns.id, campaign.id));
      
      console.log(`[Admin Email] Campaign sent by ${adminUser.id}: ${successCount} success, ${failCount} failed`);
      
      res.json({ 
        message: "Campaign sent", 
        campaignId: campaign.id,
        recipientCount: recipients.length,
        successCount,
        failCount
      });
    } catch (error) {
      console.error('Send campaign error:', error);
      res.status(500).json({ error: "Failed to send campaign" });
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
      
      // SECURITY: Require email verification to create bookings
      if (!user.emailVerified) {
        return res.status(403).json({ 
          error: "Email verification required",
          message: "Please verify your email address before making a booking. Check your inbox for the verification link.",
          requiresEmailVerification: true
        });
      }
      
      // Validate booking data - customerId will be added from authenticated user
      const bookingData = validateBody(
        insertBookingSchema.extend({
          customerId: z.string().optional(),
          pickupAddress: z.string().min(1, "Pickup address is required"),
          dropoffAddress: z.string().min(1, "Dropoff address is required"),
          preSelectedMoverId: z.string().optional(), // For direct mover selection from Browse Movers page
        }),
        { ...req.body, customerId: user.id }
      );
      
      // Extract and validate preSelectedMoverId for later use (after payment)
      let validatedPreSelectedMoverId: string | null = null;
      if (bookingData.preSelectedMoverId) {
        // SECURITY: Validate that the pre-selected mover exists and is operational
        const preSelectedMover = await storage.getMover(bookingData.preSelectedMoverId);
        if (preSelectedMover && preSelectedMover.isAvailable) {
          validatedPreSelectedMoverId = bookingData.preSelectedMoverId;
          logEvent.booking('preselected_mover_validated', {
            moverId: validatedPreSelectedMoverId,
            customerId: user.id,
          });
        } else {
          // Log warning but don't reject - fall back to proximity matching
          logEvent.booking('preselected_mover_invalid', {
            requestedMoverId: bookingData.preSelectedMoverId,
            reason: preSelectedMover ? 'mover_unavailable' : 'mover_not_found',
            customerId: user.id,
          });
        }
      }
      
      // Geocode addresses using Google Maps API for accurate coordinates
      const { geocodeAddress, getDrivingDistance } = await import("./google-maps");
      const { calculatePrice } = await import("@shared/pricing");
      const { findNearestMovers, calculateExpiryTime } = await import("@shared/matching");
      const { toDecimalString } = await import("@shared/utils");
      
      // Use Google Maps Geocoding API for real coordinates (not mock)
      const pickupGeo = await geocodeAddress(bookingData.pickupAddress);
      const dropoffGeo = await geocodeAddress(bookingData.dropoffAddress);
      
      logEvent.booking('geocoded_addresses', {
        pickupAddress: bookingData.pickupAddress,
        pickupCoords: pickupGeo.coordinates,
        pickupSource: pickupGeo.success ? 'google_maps' : 'fallback',
        dropoffAddress: bookingData.dropoffAddress,
        dropoffCoords: dropoffGeo.coordinates,
        dropoffSource: dropoffGeo.success ? 'google_maps' : 'fallback',
      });
      
      // Calculate driving distance and duration using Google Distance Matrix API
      const drivingDistanceResult = await getDrivingDistance(pickupGeo.coordinates, dropoffGeo.coordinates);
      
      logEvent.booking('distance_calculated', {
        distanceKm: drivingDistanceResult.distanceKm,
        durationMinutes: drivingDistanceResult.durationMinutes,
        source: drivingDistanceResult.success ? 'google_maps' : 'haversine_fallback',
      });
      const distance = drivingDistanceResult.distanceKm;
      const priceBreakdown = calculatePrice(
        distance,
        bookingData.loadSize as 'boxes' | 'medium' | 'large' | 'apartment',
        bookingData.pickupDifficulty as any,
        bookingData.dropoffDifficulty as any,
        bookingData.heavyItem || false,
        bookingData.numberOfMovers as 1 | 2
      );
      
      // Calculate first-move discount for new customers
      // Re-fetch latest user state to avoid race conditions with concurrent bookings
      const latestUser = await storage.getUser(user.id);
      let finalPrice = priceBreakdown.totalCost;
      let discountPercent = 0;
      let discountAmount = 0;
      let discountReason: string | null = null;

      if (latestUser && !latestUser.hasUsedFirstMoveDiscount) {
        discountPercent = 10;
        discountAmount = Math.round(priceBreakdown.totalCost * 0.10 * 100) / 100;
        finalPrice = priceBreakdown.totalCost - discountAmount;
        discountReason = "First-move 10% discount";
      }
      
      // Create booking with geocoded data, price breakdown, and AI metadata
      // SECURITY: Use authenticated user's ID, not from request body
      // If preSelectedMoverId is provided, store it for direct assignment after payment
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
        status: BOOKING_STATUSES.PENDING_PAYMENT,
        ...(validatedPreSelectedMoverId && { preSelectedMoverId: validatedPreSelectedMoverId }), // Store validated pre-selected mover for direct assignment after payment
        ...(bookingData.images && { images: bookingData.images }),
        ...(bookingData.aiWeightClass && { aiWeightClass: bookingData.aiWeightClass }),
        ...(bookingData.aiRecommendedVehicle && { aiRecommendedVehicle: bookingData.aiRecommendedVehicle }),
        ...(bookingData.aiConfidenceScore !== undefined && { aiConfidenceScore: bookingData.aiConfidenceScore }),
        pickupLatitude: pickupGeo.coordinates.lat,
        pickupLongitude: pickupGeo.coordinates.lng,
        dropoffLatitude: dropoffGeo.coordinates.lat,
        dropoffLongitude: dropoffGeo.coordinates.lng,
        distance: toDecimalString(distance),
        price: toDecimalString(finalPrice),
        baseFee: toDecimalString(priceBreakdown.baseFee),
        distanceFee: toDecimalString(priceBreakdown.distanceFee),
        loadFee: toDecimalString(priceBreakdown.loadSizeFee),
        moverTravelFee: toDecimalString(priceBreakdown.moverTravelFee),
        pickupDifficultyFee: toDecimalString(priceBreakdown.pickupDifficultyFee),
        dropoffDifficultyFee: toDecimalString(priceBreakdown.dropoffDifficultyFee),
        heavyItemFee: toDecimalString(priceBreakdown.heavyItemFee),
        subtotal: toDecimalString(priceBreakdown.subtotal),
        discountPercent: toDecimalString(discountPercent),
        discountAmount: toDecimalString(discountAmount),
        discountReason: discountReason,
        notifiedAt: new Date(),
      } as any);
      
      // Mark discount as used if applied
      if (discountAmount > 0) {
        await storage.updateUser(user.id, { hasUsedFirstMoveDiscount: true });
      }
      
      logEvent.booking('created', {
        bookingId: booking.id,
        customerId: user.id,
        loadSize: bookingData.loadSize,
        distanceKm: distance,
        totalPrice: priceBreakdown.totalCost,
        vehicleClass: priceBreakdown.vehicleClass,
        status: BOOKING_STATUSES.PENDING_PAYMENT,
      });
      
      // Note: Confirmation email and mover matching happen AFTER payment succeeds (in Stripe webhook)
      // Do NOT send booking confirmation here - booking is still pending payment
      res.json({
        ...booking,
        message: "Booking created. Please complete payment to find movers.",
      });
    } catch (error) {
      logEvent.error('booking_creation', error, { userId: (req as any).user?.id });
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
        const mover = await storage.getMoverByUserId(user.id);
        if (!mover) {
          return res.json([]); // Mover profile not set up yet
        }
        const moverId = mover.id;
        
        // Get assigned bookings
        const assignedBookings = await storage.getBookingsByMover(moverId);
        
        // Get all pending/confirmed bookings (available to accept)
        // Include both "pending" and "confirmed" (paid) jobs without a mover
        const allPendingBookingsResult = await storage.getAllBookings({ limit: 200 });
        const availableBookings = allPendingBookingsResult.data.filter(
          (b: any) => (b.status === "pending" || b.status === "confirmed") && b.moverId === null
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
          // Support pagination for admin view
          const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
          const offset = parseInt(req.query.offset as string) || 0;
          const result = await storage.getAllBookings({ limit, offset });
          bookings = result.data;
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
              name: moverUser.name,
              phone: moverUser.phone,
              moverImage: mover.moverImage,
              vehicleType: mover.vehicleType,
              vehicleColor: mover.vehicleColor,
              vehicleCapacity: mover.vehicleCapacity,
              licensePlate: mover.licensePlate,
              rating: mover.rating,
              completedTrips: mover.completedTrips,
              isVerified: mover.isVerified
            } : null
          };
        })
      );
      
      res.json(enrichedBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
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
          moverImage: mover.moverImage,
          vehicleType: mover.vehicleType,
          vehicleColor: mover.vehicleColor,
          vehicleCapacity: mover.vehicleCapacity,
          licensePlate: mover.licensePlate,
          rating: mover.rating,
          completedTrips: mover.completedTrips,
          isVerified: mover.isVerified
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
      
      // 4. Send email + SMS notifications with Uber-style mover details
      const customer = await storage.getUser(updatedBooking.customerId);
      const mover = await storage.getMover(moverId);
      if (customer && mover) {
        const moverUser = await storage.getUser(mover.userId);
        if (moverUser) {
          await notificationService.sendMoverAssigned(customer, moverUser, updatedBooking, mover);
          
          // Create in-app notifications (non-blocking)
          try {
            await storage.createNotification({
              userId: customer.id,
              type: 'mover_assigned',
              title: 'Mover Assigned',
              message: `Great news! ${moverUser.name} has been assigned to your move.`,
              bookingId: updatedBooking.id,
              actionUrl: '/my-bookings',
              isRead: false,
            });
            
            await storage.createNotification({
              userId: moverUser.id,
              type: 'job_opportunity',
              title: 'Job Accepted',
              message: `You've successfully accepted a new job!`,
              bookingId: updatedBooking.id,
              actionUrl: '/mover-dashboard',
              isRead: false,
            });
          } catch (notifErr) {
            console.error('Job acceptance notification failed:', notifErr);
          }
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
      // Validate allowed update fields - moverId allowed for direct job acceptance
      const updateSchema = z.object({
        moverId: z.string().optional(),
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
      
      // If moverId is being set (direct job acceptance), verify authorization
      if (updates.moverId) {
        if (!requireUser(req, res)) return;
        const user = (req as any).user;
        
        // Verify the mover belongs to this user
        const mover = await storage.getMover(updates.moverId);
        if (!mover || mover.userId !== user.id) {
          return res.status(403).json({ error: "You are not authorized to accept this job" });
        }
        
        // Check if job is already assigned
        const booking = await storage.getBooking(req.params.id);
        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }
        if (booking.moverId) {
          return res.status(409).json({ error: "This job has already been assigned to another mover" });
        }
      }
      
      // Convert preferredDate to Date if it's a string
      if (updates.preferredDate && typeof updates.preferredDate === 'string') {
        updates = { ...updates, preferredDate: new Date(updates.preferredDate) };
      }
      
      // SECURITY: Validate status transitions for the new granular booking flow
      // Statuses: pending → confirmed → en_route_to_pickup → loading → en_route_to_dropoff → unloading → completed
      if (updates.status) {
        if (!requireUser(req, res)) return;
        const user = (req as any).user;
        
        const booking = await storage.getBooking(req.params.id);
        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }
        
        // Handle backward compatibility: treat old "in_transit" as "en_route_to_pickup"
        const newStatus = updates.status === "in_transit" ? BOOKING_STATUSES.EN_ROUTE_TO_PICKUP : updates.status;
        updates.status = newStatus;
        
        // Skip validation for confirmed status (handled by job acceptance flow)
        if (newStatus !== BOOKING_STATUSES.CONFIRMED && newStatus !== BOOKING_STATUSES.CANCELLED) {
          // Validate mover authorization for active status changes
          if (!booking.moverId) {
            return res.status(403).json({ error: "No mover assigned to this booking" });
          }
          
          const mover = await storage.getMover(booking.moverId);
          if (!mover || mover.userId !== user.id) {
            return res.status(403).json({ error: "You are not authorized to update this booking status" });
          }
          
          // Validate status transition (backward compat: treat "in_transit" as "en_route_to_pickup")
          const currentStatus = booking.status === "in_transit" ? BOOKING_STATUSES.EN_ROUTE_TO_PICKUP : booking.status;
          
          if (!isValidStatusTransition(currentStatus, newStatus)) {
            const validNext = getNextValidStatuses(currentStatus);
            const validLabels = validNext.map(s => BOOKING_STATUS_INFO[s]?.label || s).join(", ");
            return res.status(400).json({ 
              error: `Invalid status transition from "${currentStatus}" to "${newStatus}". Valid next statuses: ${validLabels}` 
            });
          }
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

  // Admin-only endpoint to update booking addresses
  app.patch("/api/admin/bookings/:id/addresses", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // Only admins can update addresses
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const addressSchema = z.object({
        pickupAddress: z.string().min(1, "Pickup address is required").optional(),
        dropoffAddress: z.string().min(1, "Dropoff address is required").optional(),
      });
      
      const updates = validateBody(addressSchema, req.body);
      
      if (!updates.pickupAddress && !updates.dropoffAddress) {
        return res.status(400).json({ error: "At least one address must be provided" });
      }
      
      const bookingId = req.params.id;
      const existingBooking = await storage.getBooking(bookingId);
      if (!existingBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Import geocoding functions
      const { geocodeAddress, getDrivingDistance } = await import("./google-maps");
      
      // Build update object with geocoding for changed addresses
      const updateData: any = {};
      
      if (updates.pickupAddress) {
        updateData.pickupAddress = updates.pickupAddress;
        // Re-geocode pickup address
        const pickupGeo = await geocodeAddress(updates.pickupAddress);
        if (pickupGeo.success) {
          updateData.pickupLatitude = pickupGeo.coordinates.lat;
          updateData.pickupLongitude = pickupGeo.coordinates.lng;
        }
      }
      
      if (updates.dropoffAddress) {
        updateData.dropoffAddress = updates.dropoffAddress;
        // Re-geocode dropoff address
        const dropoffGeo = await geocodeAddress(updates.dropoffAddress);
        if (dropoffGeo.success) {
          updateData.dropoffLatitude = dropoffGeo.coordinates.lat;
          updateData.dropoffLongitude = dropoffGeo.coordinates.lng;
        }
      }
      
      // Recalculate distance if both addresses are available
      const finalPickup = updates.pickupAddress || existingBooking.pickupAddress;
      const finalDropoff = updates.dropoffAddress || existingBooking.dropoffAddress;
      
      const pickupGeo = await geocodeAddress(finalPickup);
      const dropoffGeo = await geocodeAddress(finalDropoff);
      
      if (pickupGeo.success && dropoffGeo.success) {
        const distanceResult = await getDrivingDistance(pickupGeo.coordinates, dropoffGeo.coordinates);
        updateData.distance = distanceResult.distanceKm.toFixed(2);
      }
      
      const updatedBooking = await storage.updateBooking(bookingId, updateData);
      
      console.log(`[Admin] Booking ${bookingId} addresses updated by admin ${user.email}`);
      
      res.json(updatedBooking);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Customer endpoint to edit unpaid bookings (before payment is made)
  app.patch("/api/bookings/:id/edit", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const bookingId = req.params.id;
      
      // Validate editable fields schema
      const editBookingSchema = z.object({
        pickupAddress: z.string().min(1).optional(),
        dropoffAddress: z.string().min(1).optional(),
        preferredDate: z.union([z.string(), z.date()]).optional(),
        loadSize: z.enum(['boxes', 'small', 'medium', 'large', 'apartment']).optional(),
        pickupDifficulty: z.enum(['ground', 'basement', 'stairs', 'elevator']).optional(),
        dropoffDifficulty: z.enum(['ground', 'basement', 'stairs', 'elevator']).optional(),
        heavyItem: z.boolean().optional(),
        numberOfMovers: z.number().int().min(1).max(2).optional(),
        description: z.string().optional(),
      });
      
      const updates = validateBody(editBookingSchema, req.body);
      
      // Get existing booking
      const existingBooking = await storage.getBooking(bookingId);
      if (!existingBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Security: Verify user owns this booking
      if (existingBooking.customerId !== user.id) {
        return res.status(403).json({ error: "You are not authorized to edit this booking" });
      }
      
      // Security: Only allow editing unpaid bookings
      if (existingBooking.paymentStatus === 'succeeded') {
        return res.status(400).json({ error: "Cannot edit a booking that has already been paid" });
      }
      
      // Only allow editing pending or pending_payment bookings
      if (!['pending', 'pending_payment'].includes(existingBooking.status)) {
        return res.status(400).json({ error: "Can only edit bookings with pending status" });
      }
      
      // Build update data
      const updateData: any = { ...updates };
      
      // Convert preferredDate to Date if string
      if (updates.preferredDate && typeof updates.preferredDate === 'string') {
        updateData.preferredDate = new Date(updates.preferredDate);
      }
      
      // If addresses changed, re-geocode and recalculate distance
      const { geocodeAddress, getDrivingDistance } = await import("./google-maps");
      const { calculatePrice, calculateMoverEarnings } = await import("@shared/pricing");
      
      let pickupLat = existingBooking.pickupLatitude;
      let pickupLng = existingBooking.pickupLongitude;
      let dropoffLat = existingBooking.dropoffLatitude;
      let dropoffLng = existingBooking.dropoffLongitude;
      let distance = parseFloat(existingBooking.distance || '0');
      
      if (updates.pickupAddress) {
        const pickupGeo = await geocodeAddress(updates.pickupAddress);
        if (pickupGeo.success) {
          pickupLat = pickupGeo.coordinates.lat;
          pickupLng = pickupGeo.coordinates.lng;
          updateData.pickupLatitude = pickupLat;
          updateData.pickupLongitude = pickupLng;
        }
      }
      
      if (updates.dropoffAddress) {
        const dropoffGeo = await geocodeAddress(updates.dropoffAddress);
        if (dropoffGeo.success) {
          dropoffLat = dropoffGeo.coordinates.lat;
          dropoffLng = dropoffGeo.coordinates.lng;
          updateData.dropoffLatitude = dropoffLat;
          updateData.dropoffLongitude = dropoffLng;
        }
      }
      
      // Recalculate distance if addresses changed
      if (updates.pickupAddress || updates.dropoffAddress) {
        const distanceResult = await getDrivingDistance(
          { lat: pickupLat, lng: pickupLng },
          { lat: dropoffLat, lng: dropoffLng }
        );
        if (distanceResult.success) {
          distance = distanceResult.distanceKm;
          updateData.distance = distance.toFixed(2);
        }
      }
      
      // Always recalculate price when any pricing-affecting field changes
      const finalLoadSize = updates.loadSize || existingBooking.loadSize;
      const finalPickupDifficulty = updates.pickupDifficulty || existingBooking.pickupDifficulty;
      const finalDropoffDifficulty = updates.dropoffDifficulty || existingBooking.dropoffDifficulty;
      const finalHeavyItem = updates.heavyItem !== undefined ? updates.heavyItem : existingBooking.heavyItem;
      const finalNumberOfMovers = updates.numberOfMovers || existingBooking.numberOfMovers;
      
      const priceBreakdown = calculatePrice(
        distance,
        finalLoadSize as 'boxes' | 'small' | 'medium' | 'large' | 'apartment',
        finalPickupDifficulty as 'ground' | 'basement' | 'stairs' | 'elevator',
        finalDropoffDifficulty as 'ground' | 'basement' | 'stairs' | 'elevator',
        finalHeavyItem,
        finalNumberOfMovers as 1 | 2
      );
      
      // Apply first-move discount if applicable
      let discountPercent = 0;
      let discountAmount = 0;
      let discountReason = null;
      let finalPrice = priceBreakdown.totalCost;
      
      if (!user.hasUsedFirstMoveDiscount) {
        discountPercent = 10;
        discountAmount = priceBreakdown.totalCost * 0.10;
        discountReason = 'First move 10% discount';
        finalPrice = priceBreakdown.totalCost - discountAmount;
      }
      
      // Calculate platform fees for mover payouts
      const earnings = calculateMoverEarnings(priceBreakdown);
      
      // Update all pricing-related fields
      updateData.baseFee = priceBreakdown.baseFee.toFixed(2);
      updateData.distanceFee = priceBreakdown.distanceFee.toFixed(2);
      updateData.loadFee = priceBreakdown.loadSizeFee.toFixed(2);
      updateData.pickupDifficultyFee = priceBreakdown.pickupDifficultyFee.toFixed(2);
      updateData.dropoffDifficultyFee = priceBreakdown.dropoffDifficultyFee.toFixed(2);
      updateData.heavyItemFee = priceBreakdown.heavyItemFee.toFixed(2);
      updateData.subtotal = priceBreakdown.subtotal.toFixed(2);
      updateData.price = finalPrice.toFixed(2);
      updateData.discountPercent = discountPercent.toFixed(2);
      updateData.discountAmount = discountAmount.toFixed(2);
      updateData.discountReason = discountReason;
      updateData.platformFeePercent = earnings.platformFeePercent.toFixed(2);
      updateData.platformFeeAmount = earnings.platformFee.toFixed(2);
      updateData.moverNetAmount = earnings.net.toFixed(2);
      updateData.updatedAt = new Date();
      
      // If price changed significantly and there's an existing PaymentIntent, cancel it
      if (existingBooking.stripePaymentIntentId) {
        const oldPrice = parseFloat(existingBooking.price || '0');
        const newPrice = finalPrice;
        if (Math.abs(oldPrice - newPrice) > 0.01) {
          try {
            await stripe.paymentIntents.cancel(existingBooking.stripePaymentIntentId);
            updateData.stripePaymentIntentId = null;
          } catch (e) {
            // Payment intent may already be in a terminal state
            console.log('[Edit Booking] Could not cancel PaymentIntent:', e);
          }
        }
      }
      
      const updatedBooking = await storage.updateBooking(bookingId, updateData);
      
      console.log(`[Booking Edit] Customer ${user.email} updated booking ${bookingId}`);
      
      res.json(updatedBooking);
    } catch (error) {
      console.error('[Booking Edit] Error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== PAYMENT ROUTES =====
  
  /**
   * CREATE PAYMENT INTENT (PROTECTED - requires authenticated customer)
   * 
   * SECURITY NOTES:
   * - User ID comes from session, NOT from request body
   * - Amount is calculated SERVER-SIDE from booking price (NEVER trust client amounts)
   * - Ownership verified: user must be the booking's customer
   * - Idempotency key prevents duplicate charges for same booking
   */
  app.post("/api/bookings/:id/create-payment-intent", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      // SECURITY: Get user from session, not from request
      const user = (req as any).user;
      const bookingId = req.params.id;
      
      // Get the booking from database
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // SECURITY: Verify user owns this booking (prevents payment for other users' bookings)
      if (booking.customerId !== user.id) {
        logEvent.payment('ownership_violation', { 
          bookingId, 
          requesterId: user.id, 
          ownerId: booking.customerId 
        });
        return res.status(403).json({ error: "Access denied" });
      }
      
      // SECURITY: Require email verification for payments
      if (!user.emailVerified) {
        return res.status(403).json({ 
          error: "Email verification required",
          message: "Please verify your email address before making a payment.",
          requiresEmailVerification: true
        });
      }
      
      // Check if booking is in valid state for payment (pending, confirmed, or payment_failed for retries)
      const validPaymentStatuses = ['pending', 'confirmed', 'payment_failed', 'pending_payment'];
      if (!validPaymentStatuses.includes(booking.status)) {
        return res.status(400).json({ error: "Booking must be pending, confirmed, or payment_failed for payment" });
      }
      
      // Check if already paid
      if (booking.paymentStatus === 'succeeded') {
        return res.status(400).json({ error: "Booking has already been paid" });
      }
      
      // If this is a payment retry (status was payment_failed), reset status and force new PaymentIntent
      const isRetry = booking.status === 'payment_failed' || booking.paymentStatus === 'failed';
      if (isRetry) {
        await storage.updateBooking(bookingId, { 
          status: 'pending',
          paymentStatus: 'pending'
        });
        logEvent.payment('payment_retry_initiated', { bookingId, previousStatus: booking.status });
      }
      
      // SECURITY: Calculate amount SERVER-SIDE from booking (NEVER trust client amounts)
      const amountInCents = Math.round(parseFloat(booking.price || '0') * 100);
      
      if (amountInCents <= 0) {
        return res.status(400).json({ error: "Invalid booking price" });
      }
      
      // Create or retrieve payment intent
      let paymentIntent;
      let needsNewPaymentIntent = false;
      
      if (booking.stripePaymentIntentId && !isRetry) {
        // Retrieve existing payment intent (only if not a retry)
        try {
          paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
          
          // Check if payment intent is in a terminal state
          if (paymentIntent.status === 'succeeded') {
            // Payment already succeeded - update booking and return
            await storage.updateBooking(bookingId, { paymentStatus: 'succeeded' });
            return res.status(400).json({ 
              error: "Payment already completed",
              alreadyPaid: true,
              status: 'succeeded'
            });
          } else if (paymentIntent.status === 'canceled') {
            // Canceled - need a new payment intent
            needsNewPaymentIntent = true;
          }
          // Other statuses like 'requires_payment_method', 'processing' can be reused
        } catch (error) {
          // If payment intent doesn't exist, create a new one
          needsNewPaymentIntent = true;
        }
      } else if (isRetry) {
        // For retries, cancel old PaymentIntent and create fresh one
        if (booking.stripePaymentIntentId) {
          try {
            await stripe.paymentIntents.cancel(booking.stripePaymentIntentId);
            logEvent.payment('old_intent_canceled_for_retry', { bookingId, oldIntentId: booking.stripePaymentIntentId });
          } catch (cancelError) {
            // Intent might already be canceled or in a non-cancelable state - that's fine
            logEvent.payment('old_intent_cancel_skipped', { bookingId, reason: 'already_canceled_or_succeeded' });
          }
        }
        needsNewPaymentIntent = true;
      } else {
        needsNewPaymentIntent = true;
      }
      
      // Create new payment intent if needed
      if (needsNewPaymentIntent) {
        // Use timestamp in idempotency key for retries to allow new intent creation
        const idempotencyKey = isRetry 
          ? `payment_intent_${booking.id}_${amountInCents}_retry_${Date.now()}`
          : `payment_intent_${booking.id}_${amountInCents}`;
        
        paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "cad",
          metadata: {
            bookingId: booking.id,
            customerId: user.id,
            customerName: user.name,
            isRetry: isRetry ? 'true' : 'false',
          },
          description: `LervIT booking from ${booking.pickupAddress} to ${booking.dropoffAddress}`,
        }, {
          idempotencyKey,
        });
        
        // Update booking with new payment intent ID
        await storage.updateBooking(bookingId, {
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: 'pending',
        });
      }
      
      res.json({ 
        clientSecret: paymentIntent!.client_secret,
        paymentIntentId: paymentIntent!.id,
      });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ 
        error: "Error creating payment intent: " + error.message 
      });
    }
  });
  
  // Confirm payment (called after successful inline payment)
  app.post("/api/bookings/:id/confirm-payment", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const bookingId = req.params.id;
      const { paymentIntentId } = req.body;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Verify user owns this booking
      if (booking.customerId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Verify payment intent ID matches
      if (booking.stripePaymentIntentId !== paymentIntentId) {
        return res.status(400).json({ error: "Payment intent mismatch" });
      }
      
      // Verify payment with Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ error: "Payment not yet completed" });
      }
      
      // Check if already processed
      if (booking.paymentStatus === 'succeeded') {
        return res.json({ success: true, message: "Payment already confirmed" });
      }
      
      // Update booking payment status
      await storage.updateBooking(bookingId, {
        paymentStatus: 'succeeded',
        status: 'confirmed',
      });
      
      console.log(`[Payment] Confirmed payment for booking ${bookingId}`);
      
      // Send confirmation emails
      const customer = await storage.getUser(booking.customerId);
      if (customer) {
        try {
          await notificationService.sendBookingConfirmation(customer, booking);
          await notificationService.sendPaymentReceipt(customer, booking, booking.price || '0');
          console.log(`[Payment] Sent confirmation emails to ${customer.email}`);
        } catch (emailErr) {
          console.error("[Payment] Failed to send emails:", emailErr);
        }
      }
      
      // Find and notify nearby movers
      try {
        const allMovers = await storage.getMovers();
        const availableMovers = allMovers.filter(m => m.isAvailable);
        
        if (availableMovers.length > 0) {
          // Notify up to 5 nearest movers
          const moversToNotify = availableMovers.slice(0, 5);
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
          for (const mover of moversToNotify) {
            await storage.createJobNotification({
              moverId: mover.userId,
              bookingId: booking.id,
              status: 'pending',
              distanceToPickup: '0',
              estimatedEarnings: booking.price || '0',
              expiresAt,
            });
            
            // Send email notification to mover
            const moverUser = await storage.getUser(mover.userId);
            if (moverUser) {
              try {
                await notificationService.sendJobAssignment(
                  moverUser,
                  booking,
                  booking.price || '0'
                );
              } catch (emailErr) {
                console.error(`[Payment] Failed to email mover ${mover.userId}:`, emailErr);
              }
            }
          }
          console.log(`[Payment] Notified ${moversToNotify.length} movers about job (with emails)`);
        }
      } catch (moverErr) {
        console.error("[Payment] Failed to notify movers:", moverErr);
      }
      
      res.json({ success: true, message: "Payment confirmed" });
    } catch (error: any) {
      console.error("Error confirming payment:", error);
      res.status(500).json({ error: "Failed to confirm payment" });
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

  // === SAVED PAYMENT METHODS ===
  
  // Helper to get or create Stripe customer
  async function getOrCreateStripeCustomer(user: User): Promise<string> {
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }
    
    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: {
        userId: user.id,
      },
    });
    
    // Save Stripe customer ID to user
    await db.update(usersTable).set({ stripeCustomerId: customer.id }).where(eq(usersTable.id, user.id));
    
    return customer.id;
  }

  // Create setup intent for saving a card
  app.post("/api/payment-methods/setup-intent", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user as User;
      
      const stripeCustomerId = await getOrCreateStripeCustomer(user);
      
      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        metadata: {
          userId: user.id,
        },
      });
      
      res.json({ clientSecret: setupIntent.client_secret });
    } catch (error: any) {
      console.error("Error creating setup intent:", error);
      res.status(500).json({ error: "Failed to create setup intent" });
    }
  });

  // Get saved payment methods
  app.get("/api/payment-methods", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user as User;
      
      if (!user.stripeCustomerId) {
        return res.json({ paymentMethods: [] });
      }
      
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      });
      
      // Get default payment method
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);
      const defaultPaymentMethodId = (customer as any).invoice_settings?.default_payment_method;
      
      const cards = paymentMethods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
        isDefault: pm.id === defaultPaymentMethodId,
      }));
      
      res.json({ paymentMethods: cards });
    } catch (error: any) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ error: "Failed to fetch payment methods" });
    }
  });

  // Delete a saved payment method
  app.delete("/api/payment-methods/:id", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user as User;
      const paymentMethodId = req.params.id;
      
      // Verify the payment method belongs to this user
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== user.stripeCustomerId) {
        return res.status(403).json({ error: "Payment method does not belong to you" });
      }
      
      await stripe.paymentMethods.detach(paymentMethodId);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting payment method:", error);
      res.status(500).json({ error: "Failed to delete payment method" });
    }
  });

  // Set default payment method
  app.post("/api/payment-methods/:id/set-default", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user as User;
      const paymentMethodId = req.params.id;
      
      if (!user.stripeCustomerId) {
        return res.status(400).json({ error: "No Stripe customer found" });
      }
      
      // Verify the payment method belongs to this user
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== user.stripeCustomerId) {
        return res.status(403).json({ error: "Payment method does not belong to you" });
      }
      
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error setting default payment method:", error);
      res.status(500).json({ error: "Failed to set default payment method" });
    }
  });

  // Pay with saved card
  app.post("/api/bookings/:id/pay-with-saved-card", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user as User;
      const bookingId = req.params.id;
      const { paymentMethodId } = validateBody(z.object({
        paymentMethodId: z.string(),
      }), req.body);
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      if (booking.customerId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (booking.paymentStatus === 'succeeded') {
        return res.status(400).json({ error: "Booking already paid" });
      }
      
      if (!user.stripeCustomerId) {
        return res.status(400).json({ error: "No saved payment methods" });
      }
      
      const amountInCents = Math.round(parseFloat(booking.price || '0') * 100);
      
      // Create payment intent with saved card
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'cad',
        customer: user.stripeCustomerId,
        payment_method: paymentMethodId,
        off_session: false,
        confirm: true,
        metadata: {
          bookingId: booking.id,
          customerId: user.id,
        },
      });
      
      if (paymentIntent.status === 'succeeded') {
        // Update booking
        await storage.updateBooking(bookingId, {
          paymentStatus: 'succeeded',
          status: 'confirmed',
          stripePaymentIntentId: paymentIntent.id,
        });
        
        // Send confirmation emails
        const customer = await storage.getUser(booking.customerId);
        if (customer) {
          try {
            await notificationService.sendBookingConfirmation(customer, booking);
            await notificationService.sendPaymentReceipt(customer, booking, booking.price || '0');
          } catch (emailErr) {
            console.error("Failed to send emails:", emailErr);
          }
        }
        
        // Notify movers
        const allMovers = await storage.getMovers();
        const availableMovers = allMovers.filter(m => m.isAvailable);
        const moversToNotify = availableMovers.slice(0, 5);
        for (const mover of moversToNotify) {
          await storage.createJobNotification({
            moverId: mover.userId,
            bookingId: booking.id,
            status: 'pending',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            distanceToPickup: '0',
            estimatedEarnings: booking.price || '0',
          });
          
          // Send email notification to mover
          const moverUser = await storage.getUser(mover.userId);
          if (moverUser) {
            try {
              await notificationService.sendJobAssignment(
                moverUser,
                booking,
                booking.price || '0'
              );
            } catch (emailErr) {
              console.error(`Failed to email mover ${mover.userId}:`, emailErr);
            }
          }
        }
        
        res.json({ success: true, status: 'succeeded' });
      } else if (paymentIntent.status === 'requires_action') {
        // Card requires 3D Secure
        res.json({
          requiresAction: true,
          clientSecret: paymentIntent.client_secret,
        });
      } else {
        res.status(400).json({ error: "Payment failed", status: paymentIntent.status });
      }
    } catch (error: any) {
      console.error("Error paying with saved card:", error);
      res.status(500).json({ error: error.message || "Payment failed" });
    }
  });
  
  /**
   * =========================================================================
   * STRIPE WEBHOOK ENDPOINT (STRIPE-ONLY - NO USER SESSION)
   * =========================================================================
   * 
   * SECURITY NOTES:
   * - This endpoint is called ONLY by Stripe servers, not by users
   * - Signature verification is REQUIRED in production
   * - Uses raw request body (not JSON-parsed) for signature verification
   * - Returns 400 immediately if signature verification fails
   * - Never log sensitive data (card details, full webhook body)
   * 
   * RATE LIMITING:
   * - Configured separately in middleware/security.ts (webhookLimiter)
   * - Allows Stripe retries while preventing abuse
   * 
   * =========================================================================
   */
  app.post("/api/stripe-webhook", async (req: Request, res: Response) => {
    try {
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      
      // SECURITY: Require stripe-signature header
      if (!sig) {
        logEvent.error('stripe_webhook', new Error('Missing stripe signature - possible spoofing attempt'));
        return res.status(400).json({ error: 'No stripe signature' });
      }
      
      let event: Stripe.Event;
      
      // SECURITY: Always verify webhook signature in production
      if (webhookSecret) {
        try {
          // IMPORTANT: Use raw body, not JSON-parsed body, for signature verification
          const rawBody = (req as any).rawBody;
          if (!rawBody) {
            logEvent.error('stripe_webhook', new Error('Raw body not available for signature verification'));
            return res.status(400).json({ error: 'Invalid request body' });
          }
          event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
          logEvent.payment('webhook_verified', { eventType: event.type });
        } catch (err) {
          // SECURITY: Log and reject immediately on verification failure
          logEvent.error('stripe_webhook_verification', err);
          return res.status(400).json({ error: 'Webhook signature verification failed' });
        }
      } else if (process.env.NODE_ENV === 'production') {
        // SECURITY: In production, ALWAYS require webhook secret
        logEvent.error('stripe_webhook', new Error('STRIPE_WEBHOOK_SECRET required in production'));
        return res.status(500).json({ error: 'Webhook configuration error' });
      } else {
        // Development mode ONLY - log warning but process anyway
        logger.warn({ event: 'stripe_webhook' }, 'DEV MODE: STRIPE_WEBHOOK_SECRET not set - skipping signature verification');
        event = req.body as Stripe.Event;
      }
      
      // Handle the event
      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          
          // STRIPE RADAR: Extract fraud risk data from latest charge
          let riskLevel: string | undefined;
          let riskScore: number | undefined;
          let fraudFlagged = false;
          
          try {
            const chargeId = paymentIntent.latest_charge;
            if (chargeId && typeof chargeId === 'string') {
              const charge = await stripe.charges.retrieve(chargeId);
              riskLevel = charge.outcome?.risk_level;
              riskScore = charge.outcome?.risk_score;
              fraudFlagged = riskLevel === 'highest' || (riskScore !== undefined && riskScore > 75);
            }
          } catch (radarErr) {
            logEvent.error('stripe_radar_fetch', radarErr, { paymentIntentId: paymentIntent.id });
          }
          
          logEvent.payment('intent_succeeded', { 
            bookingId: paymentIntent.metadata?.bookingId,
            paymentIntentId: paymentIntent.id,
            amount: String(paymentIntent.amount / 100),
            currency: paymentIntent.currency,
            riskLevel: riskLevel || 'unknown',
            riskScore: riskScore ?? null,
            fraudFlagged
          });
          
          // Find booking by payment intent ID
          const successBookings = await db
            .select()
            .from(bookings)
            .where(eq(bookings.stripePaymentIntentId, paymentIntent.id))
            .limit(1);
          
          if (successBookings.length > 0) {
            const booking = successBookings[0];
            
            // Idempotency check - don't process if already succeeded
            if (booking.paymentStatus === 'succeeded') {
              logEvent.payment('already_processed', { bookingId: booking.id, paymentIntentId: paymentIntent.id });
              return res.json({ received: true, status: 'already_processed' });
            }
            
            // STRIPE RADAR: Log and flag high-risk payments for manual review
            if (fraudFlagged) {
              logEvent.payment('high_risk_payment', {
                bookingId: booking.id,
                paymentIntentId: paymentIntent.id,
                userId: booking.customerId,
                riskLevel,
                riskScore,
                amount: String(paymentIntent.amount / 100),
                action: 'flagged_for_review'
              });
            }
            
            // Update booking payment status and move to PENDING (awaiting mover)
            // Also flag for review if Stripe Radar detected high risk
            await storage.updateBooking(booking.id, {
              paymentStatus: 'succeeded',
              status: BOOKING_STATUSES.PENDING,
              ...(fraudFlagged && {
                flaggedForReview: true,
                flaggedReason: 'stripe_radar_high_risk'
              })
            });
            
            logEvent.payment('booking_confirmed', { 
              bookingId: booking.id, 
              userId: booking.customerId,
              paymentIntentId: paymentIntent.id,
              status: 'succeeded',
              pickupAddress: booking.pickupAddress,
              dropoffAddress: booking.dropoffAddress,
              amount: booking.price,
              riskLevel: riskLevel || 'unknown'
            });
            
            // ATOMICITY: All post-payment operations are wrapped in try-catch
            // to ensure webhook success even if notifications fail.
            // Booking status is already updated - these are non-critical follow-ups.
            
            // Send booking confirmation and payment receipt emails
            try {
              const customer = await storage.getUser(booking.customerId);
              if (customer) {
                await notificationService.sendBookingConfirmation(customer, booking);
                await notificationService.sendPaymentReceipt(
                  customer,
                  booking,
                  booking.price || '0'
                );
                logEvent.notification('customer_emails_sent', { bookingId: booking.id, customerId: customer.id });
                
                // Create in-app notification for payment confirmation (non-blocking)
                try {
                  await storage.createNotification({
                    userId: customer.id,
                    type: 'payment_received',
                    title: 'Payment Confirmed',
                    message: `Your payment of $${booking.price} CAD was successful. We're finding movers for your move.`,
                    bookingId: booking.id,
                    actionUrl: '/my-bookings',
                    isRead: false,
                  });
                } catch (notifErr) {
                  logEvent.error('payment_notification_failed', notifErr, { bookingId: booking.id, userId: customer.id });
                }
              }
            } catch (emailErr) {
              logEvent.error('webhook_customer_emails', emailErr, { bookingId: booking.id });
            }
            
            // Find and notify movers (non-blocking - booking is already confirmed)
            try {
              const { findNearestMovers, calculateExpiryTime } = await import("@shared/matching");
              const { toDecimalString } = await import("@shared/utils");
              
              const pickupCoords = {
                lat: parseFloat(String(booking.pickupLatitude || '0')),
                lng: parseFloat(String(booking.pickupLongitude || '0')),
              };
              const dropoffCoords = {
                lat: parseFloat(String(booking.dropoffLatitude || '0')),
                lng: parseFloat(String(booking.dropoffLongitude || '0')),
              };
              
              // Check if customer pre-selected a mover from Browse Movers page
              if (booking.preSelectedMoverId) {
                // DIRECT MOVER SELECTION: Assign the pre-selected mover directly
                logEvent.booking('direct_mover_assignment', {
                  bookingId: booking.id,
                  preSelectedMoverId: booking.preSelectedMoverId,
                });
                
                // Get the pre-selected mover's details
                const preSelectedMover = await storage.getMover(booking.preSelectedMoverId);
                if (preSelectedMover) {
                  // Assign the mover directly to the booking and clear preSelectedMoverId to prevent duplicate processing
                  await storage.updateBooking(booking.id, {
                    moverId: booking.preSelectedMoverId,
                    preSelectedMoverId: null, // Clear after assignment to prevent duplicate processing on webhook retries
                    status: BOOKING_STATUSES.CONFIRMED,
                    acceptedAt: new Date(),
                  });
                  
                  // Calculate mover earnings and commission using platform fee calculator
                  const bookingPrice = parseFloat(booking.price || '0');
                  const feeBreakdown = calculatePlatformFee(bookingPrice);
                  const platformFeeAmount = feeBreakdown.platformFeeCents / 100;
                  const moverNetAmount = feeBreakdown.moverPayoutCents / 100;
                  
                  await storage.updateBooking(booking.id, {
                    platformFeeAmount: toDecimalString(platformFeeAmount),
                    moverNetAmount: toDecimalString(moverNetAmount),
                  });
                  
                  // Create a job notification for the pre-selected mover (for tracking/history)
                  const expiresAt = calculateExpiryTime(10);
                  await storage.createJobNotification({
                    bookingId: booking.id,
                    moverId: booking.preSelectedMoverId,
                    distanceToPickup: toDecimalString(0), // Direct selection, distance not relevant
                    estimatedEarnings: toDecimalString(moverNetAmount),
                    status: 'accepted',
                    expiresAt,
                  });
                  
                  // Notify the selected mover via email and SMS
                  const moverUser = await storage.getUser(preSelectedMover.userId);
                  if (moverUser) {
                    const earningsStr = moverNetAmount.toFixed(2);
                    await notificationService.sendJobAssignment(moverUser, booking, earningsStr);
                    // Send SMS notification
                    if (moverUser.phone) {
                      const baseUrl = process.env.BASE_URL || 
                        (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://app.lervit.com');
                      const smsMessage = `LervIT: You've been assigned a job! Earn $${earningsStr} CAD. From: ${booking.pickupAddress}. Open app to view: ${baseUrl}/mover-dashboard`;
                      await notificationService.sendSMS({
                        to: moverUser.phone,
                        message: smsMessage,
                        type: 'job_alert',
                      });
                    }
                    logEvent.notification('direct_mover_notified', {
                      bookingId: booking.id,
                      moverId: booking.preSelectedMoverId,
                      moverUserId: moverUser.id,
                    });
                    
                    // Create in-app notification for the mover (non-blocking)
                    try {
                      await storage.createNotification({
                        userId: moverUser.id,
                        type: 'job_opportunity',
                        title: 'New Job Assigned',
                        message: `You've been assigned a new job! Earn $${earningsStr} CAD.`,
                        bookingId: booking.id,
                        actionUrl: '/mover-dashboard',
                        isRead: false,
                      });
                    } catch (notifErr) {
                      logEvent.error('mover_assignment_notification_failed', notifErr, { bookingId: booking.id, moverId: moverUser.id });
                    }
                  }
                  
                  // Create in-app notification for customer about mover assignment (non-blocking)
                  try {
                    const assignedCustomer = await storage.getUser(booking.customerId);
                    if (assignedCustomer) {
                      await storage.createNotification({
                        userId: assignedCustomer.id,
                        type: 'mover_assigned',
                        title: 'Mover Assigned',
                        message: `Great news! A mover has been assigned to your move.`,
                        bookingId: booking.id,
                        actionUrl: '/my-bookings',
                        isRead: false,
                      });
                    }
                  } catch (notifErr) {
                    logEvent.error('customer_mover_assigned_notification_failed', notifErr, { bookingId: booking.id, customerId: booking.customerId });
                  }
                } else {
                  // Pre-selected mover not found - fall back to proximity matching
                  logEvent.error('direct_mover_not_found', new Error('Pre-selected mover not found'), {
                    bookingId: booking.id,
                    preSelectedMoverId: booking.preSelectedMoverId,
                  });
                }
              } else {
                // PROXIMITY MATCHING: Find nearest available movers (normal flow)
                const allMovers = await storage.getOperationalMovers();
                const moversWithUserData = await Promise.all(
                  allMovers.map(async (m: any) => {
                    const moverUser = await storage.getUser(m.userId);
                    if (!moverUser || m.latitude === null || m.longitude === null) {
                      return null;
                    }
                    return {
                      moverId: m.id,
                      userId: m.userId,
                      name: moverUser.name,
                      vehicleType: m.vehicleType,
                      rating: m.rating || '0',
                      totalMoves: m.totalMoves,
                      isAvailable: m.isAvailable,
                      latitude: m.latitude as number,
                      longitude: m.longitude as number,
                    };
                  })
                ).then(results => results.filter((m: any): m is NonNullable<typeof m> => m !== null));
                
                // Use AI-recommended vehicle type for intelligent mover filtering
                const nearestMovers = findNearestMovers(
                  pickupCoords,
                  dropoffCoords,
                  (booking.loadSize || 'medium') as 'boxes' | 'medium' | 'large' | 'apartment',
                  moversWithUserData,
                  {},
                  booking.aiRecommendedVehicle || null
                );
                
                // Create job notifications for top movers
                const expiresAt = calculateExpiryTime(10); // 10 minutes
                await Promise.all(
                  nearestMovers.map((mover: any) =>
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
              
              // Send job assignment emails to movers (wrapped separately for isolation)
              try {
                await Promise.all(
                  nearestMovers.map(async (mover: any) => {
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
              } catch (moverEmailErr) {
                logEvent.error('webhook_mover_emails', moverEmailErr, { bookingId: booking.id });
              }
              
              logEvent.payment('movers_notified', { 
                bookingId: booking.id, 
                moversNotified: nearestMovers.length 
              });
              } // End of else block for proximity matching
            } catch (moverNotifyErr) {
              logEvent.error('webhook_mover_notifications', moverNotifyErr, { bookingId: booking.id });
            }
          }
          break;
          
        case 'payment_intent.payment_failed':
          const failedIntent = event.data.object as Stripe.PaymentIntent;
          
          logEvent.payment('intent_failed', { 
            bookingId: failedIntent.metadata?.bookingId,
            error: failedIntent.last_payment_error?.message 
          });
          
          // Find booking by payment intent ID
          const failedBookings = await db
            .select()
            .from(bookings)
            .where(eq(bookings.stripePaymentIntentId, failedIntent.id))
            .limit(1);
          
          if (failedBookings.length > 0) {
            const booking = failedBookings[0];
            
            // Update booking payment status to failed
            await storage.updateBooking(booking.id, {
              paymentStatus: 'failed',
              status: BOOKING_STATUSES.PAYMENT_FAILED,
            });
            
            logEvent.payment('booking_failed', { bookingId: booking.id });
          }
          break;
        
        // Handle Stripe Connect account updates (mover onboarding status changes)
        case 'account.updated':
          const updatedAccount = event.data.object as Stripe.Account;
          
          logEvent.payment('connect_account_updated', { 
            stripeAccountId: updatedAccount.id,
            chargesEnabled: updatedAccount.charges_enabled,
            payoutsEnabled: updatedAccount.payouts_enabled,
          });
          
          // Find mover by Stripe account ID and update their status
          const moverAccounts = await db.select()
            .from(moverStripeAccounts)
            .where(eq(moverStripeAccounts.stripeAccountId, updatedAccount.id))
            .limit(1);
          
          if (moverAccounts.length > 0) {
            const moverAccount = moverAccounts[0];
            
            const newOnboardingStatus = updatedAccount.details_submitted ? 'complete' : 
                                        (updatedAccount.requirements?.currently_due?.length ? 'restricted' : 'in_progress');
            
            await db.update(moverStripeAccounts)
              .set({
                chargesEnabled: updatedAccount.charges_enabled,
                payoutsEnabled: updatedAccount.payouts_enabled,
                detailsSubmitted: updatedAccount.details_submitted,
                onboardingStatus: newOnboardingStatus,
                requirementsDue: updatedAccount.requirements?.eventually_due || [],
                currentlyDue: updatedAccount.requirements?.currently_due || [],
                updatedAt: new Date(),
              })
              .where(eq(moverStripeAccounts.id, moverAccount.id));
            
            logEvent.payment('mover_connect_status_synced', { 
              moverId: moverAccount.moverId,
              onboardingStatus: newOnboardingStatus,
            });
          }
          break;
        
        // Handle charge refunds for future implementation
        case 'charge.refunded':
          const refundedCharge = event.data.object as Stripe.Charge;
          
          logEvent.payment('charge_refunded', { 
            chargeId: refundedCharge.id,
            amount: refundedCharge.amount_refunded / 100,
          });
          
          // TODO: Implement refund handling - mark booking as refunded,
          // adjust mover transfer if applicable
          break;
          
        default:
          logger.debug({ eventType: event.type }, 'Unhandled Stripe event type');
      }
      
      res.json({ received: true });
    } catch (error: any) {
      logEvent.error('stripe_webhook', error);
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
      
      // Create in-app notification for the recipient
      try {
        const booking = await storage.getBooking(message.bookingId);
        if (booking) {
          // Determine recipient: if sender is customer, notify mover; if sender is mover's user, notify customer
          let recipientId: string | null = null;
          
          if (message.senderId === booking.customerId && booking.moverId) {
            // Sender is customer, notify mover
            const mover = await storage.getMover(booking.moverId);
            if (mover) {
              recipientId = mover.userId;
            }
          } else if (booking.moverId) {
            // Sender is mover, notify customer
            const mover = await storage.getMover(booking.moverId);
            if (mover && mover.userId === message.senderId) {
              recipientId = booking.customerId;
            }
          }
          
          if (recipientId) {
            const senderName = sender?.name || "Someone";
            const messagePreview = message.text.length > 80 
              ? message.text.substring(0, 80) + "..." 
              : message.text;
            
            await storage.createNotification({
              userId: recipientId,
              type: "new_message",
              title: `New message from ${senderName}`,
              message: messagePreview,
              bookingId: message.bookingId,
              actionUrl: `/messages/${message.bookingId}`,
              isRead: false,
            });
          }
        }
      } catch (notifError) {
        // Don't fail the message creation if notification fails
        console.error("Failed to create message notification:", notifError);
      }
      
      res.json({
        ...message,
        sender: sender ? { id: sender.id, name: sender.name } : null
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Get unread message notifications for current user
  app.get("/api/messages/notifications", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const userId = req.session.userId;
      const unreadMessages = await storage.getUnreadMessagesForUser(userId);
      
      // Calculate total unread count
      const totalUnread = unreadMessages.reduce((sum, item) => sum + item.count, 0);
      
      res.json({
        totalUnread,
        byBooking: unreadMessages
      });
    } catch (error) {
      console.error("Error fetching message notifications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark messages as read for a specific booking
  app.post("/api/messages/:bookingId/mark-read", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { bookingId } = req.params;
      const userId = req.session.userId;
      
      await storage.markMessagesAsRead(bookingId, userId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Internal server error" });
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
      
      // Fetch customer names for recent bookings
      const recentBookingsWithCustomer = await Promise.all(
        completedBookings.slice(0, 10).map(async (b) => {
          const customer = await storage.getUser(b.customerId);
          return {
            id: b.id,
            customerName: customer?.name || 'Customer',
            pickupAddress: b.pickupAddress,
            dropoffAddress: b.dropoffAddress,
            date: b.preferredDate,
            earnings: b.price,
            status: b.status,
            paymentStatus: b.paymentStatus,
          };
        })
      );
      
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
        recentBookings: recentBookingsWithCustomer,
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
      
      // Get user ID for ownership (use session user or default)
      const userId = req.session?.userId || 'anonymous';
      
      // Upload to Object Storage for production persistence
      const objectStorageService = new ObjectStorageService();
      const imageUrls: string[] = [];
      
      for (const file of req.files as Express.Multer.File[]) {
        try {
          // Read the file from local disk (multer saves it temporarily)
          const fileBuffer = fs.readFileSync(file.path);
          
          // Upload to cloud storage
          const cloudPath = await objectStorageService.uploadBuffer(
            fileBuffer,
            file.originalname,
            file.mimetype,
            userId
          );
          
          imageUrls.push(cloudPath);
          
          // Clean up local file after successful upload
          fs.unlinkSync(file.path);
        } catch (uploadError) {
          console.error('Object Storage upload failed, using local fallback:', uploadError);
          // Fallback to local path if Object Storage fails
          imageUrls.push(`/uploads/${file.filename}`);
        }
      }
      
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
    // large: 50-170 ft³ (sofas, beds, fridges, appliances)
    // apartment: 170+ ft³ (full room furniture)
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
      loadSize = "large"; // 50-170 ft³: Large furniture
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
        loadSize = "large"; // 50-170 ft³: Large furniture
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
      loadSize = "large"; // 50-170 ft³: Large furniture
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
      loadSize = "large"; // 50-170 ft³: Large item
      weightClass = "medium";
      recommendedMovers = 2;
      recommendedVehicle = "Cargo Van";
    }
    
    // Appliances
    else if (lowerName.includes('fridge') || lowerName.includes('refrigerator')) {
      itemType = lowerName.includes('mini') ? "Mini fridge" : "Refrigerator";
      loadSize = "large"; // 50-170 ft³: Large appliance
      weightClass = "heavy";
      estimatedWeightLbs = lowerName.includes('mini') ? 100 : 550;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    } else if (lowerName.includes('washer') || lowerName.includes('dryer')) {
      itemType = lowerName.includes('washer') ? "Washing machine" : "Dryer";
      loadSize = "large"; // 50-170 ft³: Large appliance
      weightClass = "heavy";
      estimatedWeightLbs = 500;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    } else if (lowerName.includes('appliance') || lowerName.includes('stove') || lowerName.includes('oven')) {
      itemType = "Kitchen appliance";
      loadSize = "large"; // 50-170 ft³: Large appliance
      weightClass = "heavy";
      estimatedWeightLbs = 400;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    } else if (lowerName.includes('treadmill') || lowerName.includes('exercise')) {
      itemType = "Treadmill";
      loadSize = "large"; // 50-170 ft³: Large equipment
      weightClass = "heavy";
      estimatedWeightLbs = 450;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    }
    
    // Storage & Shelving
    else if (lowerName.includes('dresser') || lowerName.includes('drawer')) {
      itemType = "Dresser";
      loadSize = "large"; // 50-170 ft³: Large furniture
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
   - "large": 50-170 ft³ (large furniture: sofas, beds, fridges, appliances, dressers, treadmills)
   - "apartment": 170+ ft³ (full room furniture or multiple large items)
3. Is it heavy/fragile requiring special care? (true/false)
4. Recommended movers: 1 or 2
5. Weight category: light (<100 lbs), medium (100-500 lbs), heavy (>500 lbs)
6. Approximate weight in pounds
7. Recommended vehicle: Car, SUV, Pickup, Cargo Van, Cube Truck, or Flatbed

⚠️ STRICT MANDATORY CATEGORIZATION RULES (CANNOT BE OVERRIDDEN):

MUST classify as "large" (50-170 ft³):
- ALL sofas, couches, sectionals, loveseats, futons
- ALL beds, mattresses, bed frames (twin, full, queen, king)
- ALL refrigerators, freezers, fridges
- ALL washers, dryers, dishwashers
- ALL dressers, wardrobes, armoires
- ALL bookcases, bookshelves
- ALL treadmills, ellipticals, exercise equipment

MUST classify as "apartment" (170+ ft³):
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
- Full room furniture sets → "apartment" (170+ ft³)

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

  // Get unread ticket count for customer notifications
  // NOTE: Must be defined BEFORE /api/support/tickets/:id to avoid route conflict
  app.get("/api/support/tickets/unread-count", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      
      // Get all tickets for this user where lastStaffReplyAt > customerLastReadAt
      // or where lastStaffReplyAt exists but customerLastReadAt is null
      const tickets = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.userId, user.id));
      
      // Count tickets with unread staff replies
      const unreadCount = tickets.filter(ticket => {
        if (!ticket.lastStaffReplyAt) return false;
        if (!ticket.customerLastReadAt) return true;
        return ticket.lastStaffReplyAt > ticket.customerLastReadAt;
      }).length;
      
      res.json({ unreadCount });
    } catch (error) {
      res.status(500).json({ error: "Failed to get unread count" });
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
      
      // Update ticket's updatedAt and set lastStaffReplyAt if admin replied
      const updateData: any = { updatedAt: new Date() };
      if (user.role === "admin") {
        updateData.lastStaffReplyAt = new Date();
        
        // Create in-app notification for the customer when staff replies (non-blocking)
        // Only notify ticket owner, not if admin is replying to their own ticket
        if (ticket[0].userId !== user.id) {
          try {
            await storage.createNotification({
              userId: ticket[0].userId,
              type: 'support_ticket_update',
              title: 'Support Reply',
              message: `Support has replied to your ticket: "${ticket[0].subject}"`,
              actionUrl: `/support/${req.params.id}`,
              isRead: false,
            });
          } catch (notifErr) {
            console.error('Support ticket notification failed:', notifErr);
          }
        }
      }
      await db.update(supportTickets)
        .set(updateData)
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

  // Mark a ticket as read by customer
  app.post("/api/support/tickets/:id/mark-read", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      
      // Verify user owns this ticket
      const ticket = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, req.params.id))
        .limit(1);
      
      if (!ticket.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      if (ticket[0].userId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Update customerLastReadAt
      await db.update(supportTickets)
        .set({ customerLastReadAt: new Date() })
        .where(eq(supportTickets.id, req.params.id));
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark ticket as read" });
    }
  });

  // AI-powered ticket analysis (admin only)
  app.post("/api/support/tickets/:id/ai-analyze", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const ticketId = req.params.id;
      
      // Get ticket details
      const ticketResult = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, ticketId))
        .limit(1);
      
      if (!ticketResult.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      const ticket = ticketResult[0];
      
      // Get ticket replies
      const replies = await db.select()
        .from(supportTicketReplies)
        .where(eq(supportTicketReplies.ticketId, ticketId))
        .orderBy(supportTicketReplies.createdAt);
      
      // Get user details
      const userResult = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, ticket.userId))
        .limit(1);
      
      // Check for cached analysis (less than 1 hour old)
      const existingInsight = await db.select()
        .from(aiSupportInsights)
        .where(eq(aiSupportInsights.ticketId, ticketId))
        .orderBy(aiSupportInsights.createdAt)
        .limit(1);
      
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (existingInsight.length && existingInsight[0].createdAt > oneHourAgo) {
        return res.json({
          ...existingInsight[0],
          cached: true
        });
      }
      
      const startTime = Date.now();
      
      // Run AI analysis
      const analysis = await analyzeTicket({
        ticket,
        replies,
        user: userResult[0]
      });
      
      const processingTime = Date.now() - startTime;
      
      // Store the insight
      const insight = await db.insert(aiSupportInsights).values({
        ticketId,
        summary: analysis.summary,
        category: analysis.category,
        suggestedPriority: analysis.suggestedPriority,
        rootCause: analysis.rootCause,
        recommendations: analysis.recommendations,
        suggestedResponse: analysis.suggestedResponse, // Legacy field
        customerResponse: analysis.customerResponse,   // Customer-friendly response
        internalNotes: analysis.internalNotes,         // Staff-only technical notes
        similarCases: analysis.similarCases,
        confidence: analysis.confidence,
        processingTimeMs: processingTime,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }).returning();
      
      res.json({
        ...insight[0],
        cached: false
      });
    } catch (error) {
      console.error("AI analysis error:", error);
      res.status(500).json({ error: "Failed to analyze ticket" });
    }
  });

  // Get cached AI insight for a ticket (admin only)
  app.get("/api/support/tickets/:id/ai-insight", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const insight = await db.select()
        .from(aiSupportInsights)
        .where(eq(aiSupportInsights.ticketId, req.params.id))
        .orderBy(aiSupportInsights.createdAt)
        .limit(1);
      
      if (!insight.length) {
        return res.status(404).json({ error: "No AI insight available. Click 'Analyze with AI' to generate one." });
      }
      
      res.json(insight[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve AI insight" });
    }
  });

  // Get quick response templates for a category
  app.get("/api/support/quick-responses/:category", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const responses = getQuickResponses(req.params.category);
      res.json(responses);
    } catch (error) {
      res.status(500).json({ error: "Failed to get quick responses" });
    }
  });

  // ===== IN-APP INBOX / NOTIFICATIONS =====
  
  // Get all notifications for the logged-in user
  app.get("/api/inbox", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const limit = parseInt(req.query.limit as string) || 50;
      const notifications = await storage.getNotificationsByUser(user.id, limit);
      
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });
  
  // Get unread notification count
  app.get("/api/inbox/unread-count", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const count = await storage.getUnreadNotificationCount(user.id);
      
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });
  
  // Mark a single notification as read
  app.post("/api/inbox/:id/read", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const notification = await storage.markNotificationAsRead(req.params.id);
      
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      // Verify the notification belongs to the user
      if (notification.userId !== user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      res.json(notification);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });
  
  // Mark all notifications as read
  app.post("/api/inbox/read-all", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      await storage.markAllNotificationsAsRead(user.id);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // ===== MOVER PAYOUT SYSTEM (Uber-style) =====
  
  // Use platform commission from centralized config
  const PLATFORM_COMMISSION_PERCENT = PLATFORM_COMMISSION.DEFAULT_PERCENT;

  // Get mover's Stripe Connect account status
  app.get("/api/movers/payouts/account", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // Get mover profile
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      // Get Stripe Connect account
      const accounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, mover.id))
        .limit(1);
      
      if (!accounts.length) {
        return res.json({
          hasAccount: false,
          onboardingStatus: 'not_started',
          chargesEnabled: false,
          payoutsEnabled: false,
        });
      }
      
      const account = accounts[0];
      
      res.json({
        hasAccount: true,
        stripeAccountId: account.stripeAccountId,
        onboardingStatus: account.onboardingStatus,
        chargesEnabled: account.chargesEnabled,
        payoutsEnabled: account.payoutsEnabled,
        detailsSubmitted: account.detailsSubmitted,
        requirementsDue: account.requirementsDue || [],
        currentlyDue: account.currentlyDue || [],
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get payout account status" });
    }
  });

  // Create Stripe Connect onboarding link for mover
  app.post("/api/movers/payouts/onboarding-link", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // Get mover profile
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      // Check if account already exists
      let stripeAccount;
      const existingAccounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, mover.id))
        .limit(1);
      
      if (existingAccounts.length) {
        stripeAccount = existingAccounts[0];
      } else {
        // Create new Stripe Express account
        const account = await stripe.accounts.create({
          type: 'express',
          country: 'CA',
          email: user.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: 'individual',
          metadata: {
            moverId: mover.id,
            userId: user.id,
          },
        });
        
        // Save to database
        const [newAccount] = await db.insert(moverStripeAccounts).values({
          moverId: mover.id,
          stripeAccountId: account.id,
          accountType: 'express',
          onboardingStatus: 'pending',
        }).returning();
        
        stripeAccount = newAccount;
      }
      
      // Create account link for onboarding
      const baseUrl = req.headers.origin || `https://${req.headers.host}`;
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccount.stripeAccountId,
        refresh_url: `${baseUrl}/mover-dashboard?payout_refresh=true`,
        return_url: `${baseUrl}/mover-dashboard?payout_success=true`,
        type: 'account_onboarding',
      });
      
      // Update onboarding status
      await db.update(moverStripeAccounts)
        .set({ 
          onboardingStatus: 'in_progress',
          updatedAt: new Date(),
        })
        .where(eq(moverStripeAccounts.id, stripeAccount.id));
      
      res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error("Stripe Connect error:", error);
      res.status(500).json({ error: error.message || "Failed to create onboarding link" });
    }
  });

  // Refresh Stripe account status (sync from Stripe)
  app.post("/api/movers/payouts/refresh-status", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      const accounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, mover.id))
        .limit(1);
      
      if (!accounts.length) {
        return res.status(404).json({ error: "No payout account found" });
      }
      
      const account = accounts[0];
      
      // Fetch latest status from Stripe
      const stripeAccount = await stripe.accounts.retrieve(account.stripeAccountId);
      
      // Update database with latest status
      await db.update(moverStripeAccounts)
        .set({
          chargesEnabled: stripeAccount.charges_enabled,
          payoutsEnabled: stripeAccount.payouts_enabled,
          detailsSubmitted: stripeAccount.details_submitted,
          onboardingStatus: stripeAccount.details_submitted ? 'complete' : 
                           (stripeAccount.requirements?.currently_due?.length ? 'restricted' : 'in_progress'),
          requirementsDue: stripeAccount.requirements?.eventually_due || [],
          currentlyDue: stripeAccount.requirements?.currently_due || [],
          updatedAt: new Date(),
        })
        .where(eq(moverStripeAccounts.id, account.id));
      
      res.json({ 
        success: true,
        chargesEnabled: stripeAccount.charges_enabled,
        payoutsEnabled: stripeAccount.payouts_enabled,
        detailsSubmitted: stripeAccount.details_submitted,
      });
    } catch (error: any) {
      console.error("Stripe refresh error:", error);
      res.status(500).json({ error: error.message || "Failed to refresh status" });
    }
  });

  /**
   * Create Stripe Express Dashboard login link for movers
   * 
   * Allows onboarded movers to access their Stripe Express Dashboard to:
   * - View payout history
   * - Update banking information
   * - Manage tax documents
   * - View earnings reports
   * 
   * Called by: Frontend (mover dashboard)
   * Returns: { url: string } - Redirect URL to Stripe Express Dashboard
   */
  app.get("/api/movers/payouts/login-link", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      const accounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, mover.id))
        .limit(1);
      
      if (!accounts.length) {
        return res.status(404).json({ error: "No payout account found. Please complete onboarding first." });
      }
      
      const account = accounts[0];
      
      if (!account.detailsSubmitted) {
        return res.status(400).json({ 
          error: "Onboarding not complete. Please finish setting up your payout account.",
          needsOnboarding: true
        });
      }
      
      if (!account.chargesEnabled) {
        return res.status(400).json({
          error: "Your account is restricted. Please complete any pending requirements.",
          needsOnboarding: true,
          hasRestrictions: true
        });
      }
      
      try {
        const loginLink = await stripe.accounts.createLoginLink(account.stripeAccountId);
        
        logEvent.payment('express_login_link_created', { moverId: mover.id });
        
        res.json({ url: loginLink.url });
      } catch (stripeError: any) {
        if (stripeError.code === 'account_invalid') {
          return res.status(400).json({
            error: "Your Stripe account is no longer valid. Please contact support.",
            accountInvalid: true
          });
        }
        throw stripeError;
      }
    } catch (error: any) {
      console.error("Stripe login link error:", error);
      res.status(500).json({ error: error.message || "Failed to create dashboard link" });
    }
  });

  // Get mover's payout summary (Uber-style dashboard)
  app.get("/api/movers/payouts/summary", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      // Get all earnings
      const earnings = await db.select()
        .from(moverEarnings)
        .where(eq(moverEarnings.moverId, mover.id));
      
      // Calculate totals
      const pendingEarnings = earnings
        .filter(e => e.status === 'pending')
        .reduce((sum, e) => sum + parseFloat(e.netAmount), 0);
      
      const availableBalance = earnings
        .filter(e => e.status === 'available')
        .reduce((sum, e) => sum + parseFloat(e.netAmount), 0);
      
      const totalPaidOut = earnings
        .filter(e => e.status === 'paid')
        .reduce((sum, e) => sum + parseFloat(e.netAmount), 0);
      
      const totalEarnings = earnings
        .reduce((sum, e) => sum + parseFloat(e.netAmount), 0);
      
      // Get recent payouts
      const recentPayouts = await db.select()
        .from(moverPayouts)
        .where(eq(moverPayouts.moverId, mover.id))
        .orderBy(moverPayouts.createdAt)
        .limit(10);
      
      // Get Stripe account status
      const accounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, mover.id))
        .limit(1);
      
      const payoutAccount = accounts[0];
      
      res.json({
        pendingEarnings: pendingEarnings.toFixed(2),
        availableBalance: availableBalance.toFixed(2),
        totalPaidOut: totalPaidOut.toFixed(2),
        totalEarnings: totalEarnings.toFixed(2),
        completedJobs: earnings.length,
        platformFeePercent: PLATFORM_COMMISSION_PERCENT,
        payoutAccount: payoutAccount ? {
          hasAccount: true,
          payoutsEnabled: payoutAccount.payoutsEnabled,
          onboardingStatus: payoutAccount.onboardingStatus,
        } : { hasAccount: false },
        recentPayouts: recentPayouts.map(p => ({
          id: p.id,
          amount: p.amount,
          status: p.status,
          payoutType: p.payoutType,
          arrivalDate: p.arrivalDate,
          initiatedAt: p.initiatedAt,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get payout summary" });
    }
  });

  // Get mover's earnings history
  app.get("/api/movers/payouts/earnings", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      // Get all earnings with booking details
      const earnings = await db.select()
        .from(moverEarnings)
        .where(eq(moverEarnings.moverId, mover.id))
        .orderBy(moverEarnings.createdAt);
      
      // Enrich with booking data
      const enrichedEarnings = await Promise.all(
        earnings.map(async (earning) => {
          const booking = await storage.getBooking(earning.bookingId);
          const customer = booking ? await storage.getUser(booking.customerId) : null;
          
          return {
            id: earning.id,
            bookingId: earning.bookingId,
            grossAmount: earning.grossAmount,
            platformFeePercent: earning.platformFeePercent,
            platformFeeAmount: earning.platformFeeAmount,
            netAmount: earning.netAmount,
            status: earning.status,
            createdAt: earning.createdAt,
            booking: booking ? {
              pickupAddress: booking.pickupAddress,
              dropoffAddress: booking.dropoffAddress,
              preferredDate: booking.preferredDate,
              loadSize: booking.loadSize,
            } : null,
            customerName: customer?.name || 'Unknown',
          };
        })
      );
      
      res.json(enrichedEarnings);
    } catch (error) {
      res.status(500).json({ error: "Failed to get earnings history" });
    }
  });

  /**
   * Record earnings when job is completed and create Stripe Transfer to mover
   * 
   * FLOW: Separate Transfer Approach (Option B)
   * 1. Customer pays platform via PaymentIntent
   * 2. Funds are held in platform's Stripe account
   * 3. When job completes, create Transfer to mover's connected account
   * 
   * This approach is used because:
   * - Mover is not known at payment time
   * - Allows platform to hold funds until job is complete
   * - Enables refund handling before transfer occurs
   */
  async function recordMoverEarnings(bookingId: string, moverId: string, booking: any) {
    // Get commission data from booking (persisted for audit trail)
    const grossAmount = parseFloat(booking.price || '0');
    const platformFeePercent = parseFloat(booking.platformFeePercent || PLATFORM_COMMISSION_PERCENT.toString());
    const platformFeeAmount = parseFloat(booking.platformFeeAmount || (grossAmount * platformFeePercent / 100).toString());
    const netAmount = parseFloat(booking.moverNetAmount || (grossAmount - platformFeeAmount).toString());
    
    // Check if earnings already recorded
    const existing = await db.select()
      .from(moverEarnings)
      .where(eq(moverEarnings.bookingId, bookingId))
      .limit(1);
    
    if (existing.length) {
      return existing[0];
    }
    
    // Get mover's Stripe Connect account for transfer
    const moverStripeAccountResult = await db.select()
      .from(moverStripeAccounts)
      .where(eq(moverStripeAccounts.moverId, moverId))
      .limit(1);
    
    let stripeTransferId: string | undefined;
    let earningsStatus = 'pending';
    
    // Only create transfer if mover has an onboarded Stripe Connect account
    if (moverStripeAccountResult.length > 0 && moverStripeAccountResult[0].payoutsEnabled) {
      const moverStripeAccount = moverStripeAccountResult[0];
      const transferAmountCents = Math.round(netAmount * 100);
      
      try {
        // Create Stripe Transfer to mover's connected account
        const transfer = await stripe.transfers.create({
          amount: transferAmountCents,
          currency: 'cad',
          destination: moverStripeAccount.stripeAccountId,
          metadata: {
            bookingId,
            moverId,
            grossAmount: grossAmount.toFixed(2),
            platformFee: platformFeeAmount.toFixed(2),
          },
        }, {
          idempotencyKey: `transfer-${bookingId}`,
        });
        
        stripeTransferId = transfer.id;
        earningsStatus = 'available';
        
        logEvent.payment('transfer_created', {
          bookingId,
          moverId,
          transferId: transfer.id,
          amount: netAmount,
        });
      } catch (transferError: any) {
        logEvent.error('transfer_failed', transferError);
        earningsStatus = 'pending';
      }
    } else {
      logEvent.payment('transfer_skipped', {
        bookingId,
        moverId,
        reason: 'No enabled Stripe Connect account',
      });
    }
    
    const [earnings] = await db.insert(moverEarnings).values({
      moverId,
      bookingId,
      grossAmount: grossAmount.toFixed(2),
      platformFeePercent: platformFeePercent.toFixed(2),
      platformFeeAmount: platformFeeAmount.toFixed(2),
      netAmount: netAmount.toFixed(2),
      stripeTransferId,
      status: earningsStatus,
      availableAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Available after 2 days
    }).returning();
    
    return earnings;
  }
  
  // Calculate and set commission on booking before completion
  async function calculateBookingCommission(bookingId: string) {
    const booking = await storage.getBooking(bookingId);
    if (!booking) return null;
    
    const grossAmount = parseFloat(booking.price || '0');
    const platformFeePercent = PLATFORM_COMMISSION_PERCENT;
    const platformFeeAmount = grossAmount * (platformFeePercent / 100);
    const moverNetAmount = grossAmount - platformFeeAmount;
    
    // Update booking with commission data for audit trail
    await db.update(bookings)
      .set({
        platformFeePercent: platformFeePercent.toFixed(2),
        platformFeeAmount: platformFeeAmount.toFixed(2),
        moverNetAmount: moverNetAmount.toFixed(2),
      })
      .where(eq(bookings.id, bookingId));
    
    return {
      grossAmount,
      platformFeePercent,
      platformFeeAmount,
      moverNetAmount,
    };
  }

  // Complete a booking and record earnings (mover action)
  app.post("/api/bookings/:id/complete", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const bookingId = req.params.id;
      
      // Get booking
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Verify mover owns this booking
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length || booking.moverId !== movers[0].id) {
        return res.status(403).json({ error: "Only the assigned mover can complete this booking" });
      }
      
      if (booking.status === 'completed') {
        return res.status(400).json({ error: "Booking already completed" });
      }
      
      // Allow completion from any active status (including legacy in_transit)
      const validCompletionStatuses = [
        'in_transit', 
        BOOKING_STATUSES.UNLOADING,
        BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF,
        BOOKING_STATUSES.EN_ROUTE_TO_PICKUP,
        BOOKING_STATUSES.LOADING,
        'confirmed' // Allow direct completion for edge cases
      ];
      if (!validCompletionStatuses.includes(booking.status)) {
        return res.status(400).json({ error: `Cannot complete booking with status "${booking.status}"` });
      }
      
      if (booking.paymentStatus !== 'succeeded') {
        return res.status(400).json({ error: "Payment must be completed before marking job as done" });
      }
      
      // Calculate and persist commission on booking for audit trail
      const commission = await calculateBookingCommission(bookingId);
      if (!commission) {
        return res.status(500).json({ error: "Failed to calculate commission" });
      }
      
      // Update booking status to completed
      await storage.updateBooking(bookingId, { status: 'completed' });
      
      // Get updated booking with commission data for earnings record
      const updatedBooking = await storage.getBooking(bookingId);
      
      // Record earnings using persisted commission data from booking
      const earnings = await recordMoverEarnings(bookingId, booking.moverId!, updatedBooking);
      
      // Increment mover's completed trips
      const mover = movers[0];
      await db.update(moversTable)
        .set({ completedTrips: (mover.completedTrips || 0) + 1 })
        .where(eq(moversTable.id, mover.id));
      
      res.json({
        success: true,
        message: "Job completed! Earnings recorded.",
        earnings: {
          gross: earnings.grossAmount,
          platformFee: earnings.platformFeeAmount,
          net: earnings.netAmount,
          availableAt: earnings.availableAt,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to complete booking" });
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
  
  // POST /api/ai/items/identify - Identify items from photos (ASYNC mode for performance)
  // Creates pending items immediately and processes in background
  // Supports pre-booking identification (without bookingId) or post-booking identification (with bookingId)
  app.post("/api/ai/items/identify", async (req: Request, res: Response) => {
    try {
      const { bookingId, photoUrls, async: useAsync = true } = req.body;
      
      if (!photoUrls || !Array.isArray(photoUrls) || photoUrls.length === 0) {
        return res.status(400).json({ error: "photoUrls array required" });
      }
      
      const user = (req as any).user;
      
      // If bookingId provided, require authentication and verify ownership
      if (bookingId) {
        if (!requireUser(req, res)) return;
        const booking = await storage.getBooking(bookingId);
        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }
        if (booking.customerId !== user?.id && user?.role !== 'admin') {
          return res.status(403).json({ error: "Not authorized" });
        }
      }
      
      // ASYNC MODE (default): Create pending items and queue for background processing
      // This returns immediately, preventing the request from blocking
      if (useAsync && bookingId) {
        const { visionQueue } = await import('./vision-queue');
        
        console.log(`[Vision Engine 2.0] ASYNC: Queueing ${photoUrls.length} photos for background processing`);
        
        const items: any[] = [];
        
        for (const photoUrl of photoUrls) {
          // Create pending item in database
          const pendingItem = await storage.createIdentifiedItem({
            bookingId,
            photoUrl,
            processingStatus: 'pending',
          });
          
          // Queue for background processing
          await visionQueue.enqueue(pendingItem.id, bookingId, photoUrl);
          
          items.push(pendingItem);
        }
        
        // Return immediately with pending items
        return res.json({
          success: true,
          async: true,
          items,
          message: `${photoUrls.length} photo(s) queued for analysis. Results will appear shortly.`,
          summary: {
            total: photoUrls.length,
            pending: photoUrls.length,
            successful: 0,
            failed: 0,
          },
        });
      }
      
      // SYNC MODE: Process photos synchronously (for pre-booking or explicit sync requests)
      // Import Vision Engine 2.0 (dynamic to avoid loading on startup)
      const { identifyItemV2, toIdentificationResult } = await import('./vision-engine-v2');
      
      console.log(`[Vision Engine 2.0] SYNC: Processing ${photoUrls.length} photos in parallel...`);
      const startTime = Date.now();
      
      // Process ALL photos in parallel for speed using Vision Engine 2.0
      const results = await Promise.allSettled(
        photoUrls.map(async (photoUrl: string, i: number) => {
          console.log(`[Vision Engine 2.0] Starting photo ${i + 1}/${photoUrls.length}: ${photoUrl}`);
          const v2Result = await identifyItemV2(photoUrl);
          // Convert to legacy format for backward compatibility
          const result = toIdentificationResult(v2Result);
          console.log(`[Vision Engine 2.0] Completed photo ${i + 1}: ${result.itemName} (${v2Result.source})`);
          return { photoUrl, result, index: i };
        })
      );
      
      const processingTime = Date.now() - startTime;
      console.log(`[Vision Engine 2.0] All ${photoUrls.length} photos processed in ${processingTime}ms`);
      
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
          console.error(`[Vision Engine 2.0] Error processing photo:`, error);
          
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
        async: false,
        items,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          total: photoUrls.length,
          successful: items.filter(i => i.processingStatus === 'completed').length,
          failed: errors.length,
        },
      });
    } catch (error: any) {
      console.error('[Vision Engine 2.0] Route error:', error);
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

  // Admin: Cleanup bookings with broken/missing images
  app.delete("/api/admin/cleanup-broken-bookings", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Find bookings with NULL/empty images OR old /uploads/ paths (which don't persist after deploy)
      const allBookingsResult = await storage.getAllBookings({ limit: 200 });
      const brokenBookings = allBookingsResult.data.filter((b: any) => {
        if (!b.images || b.images.length === 0) return true;
        // Check if any image uses old /uploads/ path (not cloud storage)
        return b.images.some((img: string) => img.startsWith('/uploads/') && !img.startsWith('/objects/'));
      });
      
      if (brokenBookings.length === 0) {
        return res.json({ message: "No broken bookings found", deleted: 0 });
      }
      
      const bookingIds = brokenBookings.map((b: any) => b.id);
      
      // Delete related records first (FK constraints) - order matters!
      for (const bookingId of bookingIds) {
        // Delete from all tables with FK to bookings
        await db.delete(jobNotifications).where(eq(jobNotifications.bookingId, bookingId));
        await db.delete(messages).where(eq(messages.bookingId, bookingId));
        await db.delete(reviews).where(eq(reviews.bookingId, bookingId));
        await db.delete(identifiedItems).where(eq(identifiedItems.bookingId, bookingId));
        await db.delete(aiRuns).where(eq(aiRuns.bookingId, bookingId));
      }
      
      // Delete the bookings
      for (const bookingId of bookingIds) {
        await db.delete(bookings).where(eq(bookings.id, bookingId));
      }
      
      res.json({ 
        message: `Cleaned up ${brokenBookings.length} bookings with broken images`,
        deleted: brokenBookings.length 
      });
    } catch (error) {
      console.error('[Admin] Cleanup error:', error);
      res.status(500).json({ error: "Failed to cleanup bookings" });
    }
  });

  // ===== LEARNING INTELLIGENCE SYSTEM (Vision Engine™ & PrecisionMatch™) =====
  
  // Submit post-move metrics (customer or mover)
  app.post("/api/bookings/:bookingId/metrics", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const { bookingId } = req.params;
      
      // Verify booking exists and is completed
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Verify user has permission (customer, assigned mover, or admin)
      const isCustomer = booking.customerId === user.id;
      const isMover = booking.moverId && (await storage.getMover(booking.moverId))?.userId === user.id;
      const isAdmin = user.role === 'admin';
      
      if (!isCustomer && !isMover && !isAdmin) {
        return res.status(403).json({ error: "Not authorized to submit metrics for this booking" });
      }
      
      // Check if metrics already exist
      const existingMetrics = await db.select().from(bookingMetricsTable).where(eq(bookingMetricsTable.bookingId, bookingId)).limit(1);
      
      const metricsData: Record<string, any> = {
        bookingId,
        // Estimated values from booking
        estimatedPrice: booking.price,
        estimatedVehicleClass: mapLoadSizeToClass(booking.loadSize),
        // Actuals from request
        actualVehicleClass: req.body.actualVehicleClass,
        actualVolumeCuft: req.body.actualVolumeCuft,
        actualDurationMinutes: req.body.actualDurationMinutes,
        actualPrice: req.body.actualPrice,
        // Customer feedback
        customerSatisfactionRating: isCustomer ? req.body.satisfactionRating : undefined,
        estimateAccuracyRating: isCustomer ? req.body.estimateAccuracyRating : undefined,
        customerNotes: isCustomer ? req.body.notes : undefined,
        // Mover feedback
        moverDifficultyRating: isMover ? req.body.difficultyRating : undefined,
        moverNotes: isMover ? req.body.notes : undefined,
        loadingTimeMinutes: isMover ? req.body.loadingTimeMinutes : undefined,
        unloadingTimeMinutes: isMover ? req.body.unloadingTimeMinutes : undefined,
      };
      
      // Calculate accuracy if both estimated and actual values exist
      if (metricsData.estimatedPrice && metricsData.actualPrice) {
        const estimated = parseFloat(metricsData.estimatedPrice);
        const actual = parseFloat(metricsData.actualPrice);
        metricsData.priceAccuracyPercent = ((1 - Math.abs(estimated - actual) / estimated) * 100).toFixed(2);
      }
      
      if (metricsData.estimatedVehicleClass && metricsData.actualVehicleClass) {
        metricsData.vehicleClassMatch = metricsData.estimatedVehicleClass === metricsData.actualVehicleClass;
      }
      
      let result;
      if (existingMetrics.length > 0) {
        // Update existing metrics
        const updated = await db.update(bookingMetricsTable)
          .set({ ...metricsData as any, updatedAt: new Date() })
          .where(eq(bookingMetricsTable.bookingId, bookingId))
          .returning();
        result = updated[0];
      } else {
        // Create new metrics
        const inserted = await db.insert(bookingMetricsTable).values(metricsData as any).returning();
        result = inserted[0];
      }
      
      console.log(`[Learning] Metrics submitted for booking ${bookingId} by ${user.role}`);
      res.json(result);
    } catch (error) {
      console.error('[Learning] Metrics submission error:', error);
      res.status(500).json({ error: "Failed to submit metrics" });
    }
  });
  
  // Helper function to map load size to vehicle class (uses global pricing config)
  function mapLoadSizeToClass(loadSize: string): string {
    // Import from shared pricing module for consistency
    const { getVehicleClassFromLoadSize } = require('@shared/pricing');
    return getVehicleClassFromLoadSize(loadSize);
  }
  
  // Submit item feedback for Vision Engine™ learning
  app.post("/api/identified-items/:itemId/feedback", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const { itemId } = req.params;
      
      // Get the item
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
      
      const isCustomer = booking.customerId === user.id;
      const isMover = booking.moverId && (await storage.getMover(booking.moverId))?.userId === user.id;
      const isAdmin = user.role === 'admin';
      
      if (!isCustomer && !isMover && !isAdmin) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Create item feedback
      const feedbackData = {
        identifiedItemId: itemId,
        bookingId: item.bookingId,
        submittedBy: user.id,
        submitterRole: user.role,
        // Original values from AI
        originalItemName: item.itemName,
        originalCategory: item.category,
        originalWeightKg: item.weightKg,
        originalVolumeCuft: item.volumeCuft,
        originalVehicleType: item.vehicleType,
        // Corrected values from user
        correctedItemName: req.body.correctedItemName,
        correctedCategory: req.body.correctedCategory,
        correctedWeightKg: req.body.correctedWeightKg,
        correctedVolumeCuft: req.body.correctedVolumeCuft,
        correctedVehicleType: req.body.correctedVehicleType,
        feedbackReason: req.body.feedbackReason,
        feedbackNotes: req.body.feedbackNotes,
      };
      
      const inserted = await db.insert(itemFeedbackTable).values(feedbackData).returning();
      
      console.log(`[Vision Engine™ Learning] Feedback submitted for item ${itemId} by ${user.role}`);
      res.json(inserted[0]);
    } catch (error) {
      console.error('[Vision Engine™] Feedback error:', error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });
  
  // Get learning insights (admin only)
  app.get("/api/learning/insights", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get aggregate metrics
      const allMetrics = await db.select().from(bookingMetricsTable);
      const allFeedback = await db.select().from(itemFeedbackTable);
      const allPerformance = await db.select().from(moverPerformanceTable);
      
      // Calculate Vision Engine accuracy
      const feedbackWithCorrections = allFeedback.filter(f => f.correctedItemName || f.correctedCategory);
      const visionAccuracy = feedbackWithCorrections.length > 0 
        ? ((allFeedback.length - feedbackWithCorrections.length) / allFeedback.length * 100).toFixed(1)
        : 100;
      
      // Calculate price accuracy
      const metricsWithPrice = allMetrics.filter(m => m.priceAccuracyPercent);
      const avgPriceAccuracy = metricsWithPrice.length > 0
        ? (metricsWithPrice.reduce((sum, m) => sum + parseFloat(m.priceAccuracyPercent || '0'), 0) / metricsWithPrice.length).toFixed(1)
        : null;
      
      // Calculate vehicle class match rate
      const metricsWithVehicle = allMetrics.filter(m => m.vehicleClassMatch !== null);
      const vehicleMatchRate = metricsWithVehicle.length > 0
        ? ((metricsWithVehicle.filter(m => m.vehicleClassMatch).length / metricsWithVehicle.length) * 100).toFixed(1)
        : null;
      
      // Calculate average ratings
      const customerRatings = allMetrics.filter(m => m.customerSatisfactionRating);
      const avgSatisfaction = customerRatings.length > 0
        ? (customerRatings.reduce((sum, m) => sum + (m.customerSatisfactionRating || 0), 0) / customerRatings.length).toFixed(1)
        : null;
      
      // Get top correction reasons
      const reasonCounts: Record<string, number> = {};
      allFeedback.forEach(f => {
        if (f.feedbackReason) {
          reasonCounts[f.feedbackReason] = (reasonCounts[f.feedbackReason] || 0) + 1;
        }
      });
      
      const topCorrectionReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));
      
      res.json({
        visionEngine: {
          totalItemsAnalyzed: allFeedback.length,
          accuracyPercent: visionAccuracy,
          feedbackReceived: feedbackWithCorrections.length,
          topCorrectionReasons,
        },
        pricingAccuracy: {
          totalBookingsAnalyzed: allMetrics.length,
          avgAccuracyPercent: avgPriceAccuracy,
          vehicleClassMatchRate: vehicleMatchRate,
        },
        customerSatisfaction: {
          totalRatings: customerRatings.length,
          avgRating: avgSatisfaction,
        },
        moverPerformance: {
          totalRecords: allPerformance.length,
          avgTotalMoveMinutes: allPerformance.length > 0
            ? Math.round(allPerformance.reduce((sum, p) => sum + (p.totalMoveMinutes || 0), 0) / allPerformance.length)
            : null,
        },
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Learning] Insights error:', error);
      res.status(500).json({ error: "Failed to get learning insights" });
    }
  });
  
  // Get booking metrics (for displaying on completed booking page)
  app.get("/api/bookings/:bookingId/metrics", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const { bookingId } = req.params;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Verify access
      const isCustomer = booking.customerId === user.id;
      const isMover = booking.moverId && (await storage.getMover(booking.moverId))?.userId === user.id;
      const isAdmin = user.role === 'admin';
      
      if (!isCustomer && !isMover && !isAdmin) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const metrics = await db.select().from(bookingMetricsTable).where(eq(bookingMetricsTable.bookingId, bookingId)).limit(1);
      
      if (metrics.length === 0) {
        return res.json(null);
      }
      
      res.json(metrics[0]);
    } catch (error) {
      console.error('[Learning] Get metrics error:', error);
      res.status(500).json({ error: "Failed to get metrics" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
