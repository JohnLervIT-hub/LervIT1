#!/bin/bash
set -e
npm install
npx drizzle-kit push --force
# Recreate session table — drizzle-kit push drops it since it's not in the schema
node -e "
const { Pool } = require('./node_modules/pg/lib');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(
  'CREATE TABLE IF NOT EXISTS user_sessions (sid VARCHAR NOT NULL PRIMARY KEY, sess JSON NOT NULL, expire TIMESTAMP(6) NOT NULL)',
  (err) => {
    if (err) { console.error('user_sessions create error:', err.message); }
    pool.query('CREATE INDEX IF NOT EXISTS IDX_session_expire ON user_sessions (expire)', () => pool.end());
  }
);
"
