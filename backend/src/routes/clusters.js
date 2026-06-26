// GET /clusters          — list all clusters
// GET /clusters/:id      — single cluster with articles

import { Router }  from "express";
import { getDb }   from "../db.js";

export const clusterRouter = Router();

clusterRouter.get("/", (_req, res) => {
  const db = getDb();

  const clusters = db.prepare(`
    SELECT
      c.id,
      c.label,
      c.created_at,
      COUNT(ca.article_id)                          AS article_count,
      MIN(a.published)                              AS earliest,
      MAX(a.published)                              AS latest
    FROM clusters c
    JOIN cluster_articles ca ON ca.cluster_id = c.id
    JOIN articles a          ON a.id = ca.article_id
    GROUP BY c.id
    ORDER BY latest DESC
  `).all();

  res.json({ clusters });
});

clusterRouter.get("/:id", (req, res) => {
  const db  = getDb();
  const { id } = req.params;

  const cluster = db.prepare(`
    SELECT id, label, created_at FROM clusters WHERE id = ?
  `).get(id);

  if (!cluster) return res.status(404).json({ error: "Cluster not found" });

  const articles = db.prepare(`
    SELECT a.id, a.title, a.url, a.source, a.summary, a.published
    FROM articles a
    JOIN cluster_articles ca ON ca.article_id = a.id
    WHERE ca.cluster_id = ?
    ORDER BY a.published ASC
  `).all(id);

  res.json({ cluster: { ...cluster, articles } });
});
