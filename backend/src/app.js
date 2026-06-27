// News Pulse — Node.js / Express Backend
import express from "express";
import cors    from "cors";
import helmet  from "helmet";
import morgan  from "morgan";
import { clusterRouter   } from "./routes/clusters.js";
import { timelineRouter  } from "./routes/timeline.js";
import { ingestRouter    } from "./routes/ingest.js";

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(morgan("dev"));
app.use(express.json());

app.use("/clusters", clusterRouter);
app.use("/timeline", timelineRouter);
app.use("/ingest",   ingestRouter);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// Temporary debug route — shows first 50 chars of DATABASE_URL so we can verify it's correct
app.get("/debug/env", (_req, res) => {
  const raw = process.env.DATABASE_URL || "NOT SET";
  res.json({
    db_url_preview: raw.slice(0, 60),
    db_url_length: raw.length,
    starts_with_quote: raw.startsWith('"') || raw.startsWith("'"),
  });
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error", detail: err.message });
});

app.listen(PORT, () => console.log(`News Pulse API listening on :${PORT}`));