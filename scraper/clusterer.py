"""
News Pulse — Topic Clustering
TF-IDF + cosine similarity + Union-Find grouping.

Local dev  → SQLite  (set USE_SQLITE=true in .env)
Production → Postgres/Neon (DATABASE_URL in environment)
"""

import os
import uuid
import sqlite3
import logging
from datetime import datetime, timezone
from dotenv import load_dotenv

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

load_dotenv()
log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

USE_SQLITE    = os.getenv("USE_SQLITE", "false").lower() == "true"
DB_PATH       = os.getenv("DB_PATH", "news_pulse.db")
SIM_THRESHOLD = float(os.getenv("SIM_THRESHOLD", "0.20"))
MIN_CLUSTER   = int(os.getenv("MIN_CLUSTER", "2"))


def get_connection():
    if USE_SQLITE:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    else:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        return psycopg2.connect(os.getenv("DATABASE_URL"), cursor_factory=RealDictCursor)


def load_articles(cur):
    cur.execute("SELECT id, title, summary, body, source, published FROM articles")
    return [dict(r) for r in cur.fetchall()]


def build_corpus(articles):
    texts = []
    for a in articles:
        title   = a.get("title")   or ""
        summary = a.get("summary") or ""
        body    = (a.get("body")   or "")[:300]
        texts.append(f"{title} {summary} {body}")
    return texts


def cluster_articles(articles):
    if not articles:
        return []

    corpus = build_corpus(articles)
    vectorizer = TfidfVectorizer(
        stop_words="english", ngram_range=(1, 2),
        max_df=0.9, min_df=2, sublinear_tf=True,
    )
    try:
        tfidf = vectorizer.fit_transform(corpus)
    except ValueError:
        log.warning("TF-IDF fit failed — too few docs")
        return []

    sim = cosine_similarity(tfidf)
    n   = len(articles)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in range(i + 1, n):
            if sim[i, j] >= SIM_THRESHOLD:
                union(i, j)

    groups = {}
    for idx in range(n):
        groups.setdefault(find(idx), []).append(idx)

    feature_names = vectorizer.get_feature_names_out()
    clusters = []

    for root, indices in groups.items():
        if len(indices) < MIN_CLUSTER:
            continue
        cluster_matrix = tfidf[indices]
        mean_vec = np.asarray(cluster_matrix.mean(axis=0)).flatten()
        top_idx  = mean_vec.argsort()[::-1][:3]
        label    = " · ".join(feature_names[i] for i in top_idx)
        clusters.append({
            "label":       label.title(),
            "article_ids": [articles[i]["id"] for i in indices],
        })

    log.info("Formed %d clusters from %d articles", len(clusters), n)
    return clusters


def save_clusters(cur, clusters):
    if USE_SQLITE:
        cur.execute("DELETE FROM cluster_articles")
        cur.execute("DELETE FROM clusters")
    else:
        cur.execute("DELETE FROM cluster_articles")
        cur.execute("DELETE FROM clusters")

    now = datetime.now(timezone.utc).isoformat()

    for c in clusters:
        cid = str(uuid.uuid4())
        if USE_SQLITE:
            cur.execute(
                "INSERT INTO clusters (id, label, created_at) VALUES (?, ?, ?)",
                (cid, c["label"], now),
            )
            for aid in c["article_ids"]:
                cur.execute(
                    "INSERT INTO cluster_articles (cluster_id, article_id) VALUES (?, ?)",
                    (cid, aid),
                )
        else:
            cur.execute(
                "INSERT INTO clusters (id, label, created_at) VALUES (%s, %s, %s)",
                (cid, c["label"], now),
            )
            for aid in c["article_ids"]:
                cur.execute(
                    "INSERT INTO cluster_articles (cluster_id, article_id) VALUES (%s, %s)",
                    (cid, aid),
                )

    log.info("Saved %d clusters", len(clusters))


def run_clustering():
    conn = get_connection()
    cur  = conn.cursor()
    articles = load_articles(cur)

    if not articles:
        log.warning("No articles — run scraper first")
        cur.close()
        conn.close()
        return

    clusters = cluster_articles(articles)
    save_clusters(cur, clusters)
    conn.commit()
    cur.close()
    conn.close()


if __name__ == "__main__":
    run_clustering()