"use client";

/**
 * Timeline — Gantt-style swimlane chart built with Recharts.
 *
 * Each cluster becomes a horizontal bar spanning from its earliest article
 * to its latest. Bar height and opacity scale with `intensity` (article count).
 * Click a bar to open the cluster detail panel.
 */

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts";
import { format, parseISO, differenceInMinutes } from "date-fns";

const COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316",
  "#eab308","#22c55e","#14b8a6","#06b6d4","#3b82f6",
];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-white mb-1">{d.label}</p>
      <p className="text-gray-300">Articles: {d.article_count}</p>
      <p className="text-gray-400">{format(parseISO(d.start), "MMM d HH:mm")} →</p>
      <p className="text-gray-400">{format(parseISO(d.end),   "MMM d HH:mm")}</p>
      <p className="text-indigo-300 mt-1">{d.sources?.join(", ")}</p>
    </div>
  );
}

export default function Timeline({ items, onClusterClick, selectedId }) {
  // Sort by start date, newest first
  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.start < b.start ? 1 : -1)),
    [items]
  );

  if (!sorted.length) {
    return (
      <div className="flex flex-col items-center justify-center h-60 text-gray-500">
        <span className="text-4xl mb-3">📭</span>
        <p>No clusters yet — click <strong>Refresh</strong> to pull live news.</p>
      </div>
    );
  }

  // Build chart data: one row per cluster.
  // We convert ISO strings to epoch ms for Recharts numerics.
  const chartData = sorted.map((item, i) => {
    const startMs = parseISO(item.start).getTime();
    const endMs   = parseISO(item.end  ).getTime();
    const durMs   = Math.max(endMs - startMs, 60_000); // minimum 1 min bar width

    return {
      ...item,
      // Recharts stacked bar: [offset from 0, duration]
      // We render a transparent bar for the offset, then a visible bar for duration.
      offset:   startMs,
      duration: durMs,
      color:    COLORS[i % COLORS.length],
    };
  });

  const minMs = Math.min(...chartData.map(d => d.offset));
  const maxMs = Math.max(...chartData.map(d => d.offset + d.duration));

  const tickFormatter = (ms) => format(new Date(ms), "MMM d");
  const labelFormatter = (label) => {
    const item = chartData.find(d => d.label === label);
    return item ? item.label : label;
  };

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-4">
        Topic Timeline — {sorted.length} clusters
      </h2>

      <ResponsiveContainer width="100%" height={sorted.length * 42 + 60}>
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 0, right: 20, left: 160, bottom: 20 }}
          barSize={20}
        >
          <XAxis
            type="number"
            domain={[minMs, maxMs]}
            tickFormatter={tickFormatter}
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            axisLine={{ stroke: "#374151" }}
            tickLine={{ stroke: "#374151" }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={155}
            tick={{ fill: "#e5e7eb", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={l => l.length > 22 ? l.slice(0, 21) + "…" : l}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Invisible spacer bar so the visible bar starts at the right offset */}
          <Bar dataKey="offset" stackId="a" fill="transparent" radius={0} />

          {/* Visible duration bar */}
          <Bar
            dataKey="duration"
            stackId="a"
            radius={[3, 3, 3, 3]}
            cursor="pointer"
            onClick={(d) => onClusterClick(d.id)}
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.id}
                fill={entry.color}
                fillOpacity={selectedId === entry.id ? 1 : entry.intensity * 0.75 + 0.1}
                stroke={selectedId === entry.id ? "#fff" : "transparent"}
                strokeWidth={selectedId === entry.id ? 1.5 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="text-xs text-gray-600 text-center mt-2">
        Click any cluster bar to explore its articles →
      </p>
    </div>
  );
}
