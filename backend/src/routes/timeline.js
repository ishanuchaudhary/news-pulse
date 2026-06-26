// GET /timeline — clusters shaped for a Gantt/swimlane chart library.
// Each item has: id, label, start (ISO), end (ISO), article_count, intensity.
// intensity = article_count normalised to [0.2, 1.0] — drives visual sizing.

import { Router } from "express";
import { getDb }  from "../db.js";

export const timelineRouter = Router();

timelineRouter.get("/", (req, res) => {
  const db = getDb();

  // Optional source filter:  ?source=BBC+News,NPR
  const sourcesParam = req.query.source;
  let sourceFilter = "";
  let bindValues   = [];

  if (sourcesParam) {
    const sources = sourcesParam.split(",").map(s => s.trim()).filter(Boolean);
    if (sources.length) {
      const placeholders = sources.map(() => "?").join(",");
      sourceFilter = `AND a.source IN (${placeholders})`;
      bindValues   = sources;
    }
  }

  const sql = `
    SELECT
      c.id,
      c.label,
      COUNT(DISTINCT ca.article_id)  AS article_count,
      MIN(a.published)               AS start,
      MAX(a.published)               AS end,
      GROUP_CONCAT(DISTINCT a.source) AS sources
    FROM clusters c
    JOIN cluster_articles ca ON ca.cluster_id = c.id
    JOIN articles a          ON a.id = ca.article_id
    ${sourceFilter}
    GROUP BY c.id
    HAVING article_count >= 1
    ORDER BY start DESC
  `;

  const raw = db.prepare(sql).all(...bindValues);

  if (!raw.length) return res.json({ items: [], meta: { max_count: 0 } });

  const maxCount = Math.max(...raw.map(r => r.article_count), 1);

  const items = raw.map(r => ({
    id:            r.id,
    label:         r.label,
    start:         r.start,
    end:           r.end || r.start,
    article_count: r.article_count,
    sources:       r.sources ? r.sources.split(",") : [],
    // intensity: 0.2 → 1.0, used for marker size/opacity on the frontend
    intensity:     0.2 + 0.8 * (r.article_count / maxCount),
  }));

  res.json({ items, meta: { total: items.length, max_count: maxCount } });
});
