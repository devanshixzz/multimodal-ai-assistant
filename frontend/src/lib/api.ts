import type {
  ChatResponse,
  Conversation,
  MediaItem,
  UploadResponse,
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000/api";

/**
 * Parse backend responses consistently and provide
 * user-friendly error messages.
 */
async function parseResponse<T>(
  response: Response
): Promise<T> {
  const contentType =
    response.headers.get("content-type") || "";

  const isJson =
    contentType.includes("application/json");

  let data: unknown = null;

  try {
    data = isJson
      ? await response.json()
      : await response.text();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const body =
      typeof data === "object" &&
      data !== null
        ? (data as {
            error?: {
              message?: string;
            };
            message?: string;
          })
        : null;

    let message =
      body?.error?.message ||
      body?.message ||
      `Request failed with status ${response.status}`;

    if (response.status === 400) {
      message =
        body?.error?.message ||
        body?.message ||
        "Invalid request. Please check the provided data.";
    } else if (response.status === 404) {
      message =
        body?.error?.message ||
        body?.message ||
        "The requested resource was not found.";
    } else if (response.status === 408) {
      message =
        "The request timed out. Please try again.";
    } else if (response.status === 413) {
      message =
        "The uploaded file is too large.";
    } else if (response.status === 415) {
      message =
        "This file type is not supported.";
    } else if (response.status === 429) {
      message =
        "Too many requests. Please wait a moment and try again.";
    } else if (response.status >= 500) {
      message =
        "The server encountered an error. Please try again.";
    }

    throw new Error(message);
  }

  return data as T;
}

/**
 * Upload a media file.
 */
export async function uploadMedia(
  file: File,
  conversationId?: string,
  onProgress?: (progress: number) => void
): Promise<UploadResponse> {
  const formData = new FormData();

  formData.append("file", file);

if (conversationId) {
  formData.append("conversationId", conversationId);
}

  /*
   * XMLHttpRequest is used here because fetch()
   * does not provide upload progress events.
   */
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open(
      "POST",
      `${API_BASE_URL}/upload`
    );

    xhr.upload.addEventListener(
      "progress",
      (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const progress = Math.round(
          (event.loaded / event.total) * 100
        );

        onProgress?.(progress);
      }
    );

    xhr.addEventListener(
      "load",
      () => {
        try {
          const data = JSON.parse(
            xhr.responseText
          );

          if (
            xhr.status >= 200 &&
            xhr.status < 300
          ) {
            /*
             * Backend returns camelCase media fields,
             * while the frontend MediaItem uses snake_case.
             */
            const backendMedia = data?.media;

            if (!backendMedia) {
              reject(
                new Error(
                  "Upload succeeded but the server returned no media information."
                )
              );
              return;
            }

            /*
             * Normalize the backend media type.
             *
             * Some MP4-based audio containers (notably .m4a)
             * may be reported as video/mp4 by a browser or
             * upstream detector. Prefer the filename extension
             * for known audio-only extensions so the UI does not
             * expose video actions for an audio file.
             */
            const originalName =
              backendMedia.originalName || "";

            const extensionMatch =
              originalName.match(/\\.([^.\\s]+)$/);

            const extension =
              extensionMatch?.[1]?.toLowerCase() || "";

            const backendMimeType =
              String(
                backendMedia.mimeType || ""
              ).toLowerCase();

            const audioExtensions = [
              "m4a",
              "mp3",
              "wav",
              "aac",
              "flac",
              "ogg",
              "oga",
              "opus",
            ];

            const normalizedMediaType =
              audioExtensions.includes(extension)
                ? "audio"
                : backendMimeType.startsWith("audio/")
                  ? "audio"
                  : backendMedia.mediaType;

            const media: MediaItem = {
              id: backendMedia.id,
              original_name: originalName,
              filename:
                backendMedia.storedName,
              mime_type:
                backendMedia.mimeType,
              media_type:
                normalizedMediaType,
              size: backendMedia.size,
              status: backendMedia.status,
              metadata:
                backendMedia.metadata || {},
            };

            resolve({
              ...data,
              media,
            });
          } else {
            let message =
              data?.error?.message ||
              data?.message ||
              "Upload failed.";

            if (xhr.status === 413) {
              message =
                "The uploaded file is too large.";
            } else if (xhr.status === 415) {
              message =
                "This file type is not supported.";
            } else if (xhr.status >= 500) {
              message =
                "The server encountered an error while uploading the file.";
            }

            reject(new Error(message));
          }
        } catch {
          reject(
            new Error(
              "The server returned an invalid response."
            )
          );
        }
      }
    );

    xhr.addEventListener(
      "error",
      () => {
        reject(
          new Error(
            "Network error while uploading the file. Make sure the backend is running."
          )
        );
      }
    );

    xhr.addEventListener(
      "abort",
      () => {
        reject(
          new Error(
            "Upload was cancelled."
          )
        );
      }
    );

    xhr.send(formData);
  });
}

/**
 * Send a normal chat request.
 */
export async function sendChat(
  message: string,
  conversationId?: string,
  mediaIds: string[] = []
): Promise<ChatResponse> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          conversationId,
          mediaIds,
        }),
      }
    );
  } catch {
    throw new Error(
      "Unable to connect to the backend. Make sure the server is running."
    );
  }

  return parseResponse<ChatResponse>(
    response
  );
}

/**
 * Get all conversations.
 */
export async function getConversations(): Promise<{
  success: boolean;
  conversations: Conversation[];
}> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/conversations`,
      {
        cache: "no-store",
      }
    );
  } catch {
    throw new Error(
      "Unable to load conversations. Make sure the backend is running."
    );
  }

  return parseResponse(response);
}

/**
 * Get one conversation.
 */
export async function getConversation(
  conversationId: string
): Promise<{
  success: boolean;
  conversation: Conversation;
}> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/conversations/${conversationId}`,
      {
        cache: "no-store",
      }
    );
  } catch {
    throw new Error(
      "Unable to load this conversation. Please try again."
    );
  }

  return parseResponse(response);
}

/**
 * Create a new conversation.
 */
export async function createConversation(
  title = "New Conversation"
): Promise<{
  success: boolean;
  conversation: Conversation;
}> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/conversations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
        }),
      }
    );
  } catch {
    throw new Error(
      "Unable to create a conversation. Make sure the backend is running."
    );
  }

  return parseResponse(response);
}

/**
 * Delete a conversation.
 */
export async function deleteConversation(
  conversationId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/conversations/${conversationId}`,
      {
        method: "DELETE",
      }
    );
  } catch {
    throw new Error(
      "Unable to delete the conversation. Please try again."
    );
  }

  return parseResponse(response);
}

/**
 * Get a media file URL.
 */
export function getMediaUrl(
  mediaId: string
): string {
  return `${API_BASE_URL}/media/${mediaId}`;
}

/**
 * Get a media thumbnail URL.
 */
export function getMediaThumbnailUrl(
  mediaId: string
): string {
  return `${API_BASE_URL}/media/${mediaId}/thumb`;
}

/**
 * Get extracted video frames.
 */
export function getMediaFramesUrl(
  mediaId: string
): string {
  return `${API_BASE_URL}/media/${mediaId}/frames`;
}

export interface VideoAnalysisResult {
  mediaId: string;
  originalName: string;
  duration: number;
  framesExtracted: number;
  framesAnalyzed: number;
  summary: string;
  frames: Array<{
    path?: string;
    timestamp?: number;
    timestampFormatted?: string;
    description?: string;
  }>;
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

export async function analyzeVideo(
  mediaId: string,
  question?: string
): Promise<{
  success: boolean;
  analysis: VideoAnalysisResult;
}> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/analyze/video`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaId,
          question:
            question?.trim() || undefined,
        }),
      }
    );
  } catch {
    throw new Error(
      "Unable to connect to the backend while analyzing the video."
    );
  }

  return parseResponse(response);
}

export interface AudioAnalysisResult {
  mediaId: string;
  originalName: string;
  transcript: string;
  transcriptSegments: Array<{
    start?: number;
    end?: number;
    text?: string;
  }>;
  summary: string;
  topics: string[];
  sentiment: string;
  duration?: number;
  audio?: {
    format?: string;
    sampleRate?: number;
    channels?: number;
    size?: number;
  } | null;
}

export async function analyzeAudio(
  mediaId: string
): Promise<{
  success: boolean;
  analysis: AudioAnalysisResult;
}> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/analyze/audio`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaId,
        }),
      }
    );
  } catch {
    throw new Error(
      "Unable to connect to the backend while analyzing the audio."
    );
  }

  return parseResponse(response);
}

export interface DocumentAnalysisResult {
  mediaId: string;
  originalName: string;
  documentType: string;
  summary: string;
  text: string;
  tables: unknown[];
  forms: unknown[];
  keyInformation: unknown;
}

export async function analyzeDocument(
  mediaId: string
): Promise<{
  success: boolean;
  mediaId: string;
  analysis: DocumentAnalysisResult;
}> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/analyze/document`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaId,
        }),
      }
    );
  } catch {
    throw new Error(
      "Unable to connect to the backend while analyzing the document."
    );
  }

  return parseResponse(response);
}

export interface ComparisonAnalysisResult {
  summary: string;
  similarities: string[];
  differences: string[];

  imageObservations: Array<{
    image: number | null;
    observation: string;
  }>;

  overallInterpretation: string;

  imagesCompared?: Array<{
    image: number;
    mediaId: string;
    originalName: string;
  }>;

  failedImages?: Array<{
    image?: number;
    mediaId?: string;
    originalName?: string;
    reason?: string;
  }>;
}

export async function analyzeComparison(
  mediaIds: string[],
  question?: string
): Promise<{
  success: boolean;
  analysis: ComparisonAnalysisResult;
}> {
  if (mediaIds.length < 2) {
    throw new Error(
      "Select at least two images for comparison."
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/analyze/compare`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaIds,
          question:
            question?.trim() || undefined,
        }),
      }
    );
  } catch {
    throw new Error(
      "Unable to connect to the backend while comparing the images."
    );
  }

  return parseResponse(response);
}

export function getConversationExportUrl(
  conversationId: string
): string {
  return `${API_BASE_URL}/conversations/${conversationId}/export`;
}