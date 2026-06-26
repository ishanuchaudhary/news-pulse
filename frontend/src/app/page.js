"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchTimeline,
  fetchCluster,
  triggerIngest,
  pollIngest,
} from "../lib/api";
import Timeline  from "../components/Timeline";
import ClusterPanel from "../components/ClusterPanel";
import SourceFilter from "../components/SourceFilter";
import RefreshButton from "../components/RefreshButton";

const ALL_SOURCES = ["BBC News", "NPR", "Reuters"];

export default function HomePage() {
  const [timelineItems, setTimelineItems]     = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [activeSources, setActiveSources]     = useState(ALL_SOURCES);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState(null);
  const [jobStatus, setJobStatus]             = useState(null);   // "idle" | "running" | "complete" | "failed"
  const pollTimer = useRef(null);

  // ── Load / refresh timeline ───────────────────────────────────────────────
  const loadTimeline = useCallback(async (sources) => {
    setLoading(true);
    setError(null);
    try {
      const { items } = await fetchTimeline(sources);
      setTimelineItems(items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTimeline(activeSources); }, [activeSources, loadTimeline]);

  // ── Source filter toggle ──────────────────────────────────────────────────
  const handleSourceToggle = (source) => {
    setActiveSources(prev =>
      prev.includes(source)
        ? prev.filter(s => s !== source)
        : [...prev, source]
    );
  };

  // ── Cluster detail click ──────────────────────────────────────────────────
  const handleClusterClick = async (clusterId) => {
    try {
      const { cluster } = await fetchCluster(clusterId);
      setSelectedCluster(cluster);
    } catch (e) {
      console.error("Cluster fetch error:", e);
    }
  };

  // ── Ingest / refresh ──────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setJobStatus("running");
    try {
      const { jobId } = await triggerIngest();
      // Poll every 3 s until done
      pollTimer.current = setInterval(async () => {
        const status = await pollIngest(jobId);
        if (status.status === "complete") {
          clearInterval(pollTimer.current);
          setJobStatus("complete");
          await loadTimeline(activeSources);
          setTimeout(() => setJobStatus(null), 3000);
        } else if (status.status === "failed") {
          clearInterval(pollTimer.current);
          setJobStatus("failed");
        }
      }, 3000);
    } catch (e) {
      setJobStatus("failed");
      console.error("Ingest error:", e);
    }
  };

  useEffect(() => () => clearInterval(pollTimer.current), []);

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 font-sans">
      {/* ── Header ── */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            📰 News<span className="text-indigo-400">Pulse</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Topic-clustered live news timeline</p>
        </div>
        <div className="flex items-center gap-4">
          <SourceFilter
            sources={ALL_SOURCES}
            active={activeSources}
            onToggle={handleSourceToggle}
          />
          <RefreshButton onClick={handleRefresh} jobStatus={jobStatus} />
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex h-[calc(100vh-72px)]">
        {/* Timeline panel */}
        <section className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex items-center justify-center h-40 text-gray-400 animate-pulse">
              Loading timeline…
            </div>
          )}
          {error && (
            <div className="rounded bg-red-900/40 border border-red-700 text-red-300 px-4 py-3 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && (
            <Timeline
              items={timelineItems}
              onClusterClick={handleClusterClick}
              selectedId={selectedCluster?.id}
            />
          )}
        </section>

        {/* Detail panel */}
        {selectedCluster && (
          <aside className="w-96 border-l border-gray-800 overflow-auto">
            <ClusterPanel
              cluster={selectedCluster}
              onClose={() => setSelectedCluster(null)}
            />
          </aside>
        )}
      </div>
    </main>
  );
}
