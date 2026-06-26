"""
News Pulse — Pipeline Entry Point
Runs scraper → clusterer in sequence.
Called by the Node.js backend via subprocess when POST /ingest/trigger fires.
"""
import sys
import logging
from scraper import ingest
from clusterer import run_clustering

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

if __name__ == "__main__":
    log.info("=== News Pulse pipeline starting ===")
    try:
        new_articles = ingest()
        log.info("Ingested %d new articles", new_articles)
        run_clustering()
        log.info("=== Pipeline complete ===")
        sys.exit(0)
    except Exception as e:
        log.error("Pipeline failed: %s", e, exc_info=True)
        sys.exit(1)
