import express from "express";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import config from "../config.js";
import db from "../models/database.js";
import handleUpload from "../middleware/upload.js";
import {
  FileValidationError,
  validateFile,
} from "../services/file-validator.js";
import {
  createThumbnail,
  getImageMetadata,
} from "../services/image-processor.js";

const router = express.Router();

const ensureDirectory = async (directory) => {
  await fs.mkdir(directory, { recursive: true });
};

const getDateFolder = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return path.join(String(year), month, day);
};

router.post("/", handleUpload, async (req, res, next) => {
  let originalFilePath = null;
  let thumbnailPath = null;

  try {
    if (!req.file) {
      throw new FileValidationError(
        "No file was uploaded. Please select a file."
      );
    }

    // Validate actual file contents.
    const validation = await validateFile(req.file);

    const mediaId = uuidv4();
    const dateFolder = getDateFolder();

    const uploadDirectory = path.join(
      config.storage.uploadsDir,
      dateFolder
    );

    const thumbnailDirectory = path.join(
      config.storage.thumbnailsDir,
      dateFolder
    );

    await ensureDirectory(uploadDirectory);
    await ensureDirectory(thumbnailDirectory);

    const extension = validation.extension || "bin";
    const storedName = `${mediaId}.${extension}`;

    originalFilePath = path.join(uploadDirectory, storedName);

    await fs.writeFile(originalFilePath, req.file.buffer);

    let metadata = {
      originalMimeType: req.file.mimetype,
      detectedMimeType: validation.mimeType,
      extension,
    };

    // Image-specific processing.
    if (validation.mediaType === "image") {
      const imageMetadata = await getImageMetadata(req.file.buffer);

      metadata = {
        ...metadata,
        ...imageMetadata,
      };

      const thumbnailBuffer = await createThumbnail(req.file.buffer);

      thumbnailPath = path.join(
        thumbnailDirectory,
        `${mediaId}.jpg`
      );

      await fs.writeFile(thumbnailPath, thumbnailBuffer);
    }

    const now = new Date().toISOString();

    const insertMedia = db.prepare(`
      INSERT INTO media (
        id,
        conversation_id,
        original_name,
        stored_name,
        mime_type,
        media_type,
        size,
        path,
        thumbnail_path,
        status,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @conversation_id,
        @original_name,
        @stored_name,
        @mime_type,
        @media_type,
        @size,
        @path,
        @thumbnail_path,
        @status,
        @metadata,
        @created_at,
        @updated_at
      )
    `);

    insertMedia.run({
      id: mediaId,
      conversation_id: req.body.conversationId || null,
      original_name: req.file.originalname,
      stored_name: storedName,
      mime_type: validation.mimeType,
      media_type: validation.mediaType,
      size: validation.size,
      path: originalFilePath,
      thumbnail_path: thumbnailPath,
      status: "uploaded",
      metadata: JSON.stringify(metadata),
      created_at: now,
      updated_at: now,
    });

    return res.status(201).json({
      success: true,
      media: {
        id: mediaId,
        originalName: req.file.originalname,
        storedName,
        mimeType: validation.mimeType,
        mediaType: validation.mediaType,
        size: validation.size,
        status: "uploaded",
        metadata,
      },
    });
  } catch (error) {
    // If database/storage processing fails after the original file
    // was written, don't leave an orphaned file behind.
    try {
      if (originalFilePath) {
        await fs.rm(originalFilePath, { force: true });
      }

      if (thumbnailPath) {
        await fs.rm(thumbnailPath, { force: true });
      }
    } catch (cleanupError) {
      console.error("Upload cleanup failed:", cleanupError);
    }

    next(error);
  }
});

export default router;