// News Pulse — Node.js / Express Backend
// Serves cluster + article data to the Next.js frontend
// and triggers the Python pipeline via subprocess.

import express from "express";
import cors    from "cors";
import helmet  from "helmet";
import morgan  from "morgan";
import { clusterRouter   } from "./routes/clusters.js";
import { timelineRouter  } from "./routes/timeline.js";
import { ingestRouter    } from "./routes/ingest.js";

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(morgan("dev"));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/clusters", clusterRouter);
app.use("/timeline", timelineRouter);
app.use("/ingest",   ingestRouter);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error", detail: err.message });
});

app.listen(PORT, () => console.log(`News Pulse API listening on :${PORT}`));
