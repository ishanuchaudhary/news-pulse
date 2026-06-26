"use client";

import { format, parseISO } from "date-fns";

const SOURCE_COLORS = {
  "BBC News": "bg-red-900 text-red-300",
  "NPR":      "bg-blue-900 text-blue-300",
  "Reuters":  "bg-orange-900 text-orange-300",
};

function SourceBadge({ source }) {
  const cls = SOURCE_COLORS[source] || "bg-gray-700 text-gray-300";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {source}
    </span>
  );
}

export default function ClusterPanel({ cluster, onClose }) {
  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-white leading-snug">
          {cluster.label}
        </h2>
        <button
          onClick={onClose}
          className="shrink-0 text-gray-500 hover:text-white transition-colors text-lg leading-none"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <p className="text-xs text-gray-400">
        {cluster.articles?.length} articles
      </p>

      {/* Articles */}
      <ul className="space-y-4">
        {cluster.articles?.map(article => (
          <li
            key={article.id}
            className="group rounded-lg bg-gray-900 border border-gray-800 p-3 hover:border-indigo-500 transition-colors"
          >
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <p className="text-sm font-medium text-gray-100 group-hover:text-indigo-300 transition-colors leading-snug mb-2">
                {article.title}
              </p>

              <div className="flex items-center justify-between gap-2">
                <SourceBadge source={article.source} />
                <time className="text-[10px] text-gray-500 shrink-0">
                  {article.published
                    ? format(parseISO(article.published), "MMM d, HH:mm")
                    : "Unknown date"}
                </time>
              </div>

              {article.summary && (
                <p className="text-[11px] text-gray-500 mt-2 line-clamp-2">
                  {article.summary}
                </p>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
