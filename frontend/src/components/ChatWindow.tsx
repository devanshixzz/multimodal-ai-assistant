"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import ChatMessage from "./ChatMessage";

import { useChat } from "../hooks/useChat";
import { useStreaming } from "../hooks/useStreaming";

import {
  analyzeAudio,
  analyzeComparison,
  analyzeDocument,
  analyzeVideo,
} from "../lib/api";

import type {
  ChatMessage as ChatMessageType,
  MediaItem,
} from "../lib/types";

/**
 * Convert any document-analysis value into a React-safe display string.
 * Gemini can return structured values such as { page, content } even when
 * the nominal field is expected to be text. Never render those objects
 * directly as React children.
 */
function formatDocumentText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (
          item &&
          typeof item === "object" &&
          "content" in item
        ) {
          const page =
            "page" in item &&
            (item as { page?: unknown }).page != null
              ? String((item as { page?: unknown }).page)
              : String(index + 1);

          const content = formatDocumentText(
            (item as { content?: unknown }).content
          );

          return `Page ${page}\n${content}`.trim();
        }

        return formatDocumentText(item);
      })
      .filter(Boolean)
      .join("\n\n");
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function formatDocumentField(
  value: unknown,
  fallback = ""
): string {
  const formatted = formatDocumentText(value).trim();
  return formatted || fallback;
}

interface ChatWindowProps {
  conversationId?: string;
  selectedMediaIds?: string[];
  selectedMedia?: MediaItem[];
  onConversationCreated?: (
    conversationId: string
  ) => void;
  onNavigateToMedia?: (mediaId: string) => void;
  onNavigateToCompare?: () => void;
}

export default function ChatWindow({
  conversationId,
  selectedMediaIds = [],
  selectedMedia = [],
  onConversationCreated,
  onNavigateToMedia,
  onNavigateToCompare,
}: ChatWindowProps) {
  const {
    state,
    dispatch,
    sendMessage,
    clearError,
    openConversation,
  } = useChat();

  const {
    messages,
    isLoading,
    isSending,
    error,
  } = state;

  const {
    isStreaming,
    streamedText,
    startStream,
    stopStream,
    error: streamingError,
  } = useStreaming();

  const [input, setInput] = useState("");

  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  const textareaRef =
    useRef<HTMLTextAreaElement>(null);

  /*
   * --------------------------------------------------
   * MEDIA ACTION STATE
   * --------------------------------------------------
   */

  /*
   * Some audio containers, especially .m4a, can be reported by
   * a browser/backend as a generic MP4/video MIME type. The file
   * extension is therefore used as a fallback, with audio taking
   * priority over video.
   */
  const getFileExtension = (media: MediaItem) => {
    const name =
      media.original_name ||
      media.filename ||
      "";

    const cleanName =
      name.split("?")[0].split("#")[0];

    const lastDot =
      cleanName.lastIndexOf(".");

    return lastDot >= 0
      ? cleanName
          .slice(lastDot + 1)
          .toLowerCase()
      : "";
  };

  const isAudioMedia = (media: MediaItem) => {
    const mime =
      media.mime_type?.toLowerCase() || "";

    const extension =
      getFileExtension(media);

    return (
      mime.startsWith("audio/") ||
      [
        "m4a",
        "mp3",
        "wav",
        "aac",
        "flac",
        "ogg",
        "oga",
        "opus",
      ].includes(extension) ||
      media.media_type === "audio"
    );
  };

  const isVideoMedia = (media: MediaItem) => {
    const mime =
      media.mime_type?.toLowerCase() || "";

    return (
      !isAudioMedia(media) &&
      (media.media_type === "video" ||
        mime.startsWith("video/"))
    );
  };

  const isDocumentMedia = (media: MediaItem) => {
    const mime =
      media.mime_type?.toLowerCase() || "";

    return (
      media.media_type === "document" ||
      mime === "application/pdf"
    );
  };

  const isImageMedia = (media: MediaItem) => {
    const mime =
      media.mime_type?.toLowerCase() || "";

    return (
      media.media_type === "image" ||
      mime.startsWith("image/")
    );
  };

  /*
   * Each media type is detected independently.
   *
   * Multiple media types can be selected at the same time.
   * For example:
   *   audio + video + document
   *
   * In that case the composer should expose all applicable
   * actions instead of letting one media type suppress another.
   */
  const selectedAudio =
    selectedMedia.find(isAudioMedia) ?? null;

  const selectedVideo =
    selectedMedia.find(isVideoMedia) ?? null;

  const selectedDocument =
    selectedMedia.find(isDocumentMedia) ?? null;

  const selectedImages =
    selectedMedia.filter(isImageMedia);

  const selectedImageIds =
    selectedImages.map(
      (media) => media.id
    );

  /*
   * --------------------------------------------------
   * VIDEO ANALYSIS
   * --------------------------------------------------
   */

  const [
    videoAnalyzing,
    setVideoAnalyzing,
  ] = useState(false);

  const [videoResult, setVideoResult] =
    useState<{
      originalName: string;
      summary: string;
      duration?: number;
      framesExtracted?: number;
      framesAnalyzed?: number;
      transcript?: string | null;
    } | null>(null);

  const [videoError, setVideoError] =
    useState<string | null>(null);

  /*
   * --------------------------------------------------
   * AUDIO ANALYSIS
   * --------------------------------------------------
   */

  const [
    audioAnalyzing,
    setAudioAnalyzing,
  ] = useState(false);

  const [audioResult, setAudioResult] =
    useState<{
      originalName: string;
      transcript: string | null;
      transcriptSegments: Array<{
        start?: number;
        end?: number;
        text?: string;
      }>;
      summary: string;
      topics: string[];
      sentiment: string;
    } | null>(null);

  const [audioError, setAudioError] =
    useState<string | null>(null);

  /*
   * --------------------------------------------------
   * DOCUMENT ANALYSIS
   * --------------------------------------------------
   */

  const [
    documentAnalyzing,
    setDocumentAnalyzing,
  ] = useState(false);

  const [documentResult, setDocumentResult] =
    useState<{
      originalName: string;
      documentType: string;
      summary: string;
      text: unknown;
      tables: unknown[];
      forms: unknown[];
      keyInformation: unknown;
    } | null>(null);

  const [documentError, setDocumentError] =
    useState<string | null>(null);

  /*
   * --------------------------------------------------
   * IMAGE COMPARISON
   * --------------------------------------------------
   */

  const [
    comparisonLoading,
    setComparisonLoading,
  ] = useState(false);

  const [
    comparisonResult,
    setComparisonResult,
  ] = useState<string | null>(null);

  const [
    comparisonError,
    setComparisonError,
  ] = useState<string | null>(null);

  /*
   * --------------------------------------------------
   * LOAD CONVERSATION
   * --------------------------------------------------
   */

  useEffect(() => {
    if (conversationId) {
      openConversation(
        conversationId
      );
    }
  }, [
    conversationId,
    openConversation,
  ]);

  /*
   * --------------------------------------------------
   * AUTO SCROLL
   * --------------------------------------------------
   */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [
    messages,
    streamedText,
    videoResult,
    audioResult,
    documentResult,
    comparisonResult,
  ]);

  /*
   * --------------------------------------------------
   * CLEAR ERRORS WHEN CONVERSATION CHANGES
   * --------------------------------------------------
   */

  useEffect(() => {
    clearError();

    setVideoResult(null);
    setVideoError(null);

    setAudioResult(null);
    setAudioError(null);

    setDocumentResult(null);
    setDocumentError(null);

    setComparisonResult(null);
    setComparisonError(null);
    setComparisonLoading(false);
  }, [
    conversationId,
    clearError,
  ]);

  /*
   * --------------------------------------------------
   * RESET VIDEO WHEN VIDEO IS DESELECTED
   * --------------------------------------------------
   */

  useEffect(() => {
    if (!selectedVideo) {
      setVideoResult(null);
      setVideoError(null);
      setVideoAnalyzing(false);
    }
  }, [selectedVideo]);

  /*
   * --------------------------------------------------
   * RESET AUDIO WHEN AUDIO IS DESELECTED
   * --------------------------------------------------
   */

  useEffect(() => {
    if (!selectedAudio) {
      setAudioResult(null);
      setAudioError(null);
      setAudioAnalyzing(false);
    }
  }, [selectedAudio]);

  /*
   * --------------------------------------------------
   * RESET DOCUMENT WHEN DOCUMENT IS DESELECTED
   * --------------------------------------------------
   */

  useEffect(() => {
    if (!selectedDocument) {
      setDocumentResult(null);
      setDocumentError(null);
      setDocumentAnalyzing(false);
    }
  }, [selectedDocument]);

  /*
   * --------------------------------------------------
   * RESET COMPARISON WHEN LESS THAN 2 IMAGES
   * --------------------------------------------------
   */

  useEffect(() => {
    if (selectedImageIds.length < 2) {
      setComparisonResult(null);
      setComparisonError(null);
      setComparisonLoading(false);
    }
  }, [
    selectedImageIds.length,
  ]);

  /*
   * --------------------------------------------------
   * VIDEO ANALYSIS
   * --------------------------------------------------
   */

  const handleAnalyzeVideo =
    async () => {
      if (
        !selectedVideo ||
        videoAnalyzing ||
        isSending ||
        isStreaming
      ) {
        return;
      }

      setVideoAnalyzing(true);
      setVideoError(null);
      setVideoResult(null);

      try {
        const response =
          await analyzeVideo(
            selectedVideo.id
          );

        if (
          !response.success ||
          !response.analysis
        ) {
          throw new Error(
            "The video analysis service returned an invalid response."
          );
        }

        /*
         * The backend has already persisted the analysis.
         * Reload the conversation so the saved assistant
         * message becomes part of the normal chat history.
         */
        if (conversationId) {
          await openConversation(
            conversationId
          );
        }

        /*
         * Remove the temporary local result card.
         * The persisted ChatMessage is now responsible
         * for displaying the analysis.
         */
        setVideoResult(null);
      } catch (error) {
        setVideoError(
          error instanceof Error
            ? error.message
            : "Failed to analyze the video."
        );
      } finally {
        setVideoAnalyzing(false);
      }
    };

  /*
   * --------------------------------------------------
   * AUDIO ANALYSIS
   * --------------------------------------------------
   */

  const handleAnalyzeAudio =
    async () => {
      if (
        !selectedAudio ||
        audioAnalyzing ||
        isSending ||
        isStreaming
      ) {
        return;
      }

      setAudioAnalyzing(true);
      setAudioError(null);
      setAudioResult(null);

      try {
        const response =
          await analyzeAudio(
            selectedAudio.id
          );

        if (
          !response.success ||
          !response.analysis
        ) {
          throw new Error(
            "The audio analysis service returned an invalid response."
          );
        }

        /*
         * Reload the persisted analysis message.
         */
        if (conversationId) {
          await openConversation(
            conversationId
          );
        }

        /*
         * The saved ChatMessage now displays
         * the analysis instead of the temporary card.
         */
        setAudioResult(null);
      } catch (error) {
        setAudioError(
          error instanceof Error
            ? error.message
            : "Failed to analyze the audio."
        );
      } finally {
        setAudioAnalyzing(false);
      }
    };

  /*
   * --------------------------------------------------
   * DOCUMENT ANALYSIS
   * --------------------------------------------------
   */

  const handleAnalyzeDocument =
    async () => {
      if (
        !selectedDocument ||
        documentAnalyzing ||
        isSending ||
        isStreaming
      ) {
        return;
      }

      setDocumentAnalyzing(true);
      setDocumentError(null);
      setDocumentResult(null);

      try {
        const response =
          await analyzeDocument(
            selectedDocument.id
          );

        if (
          !response.success ||
          !response.analysis
        ) {
          throw new Error(
            "The document analysis service returned an invalid response."
          );
        }

        /*
         * Reload the persisted analysis message.
         */
        if (conversationId) {
          await openConversation(
            conversationId
          );
        }

        /*
         * The persisted ChatMessage is now
         * responsible for displaying the result.
         */
        setDocumentResult(null);
      } catch (error) {
        setDocumentError(
          error instanceof Error
            ? error.message
            : "Failed to analyze the document."
        );
      } finally {
        setDocumentAnalyzing(false);
      }
    };

  /*
   * --------------------------------------------------
   * IMAGE COMPARISON
   * --------------------------------------------------
   */

  const handleCompareImages =
    async () => {
      if (
        selectedImageIds.length < 2 ||
        comparisonLoading ||
        isSending ||
        isStreaming
      ) {
        return;
      }

      setComparisonLoading(true);
      setComparisonError(null);
      setComparisonResult(null);

      try {
        const response =
          await analyzeComparison(
            selectedImageIds
          );

        if (
          !response.success ||
          !response.analysis
        ) {
          throw new Error(
            "The image comparison service returned an invalid response."
          );
        }

        /*
         * Reload the persisted comparison message.
         */
        if (conversationId) {
          await openConversation(
            conversationId
          );
        }

        /*
         * The saved ChatMessage now displays
         * the comparison result.
         */
        setComparisonResult(null);
      } catch (error) {
        setComparisonError(
          error instanceof Error
            ? error.message
            : "Failed to compare the selected images."
        );
      } finally {
        setComparisonLoading(false);
      }
    };

  /*
   * --------------------------------------------------
   * SUBMIT MESSAGE
   * --------------------------------------------------
   */

  const handleSubmit = async () => {
    const message =
      input.trim();

    if (
      !message ||
      isSending ||
      isStreaming
    ) {
      return;
    }

    setInput("");

    /*
     * --------------------------------------------------
     * TEXT-ONLY CHAT
     * --------------------------------------------------
     */

    if (
      selectedMediaIds.length === 0
    ) {
      const temporaryConversationId =
        conversationId ??
        `temp-conversation-${Date.now()}`;

      const temporaryUserMessage:
        ChatMessageType = {
        id: `temp-user-${Date.now()}`,
        conversation_id:
          temporaryConversationId,
        role: "user",
        content: message,
        media_refs: [],
        metadata: {},
        created_at:
          new Date().toISOString(),
      };

      dispatch({
        type: "ADD_MESSAGE",
        message:
          temporaryUserMessage,
      });

      await startStream({
        message,
        conversationId,
        mediaIds: [],

        onDone: (
          assistantMessage: ChatMessageType
        ) => {
          if (!conversationId) {
            onConversationCreated?.(
              assistantMessage.conversation_id
            );
          }

          openConversation(
            assistantMessage.conversation_id
          );
        },
      });

      return;
    }

    /*
     * --------------------------------------------------
     * MEDIA CHAT
     * --------------------------------------------------
     */

    const result =
      await sendMessage(
        message,
        selectedMediaIds
      );

    if (
      result?.conversationId &&
      !conversationId
    ) {
      onConversationCreated?.(
        result.conversationId
      );
    }
  };

  /*
   * --------------------------------------------------
   * KEYBOARD
   * --------------------------------------------------
   */

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      handleSubmit();
    }
  };

  /*
   * --------------------------------------------------
   * INPUT
   * --------------------------------------------------
   */

  const handleInput = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setInput(
      event.target.value
    );

    const textarea =
      event.target;

    textarea.style.height =
      "auto";

    textarea.style.height =
      `${Math.min(
        textarea.scrollHeight,
        160
      )}px`;
  };

  const displayedError =
    error || streamingError;

  /*
   * --------------------------------------------------
   * RENDER
   * --------------------------------------------------
   */

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-slate-950">

      {/* ------------------------------------------------
          HEADER
      ------------------------------------------------ */}

      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-6">

        <div>

          <h1 className="text-sm font-semibold text-white">
            AI Assistant
          </h1>

          <p className="text-xs text-slate-500">
            Ask questions about your media and documents
          </p>

        </div>

        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-blue-400">

            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />

            Generating...

          </div>
        )}

      </header>

      {/* ------------------------------------------------
          MESSAGES
      ------------------------------------------------ */}

      <div className="min-h-0 flex-1 overflow-y-auto">

        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">

          {/* Loading */}

          {isLoading &&
            messages.length === 0 && (
              <div className="flex items-center justify-center py-20">

                <div className="flex items-center gap-3 text-sm text-slate-400">

                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />

                  Loading conversation...

                </div>

              </div>
            )}

          {/* Empty state */}

          {!isLoading &&
            messages.length === 0 &&
            !isStreaming && (
              <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">

                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-2xl">
                  ✦
                </div>

                <h2 className="text-xl font-semibold text-white">
                  How can I help?
                </h2>

                <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                  Upload an image, video, audio file, or document
                  and ask the AI assistant to analyze it.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2">

                  {[
                    "Describe this image",
                    "Summarize this document",
                    "Analyze this video",
                    "Transcribe this audio",
                  ].map(
                    (suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          setInput(
                            suggestion
                          );

                          textareaRef.current?.focus();
                        }}
                        className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                      >
                        {suggestion}
                      </button>
                    )
                  )}

                </div>

              </div>
            )}

          {/* Existing messages */}

          {messages.map(
            (message) => (
              <ChatMessage
                key={message.id}
                message={message}
              />
            )
          )}

          {/* Streaming response */}

          {isStreaming &&
            streamedText && (
              <div className="flex w-full justify-start">

                <div className="flex max-w-[85%] gap-3">

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-100">
                    AI
                  </div>

                  <div className="rounded-2xl rounded-tl-sm border border-slate-700 bg-slate-800 px-4 py-3 text-sm leading-6 text-slate-100">

                    <div className="whitespace-pre-wrap">
                      {streamedText}
                    </div>

                    <span className="ml-1 inline-block h-3 w-1 animate-pulse rounded-full bg-blue-400" />

                  </div>

                </div>

              </div>
            )}

          {/* Waiting for first token */}

          {isStreaming &&
            !streamedText && (
              <div className="flex items-center gap-3">

                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-100">
                  AI
                </div>

                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-slate-700 bg-slate-800 px-4 py-3">

                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />

                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />

                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />

                </div>

              </div>
            )}

          {/* ------------------------------------------------
              VIDEO RESULT
          ------------------------------------------------ */}

          {videoResult && (
            <div className="flex w-full justify-start">

              <div className="flex max-w-[90%] gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-sm">
                  🎬
                </div>

                <div className="rounded-2xl rounded-tl-sm border border-slate-700 bg-slate-800 px-4 py-4">

                  <div className="mb-1 text-sm font-semibold text-white">
                    Video Summary
                  </div>

                  <div className="mb-3 text-xs text-slate-500">
                    {videoResult.originalName}
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
                    {videoResult.summary}
                  </p>

                  {(videoResult.framesExtracted !==
                    undefined ||
                    videoResult.framesAnalyzed !==
                      undefined) && (
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-500">

                      {videoResult.framesExtracted !==
                        undefined && (
                        <span className="rounded-full bg-slate-900 px-2 py-1">
                          {
                            videoResult.framesExtracted
                          }{" "}
                          frames extracted
                        </span>
                      )}

                      {videoResult.framesAnalyzed !==
                        undefined && (
                        <span className="rounded-full bg-slate-900 px-2 py-1">
                          {
                            videoResult.framesAnalyzed
                          }{" "}
                          frames analyzed
                        </span>
                      )}

                    </div>
                  )}

                  {videoResult.transcript && (
                    <details className="mt-4">

                      <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-200">
                        View transcript
                      </summary>

                      <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-400">
                        {
                          videoResult.transcript
                        }
                      </p>

                    </details>
                  )}

                </div>

              </div>

            </div>
          )}

          {videoError && (
            <div className="flex w-full justify-start">

              <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-300">
                Video analysis failed:{" "}
                {videoError}
              </div>

            </div>
          )}

          {/* ------------------------------------------------
              AUDIO RESULT
          ------------------------------------------------ */}

          {audioResult && (
            <div className="flex w-full justify-start">

              <div className="flex max-w-[90%] gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-sm">
                  🎧
                </div>

                <div className="rounded-2xl rounded-tl-sm border border-slate-700 bg-slate-800 px-4 py-4">

                  <div className="mb-1 text-sm font-semibold text-white">
                    Audio Analysis
                  </div>

                  <div className="mb-3 text-xs text-slate-500">
                    {audioResult.originalName}
                  </div>

                  {/* Summary */}

                  <div>

                    <div className="mb-1 text-xs font-semibold text-slate-400">
                      Summary
                    </div>

                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
                      {audioResult.summary}
                    </p>

                  </div>

                  {/* Sentiment */}

                  <div className="mt-4">

                    <div className="mb-1 text-xs font-semibold text-slate-400">
                      Sentiment
                    </div>

                    <span className="inline-flex rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-medium capitalize text-blue-300">
                      {audioResult.sentiment}
                    </span>

                  </div>

                  {/* Topics */}

                  {audioResult.topics.length >
                    0 && (
                    <div className="mt-4">

                      <div className="mb-2 text-xs font-semibold text-slate-400">
                        Topics
                      </div>

                      <div className="flex flex-wrap gap-2">

                        {audioResult.topics.map(
                          (
                            topic,
                            index
                          ) => (
                            <span
                              key={`${topic}-${index}`}
                              className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] text-slate-400"
                            >
                              {topic}
                            </span>
                          )
                        )}

                      </div>

                    </div>
                  )}

                  {/* Transcript */}

                  {audioResult.transcript && (
                    <details className="mt-4">

                      <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-200">
                        View transcript
                      </summary>

                      <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-400">
                        {
                          audioResult.transcript
                        }
                      </p>

                    </details>
                  )}

                  {/* Timestamped transcript */}

                  {audioResult.transcriptSegments
                    .length > 0 && (
                    <details className="mt-3">

                      <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-200">
                        View timestamped transcript
                      </summary>

                      <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">

                        {audioResult.transcriptSegments.map(
                          (
                            segment,
                            index
                          ) => (
                            <div
                              key={`segment-${index}`}
                              className="rounded-lg bg-slate-950 p-2.5"
                            >

                              <div className="mb-1 text-[9px] text-blue-400">
                                {formatTimestamp(
                                  segment.start
                                )}{" "}
                                →{" "}
                                {formatTimestamp(
                                  segment.end
                                )}
                              </div>

                              <p className="text-xs leading-5 text-slate-400">
                                {segment.text}
                              </p>

                            </div>
                          )
                        )}

                      </div>

                    </details>
                  )}

                </div>

              </div>

            </div>
          )}

          {audioError && (
            <div className="flex w-full justify-start">

              <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-300">
                Audio analysis failed:{" "}
                {audioError}
              </div>

            </div>
          )}

          {/* ------------------------------------------------
              DOCUMENT RESULT
          ------------------------------------------------ */}

          {documentResult && (
            <div className="flex w-full justify-start">

              <div className="flex max-w-[90%] gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-sm">
                  📄
                </div>

                <div className="rounded-2xl rounded-tl-sm border border-slate-700 bg-slate-800 px-4 py-4">

                  <div className="mb-1 flex flex-wrap items-center gap-2">

                    <div className="text-sm font-semibold text-white">
                      Document Analysis
                    </div>

                    <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300">
                      {
                        documentResult.documentType
                      }
                    </span>

                  </div>

                  <div className="mb-3 text-xs text-slate-500">
                    {
                      documentResult.originalName
                    }
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
                    {
                      documentResult.summary
                    }
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-500">

                    <span className="rounded-full bg-slate-900 px-2 py-1">
                      {
                        documentResult.tables
                          .length
                      }{" "}
                      tables
                    </span>

                    <span className="rounded-full bg-slate-900 px-2 py-1">
                      {
                        documentResult.forms
                          .length
                      }{" "}
                      forms
                    </span>

                  </div>

                  {formatDocumentText(documentResult.text) && (
                    <details className="mt-4">

                      <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-200">
                        View extracted text
                      </summary>

                      <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-400">
                        {formatDocumentText(
                          documentResult.text
                        )}
                      </p>

                    </details>
                  )}

                  {documentResult.keyInformation !==
                    undefined &&
                    documentResult.keyInformation !==
                      null && (
                      <details className="mt-3">

                        <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-200">
                          View key information
                        </summary>

                        <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-5 text-slate-400">
                          {JSON.stringify(
                            documentResult.keyInformation,
                            null,
                            2
                          )}
                        </pre>

                      </details>
                    )}

                </div>

              </div>

            </div>
          )}

          {documentError && (
            <div className="flex w-full justify-start">

              <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-300">
                Document analysis failed:{" "}
                {documentError}
              </div>

            </div>
          )}

          {/* ------------------------------------------------
              IMAGE COMPARISON RESULT
          ------------------------------------------------ */}

          {comparisonResult && (
            <div className="flex w-full justify-start">

              <div className="flex max-w-[90%] gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-sm">
                  🖼️
                </div>

                <div className="rounded-2xl rounded-tl-sm border border-slate-700 bg-slate-800 px-4 py-4">

                  <div className="mb-1 text-sm font-semibold text-white">
                    Image Comparison
                  </div>

                  <div className="mb-3 text-xs text-slate-500">
                    Compared{" "}
                    {
                      selectedImageIds.length
                    }{" "}
                    selected images
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
                    {
                      comparisonResult
                    }
                  </p>

                </div>

              </div>

            </div>
          )}

          {comparisonError &&
            selectedImageIds.length >=
              2 && (
              <div className="flex w-full justify-start">

                <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-300">
                  Image comparison failed:{" "}
                  {comparisonError}
                </div>

              </div>
            )}

          <div ref={messagesEndRef} />

        </div>

      </div>

      {/* ------------------------------------------------
          ERROR
      ------------------------------------------------ */}

      {displayedError && (
        <div className="mx-auto w-full max-w-4xl px-4 pb-2 sm:px-6">

          <div className="flex items-center justify-between rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">

            <span>
              {displayedError}
            </span>

            <button
              type="button"
              onClick={
                clearError
              }
              className="ml-3 text-red-400 hover:text-red-200"
            >
              ✕
            </button>

          </div>

        </div>
      )}

      {/* ------------------------------------------------
          COMPOSER
      ------------------------------------------------ */}

      <div className="shrink-0 border-t border-slate-800 bg-slate-950 px-4 py-4 sm:px-6">

        <div className="mx-auto max-w-4xl">

          {/* Selected media indicator */}

          {selectedMediaIds.length >
            0 && (
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">

              <span className="rounded-full bg-blue-500/10 px-2 py-1 text-blue-400">
                {
                  selectedMediaIds.length
                }{" "}
                media selected
              </span>

              <span>
                The selected media will be referenced with your question.
              </span>

            </div>
          )}

          {/* Input */}

          <div className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-slate-900 p-2 transition focus-within:border-slate-500">

            <textarea
              ref={textareaRef}
              value={input}
              onChange={
                handleInput
              }
              onKeyDown={
                handleKeyDown
              }
              disabled={
                isSending ||
                isStreaming
              }
              rows={1}
              placeholder={
                isStreaming
                  ? "AI is generating..."
                  : "Ask anything about your media..."
              }
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
            />

            {/* ------------------------------------------------
                VIDEO ACTION
            ------------------------------------------------ */}

            {selectedVideo && (
              <button
                type="button"
                onClick={() => {
                  if (selectedVideo) {
                    onNavigateToMedia?.(selectedVideo.id);
                  }
                }}
                disabled={isSending || isStreaming}
                className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 text-xs font-semibold text-blue-300 transition hover:border-blue-400/50 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                🎬
                Analyze video
              </button>
            )}

            {/* ------------------------------------------------
                AUDIO ACTION
            ------------------------------------------------ */}

            {selectedAudio && (
              <button
                type="button"
                onClick={() => {
                  if (selectedAudio) {
                    onNavigateToMedia?.(selectedAudio.id);
                  }
                }}
                disabled={isSending || isStreaming}
                className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 text-xs font-semibold text-blue-300 transition hover:border-blue-400/50 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                🎧
                Analyze audio
              </button>
            )}

            {/* ------------------------------------------------
                DOCUMENT ACTION
            ------------------------------------------------ */}

            {selectedDocument && (
              <button
                type="button"
                onClick={() => {
                  if (selectedDocument) {
                    onNavigateToMedia?.(selectedDocument.id);
                  }
                }}
                disabled={isSending || isStreaming}
                className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 text-xs font-semibold text-blue-300 transition hover:border-blue-400/50 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                📄
                Analyze document
              </button>
            )}

            {/* ------------------------------------------------
                IMAGE COMPARISON ACTION
            ------------------------------------------------ */}

            {selectedImageIds.length >=
              2 && (
              <button
                type="button"
                onClick={() => {
                  onNavigateToCompare?.();
                }}
                disabled={isSending || isStreaming}
                className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 text-xs font-semibold text-blue-300 transition hover:border-blue-400/50 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                title={
                  comparisonLoading
                    ? "Comparing images..."
                    : "Compare selected images"
                }
              >
                🖼️
                Compare images
              </button>
            )}

            {/* ------------------------------------------------
                SEND / STOP
            ------------------------------------------------ */}

            {isStreaming ? (
              <button
                type="button"
                onClick={
                  stopStream
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-700 text-white transition hover:bg-slate-600"
                title="Stop generating"
              >
                <span className="h-3 w-3 rounded-sm bg-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={
                  handleSubmit
                }
                disabled={
                  !input.trim() ||
                  isSending
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                title="Send message"
              >
                ↑
              </button>
            )}

          </div>

          <p className="mt-2 text-center text-[10px] text-slate-600">
            Enter to send · Shift + Enter for a new line
          </p>

        </div>

      </div>

    </section>
  );
}

/*
 * --------------------------------------------------
 * TIMESTAMP FORMATTER
 * --------------------------------------------------
 */

function formatTimestamp(
  seconds?: number
): string {
  if (
    seconds === undefined ||
    seconds === null ||
    Number.isNaN(seconds)
  ) {
    return "--:--";
  }

  const totalSeconds =
    Math.max(0, Math.floor(seconds));

  const hours =
    Math.floor(
      totalSeconds / 3600
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const remainingSeconds =
    totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(
      minutes
    ).padStart(
      2,
      "0"
    )}:${String(
      remainingSeconds
    ).padStart(
      2,
      "0"
    )}`;
  }

  return `${minutes}:${String(
    remainingSeconds
  ).padStart(
    2,
    "0"
  )}`;
}