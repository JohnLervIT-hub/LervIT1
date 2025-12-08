import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from "./db";

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

// Session configuration with PostgreSQL store
const PgStore = pgSession(session);

// Create session store with error handling
let sessionStore: InstanceType<typeof PgStore>;
try {
  sessionStore = new PgStore({
    pool: pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    errorLog: (error) => {
      console.error("Session store error:", error);
    },
  });
} catch (error) {
  console.error("Failed to create session store:", error);
  process.exit(1);
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'lervit-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // Always true since Replit uses HTTPS
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'none', // Required for cross-origin requests (mobile browser to Replit domain)
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
    // Test database connection before starting
    try {
      await pool.query('SELECT 1');
      log("Database connection verified");
    } catch (dbError) {
      console.error("FATAL: Database connection failed:", dbError);
      process.exit(1);
    }

    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
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
    
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
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

  } catch (error) {
    console.error("FATAL: Server initialization failed:", error);
    process.exit(1);
  }
})();
