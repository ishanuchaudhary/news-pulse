"use client";

export default function SourceFilter({ sources, active, onToggle }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 mr-1">Sources:</span>
      {sources.map(s => (
        <button
          key={s}
          onClick={() => onToggle(s)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
            active.includes(s)
              ? "bg-indigo-600 border-indigo-500 text-white"
              : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-500"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
