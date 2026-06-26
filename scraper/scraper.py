"""
News Pulse — RSS Ingestion & Full-Text Extraction
Pulls from BBC, NPR, and Reuters; normalises to a shared schema;
fetches full article body; deduplicates by URL; and persists to SQLite.
"""

import feedparser
import requests
import hashlib
import logging
import sqlite3
import os
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from bs4 import BeautifulSoup
from dateutil import parser as dateparser

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DB_PATH = os.getenv("DB_PATH", "news_pulse.db")

FEEDS = [
    {"name": "BBC News",    "url": "http://feeds.bbci.co.uk/news/rss.xml"},
    {"name": "NPR",         "url": "https://feeds.npr.org/1001/rss.xml"},
    {"name": "Reuters",     "url": "https://feeds.reuters.com/reuters/topNews"},
]

HEADERS = {"User-Agent": "NewsPulse/1.0 (+https://github.com/ishanuchaudhary/news-pulse)"}


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    conn.executescript("""
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
            cluster_id  TEXT REFERENCES clusters(id),
            article_id  TEXT REFERENCES articles(id),
            PRIMARY KEY (cluster_id, article_id)
        );
    """)
    conn.commit()
    conn.close()
    log.info("DB ready at %s", DB_PATH)


def url_hash(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()[:16]


def article_exists(conn, url: str) -> bool:
    row = conn.execute("SELECT 1 FROM articles WHERE url = ?", (url,)).fetchone()
    return row is not None


def save_article(conn, article: dict):
    conn.execute("""
        INSERT OR IGNORE INTO articles
            (id, url, title, summary, body, source, published, fetched_at)
        VALUES
            (:id, :url, :title, :summary, :body, :source, :published, :fetched_at)
    """, article)


# ── Feed parsing ──────────────────────────────────────────────────────────────

def parse_date(entry) -> str:
    """Try every date field feedparser knows about; fall back to now."""
    for attr in ("published_parsed", "updated_parsed"):
        val = getattr(entry, attr, None)
        if val:
            try:
                return datetime(*val[:6], tzinfo=timezone.utc).isoformat()
            except Exception:
                pass
    for raw_attr in ("published", "updated", "dc_date"):
        raw = getattr(entry, raw_attr, None)
        if raw:
            try:
                return dateparser.parse(raw).astimezone(timezone.utc).isoformat()
            except Exception:
                pass
    return datetime.now(timezone.utc).isoformat()


def get_summary(entry) -> str:
    """Different feeds use different fields for the summary/description."""
    for attr in ("summary", "description", "content"):
        val = getattr(entry, attr, None)
        if val:
            if isinstance(val, list):
                val = val[0].get("value", "")
            # Strip HTML tags
            return BeautifulSoup(val, "html.parser").get_text(separator=" ").strip()
    return ""


# ── Full-text extraction ──────────────────────────────────────────────────────

def fetch_body(url: str) -> str:
    """
    Try trafilatura first (best at extracting main content),
    fall back to a BeautifulSoup heuristic, then give up gracefully.
    """
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
        # Remove clutter
        for tag in soup(["script", "style", "nav", "footer", "aside", "header"]):
            tag.decompose()
        # Prefer article/main elements
        for selector in ["article", "main", "[role='main']", ".article-body", ".story-body"]:
            block = soup.select_one(selector)
            if block:
                return block.get_text(separator=" ").strip()
        # Last resort: all <p> tags
        paras = [p.get_text() for p in soup.find_all("p") if len(p.get_text()) > 60]
        return " ".join(paras[:20]).strip()
    except Exception as e:
        log.warning("Body fetch failed for %s: %s", url, e)
        return ""


# ── Main ingestion loop ───────────────────────────────────────────────────────

def ingest():
    init_db()
    conn = get_connection()
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
            if article_exists(conn, url):
                log.debug("Skip (already stored): %s", url)
                continue

            title   = getattr(entry, "title", "").strip()
            summary = get_summary(entry)
            pub     = parse_date(entry)

            log.info("Fetching body: %s", title[:60])
            body = fetch_body(url)

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
            save_article(conn, article)
            new_count += 1

    conn.commit()
    conn.close()
    log.info("Ingestion complete — %d new articles stored.", new_count)
    return new_count


if __name__ == "__main__":
    ingest()
