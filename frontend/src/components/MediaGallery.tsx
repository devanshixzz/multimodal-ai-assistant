"use client";

import { useEffect, useState } from "react";
import {
  getMediaThumbnailUrl,
} from "../lib/api";
import type { MediaItem } from "../lib/types";

interface MediaGalleryProps {
  media?: MediaItem[];
  selectedMediaIds?: string[];
  onMediaSelect?: (media: MediaItem) => void;
  onMediaOpen?: (media: MediaItem) => void;
  onMediaRemove?: (media: MediaItem) => void;
  compact?: boolean;
}

function getMediaIcon(mediaType: MediaItem["media_type"]) {
  switch (mediaType) {
    case "image":
      return "🖼️";
    case "video":
      return "🎬";
    case "audio":
      return "🎵";
    case "document":
      return "📄";
    default:
      return "📎";
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaGallery({
  media = [],
  selectedMediaIds = [],
  onMediaSelect,
  onMediaOpen,
  onMediaRemove,
  compact = false,
}: MediaGalleryProps) {
  const [items, setItems] = useState<MediaItem[]>(media);

  useEffect(() => {
    setItems(media);
  }, [media]);

  const handleRemove = (item: MediaItem) => {
    setItems((current) =>
      current.filter((mediaItem) => mediaItem.id !== item.id)
    );

    onMediaRemove?.(item);
  };

  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center px-4 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-xl">
          🗂️
        </div>

        <p className="text-sm font-medium text-slate-300">
          No media yet
        </p>

        <p className="mt-1 max-w-[220px] text-xs leading-5 text-slate-500">
          Uploaded images, videos, audio files, and documents will
          appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Gallery header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Session Media
          </h2>

          <p className="mt-0.5 text-[10px] text-slate-500">
            {items.length} {items.length === 1 ? "file" : "files"}
          </p>
        </div>

        {selectedMediaIds.length > 0 && (
          <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-400">
            {selectedMediaIds.length} selected
          </span>
        )}
      </div>

      {/* Gallery content */}
      <div
        className={`min-h-0 flex-1 overflow-y-auto ${
          compact ? "p-2" : "p-3"
        }`}
      >
        <div
          className={
            compact
              ? "grid grid-cols-2 gap-2"
              : "grid grid-cols-2 gap-3"
          }
        >
          {items.map((item) => {
            const isSelected = selectedMediaIds.includes(item.id);
            const isImage = item.media_type === "image";

            return (
              <div
                key={item.id}
                className={`group relative overflow-hidden rounded-xl border transition ${
                  isSelected
                    ? "border-blue-500 ring-1 ring-blue-500/50"
                    : "border-slate-800 hover:border-slate-600"
                }`}
              >
                {/* Click = reference media in chat */}
                <button
                  type="button"
                  onClick={() => onMediaSelect?.(item)}
                  className="block w-full text-left"
                  title={`Reference ${item.original_name}`}
                >
                  {isImage ? (
                    <div className="relative aspect-square overflow-hidden bg-slate-950">
                      <img
                        src={getMediaThumbnailUrl(item.id)}
                        alt={item.original_name}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />

                      {isSelected && (
                        <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                          ✓
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-slate-900">
                      <div className="text-center">
                        <div className="text-2xl">
                          {getMediaIcon(item.media_type)}
                        </div>

                        <p className="mt-2 max-w-[100px] truncate px-2 text-[10px] text-slate-400">
                          {item.original_name}
                        </p>

                        {isSelected && (
                          <div className="mx-auto mt-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                            ✓
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Item details */}
                  <div className="border-t border-slate-800 bg-slate-900/95 p-2">
                    <p className="truncate text-[10px] font-medium text-slate-300">
                      {item.original_name}
                    </p>

                    <p className="mt-0.5 text-[9px] text-slate-600">
                      {formatFileSize(item.size)}
                    </p>
                  </div>
                </button>

                {/* Open inside application */}
                {onMediaOpen && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onMediaOpen(item);
                    }}
                    className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950/80 text-xs text-slate-300 opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-slate-800 hover:text-white"
                    title="Preview media"
                    aria-label={`Preview ${item.original_name}`}
                  >
                    ↗
                  </button>
                )}

                {/* Delete */}
                {onMediaRemove && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemove(item);
                    }}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950/80 text-xs text-slate-400 opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-red-950 hover:text-red-400"
                    title="Remove media"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-800 px-3 py-2">
        <p className="text-center text-[9px] text-slate-600">
          Click a file to reference it · ↗ to preview
        </p>
      </div>
    </div>
  );
}