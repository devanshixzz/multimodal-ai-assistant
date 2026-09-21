import express from "express";
import db from "../models/database.js";
import {
  createConversation,
  getConversation,
  deleteConversation,
} from "../services/context-manager.js";

const router = express.Router();

/**
 * GET /api/conversations
 *
 * List all conversations.
 */
router.get("/", (req, res, next) => {
  try {
    const conversations = db
      .prepare(`
        SELECT
          id,
          title,
          context_summary,
          created_at,
          updated_at
        FROM conversations
        ORDER BY updated_at DESC
      `)
      .all();

    res.json({
      success: true,
      conversations,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/conversations/:id/export
 *
 * Export a conversation as Markdown.
 *
 * IMPORTANT:
 * This route comes before GET /:id so the
 * more specific route is matched first.
 */
router.get("/:id/export", (req, res, next) => {
  try {
    const conversation = getConversation(req.params.id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Conversation not found",
        },
      });
    }

    const escapeMarkdown = (value) =>
      String(value ?? "")
        .replace(/\r\n/g, "\n")
        .trim();

    const title =
      escapeMarkdown(conversation.title) ||
      "Multi-Modal AI Conversation";

    const lines = [
      `# ${title}`,
      "",
      `**Created:** ${conversation.created_at}`,
      `**Last updated:** ${conversation.updated_at}`,
      "",
    ];

    if (conversation.context_summary) {
      lines.push(
        "## Context Summary",
        "",
        escapeMarkdown(conversation.context_summary),
        ""
      );
    }

    lines.push(
      "## Conversation",
      ""
    );

    for (const message of conversation.messages || []) {
      const role =
        message.role === "user"
          ? "User"
          : message.role === "assistant"
          ? "Assistant"
          : message.role;

      lines.push(
        `### ${role}`,
        "",
        escapeMarkdown(message.content),
        ""
      );

      if (
        Array.isArray(message.media_refs) &&
        message.media_refs.length > 0
      ) {
        lines.push(
          "**Referenced media:**",
          "",
          ...message.media_refs.map(
            (mediaId) => `- \`${mediaId}\``
          ),
          ""
        );
      }
    }

    const markdown = lines.join("\n");

    const safeFilename =
      title
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 80) || "conversation";

    res.setHeader(
      "Content-Type",
      "text/markdown; charset=utf-8"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFilename}.md"`
    );

    res.send(markdown);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/conversations/:id
 *
 * Get one conversation with its messages.
 */
router.get("/:id", (req, res, next) => {
  try {
    const conversation = getConversation(req.params.id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Conversation not found",
        },
      });
    }

    res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/conversations
 *
 * Create a new conversation.
 */
router.post("/", (req, res, next) => {
  try {
    const title =
      typeof req.body?.title === "string" &&
      req.body.title.trim()
        ? req.body.title.trim().slice(0, 200)
        : "New Conversation";

    const conversation = createConversation(title);

    res.status(201).json({
      success: true,
      conversation,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/conversations/:id
 *
 * Delete a conversation.
 */
router.delete("/:id", (req, res, next) => {
  try {
    const deleted = deleteConversation(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Conversation not found",
        },
      });
    }

    res.json({
      success: true,
      message: "Conversation deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

export default router;