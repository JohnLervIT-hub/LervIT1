import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.PGHOST
  ? `postgresql://${process.env.PGUSER}@${process.env.PGHOST}/${process.env.PGDATABASE}?sslmode=require`
  : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString });

pool.on('error', (err) => {
  console.error('[DB Pool] Connection error — will recover on next query:', err.message);
});

export const db = drizzle({ client: pool, schema });
