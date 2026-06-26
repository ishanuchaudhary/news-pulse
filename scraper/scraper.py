"""
News Pulse — RSS Ingestion & Full-Text Extraction
Pulls from BBC, NPR, and Reuters; normalises to a shared schema;
fetches full article body; deduplicates by URL; persists to DB.

Local dev  → SQLite  (set USE_SQLITE=true in .env)
Production → Postgres/Neon (DATABASE_URL in environment)
"""

import feedparser
import requests
import hashlib
import logging
import os
import sqlite3
from datetime import datetime, timezone
from bs4 import BeautifulSoup
from dateutil import parser as dateparser
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

USE_SQLITE = os.getenv("USE_SQLITE", "false").lower() == "true"
DB_PATH    = os.getenv("DB_PATH", "news_pulse.db")

FEEDS = [
    {"name": "BBC News", "url": "http://feeds.bbci.co.uk/news/rss.xml"},
    {"name": "NPR",      "url": "https://feeds.npr.org/1001/rss.xml"},
    {"name": "Reuters",  "url": "https://feeds.reuters.com/reuters/topNews"},
]

HEADERS = {"User-Agent": "NewsPulse/1.0"}


def get_connection():
    if USE_SQLITE:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    else:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        return psycopg2.connect(os.getenv("DATABASE_URL"), cursor_factory=RealDictCursor)


def init_db():
    conn = get_connection()
    cur  = conn.cursor()

    if USE_SQLITE:
        cur.executescript("""
            CREATE TABLE IF NOT EXISTS articles (
                id         TEXT PRIMARY KEY,
                url        TEXT UNIQUE NOT NULL,
                title      TEXT,
                summary    TEXT,
                body       TEXT,
                source     TEXT,
                published  TEXT,
                fetched_at TEXT
            );
            CREATE TABLE IF NOT EXISTS clusters (
                id         TEXT PRIMARY KEY,
                label      TEXT,
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS cluster_articles (
                cluster_id  TEXT,
                article_id  TEXT,
                PRIMARY KEY (cluster_id, article_id)
            );
        """)
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS articles (
                id          TEXT PRIMARY KEY,
                url         TEXT UNIQUE NOT NULL,
                title       TEXT,
                summary     TEXT,
                body        TEXT,
                source      TEXT,
                published   TEXT,
                fetched_at  TEXT
            );
            CREATE TABLE IF NOT EXISTS clusters (
                id          TEXT PRIMARY KEY,
                label       TEXT,
                created_at  TEXT
            );
            CREATE TABLE IF NOT EXISTS cluster_articles (
                cluster_id  TEXT REFERENCES clusters(id) ON DELETE CASCADE,
                article_id  TEXT REFERENCES articles(id) ON DELETE CASCADE,
                PRIMARY KEY (cluster_id, article_id)
            );
        """)

    conn.commit()
    cur.close()
    conn.close()
    log.info("DB ready")


def url_hash(url):
    return hashlib.sha1(url.encode()).hexdigest()[:16]


def article_exists(cur, url):
    cur.execute("SELECT 1 FROM articles WHERE url = ?", (url,)) if USE_SQLITE else \
    cur.execute("SELECT 1 FROM articles WHERE url = %s", (url,))
    return cur.fetchone() is not None


def save_article(cur, article):
    vals = (
        article["id"], article["url"], article["title"], article["summary"],
        article["body"], article["source"], article["published"], article["fetched_at"],
    )
    if USE_SQLITE:
        cur.execute("""
            INSERT OR IGNORE INTO articles
                (id, url, title, summary, body, source, published, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, vals)
    else:
        cur.execute("""
            INSERT INTO articles (id, url, title, summary, body, source, published, fetched_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (url) DO NOTHING
        """, vals)


def parse_date(entry):
    for attr in ("published_parsed", "updated_parsed"):
        val = getattr(entry, attr, None)
        if val:
            try:
                return datetime(*val[:6], tzinfo=timezone.utc).isoformat()
            except Exception:
                pass
    for raw_attr in ("published", "updated"):
        raw = getattr(entry, raw_attr, None)
        if raw:
            try:
                return dateparser.parse(raw).astimezone(timezone.utc).isoformat()
            except Exception:
                pass
    return datetime.now(timezone.utc).isoformat()


def get_summary(entry):
    for attr in ("summary", "description", "content"):
        val = getattr(entry, attr, None)
        if val:
            if isinstance(val, list):
                val = val[0].get("value", "")
            return BeautifulSoup(val, "html.parser").get_text(separator=" ").strip()
    return ""


def fetch_body(url):
    try:
        import trafilatura
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        text = trafilatura.extract(resp.text)
        if text and len(text) > 150:
            return text.strip()
    except Exception as e:
        log.debug("trafilatura failed for %s: %s", url, e)

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "aside"]):
            tag.decompose()
        for selector in ["article", "main", ".article-body"]:
            block = soup.select_one(selector)
            if block:
                return block.get_text(separator=" ").strip()
        paras = [p.get_text() for p in soup.find_all("p") if len(p.get_text()) > 60]
        return " ".join(paras[:20]).strip()
    except Exception as e:
        log.warning("Body fetch failed for %s: %s", url, e)
        return ""


def ingest():
    init_db()
    conn = get_connection()
    cur  = conn.cursor()
    new_count = 0

    for feed_meta in FEEDS:
        log.info("Fetching feed: %s", feed_meta["name"])
        try:
            feed = feedparser.parse(feed_meta["url"])
        except Exception as e:
            log.error("Could not parse feed %s: %s", feed_meta["url"], e)
            continue

        for entry in feed.entries:
            url = getattr(entry, "link", None)
            if not url:
                continue
            if article_exists(cur, url):
                log.debug("Skip (already stored): %s", url)
                continue

            title   = getattr(entry, "title", "").strip()
            summary = get_summary(entry)
            pub     = parse_date(entry)
            log.info("Fetching body: %s", title[:60])
            body    = fetch_body(url)

            article = {
                "id":         url_hash(url),
                "url":        url,
                "title":      title,
                "summary":    summary,
                "body":       body,
                "source":     feed_meta["name"],
                "published":  pub,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
            save_article(cur, article)
            new_count += 1

    conn.commit()
    cur.close()
    conn.close()
    log.info("Ingestion complete — %d new articles stored.", new_count)
    return new_count


if __name__ == "__main__":
    ingest()