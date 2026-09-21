"use client";

import { useMemo, useState } from "react";
import type { MediaItem } from "../lib/types";

interface ComparisonImage {
  image: number;
  mediaId?: string;
  originalName?: string;
}

interface ComparisonResult {
  summary?: string;
  similarities?: string[];
  differences?: string[];
  imageObservations?: Array<{
    image?: number | null;
    observation?: string;
  }>;
  overallInterpretation?: string;
  imagesCompared?: ComparisonImage[];
  failedImages?: Array<{
    image?: number;
    mediaId?: string;
    originalName?: string;
    reason?: string;
  }>;
}

interface ComparisonViewProps {
  media: MediaItem[];
  result: string | null;
  loading: boolean;
  error: string | null;
  onCompare: (mediaIds: string[], question?: string) => void;
}

export default function ComparisonView({
  media,
  result,
  loading,
  error,
  onCompare,
}: ComparisonViewProps) {
  const [zoom, setZoom] = useState(1);
  const [question, setQuestion] = useState("");

  const selectedImages = useMemo(
    () => media.filter((item) => item.media_type === "image"),
    [media]
  );

  const parsedResult = useMemo<ComparisonResult | null>(() => {
    if (!result?.trim()) {
      return null;
    }

    try {
      return JSON.parse(result) as ComparisonResult;
    } catch {
      return null;
    }
  }, [result]);

  const getMediaUrl = (mediaId: string) =>
    `${
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:5000/api"
    }/media/${mediaId}`;

  const getThumbnailUrl = (mediaId: string) =>
    `${
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:5000/api"
    }/media/${mediaId}/thumb`;

  const handleZoomIn = () => {
    setZoom((current) =>
      Math.min(Number((current + 0.25).toFixed(2)), 2)
    );
  };

  const handleZoomOut = () => {
    setZoom((current) =>
      Math.max(Number((current - 0.25).toFixed(2)), 0.5)
    );
  };

  const handleResetZoom = () => {
    setZoom(1);
  };

  const handleCompare = () => {
    const trimmedQuestion = question.trim();

    onCompare(
      selectedImages.map((item) => item.id),
      trimmedQuestion || undefined
    );
  };

  if (selectedImages.length < 2) {
    return null;
  }

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-sm">
              🖼️
            </span>

            <div>
              <h2 className="text-sm font-semibold text-white">
                Image Comparison
              </h2>

              <p className="text-xs text-slate-500">
                {selectedImages.length} images selected
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              className="flex h-8 w-8 items-center justify-center text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              title="Zoom out"
            >
              −
            </button>

            <button
              type="button"
              onClick={handleResetZoom}
              className="h-8 min-w-12 border-x border-slate-800 px-2 text-[11px] font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 2}
              className="flex h-8 w-8 items-center justify-center text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              title="Zoom in"
            >
              +
            </button>
          </div>

          {/* Compare */}
          <button
            type="button"
            onClick={handleCompare}
            disabled={loading}
            className="flex h-8 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Comparing...
              </>
            ) : (
              <>
                <span>✦</span>
                Compare selected
              </>
            )}
          </button>
        </div>
      </div>

      {/* Comparison question */}
      <div className="border-b border-slate-800 px-4 py-4">
        <label
          htmlFor="comparison-question"
          className="mb-2 block text-xs font-medium text-slate-300"
        >
          Comparison question{" "}
          <span className="font-normal text-slate-600">
            (optional)
          </span>
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="comparison-question"
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !loading
              ) {
                event.preventDefault();
                handleCompare();
              }
            }}
            placeholder="e.g. Which image has more visible damage?"
            disabled={loading}
            className="min-h-9 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          />

          <button
            type="button"
            onClick={handleCompare}
            disabled={loading}
            className="min-h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ask comparison
          </button>
        </div>

        <p className="mt-2 text-[10px] text-slate-600">
          Leave this blank for a general similarity and difference
          analysis.
        </p>
      </div>

      {/* Image comparison area */}
      <div className="border-b border-slate-800 p-4">
        <div
          className={`grid gap-4 ${
            selectedImages.length === 2
              ? "grid-cols-1 md:grid-cols-2"
              : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
          }`}
        >
          {selectedImages.map((image, index) => (
            <div
              key={image.id}
              className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
            >
              {/* Image label */}
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-800 text-[10px] font-bold text-slate-300">
                    {index + 1}
                  </span>

                  <span
                    className="truncate text-xs font-medium text-slate-300"
                    title={image.original_name}
                  >
                    {image.original_name}
                  </span>
                </div>

                <a
                  href={getMediaUrl(image.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 shrink-0 text-xs text-slate-500 transition hover:text-blue-400"
                  title="Open original image"
                >
                  ↗
                </a>
              </div>

              {/* Image */}
              <div className="flex min-h-[220px] items-center justify-center overflow-auto bg-slate-950 p-3">
                <img
                  src={getThumbnailUrl(image.id)}
                  alt={`Comparison image ${index + 1}`}
                  className="max-h-[420px] max-w-full rounded-lg object-contain transition-transform duration-200"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center",
                  }}
                />
              </div>

              <div className="border-t border-slate-800 px-3 py-2 text-[10px] text-slate-600">
                Image {index + 1}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-center text-[10px] text-slate-600">
          Zoom is synchronized across all comparison images.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="m-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3">
          <p className="text-xs font-semibold text-red-300">
            Comparison failed
          </p>

          <p className="mt-1 text-xs leading-5 text-red-400/80">
            {error}
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 px-4 py-5">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400/20 border-t-blue-400" />

          <div>
            <p className="text-xs font-medium text-slate-300">
              AI is comparing the selected images...
            </p>

            <p className="mt-1 text-[10px] text-slate-600">
              Looking for similarities, differences and image-specific
              observations.
            </p>
          </div>
        </div>
      )}

      {/* Structured AI result */}
      {!loading && parsedResult && (
        <div className="space-y-5 p-4">
          {/* Summary */}
          {parsedResult.summary && (
            <div>
              <SectionHeading icon="✦" title="Summary" />

              <p className="mt-2 text-sm leading-6 text-slate-300">
                {parsedResult.summary}
              </p>
            </div>
          )}

          {/* Similarities + differences */}
          <div className="grid gap-4 md:grid-cols-2">
            {parsedResult.similarities &&
              parsedResult.similarities.length > 0 && (
                <ResultList
                  title="Similarities"
                  icon="≈"
                  items={parsedResult.similarities}
                  variant="similarity"
                />
              )}

            {parsedResult.differences &&
              parsedResult.differences.length > 0 && (
                <ResultList
                  title="Differences"
                  icon="↔"
                  items={parsedResult.differences}
                  variant="difference"
                />
              )}
          </div>

          {/* Image observations */}
          {parsedResult.imageObservations &&
            parsedResult.imageObservations.length > 0 && (
              <div>
                <SectionHeading
                  icon="◉"
                  title="Image Observations"
                />

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {parsedResult.imageObservations.map(
                    (observation, index) => {
                      if (!observation?.observation) {
                        return null;
                      }

                      const imageNumber =
                        observation.image ?? index + 1;

                      return (
                        <div
                          key={`${imageNumber}-${index}`}
                          className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10 text-[10px] font-bold text-blue-300">
                              {imageNumber}
                            </span>

                            <span className="text-xs font-semibold text-slate-300">
                              Image {imageNumber}
                            </span>
                          </div>

                          <p className="text-xs leading-5 text-slate-400">
                            {observation.observation}
                          </p>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            )}

          {/* Overall interpretation */}
          {parsedResult.overallInterpretation && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <SectionHeading
                icon="◎"
                title="Overall Interpretation"
              />

              <p className="mt-2 text-sm leading-6 text-slate-300">
                {parsedResult.overallInterpretation}
              </p>
            </div>
          )}

          {/* Failed images */}
          {parsedResult.failedImages &&
            parsedResult.failedImages.length > 0 && (
              <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4">
                <p className="text-xs font-semibold text-amber-300">
                  Some images could not be processed
                </p>

                <div className="mt-2 space-y-1">
                  {parsedResult.failedImages.map(
                    (failed, index) => (
                      <p
                        key={`${failed.mediaId || index}`}
                        className="text-[11px] leading-5 text-amber-400/80"
                      >
                        Image {failed.image ?? index + 1}
                        {failed.originalName
                          ? ` — ${failed.originalName}`
                          : ""}
                        {failed.reason
                          ? `: ${failed.reason}`
                          : ""}
                      </p>
                    )
                  )}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Backward-compatible fallback */}
      {!loading && result && !parsedResult && (
        <div className="p-4">
          <SectionHeading icon="✦" title="AI Comparison" />

          <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs leading-5 text-slate-300">
            {result}
          </pre>
        </div>
      )}
    </section>
  );
}

function SectionHeading({
  icon,
  title,
}: {
  icon: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-blue-400">{icon}</span>

      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
        {title}
      </h3>
    </div>
  );
}

function ResultList({
  title,
  icon,
  items,
  variant,
}: {
  title: string;
  icon: string;
  items: string[];
  variant: "similarity" | "difference";
}) {
  const bulletClass =
    variant === "similarity"
      ? "bg-emerald-400"
      : "bg-amber-400";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <SectionHeading icon={icon} title={title} />

      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="flex gap-2 text-xs leading-5 text-slate-400"
          >
            <span
              className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${bulletClass}`}
            />

            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}