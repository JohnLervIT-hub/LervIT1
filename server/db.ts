import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Without this listener, any FATAL error from PostgreSQL (e.g. "too many
// connections", idle timeout, Neon branch auto-suspend) is emitted as an
// unhandled 'error' event on the Pool, which Node.js converts into an
// uncaught exception and crashes the process. Logging it here and letting
// the pool re-establish its connection on the next query is the correct
// recovery strategy for transient Neon WebSocket disconnects.
pool.on('error', (err) => {
  console.error('[DB Pool] Connection error — will recover on next query:', err.message);
});

export const db = drizzle({ client: pool, schema });
