// MUST be first — sets the process timezone before any Date operations
process.env.TZ = 'America/Edmonton';

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import memorystore from "memorystore";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./vite";
import { pool } from "./db";
import { logger, logEvent } from "./logger";
import { randomBytes } from "crypto";
import { initBackgroundJobs } from "./background-jobs";
import { startAgentWorkers } from "./agents/workers";
import { 
  corsMiddleware, 
  generalApiLimiter, 
  securityHeaders,
  phoneVerificationLimiter,
  authLimiter,
  paymentLimiter
} from "./middleware/security";

const app = express();

// Health check endpoint - registered FIRST, before ANY middleware or env checks
// Cloud Run hits this to verify the container is alive during startup
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

// Verify required environment variables early
if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL environment variable is not set");
  process.exit(1);
}

// In production, SESSION_SECRET is mandatory. In dev we generate an ephemeral
// per-boot secret rather than falling back to a hardcoded literal — a shared
// dev secret becomes universally-known and can slip into a bundled artifact.
// Downside of ephemeral: dev sessions don't survive a restart. Acceptable.
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production');
  }
  process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  console.warn('WARNING: SESSION_SECRET not set — generated an ephemeral one for this dev boot. Sessions will not survive restart.');
}

// Trust the first proxy (Replit's proxy) - required for secure cookies behind a proxy
app.set('trust proxy', 1);

// ===== PERFORMANCE: Gzip/Brotli compression for all responses =====
// Reduces response sizes by 60-80%, significantly improving load times
app.use(compression({
  level: 6, // Balanced compression level (1-9, higher = more compression but slower)
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req, res) => {
    // Don't compress responses with Cache-Control: no-transform
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression's default filter for everything else
    return compression.filter(req, res);
  }
}));

// Session configuration with PostgreSQL store
const PgStore = pgSession(session);

// Determine if we're in production
const isProduction = process.env.NODE_ENV === 'production';

// Create session store with error handling - falls back to memory store so startup never blocks
let sessionStore: any;
try {
  console.log("Initializing PostgreSQL session store...");
  sessionStore = new PgStore({
    pool: pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    errorLog: (error: any) => {
      console.error("Session store error:", error);
    },
  });
  console.log("Session store initialized successfully");
} catch (error) {
  console.error("WARNING: Failed to create PostgreSQL session store, falling back to memory store:", error);
  // Memory store fallback keeps the server alive for health checks even if DB is slow to connect
  const MemoryStore = memorystore(session);
  sessionStore = new MemoryStore({ checkPeriod: 86400000 });
}

// Session configuration
// Use 'auto' for secure which checks req.secure (respects trust proxy setting)
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET!,
  resave: false,
  rolling: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto', // Automatically set based on connection (respects trust proxy)
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000, // 8 hours absolute expiry
    sameSite: 'lax',
  },
  name: 'lervit.sid',
}));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

declare module 'express-session' {
  interface SessionData {
    userId: string;
    userRole: string;
  }
}

// Telnyx voice webhook: capture the exact bytes Telnyx signed. Ed25519
// verification will fail if we re-serialize the parsed JSON (key order /
// whitespace differs from the signed payload). Registered BEFORE express.json
// so express.json short-circuits (it checks req._body which express.raw sets).
// type '*/*' — Telnyx sends application/json but some deployments have seen
// the request lose its content-type before reaching this middleware; matching
// any type guarantees interception on this dedicated webhook path.
app.use('/api/telnyx/voice-webhook', express.raw({ type: '*/*', limit: '2mb' }));

// Upload routes need a higher limit for file data; everything else is capped at 10 MB
app.use(['/api/uploads', '/api/bookings'], express.json({
  limit: '50mb',
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// ===== SECURITY MIDDLEWARE =====
// CORS - restricts cross-origin requests
app.use(corsMiddleware);

// Security headers - prevents clickjacking, XSS, etc.
app.use(securityHeaders);

// Rate limiting - prevents abuse (applied to /api routes)
app.use('/api', generalApiLimiter);

// Stricter rate limiting for auth endpoints (50 req / 15 min — prevents credential stuffing)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// Stricter rate limiting for phone verification (5 req / 15 min — prevents brute-force OTP)
app.use('/api/auth/send-phone-verification', phoneVerificationLimiter);
app.use('/api/auth/verify-phone', phoneVerificationLimiter);

// Pre-signup phone verification rate limiting (Uber-style OTP flow)
app.use('/api/auth/pre-signup/send-code', phoneVerificationLimiter);
app.use('/api/auth/pre-signup/verify-code', phoneVerificationLimiter);

// Stricter rate limiting for payment endpoints (20 req / 15 min — prevents payment abuse)
app.use('/api/bookings/:id/create-payment-intent', paymentLimiter);
app.use('/api/bookings/:id/confirm-payment', paymentLimiter);
app.use('/api/bookings/:id/pay-with-saved-card', paymentLimiter);
app.use('/api/payment-methods/setup-intent', paymentLimiter);
app.use('/api/payment-methods/:id/set-default', paymentLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Set to true inside the server.listen() callback. Used by the
// uncaughtException handler to decide whether to swallow transient errors
// (safe after the server is up) or fail loudly (during startup, where
// swallowing a WebSocket init failure would produce a silent zombie).
let serverStarted = false;

(async () => {
  try {
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      
      logEvent.error('express_error_handler', err, { status, path: _req.path, method: _req.method });

      if (!res.headersSent) {
        res.status(status).json({ message });
      }
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes.
    // Dynamic import + string-based specifier keeps esbuild from bundling
    // ./vite-dev.ts (and the transitive `vite` package) into the prod build.
    if (app.get("env") === "development") {
      const devModule = "./vite-dev.js";
      const { setupVite } = await import(devModule);
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    console.log(`Starting server on port ${port} (NODE_ENV: ${process.env.NODE_ENV || 'development'})...`);
    
    server.listen(port, "0.0.0.0", () => {
      serverStarted = true;
      // console.log first so Railway's log tail flushes it immediately —
      // pino has a small buffer that can hide the "Server ready" line on
      // fast-crashing containers. The structured pino log follows so
      // downstream log processors still see the event.
      console.log(`Server ready on port ${port}`);
      logger.info({ port, env: process.env.NODE_ENV || 'development' }, `Server listening on port ${port}`);

      // Warm up database connections in background (non-blocking)
      // This doesn't block Cloud Run's health check
      setImmediate(async () => {
        try {
          const warmupStart = Date.now();
          await Promise.all([
            pool.query('SELECT 1'),
            pool.query('SELECT COUNT(*) FROM movers WHERE is_available = true'),
          ]);
          const warmupTime = Date.now() - warmupStart;
          logger.info({ warmupTime }, `Database connections warmed up in ${warmupTime}ms`);
        } catch (dbError) {
          logEvent.error('database_connection', dbError);
        }
      });

      // Cron jobs (stale-booking cleanup, payment reminders, orphan recovery, etc.)
      // run inside the web process because the standalone worker service isn't
      // deployed. Set DISABLE_BACKGROUND_JOBS=1 on any instance that shouldn't
      // run them (e.g. if you later split the worker onto its own deploy).
      try {
        initBackgroundJobs();
      } catch (jobErr) {
        logEvent.error('background_jobs_init', jobErr);
      }

      // BullMQ workers for autonomous agents (Alex Morgan, Scout Reid).
      // No-op when REDIS_URL is unset.
      try {
        startAgentWorkers();
      } catch (workerErr) {
        logEvent.error('agent_workers_init', workerErr);
      }
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`FATAL: Port ${port} is already in use`);
      } else {
        console.error("FATAL: Server error:", error);
      }
      process.exit(1);
    });

    // Graceful shutdown handler for production stability
    const gracefulShutdown = (signal: string) => {
      console.log(`\n${signal} received. Initiating graceful shutdown...`);
      
      server.close(() => {
        console.log('HTTP server closed');
        
        // Close database pool
        pool.end().then(() => {
          console.log('Database pool closed');
          process.exit(0);
        }).catch((err) => {
          console.error('Error closing database pool:', err);
          process.exit(1);
        });
      });
      
      // Force shutdown after 30 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error("FATAL: Server initialization failed:", error);
    process.exit(1);
  }
})();

// Global handlers for unhandled errors (prevents process crashes)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Promise Rejection:', reason);
  // Don't exit - log and continue
});

process.on('uncaughtException', (error) => {
  const msg = error?.message ?? '';

  // NEVER swallow errors before the server binds. A "WebSocket" or
  // "ECONNRESET" thrown during registerRoutes / WS init would otherwise
  // be classified as transient and returned from — leaving a zombie
  // process with no HTTP listener, and Railway 502ing every request.
  // See the isTransient block below for the runtime-only carve-out.
  if (!serverStarted) {
    console.error('[FATAL] Uncaught exception during startup (before server.listen fired):', error);
    setTimeout(() => process.exit(1), 500);
    return;
  }

  // Transient infrastructure errors — log and survive. The pool/driver will
  // recover on the next query. Exiting here would cause unnecessary restarts
  // for events that Neon handles automatically (idle timeout, branch suspend,
  // connection limit, WebSocket drop).
  const isTransient =
    msg.includes('FATAL') ||
    msg.includes('WebSocket') ||
    msg.includes('Connection terminated') ||
    msg.includes('connection terminated') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('too many connections');

  if (isTransient) {
    console.error('[WARN] Transient infrastructure error (server will continue):', msg);
    return;
  }

  // Genuinely unknown/fatal — log and exit after flushing
  console.error('[CRITICAL] Uncaught Exception:', error);
  setTimeout(() => process.exit(1), 1000);
});
