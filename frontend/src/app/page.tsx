"use client";

import { useEffect, useMemo, useState } from "react";
import ChatWindow from "../components/ChatWindow";
import MediaGallery from "../components/MediaGallery";
import MediaUploader from "../components/MediaUploader";
import VideoPlayer from "../components/VideoPlayer";
import AudioPlayer from "../components/AudioPlayer";
import AnalysisResults from "../components/AnalysisResults";
import ComparisonView from "../components/ComparisonView";
import {
  analyzeComparison,
  analyzeDocument,
  getConversationExportUrl,
} from "../lib/api";
import { useChat } from "../hooks/useChat";
import type { MediaItem } from "../lib/types";

interface DocumentAnalysis {
  mediaId: string;
  originalName: string;
  documentType: string;
  summary: string;
  text: string;
  tables: unknown[];
  forms: unknown[];
  keyInformation: unknown;
}

const MEDIA_CACHE_KEY = "multimodal-ai-media-cache-v1";
const ACTIVE_CONVERSATION_KEY =
  "multimodal-ai-active-conversation-v1";

type MediaCache = Record<string, MediaItem[]>;

const readMediaCache = (): MediaCache => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(MEDIA_CACHE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === "object"
      ? (parsed as MediaCache)
      : {};
  } catch {
    return {};
  }
};

const writeMediaCache = (cache: MediaCache) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      MEDIA_CACHE_KEY,
      JSON.stringify(cache)
    );
  } catch {
    // Browser storage is only a cache. The app remains usable
    // if storage is unavailable or full.
  }
};

const cacheMediaForConversation = (
  conversationId: string,
  media: MediaItem
) => {
  const cache = readMediaCache();
  const current = cache[conversationId] || [];

  cache[conversationId] = current.some(
    (item) => item.id === media.id
  )
    ? current
    : [...current, media];

  writeMediaCache(cache);
};

const getCachedConversationMedia = (
  conversationId: string
): MediaItem[] => {
  return readMediaCache()[conversationId] || [];
};

const removeCachedMedia = (
  conversationId: string | undefined,
  mediaId: string
) => {
  if (!conversationId) {
    return;
  }

  const cache = readMediaCache();

  cache[conversationId] = (
    cache[conversationId] || []
  ).filter((media) => media.id !== mediaId);

  writeMediaCache(cache);
};

export default function Home() {
  const {
    state,
    loadConversations,
    newConversation,
    openConversation,
    removeConversation,
  } = useChat();

  const {
    conversations,
    currentConversation,
    isLoading,
    error,
  } = state;

  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([]);
  const [uploadedMedia, setUploadedMedia] = useState<MediaItem[]>([]);
  const [openedMedia, setOpenedMedia] = useState<MediaItem | null>(null);

  const [showUploader, setShowUploader] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileGallery, setShowMobileGallery] = useState(false);

  const [documentAnalysis, setDocumentAnalysis] =
    useState<DocumentAnalysis | null>(null);

  const [documentAnalyzing, setDocumentAnalyzing] =
    useState(false);

  const [documentError, setDocumentError] =
    useState<string | null>(null);

  const [comparisonResult, setComparisonResult] = useState("");
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] =
    useState<string | null>(null);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!currentConversation?.id) {
      return;
    }

    window.localStorage.setItem(
      ACTIVE_CONVERSATION_KEY,
      currentConversation.id
    );
  }, [currentConversation?.id]);

  useEffect(() => {
    if (
      currentConversation?.id ||
      conversations.length === 0
    ) {
      return;
    }

    const savedConversationId =
      window.localStorage.getItem(
        ACTIVE_CONVERSATION_KEY
      );

    const savedConversationExists =
      savedConversationId &&
      conversations.some(
        (conversation) =>
          conversation.id === savedConversationId
      );

    const conversationToOpen =
      savedConversationExists
        ? savedConversationId
        : conversations[0]?.id;

    if (conversationToOpen) {
      openConversation(conversationToOpen);
    }
  }, [
    conversations,
    currentConversation?.id,
    openConversation,
  ]);

  const selectedMediaIds = useMemo(
    () => selectedMedia.map((media) => media.id),
    [selectedMedia]
  );

  const imageMedia = useMemo(
    () =>
      uploadedMedia.filter(
        (media) => media.media_type === "image"
      ),
    [uploadedMedia]
  );

  useEffect(() => {
    if (!currentConversation?.id) {
      setUploadedMedia([]);
      return;
    }

    const cachedMedia = getCachedConversationMedia(
      currentConversation.id
    );

    setUploadedMedia(cachedMedia);
  }, [
    currentConversation?.id,
    currentConversation?.messages,
  ]);

  const handleNewConversation = async () => {
    const conversation = await newConversation("New Conversation");

    if (conversation) {
      setSelectedMedia([]);
      setOpenedMedia(null);
      setDocumentAnalysis(null);
      setDocumentError(null);
      setComparisonResult("");
      setComparisonError(null);
      setComparisonLoading(false);
      setShowMobileSidebar(false);
    }
  };

  const handleConversationSelect = async (
    conversationId: string
  ) => {
    await openConversation(conversationId);

    setSelectedMedia([]);
    setOpenedMedia(null);
    setDocumentAnalysis(null);
    setDocumentError(null);
    setComparisonResult("");
    setComparisonError(null);
    setComparisonLoading(false);
    setShowMobileSidebar(false);
  };

  const handleConversationDelete = async (
    conversationId: string
  ) => {
    const confirmed = window.confirm(
      "Delete this conversation?"
    );

    if (!confirmed) {
      return;
    }

    await removeConversation(conversationId);
  };

  const handleExportConversation = () => {
  if (!currentConversation?.id) {
    return;
  }

  window.open(
    getConversationExportUrl(currentConversation.id),
    "_blank",
    "noopener,noreferrer"
  );
};

  const handleMediaSelect = (media: MediaItem) => {
    setSelectedMedia((current) => {
      const exists = current.some(
        (item) => item.id === media.id
      );

      if (exists) {
        return current.filter(
          (item) => item.id !== media.id
        );
      }

      return [...current, media];
    });
  };

  const handleMediaOpen = (media: MediaItem) => {
    setOpenedMedia(media);
    setShowMobileGallery(false);

    setDocumentAnalysis(null);
    setDocumentError(null);
  };

  const handleMediaRemove = (media: MediaItem) => {
    removeCachedMedia(
      currentConversation?.id,
      media.id
    );

    setUploadedMedia((current) =>
      current.filter((item) => item.id !== media.id)
    );

    setSelectedMedia((current) =>
      current.filter((item) => item.id !== media.id)
    );

    if (openedMedia?.id === media.id) {
      setOpenedMedia(null);
      setDocumentAnalysis(null);
      setDocumentError(null);
    }
  };

  const handleUploadComplete = (media: MediaItem) => {
    if (currentConversation?.id) {
      cacheMediaForConversation(
        currentConversation.id,
        media
      );
    }

    setUploadedMedia((current) => {
      const exists = current.some(
        (item) => item.id === media.id
      );

      if (exists) {
        return current;
      }

      return [...current, media];
    });

    setSelectedMedia((current) => {
      const exists = current.some(
        (item) => item.id === media.id
      );

      if (exists) {
        return current;
      }

      return [...current, media];
    });

    setShowUploader(false);
  };

  const handleConversationCreated = async (
    conversationId: string
  ) => {
    await openConversation(conversationId);
  };

  const handleNavigateToMedia = (mediaId: string) => {
    const media = uploadedMedia.find(
      (item) => item.id === mediaId
    );

    if (!media) {
      return;
    }

    setOpenedMedia(media);
    setShowMobileGallery(false);
    setDocumentAnalysis(null);
    setDocumentError(null);
  };

  const handleAnalyzeDocument = async () => {
    if (
      !openedMedia ||
      openedMedia.media_type !== "document"
    ) {
      return;
    }

  setDocumentAnalyzing(true);
  setDocumentError(null);

  try {
    const response = await analyzeDocument(
      openedMedia.id
    );

    if (!response.success || !response.analysis) {
      throw new Error("Document analysis failed.");
    }

    setDocumentAnalysis({
      ...response.analysis,
      mediaId: response.mediaId ?? openedMedia.id,
      originalName:
        response.analysis.originalName ??
        openedMedia.original_name,
    });
  } catch (error) {
    setDocumentError(
      error instanceof Error
        ? error.message
        : "Failed to analyze document."
    );
  } finally {
    setDocumentAnalyzing(false);
  }
};

  const handleCompare = async (
  mediaIds: string[],
  question?: string
) => {
  try {
    setComparisonLoading(true);
    setComparisonError(null);
    setComparisonResult("");

    const response = await analyzeComparison(
      mediaIds,
      question
    );

    if (!response.success || !response.analysis) {
      throw new Error("Image comparison failed.");
    }

    setComparisonResult(
      JSON.stringify(response.analysis, null, 2)
    );
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

  const galleryMedia = useMemo(
    () => uploadedMedia,
    [uploadedMedia]
  );

  return (
    <main className="flex h-screen overflow-hidden bg-slate-950 text-white">
      {/* Mobile conversation overlay */}
      {showMobileSidebar && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setShowMobileSidebar(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      {/* Conversation sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-800 bg-slate-950 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          showMobileSidebar
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        {/* Sidebar header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-4">
          <div>
            <p className="text-sm font-semibold">
              Multi-Modal AI
            </p>

            <p className="text-[10px] text-slate-500">
              Assistant
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowMobileSidebar(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            ✕
          </button>
        </div>

        {/* New conversation */}
        <div className="p-3">
          <button
            type="button"
            onClick={handleNewConversation}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            <span className="text-lg">+</span>
            New conversation
          </button>
        </div>

        {/* Conversations */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          <div className="px-2 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            Conversations
          </div>

          {isLoading && conversations.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-600">
              Loading...
            </div>
          )}

          {!isLoading && conversations.length === 0 && (
            <div className="px-3 py-6 text-center text-xs leading-5 text-slate-600">
              No conversations yet.
              <br />
              Start a new chat.
            </div>
          )}

          <div className="space-y-1">
            {conversations.map((conversation) => {
              const active =
                currentConversation?.id === conversation.id;

              return (
                <div
                  key={conversation.id}
                  className={`group flex items-center rounded-xl transition ${
                    active
                      ? "bg-slate-800"
                      : "hover:bg-slate-900"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      handleConversationSelect(
                        conversation.id
                      )
                    }
                    className="min-w-0 flex-1 px-3 py-2.5 text-left"
                  >
                    <p
                      className={`truncate text-xs font-medium ${
                        active
                          ? "text-white"
                          : "text-slate-400"
                      }`}
                    >
                      {conversation.title ||
                        "Untitled conversation"}
                    </p>

                    <p className="mt-1 text-[9px] text-slate-600">
                      {new Date(
                        conversation.updated_at
                      ).toLocaleDateString()}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleConversationDelete(
                        conversation.id
                      )
                    }
                    className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-600 opacity-0 transition hover:bg-red-950 hover:text-red-400 group-hover:opacity-100"
                    title="Delete conversation"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar footer */}
        <div className="shrink-0 border-t border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Local AI workspace
          </div>
        </div>
      </aside>

      {/* Main area */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setShowMobileSidebar(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white lg:hidden"
              title="Conversations"
            >
              ☰
            </button>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {currentConversation?.title ||
                  "Multi-Modal AI Assistant"}
              </p>

              <p className="text-[10px] text-slate-600">
                Images · Video · Audio · Documents
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentConversation && (
    <button
      type="button"
      onClick={handleExportConversation}
      className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
      title="Export conversation as Markdown"
    >
      <span>↓</span>

      <span className="hidden sm:inline">
        Export
      </span>
    </button>
  )}
            <button
              type="button"
              onClick={async () => {
  if (!currentConversation) {
    const conversation = await newConversation(
      "New Conversation"
    );

    if (!conversation) {
      return;
    }
  }

  setShowUploader((current) => !current);
}}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            >
              <span>＋</span>

              <span className="hidden sm:inline">
                Upload
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setShowMobileGallery((current) => !current)
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-sm text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
              title="Media gallery"
            >
              🗂️
            </button>

            <div className="hidden items-center gap-2 rounded-full border border-emerald-900/50 bg-emerald-950/20 px-3 py-1.5 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

              <span className="text-[10px] text-emerald-400">
                AI Ready
              </span>
            </div>
          </div>
        </header>

        {/* Upload panel */}
        {showUploader && (
          <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-4 py-4 sm:px-6">
            <div className="mx-auto max-w-4xl">
              <MediaUploader
                conversationId={currentConversation?.id}
                onUploadComplete={handleUploadComplete}
              
              />
            </div>
          </div>
        )}

        {/* Selected media bar */}
        {selectedMedia.length > 0 && (
          <div className="shrink-0 border-b border-blue-900/30 bg-blue-950/10 px-4 py-2 sm:px-6">
            <div className="mx-auto flex max-w-4xl items-center gap-2 overflow-x-auto">
              <span className="shrink-0 text-[10px] font-medium text-blue-400">
                Referencing:
              </span>

              {selectedMedia.map((media) => (
                <button
                  key={media.id}
                  type="button"
                  onClick={() => handleMediaSelect(media)}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-blue-900/40 bg-blue-950/20 px-2 py-1 text-[10px] text-blue-300"
                >
                  <span>
                    {media.media_type === "image"
                      ? "🖼️"
                      : media.media_type === "video"
                      ? "🎬"
                      : media.media_type === "audio"
                      ? "🎵"
                      : "📄"}
                  </span>

                  <span className="max-w-32 truncate">
                    {media.original_name}
                  </span>

                  <span className="text-blue-500">
                    ✕
                  </span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => setSelectedMedia([])}
                className="shrink-0 text-[10px] text-slate-600 hover:text-slate-300"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">

            {/* Comparison */}
            {imageMedia.length >= 2 && (
              <div
                id="compare-images-section"
                className="scroll-mt-4"
              >
                <ComparisonView
                media={imageMedia}
                result={comparisonResult}
                loading={comparisonLoading}
                error={comparisonError}
                onCompare={handleCompare}
                />
              </div>
            )}

            {/* Chat */}
            <div className="min-h-[500px]">
              <ChatWindow
              conversationId={currentConversation?.id}
              selectedMedia={selectedMedia}
              selectedMediaIds={selectedMediaIds}
              onConversationCreated={handleConversationCreated}
              onNavigateToMedia={handleNavigateToMedia}
              onNavigateToCompare={() => {
                document
                  .getElementById("compare-images-section")
                  ?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
              }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Desktop media gallery */}
      <aside className="hidden w-72 shrink-0 border-l border-slate-800 bg-slate-950 lg:flex lg:flex-col">
        <MediaGallery
          media={galleryMedia}
          selectedMediaIds={selectedMediaIds}
          onMediaSelect={handleMediaSelect}
          onMediaOpen={handleMediaOpen}
          onMediaRemove={handleMediaRemove}
        />
      </aside>

      {/* Mobile media gallery */}
      {showMobileGallery && (
        <>
          <button
            type="button"
            aria-label="Close media gallery"
            onClick={() => setShowMobileGallery(false)}
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          />

          <aside className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-[90vw] flex-col border-l border-slate-800 bg-slate-950 lg:hidden">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-4">
              <p className="text-sm font-semibold text-white">
                Media Gallery
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowMobileGallery(false)
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            <MediaGallery
              media={galleryMedia}
              selectedMediaIds={selectedMediaIds}
              onMediaSelect={handleMediaSelect}
              onMediaOpen={handleMediaOpen}
              onMediaRemove={handleMediaRemove}
            />
          </aside>
        </>
      )}

      {/* Media viewer */}
      {openedMedia && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <button
            type="button"
            aria-label="Close media viewer"
            onClick={() => setOpenedMedia(null)}
            className="absolute inset-0 cursor-default"
          />

          <div className="relative z-10 flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            {/* Viewer header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {openedMedia.original_name}
                </p>

                <p className="mt-0.5 text-[10px] capitalize text-slate-500">
                  {openedMedia.media_type}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpenedMedia(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Viewer content */}
            <div className="min-h-0 overflow-y-auto p-3 sm:p-5">
              {openedMedia.media_type === "video" ? (
                <VideoPlayer media={openedMedia} />
              ) : openedMedia.media_type === "audio" ? (
                <AudioPlayer media={openedMedia} />
              ) : openedMedia.media_type === "image" ? (
                <div className="flex max-h-[75vh] items-center justify-center overflow-hidden rounded-xl bg-black">
                  <img
                    src={`${process.env.NEXT_PUBLIC_API_URL}/media/${openedMedia.id}`}
                    alt={openedMedia.original_name}
                    className="max-h-[75vh] max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Document preview */}
                  <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-800 bg-slate-900">
                    <div className="text-center">
                      <div className="text-4xl">
                        📄
                      </div>

                      <p className="mt-3 text-sm font-medium text-slate-300">
                        {openedMedia.original_name}
                      </p>

                      <p className="mt-1 text-xs text-slate-600">
                        Document ready for AI analysis
                      </p>
                    </div>
                  </div>

                  {/* Analyze document */}
                  <button
                    type="button"
                    onClick={handleAnalyzeDocument}
                    disabled={documentAnalyzing}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {documentAnalyzing ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300/30 border-t-blue-300" />
                        Analyzing Document...
                      </>
                    ) : (
                      <>
                        ✨
                        {documentAnalysis?.mediaId ===
                        openedMedia.id
                          ? "Re-analyze Document"
                          : "Analyze Document"}
                      </>
                    )}
                  </button>

                  {/* Document analysis results */}
                  <AnalysisResults
                    title="Document Analysis"
                    type="document"
                    result={
                      documentAnalysis?.mediaId ===
                      openedMedia.id
                        ? documentAnalysis
                        : undefined
                    }
                    loading={documentAnalyzing}
                    error={documentError}
                    emptyMessage="Click Analyze Document to extract text, tables, forms, and key information."
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global error */}
      {error && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-xl border border-red-900/50 bg-red-950/90 px-4 py-3 text-xs text-red-300 shadow-xl backdrop-blur">
            {error}
          </div>
        </div>
      )}
    </main>
  );
}