import multer from "multer";
import { FileValidationError } from "../services/file-validator.js";

const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

// Keep uploads in memory temporarily.
// This allows us to inspect the actual bytes before
// deciding whether the file is safe to store.
const storage = multer.memoryStorage();

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_UPLOAD_SIZE,
    files: 1,
  },

  // Do not trust the browser MIME type here.
  // Magic-byte validation happens after Multer
  // gives us the file buffer.
  fileFilter: (req, file, cb) => {
    cb(null, true);
  },
});

const handleUpload = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          new FileValidationError(
            "File is too large. The maximum upload size is 100 MB.",
            413
          )
        );
      }

      return next(
        new FileValidationError(
          `Upload failed: ${err.message}`,
          400
        )
      );
    }

    return next(err);
  });
};

export default handleUpload;