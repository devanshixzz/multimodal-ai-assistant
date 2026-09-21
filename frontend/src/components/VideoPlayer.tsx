"use client";

import { useEffect, useState } from "react";
import {
  analyzeVideo,
  getMediaFramesUrl,
  getMediaThumbnailUrl,
  getMediaUrl,
} from "../lib/api";
import type { MediaItem } from "../lib/types";

interface VideoFrame {
  filename?: string;
  path?: string;
  timestamp?: number;
  timestampSeconds?: number;
  timestampFormatted?: string;
  url?: string;
  description?: string;
}

interface VideoAnalysis {
  mediaId: string;
  originalName: string;
  duration: number;
  framesExtracted: number;
  framesAnalyzed: number;
  summary: string;
  frames: VideoFrame[];
  transcript: string | null;
  transcriptSegments: Array<{
    start?: number;
    end?: number;
    text?: string;
  }>;
  audio: {
    format?: string;
    sampleRate?: number;
    channels?: number;
    size?: number;
  } | null;
}

interface VideoPlayerProps {
  media: MediaItem;
  frames?: VideoFrame[];
  processing?: boolean;
  processingMessage?: string;
  onAnalysisComplete?: (analysis: VideoAnalysis) => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const totalSeconds = Math.max(
    0,
    Math.floor(seconds)
  );

  const minutes = Math.floor(
    totalSeconds / 60
  );

  const remainingSeconds =
    totalSeconds % 60;

  return `${String(minutes).padStart(
    2,
    "0"
  )}:${String(remainingSeconds).padStart(
    2,
    "0"
  )}`;
}

function getFrameTimestamp(
  frame: VideoFrame
) {
  if (
    typeof frame.timestampSeconds ===
    "number"
  ) {
    return frame.timestampSeconds;
  }

  if (
    typeof frame.timestamp === "number"
  ) {
    return frame.timestamp;
  }

  return 0;
}

function getFrameUrl(
  frame: VideoFrame
) {
  if (frame.url) {
    return frame.url;
  }

  if (frame.path) {
    return frame.path;
  }

  if (frame.filename) {
    return getMediaFramesUrl(
      frame.filename
    );
  }

  return "";
}

export default function VideoPlayer({
  media,
  frames,
  processing = false,
  processingMessage = "Processing video...",
  onAnalysisComplete,
}: VideoPlayerProps) {
  const [duration, setDuration] =
    useState(0);

  const [currentTime, setCurrentTime] =
    useState(0);

  const [selectedFrame, setSelectedFrame] =
    useState<VideoFrame | null>(null);

  const [frameList, setFrameList] =
    useState<VideoFrame[]>(
      () => frames ?? []
    );

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [analysisError, setAnalysisError] =
    useState<string | null>(null);

  const [analysis, setAnalysis] =
    useState<VideoAnalysis | null>(null);

  useEffect(() => {
    if (frames) {
      setFrameList(frames);
    }
  }, [frames]);

  const videoUrl =
    getMediaUrl(media.id);

  const thumbnailUrl =
    getMediaThumbnailUrl(media.id);

  const handleLoadedMetadata = (
    event: React.SyntheticEvent<HTMLVideoElement>
  ) => {
    const video = event.currentTarget;

    if (Number.isFinite(video.duration)) {
      setDuration(video.duration);
    }
  };

  const handleTimeUpdate = (
    event: React.SyntheticEvent<HTMLVideoElement>
  ) => {
    setCurrentTime(
      event.currentTarget.currentTime
    );
  };

  const handleFrameClick = (
    frame: VideoFrame
  ) => {
    const timestamp =
      getFrameTimestamp(frame);

    setSelectedFrame(frame);

    const video =
      document.getElementById(
        `video-${media.id}`
      ) as HTMLVideoElement | null;

    if (video) {
      video.currentTime = timestamp;

      video.play().catch(() => {
        // Browser may block programmatic playback.
      });
    }
  };

  const handleAnalyzeVideo =
    async () => {
      if (isAnalyzing || processing) {
        return;
      }

      setIsAnalyzing(true);
      setAnalysisError(null);

      /*
       * Do not clear the previous successful
       * analysis here.
       *
       * If a retry fails, the user should still
       * be able to see the last successful result.
       */
      try {
        const result =
          await analyzeVideo(media.id);

        if (
          !result.success ||
          !result.analysis
        ) {
          throw new Error(
            "The video analysis service returned an invalid response."
          );
        }

        setAnalysis(
          result.analysis
        );

        if (
          result.analysis.frames?.length
        ) {
          setFrameList(
            result.analysis.frames
          );
        }

        onAnalysisComplete?.(
          result.analysis
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to analyze the video.";

        setAnalysisError(message);
      } finally {
        setIsAnalyzing(false);
      }
    };

  const progress =
    duration > 0
      ? Math.min(
          (currentTime / duration) * 100,
          100
        )
      : 0;

  const currentlyProcessing =
    processing || isAnalyzing;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
      {/* Video */}
      <div className="relative bg-black">
        <video
          id={`video-${media.id}`}
          src={videoUrl}
          poster={thumbnailUrl}
          controls
          preload="metadata"
          className="max-h-[600px] w-full object-contain"
          onLoadedMetadata={
            handleLoadedMetadata
          }
          onTimeUpdate={
            handleTimeUpdate
          }
        >
          Your browser does not support video playback.
        </video>

        {/* Processing overlay */}
        {currentlyProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/95 px-5 py-4 text-center shadow-xl">
              <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />

              <p className="text-sm font-medium text-white">
                {isAnalyzing
                  ? "Analyzing video..."
                  : processingMessage}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Extracting frames and analyzing video content.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="px-4 pt-3">
        <div className="h-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>
            {formatTime(currentTime)}
          </span>

          <span>
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Video information + analyze button */}
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-lg">
            🎬
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {media.original_name}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {duration > 0
                ? formatTime(duration)
                : "Video"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAnalyzeVideo}
          disabled={currentlyProcessing}
          className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAnalyzing
            ? "Analyzing..."
            : analysis
              ? "Analyze Again"
              : "Analyze Video"}
        </button>
      </div>

      {/* Analysis error */}
      {analysisError && (
        <div className="mx-4 mb-4 rounded-xl border border-red-900/50 bg-red-950/20 p-3">
          <div className="flex items-start gap-3">
            <span className="text-base">
              ⚠️
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-red-300">
                Video analysis failed
              </p>

              <p className="mt-1 text-xs leading-5 text-red-400/80">
                {analysisError}
              </p>

              <button
                type="button"
                onClick={
                  handleAnalyzeVideo
                }
                disabled={
                  currentlyProcessing
                }
                className="mt-3 rounded-lg border border-red-800/60 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-900/30 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Try again
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setAnalysisError(null)
              }
              className="text-xs text-red-400 transition hover:text-red-200"
              title="Dismiss error"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Analysis result */}
      {analysis && (
        <div className="border-t border-slate-800 px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-300">
              Video Analysis
            </h3>

            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-400">
              Complete
            </span>
          </div>

          <p className="text-sm leading-6 text-slate-300">
            {analysis.summary}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400">
              {analysis.framesExtracted}{" "}
              frames extracted
            </span>

            <span className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400">
              {analysis.framesAnalyzed}{" "}
              frames analyzed
            </span>

            {analysis.transcript && (
              <span className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400">
                Transcript available
              </span>
            )}
          </div>
        </div>
      )}

      {/* Extracted frames */}
      {frameList.length > 0 && (
        <div className="border-t border-slate-800">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-300">
                Extracted Frames
              </h3>

              <p className="mt-0.5 text-[10px] text-slate-600">
                Click a frame to jump to that point
              </p>
            </div>

            <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-500">
              {frameList.length} frames
            </span>
          </div>

          <div className="overflow-x-auto px-4 pb-4">
            <div className="flex min-w-max gap-2">
              {frameList.map(
                (frame, index) => {
                  const timestamp =
                    getFrameTimestamp(
                      frame
                    );

                  const frameUrl =
                    getFrameUrl(frame);

                  return (
                    <button
                      key={`${
                        frame.filename ||
                        index
                      }-${index}`}
                      type="button"
                      onClick={() =>
                        handleFrameClick(
                          frame
                        )
                      }
                      className={`group relative w-28 shrink-0 overflow-hidden rounded-xl border text-left transition ${
                        selectedFrame ===
                        frame
                          ? "border-blue-500 ring-1 ring-blue-500/40"
                          : "border-slate-800 hover:border-slate-600"
                      }`}
                    >
                      {frameUrl ? (
                        <img
                          src={frameUrl}
                          alt={`Frame at ${formatTime(
                            timestamp
                          )}`}
                          className="aspect-video w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex aspect-video items-center justify-center bg-slate-800 text-xl">
                          🎞️
                        </div>
                      )}

                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                        <span className="text-[10px] text-white">
                          {formatTime(
                            timestamp
                          )}
                        </span>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </div>
      )}

      {/* No frames yet */}
      {!currentlyProcessing &&
        frameList.length === 0 && (
          <div className="border-t border-slate-800 px-4 py-4">
            <p className="text-center text-xs text-slate-600">
              Extracted video frames will appear here after processing.
            </p>
          </div>
        )}

      {/* Transcript */}
      {analysis?.transcript && (
        <div className="border-t border-slate-800 px-4 py-4">
          <h3 className="mb-3 text-xs font-semibold text-slate-300">
            Transcript
          </h3>

          <div className="max-h-64 overflow-y-auto rounded-xl bg-slate-950 p-3">
            <p className="whitespace-pre-wrap text-xs leading-5 text-slate-400">
              {analysis.transcript}
            </p>
          </div>
        </div>
      )}

      {/* Selected frame */}
      {selectedFrame && (
        <div className="border-t border-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Selected frame:{" "}
              <span className="font-medium text-slate-200">
                {formatTime(
                  getFrameTimestamp(
                    selectedFrame
                  )
                )}
              </span>
            </p>

            <button
              type="button"
              onClick={() =>
                setSelectedFrame(null)
              }
              className="text-xs text-slate-600 hover:text-slate-300"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}