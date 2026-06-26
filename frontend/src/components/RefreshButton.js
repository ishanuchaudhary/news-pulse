"use client";

export default function RefreshButton({ onClick, jobStatus }) {
  const isRunning = jobStatus === "running";
  const isDone    = jobStatus === "complete";
  const isFailed  = jobStatus === "failed";

  let label = "⟳ Refresh Data";
  let cls   = "bg-indigo-600 hover:bg-indigo-500 text-white";

  if (isRunning) { label = "⏳ Fetching…";  cls = "bg-yellow-700 text-yellow-100 cursor-not-allowed"; }
  if (isDone)    { label = "✓ Updated!";     cls = "bg-green-700 text-green-100 cursor-default"; }
  if (isFailed)  { label = "✗ Failed";       cls = "bg-red-700 text-red-100"; }

  return (
    <button
      onClick={isRunning ? undefined : onClick}
      disabled={isRunning}
      className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${cls}`}
    >
      {label}
    </button>
  );
}
