// Database connection — Postgres via pg (node-postgres)
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export function getDb() {
  return pool;
}
