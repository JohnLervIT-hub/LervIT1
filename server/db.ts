import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

function getConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  // Fall back to individual PG env vars (PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT)
  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;
  if (!host || !user || !database) {
    throw new Error(
      "No database connection configured. Set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE.",
    );
  }
  const port = process.env.PGPORT || '5432';
  const encodedPassword = password ? encodeURIComponent(password) : '';
  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}?sslmode=require`;
}

export const pool = new Pool({ connectionString: getConnectionString() });

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
