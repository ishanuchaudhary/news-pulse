# 📰 News Pulse — Topic-Clustered News Timeline

A full-stack system that pulls live articles from three public RSS feeds, groups related articles into topic clusters using TF-IDF + cosine similarity, and displays the clusters as an interactive Gantt-style timeline.

---

## Architecture

```
/scraper      Python — RSS ingestion, full-text extraction, TF-IDF clustering → SQLite
/backend      Node.js / Express — REST API reading from SQLite, spawns pipeline
/frontend     Next.js / React — interactive timeline + cluster explorer
```

### Where everything runs

| Component | Platform | Notes |
|-----------|----------|-------|
| Frontend  | Vercel   | Automatic deploys from `main` branch |
| Backend   | Render   | Free web service, set `DB_PATH` env var |
| Database  | SQLite file on Render disk (or swap to Neon/Supabase Postgres) | |
| Python pipeline | Triggered on-demand via `POST /ingest/trigger` | Render free tier persists the SQLite file between runs |

---

## News Sources Used

| Source   | Feed URL |
|----------|----------|
| BBC News | http://feeds.bbci.co.uk/news/rss.xml |
| NPR      | https://feeds.npr.org/1001/rss.xml |
| Reuters  | https://feeds.reuters.com/reuters/topNews |

---

## Topic Grouping: TF-IDF + Cosine Similarity

**Approach chosen:** Option B — TF-IDF based grouping.

**Why TF-IDF over keyword overlap?**
Keyword overlap treats every shared word equally; "said" and "Gaza" would count the same. TF-IDF naturally up-weights rare, topic-specific terms and down-weights corpus-wide common words. Cosine similarity on the resulting vectors gives a score in [0, 1] that is stable across articles of different lengths.

**How it works (step by step):**
1. For each article, concatenate: `title + " " + summary + " " + body[:300]`
2. Fit a `TfidfVectorizer` (English stop words removed, unigrams + bigrams, log-scale TF, terms appearing in >90% or only 1 doc are dropped).
3. Compute the full pairwise cosine similarity matrix.
4. Run Union-Find: if `sim[i][j] ≥ SIM_THRESHOLD` (default **0.20**), merge i and j into one cluster.
5. Drop clusters with fewer than `MIN_CLUSTER` (default **2**) articles.
6. Label each cluster with its top 3 mean TF-IDF terms.

**Why threshold = 0.20?**
News articles sharing the same event tend to share 4–6 key noun phrases. On TF-IDF vectors of ~300-word inputs, this produces a cosine score in the 0.15–0.35 range. 0.20 was empirically the best cut-off across a sample run: lower values over-merged unrelated stories; higher values produced mostly singletons.

**One known limitation:**
Short headlines produce very sparse TF-IDF vectors, making similarity scores unreliable. Two articles about the same event with very different wording (e.g. BBC uses "Trump" while NPR says "the President") can end up in different clusters. A semantic embedding model (e.g. `sentence-transformers`) would handle this better, but adds a much heavier dependency.

---

## Quick Start (Local)

```bash
# 1. Scraper
cd scraper
pip install -r requirements.txt
python pipeline.py          # creates news_pulse.db

# 2. Backend
cd ../backend
npm install
cp .env.example .env        # set DB_PATH to scraper/news_pulse.db
npm run dev                 # http://localhost:4000

# 3. Frontend
cd ../frontend
npm install
cp .env.example .env.local  # set NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev                 # http://localhost:3000
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/clusters` | All clusters with article count + time range |
| GET | `/clusters/:id` | Single cluster with all articles (chronological) |
| GET | `/timeline` | Clusters shaped for Gantt chart (`start`, `end`, `intensity`) |
| GET | `/timeline?source=BBC+News,NPR` | Filter by source |
| POST | `/ingest/trigger` | Kick off Python pipeline → returns `{ jobId }` |
| GET | `/ingest/status/:jobId` | Poll pipeline status: `running` / `complete` / `failed` |

---

## Stretch Goals Implemented

- ✅ Visual cluster sizing — `intensity` field (0.2–1.0) drives bar opacity on the timeline
- ✅ Source filter — toggle BBC / NPR / Reuters in real time
- ✅ Live polling — frontend polls `/ingest/status` every 3 s and refreshes timeline on completion

---

## Assumptions Made

- RSS feeds are publicly accessible without authentication.
- "Re-runnable without duplicates" is implemented via URL-based deduplication (SHA-1 hash of URL as primary key).
- The video walkthrough assumption: Loom link is included in the submission email.
- For production, SQLite would be replaced with a hosted Postgres (Neon/Supabase) by swapping `db.js` to use `pg`.
