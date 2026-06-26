// Database connection — SQLite via better-sqlite3
// Switch to pg (node-postgres) for Postgres in production by changing this one file.

import Database from "better-sqlite3";
import path     from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH ||
  path.resolve(__dirname, "../../scraper/news_pulse.db");

let _db;

export function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}
