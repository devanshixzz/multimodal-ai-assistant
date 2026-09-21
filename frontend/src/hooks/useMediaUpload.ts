"use client";

import {
  useCallback,
  useState,
} from "react";

import { uploadMedia } from "../lib/api";
import type { MediaItem } from "../lib/types";

interface UploadState {
  isUploading: boolean;
  progress: number;
  media: MediaItem | null;
  error: string | null;
}

const initialState: UploadState = {
  isUploading: false,
  progress: 0,
  media: null,
  error: null,
};

export function useMediaUpload(
  conversationId?: string
) {
  const [state, setState] =
    useState<UploadState>(initialState);

  const upload = useCallback(
    async (file: File) => {
      setState({
        isUploading: true,
        progress: 0,
        media: null,
        error: null,
      });

      try {
        const result =
          await uploadMedia(
            file,
            conversationId,
            (progress) => {
              setState((previous) => ({
                ...previous,
                progress,
              }));
            }
          );

        if (!result.success || !result.media) {
          throw new Error(
            result.error?.message ||
              "Upload failed."
          );
        }

        setState({
          isUploading: false,
          progress: 100,
          media: result.media,
          error: null,
        });

        return result.media;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to upload file.";

        setState({
          isUploading: false,
          progress: 0,
          media: null,
          error: message,
        });

        return null;
      }
    },
    [conversationId]
  );

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const clearError = useCallback(() => {
    setState((previous) => ({
      ...previous,
      error: null,
    }));
  }, []);

  return {
    ...state,
    upload,
    reset,
    clearError,
  };
}