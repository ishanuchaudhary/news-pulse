// Centralised API helpers — all calls go through here.
// Set NEXT_PUBLIC_API_URL in .env.local to point at your backend.

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function apiFetch(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

/** GET /timeline?source=BBC+News,NPR */
export async function fetchTimeline(sources = []) {
  const qs = sources.length ? `?source=${encodeURIComponent(sources.join(","))}` : "";
  return apiFetch(`/timeline${qs}`);
}

/** GET /clusters */
export async function fetchClusters() {
  return apiFetch("/clusters");
}

/** GET /clusters/:id */
export async function fetchCluster(id) {
  return apiFetch(`/clusters/${id}`);
}

/** POST /ingest/trigger  → { jobId } */
export async function triggerIngest() {
  return apiFetch("/ingest/trigger", { method: "POST" });
}

/** GET /ingest/status/:jobId */
export async function pollIngest(jobId) {
  return apiFetch(`/ingest/status/${jobId}`);
}
