"use client";

import { useEffect, useRef, useState } from "react";
import {
  analyzeAudio,
  getMediaUrl,
  type AudioAnalysisResult,
} from "../lib/api";
import type { MediaItem } from "../lib/types";

interface AudioPlayerProps {
  media: MediaItem;
  transcript?: string;
  processing?: boolean;
  processingMessage?: string;
  onAnalysisComplete?: (analysis: AudioAnalysisResult) => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds
  ).padStart(2, "0")}`;
}

export default function AudioPlayer({
  media,
  transcript,
  processing = false,
  processingMessage = "Processing audio...",
  onAnalysisComplete,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const [showTranscript, setShowTranscript] = useState(
    Boolean(transcript)
  );

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] =
    useState<AudioAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const audioUrl = getMediaUrl(media.id);

  useEffect(() => {
    setShowTranscript(Boolean(transcript));
  }, [transcript]);

  const togglePlayback = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;

    if (audio && Number.isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;

    if (audio) {
      setCurrentTime(audio.currentTime);
    }
  };

  const handleSeek = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = Number(event.target.value);
    const audio = audioRef.current;

    setCurrentTime(value);

    if (audio) {
      audio.currentTime = value;
    }
  };

  const handleVolume = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = Number(event.target.value);

    setVolume(value);

    const audio = audioRef.current;

    if (audio) {
      audio.volume = value;
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleAnalyzeAudio = async () => {
    if (isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const response = await analyzeAudio(media.id);

      if (!response.success || !response.analysis) {
        throw new Error("Audio analysis failed.");
      }

      setAnalysis(response.analysis);
      onAnalysisComplete?.(response.analysis);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to analyze audio.";

      setAnalysisError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const progress =
    duration > 0
      ? Math.min((currentTime / duration) * 100, 100)
      : 0;

  const displayedTranscript =
    analysis?.transcript || transcript || "";

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />

      {/* Player */}
      <div className="relative p-5">
        {(processing || isAnalyzing) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
            <div className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4 text-center shadow-xl">
              <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />

              <p className="text-sm font-medium text-white">
                {isAnalyzing
                  ? "Analyzing audio..."
                  : processingMessage}
              </p>

              {isAnalyzing && (
                <p className="mt-1 text-xs text-slate-500">
                  Transcribing and generating AI insights
                </p>
              )}
            </div>
          </div>
        )}

        {/* File information */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-xl">
            🎵
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {media.original_name}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {duration > 0
                ? formatTime(duration)
                : "Audio file"}
            </p>
          </div>

          {analysis && (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-400">
              Analyzed
            </span>
          )}
        </div>

        {/* Seek */}
        <div className="mt-5">
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            onChange={handleSeek}
            disabled={!duration}
            aria-label="Audio progress"
            className="h-1.5 w-full cursor-pointer accent-blue-500 disabled:cursor-default"
            style={{
              background: `linear-gradient(to right, rgb(59 130 246) ${progress}%, rgb(30 41 59) ${progress}%)`,
            }}
          />

          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlayback}
            disabled={processing || isAnalyzing}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "Ⅱ" : "▶"}
          </button>

          <div className="flex flex-1 items-center gap-2">
            <span className="text-xs text-slate-500">
              🔊
            </span>

            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolume}
              aria-label="Volume"
              className="h-1 w-24 cursor-pointer accent-blue-500 sm:w-32"
            />
          </div>

          <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-500">
            {media.status}
          </span>
        </div>

        {/* Analyze button */}
        <button
          type="button"
          onClick={handleAnalyzeAudio}
          disabled={isAnalyzing || processing}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300/30 border-t-blue-300" />
              Analyzing Audio...
            </>
          ) : (
            <>
              ✨
              {analysis ? "Re-analyze Audio" : "Analyze Audio"}
            </>
          )}
        </button>

        {/* Error */}
        {analysisError && (
          <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
            <p className="text-xs font-medium text-red-300">
              Audio analysis failed
            </p>

            <p className="mt-1 text-xs leading-5 text-red-400/80">
              {analysisError}
            </p>
          </div>
        )}
      </div>

      {/* AI Analysis */}
      {analysis && (
        <div className="border-t border-slate-800">
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-300">
                  AI Audio Analysis
                </p>

                <p className="mt-0.5 text-[10px] text-slate-600">
                  Whisper + Gemini
                </p>
              </div>

              {(() => {
                const sentimentValue: unknown = analysis.sentiment;

                const sentimentLabel =
                  typeof sentimentValue === "string"
                    ? sentimentValue
                    : sentimentValue &&
                        typeof sentimentValue === "object" &&
                        "label" in sentimentValue &&
                        typeof sentimentValue.label === "string"
                      ? sentimentValue.label
                      : "Analyzed";

                return (
                  <span
                    className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] text-blue-300"
                    title={
                      sentimentValue &&
                      typeof sentimentValue === "object" &&
                      "explanation" in sentimentValue &&
                      typeof sentimentValue.explanation === "string"
                        ? sentimentValue.explanation
                        : undefined
                    }
                  >
                    {sentimentLabel}
                  </span>
                );
              })()}
            </div>

            {/* Summary */}
            {analysis.summary && (
              <div className="mt-4 rounded-xl bg-slate-950/60 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Summary
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {analysis.summary}
                </p>
              </div>
            )}

            {/* Topics */}
            {analysis.topics?.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Topics
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {((analysis.topics ?? []) as unknown[]).map(
                    (topic, index) => {
                      const topicValue: unknown = topic;

                      const topicLabel =
                        typeof topicValue === "string"
                          ? topicValue
                          : topicValue &&
                              typeof topicValue === "object" &&
                              "label" in topicValue &&
                              typeof topicValue.label === "string"
                            ? topicValue.label
                            : "Unknown topic";

                      const topicExplanation =
                        topicValue &&
                        typeof topicValue === "object" &&
                        "explanation" in topicValue &&
                        typeof topicValue.explanation === "string"
                          ? topicValue.explanation
                          : undefined;

                      return (
                        <span
                          key={`${topicLabel}-${index}`}
                          title={topicExplanation}
                          className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300"
                        >
                          {topicLabel}
                        </span>
                      );
                    }
                  )}
                
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transcript */}
      {displayedTranscript && (
        <div className="border-t border-slate-800">
          <button
            type="button"
            onClick={() =>
              setShowTranscript((previous) => !previous)
            }
            className="flex w-full items-center justify-between px-5 py-3 text-left transition hover:bg-slate-800/50"
          >
            <div>
              <p className="text-xs font-semibold text-slate-300">
                Transcript
              </p>

              <p className="mt-0.5 text-[10px] text-slate-600">
                Whisper transcription
                {analysis?.transcriptSegments?.length
                  ? ` • ${analysis.transcriptSegments.length} segments`
                  : ""}
              </p>
            </div>

            <span className="text-xs text-slate-500">
              {showTranscript ? "▲" : "▼"}
            </span>
          </button>

          {showTranscript && (
            <div className="max-h-72 overflow-y-auto border-t border-slate-800 px-5 py-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">
                {displayedTranscript}
              </p>
            </div>
          )}
        </div>
      )}

      {/* No transcript */}
      {!displayedTranscript && !processing && !isAnalyzing && (
        <div className="border-t border-slate-800 px-5 py-3">
          <p className="text-center text-[10px] text-slate-600">
            Transcript will appear here after audio processing.
          </p>
        </div>
      )}
    </div>
  );
}