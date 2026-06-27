// Database connection — Postgres via pg (node-postgres)
import pg from "pg";
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("FATAL: DATABASE_URL environment variable is not set");
  process.exit(1);
}

// Strip any surrounding quotes that may have been added in Render env config
const cleanUrl = connectionString.replace(/^["']|["']$/g, "");

const pool = new Pool({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
});

// Test connection on startup and log result
pool.connect((err, client, release) => {
  if (err) {
    console.error("DB connection failed:", err.message);
  } else {
    client.query("SELECT COUNT(*) FROM clusters", (err2, result) => {
      release();
      if (err2) {
        console.error("DB query test failed:", err2.message);
      } else {
        console.log("DB connected OK — clusters count:", result.rows[0].count);
      }
    });
  }
});

export function getDb() {
  return pool;
}