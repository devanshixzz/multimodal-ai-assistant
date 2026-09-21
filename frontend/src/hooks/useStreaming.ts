"use client";

import { useCallback, useRef, useState } from "react";
import type {
  ChatMessage,
  StreamingDoneEvent,
  StreamingStartEvent,
} from "../lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface StreamingState {
  isStreaming: boolean;
  streamedText: string;
  conversationId: string | null;
  error: string | null;
}

const initialState: StreamingState = {
  isStreaming: false,
  streamedText: "",
  conversationId: null,
  error: null,
};

interface StreamOptions {
  message: string;
  conversationId?: string;
  mediaIds?: string[];
  onToken?: (token: string) => void;
  onDone?: (message: ChatMessage) => void;
}

export function useStreaming() {
  const [state, setState] = useState<StreamingState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async ({
    message,
    conversationId,
    mediaIds = [],
    onToken,
    onDone,
  }: StreamOptions) => {
    if (!message.trim()) {
      setState((previous) => ({
        ...previous,
        error: "Please enter a message.",
      }));
      return null;
    }

    // Stop any previous stream.
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({
      isStreaming: true,
      streamedText: "",
      conversationId: conversationId || null,
      error: null,
    });

    try {
      const params = new URLSearchParams();

      params.set("message", message.trim());

      if (conversationId) {
        params.set("conversationId", conversationId);
      }

      if (mediaIds.length > 0) {
        params.set("mediaIds", mediaIds.join(","));
      }

      const response = await fetch(
        `${API_BASE_URL}/chat/stream?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
          },
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        let errorMessage = `Streaming request failed (${response.status}).`;

        try {
          const errorData = await response.json();
          errorMessage =
            errorData?.error?.message ||
            errorData?.message ||
            errorMessage;
        } catch {
          // Keep the fallback message.
        }

        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error("The streaming response has no body.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let fullText = "";

      const processEvent = (eventBlock: string) => {
        const lines = eventBlock.split("\n");

        let eventType = "message";
        const dataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (dataLines.length === 0) {
          return;
        }

        const dataText = dataLines.join("\n");

        let data: unknown;

        try {
          data = JSON.parse(dataText);
        } catch {
          data = { text: dataText };
        }

        if (eventType === "start") {
          const startData = data as StreamingStartEvent;

          setState((previous) => ({
            ...previous,
            conversationId:
              startData.conversationId || previous.conversationId,
          }));

          return;
        }

        if (eventType === "token") {
          const token =
            typeof data === "object" &&
            data !== null &&
            "text" in data &&
            typeof data.text === "string"
              ? data.text
              : "";

          if (!token) {
            return;
          }

          fullText += token;

          setState((previous) => ({
            ...previous,
            streamedText: fullText,
          }));

          onToken?.(token);

          return;
        }

        if (eventType === "done") {
          const doneData = data as StreamingDoneEvent;

          setState((previous) => ({
            ...previous,
            isStreaming: false,
            streamedText: fullText,
          }));

          if (doneData.message) {
            onDone?.(doneData.message);
          }

          return;
        }

        if (eventType === "error") {
          const errorMessage =
            typeof data === "object" &&
            data !== null &&
            "message" in data &&
            typeof data.message === "string"
              ? data.message
              : "The AI streaming request failed.";

          throw new Error(errorMessage);
        }
      };

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          processEvent(eventBlock);
        }
      }

      // Process anything remaining in the buffer.
      if (buffer.trim()) {
        processEvent(buffer);
      }

      setState((previous) => ({
        ...previous,
        isStreaming: false,
        streamedText: fullText,
      }));

      return fullText;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Failed to stream the AI response.";

      setState((previous) => ({
        ...previous,
        isStreaming: false,
        error: message,
      }));

      return null;
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, []);

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    setState((previous) => ({
      ...previous,
      isStreaming: false,
    }));
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
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
    startStream,
    stopStream,
    reset,
    clearError,
  };
}