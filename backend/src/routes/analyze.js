import express from "express";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import config from "../config.js";
import { extractFrames } from "../services/video-processor.js";
import { analyzeVideoFrames } from "../services/video-analyzer.js";
import { analyzeTranscript } from "../services/audio-analyzer.js";

import db from "../models/database.js";
import {
  prepareImageForVision,
} from "../services/image-processor.js";

import {
  analyzeImage,
} from "../services/vision.js";

import {
  extractAudioFromVideo,
  transcribeAudio,
} from "../services/audio-processor.js";

import {
  renderPdfPages,
} from "../services/document-parser.js";

import {
  analyzeDocumentPages,
} from "../services/document-analyzer.js";

import {
  analyzeImageComparison,
  analyzeImageBatch,
} from "../services/comparison-analyzer.js";

const router = express.Router();

const persistAnalysisMessage = ({
  media,
  content,
  mediaRefs = [],
  metadata = {},
}) => {
  const conversationId = media?.conversation_id;

  // Analysis can only be saved if the media belongs to a conversation.
  if (!conversationId) {
    console.warn(
      `Skipping analysis history save: media ${media?.id || "unknown"} has no conversation.`
    );

    return null;
  }

  const messageId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (
      id,
      conversation_id,
      role,
      content,
      media_refs,
      metadata,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    conversationId,
    "assistant",
    content,
    JSON.stringify(mediaRefs),
    JSON.stringify(metadata),
    now
  );

  return messageId;
};

router.post("/image", async (req, res, next) => {
  try {
    const { mediaId, question } = req.body;

    // -----------------------------
    // Validate request
    // -----------------------------

    if (!mediaId || typeof mediaId !== "string") {
      const error = new Error("mediaId is required.");
      error.statusCode = 400;
      error.publicMessage = "Please provide an image to analyze.";
      throw error;
    }

    if (!question || typeof question !== "string") {
      const error = new Error("Question is required.");
      error.statusCode = 400;
      error.publicMessage = "Please enter a question about the image.";
      throw error;
    }

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      const error = new Error("Question cannot be empty.");
      error.statusCode = 400;
      error.publicMessage = "Please enter a question about the image.";
      throw error;
    }

    // -----------------------------
    // Find media in SQLite
    // -----------------------------

    const media = db
      .prepare(`
        SELECT
          id,
          conversation_id,
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
        "The selected image could not be found.";
      throw error;
    }

    // -----------------------------
    // Make sure it is an image
    // -----------------------------

    if (media.media_type !== "image") {
      const error = new Error(
        `Media ${mediaId} is not an image.`
      );

      error.statusCode = 400;
      error.publicMessage =
        "Visual Q&A is only available for images.";
      throw error;
    }

    // -----------------------------
    // Check stored file
    // -----------------------------

    let imageBuffer;

    try {
      imageBuffer = await fs.readFile(media.path);
    } catch (error) {
      console.error(
        "Failed to read stored image:",
        error
      );

      const fileError = new Error(
        `Stored image could not be read: ${media.path}`
      );

      fileError.statusCode = 404;
      fileError.publicMessage =
        "The image file is no longer available.";
      throw fileError;
    }

    if (!imageBuffer.length) {
      const error = new Error(
        "Stored image is empty."
      );

      error.statusCode = 422;
      error.publicMessage =
        "The selected image is empty or corrupted.";
      throw error;
    }

    // -----------------------------
    // Optimize image for Gemini
    // -----------------------------

    let optimizedImage;

    try {
      optimizedImage =
        await prepareImageForVision(imageBuffer);
    } catch (error) {
      console.error(
        "Image processing failed:",
        error
      );

      const processingError = new Error(
        `Image processing failed: ${error.message}`
      );

      processingError.statusCode = 422;
      processingError.publicMessage =
        "The selected image could not be processed.";
      throw processingError;
    }

    // Sharp converts the image to JPEG,
    // so the MIME type must also be JPEG.
    const answer = await analyzeImage(
      optimizedImage,
      "image/jpeg",
      trimmedQuestion
    );

    persistAnalysisMessage({
  media,
  content: `Image analysis for "${media.original_name}":\n\nQuestion: ${trimmedQuestion}\n\n${answer}`,
  mediaRefs: [media.id],
  metadata: {
    type: "image_analysis",
    mediaId: media.id,
    originalName: media.original_name,
    question: trimmedQuestion,
    answer,
  },
});

    // -----------------------------
    // Return result
    // -----------------------------

    return res.status(200).json({
      success: true,
      analysis: {
        mediaId: media.id,
        question: trimmedQuestion,
        answer,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/video", async (req, res, next) => {
  let frameDirectory = null;
  let audioOutputPath = null;

  try {
    const { mediaId, question } = req.body;

    if (!mediaId || typeof mediaId !== "string") {
      const error = new Error("mediaId is required.");
      error.statusCode = 400;
      error.publicMessage =
        "Please provide the ID of the uploaded video.";
      throw error;
    }

    if (
      question !== undefined &&
      question !== null &&
      typeof question !== "string"
    ) {
      const error = new Error("question must be a string.");
      error.statusCode = 400;
      error.publicMessage =
        "The video question must be valid text.";
      throw error;
    }

    const media = db
      .prepare(
        `
        SELECT
          id,
          conversation_id,
          original_name,
          mime_type,
          media_type,
          size,
          path,
          status,
          metadata
        FROM media
        WHERE id = ?
        `
      )
      .get(mediaId);

    if (!media) {
      const error = new Error("Video media was not found.");
      error.statusCode = 404;
      error.publicMessage =
        "The requested video could not be found.";
      throw error;
    }

    if (media.media_type !== "video") {
      const error = new Error(
        `Media ${mediaId} is not a video.`
      );
      error.statusCode = 400;
      error.publicMessage =
        "The selected media is not a video.";
      throw error;
    }

    try {
      await fs.access(media.path);
    } catch {
      const error = new Error(
        `Video file does not exist: ${media.path}`
      );
      error.statusCode = 404;
      error.publicMessage =
        "The uploaded video file is no longer available.";
      throw error;
    }

    frameDirectory = path.join(
      config.storage.framesDir,
      "analysis",
      mediaId,
      uuidv4()
    );

    await fs.mkdir(frameDirectory, {
      recursive: true,
    });

    const extraction = await extractFrames(
      media.path,
      frameDirectory,
      {
        intervalSeconds: 5,
        maxFrames: 120,
        frameWidth: 1280,
        onProgress: (progress) => {
          console.log(
            `[Video ${mediaId}] Extracting frames: ${progress.current}/${progress.total}`
          );
        },
      }
    );

    if (
      !extraction.frames ||
      extraction.frames.length === 0
    ) {
      const error = new Error(
        "No frames were extracted from the video."
      );
      error.statusCode = 422;
      error.publicMessage =
        "No usable frames could be extracted from this video.";
      throw error;
    }

    const analysis = await analyzeVideoFrames(
      extraction.frames,
      {
        userQuestion: question?.trim() || null,
        maxFrames: 12,
        onProgress: (progress) => {
          console.log(
            `[Video ${mediaId}] Preparing frames: ${progress.current}/${progress.total}`
          );
        },
      }
    );

    // -----------------------------
    // Extract audio + transcribe
    // -----------------------------

    let transcript = null;
    let transcriptSegments = [];
    let audioMetadata = null;

    audioOutputPath = path.join(
      frameDirectory,
      "audio.wav"
    );

    try {
      const extractedAudio =
        await extractAudioFromVideo(
          media.path,
          audioOutputPath
        );

      audioMetadata = {
        format: extractedAudio.format,
        sampleRate: extractedAudio.sampleRate,
        channels: extractedAudio.channels,
        size: extractedAudio.size,
      };

      console.log(
        `[Video ${mediaId}] Audio extracted successfully.`
      );

      try {
        const transcription =
          await transcribeAudio(
            audioOutputPath
          );

        transcript = transcription.text;
        transcriptSegments =
          transcription.segments || [];

        console.log(
          `[Video ${mediaId}] Audio transcription completed.`
        );
      } catch (transcriptionError) {
        if (transcriptionError.statusCode === 503) {
          console.warn(
            `[Video ${mediaId}] Whisper transcription skipped: API key is not configured.`
          );
        } else {
          throw transcriptionError;
        }
      }
    } catch (audioError) {
      console.warn(
        `[Video ${mediaId}] Audio processing skipped: ${audioError.message}`
      );
    }

    const existingMetadata = (() => {
      try {
        return media.metadata
          ? JSON.parse(media.metadata)
          : {};
      } catch {
        return {};
      }
    })();

    const updatedMetadata = {
      ...existingMetadata,
      video: {
        ...extraction.metadata,
        frameIntervalSeconds:
          extraction.intervalSeconds,
        framesExtracted:
          extraction.totalFrames,
        framesAnalyzed:
          analysis.framesAnalyzed,
      },
    };

    const now = new Date().toISOString();

    db.prepare(
      `
      UPDATE media
      SET
        status = ?,
        metadata = ?,
        updated_at = ?
      WHERE id = ?
      `
    ).run(
      "analyzed",
      JSON.stringify(updatedMetadata),
      now,
      mediaId
    );

    persistAnalysisMessage({
  media,
  content: `Video analysis for "${media.original_name}":\n\n${
    analysis.summary || "Video analysis completed."
  }`,
  mediaRefs: [media.id],
  metadata: {
    type: "video_analysis",
    mediaId: media.id,
    originalName: media.original_name,
    question: question?.trim() || null,
    analysis: {
      ...analysis,
      transcript,
      transcriptSegments,
      audio: audioMetadata,
      duration: extraction.metadata.duration,
      framesExtracted: extraction.totalFrames,
      framesAnalyzed: analysis.framesAnalyzed,
    },
  },
});

    return res.status(200).json({
  success: true,
  analysis: {
    mediaId,
    originalName: media.original_name,
    duration: extraction.metadata.duration,

    framesExtracted: extraction.totalFrames,
    framesAnalyzed: analysis.framesAnalyzed,

    summary: analysis.summary,
    frames: analysis.frames,

    transcript,
    transcriptSegments,

    audio: audioMetadata,
  },
});
  } catch (error) {
    next(error);
  } finally {
    if (frameDirectory) {
      try {
        await fs.rm(frameDirectory, {
          recursive: true,
          force: true,
        });
      } catch (cleanupError) {
        console.error(
          "Failed to clean up video analysis frames:",
          cleanupError.message
        );
      }
    }
  }
});

router.post("/audio", async (req, res, next) => {
  let audioOutputPath = null;

  try {
    const { mediaId, question } = req.body;

    // -----------------------------
    // Validate request
    // -----------------------------

    if (!mediaId || typeof mediaId !== "string") {
      const error = new Error("mediaId is required.");
      error.statusCode = 400;
      error.publicMessage =
        "Please provide the ID of the uploaded audio.";
      throw error;
    }

    if (
      question !== undefined &&
      question !== null &&
      typeof question !== "string"
    ) {
      const error = new Error("question must be a string.");
      error.statusCode = 400;
      error.publicMessage =
        "The audio question must be valid text.";
      throw error;
    }

    // -----------------------------
    // Find media
    // -----------------------------

    const media = db
      .prepare(
        `
        SELECT
          id,
          conversation_id,
          original_name,
          mime_type,
          media_type,
          size,
          path,
          status,
          metadata
        FROM media
        WHERE id = ?
        `
      )
      .get(mediaId);

    if (!media) {
      const error = new Error("Audio media was not found.");
      error.statusCode = 404;
      error.publicMessage =
        "The requested audio could not be found.";
      throw error;
    }

    // -----------------------------
    // Make sure it is audio
    // -----------------------------

    if (media.media_type !== "audio") {
      const error = new Error(
        `Media ${mediaId} is not audio.`
      );

      error.statusCode = 400;
      error.publicMessage =
        "The selected media is not an audio file.";
      throw error;
    }

    // -----------------------------
    // Check stored file
    // -----------------------------

    try {
      await fs.access(media.path);
    } catch {
      const error = new Error(
        `Audio file does not exist: ${media.path}`
      );

      error.statusCode = 404;
      error.publicMessage =
        "The uploaded audio file is no longer available.";
      throw error;
    }

    // -----------------------------
    // Extract transcript
    // -----------------------------

    try {
      const transcription =
        await transcribeAudio(media.path);

      const transcript =
        transcription.text;

      const transcriptSegments =
        transcription.segments || [];

      // -----------------------------
      // Analyze transcript
      // -----------------------------

      const analysis =
        await analyzeTranscript(
          transcript,
          {
            userQuestion:
              question?.trim() || null,
          }
        );

      // -----------------------------
      // Update metadata
      // -----------------------------

      const existingMetadata = (() => {
        try {
          return media.metadata
            ? JSON.parse(media.metadata)
            : {};
        } catch {
          return {};
        }
      })();

      const updatedMetadata = {
        ...existingMetadata,
        audio: {
          duration:
            transcription.duration || null,
          language:
            transcription.language || null,
          transcriptAvailable: true,
        },
        analysis,
      };

      const now =
        new Date().toISOString();

      db.prepare(
        `
        UPDATE media
        SET
          status = ?,
          metadata = ?,
          updated_at = ?
        WHERE id = ?
        `
      ).run(
        "analyzed",
        JSON.stringify(updatedMetadata),
        now,
        mediaId
      );

      persistAnalysisMessage({
  media,
  content: `Audio analysis for "${media.original_name}":\n\n${
    analysis.summary || "Audio analysis completed."
  }`,
  mediaRefs: [media.id],
  metadata: {
    type: "audio_analysis",
    mediaId: media.id,
    originalName: media.original_name,
    question: question?.trim() || null,
    analysis: {
      transcript,
      transcriptSegments,
      summary: analysis.summary,
      topics: analysis.topics,
      sentiment: analysis.sentiment,
    },
  },
});

      return res.status(200).json({
        success: true,
        analysis: {
          mediaId,
          originalName:
            media.original_name,
          transcript,
          transcriptSegments,
          summary:
            analysis.summary,
          topics:
            analysis.topics,
          sentiment:
            analysis.sentiment,
        },
      });
    } catch (error) {
      throw error;
    }
  } catch (error) {
    next(error);
  } finally {
    if (audioOutputPath) {
      try {
        await fs.rm(audioOutputPath, {
          force: true,
        });
      } catch (cleanupError) {
        console.error(
          "Failed to clean temporary audio:",
          cleanupError.message
        );
      }
    }
  }
});

router.post("/document", async (req, res, next) => {
  let documentDirectory = null;

  try {
    const { mediaId, question = null } = req.body;

    if (!mediaId) {
      const error = new Error(
        "mediaId is required."
      );

      error.statusCode = 400;
      error.publicMessage =
        "Please provide the document media ID.";

      throw error;
    }

    const media = db
      .prepare(
        `
        SELECT *
        FROM media
        WHERE id = ?
        `
      )
      .get(mediaId);

    if (!media) {
      const error = new Error(
        `Media not found: ${mediaId}`
      );

      error.statusCode = 404;
      error.publicMessage =
        "The requested document could not be found.";

      throw error;
    }

    if (media.media_type !== "document") {
      const error = new Error(
        `Media ${mediaId} is not a document.`
      );

      error.statusCode = 400;
      error.publicMessage =
        "The selected media is not a PDF/document.";

      throw error;
    }

    try {
      await fs.access(media.path);
    } catch {
      const error = new Error(
        `Document file does not exist: ${media.path}`
      );

      error.statusCode = 404;
      error.publicMessage =
        "The document file is no longer available.";

      throw error;
    }

    documentDirectory = path.join(
      config.storage.framesDir,
      "documents",
      mediaId,
      uuidv4()
    );

    await fs.mkdir(documentDirectory, {
      recursive: true,
    });

    console.log(
      `[Document ${mediaId}] Rendering PDF pages...`
    );

    const rendered = await renderPdfPages(
      media.path,
      documentDirectory,
      {
        maxPages: 20,
        scale: 1.5,
        quality: 85,
        onProgress: (progress) => {
          console.log(
            `[Document ${mediaId}] Rendering ${progress.current}/${progress.total}`
          );
        },
      }
    );

    console.log(
      `[Document ${mediaId}] Rendering completed: ${rendered.pagesRendered} pages`
    );

    const analysis = await analyzeDocumentPages(
      rendered.pages,
      {
        userQuestion: question,
        maxPages: 12,
        onProgress: (progress) => {
          console.log(
            `[Document ${mediaId}] AI analysis ${progress.current}/${progress.total}`
          );
        },
      }
    );

    db.prepare(
      `
      UPDATE media
      SET metadata = ?,
          status = 'analyzed'
      WHERE id = ?
      `
    ).run(
      JSON.stringify({
        ...(media.metadata
          ? JSON.parse(media.metadata)
          : {}),
        documentAnalysis: {
          pagesRendered: rendered.pagesRendered,
          pagesAnalyzed: analysis.pagesAnalyzed,
          totalPagesAvailable:
            analysis.totalPagesAvailable,
        },
      }),
      mediaId
    );

    res.json({
      success: true,
      mediaId,
      analysis,
    });

    persistAnalysisMessage({
  media,
  content: `Document analysis for "${media.original_name}":\n\n${
    analysis.summary || "Document analysis completed."
  }`,
  mediaRefs: [media.id],
  metadata: {
    type: "document_analysis",
    mediaId: media.id,
    originalName: media.original_name,
    question,
    analysis,
  },
});
  } catch (error) {
    next(error);
  } finally {
    if (documentDirectory) {
      try {
        await fs.rm(documentDirectory, {
          recursive: true,
          force: true,
        });

        console.log(
          `[Document ${req.body?.mediaId || "unknown"}] Temporary pages cleaned up.`
        );
      } catch (cleanupError) {
        console.error(
          "Document temporary directory cleanup failed:",
          cleanupError.message
        );
      }
    }
  }
});

router.post("/compare", async (req, res, next) => {
  try {
    const {
      mediaIds,
      question = null,
    } = req.body;

    if (!Array.isArray(mediaIds)) {
      const error = new Error(
        "mediaIds must be an array."
      );

      error.statusCode = 400;
      error.publicMessage =
        "Please provide the image IDs to compare.";

      throw error;
    }

    if (mediaIds.length < 2) {
      const error = new Error(
        "At least two media IDs are required."
      );

      error.statusCode = 400;
      error.publicMessage =
        "Please select at least two images to compare.";

      throw error;
    }

    const uniqueMediaIds = [
      ...new Set(mediaIds),
    ];

    const images = [];

    for (const mediaId of uniqueMediaIds) {
      const media = db
        .prepare(
          `
          SELECT
            id,
            conversation_id,
            original_name,
            mime_type,
            media_type,
            size,
            path,
            status,
            metadata
          FROM media
          WHERE id = ?
          `
        )
        .get(mediaId);

      if (!media) {
        const error = new Error(
          `Media not found: ${mediaId}`
        );

        error.statusCode = 404;
        error.publicMessage =
          `Image ${mediaId} could not be found.`;

        throw error;
      }

      if (media.media_type !== "image") {
        const error = new Error(
          `Media ${mediaId} is not an image.`
        );

        error.statusCode = 400;
        error.publicMessage =
          "Comparison is only available for images.";

        throw error;
      }

      try {
        await fs.access(media.path);
      } catch {
        const error = new Error(
          `Image file does not exist: ${media.path}`
        );

        error.statusCode = 404;
        error.publicMessage =
          "One of the selected images is no longer available.";

        throw error;
      }

      images.push(media);
    }

    const analysis =
      await analyzeImageComparison(
        images,
        {
          userQuestion:
            typeof question === "string"
              ? question.trim() || null
              : null,
        }
      );

      const comparisonConversationId =
  images.find((image) => image.conversation_id)
    ?.conversation_id || null;

if (comparisonConversationId) {
  const comparisonMessageId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (
      id,
      conversation_id,
      role,
      content,
      media_refs,
      metadata,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    comparisonMessageId,
    comparisonConversationId,
    "assistant",
    `Image comparison${
      question?.trim()
        ? ` — ${question.trim()}`
        : ""
    }:\n\n${analysis.summary || "Comparison completed."}`,
    JSON.stringify(
      images.map((image) => image.id)
    ),
    JSON.stringify({
      type: "comparison_analysis",
      question:
        typeof question === "string"
          ? question.trim() || null
          : null,
      analysis,
      mediaIds: images.map(
        (image) => image.id
      ),
    }),
    now
  );
}

    return res.status(200).json({
      success: true,
      analysis,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/batch", async (req, res, next) => {
  try {
    const {
      mediaIds,
      question,
    } = req.body;

    if (!Array.isArray(mediaIds)) {
      const error = new Error(
        "mediaIds must be an array."
      );

      error.statusCode = 400;
      error.publicMessage =
        "Please provide the image IDs for batch analysis.";

      throw error;
    }

    if (mediaIds.length === 0) {
      const error = new Error(
        "At least one media ID is required."
      );

      error.statusCode = 400;
      error.publicMessage =
        "Please select at least one image.";

      throw error;
    }

    if (
      typeof question !== "string" ||
      !question.trim()
    ) {
      const error = new Error(
        "A question is required."
      );

      error.statusCode = 400;
      error.publicMessage =
        "Please enter a question to run across the images.";

      throw error;
    }

    const uniqueMediaIds = [
      ...new Set(mediaIds),
    ];

    const images = [];

    for (const mediaId of uniqueMediaIds) {
      const media = db
        .prepare(
          `
          SELECT
            id,
            conversation_id,
            original_name,
            mime_type,
            media_type,
            size,
            path,
            status,
            metadata
          FROM media
          WHERE id = ?
          `
        )
        .get(mediaId);

      if (!media) {
        const error = new Error(
          `Media not found: ${mediaId}`
        );

        error.statusCode = 404;
        error.publicMessage =
          `Image ${mediaId} could not be found.`;

        throw error;
      }

      if (media.media_type !== "image") {
        const error = new Error(
          `Media ${mediaId} is not an image.`
        );

        error.statusCode = 400;
        error.publicMessage =
          "Batch analysis is only available for images.";

        throw error;
      }

      try {
        await fs.access(media.path);
      } catch {
        const error = new Error(
          `Image file does not exist: ${media.path}`
        );

        error.statusCode = 404;
        error.publicMessage =
          "One of the selected images is no longer available.";

        throw error;
      }

      images.push(media);
    }

    const analysis =
      await analyzeImageBatch(
        images,
        {
          userQuestion:
            question.trim(),
          onProgress: (progress) => {
            console.log(
              `[Batch] Analyzing image ${progress.current}/${progress.total}`
            );
          },
        }
      );

    return res.status(200).json({
      success: true,
      analysis,
    });
  } catch (error) {
    next(error);
  }
});

export default router;