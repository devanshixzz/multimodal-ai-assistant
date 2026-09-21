import express from "express";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";

import config from "../config.js";
import db from "../models/database.js";

const router = express.Router();

/**
 * Find a media record by ID.
 */
function getMedia(mediaId) {
  return db
    .prepare(
      `
      SELECT *
      FROM media
      WHERE id = ?
      `
    )
    .get(mediaId);
}

/**
 * Safely check that a requested file exists and is a regular file.
 */
async function getFileStats(filePath) {
  try {
    const stats = await fsPromises.stat(filePath);

    if (!stats.isFile()) {
      return null;
    }

    return stats;
  } catch {
    return null;
  }
}

/**
 * Delete all physical files associated with a media record.
 *
 * This is shared by:
 * - manual DELETE /api/media/:id
 * - automatic 24-hour cleanup
 */
async function deleteMediaFiles(media) {
  if (media.path) {
    await fsPromises.rm(media.path, {
      force: true,
    });
  }

  if (media.thumbnail_path) {
    await fsPromises.rm(media.thumbnail_path, {
      force: true,
    });
  }

  const frameDirectory = path.join(
    config.storage.framesDir,
    media.id
  );

  await fsPromises.rm(frameDirectory, {
    recursive: true,
    force: true,
  });
}

/**
 * Remove media older than the configured retention period.
 *
 * Default retention:
 * 24 hours
 *
 * This cleans:
 * - original uploaded file
 * - thumbnail
 * - extracted video frames
 * - database record
 */
export async function cleanupExpiredMedia() {
  const maxAgeHours = config.cleanup.maxAgeHours;

  const expiredMedia = db
    .prepare(
      `
      SELECT *
      FROM media
      WHERE datetime(created_at) < datetime(
        'now',
        ?
      )
      `
    )
    .all(`-${maxAgeHours} hours`);

  let deletedCount = 0;

  for (const media of expiredMedia) {
    try {
      await deleteMediaFiles(media);

      db.prepare(
        `
        DELETE FROM media
        WHERE id = ?
        `
      ).run(media.id);

      deletedCount += 1;
    } catch (error) {
      console.error(
        `[Cleanup] Failed to delete media ${media.id}:`,
        error
      );
    }
  }

  if (deletedCount > 0) {
    console.log(
      `[Cleanup] Removed ${deletedCount} expired media file(s).`
    );
  }

  return deletedCount;
}

/**
 * Serve a media file.
 *
 * Range requests are important for HTML5 video because browsers
 * commonly request only portions of large video files.
 */
router.get("/:id", async (req, res, next) => {
  try {
    const media = getMedia(req.params.id);

    if (!media) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Media not found.",
        },
      });
    }

    const filePath = media.path;
    const stats = await getFileStats(filePath);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: {
          message: "The media file could not be found on disk.",
        },
      });
    }

    const fileSize = stats.size;
    const range = req.headers.range;

    res.setHeader(
      "Content-Type",
      media.mime_type || "application/octet-stream"
    );

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(
        media.original_name
      )}"`
    );

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=3600");

    /*
     * Normal request.
     */
    if (!range) {
      res.setHeader("Content-Length", fileSize);

      const stream = fs.createReadStream(filePath);

      stream.on("error", next);

      return stream.pipe(res);
    }

    /*
     * Parse HTTP byte range.
     *
     * Examples:
     *   bytes=0-999
     *   bytes=1000-
     *   bytes=-500
     */
    const rangeMatch = range.match(
      /^bytes=(\d*)-(\d*)$/
    );

    if (!rangeMatch) {
      res.setHeader("Content-Range", `bytes */${fileSize}`);

      return res.status(416).end();
    }

    let start = rangeMatch[1]
      ? Number(rangeMatch[1])
      : null;

    let end = rangeMatch[2]
      ? Number(rangeMatch[2])
      : null;

    /*
     * Suffix range:
     * bytes=-500
     */
    if (start === null && end !== null) {
      const suffixLength = end;

      if (suffixLength <= 0) {
        res.setHeader(
          "Content-Range",
          `bytes */${fileSize}`
        );

        return res.status(416).end();
      }

      start = Math.max(
        fileSize - suffixLength,
        0
      );

      end = fileSize - 1;
    }

    /*
     * Open-ended range:
     * bytes=1000-
     */
    if (start !== null && end === null) {
      end = fileSize - 1;
    }

    if (
      start === null ||
      end === null ||
      start < 0 ||
      start >= fileSize ||
      end < start
    ) {
      res.setHeader(
        "Content-Range",
        `bytes */${fileSize}`
      );

      return res.status(416).end();
    }

    end = Math.min(end, fileSize - 1);

    const chunkSize = end - start + 1;

    res.status(206);

    res.setHeader(
      "Content-Range",
      `bytes ${start}-${end}/${fileSize}`
    );

    res.setHeader("Content-Length", chunkSize);

    const stream = fs.createReadStream(filePath, {
      start,
      end,
    });

    stream.on("error", next);

    return stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

/**
 * Serve an image thumbnail.
 */
router.get("/:id/thumb", async (req, res, next) => {
  try {
    const media = getMedia(req.params.id);

    if (!media) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Media not found.",
        },
      });
    }

    if (!media.thumbnail_path) {
      return res.status(404).json({
        success: false,
        error: {
          message: "This media does not have a thumbnail.",
        },
      });
    }

    const stats = await getFileStats(
      media.thumbnail_path
    );

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Thumbnail not found.",
        },
      });
    }

    res.setHeader("Content-Type", "image/jpeg");

    res.setHeader(
      "Content-Length",
      stats.size
    );

    res.setHeader(
      "Cache-Control",
      "public, max-age=3600"
    );

    const stream = fs.createReadStream(
      media.thumbnail_path
    );

    stream.on("error", next);

    return stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

/**
 * Return extracted video frames.
 *
 * Frame extraction is stored under:
 *   backend/frames/<mediaId>/
 */
router.get("/:id/frames", async (req, res, next) => {
  try {
    const media = getMedia(req.params.id);

    if (!media) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Media not found.",
        },
      });
    }

    if (media.media_type !== "video") {
      return res.status(400).json({
        success: false,
        error: {
          message:
            "Frames are only available for video media.",
        },
      });
    }

    const frameDirectory = path.join(
      config.storage.framesDir,
      media.id
    );

    const directoryExists = await getFileStats(
      frameDirectory
    );

    if (!directoryExists) {
      return res.status(404).json({
        success: false,
        error: {
          message:
            "No extracted frames are available.",
        },
      });
    }

    const entries = await fsPromises.readdir(
      frameDirectory,
      {
        withFileTypes: true,
      }
    );

    const frames = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          /\.(jpg|jpeg|png|webp)$/i.test(
            entry.name
          )
      )
      .sort((a, b) =>
        a.name.localeCompare(
          b.name,
          undefined,
          { numeric: true }
        )
      )
      .map((entry) => ({
        filename: entry.name,
        url: `/api/media/${media.id}/frames/${encodeURIComponent(
          entry.name
        )}`,
      }));

    return res.json({
      success: true,
      mediaId: media.id,
      frames,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Serve one extracted frame.
 */
router.get(
  "/:id/frames/:filename",
  async (req, res, next) => {
    try {
      const media = getMedia(req.params.id);

      if (!media) {
        return res.status(404).json({
          success: false,
          error: {
            message: "Media not found.",
          },
        });
      }

      if (media.media_type !== "video") {
        return res.status(400).json({
          success: false,
          error: {
            message:
              "Frames are only available for video media.",
          },
        });
      }

      const filename = path.basename(
        req.params.filename
      );

      const frameDirectory = path.join(
        config.storage.framesDir,
        media.id
      );

      const framePath = path.join(
        frameDirectory,
        filename
      );

      /*
       * Prevent path traversal by ensuring the resolved
       * path remains inside the frame directory.
       */
      const resolvedDirectory =
        path.resolve(frameDirectory);

      const resolvedFramePath =
        path.resolve(framePath);

      if (
        !resolvedFramePath.startsWith(
          `${resolvedDirectory}${path.sep}`
        )
      ) {
        return res.status(400).json({
          success: false,
          error: {
            message: "Invalid frame path.",
          },
        });
      }

      const stats = await getFileStats(
        resolvedFramePath
      );

      if (!stats) {
        return res.status(404).json({
          success: false,
          error: {
            message: "Frame not found.",
          },
        });
      }

      res.setHeader("Content-Type", "image/jpeg");

      res.setHeader(
        "Content-Length",
        stats.size
      );

      res.setHeader(
        "Cache-Control",
        "public, max-age=3600"
      );

      const stream = fs.createReadStream(
        resolvedFramePath
      );

      stream.on("error", next);

      return stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Delete media and associated files.
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const media = getMedia(req.params.id);

    if (!media) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Media not found.",
        },
      });
    }

    await deleteMediaFiles(media);

    db.prepare(
      `
      DELETE FROM media
      WHERE id = ?
      `
    ).run(media.id);

    return res.json({
      success: true,
      message: "Media deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;