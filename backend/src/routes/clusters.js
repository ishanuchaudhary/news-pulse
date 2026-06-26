// GET /clusters       — list all clusters
// GET /clusters/:id   — single cluster with articles

import { Router } from "express";
import { getDb }  from "../db.js";

export const clusterRouter = Router();

clusterRouter.get("/", async (_req, res) => {
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT
        c.id, c.label, c.created_at,
        COUNT(ca.article_id)  AS article_count,
        MIN(a.published)      AS earliest,
        MAX(a.published)      AS latest
      FROM clusters c
      JOIN cluster_articles ca ON ca.cluster_id = c.id
      JOIN articles a          ON a.id = ca.article_id
      GROUP BY c.id
      ORDER BY latest DESC
    `);
    res.json({ clusters: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

clusterRouter.get("/:id", async (req, res) => {
  try {
    const db = getDb();
    const { rows: c } = await db.query(
      "SELECT id, label, created_at FROM clusters WHERE id = $1", [req.params.id]
    );
    if (!c.length) return res.status(404).json({ error: "Cluster not found" });

    const { rows: articles } = await db.query(`
      SELECT a.id, a.title, a.url, a.source, a.summary, a.published
      FROM articles a
      JOIN cluster_articles ca ON ca.article_id = a.id
      WHERE ca.cluster_id = $1
      ORDER BY a.published ASC
    `, [req.params.id]);

    res.json({ cluster: { ...c[0], articles } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
