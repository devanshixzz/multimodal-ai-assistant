"use client";

import ReactMarkdown from "react-markdown";
import type { ChatMessage as ChatMessageType } from "../lib/types";
import { getMediaThumbnailUrl } from "../lib/api";

interface ChatMessageProps {
  message: ChatMessageType;
}

function formatTime(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function getAnalysisType(message: ChatMessageType) {
  if (message.role !== "assistant") {
    return null;
  }

  const type = message.metadata?.type;

  if (
    type === "image_analysis" ||
    type === "video_analysis" ||
    type === "audio_analysis" ||
    type === "document_analysis" ||
    type === "comparison_analysis"
  ) {
    return type;
  }

  return null;
}

function getAnalysisTitle(type: string) {
  switch (type) {
    case "image_analysis":
      return "Image Analysis";

    case "video_analysis":
      return "Video Analysis";

    case "audio_analysis":
      return "Audio Analysis";

    case "document_analysis":
      return "Document Analysis";

    case "comparison_analysis":
      return "Image Comparison";

    default:
      return "AI Analysis";
  }
}

function getAnalysisIcon(type: string) {
  switch (type) {
    case "image_analysis":
      return "🖼️";

    case "video_analysis":
      return "🎬";

    case "audio_analysis":
      return "🎵";

    case "document_analysis":
      return "📄";

    case "comparison_analysis":
      return "🔍";

    default:
      return "✨";
  }
}

function getMetadataValue(
  metadata: Record<string, unknown>,
  key: string
) {
  const value = metadata[key];

  if (typeof value === "string") {
    return value;
  }

  return "";
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const mediaRefs = message.media_refs || [];
  const analysisType = getAnalysisType(message);

  const metadata = message.metadata || {};

  const question = getMetadataValue(metadata, "question");
  const originalName = getMetadataValue(metadata, "originalName");

  return (
    <div
      className={`flex w-full ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`flex max-w-[90%] gap-3 sm:max-w-[85%] ${
          isUser ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Avatar */}
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            isUser
              ? "bg-blue-600 text-white"
              : "bg-slate-700 text-slate-100"
          }`}
        >
          {isUser ? "You" : "AI"}
        </div>

        {/* Message bubble */}
        <div
          className={`min-w-0 rounded-2xl px-4 py-3 shadow-sm ${
            isUser
              ? "rounded-tr-sm bg-blue-600 text-white"
              : "rounded-tl-sm border border-slate-700 bg-slate-800 text-slate-100"
          }`}
        >
          {/* Referenced media */}
          {mediaRefs.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {mediaRefs.map((mediaId) => (
                <div
                  key={mediaId}
                  className="overflow-hidden rounded-xl border border-white/10 bg-black/20"
                >
                  <img
                    src={getMediaThumbnailUrl(mediaId)}
                    alt="Referenced media"
                    className="h-24 w-24 object-cover"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Persisted analysis */}
          {analysisType ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-sm">
                  {getAnalysisIcon(analysisType)}
                </span>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {getAnalysisTitle(analysisType)}
                  </p>

                  {originalName && (
                    <p className="truncate text-[10px] text-slate-500">
                      {originalName}
                    </p>
                  )}
                </div>
              </div>

              {question && (
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Question
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    {question}
                  </p>
                </div>
              )}

              {message.content && (
                <div className="text-sm leading-6">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => (
                        <p className="mb-2 last:mb-0">{children}</p>
                      ),

                      ul: ({ children }) => (
                        <ul className="mb-2 list-disc space-y-1 pl-5">
                          {children}
                        </ul>
                      ),

                      ol: ({ children }) => (
                        <ol className="mb-2 list-decimal space-y-1 pl-5">
                          {children}
                        </ol>
                      ),

                      li: ({ children }) => (
                        <li className="leading-6">{children}</li>
                      ),

                      strong: ({ children }) => (
                        <strong className="font-semibold text-white">
                          {children}
                        </strong>
                      ),

                      blockquote: ({ children }) => (
                        <blockquote className="my-2 border-l-2 border-slate-500 pl-3 italic">
                          {children}
                        </blockquote>
                      ),

                      a: ({ href, children }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                        >
                          {children}
                        </a>
                      ),

                      code: ({ children }) => (
                        <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs text-slate-200">
                          {children}
                        </code>
                      ),

                      pre: ({ children }) => (
                        <div className="my-3 overflow-x-auto rounded-xl bg-slate-950">
                          {children}
                        </div>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          ) : (
            /* Normal chat message */
            message.content && (
              <div className="text-sm leading-6">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p className="mb-2 last:mb-0">{children}</p>
                    ),

                    ul: ({ children }) => (
                      <ul className="mb-2 list-disc space-y-1 pl-5">
                        {children}
                      </ul>
                    ),

                    ol: ({ children }) => (
                      <ol className="mb-2 list-decimal space-y-1 pl-5">
                        {children}
                      </ol>
                    ),

                    li: ({ children }) => (
                      <li className="leading-6">{children}</li>
                    ),

                    strong: ({ children }) => (
                      <strong className="font-semibold">
                        {children}
                      </strong>
                    ),

                    blockquote: ({ children }) => (
                      <blockquote className="my-2 border-l-2 border-slate-500 pl-3 italic">
                        {children}
                      </blockquote>
                    ),

                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        {children}
                      </a>
                    ),

                    code: ({ children }) => (
                      <code
                        className={
                          isUser
                            ? "rounded bg-blue-700 px-1.5 py-0.5 font-mono text-xs"
                            : "rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs text-slate-200"
                        }
                      >
                        {children}
                      </code>
                    ),

                    pre: ({ children }) => (
                      <div className="my-3 overflow-x-auto rounded-xl bg-slate-950">
                        {children}
                      </div>
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )
          )}

          {/* Timestamp */}
          <div
            className={`mt-2 text-[10px] ${
              isUser ? "text-blue-100" : "text-slate-400"
            }`}
          >
            {formatTime(message.created_at)}
          </div>
        </div>
      </div>
    </div>
  );
}