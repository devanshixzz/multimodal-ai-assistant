"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMediaUpload } from "../hooks/useMediaUpload";
import type { MediaItem } from "../lib/types";

interface MediaUploaderProps {
  conversationId?: string;
  onUploadComplete?: (media: MediaItem) => void;
  onUploadStart?: () => void;
  disabled?: boolean;
}

const ACCEPTED_TYPES = {
  "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif"],
  "video/*": [".mp4", ".mov", ".avi", ".mkv", ".webm"],
  "audio/*": [".mp3", ".wav", ".m4a", ".ogg", ".webm"],
  "application/pdf": [".pdf"],
};

const MAX_FILE_SIZE = 100 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFileIcon(file: { type: string }) {
  if (file.type.startsWith("image/")) {
    return "🖼️";
  }

  if (file.type.startsWith("video/")) {
    return "🎬";
  }

  if (file.type.startsWith("audio/")) {
    return "🎵";
  }

  if (file.type === "application/pdf") {
    return "📄";
  }

  return "📎";
}

export default function MediaUploader({
  conversationId,
  onUploadComplete,
  onUploadStart,
  disabled = false,
}: MediaUploaderProps) {
  const {
    isUploading,
    progress,
    media,
    error,
    upload,
    reset,
    clearError,
  } = useMediaUpload(conversationId);

  const handleDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (disabled || isUploading) {
        return;
      }

      const file = acceptedFiles[0];

      if (!file) {
        return;
      }

      onUploadStart?.();

      const uploadedMedia = await upload(file);

      if (uploadedMedia) {
        onUploadComplete?.(uploadedMedia);
      }
    },
    [
      disabled,
      isUploading,
      upload,
      onUploadComplete,
      onUploadStart,
    ]
  );

  const handleDropRejected = useCallback(
    (fileRejections: any[]) => {
      clearError();

      const rejection = fileRejections[0];

      if (!rejection) {
        return;
      }

      const firstError = rejection.errors?.[0];

      if (firstError?.code === "file-too-large") {
        return;
      }
    },
    [clearError]
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
  } = useDropzone({
    onDrop: handleDrop,
    onDropRejected: handleDropRejected,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    maxFiles: 1,
    disabled: disabled || isUploading,
  });

  return (
    <div className="w-full">
      {!media && !isUploading && (
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition sm:p-8 ${
            isDragReject
              ? "border-red-500 bg-red-500/5"
              : isDragActive
                ? "border-blue-500 bg-blue-500/5"
                : "border-slate-700 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-900"
          }`}
        >
          <input {...getInputProps()} />

          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-xl">
            {isDragReject ? "⚠️" : isDragActive ? "📥" : "＋"}
          </div>

          {isDragReject ? (
            <>
              <p className="text-sm font-medium text-red-400">
                This file type isn't supported
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Please choose an image, video, audio file, or PDF.
              </p>
            </>
          ) : isDragActive ? (
            <>
              <p className="text-sm font-medium text-blue-400">
                Drop your file here
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Release to start uploading
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-200">
                Drag & drop a file here
              </p>

              <p className="mt-1 text-xs text-slate-500">
                or click to browse from your computer
              </p>

              <p className="mt-3 text-[11px] text-slate-600">
                Images up to 20 MB · Audio up to 50 MB · Video up to 100 MB
              </p>
            </>
          )}
        </div>
      )}

      {isUploading && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              ⬆
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium text-white">
                  Uploading file...
                </p>

                <span className="shrink-0 text-xs text-blue-400">
                  {progress}%
                </span>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {error && !isUploading && (
        <div className="rounded-2xl border border-red-900/50 bg-red-950/20 p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg">⚠️</span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-300">
                Upload failed
              </p>

              <p className="mt-1 text-xs leading-5 text-red-400/80">
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={clearError}
              className="text-xs text-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {media && !isUploading && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-xl">
              {getFileIcon({ type: media.mime_type })}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {media.original_name}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {formatFileSize(media.size)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400">
                Uploaded
              </span>

              <button
                type="button"
                onClick={reset}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-white"
                title="Remove file"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}