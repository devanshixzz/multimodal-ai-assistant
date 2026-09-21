"use client";

import { useState } from "react";
import {
  getMediaThumbnailUrl,
  getMediaUrl,
} from "../lib/api";
import type { MediaItem } from "../lib/types";

interface MediaPreviewProps {
  media: MediaItem;
  compact?: boolean;
  onRemove?: () => void;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaPreview({
  media,
  compact = false,
  onRemove,
}: MediaPreviewProps) {
  const [imageError, setImageError] = useState(false);

  const mediaUrl = getMediaUrl(media.id);
  const thumbnailUrl = getMediaThumbnailUrl(media.id);

  const isImage = media.media_type === "image";
  const isVideo = media.media_type === "video";
  const isAudio = media.media_type === "audio";
  const isDocument = media.media_type === "document";

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 ${
        compact ? "w-full max-w-xs" : "w-full"
      }`}
    >
      {/* Image */}
      {isImage && !imageError && (
        <div className="relative bg-slate-950">
          <img
            src={thumbnailUrl}
            alt={media.original_name}
            className={`w-full object-contain ${
              compact ? "max-h-48" : "max-h-[500px]"
            }`}
            onError={() => setImageError(true)}
          />
        </div>
      )}

      {/* Image fallback */}
      {isImage && imageError && (
        <div className="flex h-40 items-center justify-center bg-slate-950">
          <div className="text-center">
            <div className="text-3xl">🖼️</div>
            <p className="mt-2 text-xs text-slate-500">
              Preview unavailable
            </p>
          </div>
        </div>
      )}

      {/* Video */}
      {isVideo && (
        <div className="bg-black">
          <video
            src={mediaUrl}
            poster={thumbnailUrl}
            controls
            preload="metadata"
            className={`w-full ${
              compact ? "max-h-48" : "max-h-[500px]"
            }`}
          >
            Your browser does not support video playback.
          </video>
        </div>
      )}

      {/* Audio */}
      {isAudio && (
        <div className="flex items-center gap-3 bg-slate-950 p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-xl">
            🎵
          </div>

          <div className="min-w-0 flex-1">
            <p className="mb-2 truncate text-sm font-medium text-white">
              {media.original_name}
            </p>

            <audio
              src={mediaUrl}
              controls
              preload="metadata"
              className="h-9 w-full"
            >
              Your browser does not support audio playback.
            </audio>
          </div>
        </div>
      )}

      {/* Document */}
      {isDocument && (
        <div className="flex items-center gap-4 bg-slate-950 p-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-2xl">
            📄
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {media.original_name}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              PDF · {formatFileSize(media.size)}
            </p>

            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300"
            >
              Open document →
            </a>
          </div>
        </div>
      )}

      {/* File information */}
      <div className="flex items-center gap-3 border-t border-slate-800 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-200">
            {media.original_name}
          </p>

          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
            <span>{formatFileSize(media.size)}</span>
            <span>•</span>
            <span className="capitalize">{media.status}</span>
          </div>
        </div>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-red-400"
            title="Remove"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}