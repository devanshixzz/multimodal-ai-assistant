import { fileTypeFromBuffer } from "file-type";

const MIME_GROUPS = {
  image: {
    allowedMimeTypes: new Set([
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/bmp",
    ]),
    maxSize: 20 * 1024 * 1024,
  },

  video: {
    allowedMimeTypes: new Set([
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-msvideo",
    ]),
    maxSize: 100 * 1024 * 1024,
  },

  audio: {
    allowedMimeTypes: new Set([
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
      "audio/x-m4a",
      "audio/ogg",
      "audio/flac",
      "audio/x-flac",
    ]),
    maxSize: 50 * 1024 * 1024,
  },

  document: {
    allowedMimeTypes: new Set(["application/pdf"]),
    maxSize: 20 * 1024 * 1024,
  },
};

const EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",

  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",

  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",

  "application/pdf": "pdf",
};

class FileValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "FileValidationError";
    this.statusCode = statusCode;
    this.publicMessage = message;
  }
}

const getMediaType = (mimeType) => {
  for (const [mediaType, group] of Object.entries(MIME_GROUPS)) {
    if (group.allowedMimeTypes.has(mimeType)) {
      return mediaType;
    }
  }

  return null;
};

const getFileExtension = (filename = "") => {
  const cleanName = filename.split(/[\\/]/).pop() || "";
  const lastDot = cleanName.lastIndexOf(".");

  return lastDot >= 0
    ? cleanName.slice(lastDot + 1).toLowerCase()
    : "";
};

const validateFile = async (file) => {
  if (!file) {
    throw new FileValidationError(
      "No file was provided. Please select an image, video, audio file, or PDF."
    );
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw new FileValidationError(
      "The uploaded file is empty or could not be read."
    );
  }

  // Inspect the actual file bytes instead of trusting
  // the filename or browser-provided MIME type.
  const detectedType = await fileTypeFromBuffer(file.buffer);

  let detectedMimeType = detectedType?.mime;

  // file-type may not detect every PDF buffer,
  // so explicitly verify the PDF magic bytes.
  if (
    !detectedMimeType &&
    file.buffer.subarray(0, 5).toString() === "%PDF-"
  ) {
    detectedMimeType = "application/pdf";
  }

  if (!detectedMimeType) {
    throw new FileValidationError(
      "Unable to determine the actual file type. The file may be corrupt or unsupported."
    );
  }

  /*
   * ------------------------------------------------------------
   * M4A SPECIAL CASE
   * ------------------------------------------------------------
   *
   * M4A files use the MP4/ISO-BMFF container format.
   * Because of that, file-type can legitimately identify
   * an audio-only .m4a file as "video/mp4".
   *
   * We still validate the actual file bytes with file-type.
   * We only override the media classification when the
   * filename explicitly uses the audio-only .m4a extension.
   */
  const extension = getFileExtension(file.originalname);

  if (
    extension === "m4a" &&
    detectedMimeType === "video/mp4"
  ) {
    detectedMimeType = "audio/mp4";
  }

  const mediaType = getMediaType(detectedMimeType);

  if (!mediaType) {
    throw new FileValidationError(
      `Unsupported file type: ${detectedMimeType}. Please upload a supported image, video, audio file, or PDF.`
    );
  }

  const mediaConfig = MIME_GROUPS[mediaType];

  if (file.size > mediaConfig.maxSize) {
    const maxSizeMB = mediaConfig.maxSize / (1024 * 1024);
    const actualSizeMB = file.size / (1024 * 1024);

    throw new FileValidationError(
      `${mediaType} files must be ${maxSizeMB} MB or smaller. Your file is ${actualSizeMB.toFixed(
        2
      )} MB.`,
      413
    );
  }

  // We deliberately use the detected/normalized MIME type rather
  // than trusting file.mimetype supplied by the client.
  if (file.mimetype && file.mimetype !== detectedMimeType) {
    console.warn(
      `MIME mismatch for ${file.originalname}: browser=${file.mimetype}, detected=${detectedMimeType}`
    );
  }

  return {
    mediaType,
    mimeType: detectedMimeType,
    extension:
      EXTENSION_BY_MIME[detectedMimeType] ||
      detectedType?.ext ||
      null,
    size: file.size,
  };
};

export {
  MIME_GROUPS,
  FileValidationError,
  getMediaType,
  validateFile,
};