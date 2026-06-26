// POST /ingest/trigger  — kick off the Python pipeline as a child process
// GET  /ingest/status/:jobId — poll job progress

import { Router }      from "express";
import { spawn }       from "child_process";
import { randomUUID }  from "crypto";
import path            from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ingestRouter = Router();

// In-memory job store (replace with Redis or DB for multi-instance deploys)
const jobs = new Map();

// Resolve path to Python pipeline
const PIPELINE_SCRIPT = path.resolve(__dirname, "../../../scraper/pipeline.py");
const PYTHON_BIN      = process.env.PYTHON_BIN || "python3";

ingestRouter.post("/trigger", (_req, res) => {
  const jobId  = randomUUID();
  const startedAt = new Date().toISOString();

  jobs.set(jobId, { status: "running", startedAt, log: [] });

  res.status(202).json({ jobId, status: "running", startedAt });

  // Spawn Python pipeline as a non-blocking subprocess
  const child = spawn(PYTHON_BIN, [PIPELINE_SCRIPT], {
    env: { ...process.env },
    cwd: path.resolve(__dirname, "../../../scraper"),
  });

  child.stdout.on("data", chunk => {
    const line = chunk.toString().trim();
    console.log(`[pipeline:${jobId}]`, line);
    jobs.get(jobId).log.push(line);
  });

  child.stderr.on("data", chunk => {
    const line = chunk.toString().trim();
    console.error(`[pipeline:${jobId}]`, line);
    jobs.get(jobId).log.push(`ERR: ${line}`);
  });

  child.on("close", code => {
    const job = jobs.get(jobId);
    job.status      = code === 0 ? "complete" : "failed";
    job.completedAt = new Date().toISOString();
    job.exitCode    = code;
    console.log(`[pipeline:${jobId}] exited with code ${code}`);
  });

  // Auto-clean up job record after 1 hour
  setTimeout(() => jobs.delete(jobId), 60 * 60 * 1000);
});

ingestRouter.get("/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ jobId: req.params.jobId, ...job });
});
