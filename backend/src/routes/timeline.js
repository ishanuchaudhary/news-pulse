// GET /timeline — clusters shaped for Gantt chart

import { Router } from "express";
import { getDb }  from "../db.js";

export const timelineRouter = Router();

timelineRouter.get("/", async (req, res) => {
  try {
    const db = getDb();
    const sourcesParam = req.query.source;
    let whereClause = "";
    let values = [];

    if (sourcesParam) {
      const sources = sourcesParam.split(",").map(s => s.trim()).filter(Boolean);
      if (sources.length) {
        const placeholders = sources.map((_, i) => `$${i + 1}`).join(",");
        whereClause = `WHERE a.source IN (${placeholders})`;
        values = sources;
      }
    }

    const { rows } = await db.query(`
      SELECT
        c.id, c.label,
        COUNT(DISTINCT ca.article_id)           AS article_count,
        MIN(a.published)                         AS start,
        MAX(a.published)                         AS "end",
        STRING_AGG(DISTINCT a.source, ',')       AS sources
      FROM clusters c
      JOIN cluster_articles ca ON ca.cluster_id = c.id
      JOIN articles a          ON a.id = ca.article_id
      ${whereClause}
      GROUP BY c.id
      HAVING COUNT(DISTINCT ca.article_id) >= 1
      ORDER BY MIN(a.published) DESC
    `, values);

    if (!rows.length) return res.json({ items: [], meta: { max_count: 0 } });

    const maxCount = Math.max(...rows.map(r => Number(r.article_count)), 1);
    const items = rows.map(r => ({
      id:            r.id,
      label:         r.label,
      start:         r.start,
      end:           r.end || r.start,
      article_count: Number(r.article_count),
      sources:       r.sources ? r.sources.split(",") : [],
      intensity:     0.2 + 0.8 * (Number(r.article_count) / maxCount),
    }));

    res.json({ items, meta: { total: items.length, max_count: maxCount } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
