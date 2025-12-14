import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from "./db";
import { initBackgroundJobs } from "./background-jobs";
import { logger, logEvent } from "./logger";
import { 
  corsMiddleware, 
  generalApiLimiter, 
  securityHeaders 
} from "./middleware/security";

// Verify required environment variables early
if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL environment variable is not set");
  process.exit(1);
}

if (!process.env.SESSION_SECRET) {
  console.warn("WARNING: SESSION_SECRET not set, using default (not recommended for production)");
}

const app = express();

// Trust the first proxy (Replit's proxy) - required for secure cookies behind a proxy
app.set('trust proxy', 1);

// Health check endpoint - MUST be first, before any middleware
// This ensures Cloud Run's health checks respond immediately without session/db overhead
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

// Session configuration with PostgreSQL store
const PgStore = pgSession(session);

// Determine if we're in production
const isProduction = process.env.NODE_ENV === 'production';

// Create session store with error handling
let sessionStore: InstanceType<typeof PgStore>;
try {
  console.log("Initializing PostgreSQL session store...");
  sessionStore = new PgStore({
    pool: pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    errorLog: (error) => {
      console.error("Session store error:", error);
    },
  });
  console.log("Session store initialized successfully");
} catch (error) {
  console.error("FATAL: Failed to create session store:", error);
  console.error("Session store initialization details:", {
    hasPool: !!pool,
    tableName: 'user_sessions',
  });
  process.exit(1);
}

// Session configuration
// Use 'auto' for secure which checks req.secure (respects trust proxy setting)
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'lervit-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto', // Automatically set based on connection (respects trust proxy)
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// ===== SECURITY MIDDLEWARE =====
// CORS - restricts cross-origin requests
app.use(corsMiddleware);

// Security headers - prevents clickjacking, XSS, etc.
app.use(securityHeaders);

// Rate limiting - prevents abuse (applied to /api routes)
app.use('/api', generalApiLimiter);

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
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
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
      logger.info({ port, env: process.env.NODE_ENV || 'development' }, `Server listening on port ${port}`);
      
      // Initialize background jobs immediately (non-blocking)
      initBackgroundJobs();
      
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
  console.error('[CRITICAL] Uncaught Exception:', error);
  // For uncaught exceptions, we should exit after logging
  // But give time for logs to flush
  setTimeout(() => process.exit(1), 1000);
});
