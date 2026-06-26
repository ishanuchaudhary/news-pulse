"""
News Pulse — Topic Clustering
Loads articles from SQLite, computes TF-IDF vectors, groups similar articles
via cosine-similarity thresholding, and writes clusters back to the DB.

Why TF-IDF over keyword overlap?
  Keyword overlap is order-insensitive and ignores term frequency.
  TF-IDF naturally up-weights rare distinguishing words (e.g. "Gaza", "Fed rate")
  and down-weights common ones ("said", "year"). Cosine similarity on TF-IDF vectors
  then gives a principled similarity score in [0,1].

Limitation: Short headlines produce sparse, unreliable vectors. We mitigate this
  by concatenating title + summary + first 300 chars of body before vectorising.
"""

import sqlite3
import uuid
import logging
import os
from datetime import datetime, timezone

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DB_PATH  = os.getenv("DB_PATH", "news_pulse.db")
SIM_THRESHOLD = float(os.getenv("SIM_THRESHOLD", "0.20"))   # articles ≥ this cosine score share a cluster
MIN_CLUSTER   = int(os.getenv("MIN_CLUSTER", "2"))          # singletons are dropped


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def load_articles(conn):
    rows = conn.execute(
        "SELECT id, title, summary, body, source, published FROM articles"
    ).fetchall()
    return [dict(r) for r in rows]


def build_corpus(articles):
    """Concatenate title + summary + truncated body for vectorisation."""
    texts = []
    for a in articles:
        title   = a.get("title")   or ""
        summary = a.get("summary") or ""
        body    = (a.get("body")   or "")[:300]
        texts.append(f"{title} {summary} {body}")
    return texts


def cluster_articles(articles):
    """
    1. Vectorise with TF-IDF (English stop words removed, bigrams included).
    2. Compute full pairwise cosine similarity matrix.
    3. Union-Find to group articles sharing sim ≥ SIM_THRESHOLD.
    Returns list of clusters: [{"label": str, "article_ids": [str]}]
    """
    if not articles:
        return []

    corpus = build_corpus(articles)

    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        max_df=0.9,          # ignore terms in >90 % of docs (too common)
        min_df=2,            # ignore terms in only 1 doc (too rare / typos)
        sublinear_tf=True,   # log-scale TF to reduce impact of very frequent terms
    )
    try:
        tfidf = vectorizer.fit_transform(corpus)
    except ValueError:
        log.warning("TF-IDF fit failed (too few docs?), returning no clusters.")
        return []

    sim = cosine_similarity(tfidf)

    # ── Union-Find ────────────────────────────────────────────────────────────
    n = len(articles)
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

    # ── Collect groups ────────────────────────────────────────────────────────
    groups: dict[int, list[int]] = {}
    for idx in range(n):
        root = find(idx)
        groups.setdefault(root, []).append(idx)

    # ── Generate labels from top TF-IDF terms ────────────────────────────────
    feature_names = vectorizer.get_feature_names_out()
    clusters = []

    for root, indices in groups.items():
        if len(indices) < MIN_CLUSTER:
            continue                          # skip singletons / pairs below threshold

        # Sum TF-IDF scores within the cluster, pick top 3 terms as label
        cluster_matrix = tfidf[indices]
        mean_vec = np.asarray(cluster_matrix.mean(axis=0)).flatten()
        top_idx  = mean_vec.argsort()[::-1][:3]
        label    = " · ".join(feature_names[i] for i in top_idx)

        clusters.append({
            "label":       label.title(),
            "article_ids": [articles[i]["id"] for i in indices],
        })

    log.info("Formed %d clusters from %d articles (threshold=%.2f)",
             len(clusters), n, SIM_THRESHOLD)
    return clusters


def save_clusters(conn, clusters, articles_by_id):
    # Wipe old clusters on each run (fresh re-clustering)
    conn.execute("DELETE FROM cluster_articles")
    conn.execute("DELETE FROM clusters")

    now = datetime.now(timezone.utc).isoformat()
    for c in clusters:
        cid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO clusters (id, label, created_at) VALUES (?, ?, ?)",
            (cid, c["label"], now),
        )
        for aid in c["article_ids"]:
            conn.execute(
                "INSERT INTO cluster_articles (cluster_id, article_id) VALUES (?, ?)",
                (cid, aid),
            )

    conn.commit()
    log.info("Saved %d clusters to DB.", len(clusters))


def run_clustering():
    conn = get_connection()
    articles = load_articles(conn)
    if not articles:
        log.warning("No articles found — run scraper.py first.")
        conn.close()
        return

    articles_by_id = {a["id"]: a for a in articles}
    clusters = cluster_articles(articles)
    save_clusters(conn, clusters, articles_by_id)
    conn.close()


if __name__ == "__main__":
    run_clustering()
