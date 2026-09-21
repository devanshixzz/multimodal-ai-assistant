import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendRoot = path.resolve(__dirname, "..");

const config = {
  port: Number(process.env.PORT) || 5000,

  nodeEnv: process.env.NODE_ENV || "development",

  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",

  storage: {
    uploadsDir:
      process.env.UPLOADS_DIR || path.join(backendRoot, "uploads"),

    thumbnailsDir:
      process.env.THUMBNAILS_DIR ||
      path.join(backendRoot, "thumbnails"),

    framesDir:
      process.env.FRAMES_DIR || path.join(backendRoot, "frames"),
  },

  cleanup: {
    maxAgeHours: Number(process.env.MEDIA_MAX_AGE_HOURS) || 24,
  },

  limits: {
    image: 20 * 1024 * 1024,
    video: 100 * 1024 * 1024,
    audio: 50 * 1024 * 1024,
  },

  ai: {
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  whisper: {
    provider: process.env.WHISPER_PROVIDER || "groq",
    apiKey: process.env.WHISPER_API_KEY || "",
    model: process.env.WHISPER_MODEL || "whisper-large-v3-turbo",
  },
},
};

export default config;