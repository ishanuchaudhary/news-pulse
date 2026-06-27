// Database connection — Postgres via pg (node-postgres)
import pg from "pg";
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("FATAL: DATABASE_URL environment variable is not set");
  process.exit(1);
}

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
    client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `, (err2, result) => {
      release();
      if (err2) {
        console.error("DB table list failed:", err2.message);
      } else {
        console.log("DB connected OK — all tables visible to Node:");
        result.rows.forEach(r => console.log(`  ${r.table_schema}.${r.table_name}`));
      }
    });
  }
});

export function getDb() {
  return pool;
}