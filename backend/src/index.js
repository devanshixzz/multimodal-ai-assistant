import express from "express";
import cors from "cors";
import config from "./config.js";
import errorHandler from "./middleware/error-handler.js";
import "./models/database.js";
import uploadRouter from "./routes/upload.js";
import analyzeRouter from "./routes/analyze.js";
import conversationsRouter from "./routes/conversations.js";
import chatRouter from "./routes/chat.js";
import mediaRouter, {
  cleanupExpiredMedia,
} from "./routes/media.js";

const app = express();

// ---------------------------------------------------------
// Global middleware
// ---------------------------------------------------------

app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ---------------------------------------------------------
// Health check
// ---------------------------------------------------------

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    service: "multimodal-ai-assistant-backend",
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});
app.use("/api/upload", uploadRouter);
app.use("/api/analyze", analyzeRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/media", mediaRouter);
// ---------------------------------------------------------
// 404 handler
// ---------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
});

// ---------------------------------------------------------
// Global error handler
// ---------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------
// Start server
// ---------------------------------------------------------

const server = app.listen(config.port, () => {
  console.log(
    `🚀 Multi-Modal AI Assistant backend running on http://localhost:${config.port}`
  );
  console.log(`📁 Environment: ${config.nodeEnv}`);
});

// Run media cleanup once on startup.
cleanupExpiredMedia().catch((error) => {
  console.error("[Cleanup] Startup cleanup failed:", error);
});

// Re-check for expired media every hour.
setInterval(() => {
  cleanupExpiredMedia().catch((error) => {
    console.error("[Cleanup] Scheduled cleanup failed:", error);
  });
}, 60 * 60 * 1000);

// ---------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------

const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));