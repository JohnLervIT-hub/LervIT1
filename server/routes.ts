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
import { db, pool } from "./db";
import { moverWebSocket, generateWebSocketToken } from "./websocket";
import { insertUserSchema, insertMoverSchema, insertBookingSchema, insertMessageSchema, insertReviewSchema, jobNotifications, insertSupportTicketSchema, insertSupportTicketReplySchema, supportTickets, supportTicketReplies, bookings, users as usersTable, movers as moversTable, verificationItems, insertVerificationItemSchema, identifiedItems, messages, reviews, aiRuns, aiSupportInsights, User, moverStripeAccounts, moverEarnings, moverPayouts, BOOKING_STATUSES, ACTIVE_STATUSES, isValidStatusTransition, getNextValidStatuses, BOOKING_STATUS_INFO, bookingMetrics as bookingMetricsTable, itemFeedback as itemFeedbackTable, moverPerformance as moverPerformanceTable, moverTermsAcceptance, emailCampaigns, insertEmailCampaignSchema, inAppNotifications, abandonedBookings, insertAbandonedBookingSchema, analyticsEvents, insertAnalyticsEventSchema } from "@shared/schema";
import { analyzeTicket, getQuickResponses } from "./ai-support-analyzer";
import { z } from "zod";
import { eq, and, notInArray, sql, desc, inArray, lt, or, isNull, isNotNull } from "drizzle-orm";
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

// Helper to format phone number for display (e.g., +18335551234 -> 1-833-555-1234)
function formatPhoneNumber(phone: string): string {
  // Remove + if present
  const cleaned = phone.replace(/^\+/, '');
  // US/Canada format: 1-XXX-XXX-XXXX
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `1-${cleaned.slice(1, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  // 10 digit format: XXX-XXX-XXXX
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

// Helper to mask full address for privacy - only show city/area
// Strips street numbers/addresses but keeps city and province
function maskAddressForPrivacy(location: string | null): string {
  if (!location) return "Calgary, AB";
  
  const parts = location.split(',').map(p => p.trim());
  
  // Helper to check if a part looks like a street address (contains numbers)
  const isStreetAddress = (part: string): boolean => /\d/.test(part);
  
  // Helper to check if a part is a province code (AB, BC, ON, etc.)
  const isProvinceCode = (part: string): boolean => /^[A-Z]{2}$/i.test(part.replace(/[A-Z]\d[A-Z]\s*\d[A-Z]\d/gi, '').trim());
  
  // Clean postal codes from any part
  const cleanPostalCode = (part: string): string => part.replace(/[A-Z]\d[A-Z]\s*\d[A-Z]\d/gi, '').trim();
  
  if (parts.length === 1) {
    // Single part - return as-is unless it has numbers (street)
    if (isStreetAddress(parts[0])) {
      return "Calgary, AB";
    }
    const cleaned = cleanPostalCode(parts[0]);
    return cleaned.toLowerCase().includes('calgary') ? "Calgary, AB" : (cleaned || "Calgary, AB");
  }
  
  if (parts.length === 2) {
    const firstPart = cleanPostalCode(parts[0]);
    const secondPart = cleanPostalCode(parts[1]);
    
    // Check if first part is a street address (has numbers)
    if (isStreetAddress(parts[0])) {
      // First part is street, second is city - return city with AB province
      if (secondPart.toLowerCase().includes('calgary')) {
        return "Calgary, AB";
      }
      return secondPart && secondPart.length > 2 ? `${secondPart}, AB` : "Calgary, AB";
    }
    
    // No street number - this is likely "City, Province" format, return as-is
    if (firstPart.toLowerCase().includes('calgary')) {
      return "Calgary, AB";
    }
    return `${firstPart}, ${secondPart}`;
  }
  
  if (parts.length >= 3) {
    // Street, City, Province format - return just City, Province
    const city = cleanPostalCode(parts[parts.length - 2]);
    const province = cleanPostalCode(parts[parts.length - 1]);
    
    if (city.toLowerCase().includes('calgary')) {
      return "Calgary, AB";
    }
    return city && city.length > 2 ? `${city}, ${province || 'AB'}` : "Calgary, AB";
  }
  
  return "Calgary, AB";
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
  
  // ===== PUBLIC CONFIG ROUTES (no auth required) =====
  // Expose support phone number for display on frontend
  app.get("/api/config/support-phone", (_req: Request, res: Response) => {
    const phoneNumber = process.env.TELNYX_PHONE_NUMBER || "";
    // Return formatted phone number for display
    res.json({ 
      phoneNumber: phoneNumber,
      formattedPhone: phoneNumber ? formatPhoneNumber(phoneNumber) : "1-888-982-0885"
    });
  });
  
  // Return the correct Stripe public key based on environment
  // Development uses test keys, production uses live keys
  app.get("/api/config/stripe-public-key", (_req: Request, res: Response) => {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const testKey = process.env.TESTING_VITE_STRIPE_PUBLIC_KEY;
    const liveKey = process.env.VITE_STRIPE_PUBLIC_KEY;
    const publicKey = isDevelopment && testKey ? testKey : liveKey;
    
    res.json({ 
      publicKey: publicKey || '',
      isTestMode: isDevelopment && !!testKey
    });
  });
  
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
      
      // Forward the browser's Referer/Origin so the request passes HTTP Referrer restrictions on the key
      const forwardedReferer = req.headers['referer'] || req.headers['origin'] || '';
      const fetchHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 LervIT-Server/1.0',
      };
      if (forwardedReferer) {
        fetchHeaders['Referer'] = forwardedReferer;
      }

      // Make request to Google Places API
      const response = await fetch(url.toString(), { headers: fetchHeaders });
      
      if (!response.ok) {
        console.error('[PLACES API] Google API error:', response.status);
        return res.status(500).json({ error: "Failed to fetch predictions" });
      }
      
      const data = await response.json();
      
      // Return predictions to client (without exposing API key)
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error(`[PLACES API] Google returned status: ${data.status} — error_message: ${data.error_message || 'none'} — forwarded referer: ${forwardedReferer || 'none'}`);
      }

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
        email: z.string().email("Please enter a valid email address (e.g. you@example.com)"),
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
      
      // Successful login - reset failed attempts counter and update last login time
      await db.update(usersTable)
        .set({ 
          failedLoginAttempts: 0,
          lockedUntil: null,
          lockReason: null,
          lastLoginAt: new Date()
        })
        .where(eq(usersTable.id, user.id));
      
      // Admin single-session enforcement: invalidate all previous sessions
      if (user.role === 'admin') {
        try {
          // Delete all existing sessions for this admin user from the session store
          // The sess column is JSONB and contains userId
          await pool.query(
            `DELETE FROM user_sessions WHERE sess->>'userId' = $1`,
            [user.id]
          );
          console.log(`[Security] Invalidated previous sessions for admin: ${user.email}`);
        } catch (sessionErr) {
          console.error('[Security] Failed to invalidate admin sessions:', sessionErr);
          // Continue with login even if session cleanup fails
        }
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
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const userId = req.session?.userId;
    
    // Update last logout timestamp if user is logged in
    if (userId) {
      try {
        await db.update(usersTable)
          .set({ lastLogoutAt: new Date() })
          .where(eq(usersTable.id, userId));
      } catch (error) {
        console.error("Failed to update logout timestamp:", error);
      }
    }
    
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
      
      // If address was updated and user is a mover, geocode and update mover coordinates
      if (updates.address && user.role === 'mover') {
        console.log(`[Profile] Mover address update detected: "${updates.address}"`);
        try {
          const { geocodeAddress } = await import("./google-maps");
          const movers = await storage.getMovers({ userId: user.id });
          console.log(`[Profile] Found ${movers.length} mover profiles for user ${user.id}`);
          
          if (movers.length > 0) {
            const result = await geocodeAddress(updates.address);
            console.log(`[Profile] Geocode result:`, JSON.stringify(result));
            
            // Update coordinates even if using fallback (success: false just means mock/fallback was used)
            if (result && result.coordinates) {
              await storage.updateMover(movers[0].id, {
                location: updates.address,
                latitude: result.coordinates.lat,
                longitude: result.coordinates.lng,
              });
              console.log(`[Profile] ✓ Updated mover ${movers[0].id} coordinates: ${result.coordinates.lat}, ${result.coordinates.lng}`);
            } else {
              console.warn(`[Profile] Could not geocode address: ${updates.address}`);
            }
          }
        } catch (geocodeError) {
          console.error('[Profile] Geocoding error:', geocodeError);
          // Don't fail the request if geocoding fails - address is still saved
        }
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
        failedLoginAttempts: 0,
        lockedUntil: null,
        lockReason: null,
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

      // Handle SMS delivery result
      const isDev = process.env.NODE_ENV === 'development';
      if (!smsSent) {
        console.log(`[SMS FAILED] Verification code for ${phone}: ${verificationCode}`);
        if (isDev) {
          // In development only, show the code for testing
          res.json({ 
            message: "SMS delivery failed. Use the code shown below.",
            devCode: verificationCode,
            smsFailed: true,
          });
        } else {
          // In production, don't expose the code - suggest contacting support
          res.json({ 
            message: "SMS could not be delivered to this number. Please try a different mobile number or contact support@lervit.com for assistance.",
            smsFailed: true,
          });
        }
      } else {
        res.json({ message: "Verification code sent to your phone" });
      }
    } catch (error) {
      logger.error({ error }, "Pre-signup phone verification send error");
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Pre-signup: Resend verification code via email (fallback when SMS fails)
  app.post("/api/auth/pre-signup/resend-via-email", async (req: Request, res: Response) => {
    try {
      const emailFallbackSchema = z.object({
        phone: z.string().min(10, "Invalid phone number"),
        email: z.string().email("Invalid email address"),
      });
      const { phone, email } = validateBody(emailFallbackSchema, req.body);

      // Find existing verification token for this phone
      const { phoneVerificationTokens } = await import("@shared/schema");
      const tokens = await db.select().from(phoneVerificationTokens)
        .where(eq(phoneVerificationTokens.phone, phone))
        .limit(1);

      if (tokens.length === 0) {
        return res.status(400).json({ error: "No verification code found. Please request a new code first." });
      }

      const token = tokens[0];

      // Check if token has expired
      if (new Date() > new Date(token.expiresAt)) {
        return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      }

      // Check if already verified
      if (token.verified) {
        return res.status(400).json({ error: "Phone already verified. Please proceed to complete signup." });
      }

      // Send OTP via email
      const emailSent = await notificationService.sendPhoneVerificationCodeByEmail(email, phone, token.verificationCode);

      if (emailSent) {
        res.json({ 
          message: "Verification code sent to your email",
          emailSent: true,
        });
      } else {
        res.status(500).json({ 
          error: "Failed to send email. Please try again or contact support@lervit.com",
          emailSent: false,
        });
      }
    } catch (error) {
      logger.error({ error }, "Pre-signup email fallback error");
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
      
      // Calculate driving distances using Google Maps API (batch request for efficiency)
      let drivingDistances: Map<string, { distanceKm: number; durationMinutes: number }> = new Map();
      
      if (userLat && userLng) {
        const { getBatchDrivingDistances } = await import("./google-maps");
        
        // Prepare destinations for batch API call
        const destinations = movers
          .filter(m => m.latitude !== null && m.longitude !== null)
          .map(m => ({
            id: m.id,
            coords: { lat: m.latitude!, lng: m.longitude! }
          }));
        
        // Get driving distances in a single API call
        drivingDistances = await getBatchDrivingDistances(
          { lat: userLat, lng: userLng },
          destinations
        );
      }
      
      // Enrich movers with user data and driving distance
      // Privacy: Mask full street addresses - only show city/area
      const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);
      
      let enrichedMovers = await Promise.all(
        movers.map(async (mover) => {
          const user = await storage.getUser(mover.userId);
          
          // Get driving distance from batch results
          const drivingData = drivingDistances.get(mover.id);
          const distance = drivingData?.distanceKm ?? null;
          const drivingMinutes = drivingData?.durationMinutes ?? null;
          
          // Check if mover has recent GPS update (within last hour) - Uber-style live location
          const isLiveLocation = mover.lastLocationUpdate 
            ? new Date(mover.lastLocationUpdate) > ONE_HOUR_AGO
            : false;
          
          // Get Stripe Connect account status for this mover (moverId references movers.id)
          const stripeAccounts = await db.select()
            .from(moverStripeAccounts)
            .where(eq(moverStripeAccounts.moverId, mover.id))
            .limit(1);
          const stripeAccount = stripeAccounts[0] || null;
          
          return {
            ...mover,
            // Mask location for privacy - only show city/area, not full street address
            location: maskAddressForPrivacy(mover.location),
            distance,
            drivingMinutes,
            isLiveLocation,
            user: user ? { name: user.name, email: user.email, phone: user.phone } : null,
            stripeConnect: stripeAccount ? {
              status: stripeAccount.onboardingStatus,
              chargesEnabled: stripeAccount.chargesEnabled,
              payoutsEnabled: stripeAccount.payoutsEnabled,
            } : null
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
      console.error('Get movers error:', error);
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
  
  // GET /api/movers/me/ws-token - Get WebSocket authentication token for real-time notifications
  app.get("/api/movers/me/ws-token", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      if (user.role !== 'mover') {
        return res.status(403).json({ error: "Only movers can receive job notifications" });
      }
      
      // Find mover profile by userId
      const movers = await storage.getMovers({});
      const mover = movers.find(m => m.userId === user.id);
      
      if (!mover) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      
      // Generate short-lived token for WebSocket authentication
      const token = generateWebSocketToken(user.id, mover.id);
      
      res.json({ token, expiresIn: 300 }); // 5 minutes
    } catch (error) {
      console.error('Get WebSocket token error:', error);
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
        onboardingCompleted: true,
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

  // Update mover location from GPS coordinates
  app.patch("/api/movers/me/location", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      if (user.role !== 'mover') {
        return res.status(403).json({ error: "Only movers can update their location" });
      }
      
      const locationSchema = z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      });
      
      const { latitude, longitude } = validateBody(locationSchema, req.body);
      
      // Get mover profile
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      
      const mover = movers[0];
      
      // Reverse geocode to get address from coordinates
      let locationText = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      try {
        const { reverseGeocode } = await import("./google-maps");
        const result = await reverseGeocode(latitude, longitude);
        if (result) {
          locationText = result;
        }
      } catch (geoError) {
        console.warn('[Location] Reverse geocoding failed, using coordinates:', geoError);
      }
      
      // Update mover's coordinates with timestamp
      await storage.updateMover(mover.id, {
        latitude,
        longitude,
        location: locationText,
        lastLocationUpdate: new Date(),
      });
      
      console.log(`[Location] Updated mover ${mover.id} GPS: ${latitude}, ${longitude} -> ${locationText}`);

      // LATE DISPATCH: Check for paid bookings with no active job notifications and notify this mover
      // This handles the case where customer paid when no movers were online
      try {
        const { findNearestMovers, calculateExpiryTime } = await import("@shared/matching");
        const { toDecimalString } = await import("@shared/utils");

        // Find bookings that are paid/pending assignment with no active notifications for this mover
        const pendingBookings = await db.select().from(bookings)
          .where(and(
            eq(bookings.paymentStatus, 'succeeded'),
            eq(bookings.status, BOOKING_STATUSES.PENDING),
            sql`${bookings.moverId} IS NULL`
          ))
          .orderBy(bookings.scheduledDate);

        for (const pendingBooking of pendingBookings) {
          // Check if this mover already has any notification (pending/expired/declined) for this booking
          const existingNotif = await db.select({ id: jobNotifications.id })
            .from(jobNotifications)
            .where(and(
              eq(jobNotifications.bookingId, pendingBooking.id),
              eq(jobNotifications.moverId, mover.id)
            ))
            .limit(1);
          if (existingNotif.length > 0) continue;

          // Check if there are ANY active (pending, not expired) notifications for this booking
          const activeNotifs = await db.select({ id: jobNotifications.id })
            .from(jobNotifications)
            .where(and(
              eq(jobNotifications.bookingId, pendingBooking.id),
              eq(jobNotifications.status, 'pending'),
              sql`${jobNotifications.expiresAt} > NOW()`
            ))
            .limit(1);

          // Only dispatch to movers if the booking has NO currently active notifications
          if (activeNotifs.length > 0) continue;

          // Check if this mover is within range of the pickup location using proximity matching
          const pickupLat = parseFloat(String(pendingBooking.pickupLatitude || '0'));
          const pickupLng = parseFloat(String(pendingBooking.pickupLongitude || '0'));
          if (!pickupLat || !pickupLng) continue;

          const moverData = [{
            moverId: mover.id, userId: mover.userId,
            name: user.name, vehicleType: mover.vehicleType,
            rating: mover.rating || '0', totalMoves: mover.totalMoves,
            isAvailable: mover.isAvailable, latitude, longitude,
          }];

          const matched = findNearestMovers(
            { lat: pickupLat, lng: pickupLng },
            { lat: parseFloat(String(pendingBooking.dropoffLatitude || '0')), lng: parseFloat(String(pendingBooking.dropoffLongitude || '0')) },
            (pendingBooking.loadSize || 'medium') as 'boxes' | 'medium' | 'large' | 'apartment',
            moverData, {}, pendingBooking.aiRecommendedVehicle || null
          );

          if (matched.length > 0) {
            const expiresAt = calculateExpiryTime(10);
            await storage.createJobNotification({
              bookingId: pendingBooking.id, moverId: mover.id,
              distanceToPickup: toDecimalString(matched[0].distanceToPickup),
              estimatedEarnings: toDecimalString(matched[0].estimatedEarnings),
              status: 'pending', expiresAt,
            });
            moverWebSocket.notifyMover(mover.userId, {
              type: 'job_notification', bookingId: pendingBooking.id,
              pickupAddress: pendingBooking.pickupAddress || '', dropoffAddress: pendingBooking.dropoffAddress || '',
              price: toDecimalString(matched[0].estimatedEarnings),
              estimatedTime: `${Math.round(matched[0].distanceToPickup)} km`, expiresAt,
            });
            const moverUser = await storage.getUser(mover.userId);
            if (moverUser) {
              await notificationService.sendJobAssignment(moverUser, pendingBooking, matched[0].estimatedEarnings.toFixed(2)).catch(() => {});
            }
            console.log(`[Late Dispatch] Sent pending booking ${pendingBooking.id} to newly-online mover ${mover.id}`);
          }
        }
      } catch (dispatchErr) {
        console.error('[Late Dispatch] Error checking for pending jobs:', dispatchErr);
      }

      res.json({ 
        success: true, 
        location: locationText,
        latitude,
        longitude,
      });
    } catch (error) {
      console.error('[Location] Update error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update location" });
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
      
      // Upload to Object Storage for production persistence
      const objectStorageService = new ObjectStorageService();
      const fileUrls: string[] = [];
      
      for (const file of req.files as Express.Multer.File[]) {
        try {
          // Read the file from local disk (multer saves it temporarily)
          const fileBuffer = fs.readFileSync(file.path);
          
          // Upload to cloud storage with verification prefix
          const cloudPath = await objectStorageService.uploadBuffer(
            fileBuffer,
            `verification_${req.params.type}_${file.originalname}`,
            file.mimetype,
            user.id
          );
          
          fileUrls.push(cloudPath);
          
          // Clean up local file after successful upload
          fs.unlinkSync(file.path);
        } catch (uploadError) {
          console.error('Object Storage upload failed for verification doc, using local fallback:', uploadError);
          // Fallback to local path if Object Storage fails
          fileUrls.push(`/uploads/${file.filename}`);
        }
      }
      
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
        requiresTermsAcceptance: !hasAccepted,
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
  
  // PATCH /api/admin/movers/:id/override-onboarding - Admin override to mark onboarding complete
  app.patch("/api/admin/movers/:id/override-onboarding", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const moverId = req.params.id;
      const adminId = (req.session as any).userId;
      
      const mover = await storage.getMover(moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      const result = await storage.updateMover(moverId, { onboardingCompleted: true });
      
      console.log(`[Admin] Onboarding override for mover ${moverId} by admin ${adminId}`);
      
      res.json({ success: true, message: "Onboarding marked complete", mover: result });
    } catch (error) {
      console.error('Admin onboarding override error:', error);
      res.status(500).json({ error: "Failed to override onboarding" });
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

      // --- Post-update contact change flows ---
      const normalizedNewEmail = email?.trim().toLowerCase();
      const normalizedOldEmail = existingUser[0].email?.trim().toLowerCase();
      const normalizedNewPhone = phone?.trim();
      const normalizedOldPhone = existingUser[0].phone?.trim();
      const emailChanged = normalizedNewEmail !== undefined && normalizedNewEmail !== normalizedOldEmail;
      const phoneChanged = normalizedNewPhone !== undefined && normalizedNewPhone !== normalizedOldPhone;
      const isMover = updatedUser.role === 'mover';

      logger.info({
        env: process.env.NODE_ENV,
        event: "admin_contact_change_eval",
        userId,
        emailProvided: email !== undefined,
        emailChanged,
        phoneProvided: phone !== undefined,
        phoneChanged,
        oldEmail: normalizedOldEmail,
        newEmail: normalizedNewEmail,
      });

      // Invalidate all sessions for this user if email or phone changed (force re-login)
      if (emailChanged || phoneChanged) {
        try {
          await pool.query(
            `DELETE FROM user_sessions WHERE sess->>'userId' = $1`,
            [userId]
          );
          logger.info({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, emailChanged, phoneChanged, action: 'sessions_invalidated' });
        } catch (sessionErr) {
          logger.error({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'session_invalidation_failed' });
        }
      }

      // Email change flow
      if (emailChanged && email) {
        try {
          const { randomBytes } = await import("crypto");
          const verificationToken = randomBytes(32).toString("hex");
          const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

          // Reset email verification status and set new token
          await db.update(usersTable)
            .set({ emailVerified: false, verificationToken, verificationTokenExpiry })
            .where(eq(usersTable.id, userId));

          // Send verification email to the new address
          await notificationService.sendVerificationEmail(email, updatedUser.name || 'User', verificationToken);

          // Send security alert to old address
          await notificationService.sendEmail({
            to: existingUser[0].email,
            subject: 'Your LervIT Account Email Was Changed',
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                <h2 style="color:#1a1a1a;">Email Address Updated</h2>
                <p>Hi ${updatedUser.name || 'there'},</p>
                <p>Your LervIT account email address was updated by an administrator to:</p>
                <p style="font-size:16px;font-weight:bold;color:#2563eb;">${email}</p>
                <p>A verification link has been sent to your new address. You'll need to verify it before you can log back in.</p>
                <p style="color:#dc2626;">If you did not request this change, contact support immediately at <a href="mailto:support@lervit.ca">support@lervit.ca</a>.</p>
              </div>`,
          });

          // Sync new email to Stripe Connect account if mover has one
          if (isMover) {
            const moverProfile = await db.select().from(moversTable).where(eq(moversTable.userId, userId)).limit(1);
            if (moverProfile.length > 0) {
              const stripeAccount = await db.select().from(moverStripeAccounts)
                .where(eq(moverStripeAccounts.moverId, moverProfile[0].id))
                .limit(1);
              if (stripeAccount.length > 0 && stripeAccount[0].stripeAccountId) {
                try {
                  await stripe.accounts.update(stripeAccount[0].stripeAccountId, { email });
                  logger.info({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'stripe_email_synced', stripeAccountId: stripeAccount[0].stripeAccountId });
                } catch (stripeErr) {
                  logger.error({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'stripe_email_sync_failed', error: stripeErr instanceof Error ? stripeErr.message : 'Unknown' });
                }
              }
            }
          }

          logger.info({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'email_change_complete', newEmail: email });
        } catch (emailErr) {
          logger.error({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'email_change_flow_failed', error: emailErr instanceof Error ? emailErr.message : 'Unknown' });
        }
      }

      // Phone change flow — SMS alert to new number
      if (phoneChanged && phone) {
        try {
          await notificationService.sendSMS({
            to: phone,
            message: `LervIT: Your account phone number has been updated by an administrator. If you did not request this, contact support at support@lervit.ca`,
          });
          logger.info({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'phone_change_sms_sent' });
        } catch (smsErr) {
          logger.error({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'phone_change_sms_failed', error: smsErr instanceof Error ? smsErr.message : 'Unknown' });
        }
      }

      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json({ 
        message: isUpgradeToMover 
          ? "User upgraded to mover successfully. Mover profile created and notification sent." 
          : "User updated", 
        user: userWithoutPassword,
        moverProfileCreated: isUpgradeToMover,
        emailChanged,
        phoneChanged,
        sessionsInvalidated: emailChanged || phoneChanged,
        emailVerificationSent: emailChanged,
      });
    } catch (error) {
      console.error('Admin update user error:', error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // POST /api/admin/users/:id/force-verify-email - Reset emailVerified, send verification email, invalidate sessions
  app.post("/api/admin/users/:id/force-verify-email", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const userId = req.params.id;

      const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (user.length === 0) return res.status(404).json({ error: "User not found" });

      const { randomBytes } = await import("crypto");
      const verificationToken = randomBytes(32).toString("hex");
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.update(usersTable)
        .set({ emailVerified: false, verificationToken, verificationTokenExpiry })
        .where(eq(usersTable.id, userId));

      // Invalidate all sessions so they must re-verify before logging in
      await pool.query(`DELETE FROM user_sessions WHERE sess->>'userId' = $1`, [userId]);

      // Send verification email to current address
      await notificationService.sendVerificationEmail(user[0].email, user[0].name || 'User', verificationToken);

      logger.info({
        env: process.env.NODE_ENV,
        event: "admin_force_verify_email",
        userId,
        email: user[0].email,
        adminId: (req as any).user?.id,
      });

      res.json({ message: "Verification email sent. User has been logged out and must verify before logging in." });
    } catch (error) {
      console.error("Admin force-verify-email error:", error);
      res.status(500).json({ error: "Failed to send verification email" });
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

  // POST /api/admin/email/upload-attachment - Upload file attachment for email
  const emailAttachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit for videos
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
        'video/mpeg',
      ];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Allowed: PDF, Word, Excel, CSV, images, and videos.'));
      }
    },
  });

  app.post("/api/admin/email/upload-attachment", emailAttachmentUpload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Return the file as base64 for immediate use (no storage needed)
      const base64Content = file.buffer.toString('base64');
      
      res.json({
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
        content: base64Content,
      });
    } catch (error: any) {
      console.error('Upload attachment error:', error);
      res.status(500).json({ error: error.message || "Failed to upload attachment" });
    }
  });

  // POST /api/admin/email/send - Send an email campaign
  app.post("/api/admin/email/send", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const adminUser = (req as any).user;
      const { subject, content, type, audienceType, recipientIds, attachmentLinks, fileAttachments } = req.body;
      
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
          type,
          attachmentLinks,
          fileAttachments
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

  // ===== PROMO CODE VALIDATION =====
  app.post("/api/promo/validate", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const { code } = req.body;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ valid: false, message: "Promo code is required" });
      }

      const normalizedCode = code.trim().toUpperCase();

      if (normalizedCode !== "LERVIT20") {
        return res.status(200).json({ valid: false, message: "Invalid promo code" });
      }

      const latestUser = await storage.getUser(user.id);
      if (!latestUser) {
        return res.status(200).json({ valid: false, message: "User not found" });
      }

      if ((latestUser.promoUsesCount || 0) >= 2) {
        return res.status(200).json({ valid: false, message: "You've already used this promo code on 2 moves" });
      }

      const usesRemaining = 2 - (latestUser.promoUsesCount || 0);
      return res.status(200).json({
        valid: true,
        code: "LERVIT20",
        discountPercent: 20,
        usesRemaining,
        message: `20% off applied! ${usesRemaining} use${usesRemaining === 1 ? '' : 's'} remaining.`
      });
    } catch (error: any) {
      console.error("Promo validation error:", error);
      return res.status(500).json({ valid: false, message: "Failed to validate promo code" });
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
      const aiDetectedVolumeCuft = typeof req.body.aiDetectedVolumeCuft === 'number' ? req.body.aiDetectedVolumeCuft : undefined;
      const priceBreakdown = calculatePrice(
        distance,
        bookingData.loadSize as 'boxes' | 'medium' | 'large' | 'apartment',
        bookingData.pickupDifficulty as any,
        bookingData.dropoffDifficulty as any,
        bookingData.heavyItem || false,
        bookingData.numberOfMovers as 1 | 2,
        undefined,
        aiDetectedVolumeCuft
      );
      
      // Calculate promo code discount
      const latestUser = await storage.getUser(user.id);
      let finalPrice = priceBreakdown.totalCost;
      let discountPercent = 0;
      let discountAmount = 0;
      let discountReason: string | null = null;
      let promoCode: string | null = null;
      let moverBalanceOwed = 0;

      // NOTE: Re-fetches latest user state above to minimize race conditions.
      // For high-concurrency scenarios, consider adding row-level locking.
      const submittedPromo = bookingData.promoCode?.trim().toUpperCase();
      if (submittedPromo === "LERVIT20" && latestUser && (latestUser.promoUsesCount || 0) < 2) {
        promoCode = "LERVIT20";
        discountPercent = 20;
        discountAmount = Math.round(priceBreakdown.totalCost * 0.20 * 100) / 100;
        finalPrice = priceBreakdown.totalCost - discountAmount;
        const usesRemaining = 2 - (latestUser.promoUsesCount || 0) - 1;
        discountReason = `LERVIT20 promo - 20% off (${usesRemaining} use${usesRemaining === 1 ? '' : 's'} remaining)`;
        // Platform absorbs discount: mover gets 85% of ORIGINAL price
        // Stripe auto-payout gives mover 85% of discounted price
        // Balance owed = 85% of original - 85% of discounted = 85% * discountAmount
        moverBalanceOwed = Math.round(0.85 * discountAmount * 100) / 100;
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
        promoCode: promoCode,
        discountPercent: toDecimalString(discountPercent),
        discountAmount: toDecimalString(discountAmount),
        discountReason: discountReason,
        moverBalanceOwed: toDecimalString(moverBalanceOwed),
        notifiedAt: new Date(),
      } as any);
      
      // Increment promo usage count if promo applied
      if (promoCode && discountAmount > 0) {
        await storage.updateUser(user.id, { 
          hasUsedFirstMoveDiscount: true,
          promoUsesCount: (latestUser?.promoUsesCount || 0) + 1 
        });
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
        
        // Get all PAID bookings available for acceptance
        // Only show "confirmed" status (paid jobs) without a mover assigned
        // Do NOT show "pending" or "pending_payment" as those haven't paid yet
        const allBookingsResult = await storage.getAllBookings({ limit: 200 });
        const availableBookings = allBookingsResult.data.filter(
          (b: any) => b.status === "confirmed" && b.moverId === null && b.paymentStatus === "succeeded"
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
      
      // For customers, get all their reviews to check which bookings have been reviewed
      let reviewedBookingIds = new Set<string>();
      if (user.role === "customer") {
        const customerReviews = await db.select({ bookingId: reviews.bookingId })
          .from(reviews)
          .where(eq(reviews.customerId, user.id));
        reviewedBookingIds = new Set(customerReviews.map(r => r.bookingId));
      }
      
      // For movers, look up distanceToPickup from job notifications
      let moverDistanceToPickupMap = new Map<string, string>();
      let currentMoverForProximity: any = null;
      if (user.role === "mover") {
        const mover = await storage.getMoverByUserId(user.id);
        if (mover) {
          currentMoverForProximity = mover;
          const notifications = await db.select({
            bookingId: jobNotifications.bookingId,
            distanceToPickup: jobNotifications.distanceToPickup,
          })
            .from(jobNotifications)
            .where(eq(jobNotifications.moverId, mover.id));
          notifications.forEach(n => {
            if (n.distanceToPickup) {
              moverDistanceToPickupMap.set(n.bookingId, n.distanceToPickup);
            }
          });
        }
      }

      // Enrich with customer and mover data
      const enrichedBookings = await Promise.all(
        bookings.map(async (booking) => {
          const customer = await storage.getUser(booking.customerId);
          const mover = booking.moverId ? await storage.getMover(booking.moverId) : null;
          const moverUser = mover ? await storage.getUser(mover.userId) : null;
          
          // Determine distanceToPickup: prefer live GPS calculation, fallback to job notification
          let distanceToPickup: string | null = null;
          const moverLat = currentMoverForProximity?.latitude;
          const moverLng = currentMoverForProximity?.longitude;
          if (moverLat && moverLng && booking.pickupLatitude && booking.pickupLongitude) {
            const dist = calculateDistance(
              moverLat,
              moverLng,
              booking.pickupLatitude,
              booking.pickupLongitude
            );
            distanceToPickup = dist.toFixed(1);
          } else {
            distanceToPickup = moverDistanceToPickupMap.get(booking.id) || null;
          }

          return {
            ...booking,
            distanceToPickup,
            hasReview: reviewedBookingIds.has(booking.id),
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
      
      // Check if this booking has a review
      const existingReview = await db.select({ id: reviews.id })
        .from(reviews)
        .where(eq(reviews.bookingId, booking.id))
        .limit(1);
      const hasReview = existingReview.length > 0;
      
      res.json({
        ...booking,
        hasReview,
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
      
      // CRITICAL: Only allow accepting PAID bookings
      if (booking.paymentStatus !== 'succeeded') {
        return res.status(400).json({ error: "Cannot accept booking - payment not completed" });
      }
      
      // Check if already accepted by someone (race condition check)
      if (booking.moverId) {
        return res.status(409).json({ 
          error: "Job already accepted by another mover",
          acceptedBy: booking.moverId 
        });
      }
      
      // SINGLE ACTIVE JOB ENFORCEMENT: Check if mover already has an active job
      const moverBookings = await storage.getBookingsByMover(moverId);
      const activeJobStatuses = ['confirmed', 'en_route_to_pickup', 'loading', 'en_route_to_dropoff', 'unloading'];
      const existingActiveJob = moverBookings.find(b => 
        activeJobStatuses.includes(b.status) && b.paymentStatus === 'succeeded'
      );
      
      if (existingActiveJob) {
        return res.status(409).json({ 
          error: "You already have an active job. Complete your current job before accepting another.",
          activeBookingId: existingActiveJob.id
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
      
      // Create mover performance tracking record
      try {
        await db.insert(moverPerformanceTable).values({
          moverId,
          bookingId,
          acceptedAt: new Date(),
          distanceKm: booking.distance || '0',
        });
        console.log(`[Performance] Created tracking record for booking ${bookingId}, mover ${moverId}`);
      } catch (perfErr) {
        console.error('[Performance] Failed to create tracking record:', perfErr);
      }
      
      // 1b. CRITICAL: Update Stripe PaymentIntent metadata with mover details
      // This ensures Stripe can match payments to movers for settlements
      if (booking.stripePaymentIntentId) {
        try {
          const moverStripeAccountResult = await db.select()
            .from(moverStripeAccounts)
            .where(eq(moverStripeAccounts.moverId, moverId))
            .limit(1);
          
          const moverAccount = moverStripeAccountResult[0];
          const isFullyOnboarded = moverAccount?.chargesEnabled && moverAccount?.payoutsEnabled;
          
          // Retrieve existing metadata to merge (Stripe replaces entire metadata object)
          const existingPI = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
          const mergedMetadata = {
            ...existingPI.metadata,
            moverId: moverId,
            moverStripeOnboarded: isFullyOnboarded ? 'true' : 'false',
            moverStripeAccountId: moverAccount?.stripeAccountId || '',
            ...(isFullyOnboarded ? { paymentType: 'platform_charge_with_transfer' } : {}),
          };
          
          await stripe.paymentIntents.update(booking.stripePaymentIntentId, {
            metadata: mergedMetadata,
          });
          
          logEvent.payment('payment_metadata_updated_on_accept', {
            bookingId,
            moverId,
            paymentIntentId: booking.stripePaymentIntentId,
            moverStripeAccountId: moverAccount?.stripeAccountId || 'none',
            moverOnboarded: isFullyOnboarded,
          });
        } catch (stripeErr) {
          console.error('[Accept] Failed to update Stripe metadata:', stripeErr);
        }
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
      
      // Check if this was a pre-selected mover declining - trigger proximity matching fallback
      const booking = await storage.getBooking(bookingId);
      if (booking && booking.preSelectedMoverId === moverId) {
        logEvent.booking('preselected_mover_declined', {
          bookingId,
          moverId,
          triggeringProximityMatching: true,
        });
        
        // Clear the preSelectedMoverId since they declined
        await storage.updateBooking(bookingId, { preSelectedMoverId: null });
        
        // Trigger proximity matching to find other available movers
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
          
          const allMovers = await storage.getOperationalMovers();
          const moversWithUserData = await Promise.all(
            allMovers.map(async (m: any) => {
              // Exclude the mover who just declined
              if (m.id === moverId) return null;
              
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
          
          const nearestMovers = findNearestMovers(
            pickupCoords,
            dropoffCoords,
            (booking.loadSize || 'medium') as 'boxes' | 'medium' | 'large' | 'apartment',
            moversWithUserData,
            {},
            booking.aiRecommendedVehicle || null
          );
          
          if (nearestMovers.length > 0) {
            // Create job notifications for nearby movers
            const expiresAt = calculateExpiryTime(10);
            await Promise.all(
              nearestMovers.map(async (mover: any) => {
                await storage.createJobNotification({
                  bookingId: booking.id,
                  moverId: mover.moverId,
                  distanceToPickup: toDecimalString(mover.distanceToPickup),
                  estimatedEarnings: toDecimalString(mover.estimatedEarnings),
                  status: 'pending',
                  expiresAt,
                });
                
                // Send WebSocket notification
                moverWebSocket.notifyMover(mover.userId, {
                  type: 'job_notification',
                  bookingId: booking.id,
                  estimatedEarnings: mover.estimatedEarnings.toFixed(2),
                  pickupAddress: booking.pickupAddress,
                  dropoffAddress: booking.dropoffAddress,
                });
                
                // Send SMS if available
                const moverUserData = await storage.getUser(mover.userId);
                if (moverUserData?.phone) {
                  const baseUrl = process.env.BASE_URL || 
                    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://app.lervit.com');
                  const smsMessage = `LervIT: New job available! Earn $${mover.estimatedEarnings.toFixed(2)} CAD. Accept now: ${baseUrl}/mover-dashboard`;
                  await notificationService.sendSMS({
                    to: moverUserData.phone,
                    message: smsMessage,
                    type: 'job_alert',
                  });
                }
              })
            );
            
            logEvent.booking('proximity_matching_fallback_success', {
              bookingId,
              moversNotified: nearestMovers.length,
            });
            
            // Notify customer that we're finding other movers
            const customer = await storage.getUser(booking.customerId);
            if (customer) {
              await storage.createNotification({
                userId: customer.id,
                type: 'booking_update',
                title: 'Finding Other Movers',
                message: 'Your selected mover is unavailable. We\'re finding other great movers nearby.',
                bookingId: booking.id,
                actionUrl: '/my-bookings',
                isRead: false,
              });
            }
          } else {
            logEvent.booking('proximity_matching_fallback_no_movers', { bookingId });
          }
        } catch (matchingError) {
          logEvent.error('proximity_matching_fallback_failed', matchingError instanceof Error ? matchingError : new Error('Unknown error'), { bookingId });
        }
      }
      
      res.json({ message: "Job declined successfully" });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Delete a failed/cancelled booking (customer only)
  app.delete("/api/bookings/:id", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const bookingId = req.params.id;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Only the customer who created the booking can delete it
      if (booking.customerId !== user.id) {
        return res.status(403).json({ error: "You are not authorized to delete this booking" });
      }
      
      // Only allow deleting bookings with failed payment or cancelled status
      const deletableStatuses = ["payment_failed", "cancelled"];
      const hasFailedPayment = booking.paymentStatus === "failed";
      
      if (!deletableStatuses.includes(booking.status) && !hasFailedPayment) {
        return res.status(400).json({ 
          error: "Only failed or cancelled bookings can be deleted" 
        });
      }
      
      // SAFETY: Never delete bookings with successful payments
      if (booking.paymentStatus === "succeeded") {
        return res.status(400).json({ 
          error: "Cannot delete a booking with a successful payment. Please contact support." 
        });
      }
      
      logEvent.booking('customer_delete_booking', { 
        bookingId, 
        customerId: user.id,
        status: booking.status,
        paymentStatus: booking.paymentStatus 
      });
      
      // Delete related records first (foreign key constraints)
      await db.delete(jobNotifications).where(eq(jobNotifications.bookingId, bookingId));
      await db.delete(messages).where(eq(messages.bookingId, bookingId));
      await db.delete(reviews).where(eq(reviews.bookingId, bookingId));
      await db.delete(identifiedItems).where(eq(identifiedItems.bookingId, bookingId));
      await db.delete(aiRuns).where(eq(aiRuns.bookingId, bookingId));
      
      // Delete the booking
      await db.delete(bookings).where(eq(bookings.id, bookingId));
      
      res.json({ message: "Booking deleted successfully" });
    } catch (error) {
      logEvent.error('delete_booking_failed', error instanceof Error ? error : new Error('Unknown error'), { 
        bookingId: req.params.id 
      });
      res.status(500).json({ error: "Failed to delete booking" });
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
        
        // CRITICAL: Update Stripe PaymentIntent metadata with mover details
        if (booking.stripePaymentIntentId) {
          try {
            const moverStripeAccountResult = await db.select()
              .from(moverStripeAccounts)
              .where(eq(moverStripeAccounts.moverId, updates.moverId))
              .limit(1);
            
            const moverAccount = moverStripeAccountResult[0];
            const isFullyOnboarded = moverAccount?.chargesEnabled && moverAccount?.payoutsEnabled;
            
            const existingPI = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
            const mergedMetadata = {
              ...existingPI.metadata,
              moverId: updates.moverId,
              moverStripeOnboarded: isFullyOnboarded ? 'true' : 'false',
              moverStripeAccountId: moverAccount?.stripeAccountId || '',
              ...(isFullyOnboarded ? { paymentType: 'platform_charge_with_transfer' } : {}),
            };
            
            await stripe.paymentIntents.update(booking.stripePaymentIntentId, {
              metadata: mergedMetadata,
            });
            
            console.log(`[PATCH Accept] Updated Stripe metadata for PI ${booking.stripePaymentIntentId} with moverId ${updates.moverId}`);
          } catch (stripeErr) {
            console.error('[PATCH Accept] Failed to update Stripe metadata:', stripeErr);
          }
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
            console.log(`[Status Update] DENIED - No mover assigned. BookingId: ${booking.id}, UserId: ${user.id}, NewStatus: ${newStatus}`);
            return res.status(403).json({ error: "No mover assigned to this booking" });
          }
          
          const mover = await storage.getMover(booking.moverId);
          console.log(`[Status Update] Auth check - BookingId: ${booking.id}, UserId: ${user.id}, BookingMoverId: ${booking.moverId}, MoverUserId: ${mover?.userId}, Match: ${mover?.userId === user.id}`);
          if (!mover || mover.userId !== user.id) {
            console.log(`[Status Update] DENIED - Mover mismatch. BookingId: ${booking.id}, UserId: ${user.id}, MoverUserId: ${mover?.userId}`);
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
      
      // Track performance timestamps on status transitions
      if (updates.status && booking.moverId) {
        try {
          const statusToFields: Record<string, Record<string, Date>> = {
            [BOOKING_STATUSES.LOADING]: { arrivedAtPickupAt: new Date(), loadingStartedAt: new Date() },
            [BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF]: { loadingCompletedAt: new Date() },
            [BOOKING_STATUSES.UNLOADING]: { arrivedAtDropoffAt: new Date() },
          };
          
          const fieldsToUpdate = statusToFields[updates.status];
          if (fieldsToUpdate) {
            const existingPerf = await db.select().from(moverPerformanceTable)
              .where(and(
                eq(moverPerformanceTable.bookingId, req.params.id),
                eq(moverPerformanceTable.moverId, booking.moverId)
              ))
              .limit(1);
            
            if (existingPerf.length > 0) {
              await db.update(moverPerformanceTable)
                .set(fieldsToUpdate)
                .where(eq(moverPerformanceTable.id, existingPerf[0].id));
              console.log(`[Performance] Updated ${Object.keys(fieldsToUpdate).join(', ')} for booking ${req.params.id}`);
            } else {
              await db.insert(moverPerformanceTable).values({
                moverId: booking.moverId,
                bookingId: req.params.id,
                acceptedAt: booking.acceptedAt || new Date(),
                ...fieldsToUpdate,
                distanceKm: booking.distance || '0',
              });
              console.log(`[Performance] Created tracking record with ${Object.keys(fieldsToUpdate).join(', ')} for booking ${req.params.id}`);
            }
          }
        } catch (perfErr) {
          console.error('[Performance] Status tracking error:', perfErr);
        }
      }
      
      res.json(booking);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Admin-only: Get bookings with promo balance owed to movers
  app.get("/api/admin/promo-balances", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const allBookingsResult = await storage.getAllBookings({ limit: 1000 });
      const promoBookings = allBookingsResult.data.filter(
        (b: any) => b.promoCode && parseFloat(b.moverBalanceOwed || '0') > 0
          && b.moverId
          && b.paymentStatus === 'succeeded'
      );
      
      const results = await Promise.all(promoBookings.map(async (b: any) => {
        const customer = b.customerId ? await storage.getUser(b.customerId) : null;
        const moverProfile = b.moverId ? await storage.getMover(b.moverId) : null;
        const moverUser = moverProfile ? await storage.getUser(moverProfile.userId) : null;
        return {
          id: b.id,
          promoCode: b.promoCode,
          discountPercent: b.discountPercent,
          discountAmount: b.discountAmount,
          moverBalanceOwed: b.moverBalanceOwed,
          moverBalancePaid: b.moverBalancePaid,
          price: b.price,
          subtotal: b.subtotal,
          status: b.status,
          moverId: b.moverId,
          moverName: moverUser?.name || 'Unassigned',
          customerName: customer?.name || 'Unknown',
          createdAt: b.createdAt,
        };
      }));
      
      res.json(results);
    } catch (error: any) {
      console.error("Admin promo balances error:", error);
      res.status(500).json({ error: "Failed to fetch promo balances" });
    }
  });

  // Admin-only: Mark mover balance as paid for a promo booking
  app.post("/api/admin/promo-balances/:bookingId/mark-paid", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { bookingId } = req.params;
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      await storage.updateBooking(bookingId, { moverBalancePaid: true } as any);
      res.json({ success: true, message: "Mover balance marked as paid" });
    } catch (error: any) {
      console.error("Mark balance paid error:", error);
      res.status(500).json({ error: "Failed to mark balance as paid" });
    }
  });

  // Admin-only endpoint to force-update booking status (for refunds/corrections)
  app.patch("/api/admin/bookings/:id/status", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const statusSchema = z.object({
        status: z.string().optional(),
        paymentStatus: z.string().optional(),
      });
      
      const updates = validateBody(statusSchema, req.body);
      
      if (!updates.status && !updates.paymentStatus) {
        return res.status(400).json({ error: "Provide status and/or paymentStatus" });
      }
      
      const bookingId = req.params.id;
      const existingBooking = await storage.getBooking(bookingId);
      if (!existingBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const booking = await storage.updateBooking(bookingId, updates);
      
      console.log(`[Admin] Force-updated booking ${bookingId}: status=${updates.status || 'unchanged'}, paymentStatus=${updates.paymentStatus || 'unchanged'}`);
      
      res.json({
        success: true,
        booking,
        previousStatus: existingBooking.status,
        previousPaymentStatus: existingBooking.paymentStatus
      });
    } catch (error) {
      console.error('[Admin] Force-update booking error:', error);
      res.status(500).json({ error: "Failed to update booking" });
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
      
      // Apply promo code discount if booking has one
      let discountPercent = 0;
      let discountAmount = 0;
      let discountReason = null;
      let finalPrice = priceBreakdown.totalCost;
      let moverBalanceOwed = 0;
      
      if (booking.promoCode === "LERVIT20") {
        discountPercent = 20;
        discountAmount = priceBreakdown.totalCost * 0.20;
        discountReason = booking.discountReason;
        finalPrice = priceBreakdown.totalCost - discountAmount;
        moverBalanceOwed = Math.round(0.85 * discountAmount * 100) / 100;
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
      updateData.moverBalanceOwed = moverBalanceOwed.toFixed(2);
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
      // Use calculatePlatformFee for consistent rounding across all payment operations
      const priceAmount = parseFloat(booking.price || '0');
      if (priceAmount <= 0) {
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
        // Get or create Stripe customer so customer info appears in Stripe Dashboard
        const stripeCustomerId = await getOrCreateStripeCustomer(user);
        
        // ALWAYS sync customer info to Stripe (backfills existing customers with missing data)
        try {
          await stripe.customers.update(stripeCustomerId, {
            name: user.name || undefined,
            email: user.email || undefined,
            phone: user.phone || undefined,
          });
        } catch (updateErr) {
          console.error('Failed to sync Stripe customer info:', updateErr);
        }
        
        // Check if mover has a connected account for destination charges (Uber-style)
        const moverAccount = await getMoverStripeAccountForDestinationCharge(booking);
        
        // Calculate platform fee - use grossAmountCents from helper for consistent rounding
        const feeCalc = calculatePlatformFee(priceAmount, booking.loadSize);
        const { grossAmountCents, platformFeeCents, moverPayoutCents, platformFeePercent } = feeCalc;
        
        // Use grossAmountCents in idempotency key for consistency
        const idempotencyKey = isRetry 
          ? `payment_intent_${booking.id}_${grossAmountCents}_retry_${Date.now()}`
          : `payment_intent_${booking.id}_${grossAmountCents}`;
        
        // Validate fee doesn't exceed amount (safety check)
        if (platformFeeCents > grossAmountCents) {
          console.error(`[Payment] Platform fee (${platformFeeCents}) exceeds amount (${grossAmountCents})`);
          return res.status(400).json({ error: "Invalid fee calculation" });
        }
        
        // Get the mover ID even if they don't have a Stripe account (for tracking in metadata)
        const bookingMoverId = booking.moverId || booking.preSelectedMoverId || '';
        
        // Build payment intent params - use grossAmountCents for consistent rounding
        const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
          amount: grossAmountCents,
          currency: "cad",
          customer: stripeCustomerId,
          receipt_email: user.email,
          metadata: {
            bookingId: booking.id,
            customerId: user.id,
            customerName: user.name,
            customerEmail: user.email,
            customerPhone: user.phone || '',
            pickupAddress: booking.pickupAddress || '',
            dropoffAddress: booking.dropoffAddress || '',
            isRetry: isRetry ? 'true' : 'false',
            paymentType: moverAccount ? 'destination_charge' : 'platform_charge',
            moverId: bookingMoverId, // Always include mover ID if available (even without Stripe account)
            moverStripeAccountId: moverAccount?.stripeAccountId || '',
            moverStripeOnboarded: moverAccount ? 'true' : 'false', // Indicates if mover has Stripe account ready
            platformFeePercent: platformFeePercent.toString(),
            platformFeeCents: platformFeeCents.toString(),
          },
          description: `LervIT booking from ${booking.pickupAddress} to ${booking.dropoffAddress}`,
        };
        
        // Add destination charge params if mover has connected account (Uber-style split)
        if (moverAccount) {
          paymentIntentParams.transfer_data = {
            destination: moverAccount.stripeAccountId,
          };
          paymentIntentParams.application_fee_amount = platformFeeCents;
          console.log(`[Destination Charge] Using Uber-style split: mover ${moverAccount.moverId} gets $${(moverPayoutCents/100).toFixed(2)}, platform gets $${(platformFeeCents/100).toFixed(2)}`);
          logEvent.payment('destination_charge_setup', {
            bookingId: booking.id,
            moverId: moverAccount.moverId,
            moverStripeAccountId: moverAccount.stripeAccountId,
            grossAmount: grossAmountCents,
            platformFee: platformFeeCents,
            moverPayout: moverPayoutCents,
          });
        } else {
          console.log(`[Platform Charge] No mover account available, using platform charge (manual transfer later)`);
        }
        
        paymentIntent = await stripe.paymentIntents.create(paymentIntentParams, {
          idempotencyKey,
        });
        
        // Update booking with payment intent ID and commission details
        await storage.updateBooking(bookingId, {
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: 'pending',
          platformFeePercent: platformFeePercent.toString(),
          platformFeeAmount: (platformFeeCents / 100).toFixed(2),
          moverNetAmount: (moverPayoutCents / 100).toFixed(2),
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
        
        // Send admin notification for new booking
        try {
          const adminUsers = await db.select().from(usersTable).where(eq(usersTable.role, 'admin'));
          for (const admin of adminUsers) {
            await notificationService.sendAdminNewBookingAlert(admin.email, customer, booking);
          }
          console.log(`[Payment] Sent admin notification for booking ${bookingId}`);
        } catch (adminErr) {
          console.error("[Payment] Failed to send admin notification:", adminErr);
        }
      }
      
      // Find and notify nearby movers using proper proximity matching
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

        if (booking.preSelectedMoverId) {
          // PRIORITY: notify pre-selected mover only
          const preSelectedMover = await storage.getMover(booking.preSelectedMoverId);
          if (preSelectedMover) {
            const bookingPrice = parseFloat(booking.price || '0');
            const feeBreakdown = calculatePlatformFee(bookingPrice);
            const moverNetAmount = feeBreakdown.moverPayoutCents / 100;
            const expiresAt = calculateExpiryTime(10);
            await storage.createJobNotification({
              bookingId: booking.id,
              moverId: booking.preSelectedMoverId,
              distanceToPickup: toDecimalString(0),
              estimatedEarnings: toDecimalString(moverNetAmount),
              status: 'pending',
              expiresAt,
            });
            const moverUser = await storage.getUser(preSelectedMover.userId);
            if (moverUser) {
              await notificationService.sendJobAssignment(moverUser, booking, moverNetAmount.toFixed(2)).catch(() => {});
              if (moverUser.phone) {
                const baseUrl = process.env.BASE_URL || 'https://app.lervit.com';
                await notificationService.sendSMS({ to: moverUser.phone, message: `LervIT PRIORITY: A customer selected YOU! Earn $${moverNetAmount.toFixed(2)} CAD. Accept within 10 min: ${baseUrl}/mover-dashboard`, type: 'job_alert' }).catch(() => {});
              }
              moverWebSocket.notifyMover(moverUser.id, { type: 'job_notification', bookingId: booking.id, isPriority: true, estimatedEarnings: moverNetAmount.toFixed(2), pickupAddress: booking.pickupAddress, dropoffAddress: booking.dropoffAddress });
            }
            console.log(`[Payment] Notified pre-selected mover ${booking.preSelectedMoverId} for booking ${booking.id}`);
          }
        } else {
          // PROXIMITY MATCHING: find nearest operational movers
          const operationalMovers = await storage.getOperationalMovers();
          const moversWithUserData = (await Promise.all(
            operationalMovers.map(async (m: any) => {
              const moverUser = await storage.getUser(m.userId);
              if (!moverUser || m.latitude === null || m.longitude === null) return null;
              return { moverId: m.id, userId: m.userId, name: moverUser.name, vehicleType: m.vehicleType, rating: m.rating || '0', totalMoves: m.totalMoves, isAvailable: m.isAvailable, latitude: m.latitude as number, longitude: m.longitude as number };
            })
          )).filter((m): m is NonNullable<typeof m> => m !== null);

          const nearestMovers = findNearestMovers(
            pickupCoords, dropoffCoords,
            (booking.loadSize || 'medium') as 'boxes' | 'medium' | 'large' | 'apartment',
            moversWithUserData, {}, booking.aiRecommendedVehicle || null
          );

          const expiresAt = calculateExpiryTime(10);
          if (nearestMovers.length > 0) {
            await Promise.all(nearestMovers.map((mover: any) =>
              storage.createJobNotification({ bookingId: booking.id, moverId: mover.moverId, distanceToPickup: toDecimalString(mover.distanceToPickup), estimatedEarnings: toDecimalString(mover.estimatedEarnings), status: 'pending', expiresAt })
            ));
            nearestMovers.forEach((mover: any) => {
              moverWebSocket.notifyMover(mover.moverId, { type: 'job_notification', bookingId: booking.id, pickupAddress: booking.pickupAddress || '', dropoffAddress: booking.dropoffAddress || '', price: toDecimalString(mover.estimatedEarnings), estimatedTime: `${Math.round(mover.distanceToPickup)} km`, expiresAt });
            });
            await Promise.all(nearestMovers.map(async (mover: any) => {
              const moverUser = await storage.getUser(mover.userId);
              if (moverUser) await notificationService.sendJobAssignment(moverUser, booking, mover.estimatedEarnings.toFixed(2)).catch(() => {});
            }));
            console.log(`[Payment] Proximity matched ${nearestMovers.length} movers for booking ${booking.id}`);
          } else {
            console.log(`[Payment] No operational movers online for booking ${booking.id} - job will be dispatched when movers come online`);
          }
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
  
  // Helper to get or create Stripe customer with full contact info
  // Helper to get mover's Stripe connected account for destination charges (Uber-style)
  async function getMoverStripeAccountForDestinationCharge(booking: any): Promise<{
    stripeAccountId: string;
    chargesEnabled: boolean;
    moverId: string;
  } | null> {
    // Determine which mover to use (assigned mover or pre-selected mover)
    const moverId = booking.moverId || booking.preSelectedMoverId;
    if (!moverId) {
      return null;
    }
    
    // Look up mover's Stripe connected account
    const accounts = await db.select()
      .from(moverStripeAccounts)
      .where(eq(moverStripeAccounts.moverId, moverId))
      .limit(1);
    
    if (accounts.length === 0) {
      console.log(`[Destination Charge] Mover ${moverId} has no Stripe account`);
      return null;
    }
    
    const account = accounts[0];
    
    // Check if account can receive payments
    if (!account.chargesEnabled) {
      console.log(`[Destination Charge] Mover ${moverId} account not ready (chargesEnabled: false)`);
      return null;
    }
    
    return {
      stripeAccountId: account.stripeAccountId,
      chargesEnabled: account.chargesEnabled,
      moverId,
    };
  }

  async function getOrCreateStripeCustomer(user: User): Promise<string> {
    // If user has a stored Stripe customer ID, verify it exists in current Stripe mode
    if (user.stripeCustomerId) {
      try {
        // Try to retrieve the customer to verify it exists
        await stripe.customers.retrieve(user.stripeCustomerId);
        return user.stripeCustomerId;
      } catch (err: any) {
        // Customer doesn't exist (likely switched from test to live mode)
        // Fall through to create a new customer
        console.log(`Stripe customer ${user.stripeCustomerId} not found, creating new one for user ${user.id}`);
      }
    }
    
    // Create new Stripe customer with all available info for dashboard visibility
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      phone: user.phone || undefined,
      metadata: {
        userId: user.id,
        role: user.role || 'customer',
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
      
      // Check if mover has a connected account for destination charges (Uber-style)
      const moverAccount = await getMoverStripeAccountForDestinationCharge(booking);
      
      // Calculate platform fee - use grossAmountCents from helper for consistent rounding
      const feeCalc = calculatePlatformFee(
        parseFloat(booking.price || '0'),
        booking.loadSize
      );
      const { grossAmountCents, platformFeeCents, moverPayoutCents, platformFeePercent } = feeCalc;
      
      // Validate fee doesn't exceed amount (safety check)
      if (platformFeeCents > grossAmountCents) {
        console.error(`[Payment - Saved Card] Platform fee (${platformFeeCents}) exceeds amount (${grossAmountCents})`);
        return res.status(400).json({ error: "Invalid fee calculation" });
      }
      
      // Get the mover ID even if they don't have a Stripe account (for tracking in metadata)
      const bookingMoverId = booking.moverId || booking.preSelectedMoverId || '';
      
      // Build payment intent params for saved card - use grossAmountCents for consistent rounding
      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: grossAmountCents,
        currency: 'cad',
        customer: user.stripeCustomerId,
        payment_method: paymentMethodId,
        off_session: false,
        confirm: true,
        metadata: {
          bookingId: booking.id,
          customerId: user.id,
          paymentType: moverAccount ? 'destination_charge' : 'platform_charge',
          moverId: bookingMoverId, // Always include mover ID if available (even without Stripe account)
          moverStripeAccountId: moverAccount?.stripeAccountId || '',
          moverStripeOnboarded: moverAccount ? 'true' : 'false', // Indicates if mover has Stripe account ready
          platformFeePercent: platformFeePercent.toString(),
        },
      };
      
      // Add destination charge params if mover has connected account (Uber-style split)
      if (moverAccount) {
        paymentIntentParams.transfer_data = {
          destination: moverAccount.stripeAccountId,
        };
        paymentIntentParams.application_fee_amount = platformFeeCents;
        console.log(`[Destination Charge - Saved Card] Uber-style split: mover ${moverAccount.moverId} gets $${(moverPayoutCents/100).toFixed(2)}`);
        logEvent.payment('destination_charge_saved_card', {
          bookingId: booking.id,
          moverId: moverAccount.moverId,
          grossAmount: grossAmountCents,
          platformFee: platformFeeCents,
        });
      }
      
      // Create payment intent with saved card (use deterministic idempotency key for safety)
      const savedCardIdempotencyKey = `saved_card_${booking.id}_${grossAmountCents}_${paymentMethodId}`;
      const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams, {
        idempotencyKey: savedCardIdempotencyKey,
      });
      
      if (paymentIntent.status === 'succeeded') {
        // Update booking with commission details
        await storage.updateBooking(bookingId, {
          paymentStatus: 'succeeded',
          status: 'confirmed',
          stripePaymentIntentId: paymentIntent.id,
          platformFeePercent: platformFeePercent.toString(),
          platformFeeAmount: (platformFeeCents / 100).toFixed(2),
          moverNetAmount: (moverPayoutCents / 100).toFixed(2),
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
          
          // Send admin notification for new booking
          try {
            const adminUsers = await db.select().from(usersTable).where(eq(usersTable.role, 'admin'));
            for (const admin of adminUsers) {
              await notificationService.sendAdminNewBookingAlert(admin.email, customer, booking);
            }
          } catch (adminErr) {
            console.error("[Payment] Failed to send admin notification:", adminErr);
          }
        }
        
        // Notify movers
        const allMovers = await storage.getMovers();
        const availableMovers = allMovers.filter(m => m.isAvailable);
        const moversToNotify = availableMovers.slice(0, 5);
        for (const mover of moversToNotify) {
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
          await storage.createJobNotification({
            moverId: mover.userId,
            bookingId: booking.id,
            status: 'pending',
            expiresAt,
            distanceToPickup: '0',
            estimatedEarnings: booking.price || '0',
          });
          
          // Send real-time WebSocket notification to mover
          moverWebSocket.notifyMover(mover.userId, {
            type: 'job_notification',
            bookingId: booking.id,
            pickupAddress: booking.pickupAddress || '',
            dropoffAddress: booking.dropoffAddress || '',
            price: booking.price || '0',
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
          
          // Find booking by payment intent ID (primary lookup)
          let successBookings = await db
            .select()
            .from(bookings)
            .where(eq(bookings.stripePaymentIntentId, paymentIntent.id))
            .limit(1);
          
          // FALLBACK: If not found by payment intent ID, try by bookingId from metadata
          // This catches race conditions where the payment intent ID wasn't saved yet
          if (successBookings.length === 0 && paymentIntent.metadata?.bookingId) {
            logEvent.payment('webhook_fallback_lookup', {
              paymentIntentId: paymentIntent.id,
              metadataBookingId: paymentIntent.metadata.bookingId,
            });
            
            successBookings = await db
              .select()
              .from(bookings)
              .where(eq(bookings.id, paymentIntent.metadata.bookingId))
              .limit(1);
            
            // If found via metadata, update the booking with the payment intent ID
            if (successBookings.length > 0) {
              await db.update(bookings)
                .set({ stripePaymentIntentId: paymentIntent.id })
                .where(eq(bookings.id, paymentIntent.metadata.bookingId));
              
              logEvent.payment('webhook_fallback_success', {
                bookingId: paymentIntent.metadata.bookingId,
                paymentIntentId: paymentIntent.id,
              });
            }
          }
          
          if (successBookings.length > 0) {
            const booking = successBookings[0];
            
            // Idempotency check - don't process if already succeeded AND job notifications exist
            if (booking.paymentStatus === 'succeeded') {
              const existingJobNotifs = await db.select({ id: jobNotifications.id })
                .from(jobNotifications)
                .where(eq(jobNotifications.bookingId, booking.id))
                .limit(1);
              if (existingJobNotifs.length > 0) {
                logEvent.payment('already_processed', { bookingId: booking.id, paymentIntentId: paymentIntent.id });
                return res.json({ received: true, status: 'already_processed' });
              }
              // Payment confirmed but no job notifications yet - proceed to notify movers
              logEvent.payment('rerun_mover_notifications', { bookingId: booking.id, paymentIntentId: paymentIntent.id });
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
                
                // Send admin notification for new booking
                try {
                  const adminUsers = await db.select().from(usersTable).where(eq(usersTable.role, 'admin'));
                  for (const admin of adminUsers) {
                    await notificationService.sendAdminNewBookingAlert(admin.email, customer, booking);
                  }
                } catch (adminErr) {
                  logEvent.error('webhook_admin_notification', adminErr, { bookingId: booking.id });
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
                // PRIORITY NOTIFICATION: Notify pre-selected mover first (they must accept/decline)
                // If they decline or timeout, system will fall back to proximity matching
                logEvent.booking('priority_mover_notification', {
                  bookingId: booking.id,
                  preSelectedMoverId: booking.preSelectedMoverId,
                });
                
                // Get the pre-selected mover's details
                const preSelectedMover = await storage.getMover(booking.preSelectedMoverId);
                if (preSelectedMover) {
                  // Calculate mover earnings for display
                  const bookingPrice = parseFloat(booking.price || '0');
                  const feeBreakdown = calculatePlatformFee(bookingPrice);
                  const moverNetAmount = feeBreakdown.moverPayoutCents / 100;
                  
                  // Create PENDING job notification for the pre-selected mover (they must accept)
                  // Mark as priority so UI can show "Priority Request" badge
                  const expiresAt = calculateExpiryTime(10); // 10 minutes to accept
                  await storage.createJobNotification({
                    bookingId: booking.id,
                    moverId: booking.preSelectedMoverId,
                    distanceToPickup: toDecimalString(0),
                    estimatedEarnings: toDecimalString(moverNetAmount),
                    status: 'pending', // PENDING - mover must accept, not auto-assigned
                    expiresAt,
                  });
                  
                  // Notify the selected mover via email, SMS, and WebSocket
                  const moverUser = await storage.getUser(preSelectedMover.userId);
                  if (moverUser) {
                    const earningsStr = moverNetAmount.toFixed(2);
                    
                    // Send email with priority messaging (use sendJobAssignment with modified message)
                    await notificationService.sendJobAssignment(moverUser, booking, earningsStr);
                    
                    // Send SMS notification with priority messaging
                    if (moverUser.phone) {
                      const baseUrl = process.env.BASE_URL || 
                        (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://app.lervit.com');
                      const smsMessage = `LervIT PRIORITY: A customer selected YOU for their move! Earn $${earningsStr} CAD. Accept within 10 min: ${baseUrl}/mover-dashboard`;
                      await notificationService.sendSMS({
                        to: moverUser.phone,
                        message: smsMessage,
                        type: 'job_alert',
                      });
                    }
                    
                    // Send real-time WebSocket notification
                    moverWebSocket.notifyMover(moverUser.id, {
                      type: 'job_notification',
                      bookingId: booking.id,
                      isPriority: true, // Flag for UI to show priority badge
                      estimatedEarnings: earningsStr,
                      pickupAddress: booking.pickupAddress,
                      dropoffAddress: booking.dropoffAddress,
                    });
                    
                    logEvent.notification('priority_mover_notified', {
                      bookingId: booking.id,
                      moverId: booking.preSelectedMoverId,
                      moverUserId: moverUser.id,
                    });
                    
                    // Create in-app notification for the mover
                    try {
                      await storage.createNotification({
                        userId: moverUser.id,
                        type: 'job_opportunity',
                        title: 'Priority Job Request!',
                        message: `A customer specifically chose you! Earn $${earningsStr} CAD. Accept within 10 minutes.`,
                        bookingId: booking.id,
                        actionUrl: '/mover-dashboard',
                        isRead: false,
                      });
                    } catch (notifErr) {
                      logEvent.error('priority_mover_notification_failed', notifErr, { bookingId: booking.id, moverId: moverUser.id });
                    }
                  }
                  
                  // Create in-app notification for customer about pending mover response
                  try {
                    const pendingCustomer = await storage.getUser(booking.customerId);
                    if (pendingCustomer) {
                      await storage.createNotification({
                        userId: pendingCustomer.id,
                        type: 'booking_update',
                        title: 'Waiting for Mover',
                        message: `Your selected mover has been notified. We'll update you when they respond.`,
                        bookingId: booking.id,
                        actionUrl: '/my-bookings',
                        isRead: false,
                      });
                    }
                  } catch (notifErr) {
                    logEvent.error('customer_pending_notification_failed', notifErr, { bookingId: booking.id, customerId: booking.customerId });
                  }
                } else {
                  // Pre-selected mover not found - fall back to proximity matching
                  logEvent.error('priority_mover_not_found', new Error('Pre-selected mover not found'), {
                    bookingId: booking.id,
                    preSelectedMoverId: booking.preSelectedMoverId,
                  });
                  // Clear the invalid preSelectedMoverId and continue to proximity matching
                  await storage.updateBooking(booking.id, { preSelectedMoverId: null });
                }
              }
              
              // PROXIMITY MATCHING: Only run if no pre-selected mover OR pre-selected mover was invalid
              if (!booking.preSelectedMoverId) {
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
                
                // Send real-time WebSocket notifications to movers
                nearestMovers.forEach((mover: any) => {
                  moverWebSocket.notifyMover(mover.moverId, {
                    type: 'job_notification',
                    bookingId: booking.id,
                    pickupAddress: booking.pickupAddress || '',
                    dropoffAddress: booking.dropoffAddress || '',
                    price: toDecimalString(mover.estimatedEarnings),
                    estimatedTime: `${Math.round(mover.distanceToPickup)} km`,
                    expiresAt,
                  });
                });
              
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
                moversNotified: nearestMovers.length,
                websocketNotified: moverWebSocket.getConnectedMoversCount()
              });
              } // End of else block for proximity matching
            } catch (moverNotifyErr) {
              logEvent.error('webhook_mover_notifications', moverNotifyErr, { bookingId: booking.id });
            }
          } else {
            // CRITICAL: No booking found for this payment intent - this is the lost booking scenario!
            // This should never happen if the payment flow is working correctly.
            logEvent.error('webhook_booking_not_found', new Error('Payment succeeded but no booking found'), {
              paymentIntentId: paymentIntent.id,
              amount: String(paymentIntent.amount / 100),
              metadataBookingId: paymentIntent.metadata?.bookingId || 'none',
              metadataCustomerId: paymentIntent.metadata?.customerId || 'none',
            });
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
            const wasFullyOnboarded = moverAccount.chargesEnabled && moverAccount.payoutsEnabled;
            const isNowFullyOnboarded = updatedAccount.charges_enabled && updatedAccount.payouts_enabled;
            
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
            
            // AUTO-TRANSFER: If mover just became fully onboarded, process any pending earnings
            if (!wasFullyOnboarded && isNowFullyOnboarded) {
              logEvent.payment('mover_onboarding_complete_auto_transfer_check', { 
                moverId: moverAccount.moverId,
                stripeAccountId: updatedAccount.id,
              });
              
              // Find pending earnings for this mover that need transfer
              const pendingEarnings = await db.select()
                .from(moverEarnings)
                .where(and(
                  eq(moverEarnings.moverId, moverAccount.moverId),
                  or(
                    eq(moverEarnings.status, 'pending'),
                    eq(moverEarnings.status, 'needs_backfill')
                  ),
                  isNull(moverEarnings.stripeTransferId)
                ));
              
              for (const earning of pendingEarnings) {
                try {
                  // Get the booking to calculate correct fee
                  const booking = await storage.getBooking(earning.bookingId);
                  if (!booking || booking.paymentStatus !== 'succeeded') continue;
                  
                  // Calculate amounts using centralized helper
                  const grossAmount = parseFloat(booking.price || '0');
                  const feeCalc = calculatePlatformFee(grossAmount, booking.loadSize);
                  const { moverPayoutCents, platformFeeCents, platformFeePercent } = feeCalc;
                  
                  // Create transfer to mover's connected account
                  const transfer = await stripe.transfers.create({
                    amount: moverPayoutCents,
                    currency: 'cad',
                    destination: updatedAccount.id,
                    metadata: {
                      bookingId: earning.bookingId,
                      moverId: moverAccount.moverId,
                      grossAmount: grossAmount.toFixed(2),
                      platformFee: (platformFeeCents / 100).toFixed(2),
                      processedBy: 'auto_onboarding_complete',
                    },
                  }, {
                    idempotencyKey: `auto-transfer-onboard-${earning.bookingId}`,
                  });
                  
                  // Update earnings record
                  await db.update(moverEarnings)
                    .set({
                      stripeTransferId: transfer.id,
                      status: 'paid',
                      paidAt: new Date(),
                    })
                    .where(eq(moverEarnings.id, earning.id));
                  
                  // Update PaymentIntent metadata to reflect the auto-transfer (merge with existing)
                  if (booking.stripePaymentIntentId) {
                    try {
                      const existingPI = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
                      await stripe.paymentIntents.update(booking.stripePaymentIntentId, {
                        metadata: {
                          ...existingPI.metadata,
                          stripeTransferId: transfer.id,
                          moverStripeAccountId: updatedAccount.id,
                          moverStripeOnboarded: 'true',
                          paymentType: 'platform_charge_with_transfer',
                          transferAmount: (moverPayoutCents / 100).toFixed(2),
                          moverId: moverAccount.moverId,
                        },
                      });
                    } catch (metaErr) {
                      console.error('[Webhook] Failed to update PaymentIntent metadata:', metaErr);
                    }
                  }
                  
                  logEvent.payment('auto_transfer_on_onboarding_success', {
                    moverId: moverAccount.moverId,
                    bookingId: earning.bookingId,
                    transferId: transfer.id,
                    amount: moverPayoutCents / 100,
                  });
                } catch (transferError: any) {
                  logEvent.error('auto_transfer_on_onboarding_failed', transferError, {
                    moverId: moverAccount.moverId,
                    bookingId: earning.bookingId,
                  });
                }
              }
            }
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
    console.log('[Reviews] POST /api/reviews - Request body:', JSON.stringify(req.body));
    try {
      const reviewData = validateBody(insertReviewSchema, req.body);
      console.log('[Reviews] Validated review data:', JSON.stringify(reviewData));
      
      // Validate that the booking is completed before allowing a review
      const booking = await storage.getBooking(reviewData.bookingId);
      console.log('[Reviews] Booking lookup result:', booking ? `Found (status: ${booking.status})` : 'Not found');
      
      if (!booking) {
        console.log('[Reviews] ERROR: Booking not found for id:', reviewData.bookingId);
        return res.status(404).json({ error: "Booking not found" });
      }
      
      if (booking.status !== "completed") {
        console.log('[Reviews] ERROR: Booking status is not completed:', booking.status);
        return res.status(400).json({ error: "You can only leave a review after the move is completed" });
      }
      
      console.log('[Reviews] Creating review in database...');
      const review = await storage.createReview(reviewData);
      console.log('[Reviews] Review created with id:', review.id);
      
      // IMPORTANT: Update mover's average rating after new review
      const allReviews = await storage.getReviewsByMover(review.moverId);
      console.log('[Reviews] Found', allReviews.length, 'total reviews for mover', review.moverId);
      
      if (allReviews.length > 0) {
        const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = (totalRating / allReviews.length).toFixed(1);
        
        console.log('[Reviews] Updating mover rating to', averageRating);
        // Update mover's rating
        await storage.updateMover(review.moverId, { 
          rating: averageRating,
          completedTrips: allReviews.length
        });
        
        console.log(`[Reviews] SUCCESS: Updated mover ${review.moverId} rating to ${averageRating} (${allReviews.length} reviews)`);
      }
      
      const customer = await storage.getUser(review.customerId);
      const response = {
        ...review,
        customer: customer ? { id: customer.id, name: customer.name } : null
      };
      console.log('[Reviews] Sending response:', JSON.stringify(response));
      res.json(response);
    } catch (error) {
      console.error('[Reviews] ERROR creating review:', error);
      console.error('[Reviews] Error stack:', error instanceof Error ? error.stack : 'No stack');
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
  
  // Get open/in-progress ticket count for admin notification badge
  app.get("/api/admin/support/open-count", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const openTickets = await db.select({ id: supportTickets.id })
        .from(supportTickets)
        .where(
          sql`${supportTickets.status} IN ('open', 'in_progress')`
        );
      
      res.json({ count: openTickets.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ticket count" });
    }
  });

  // Get all support tickets (admin only)
  app.get("/api/support/tickets/all", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const tickets = await db.select({
        id: supportTickets.id,
        userId: supportTickets.userId,
        subject: supportTickets.subject,
        category: supportTickets.category,
        message: supportTickets.message,
        status: supportTickets.status,
        priority: supportTickets.priority,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        resolvedAt: supportTickets.resolvedAt,
        lastStaffReplyAt: supportTickets.lastStaffReplyAt,
        customerLastReadAt: supportTickets.customerLastReadAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userPhone: usersTable.phone,
        userRole: usersTable.role,
      })
        .from(supportTickets)
        .leftJoin(usersTable, eq(supportTickets.userId, usersTable.id))
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
    console.log("[Payout Onboarding] Request received");
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      console.log("[Payout Onboarding] User authenticated:", user.id);
      
      // Get mover profile
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      // Check if account already exists
      console.log("[Payout Onboarding] Checking for existing Stripe account for mover:", mover.id);
      let stripeAccount;
      const existingAccounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, mover.id))
        .limit(1);
      
      if (existingAccounts.length) {
        stripeAccount = existingAccounts[0];
        console.log("[Payout Onboarding] Found existing account:", stripeAccount.stripeAccountId);
      } else {
        console.log("[Payout Onboarding] Creating new Stripe account...");
        // Pre-fill as much data as possible from mover profile to reduce onboarding friction
        // Parse name into first/last for Stripe's individual profile
        const displayName = user.name || '';
        const nameParts = displayName.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || nameParts[0] || '';
        
        // Clean phone number - remove non-digits but keep for E.164 format
        const cleanPhone = user.phone?.replace(/\D/g, '') || '';
        const formattedPhone = cleanPhone.length === 10 ? `+1${cleanPhone}` : 
                               cleanPhone.length === 11 && cleanPhone.startsWith('1') ? `+${cleanPhone}` : '';
        
        // Build Stripe account with pre-filled data
        const accountParams: any = {
          type: 'express',
          country: 'CA',
          email: user.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: 'individual',
          business_profile: {
            name: displayName || undefined,
            url: 'https://lervit.com', // Pre-fill platform URL so movers don't need their own website
            product_description: 'Professional moving services',
            mcc: '4214', // MCC code for local delivery/courier
          },
          metadata: {
            moverId: mover.id,
            userId: user.id,
          },
        };
        
        // Add individual details if we have name data
        if (firstName) {
          accountParams.individual = {
            first_name: firstName,
            last_name: lastName || firstName,
            email: user.email,
          };
          
          // Add phone if valid
          if (formattedPhone) {
            accountParams.individual.phone = formattedPhone;
          }
        }
        
        // Create new Stripe Express account with pre-filled data
        const account = await stripe.accounts.create(accountParams);
        
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
      console.log("[Payout Onboarding] Creating account link for:", stripeAccount.stripeAccountId);
      const baseUrl = req.headers.origin || `https://${req.headers.host}`;
      console.log("[Payout Onboarding] Base URL:", baseUrl);
      
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccount.stripeAccountId,
        refresh_url: `${baseUrl}/mover-dashboard?payout_refresh=true`,
        return_url: `${baseUrl}/mover-dashboard?payout_success=true`,
        type: 'account_onboarding',
      });
      console.log("[Payout Onboarding] Account link created successfully");
      
      // Update onboarding status
      await db.update(moverStripeAccounts)
        .set({ 
          onboardingStatus: 'in_progress',
          updatedAt: new Date(),
        })
        .where(eq(moverStripeAccounts.id, stripeAccount.id));
      
      console.log("[Payout Onboarding] Sending URL response:", accountLink.url?.substring(0, 50) + "...");
      res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error("Stripe Connect error:", {
        message: error.message,
        type: error.type,
        code: error.code,
        param: error.param,
        detail: error.detail,
        raw: error.raw?.message,
      });
      
      // Provide user-friendly error messages for common Stripe errors
      let userMessage = "Failed to create onboarding link. Please try again.";
      if (error.code === 'account_invalid') {
        userMessage = "There's an issue with the payout account. Please contact support.";
      } else if (error.code === 'rate_limit') {
        userMessage = "Too many requests. Please wait a moment and try again.";
      } else if (error.type === 'StripeInvalidRequestError') {
        userMessage = error.message || "Invalid request. Please contact support.";
      }
      
      res.status(500).json({ error: userMessage, code: error.code });
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
            promoCode: booking?.promoCode || null,
            moverBalanceOwed: booking?.moverBalanceOwed || null,
            moverBalancePaid: booking?.moverBalancePaid || null,
          };
        })
      );
      
      res.json(enrichedEarnings);
    } catch (error) {
      res.status(500).json({ error: "Failed to get earnings history" });
    }
  });

  /**
   * Record earnings when job is completed
   * 
   * UBER-STYLE DESTINATION CHARGES:
   * - If payment used destination charge (transfer_data.destination), money was
   *   already split at payment time - no separate transfer needed
   * - Status is 'available' immediately since funds are already with mover
   * 
   * LEGACY PLATFORM CHARGES (Fallback):
   * - If payment was a platform charge (no mover assigned at payment time),
   *   create a Transfer to mover's connected account
   * - Status is 'available' after transfer completes
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
    
    let stripeTransferId: string | undefined;
    let earningsStatus = 'pending';
    
    // Check if this was a destination charge (Uber-style) by checking payment intent metadata
    let wasDestinationCharge = false;
    if (booking.stripePaymentIntentId) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
        wasDestinationCharge = paymentIntent.metadata?.paymentType === 'destination_charge';
        
        if (wasDestinationCharge) {
          // Money was already split at payment time - mark as available immediately
          earningsStatus = 'available';
          stripeTransferId = `destination_charge_${paymentIntent.id}`; // Marker for destination charges
          
          logEvent.payment('destination_charge_earnings_recorded', {
            bookingId,
            moverId,
            paymentIntentId: paymentIntent.id,
            netAmount,
          });
        }
      } catch (err) {
        console.error(`[Earnings] Failed to retrieve PaymentIntent for ${bookingId}:`, err);
      }
    }
    
    // If not a destination charge, try to create a transfer (platform charge flow)
    if (!wasDestinationCharge) {
      // Get mover's Stripe Connect account for transfer
      const moverStripeAccountResult = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, moverId))
        .limit(1);
      
      // Only create transfer if mover has an onboarded Stripe Connect account
      if (moverStripeAccountResult.length > 0 && moverStripeAccountResult[0].payoutsEnabled) {
        const moverStripeAccount = moverStripeAccountResult[0];
        const transferAmountCents = Math.round(netAmount * 100);
        
        try {
          // Get the charge ID from the payment intent to link as source_transaction
          // This ensures funds come from the specific customer payment, not platform balance
          let sourceChargeId: string | undefined;
          if (booking.stripePaymentIntentId) {
            try {
              const pi = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
              if (pi.latest_charge) {
                sourceChargeId = typeof pi.latest_charge === 'string' 
                  ? pi.latest_charge 
                  : pi.latest_charge.id;
              }
            } catch (chargeErr) {
              console.error(`[Earnings] Failed to get charge for source_transaction:`, chargeErr);
            }
          }
          
          // Create Stripe Transfer to mover's connected account
          const transferParams: Stripe.TransferCreateParams = {
            amount: transferAmountCents,
            currency: 'cad',
            destination: moverStripeAccount.stripeAccountId,
            metadata: {
              bookingId,
              moverId,
              grossAmount: grossAmount.toFixed(2),
              platformFee: platformFeeAmount.toFixed(2),
              processedBy: 'booking_completion',
            },
          };
          
          // Link to the source charge so funds come from the specific payment
          if (sourceChargeId) {
            transferParams.source_transaction = sourceChargeId;
          }
          
          const transfer = await stripe.transfers.create(transferParams, {
            idempotencyKey: `transfer-${bookingId}-v2`,
          });
          
          stripeTransferId = transfer.id;
          earningsStatus = 'available';
          
          logEvent.payment('transfer_created', {
            bookingId,
            moverId,
            transferId: transfer.id,
            amount: netAmount,
          });
          
          // Update PaymentIntent metadata to reflect the transfer (merge with existing)
          if (booking.stripePaymentIntentId) {
            try {
              const existingPI = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
              await stripe.paymentIntents.update(booking.stripePaymentIntentId, {
                metadata: {
                  ...existingPI.metadata,
                  stripeTransferId: transfer.id,
                  moverStripeAccountId: moverStripeAccount.stripeAccountId,
                  moverStripeOnboarded: 'true',
                  paymentType: 'platform_charge_with_transfer',
                  transferAmount: (transferAmountCents / 100).toFixed(2),
                  moverId: moverId,
                },
              });
            } catch (metaErr) {
              console.error('[Earnings] Failed to update PaymentIntent metadata:', metaErr);
            }
          }
        } catch (transferError: any) {
          console.error(`[Earnings] Transfer failed for booking ${bookingId}:`, 
            transferError?.type, transferError?.message, transferError?.code);
          logEvent.error('transfer_failed', transferError);
          earningsStatus = 'pending';
        }
      } else {
        logEvent.payment('transfer_skipped', {
          bookingId,
          moverId,
          reason: moverStripeAccountResult.length === 0 
            ? 'No Stripe Connect account' 
            : 'Payouts not enabled - mover onboarding incomplete',
        });
      }
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
      
      // Increment mover's completed trips AND total moves using SQL to avoid null issues
      const mover = movers[0];
      await db.execute(sql`
        UPDATE movers 
        SET completed_trips = COALESCE(completed_trips, 0) + 1,
            total_moves = COALESCE(total_moves, 0) + 1
        WHERE id = ${mover.id}
      `);
      console.log(`[Complete] Incremented trip count for mover ${mover.id}`);
      
      // Update mover performance record with completion data
      try {
        const existingPerf = await db.select().from(moverPerformanceTable)
          .where(and(
            eq(moverPerformanceTable.bookingId, bookingId),
            eq(moverPerformanceTable.moverId, mover.id)
          ))
          .limit(1);
        
        const completionTime = new Date();
        const acceptedTime = existingPerf[0]?.acceptedAt || booking.acceptedAt;
        const totalMoveMinutes = acceptedTime 
          ? Math.round((completionTime.getTime() - new Date(acceptedTime).getTime()) / 60000)
          : null;
        
        if (existingPerf.length > 0) {
          await db.update(moverPerformanceTable)
            .set({ 
              unloadingCompletedAt: completionTime,
              totalMoveMinutes,
            })
            .where(eq(moverPerformanceTable.id, existingPerf[0].id));
          console.log(`[Performance] Completed: booking ${bookingId}, totalMoveMinutes: ${totalMoveMinutes}`);
        } else {
          await db.insert(moverPerformanceTable).values({
            moverId: mover.id,
            bookingId,
            acceptedAt: booking.acceptedAt || completionTime,
            unloadingCompletedAt: completionTime,
            totalMoveMinutes,
            distanceKm: booking.distance || '0',
          });
          console.log(`[Performance] Created completed record: booking ${bookingId}, totalMoveMinutes: ${totalMoveMinutes}`);
        }
      } catch (perfErr) {
        console.error('[Performance] Completion tracking error:', perfErr);
      }
      
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

  // Seed endpoint - ADMIN ONLY, DEVELOPMENT ONLY
  app.post("/api/seed", async (req: Request, res: Response) => {
    try {
      // SECURITY: Block in production environment
      if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ error: "Not found" });
      }
      
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

  // ===== ADMIN: RECOVER BOOKING FROM STRIPE PAYMENT =====
  // Use this when a payment was successful but booking wasn't updated
  app.post("/api/admin/recover-booking", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Only admins can recover bookings
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ error: "Payment intent ID is required (starts with pi_)" });
      }
      
      // Fetch payment intent from Stripe
      let paymentIntent;
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      } catch (stripeErr) {
        return res.status(404).json({ error: "Payment intent not found in Stripe" });
      }
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ 
          error: `Payment not successful. Current status: ${paymentIntent.status}` 
        });
      }
      
      // Try to find booking by payment intent ID
      const existingBookings = await db
        .select()
        .from(bookings)
        .where(eq(bookings.stripePaymentIntentId, paymentIntentId))
        .limit(1);
      
      if (existingBookings.length > 0) {
        const booking = existingBookings[0];
        
        // Booking exists but might not be updated
        if (booking.paymentStatus !== 'succeeded') {
          await storage.updateBooking(booking.id, {
            paymentStatus: 'succeeded',
            status: BOOKING_STATUSES.PENDING,
          });
          
          logEvent.payment('booking_recovered', { 
            bookingId: booking.id, 
            paymentIntentId,
            adminUserId: user.id 
          });
          
          return res.json({ 
            success: true, 
            message: "Booking found and payment status updated",
            bookingId: booking.id,
            previousStatus: booking.status,
            newStatus: 'pending'
          });
        }
        
        return res.json({ 
          success: true, 
          message: "Booking already confirmed with successful payment",
          bookingId: booking.id,
          status: booking.status
        });
      }
      
      // Booking not found - check metadata for bookingId
      const bookingIdFromMetadata = paymentIntent.metadata?.bookingId;
      
      if (bookingIdFromMetadata) {
        // Try to find by booking ID from metadata
        const bookingById = await storage.getBooking(bookingIdFromMetadata);
        
        if (bookingById) {
          await storage.updateBooking(bookingById.id, {
            stripePaymentIntentId: paymentIntentId,
            paymentStatus: 'succeeded',
            status: BOOKING_STATUSES.PENDING,
          });
          
          logEvent.payment('booking_recovered_by_metadata', { 
            bookingId: bookingById.id, 
            paymentIntentId,
            adminUserId: user.id 
          });
          
          return res.json({ 
            success: true, 
            message: "Booking recovered using payment metadata",
            bookingId: bookingById.id
          });
        }
      }
      
      return res.status(404).json({ 
        error: "Could not find matching booking",
        paymentIntentId,
        bookingIdFromMetadata: bookingIdFromMetadata || null,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        suggestion: "Please check if the booking was created. If not, you may need to create one manually and link it."
      });
      
    } catch (error) {
      logEvent.error('admin_recover_booking', error);
      res.status(500).json({ error: "Failed to recover booking" });
    }
  });

  // ===== ADMIN: RESEND JOB NOTIFICATIONS =====
  // Use this to resend job notifications to movers for a pending booking
  app.post("/api/admin/resend-job-notifications", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Only admins can resend notifications
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { bookingId } = req.body;
      
      if (!bookingId) {
        return res.status(400).json({ error: "Booking ID is required" });
      }
      
      // Get the booking
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Only resend for bookings that are not completed or cancelled
      if (booking.status === 'completed' || booking.status === 'cancelled') {
        return res.status(400).json({ 
          error: "Cannot resend notifications for completed or cancelled bookings",
          currentStatus: booking.status
        });
      }
      
      // Only resend for bookings with future or today's date
      const bookingDate = new Date(booking.preferredDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      bookingDate.setHours(0, 0, 0, 0);
      
      if (bookingDate < today) {
        return res.status(400).json({ 
          error: "Cannot resend notifications for past bookings. This booking was scheduled for " + booking.preferredDate.toLocaleDateString(),
          preferredDate: booking.preferredDate
        });
      }
      
      // Delete any existing pending notifications for this booking
      await db.delete(jobNotifications).where(eq(jobNotifications.bookingId, bookingId));
      
      // Get matching movers and send notifications
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
      
      // Get all available movers (more lenient for admin override - just needs isAvailable=true)
      const allMovers = await db.select().from(moversTable).where(eq(moversTable.isAvailable, true));
      const moversWithUserData = await Promise.all(
        allMovers.map(async (m) => {
          const moverUser = await storage.getUser(m.userId);
          if (!moverUser) return null;
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
      ).then(results => results.filter((m): m is NonNullable<typeof m> => m !== null));
      
      // Use AI-recommended vehicle type if available, otherwise use booking's load size
      const recommendedVehicle = booking.aiRecommendedVehicle || booking.loadSize;
      
      // Find nearest movers with matching vehicle types
      let nearestMovers = findNearestMovers(
        pickupCoords,
        dropoffCoords,
        (booking.loadSize || 'medium') as 'boxes' | 'medium' | 'large' | 'apartment',
        moversWithUserData,
        {},
        booking.aiRecommendedVehicle || null
      );
      
      // If no matching movers found, fall back to ALL available movers (admin override)
      let usedFallback = false;
      if (nearestMovers.length === 0 && moversWithUserData.length > 0) {
        usedFallback = true;
        // Create a simple list from all operational movers with estimated earnings
        nearestMovers = moversWithUserData.map(m => ({
          moverId: m.moverId,
          userId: m.userId,
          name: m.name,
          vehicleType: m.vehicleType,
          rating: m.rating,
          totalMoves: m.totalMoves,
          isAvailable: m.isAvailable,
          latitude: m.latitude,
          longitude: m.longitude,
          distanceToPickup: 10, // Default estimate
          estimatedEarnings: parseFloat(booking.price || '0') * 0.85, // 85% of booking price
          priceBreakdown: {} as any, // Fallback - not used in notifications
        }));
      }
      
      if (nearestMovers.length === 0) {
        return res.status(404).json({ 
          error: "No available movers found. Please ensure movers are online and available.",
          totalOperationalMovers: allMovers.length
        });
      }
      
      // Calculate expiry time (10 minutes)
      const expiresAt = calculateExpiryTime();
      
      // Send notifications to each mover
      const notificationResults: { moverId: string; moverName: string; success: boolean; error?: string }[] = [];
      
      await Promise.all(
        nearestMovers.map(async (mover: any) => {
          try {
            // Create job notification record
            await storage.createJobNotification({
              bookingId: booking.id,
              moverId: mover.moverId,
              distanceToPickup: toDecimalString(mover.distanceToPickup),
              estimatedEarnings: toDecimalString(mover.estimatedEarnings),
              status: 'pending',
              expiresAt,
            });
            
            // Send WebSocket notification
            moverWebSocket.notifyMover(mover.userId, {
              type: 'job_notification',
              bookingId: booking.id,
              estimatedEarnings: mover.estimatedEarnings.toFixed(2),
              pickupAddress: booking.pickupAddress,
              dropoffAddress: booking.dropoffAddress,
              price: booking.price?.toString(),
              expiresAt,
            });
            
            // Send SMS notification
            const moverUser = await storage.getUser(mover.userId);
            if (moverUser?.phone) {
              await notificationService.sendJobAssignment(
                moverUser,
                booking,
                mover.estimatedEarnings.toFixed(2),
                mover.distanceToPickup.toFixed(1)
              );
            }
            
            notificationResults.push({
              moverId: mover.moverId,
              moverName: moverUser?.name || 'Unknown',
              success: true
            });
          } catch (err: any) {
            notificationResults.push({
              moverId: mover.moverId,
              moverName: 'Unknown',
              success: false,
              error: err.message
            });
          }
        })
      );
      
      const successCount = notificationResults.filter(r => r.success).length;
      
      logEvent.booking('job_notifications_resent', {
        bookingId,
        adminUserId: user.id,
        moversNotified: successCount,
        vehicleType: recommendedVehicle,
        usedFallback
      });
      
      res.json({
        success: true,
        message: usedFallback 
          ? `No matching vehicle found. Sent to ALL ${successCount} available mover(s)` 
          : `Job notifications sent to ${successCount} mover(s)`,
        bookingId,
        vehicleType: recommendedVehicle,
        usedFallback,
        expiresAt,
        notifiedMovers: successCount,
        moversNotified: notificationResults
      });
      
    } catch (error) {
      logEvent.error('admin_resend_notifications', error);
      res.status(500).json({ error: "Failed to resend job notifications" });
    }
  });

  // ===== ADMIN: MANUAL MOVER ASSIGNMENT =====
  // Allows admin to manually assign a mover to a booking
  app.post("/api/admin/bookings/:bookingId/assign-mover", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Only admins can manually assign movers
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { bookingId } = req.params;
      const { moverId } = req.body;
      
      if (!moverId) {
        return res.status(400).json({ error: "Mover ID is required" });
      }
      
      // Get the booking
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Get the mover
      const mover = await storage.getMover(moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      // Get mover's user info
      const moverUser = await storage.getUser(mover.userId);
      if (!moverUser) {
        return res.status(404).json({ error: "Mover user not found" });
      }
      
      // Update the booking with the mover
      const updatedBooking = await storage.updateBooking(bookingId, {
        moverId: moverId,
        status: 'accepted', // Mark as accepted since admin assigned it
      });
      
      // Clear any pending job notifications for this booking
      await db.delete(jobNotifications).where(eq(jobNotifications.bookingId, bookingId));
      
      // Notify the mover about the assignment
      moverWebSocket.notifyMover(mover.userId, {
        type: 'job_notification',
        bookingId: booking.id,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        price: booking.price?.toString(),
        data: { message: 'You have been assigned a new job by admin' },
      });
      
      // Send SMS to mover
      if (moverUser.phone) {
        await notificationService.sendJobAssignment(
          moverUser,
          booking,
          (parseFloat(booking.price || '0') * 0.85).toFixed(2), // 85% earnings
          '0' // No distance calculation for manual assignment
        );
      }
      
      // Create in-app notification for mover
      await storage.createNotification({
        userId: mover.userId,
        type: 'job_assigned',
        title: 'New Job Assigned',
        message: `You have been assigned a move from ${booking.pickupAddress} to ${booking.dropoffAddress}`,
        bookingId: booking.id,
      });
      
      // Also notify the customer
      const customer = await storage.getUser(booking.customerId);
      if (customer) {
        await storage.createNotification({
          userId: customer.id,
          type: 'mover_assigned',
          title: 'Mover Assigned',
          message: `${moverUser.name} has been assigned to your move`,
          bookingId: booking.id,
        });
      }
      
      logEvent.booking('admin_manual_assignment', {
        bookingId,
        moverId,
        moverName: moverUser.name,
        adminUserId: user.id,
      });
      
      res.json({
        success: true,
        message: `${moverUser.name} has been assigned to this booking`,
        booking: updatedBooking,
        mover: {
          id: mover.id,
          name: moverUser.name,
          phone: moverUser.phone,
          vehicleType: mover.vehicleType,
        }
      });
      
    } catch (error) {
      logEvent.error('admin_manual_assignment', error);
      res.status(500).json({ error: "Failed to assign mover" });
    }
  });

  // Get list of available movers for admin assignment dropdown
  app.get("/api/admin/available-movers", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      // Get all movers who are available
      const availableMovers = await db.select().from(moversTable).where(eq(moversTable.isAvailable, true));
      
      // Get user details for each mover
      const moversWithDetails = await Promise.all(
        availableMovers.map(async (mover) => {
          const moverUser = await storage.getUser(mover.userId);
          return {
            id: mover.id,
            userId: mover.userId,
            name: moverUser?.name || 'Unknown',
            phone: moverUser?.phone || '',
            vehicleType: mover.vehicleType,
            rating: mover.rating,
            totalMoves: mover.totalMoves,
            isVerified: mover.isVerified,
          };
        })
      );
      
      res.json(moversWithDetails);
    } catch (error) {
      logEvent.error('admin_get_available_movers', error);
      res.status(500).json({ error: "Failed to get available movers" });
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
      
      // Allow location updates for all active statuses (en_route, loading, unloading, etc.)
      if (!ACTIVE_STATUSES.includes(booking.status as any)) {
        return res.status(400).json({ error: "Location updates only allowed during active trip statuses" });
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
      
      let moverData = null;
      if (booking.moverId) {
        const mover = await storage.getMover(booking.moverId);
        if (mover) {
          const moverUser = await storage.getUserById(mover.userId);
          moverData = {
            name: moverUser?.name || "Your mover",
            phone: moverUser?.phone || "",
            vehicleType: mover.vehicleType || "",
            rating: mover.rating ?? 0,
            vehiclePhoto: mover.vehiclePhoto || null,
            profilePhoto: mover.vehiclePhoto || null,
          };
        }
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
        } : null,
        mover: moverData,
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
  
  // POST /api/ai/items/:bookingId/save - Save pre-analyzed items to a booking (idempotent)
  app.post("/api/ai/items/:bookingId/save", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const { bookingId } = req.params;
      const { items } = req.body;
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array required" });
      }
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const user = (req as any).user;
      if (booking.customerId !== user.id && user.role !== 'admin') {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Idempotency: skip if items already exist for this booking
      const existingItems = await storage.getIdentifiedItemsByBooking(bookingId);
      if (existingItems.length > 0) {
        return res.json({ saved: 0, items: existingItems, message: "Items already saved" });
      }
      
      const savedItems = [];
      for (const item of items) {
        if (!item.photoUrl || typeof item.photoUrl !== 'string') continue;
        if (!item.itemName || typeof item.itemName !== 'string') continue;
        
        const saved = await storage.createIdentifiedItem({
          bookingId,
          photoUrl: item.photoUrl,
          processingStatus: 'completed',
          itemName: item.itemName,
          category: typeof item.category === 'string' ? item.category : null,
          weightKg: item.weightKg != null ? String(item.weightKg) : null,
          dimensionsLcm: item.dimensionsLcm != null ? String(item.dimensionsLcm) : null,
          dimensionsWcm: item.dimensionsWcm != null ? String(item.dimensionsWcm) : null,
          dimensionsHcm: item.dimensionsHcm != null ? String(item.dimensionsHcm) : null,
          volumeCuft: item.volumeCuft != null ? String(item.volumeCuft) : null,
          handlingComplexity: typeof item.handlingComplexity === 'string' ? item.handlingComplexity : null,
          vehicleType: typeof item.vehicleType === 'string' ? item.vehicleType : null,
          recommendedMovers: typeof item.recommendedMovers === 'number' ? item.recommendedMovers : 1,
          insuranceLevel: typeof item.insuranceLevel === 'string' ? item.insuranceLevel : null,
          confidence: item.confidence != null ? String(item.confidence) : null,
          sourceMetadata: typeof item.sourceMetadata === 'string' ? item.sourceMetadata : null,
        } as any);
        savedItems.push(saved);
      }
      
      console.log(`[AI Items] Saved ${savedItems.length} pre-analyzed items for booking ${bookingId}`);
      res.json({ saved: savedItems.length, items: savedItems });
    } catch (error) {
      console.error('[AI Items] Save error:', error);
      res.status(500).json({ error: "Failed to save items" });
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
        // CRITICAL SAFETY: NEVER delete bookings that have payment intents (customer may have paid)
        if (b.stripePaymentIntentId) return false;
        // CRITICAL SAFETY: NEVER delete bookings with succeeded payments
        if (b.paymentStatus === 'succeeded') return false;
        
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

  // Admin: Cancel all past-dated bookings (manual trigger for cleanup)
  app.post("/api/admin/cancel-past-dated", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // All active statuses that should be cancelled if past-dated
      const activeStatuses = [
        'pending', 
        'confirmed', 
        'pending_payment',
        'en_route_to_pickup',
        'loading',
        'en_route_to_dropoff',
        'unloading',
        'in_transit'
      ];
      
      const pastBookings = await db
        .update(bookings)
        .set({ 
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(bookings.status, activeStatuses),
            lt(bookings.preferredDate, today)
          )
        )
        .returning({ id: bookings.id, preferredDate: bookings.preferredDate, status: bookings.status });
      
      res.json({ 
        message: `Cancelled ${pastBookings.length} past-dated bookings`,
        cancelled: pastBookings.length,
        bookings: pastBookings.map(b => ({ id: b.id.slice(0, 8), date: b.preferredDate }))
      });
    } catch (error) {
      console.error('[Admin] Cancel past-dated error:', error);
      res.status(500).json({ error: "Failed to cancel past-dated bookings" });
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

  // ===== ADMIN: SYNC MOVER TRIP COUNTERS =====
  // One-time sync to update completedTrips and totalMoves based on actual completed bookings
  app.post("/api/admin/sync-mover-counters", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get before state for all movers
      const beforeState = await db.select({
        id: moversTable.id,
        completedTrips: moversTable.completedTrips
      }).from(moversTable);
      
      // Get booking counts
      const statusCounts = await db
        .select({
          status: bookings.status,
          count: sql<number>`COUNT(*)::int`
        })
        .from(bookings)
        .groupBy(bookings.status);
      
      const completedCounts = await db
        .select({
          moverId: bookings.moverId,
          count: sql<number>`COUNT(*)::int`
        })
        .from(bookings)
        .where(and(
          eq(bookings.status, 'completed'),
          eq(bookings.paymentStatus, 'succeeded')
        ))
        .groupBy(bookings.moverId);
      
      console.log('[Admin Sync] Completed bookings by mover:', completedCounts);
      
      // FORCE UPDATE using direct SQL - bypass all JavaScript comparison
      // First, reset all movers to 0
      await db.execute(sql`UPDATE movers SET completed_trips = 0, total_moves = 0`);
      
      // Then set the correct counts for movers with completed bookings
      let updatedCount = 0;
      const updates: { moverId: string; newTrips: number }[] = [];
      
      for (const row of completedCounts) {
        if (row.moverId && row.count > 0) {
          await db.execute(sql`
            UPDATE movers 
            SET completed_trips = ${row.count}, total_moves = ${row.count}
            WHERE id = ${row.moverId}
          `);
          updates.push({ moverId: row.moverId, newTrips: row.count });
          updatedCount++;
          console.log(`[Admin Sync] Set mover ${row.moverId} to ${row.count} trips`);
        }
      }
      
      // Get after state
      const afterState = await db.select({
        id: moversTable.id,
        completedTrips: moversTable.completedTrips
      }).from(moversTable);
      
      res.json({
        success: true,
        message: `Force synced ${updatedCount} mover(s) with completed bookings. All other movers reset to 0.`,
        updates,
        diagnostics: {
          totalMovers: beforeState.length,
          bookingStatusCounts: statusCounts,
          completedByMover: completedCounts,
          beforeState,
          afterState
        }
      });
    } catch (error) {
      console.error('[Admin] Sync mover counters error:', error);
      res.status(500).json({ error: "Failed to sync mover counters" });
    }
  });

  // ===== ADMIN: BACKFILL MISSING MOVER EARNINGS =====
  // Creates mover_earnings records for completed bookings that don't have them
  app.post("/api/admin/backfill-mover-earnings", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get all completed bookings with movers assigned
      const completedBookings = await db.select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, 'completed'),
            sql`${bookings.moverId} IS NOT NULL`
          )
        );
      
      // Get existing earnings records
      const existingEarnings = await db.select({ bookingId: moverEarnings.bookingId })
        .from(moverEarnings);
      
      const existingBookingIds = new Set(existingEarnings.map(e => e.bookingId));
      
      // Find bookings missing earnings
      const missingBookings = completedBookings.filter(b => !existingBookingIds.has(b.id));
      
      if (missingBookings.length === 0) {
        return res.json({ 
          success: true, 
          message: "All completed bookings already have earnings records",
          created: 0
        });
      }
      
      const created: { bookingId: string; moverId: string; netAmount: string }[] = [];
      
      for (const booking of missingBookings) {
        if (!booking.moverId || !booking.price) continue;
        
        const grossAmount = parseFloat(booking.price);
        const platformFeeAmount = grossAmount * (PLATFORM_COMMISSION_PERCENT / 100);
        const netAmount = grossAmount - platformFeeAmount;
        
        try {
          await db.insert(moverEarnings).values({
            id: crypto.randomUUID(),
            bookingId: booking.id,
            moverId: booking.moverId,
            grossAmount: grossAmount.toFixed(2),
            platformFeePercent: PLATFORM_COMMISSION_PERCENT.toString(),
            platformFeeAmount: platformFeeAmount.toFixed(2),
            netAmount: netAmount.toFixed(2),
            status: 'pending',
            availableAt: new Date(),
            createdAt: new Date(),
          });
          
          created.push({
            bookingId: booking.id,
            moverId: booking.moverId,
            netAmount: netAmount.toFixed(2)
          });
        } catch (err) {
          console.error(`[Admin] Failed to create earnings for booking ${booking.id}:`, err);
        }
      }
      
      res.json({
        success: true,
        message: `Created ${created.length} missing earnings records`,
        created
      });
    } catch (error) {
      console.error('[Admin] Backfill earnings error:', error);
      res.status(500).json({ error: "Failed to backfill earnings" });
    }
  });

  // ===== ADMIN: MARK EARNINGS AS MANUALLY PAID =====
  // For cases where payment was made outside Stripe (bank transfer, e-transfer, etc.)
  app.post("/api/admin/mark-manually-paid", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { earningsIds, reference } = req.body;
      
      if (!earningsIds || !Array.isArray(earningsIds) || earningsIds.length === 0) {
        return res.status(400).json({ error: "earningsIds array is required" });
      }
      
      const updated: { earningsId: string; moverId: string; amount: string }[] = [];
      const failed: { earningsId: string; reason: string }[] = [];
      
      for (const earningsId of earningsIds) {
        try {
          // Get the earning record
          const earning = await db.select()
            .from(moverEarnings)
            .where(eq(moverEarnings.id, earningsId))
            .limit(1);
          
          if (earning.length === 0) {
            failed.push({ earningsId, reason: 'Earning record not found' });
            continue;
          }
          
          if (earning[0].status === 'paid') {
            failed.push({ earningsId, reason: 'Already marked as paid' });
            continue;
          }
          
          // Update to paid status with manual reference
          const referenceNote = reference || `manual_bank_transfer_${new Date().toISOString().slice(0,10)}`;
          
          await db.update(moverEarnings)
            .set({
              status: 'paid',
              stripeTransferId: referenceNote,
              paidAt: new Date(),
            })
            .where(eq(moverEarnings.id, earningsId));
          
          updated.push({
            earningsId,
            moverId: earning[0].moverId,
            amount: earning[0].netAmount,
          });
          
          logEvent.payment('manual_payout_marked', {
            earningsId,
            moverId: earning[0].moverId,
            amount: earning[0].netAmount,
            reference: referenceNote,
            adminId: (req.session as any)?.userId,
          });
        } catch (err) {
          console.error(`[Admin] Failed to mark earning ${earningsId} as paid:`, err);
          failed.push({ earningsId, reason: 'Database update failed' });
        }
      }
      
      const totalPaid = updated.reduce((sum, u) => sum + parseFloat(u.amount), 0);
      
      res.json({
        success: true,
        message: `Marked ${updated.length} earnings as manually paid ($${totalPaid.toFixed(2)})`,
        updated,
        failed,
      });
    } catch (error) {
      console.error('[Admin] Mark manually paid error:', error);
      res.status(500).json({ error: "Failed to mark earnings as paid" });
    }
  });

  // ===== ADMIN: PROCESS PENDING MOVER PAYOUTS =====
  // Transfers money from LervIT's Stripe account to movers for pending earnings
  app.post("/api/admin/process-pending-payouts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get all pending earnings
      const pendingEarnings = await db.select()
        .from(moverEarnings)
        .where(eq(moverEarnings.status, 'pending'));
      
      if (pendingEarnings.length === 0) {
        return res.json({
          success: true,
          message: "No pending payouts to process",
          processed: 0,
          failed: 0
        });
      }
      
      const processed: { earningsId: string; moverId: string; amount: string; transferId: string }[] = [];
      const failed: { earningsId: string; moverId: string; reason: string }[] = [];
      const skipped: { earningsId: string; moverId: string; reason: string }[] = [];
      
      for (const earning of pendingEarnings) {
        // Get mover's Stripe connected account
        const moverAccounts = await db.select()
          .from(moverStripeAccounts)
          .where(eq(moverStripeAccounts.moverId, earning.moverId))
          .limit(1);
        
        if (moverAccounts.length === 0) {
          skipped.push({
            earningsId: earning.id,
            moverId: earning.moverId,
            reason: 'No Stripe account connected'
          });
          continue;
        }
        
        const moverAccount = moverAccounts[0];
        
        if (!moverAccount.chargesEnabled || !moverAccount.payoutsEnabled) {
          skipped.push({
            earningsId: earning.id,
            moverId: earning.moverId,
            reason: 'Stripe account not fully verified'
          });
          continue;
        }
        
        const netAmountCents = Math.round(parseFloat(earning.netAmount) * 100);
        
        try {
          // Get the charge ID from the booking's payment intent for source_transaction
          let sourceChargeId: string | undefined;
          const bookingData = await storage.getBooking(earning.bookingId);
          if (bookingData?.stripePaymentIntentId) {
            try {
              const pi = await stripe.paymentIntents.retrieve(bookingData.stripePaymentIntentId);
              if (pi.latest_charge) {
                sourceChargeId = typeof pi.latest_charge === 'string' 
                  ? pi.latest_charge 
                  : pi.latest_charge.id;
              }
            } catch (chargeErr) {
              console.error(`[Admin Payout] Failed to get charge for source_transaction:`, chargeErr);
            }
          }
          
          // Create Stripe Transfer to mover's connected account
          const transferParams: Stripe.TransferCreateParams = {
            amount: netAmountCents,
            currency: 'cad',
            destination: moverAccount.stripeAccountId,
            metadata: {
              earningsId: earning.id,
              bookingId: earning.bookingId,
              moverId: earning.moverId,
              processedBy: 'admin_batch_payout',
            },
          };
          
          if (sourceChargeId) {
            transferParams.source_transaction = sourceChargeId;
          }
          
          const transfer = await stripe.transfers.create(transferParams);
          
          // Update earnings status to paid
          await db.update(moverEarnings)
            .set({
              status: 'paid',
              stripeTransferId: transfer.id,
              paidAt: new Date(),
            })
            .where(eq(moverEarnings.id, earning.id));
          
          processed.push({
            earningsId: earning.id,
            moverId: earning.moverId,
            amount: earning.netAmount,
            transferId: transfer.id
          });
          
          console.log(`[Admin Payout] Transferred $${earning.netAmount} to mover ${earning.moverId} (transfer: ${transfer.id})`);
        } catch (err: any) {
          console.error(`[Admin Payout] Failed to transfer for earnings ${earning.id}:`, err);
          failed.push({
            earningsId: earning.id,
            moverId: earning.moverId,
            reason: err.message || 'Transfer failed'
          });
        }
      }
      
      const totalPaid = processed.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      
      res.json({
        success: true,
        message: `Processed ${processed.length} payouts, ${failed.length} failed, ${skipped.length} skipped`,
        totalPaid: totalPaid.toFixed(2),
        processed,
        failed,
        skipped
      });
    } catch (error) {
      console.error('[Admin] Process pending payouts error:', error);
      res.status(500).json({ error: "Failed to process pending payouts" });
    }
  });

  // ===== ADMIN: GET PENDING PAYOUTS SUMMARY =====
  // View all pending payouts before processing
  app.get("/api/admin/pending-payouts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get all pending earnings with mover info
      const pendingEarnings = await db.select()
        .from(moverEarnings)
        .where(eq(moverEarnings.status, 'pending'));
      
      // Get mover Stripe account status for each
      const payoutSummary = [];
      let totalPending = 0;
      let readyToPay = 0;
      let needsStripeSetup = 0;
      
      for (const earning of pendingEarnings) {
        const moverAccounts = await db.select()
          .from(moverStripeAccounts)
          .where(eq(moverStripeAccounts.moverId, earning.moverId))
          .limit(1);
        
        const hasStripeAccount = moverAccounts.length > 0;
        const isReady = hasStripeAccount && moverAccounts[0].chargesEnabled && moverAccounts[0].payoutsEnabled;
        
        const netAmount = parseFloat(earning.netAmount);
        totalPending += netAmount;
        
        if (isReady) {
          readyToPay += netAmount;
        } else {
          needsStripeSetup += netAmount;
        }
        
        // Get mover name
        const mover = await db.select().from(moversTable).where(eq(moversTable.id, earning.moverId)).limit(1);
        const moverUser = mover.length > 0 ? await storage.getUser(mover[0].userId) : null;
        
        payoutSummary.push({
          earningsId: earning.id,
          bookingId: earning.bookingId,
          moverId: earning.moverId,
          moverName: moverUser?.name || 'Unknown',
          grossAmount: earning.grossAmount,
          platformFee: earning.platformFeeAmount,
          netAmount: earning.netAmount,
          hasStripeAccount,
          isReadyToPay: isReady,
          createdAt: earning.createdAt,
        });
      }
      
      res.json({
        success: true,
        totalPending: totalPending.toFixed(2),
        readyToPay: readyToPay.toFixed(2),
        needsStripeSetup: needsStripeSetup.toFixed(2),
        count: pendingEarnings.length,
        payouts: payoutSummary
      });
    } catch (error) {
      console.error('[Admin] Get pending payouts error:', error);
      res.status(500).json({ error: "Failed to get pending payouts" });
    }
  });

  // ===== ADMIN: GET ALL MOVER EARNINGS =====
  // Returns all mover earnings records for reconciliation, including completed bookings missing earnings records
  app.get("/api/admin/mover-earnings", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get existing earnings records
      const earnings = await db.select()
        .from(moverEarnings)
        .orderBy(desc(moverEarnings.createdAt));
      
      // Get completed bookings with movers that DON'T have earnings records yet
      const existingBookingIds = new Set(earnings.map(e => e.bookingId));
      
      const completedBookings = await db.select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, 'completed'),
            eq(bookings.paymentStatus, 'succeeded'),
            sql`${bookings.moverId} IS NOT NULL`
          )
        )
        .orderBy(desc(bookings.createdAt));
      
      // Convert completed bookings without earnings to a compatible format
      const missingEarnings = completedBookings
        .filter(b => !existingBookingIds.has(b.id))
        .map(b => {
          const grossAmount = Number(b.price) || 0;
          const platformFeePercent = 15; // 15% commission
          const platformFeeAmount = Math.round(grossAmount * platformFeePercent) / 100;
          const netAmount = grossAmount - platformFeeAmount;
          
          return {
            id: `missing-${b.id}`,
            moverId: b.moverId,
            bookingId: b.id,
            grossAmount: grossAmount.toFixed(2),
            platformFeePercent: platformFeePercent.toString(),
            platformFeeAmount: platformFeeAmount.toFixed(2),
            netAmount: netAmount.toFixed(2),
            stripeTransferId: null,
            status: 'needs_backfill' as const,
            availableAt: null,
            paidAt: null,
            payoutId: null,
            createdAt: b.createdAt,
            _isMissing: true,  // Flag for frontend
          };
        });
      
      // Combine and sort by date
      const allEarnings = [...earnings, ...missingEarnings].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      res.json(allEarnings);
    } catch (error) {
      console.error('[Admin] Get mover earnings error:', error);
      res.status(500).json({ error: "Failed to get mover earnings" });
    }
  });

  // ===== ADMIN: REFRESH GPS STATUS FOR ALL ONLINE MOVERS =====
  // Updates lastLocationUpdate for all online movers so they show as "Live" on Find Movers
  app.post("/api/admin/refresh-mover-gps", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get all online movers
      const onlineMovers = await db.select()
        .from(moversTable)
        .where(eq(moversTable.isAvailable, true));
      
      if (onlineMovers.length === 0) {
        return res.json({
          success: true,
          message: "No online movers found",
          updated: 0
        });
      }
      
      // Update lastLocationUpdate for all online movers to current time
      const now = new Date();
      const updated: { moverId: string; name: string | null }[] = [];
      
      for (const mover of onlineMovers) {
        await db.update(moversTable)
          .set({ lastLocationUpdate: now })
          .where(eq(moversTable.id, mover.id));
        
        // Get mover name
        const user = await db.select({ name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, mover.userId))
          .limit(1);
        
        updated.push({
          moverId: mover.id,
          name: user[0]?.name || null
        });
      }
      
      console.log(`[Admin] Refreshed GPS status for ${updated.length} online movers`);
      
      res.json({
        success: true,
        message: `Refreshed GPS status for ${updated.length} online mover(s). They will now show as "Live" on Find Movers.`,
        updated
      });
    } catch (error) {
      console.error('[Admin] Refresh mover GPS error:', error);
      res.status(500).json({ error: "Failed to refresh mover GPS status" });
    }
  });

  // ===== ADMIN: SYNC MOVER STRIPE STATUS =====
  // Manually refresh a mover's Stripe Connect status from Stripe API
  app.post("/api/admin/sync-mover-stripe/:moverId", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { moverId } = req.params;
      
      // Get mover's Stripe account from our database
      const moverAccounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, moverId))
        .limit(1);
      
      if (moverAccounts.length === 0) {
        return res.status(404).json({ error: "No Stripe account found for this mover" });
      }
      
      const moverAccount = moverAccounts[0];
      
      // Fetch latest status from Stripe
      const stripeAccount = await stripe.accounts.retrieve(moverAccount.stripeAccountId);
      
      // Determine onboarding status
      const newOnboardingStatus = stripeAccount.details_submitted ? 'complete' : 
                                  (stripeAccount.requirements?.currently_due?.length ? 'restricted' : 'in_progress');
      
      // Update our database with latest Stripe status
      await db.update(moverStripeAccounts)
        .set({
          chargesEnabled: stripeAccount.charges_enabled,
          payoutsEnabled: stripeAccount.payouts_enabled,
          detailsSubmitted: stripeAccount.details_submitted,
          onboardingStatus: newOnboardingStatus,
          requirementsDue: stripeAccount.requirements?.eventually_due || [],
          currentlyDue: stripeAccount.requirements?.currently_due || [],
          updatedAt: new Date(),
        })
        .where(eq(moverStripeAccounts.id, moverAccount.id));
      
      console.log(`[Admin] Synced Stripe status for mover ${moverId}: charges=${stripeAccount.charges_enabled}, payouts=${stripeAccount.payouts_enabled}`);
      
      res.json({
        success: true,
        message: "Stripe status synced successfully",
        status: {
          chargesEnabled: stripeAccount.charges_enabled,
          payoutsEnabled: stripeAccount.payouts_enabled,
          detailsSubmitted: stripeAccount.details_submitted,
          onboardingStatus: newOnboardingStatus,
          currentlyDue: stripeAccount.requirements?.currently_due || [],
        }
      });
    } catch (error: any) {
      console.error('[Admin] Sync mover Stripe error:', error);
      res.status(500).json({ error: error.message || "Failed to sync Stripe status" });
    }
  });

  // ===== ADMIN: MANUAL TRANSFER FOR BOOKING =====
  // Create a manual Stripe transfer for a platform charge booking
  app.post("/api/admin/manual-transfer/:bookingId", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { bookingId } = req.params;
      
      // Get the booking
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      if (!booking.moverId) {
        return res.status(400).json({ error: "Booking has no assigned mover" });
      }
      
      if (booking.paymentStatus !== 'succeeded') {
        return res.status(400).json({ error: "Booking payment not completed" });
      }
      
      // Check if already transferred
      const existingEarnings = await db.select()
        .from(moverEarnings)
        .where(eq(moverEarnings.bookingId, bookingId))
        .limit(1);
      
      if (existingEarnings.length > 0 && existingEarnings[0].stripeTransferId) {
        return res.status(400).json({ 
          error: "Transfer already exists",
          transferId: existingEarnings[0].stripeTransferId 
        });
      }
      
      // Get mover's Stripe account
      const moverAccounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, booking.moverId))
        .limit(1);
      
      if (moverAccounts.length === 0) {
        return res.status(400).json({ error: "Mover has no Stripe Connect account" });
      }
      
      const moverAccount = moverAccounts[0];
      
      if (!moverAccount.payoutsEnabled) {
        return res.status(400).json({ 
          error: "Mover's Stripe account not ready for payouts. They need to complete onboarding.",
          chargesEnabled: moverAccount.chargesEnabled,
          payoutsEnabled: moverAccount.payoutsEnabled,
        });
      }
      
      // Calculate amounts using the centralized fee calculation helper
      const grossAmount = parseFloat(booking.price || '0');
      const feeCalc = calculatePlatformFee(grossAmount, booking.loadSize);
      const { grossAmountCents, platformFeeCents, moverPayoutCents, platformFeePercent } = feeCalc;
      const platformFeeAmount = platformFeeCents / 100;
      const netAmount = moverPayoutCents / 100;
      
      // Create Stripe Transfer (use moverPayoutCents from fee calculation)
      const transfer = await stripe.transfers.create({
        amount: moverPayoutCents,
        currency: 'cad',
        destination: moverAccount.stripeAccountId,
        metadata: {
          bookingId,
          moverId: booking.moverId,
          grossAmount: grossAmount.toFixed(2),
          platformFee: platformFeeAmount.toFixed(2),
          processedBy: 'admin_manual_transfer',
        },
      }, {
        idempotencyKey: `manual-transfer-${bookingId}`,
      });
      
      // Create or update earnings record
      if (existingEarnings.length > 0) {
        await db.update(moverEarnings)
          .set({
            stripeTransferId: transfer.id,
            status: 'paid',
            paidAt: new Date(),
          })
          .where(eq(moverEarnings.id, existingEarnings[0].id));
      } else {
        await db.insert(moverEarnings).values({
          moverId: booking.moverId,
          bookingId,
          grossAmount: grossAmount.toFixed(2),
          platformFeePercent: platformFeePercent.toFixed(2),
          platformFeeAmount: platformFeeAmount.toFixed(2),
          netAmount: netAmount.toFixed(2),
          stripeTransferId: transfer.id,
          status: 'paid',
          paidAt: new Date(),
        });
      }
      
      // Update booking with commission data
      await storage.updateBooking(bookingId, {
        platformFeePercent: platformFeePercent.toString(),
        platformFeeAmount: platformFeeAmount.toFixed(2),
        moverNetAmount: netAmount.toFixed(2),
      });
      
      console.log(`[Admin] Manual transfer created: $${netAmount.toFixed(2)} to mover ${booking.moverId} (transfer: ${transfer.id})`);
      
      res.json({
        success: true,
        message: `Successfully transferred $${netAmount.toFixed(2)} to mover`,
        transfer: {
          id: transfer.id,
          amount: netAmount.toFixed(2),
          grossAmount: grossAmount.toFixed(2),
          platformFee: platformFeeAmount.toFixed(2),
        }
      });
    } catch (error: any) {
      console.error('[Admin] Manual transfer error:', error);
      res.status(500).json({ error: error.message || "Failed to create transfer" });
    }
  });

  // ===== ADMIN: Sync Stripe Connect Accounts from Stripe =====
  // Fetches all connected accounts from Stripe and syncs them to our database
  app.post("/api/admin/sync-stripe-accounts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      logEvent.payment('stripe_accounts_sync_started', {
        triggeredBy: (req as any).user?.id,
      });
      
      // Fetch all connected accounts from Stripe
      const accounts = await stripe.accounts.list({ limit: 100 });
      
      let synced = 0;
      let created = 0;
      let updated = 0;
      const results: any[] = [];
      
      for (const account of accounts.data) {
        const onboardingStatus = account.charges_enabled && account.payouts_enabled 
          ? 'complete' 
          : account.details_submitted 
            ? 'pending' 
            : 'incomplete';
        
        // First check if this Stripe account already exists in our database
        const existingByStripeId = await db.select()
          .from(moverStripeAccounts)
          .where(eq(moverStripeAccounts.stripeAccountId, account.id))
          .limit(1);
        
        if (existingByStripeId.length > 0) {
          // Update existing record by Stripe account ID
          await db.update(moverStripeAccounts)
            .set({
              onboardingStatus,
              chargesEnabled: account.charges_enabled || false,
              payoutsEnabled: account.payouts_enabled || false,
              detailsSubmitted: account.details_submitted || false,
              updatedAt: new Date(),
            })
            .where(eq(moverStripeAccounts.stripeAccountId, account.id));
          updated++;
          results.push({ accountId: account.id, email: account.email, moverId: existingByStripeId[0].moverId, status: 'updated', chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled });
          synced++;
          continue;
        }
        
        // Try to find the mover by email
        const email = account.email;
        if (!email) {
          results.push({ accountId: account.id, status: 'skipped', reason: 'No email on Stripe account' });
          continue;
        }
        
        // Find user by email
        const userMatches = await db.select()
          .from(usersTable)
          .where(eq(usersTable.email, email))
          .limit(1);
        
        if (userMatches.length === 0) {
          results.push({ accountId: account.id, email, status: 'skipped', reason: 'No matching user found' });
          continue;
        }
        
        const userId = userMatches[0].id;
        
        // Check if this user is actually a mover and get their mover ID
        const moverCheck = await db.select()
          .from(moversTable)
          .where(eq(moversTable.userId, userId))
          .limit(1);
        
        if (moverCheck.length === 0) {
          results.push({ accountId: account.id, email, status: 'skipped', reason: 'User is not a mover' });
          continue;
        }
        
        const moverId = moverCheck[0].id; // Use mover's ID, not user's ID
        
        // Check if we already have a record for this mover (different Stripe account)
        const existingByMoverId = await db.select()
          .from(moverStripeAccounts)
          .where(eq(moverStripeAccounts.moverId, moverId))
          .limit(1);
        
        if (existingByMoverId.length > 0) {
          // Update existing mover record with new Stripe account
          await db.update(moverStripeAccounts)
            .set({
              stripeAccountId: account.id,
              onboardingStatus,
              chargesEnabled: account.charges_enabled || false,
              payoutsEnabled: account.payouts_enabled || false,
              detailsSubmitted: account.details_submitted || false,
              updatedAt: new Date(),
            })
            .where(eq(moverStripeAccounts.moverId, moverId));
          updated++;
          results.push({ accountId: account.id, email, moverId, status: 'updated', chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled });
        } else {
          // Create new record
          await db.insert(moverStripeAccounts).values({
            moverId,
            stripeAccountId: account.id,
            accountType: 'express',
            onboardingStatus,
            chargesEnabled: account.charges_enabled || false,
            payoutsEnabled: account.payouts_enabled || false,
            detailsSubmitted: account.details_submitted || false,
            defaultCurrency: account.default_currency || 'cad',
            country: account.country || 'CA',
          });
          created++;
          results.push({ accountId: account.id, email, userId, status: 'created', chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled });
        }
        synced++;
      }
      
      logEvent.payment('stripe_accounts_sync_completed', {
        totalAccounts: accounts.data.length,
        synced,
        created,
        updated,
      });
      
      res.json({
        success: true,
        totalStripeAccounts: accounts.data.length,
        synced,
        created,
        updated,
        results,
      });
    } catch (error: any) {
      console.error('Stripe accounts sync error:', error);
      logEvent.error('stripe_accounts_sync_failed', error);
      res.status(500).json({ error: error.message || "Failed to sync Stripe accounts" });
    }
  });

  // ===== TEST ENDPOINT: Simulate Auto-Transfer on Onboarding =====
  // This endpoint simulates what happens when a mover completes Stripe Connect onboarding
  // Use this to test the auto-transfer flow without going through actual onboarding
  app.post("/api/admin/test-auto-transfer/:moverId", async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { moverId } = req.params;
      
      // Get mover's Stripe account
      const moverAccounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, moverId))
        .limit(1);
      
      if (moverAccounts.length === 0) {
        return res.status(404).json({ error: "Mover has no Stripe Connect account" });
      }
      
      const moverAccount = moverAccounts[0];
      
      if (!moverAccount.chargesEnabled || !moverAccount.payoutsEnabled) {
        return res.status(400).json({ 
          error: "Mover is not fully onboarded yet",
          chargesEnabled: moverAccount.chargesEnabled,
          payoutsEnabled: moverAccount.payoutsEnabled,
          hint: "Mover must complete Stripe Connect onboarding first"
        });
      }
      
      logEvent.payment('test_auto_transfer_triggered', { 
        moverId,
        triggeredBy: user.id,
      });
      
      // Find pending earnings for this mover that need transfer
      const pendingEarnings = await db.select()
        .from(moverEarnings)
        .where(and(
          eq(moverEarnings.moverId, moverId),
          or(
            eq(moverEarnings.status, 'pending'),
            eq(moverEarnings.status, 'needs_backfill')
          ),
          isNull(moverEarnings.stripeTransferId)
        ));
      
      if (pendingEarnings.length === 0) {
        return res.json({ 
          success: true, 
          message: "No pending earnings found for this mover",
          transfersCreated: 0 
        });
      }
      
      const results: any[] = [];
      
      for (const earning of pendingEarnings) {
        try {
          // Get the booking to calculate correct fee
          const booking = await storage.getBooking(earning.bookingId);
          if (!booking || booking.paymentStatus !== 'paid') {
            results.push({
              bookingId: earning.bookingId,
              status: 'skipped',
              reason: booking ? 'Payment not completed' : 'Booking not found'
            });
            continue;
          }
          
          // Calculate amounts using centralized helper
          const grossAmount = parseFloat(booking.price || '0');
          const feeCalc = calculatePlatformFee(grossAmount, booking.loadSize);
          const { moverPayoutCents, platformFeeCents } = feeCalc;
          
          // Create transfer to mover's connected account
          const transfer = await stripe.transfers.create({
            amount: moverPayoutCents,
            currency: 'cad',
            destination: moverAccount.stripeAccountId,
            metadata: {
              bookingId: earning.bookingId,
              moverId,
              grossAmount: grossAmount.toFixed(2),
              platformFee: (platformFeeCents / 100).toFixed(2),
              processedBy: 'test_auto_transfer',
            },
          }, {
            idempotencyKey: `test-auto-transfer-${earning.bookingId}-${Date.now()}`,
          });
          
          // Update earnings record
          await db.update(moverEarnings)
            .set({
              stripeTransferId: transfer.id,
              status: 'paid',
              paidAt: new Date(),
            })
            .where(eq(moverEarnings.id, earning.id));
          
          results.push({
            bookingId: earning.bookingId,
            status: 'success',
            transferId: transfer.id,
            amount: moverPayoutCents / 100,
          });
          
          logEvent.payment('test_auto_transfer_success', {
            moverId,
            bookingId: earning.bookingId,
            transferId: transfer.id,
            amount: moverPayoutCents / 100,
          });
        } catch (transferError: any) {
          results.push({
            bookingId: earning.bookingId,
            status: 'failed',
            error: transferError.message,
          });
          
          logEvent.error('test_auto_transfer_failed', transferError, {
            moverId,
            bookingId: earning.bookingId,
          });
        }
      }
      
      res.json({
        success: true,
        message: `Processed ${results.length} pending earnings`,
        transfersCreated: results.filter(r => r.status === 'success').length,
        results,
      });
    } catch (error: any) {
      console.error('[Admin] Test auto-transfer error:', error);
      res.status(500).json({ error: error.message || "Failed to run test auto-transfer" });
    }
  });

  // ===== ABANDONED BOOKINGS API =====
  
  // POST /api/abandoned-bookings - Save abandoned booking for reminder follow-up
  app.post("/api/abandoned-bookings", async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { pickupAddress, dropoffAddress, loadSize, preferredDate, selectedMoverId, lastStep, email, phone } = req.body;
      
      // Use user data if authenticated, otherwise use provided data
      const abandonedData = {
        userId: user?.id || null,
        email: user?.email || email || null,
        phone: user?.phone || phone || null,
        pickupAddress: pickupAddress || null,
        dropoffAddress: dropoffAddress || null,
        loadSize: loadSize || null,
        preferredDate: preferredDate || null,
        selectedMoverId: selectedMoverId || null,
        lastStep: lastStep || 1,
      };
      
      // Check if we have at least some identifying info
      if (!abandonedData.userId && !abandonedData.email && !abandonedData.phone) {
        return res.status(400).json({ error: "At least email, phone, or user ID required" });
      }
      
      // Check if there's an existing abandoned booking for this user/email
      let existingAbandoned = null;
      if (abandonedData.userId) {
        const result = await db.select().from(abandonedBookings)
          .where(and(
            eq(abandonedBookings.userId, abandonedData.userId),
            eq(abandonedBookings.recovered, false)
          ))
          .limit(1);
        existingAbandoned = result[0];
      } else if (abandonedData.email) {
        const result = await db.select().from(abandonedBookings)
          .where(and(
            eq(abandonedBookings.email, abandonedData.email),
            eq(abandonedBookings.recovered, false)
          ))
          .limit(1);
        existingAbandoned = result[0];
      }
      
      if (existingAbandoned) {
        // Update existing abandoned booking
        await db.update(abandonedBookings)
          .set({
            ...abandonedData,
            updatedAt: new Date(),
          })
          .where(eq(abandonedBookings.id, existingAbandoned.id));
        
        res.json({ success: true, updated: true, id: existingAbandoned.id });
      } else {
        // Create new abandoned booking
        const result = await db.insert(abandonedBookings).values(abandonedData).returning({ id: abandonedBookings.id });
        res.json({ success: true, created: true, id: result[0].id });
      }
    } catch (error) {
      console.error('[Abandoned Booking] Error saving:', error);
      res.status(500).json({ error: "Failed to save abandoned booking" });
    }
  });
  
  // GET /api/abandoned-bookings/:id - Get abandoned booking data for restoration
  app.get("/api/abandoned-bookings/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const [abandoned] = await db.select()
        .from(abandonedBookings)
        .where(eq(abandonedBookings.id, id))
        .limit(1);
      
      if (!abandoned) {
        return res.status(404).json({ error: "Abandoned booking not found" });
      }
      
      // Return the booking data for restoration
      res.json({
        id: abandoned.id,
        pickupAddress: abandoned.pickupAddress,
        dropoffAddress: abandoned.dropoffAddress,
        loadSize: abandoned.loadSize,
        preferredDate: abandoned.preferredDate,
        selectedMoverId: abandoned.selectedMoverId,
        lastStep: abandoned.lastStep,
        recovered: abandoned.recovered,
      });
    } catch (error) {
      console.error('[Abandoned Booking] Error fetching:', error);
      res.status(500).json({ error: "Failed to fetch abandoned booking" });
    }
  });

  // POST /api/abandoned-bookings/:id/recover - Mark abandoned booking as recovered
  app.post("/api/abandoned-bookings/:id/recover", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { bookingId } = req.body;
      
      await db.update(abandonedBookings)
        .set({
          recovered: true,
          recoveredBookingId: bookingId || null,
          updatedAt: new Date(),
        })
        .where(eq(abandonedBookings.id, id));
      
      res.json({ success: true });
    } catch (error) {
      console.error('[Abandoned Booking] Error recovering:', error);
      res.status(500).json({ error: "Failed to mark booking as recovered" });
    }
  });

  // ===== ADMIN: BACKFILL PERFORMANCE DATA =====
  app.post("/api/admin/backfill-performance", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get all completed bookings that don't have performance records
      const completedBookings = await db.select()
        .from(bookings)
        .where(and(
          eq(bookings.status, 'completed'),
          isNotNull(bookings.moverId)
        ));
      
      const existingPerf = await db.select({
        bookingId: moverPerformanceTable.bookingId
      }).from(moverPerformanceTable);
      
      const existingBookingIds = new Set(existingPerf.map(p => p.bookingId));
      const missingBookings = completedBookings.filter(b => !existingBookingIds.has(b.id));
      
      let created = 0;
      for (const b of missingBookings) {
        try {
          const acceptedTime = b.acceptedAt || b.createdAt;
          const completedTime = b.updatedAt || new Date();
          const totalMoveMinutes = Math.round(
            (new Date(completedTime).getTime() - new Date(acceptedTime).getTime()) / 60000
          );
          
          await db.insert(moverPerformanceTable).values({
            moverId: b.moverId!,
            bookingId: b.id,
            acceptedAt: acceptedTime ? new Date(acceptedTime) : null,
            unloadingCompletedAt: completedTime ? new Date(completedTime) : null,
            totalMoveMinutes: totalMoveMinutes > 0 ? totalMoveMinutes : null,
            distanceKm: b.distance || '0',
          });
          created++;
        } catch (err) {
          console.error(`[Backfill] Failed for booking ${b.id}:`, err);
        }
      }
      
      console.log(`[Backfill] Created ${created} performance records from ${missingBookings.length} completed bookings`);
      res.json({ 
        success: true, 
        message: `Backfilled ${created} performance records`,
        total: completedBookings.length,
        alreadyTracked: existingBookingIds.size,
        newlyCreated: created,
      });
    } catch (error) {
      console.error('[Backfill] Error:', error);
      res.status(500).json({ error: "Failed to backfill performance data" });
    }
  });
  
  // ===== ADMIN: GROWTH METRICS DASHBOARD =====
  
  app.get("/api/admin/growth-metrics", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Fulfilment period filter (7, 30, 90 days or 'all')
      const fulfilmentPeriod = req.query.fulfilmentPeriod as string || 'all';
      let fulfilmentCutoff: Date | null = null;
      if (fulfilmentPeriod === '7') fulfilmentCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (fulfilmentPeriod === '30') fulfilmentCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      else if (fulfilmentPeriod === '90') fulfilmentCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Revenue period filter (7, 30 days or 'all')
      const revenuePeriod = req.query.revenuePeriod as string || 'all';
      let revenueCutoff: Date | null = null;
      if (revenuePeriod === '7') revenueCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (revenuePeriod === '30') revenueCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Get all bookings
      const allBookings = await db.select().from(bookings);
      
      // Get all users
      const allUsers = await db.select().from(usersTable);
      
      // Get all movers
      const allMovers = await db.select().from(moversTable);
      
      // Get abandoned bookings
      const allAbandoned = await db.select().from(abandonedBookings);
      
      // Calculate metrics
      const totalBookings = allBookings.length;
      const weeklyBookings = allBookings.filter(b => new Date(b.createdAt) >= oneWeekAgo).length;
      const monthlyBookings = allBookings.filter(b => new Date(b.createdAt) >= oneMonthAgo).length;
      
      const completedBookings = allBookings.filter(b => b.status === 'completed');
      const completedCount = completedBookings.length;
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.price || '0'), 0);
      
      const paidBookings = allBookings.filter(b => b.paymentStatus === 'paid').length;
      const pendingPaymentBookings = allBookings.filter(b => b.paymentStatus === 'pending').length;
      const failedBookings = allBookings.filter(b => b.status === 'cancelled' || b.paymentStatus === 'failed').length;
      
      // Conversion rate: completed / total
      const conversionRate = totalBookings > 0 ? (completedCount / totalBookings * 100).toFixed(1) : '0';
      
      // User metrics
      const totalCustomers = allUsers.filter(u => u.role === 'customer').length;
      const weeklyNewCustomers = allUsers.filter(u => u.role === 'customer' && new Date(u.createdAt) >= oneWeekAgo).length;
      
      const totalMovers = allMovers.length;
      const onlineMovers = allMovers.filter(m => m.isAvailable).length;
      const verifiedMovers = allMovers.filter(m => m.isVerified).length;
      const weeklyNewMovers = allMovers.filter(m => new Date(m.createdAt) >= oneWeekAgo).length;
      
      // Live GPS movers (updated within last hour)
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const liveGpsMovers = allMovers.filter(m => 
        m.isAvailable && m.lastLocationUpdate && new Date(m.lastLocationUpdate) > oneHourAgo
      ).length;
      
      // Abandoned booking metrics
      const totalAbandoned = allAbandoned.length;
      const recoveredAbandoned = allAbandoned.filter(a => a.recovered).length;
      const pendingAbandoned = allAbandoned.filter(a => !a.recovered).length;
      const recoveryRate = totalAbandoned > 0 ? (recoveredAbandoned / totalAbandoned * 100).toFixed(1) : '0';
      
      // Average booking value (all-time)
      const avgBookingValue = completedCount > 0 ? (totalRevenue / completedCount).toFixed(2) : '0';

      // Revenue period-filtered calculations (use updatedAt as proxy for completion date)
      const revenueFilteredCompleted = revenueCutoff
        ? completedBookings.filter(b => b.updatedAt && new Date(b.updatedAt) >= revenueCutoff!)
        : completedBookings;
      const revenueFilteredCount = revenueFilteredCompleted.length;
      const revenueFilteredTotal = revenueFilteredCompleted.reduce((sum, b) => sum + parseFloat(b.price || '0'), 0);
      const revenueFilteredAvg = revenueFilteredCount > 0 ? (revenueFilteredTotal / revenueFilteredCount).toFixed(2) : '0';
      
      // Booking status breakdown
      const statusBreakdown = {
        pending: allBookings.filter(b => b.status === 'pending').length,
        accepted: allBookings.filter(b => b.status === 'accepted').length,
        in_progress: allBookings.filter(b => b.status === 'in_progress').length,
        completed: completedCount,
        cancelled: allBookings.filter(b => b.status === 'cancelled').length,
      };
      
      // Fulfilment hours - mover performance data
      const allPerformanceData = await db.select({
        id: moverPerformanceTable.id,
        moverId: moverPerformanceTable.moverId,
        bookingId: moverPerformanceTable.bookingId,
        totalMoveMinutes: moverPerformanceTable.totalMoveMinutes,
        acceptedAt: moverPerformanceTable.acceptedAt,
        arrivedAtPickupAt: moverPerformanceTable.arrivedAtPickupAt,
        loadingStartedAt: moverPerformanceTable.loadingStartedAt,
        loadingCompletedAt: moverPerformanceTable.loadingCompletedAt,
        arrivedAtDropoffAt: moverPerformanceTable.arrivedAtDropoffAt,
        unloadingCompletedAt: moverPerformanceTable.unloadingCompletedAt,
        distanceKm: moverPerformanceTable.distanceKm,
        createdAt: moverPerformanceTable.createdAt,
        moverName: usersTable.name,
      })
        .from(moverPerformanceTable)
        .leftJoin(moversTable, eq(moverPerformanceTable.moverId, moversTable.id))
        .leftJoin(usersTable, eq(moversTable.userId, usersTable.id));

      // Apply period filter using actual completion date (unloadingCompletedAt),
      // not createdAt which reflects when the DB row was inserted (misleading for backfilled records)
      const filteredPerf = fulfilmentCutoff
        ? allPerformanceData.filter(p => {
            const completionDate = p.unloadingCompletedAt || p.createdAt;
            return completionDate && new Date(completionDate) >= fulfilmentCutoff!;
          })
        : allPerformanceData;

      const completedPerf = filteredPerf.filter(p => p.totalMoveMinutes && p.totalMoveMinutes > 0);
      const totalMoves = completedPerf.length;
      const avgMoveMinutes = totalMoves > 0
        ? Math.round(completedPerf.reduce((sum, p) => sum + (p.totalMoveMinutes || 0), 0) / totalMoves)
        : 0;
      const fastestMove = totalMoves > 0
        ? Math.min(...completedPerf.map(p => p.totalMoveMinutes || Infinity))
        : 0;
      const slowestMove = totalMoves > 0
        ? Math.max(...completedPerf.map(p => p.totalMoveMinutes || 0))
        : 0;

      // Average completed job distance from mover performance table
      const perfWithDistance = completedPerf.filter(p => p.distanceKm && parseFloat(p.distanceKm) > 0);
      const avgCompletedDistanceKm = perfWithDistance.length > 0
        ? parseFloat((perfWithDistance.reduce((sum, p) => sum + parseFloat(p.distanceKm || '0'), 0) / perfWithDistance.length).toFixed(1))
        : null;

      // Per-driver breakdown
      const driverMap = new Map<string, { name: string; moverId: string; moves: number; totalMinutes: number; fastest: number; slowest: number; totalDistanceKm: number; distanceMoves: number }>();
      for (const p of completedPerf) {
        const key = p.moverId;
        const existing = driverMap.get(key);
        const mins = p.totalMoveMinutes || 0;
        const dist = p.distanceKm ? parseFloat(p.distanceKm) : 0;
        if (existing) {
          existing.moves++;
          existing.totalMinutes += mins;
          existing.fastest = Math.min(existing.fastest, mins);
          existing.slowest = Math.max(existing.slowest, mins);
          if (dist > 0) { existing.totalDistanceKm += dist; existing.distanceMoves++; }
        } else {
          driverMap.set(key, {
            name: p.moverName || 'Unknown',
            moverId: key,
            moves: 1,
            totalMinutes: mins,
            fastest: mins,
            slowest: mins,
            totalDistanceKm: dist > 0 ? dist : 0,
            distanceMoves: dist > 0 ? 1 : 0,
          });
        }
      }

      const driverPerformance = Array.from(driverMap.values())
        .map(d => ({
          name: d.name,
          moverId: d.moverId,
          totalMoves: d.moves,
          avgMinutes: Math.round(d.totalMinutes / d.moves),
          fastestMinutes: d.fastest,
          slowestMinutes: d.slowest,
          totalHours: parseFloat((d.totalMinutes / 60).toFixed(1)),
          avgDistanceKm: d.distanceMoves > 0 ? parseFloat((d.totalDistanceKm / d.distanceMoves).toFixed(1)) : null,
        }))
        .sort((a, b) => b.totalMoves - a.totalMoves);

      // Daily bookings for last 7 days
      const dailyBookings = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const count = allBookings.filter(b => {
          const created = new Date(b.createdAt);
          return created >= date && created < nextDate;
        }).length;
        
        dailyBookings.push({
          date: date.toISOString().split('T')[0],
          count,
        });
      }
      
      res.json({
        overview: {
          totalBookings,
          weeklyBookings,
          monthlyBookings,
          completedBookings: completedCount,
          totalRevenue: totalRevenue.toFixed(2),
          avgBookingValue,
          conversionRate,
        },
        revenue: {
          totalRevenue: revenueFilteredTotal.toFixed(2),
          avgBookingValue: revenueFilteredAvg,
          completedCount: revenueFilteredCount,
          period: revenuePeriod,
        },
        bookings: {
          paid: paidBookings,
          pendingPayment: pendingPaymentBookings,
          failed: failedBookings,
          statusBreakdown,
        },
        users: {
          totalCustomers,
          weeklyNewCustomers,
          totalMovers,
          weeklyNewMovers,
          onlineMovers,
          verifiedMovers,
          liveGpsMovers,
        },
        abandoned: {
          total: totalAbandoned,
          recovered: recoveredAbandoned,
          pending: pendingAbandoned,
          recoveryRate,
        },
        fulfilment: {
          totalTrackedMoves: totalMoves,
          avgMoveMinutes,
          avgMoveHours: parseFloat((avgMoveMinutes / 60).toFixed(1)),
          fastestMoveMinutes: fastestMove,
          slowestMoveMinutes: slowestMove,
          avgCompletedDistanceKm,
          driverPerformance,
          period: fulfilmentPeriod,
        },
        trends: {
          dailyBookings,
        },
        generatedAt: now.toISOString(),
      });
    } catch (error) {
      console.error('[Admin] Growth metrics error:', error);
      res.status(500).json({ error: "Failed to fetch growth metrics" });
    }
  });
  
  // GET /api/admin/abandoned-bookings - Get all abandoned bookings
  app.get("/api/admin/abandoned-bookings", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const abandoned = await db.select()
        .from(abandonedBookings)
        .orderBy(desc(abandonedBookings.createdAt));
      
      res.json(abandoned);
    } catch (error) {
      console.error('[Admin] Get abandoned bookings error:', error);
      res.status(500).json({ error: "Failed to fetch abandoned bookings" });
    }
  });

  // ============================================================
  // ANALYTICS SUMMARY (admin)
  // ============================================================

  app.get("/api/admin/analytics-summary", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const days = parseInt((req.query.days as string) || "7", 10);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const events = await db
        .select()
        .from(analyticsEvents)
        .where(sql`${analyticsEvents.createdAt} >= ${cutoff}`)
        .orderBy(desc(analyticsEvents.createdAt));

      // Page views per page
      const pageViewEvents = events.filter(e => e.eventName === "page_view");
      const pageViewMap: Record<string, number> = {};
      for (const e of pageViewEvents) {
        const props = e.properties ? JSON.parse(e.properties) : {};
        const name = props.page_name ?? e.page ?? "unknown";
        pageViewMap[name] = (pageViewMap[name] ?? 0) + 1;
      }
      const pageViews = Object.entries(pageViewMap)
        .map(([page, views]) => ({ page, views }))
        .sort((a, b) => b.views - a.views);

      // Unique sessions
      const uniqueSessions = new Set(events.map(e => e.sessionId).filter(Boolean)).size;
      const uniqueUsers = new Set(events.map(e => e.userId).filter(Boolean)).size;

      // All event type counts
      const eventCounts: Record<string, number> = {};
      for (const e of events) {
        eventCounts[e.eventName] = (eventCounts[e.eventName] ?? 0) + 1;
      }
      const eventBreakdown = Object.entries(eventCounts)
        .map(([event, count]) => ({ event, count }))
        .sort((a, b) => b.count - a.count);

      // Daily visit trend (page_view events grouped by day)
      const dailyMap: Record<string, number> = {};
      for (const e of pageViewEvents) {
        const day = new Date(e.createdAt).toISOString().slice(0, 10);
        dailyMap[day] = (dailyMap[day] ?? 0) + 1;
      }
      const dailyTrend = Object.entries(dailyMap)
        .map(([date, views]) => ({ date: date.slice(5), views }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Booking funnel from events
      const funnelEvents = ["booking_step_1_locations", "booking_step_2_load_details", "booking_step_3_schedule", "booking_submitted", "payment_completed"];
      const eventFunnel = funnelEvents.map(name => ({
        label: name.replace(/_/g, " "),
        count: eventCounts[name] ?? 0,
      }));

      // Recent events (last 50)
      const recent = events.slice(0, 50).map(e => ({
        id: e.id,
        eventName: e.eventName,
        page: e.page,
        sessionId: e.sessionId ? e.sessionId.slice(0, 8) + "…" : null,
        userId: e.userId,
        createdAt: e.createdAt,
      }));

      res.json({
        period: `${days}d`,
        totalEvents: events.length,
        uniqueSessions,
        uniqueUsers,
        pageViews,
        eventBreakdown,
        dailyTrend,
        eventFunnel,
        recent,
      });
    } catch (error) {
      console.error("[Admin] Analytics summary error:", error);
      res.status(500).json({ error: "Failed to fetch analytics summary" });
    }
  });

  // ============================================================
  // ANALYTICS EVENT BEACON
  // ============================================================

  app.post("/api/analytics/event", async (req: Request, res: Response) => {
    try {
      const { eventName, sessionId, page, properties } = req.body;
      if (!eventName || typeof eventName !== "string") {
        return res.status(400).json({ error: "eventName required" });
      }
      const userId = (req.session as any)?.userId ?? null;
      await db.insert(analyticsEvents).values({
        eventName: eventName.slice(0, 100),
        userId: userId ?? undefined,
        sessionId: sessionId ? String(sessionId).slice(0, 100) : undefined,
        page: page ? String(page).slice(0, 200) : undefined,
        properties: properties ? JSON.stringify(properties) : undefined,
      });
      res.json({ ok: true });
    } catch (error) {
      // Silent fail — never block UX for analytics
      res.json({ ok: false });
    }
  });

  // ============================================================
  // OPERATIONS DASHBOARD METRICS
  // ============================================================

  app.get("/api/admin/ops-metrics", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const now = new Date();

      // Fetch raw data from existing tables
      const [allBookings, allMovers, allUsers, allNotifications, allAbandoned, allMetrics] = await Promise.all([
        db.select().from(bookings),
        db.select().from(moversTable),
        db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone }).from(usersTable),
        db.select().from(jobNotifications),
        db.select().from(abandonedBookings),
        db.select().from(bookingMetricsTable),
      ]);

      // Build userId → user lookup for mover name/email resolution
      const userById = new Map(allUsers.map(u => [u.id, u]));

      // ---- BOOKING FUNNEL ----
      // Step 1: Users who visited booking page (abandoned at step 1 OR made it further)
      const abandonedAtStep1 = allAbandoned.filter(a => a.currentStep === 1 || a.currentStep === 2).length;
      const abandonedAtStep2 = allAbandoned.filter(a => a.currentStep === 3).length;
      const totalAbandoned = allAbandoned.length;
      const totalCreatedBookings = allBookings.length;
      const totalPaid = allBookings.filter(b => b.paymentStatus === 'paid' || b.paymentStatus === 'succeeded').length;
      const totalCompleted = allBookings.filter(b => b.status === 'completed').length;
      const totalConfirmed = allBookings.filter(b => ['confirmed', 'in_progress', 'completed'].includes(b.status)).length;
      const totalStarted = totalAbandoned + totalCreatedBookings;

      const funnelSteps = [
        { label: "Started Booking", count: totalStarted },
        { label: "Selected Mover", count: totalAbandoned - abandonedAtStep1 + totalCreatedBookings },
        { label: "Booking Created", count: totalCreatedBookings },
        { label: "Payment Completed", count: totalPaid },
        { label: "Mover Accepted", count: totalConfirmed },
        { label: "Move Completed", count: totalCompleted },
      ];

      // ---- LIVE OPS ----
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const pendingJobs = allBookings.filter(b => b.status === 'pending' && b.paymentStatus === 'paid').length;
      const inProgressJobs = allBookings.filter(b => b.status === 'in_progress').length;
      const pendingMoverAcceptance = allBookings.filter(b => b.status === 'confirmed' && b.moverId).length;
      const onlineMovers = allMovers.filter(m => m.isAvailable).length;
      const liveGpsMovers = allMovers.filter(m => m.isAvailable && m.lastLocationUpdate && new Date(m.lastLocationUpdate) > oneHourAgo).length;
      const unverifiedMovers = allMovers.filter(m => !m.isVerified).length;

      // Active job notifications breakdown
      const pendingNotifications = allNotifications.filter(n => n.status === 'pending').length;
      const acceptedNotifications = allNotifications.filter(n => n.status === 'accepted').length;
      const declinedNotifications = allNotifications.filter(n => n.status === 'declined').length;
      const expiredNotifications = allNotifications.filter(n => n.status === 'expired').length;
      const totalNotifications = allNotifications.length;

      // ---- MOVER PERFORMANCE ----
      // Acceptance rate per mover
      const moverNotifMap: Record<string, { total: number; accepted: number; declined: number; expired: number }> = {};
      for (const n of allNotifications) {
        if (!n.moverId) continue;
        if (!moverNotifMap[n.moverId]) moverNotifMap[n.moverId] = { total: 0, accepted: 0, declined: 0, expired: 0 };
        moverNotifMap[n.moverId].total++;
        if (n.status === 'accepted') moverNotifMap[n.moverId].accepted++;
        else if (n.status === 'declined') moverNotifMap[n.moverId].declined++;
        else if (n.status === 'expired') moverNotifMap[n.moverId].expired++;
      }
      const moverCompletedMap: Record<string, number> = {};
      for (const b of allBookings.filter(b => b.status === 'completed' && b.moverId)) {
        const id = b.moverId!;
        moverCompletedMap[id] = (moverCompletedMap[id] ?? 0) + 1;
      }

      const moverPerf = allMovers.map(m => {
        const notifs = moverNotifMap[m.id] ?? { total: 0, accepted: 0, declined: 0, expired: 0 };
        const completed = moverCompletedMap[m.id] ?? 0;
        const acceptanceRate = notifs.total > 0 ? Math.round((notifs.accepted / notifs.total) * 100) : null;
        const user = userById.get(m.userId);
        return {
          moverId: m.id,
          name: user?.name ?? "Unknown Mover",
          email: user?.email ?? null,
          phone: user?.phone ?? null,
          isAvailable: m.isAvailable,
          isVerified: m.isVerified,
          rating: m.rating ? parseFloat(m.rating) : null,
          totalOffers: notifs.total,
          accepted: notifs.accepted,
          declined: notifs.declined,
          expired: notifs.expired,
          acceptanceRate,
          completedMoves: completed,
        };
      }).filter(m => m.totalOffers > 0 || m.completedMoves > 0)
        .sort((a, b) => (b.completedMoves - a.completedMoves));

      // Aggregate acceptance rate (all movers)
      const aggTotal = allNotifications.length;
      const aggAccepted = allNotifications.filter(n => n.status === 'accepted').length;
      const overallAcceptanceRate = aggTotal > 0 ? Math.round((aggAccepted / aggTotal) * 100) : 0;

      // ---- REVENUE COHORTS (weekly, last 8 weeks) ----
      const cohortMap: Record<string, { week: string; revenue: number; bookings: number; avgValue: number }> = {};
      const paidBookings = allBookings.filter(b => b.paymentStatus === 'paid' || b.paymentStatus === 'succeeded');
      for (const b of paidBookings) {
        const d = new Date(b.createdAt);
        // ISO week start (Monday)
        const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1;
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);
        const key = weekStart.toISOString().slice(0, 10);
        if (!cohortMap[key]) cohortMap[key] = { week: key, revenue: 0, bookings: 0, avgValue: 0 };
        cohortMap[key].revenue += parseFloat(b.price || '0');
        cohortMap[key].bookings++;
      }
      const revenueCohorts = Object.values(cohortMap)
        .sort((a, b) => a.week.localeCompare(b.week))
        .slice(-8)
        .map(c => ({ ...c, revenue: Math.round(c.revenue * 100) / 100, avgValue: c.bookings > 0 ? Math.round((c.revenue / c.bookings) * 100) / 100 : 0 }));

      // ---- ESTIMATION ACCURACY ----
      const metricsWithBoth = allMetrics.filter(m => m.estimatedPrice && m.actualPrice);
      const avgPriceAccuracy = metricsWithBoth.length > 0
        ? Math.round(metricsWithBoth.reduce((s, m) => s + parseFloat(m.priceAccuracyPercent ?? '0'), 0) / metricsWithBoth.length)
        : null;
      const avgVolumeAccuracy = metricsWithBoth.length > 0
        ? Math.round(metricsWithBoth.reduce((s, m) => s + parseFloat(m.volumeAccuracyPercent ?? '0'), 0) / metricsWithBoth.length)
        : null;

      res.json({
        funnel: funnelSteps,
        liveOps: {
          pendingJobs,
          inProgressJobs,
          pendingMoverAcceptance,
          onlineMovers,
          liveGpsMovers,
          unverifiedMovers,
          notifications: { pending: pendingNotifications, accepted: acceptedNotifications, declined: declinedNotifications, expired: expiredNotifications, total: totalNotifications },
          overallAcceptanceRate,
        },
        moverPerformance: moverPerf,
        revenueCohorts,
        aiAccuracy: { avgPriceAccuracy, avgVolumeAccuracy, sampleSize: metricsWithBoth.length },
        generatedAt: now.toISOString(),
      });
    } catch (error) {
      console.error('[Admin] Ops metrics error:', error);
      res.status(500).json({ error: "Failed to fetch ops metrics" });
    }
  });

  const httpServer = createServer(app);
  
  // Initialize WebSocket server for real-time mover notifications
  moverWebSocket.initialize(httpServer);
  
  return httpServer;
}
