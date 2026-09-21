import express from "express";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import {
  createConversation,
  getConversation,
  addMessage,
  getContextMessages,
} from "../services/context-manager.js";

import {
  analyzeImage,
  generateText,
  streamText,
} from "../services/vision.js";

import {
  prepareImageForVision,
} from "../services/image-processor.js";

import {
  extractFrames,
} from "../services/video-processor.js";

import {
  analyzeVideoFrames,
} from "../services/video-analyzer.js";

import {
  extractAudioFromVideo,
  transcribeAudio,
} from "../services/audio-processor.js";

import {
  analyzeTranscript,
} from "../services/audio-analyzer.js";

import {
  renderPdfPages,
} from "../services/document-parser.js";

import {
  analyzeDocumentPages,
} from "../services/document-analyzer.js";

import config from "../config.js";
import db from "../models/database.js";

const router = express.Router();

/**
 * Build readable conversation history.
 */
function buildContextText(contextMessages) {
  return contextMessages
    .map((item) => {
      const role =
        item.role === "assistant"
          ? "Assistant"
          : "User";

      return `${role}: ${item.content}`;
    })
    .join("\n");
}

/**
 * Safely parse stored media metadata.
 */
function parseMetadata(media) {
  try {
    return media.metadata
      ? JSON.parse(media.metadata)
      : {};
  } catch {
    return {};
  }
}

/**
 * Get media records for the requested IDs.
 */
function getMediaRecords(mediaIds) {
  const uniqueIds = [...new Set(mediaIds)];

  return uniqueIds.map((mediaId) => {
    const media = db
      .prepare(`
        SELECT
          id,
          original_name,
          mime_type,
          media_type,
          size,
          path,
          status,
          metadata
        FROM media
        WHERE id = ?
      `)
      .get(mediaId);

    if (!media) {
      const error = new Error(
        `Media not found: ${mediaId}`
      );

      error.statusCode = 404;
      error.publicMessage =
        `The selected media could not be found: ${mediaId}`;

      throw error;
    }

    return media;
  });
}

/**
 * Make sure the stored file still exists.
 */
async function ensureMediaFile(media) {
  try {
    await fs.access(media.path);
  } catch {
    const error = new Error(
      `Media file does not exist: ${media.path}`
    );

    error.statusCode = 404;
    error.publicMessage =
      `The file "${media.original_name}" is no longer available.`;

    throw error;
  }
}

/**
 * Analyze an image for unified chat.
 */
async function buildImageContext(media, userMessage) {
  await ensureMediaFile(media);

  const imageBuffer = await fs.readFile(media.path);

  if (!imageBuffer.length) {
    const error = new Error(
      `Image is empty: ${media.id}`
    );

    error.statusCode = 422;
    error.publicMessage =
      `The image "${media.original_name}" is empty or corrupted.`;

    throw error;
  }

  const optimizedImage =
    await prepareImageForVision(imageBuffer);

  const answer = await analyzeImage(
    optimizedImage,
    "image/jpeg",
    userMessage
  );

  return {
    mediaId: media.id,
    name: media.original_name,
    type: "image",
    answer,
  };
}

/**
 * Analyze a video for unified chat.
 *
 * Uses fixed-interval frames, matching the required
 * video processing strategy.
 */
async function buildVideoContext(media, userMessage) {
  await ensureMediaFile(media);

  const temporaryDirectory = path.join(
    config.storage.framesDir,
    "chat",
    media.id,
    uuidv4()
  );

  const audioOutputPath = path.join(
    temporaryDirectory,
    "audio.wav"
  );

  try {
    await fs.mkdir(temporaryDirectory, {
      recursive: true,
    });

    const extraction = await extractFrames(
      media.path,
      temporaryDirectory,
      {
        intervalSeconds: 5,
        maxFrames: 120,
        frameWidth: 1280,
        onProgress: (progress) => {
          console.log(
            `[Chat Video ${media.id}] Extracting frames ${progress.current}/${progress.total}`
          );
        },
      }
    );

    if (
      !extraction.frames ||
      extraction.frames.length === 0
    ) {
      const error = new Error(
        `No video frames extracted: ${media.id}`
      );

      error.statusCode = 422;
      error.publicMessage =
        `No usable frames could be extracted from "${media.original_name}".`;

      throw error;
    }

    const visualAnalysis =
      await analyzeVideoFrames(
        extraction.frames,
        {
          userQuestion: userMessage,
          maxFrames: 12,
          onProgress: (progress) => {
            console.log(
              `[Chat Video ${media.id}] Preparing frames ${progress.current}/${progress.total}`
            );
          },
        }
      );

    /*
     * Try to extract and transcribe the audio track.
     *
     * Audio failure should not make an otherwise valid
     * video analysis fail.
     */
    let transcript = null;

    try {
      await extractAudioFromVideo(
        media.path,
        audioOutputPath
      );

      const transcription =
        await transcribeAudio(
          audioOutputPath
        );

      transcript = transcription.text || null;
    } catch (audioError) {
      console.warn(
        `[Chat Video ${media.id}] Audio transcription skipped: ${audioError.message}`
      );
    }

    return {
      mediaId: media.id,
      name: media.original_name,
      type: "video",
      visualAnalysis,
      transcript,
      duration:
        extraction.metadata?.duration ?? null,
      framesExtracted:
        extraction.totalFrames ?? extraction.frames.length,
    };
  } finally {
    await fs.rm(
      temporaryDirectory,
      {
        recursive: true,
        force: true,
      }
    );
  }
}

/**
 * Analyze audio for unified chat.
 */
async function buildAudioContext(media, userMessage) {
  await ensureMediaFile(media);

  const transcription =
    await transcribeAudio(media.path);

  const transcript =
    transcription.text || "";

  if (!transcript.trim()) {
    const error = new Error(
      `Audio transcription returned no text: ${media.id}`
    );

    error.statusCode = 422;
    error.publicMessage =
      `No speech could be detected in "${media.original_name}".`;

    throw error;
  }

  const analysis =
    await analyzeTranscript(
      transcript,
      {
        userQuestion: userMessage,
      }
    );

  return {
    mediaId: media.id,
    name: media.original_name,
    type: "audio",
    transcript,
    transcriptSegments:
      transcription.segments || [],
    analysis,
  };
}

/**
 * Analyze a document/PDF for unified chat.
 */
async function buildDocumentContext(media, userMessage) {
  await ensureMediaFile(media);

  const temporaryDirectory = path.join(
    config.storage.framesDir,
    "chat-documents",
    media.id,
    uuidv4()
  );

  try {
    await fs.mkdir(
      temporaryDirectory,
      {
        recursive: true,
      }
    );

    const rendered =
      await renderPdfPages(
        media.path,
        temporaryDirectory,
        {
          maxPages: 20,
          scale: 1.5,
          quality: 85,
          onProgress: (progress) => {
            console.log(
              `[Chat Document ${media.id}] Rendering ${progress.current}/${progress.total}`
            );
          },
        }
      );

    if (
      !rendered.pages ||
      rendered.pages.length === 0
    ) {
      const error = new Error(
        `No document pages rendered: ${media.id}`
      );

      error.statusCode = 422;
      error.publicMessage =
        `The document "${media.original_name}" could not be rendered.`;

      throw error;
    }

    const analysis =
      await analyzeDocumentPages(
        rendered.pages,
        {
          userQuestion: userMessage,
          maxPages: 12,
          onProgress: (progress) => {
            console.log(
              `[Chat Document ${media.id}] Analyzing ${progress.current}/${progress.total}`
            );
          },
        }
      );

    return {
      mediaId: media.id,
      name: media.original_name,
      type: "document",
      analysis,
    };
  } finally {
    await fs.rm(
      temporaryDirectory,
      {
        recursive: true,
        force: true,
      }
    );
  }
}

/**
 * Build multimodal context for all referenced media.
 *
 * Each media type is processed by its appropriate pipeline.
 */
async function buildMediaContexts(
  mediaRecords,
  userMessage
) {
  const contexts = [];

  for (const media of mediaRecords) {
    let context;

    switch (media.media_type) {
      case "image":
        context = await buildImageContext(
          media,
          userMessage
        );
        break;

      case "video":
        context = await buildVideoContext(
          media,
          userMessage
        );
        break;

      case "audio":
        context = await buildAudioContext(
          media,
          userMessage
        );
        break;

      case "document":
        context = await buildDocumentContext(
          media,
          userMessage
        );
        break;

      default: {
        const error = new Error(
          `Unsupported media type: ${media.media_type}`
        );

        error.statusCode = 400;
        error.publicMessage =
          `The media type "${media.media_type}" is not supported in chat.`;

        throw error;
      }
    }

    contexts.push(context);
  }

  return contexts;
}

/**
 * Convert multimodal analysis results into a compact prompt
 * for the final answer.
 */
function buildMediaPrompt(mediaContexts) {
  if (!mediaContexts.length) {
    return "";
  }

  const sections = mediaContexts.map(
    (context, index) => {
      const header =
        `Media ${index + 1}: ${context.name} (${context.type})`;

      if (context.type === "image") {
        return `
${header}

Visual understanding:
${context.answer}
`.trim();
      }

      if (context.type === "video") {
        return `
${header}

Video duration:
${context.duration ?? "unknown"} seconds

Frames extracted:
${context.framesExtracted}

Visual analysis:
${JSON.stringify(
  context.visualAnalysis,
  null,
  2
)}

Transcript:
${context.transcript || "No transcript available."}
`.trim();
      }

      if (context.type === "audio") {
        return `
${header}

Transcript:
${context.transcript}

Transcript segments:
${JSON.stringify(
  context.transcriptSegments,
  null,
  2
)}

Audio analysis:
${JSON.stringify(
  context.analysis,
  null,
  2
)}
`.trim();
      }

      if (context.type === "document") {
        return `
${header}

Document analysis:
${JSON.stringify(
  context.analysis,
  null,
  2
)}
`.trim();
      }

      return header;
    }
  );

  return sections.join("\n\n---\n\n");
}

/**
 * Build the final unified multimodal prompt.
 */
function buildUnifiedPrompt({
  contextText,
  mediaText,
  userMessage,
}) {
  return `
You are a helpful multimodal AI assistant.

You can reason over:
- conversation history
- images
- videos
- audio transcripts
- documents/PDFs
- combinations of these media types

Use the provided media context when answering the user's question.

Important rules:
- Answer based on the provided conversation and media context.
- If the requested information is not present in the provided media or conversation, say so clearly.
- Do not invent details.
- When multiple media files are referenced, compare or connect them when the user asks you to.
- Keep the answer natural and directly address the user's question.
- Do not mention internal implementation details unless explicitly asked.

Conversation history:
${contextText || "(No previous conversation.)"}

Referenced media:
${mediaText || "(No media referenced.)"}

Current user message:
${userMessage}

Answer the current user message.
`.trim();
}

/**
 * POST /api/chat
 *
 * Send a message in a conversation.
 *
 * Body:
 * {
 *   conversationId?: string,
 *   message: string,
 *   mediaIds?: string[]
 * }
 */
router.post("/", async (req, res, next) => {
  try {
    const {
      conversationId,
      message,
      mediaIds = [],
    } = req.body || {};

    if (
      !message ||
      typeof message !== "string"
    ) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Message is required.",
        },
      });
    }

    const trimmedMessage =
      message.trim();

    if (!trimmedMessage) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Message cannot be empty.",
        },
      });
    }

    if (
      trimmedMessage.length > 10000
    ) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            "Message is too long. Maximum length is 10,000 characters.",
        },
      });
    }

    if (!Array.isArray(mediaIds)) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            "mediaIds must be an array.",
        },
      });
    }

    /*
     * Limit the number of referenced files
     * to keep one chat request manageable.
     */
    if (mediaIds.length > 8) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            "You can reference up to 8 media files in one message.",
        },
      });
    }

    /*
     * Create or load conversation.
     */
    let conversation;

    if (conversationId) {
      conversation =
        getConversation(
          conversationId
        );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: {
            message:
              "Conversation not found.",
          },
        });
      }
    } else {
      conversation =
        createConversation(
          trimmedMessage.slice(0, 50)
        );
    }

    /*
     * Save user message before building context.
     */
    const userMessage =
      addMessage(
        conversation.id,
        "user",
        trimmedMessage,
        mediaIds
      );

    /*
     * Build conversation history.
     */
    const contextMessages =
      getContextMessages(
        conversation.id,
        20
      );

    const contextText =
      buildContextText(
        contextMessages
      );

    /*
     * Load and process all referenced media.
     */
    const mediaRecords =
      mediaIds.length > 0
        ? getMediaRecords(mediaIds)
        : [];

    const mediaContexts =
      mediaRecords.length > 0
        ? await buildMediaContexts(
            mediaRecords,
            trimmedMessage
          )
        : [];

    const mediaText =
      buildMediaPrompt(
        mediaContexts
      );

    /*
     * Build final prompt.
     */
    const prompt =
      buildUnifiedPrompt({
        contextText,
        mediaText,
        userMessage:
          trimmedMessage,
      });

    /*
     * Generate final answer.
     */
    const answer =
      await generateText(prompt);

    /*
     * Save assistant response.
     */
    const assistantMessage =
      addMessage(
        conversation.id,
        "assistant",
        answer,
        mediaIds
      );

    return res.json({
      success: true,
      conversationId:
        conversation.id,
      userMessage,
      assistantMessage,
    });
  } catch (error) {
    console.error(
      "Chat error:",
      error
    );

    next(error);
  }
});

/**
 * GET /api/chat/stream
 *
 * Stream a text-only Gemini response using SSE.
 *
 * The frontend currently uses the normal POST endpoint
 * whenever media is referenced, so multimodal requests do
 * not go through this endpoint.
 */
router.get(
  "/stream",
  async (req, res) => {
    let assistantText = "";

    try {
      const {
        conversationId,
        message,
        mediaIds: mediaIdsQuery,
      } = req.query;

      if (
        !message ||
        typeof message !== "string"
      ) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              "Message is required.",
          },
        });
      }

      const trimmedMessage =
        message.trim();

      if (!trimmedMessage) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              "Message cannot be empty.",
          },
        });
      }

      const mediaIds =
        mediaIdsQuery
          ? String(mediaIdsQuery)
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
          : [];

      /*
       * Media requests use POST /api/chat.
       *
       * Keeping SSE text-only avoids pretending that
       * streamText can directly consume our processed
       * video/audio/document contexts.
       */
      if (mediaIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              "Media chat requests must use the standard chat endpoint.",
          },
        });
      }

      let conversation;

      if (conversationId) {
        conversation =
          getConversation(
            conversationId
          );

        if (!conversation) {
          return res.status(404).json({
            success: false,
            error: {
              message:
                "Conversation not found.",
            },
          });
        }
      } else {
        conversation =
          createConversation(
            trimmedMessage.slice(0, 50)
          );
      }

      addMessage(
        conversation.id,
        "user",
        trimmedMessage,
        []
      );

      const contextMessages =
        getContextMessages(
          conversation.id,
          20
        );

      const contextText =
        buildContextText(
          contextMessages
        );

      const prompt =
        buildUnifiedPrompt({
          contextText,
          mediaText: "",
          userMessage:
            trimmedMessage,
        });

      res.status(200);

      res.setHeader(
        "Content-Type",
        "text/event-stream"
      );

      res.setHeader(
        "Cache-Control",
        "no-cache, no-transform"
      );

      res.setHeader(
        "Connection",
        "keep-alive"
      );

      res.setHeader(
        "X-Accel-Buffering",
        "no"
      );

      res.flushHeaders();

      res.write(
        `event: start\ndata: ${JSON.stringify({
          conversationId:
            conversation.id,
        })}\n\n`
      );

      await streamText(
        prompt,
        (chunk) => {
          if (res.writableEnded) {
            return;
          }

          assistantText += chunk;

          res.write(
            `event: token\ndata: ${JSON.stringify({
              text: chunk,
            })}\n\n`
          );
        }
      );

      const assistantMessage =
        addMessage(
          conversation.id,
          "assistant",
          assistantText,
          []
        );

      res.write(
        `event: done\ndata: ${JSON.stringify({
          message:
            assistantMessage,
        })}\n\n`
      );

      res.end();
    } catch (error) {
      console.error(
        "SSE chat error:",
        error
      );

      if (!res.headersSent) {
        return res
          .status(
            error.statusCode || 500
          )
          .json({
            success: false,
            error: {
              message:
                error.publicMessage ||
                "Chat streaming failed.",
            },
          });
      }

      if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            message:
              error.publicMessage ||
              "Chat streaming failed.",
          })}\n\n`
        );

        res.end();
      }
    }
  }
);

export default router;