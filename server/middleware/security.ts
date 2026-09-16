/**
 * SECURITY MIDDLEWARE MODULE
 * ==========================
 * Production-grade security middleware for LervIT platform.
 * 
 * Components:
 * - CORS: Restricts cross-origin requests to allowed domains
 * - Rate Limiting: Prevents abuse and DDoS attacks
 * - Request validation helpers
 * 
 * Environment Variables Required:
 * - NODE_ENV: 'development' | 'production'
 * - APP_BASE_URL: Production URL (e.g., https://lervit.com)
 */

import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * CORS Configuration
 * Production: Only allow specific domains
 * Development: Allow localhost and Replit URLs
 */
const allowedOrigins = isProduction
  ? [
      'https://lervit.com',
      'https://www.lervit.com',
      'https://app.lervit.com',
      'https://lervit1-production.up.railway.app',
      process.env.APP_BASE_URL,
    ].filter(Boolean) as string[]
  : [
      'http://localhost:5000',
      'http://localhost:3000',
      'http://127.0.0.1:5000',
      /\.replit\.dev$/,
      /\.repl\.co$/,
    ];

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check against allowed origins
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      }
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn({ origin, event: 'cors_blocked' }, 'CORS request blocked');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'stripe-signature'],
});

/**
 * Rate Limiting Configurations
 * Different limits for different endpoint types
 */

// General API rate limit - high enough to support background polling
// The app polls /api/messages/notifications every 5s = 180 req/15min per user
// Plus auth/me, bookings, location updates etc. 1000 req/15min is safe
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 1000 : 5000,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Behind Replit proxy
  skip: (req) => {
    // Skip rate limiting for health checks and session check (called on every page load/navigation)
    // Note: when mounted at /api, req.path is /auth/me (prefix stripped by Express)
    return req.path === '/health' || req.path === '/auth/me' || req.path === '/nova/webhook';
  },
  handler: (req, res) => {
    logger.warn({ 
      ip: req.ip, 
      path: req.path, 
      userId: (req as any).session?.userId,
      event: 'rate_limit_exceeded' 
    }, 'Rate limit exceeded');
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
  },
});

// Stricter limit for actual login/register/OTP endpoints (50 per 15 minutes)
// /api/auth/me is a session check and must NOT use this limiter
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 50 : 500,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Behind Replit proxy
  handler: (req, res) => {
    logger.warn({ 
      ip: req.ip, 
      path: req.path,
      event: 'auth_rate_limit_exceeded' 
    }, 'Auth rate limit exceeded');
    res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  },
});

// Webhook rate limit (more lenient to allow Stripe retries - 50 per minute)
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // Stripe may retry multiple times
  message: { error: 'Too many webhook requests.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Behind Replit proxy
  skip: (req) => {
    // Only apply to webhook endpoints
    return !req.path.includes('webhook');
  },
});

// Payment endpoint rate limit (20 per 15 minutes per user)
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 20 : 200,
  message: { error: 'Too many payment requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Behind Replit proxy
  handler: (req, res) => {
    logger.warn({ 
      ip: req.ip, 
      path: req.path,
      userId: (req as any).session?.userId,
      event: 'payment_rate_limit_exceeded' 
    }, 'Payment rate limit exceeded');
    res.status(429).json({ error: 'Too many payment requests. Please try again later.' });
  },
});

// Phone verification rate limit (5 per 15 minutes - prevent brute force)
export const phoneVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 5 : 50,
  message: { error: 'Too many verification attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Behind Replit proxy
  handler: (req, res) => {
    logger.warn({ 
      ip: req.ip, 
      path: req.path,
      userId: (req as any).session?.userId,
      event: 'phone_verification_rate_limit_exceeded' 
    }, 'Phone verification rate limit exceeded');
    res.status(429).json({ error: 'Too many verification attempts. Please try again later.' });
  },
});

/**
 * Security Headers Middleware
 * Adds essential security headers to all responses
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (isProduction) {
    // HSTS - only in production with HTTPS
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
};

/**
 * Request sanitization - strips potentially dangerous fields from body
 */
export const sanitizeRequest = (fieldsToRemove: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
      for (const field of fieldsToRemove) {
        if (field in req.body) {
          logger.warn({ 
            path: req.path, 
            field,
            event: 'dangerous_field_stripped' 
          }, 'Dangerous field stripped from request');
          delete req.body[field];
        }
      }
    }
    next();
  };
};

/**
 * Ownership validation helper
 * Ensures user can only access their own resources
 */
export const validateOwnership = (
  getUserIdFromResource: (resourceId: string, req: Request) => Promise<number | null>
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = (req as any).session;
      if (!session?.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const resourceId = req.params.id;
      if (!resourceId) {
        return res.status(400).json({ error: 'Resource ID required' });
      }
      
      const resourceOwnerId = await getUserIdFromResource(resourceId, req);
      
      if (resourceOwnerId === null) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      
      if (resourceOwnerId !== parseInt(session.userId, 10)) {
        logger.warn({
          userId: session.userId,
          resourceOwnerId,
          resourceId,
          path: req.path,
          event: 'ownership_violation'
        }, 'Ownership violation attempt');
        return res.status(403).json({ error: 'Access denied' });
      }
      
      next();
    } catch (error) {
      logger.error({ error, path: req.path }, 'Ownership validation error');
      res.status(500).json({ error: 'Validation error' });
    }
  };
};
