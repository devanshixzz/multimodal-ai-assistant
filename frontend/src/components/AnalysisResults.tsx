"use client";

import type { ReactNode } from "react";

interface AnalysisResultsProps {
  title?: string;
  type?: "image" | "video" | "audio" | "document" | "generic";
  result?: unknown;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
}

function formatLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderValue(value: unknown): ReactNode {
  if (value === null || value === undefined) {
    return (
      <span className="text-slate-600">
        —
      </span>
    );
  }

  if (typeof value === "string" || typeof value === "number") {
    return (
      <span className="whitespace-pre-wrap">
        {String(value)}
      </span>
    );
  }

  if (typeof value === "boolean") {
    return <span>{value ? "Yes" : "No"}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-slate-600">None</span>;
    }

    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div
            key={index}
            className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
          >
            {typeof item === "object" && item !== null
              ? renderObject(item as Record<string, unknown>)
              : renderValue(item)}
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    return renderObject(value as Record<string, unknown>);
  }

  return <span>{String(value)}</span>;
}

function renderObject(object: Record<string, unknown>) {
  return (
    <div className="space-y-3">
      {Object.entries(object).map(([key, value]) => (
        <div key={key}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {formatLabel(key)}
          </p>

          <div className="text-sm leading-6 text-slate-300">
            {renderValue(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function getIcon(type: AnalysisResultsProps["type"]) {
  switch (type) {
    case "image":
      return "🖼️";
    case "video":
      return "🎬";
    case "audio":
      return "🎵";
    case "document":
      return "📄";
    default:
      return "✦";
  }
}

export default function AnalysisResults({
  title = "Analysis Results",
  type = "generic",
  result,
  loading = false,
  error = null,
  emptyMessage = "Analysis results will appear here.",
}: AnalysisResultsProps) {
  return (
    <section className="w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-sm">
          {getIcon(type)}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-white">
            {title}
          </h2>

          <p className="mt-0.5 text-[10px] capitalize text-slate-600">
            {type} analysis
          </p>
        </div>
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="m-4 rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3">
          <p className="text-xs font-medium text-red-300">
            Analysis failed
          </p>

          <p className="mt-1 text-xs leading-5 text-red-400/80">
            {error}
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 px-5 py-8">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />

          <div>
            <p className="text-sm font-medium text-slate-300">
              Analyzing...
            </p>

            <p className="mt-1 text-xs text-slate-600">
              The AI is processing your media.
            </p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && result === undefined && (
        <div className="px-5 py-8 text-center">
          <p className="text-xs text-slate-600">
            {emptyMessage}
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && result !== undefined && (
        <div className="p-5">
          {typeof result === "string" ? (
            <div className="whitespace-pre-wrap text-sm leading-7 text-slate-300">
              {result}
            </div>
          ) : (
            <div className="space-y-4">
              {typeof result === "object" &&
              result !== null &&
              !Array.isArray(result) ? (
                renderObject(
                  result as Record<string, unknown>
                )
              ) : (
                renderValue(result)
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}