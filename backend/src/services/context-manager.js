import crypto from "crypto";
import db from "../models/database.js";

const DEFAULT_MAX_MESSAGES = 20;
const SUMMARY_TRIGGER = 30;

/**
 * Create a new conversation.
 */
function createConversation(title = "New Conversation") {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO conversations (
      id,
      title,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?)
  `).run(id, title, now, now);

  return getConversation(id);
}

/**
 * Get a conversation with all of its messages.
 */
function getConversation(conversationId) {
  const conversation = db.prepare(`
    SELECT *
    FROM conversations
    WHERE id = ?
  `).get(conversationId);

  if (!conversation) {
    return null;
  }

  const messages = db.prepare(`
    SELECT *
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).all(conversationId);

  return {
    ...conversation,
    messages: messages.map(parseMessage),
  };
}

/**
 * Convert database JSON fields back into JavaScript values.
 */
function parseMessage(message) {
  return {
    ...message,
    media_refs: parseJson(message.media_refs, []),
    metadata: parseJson(message.metadata, {}),
  };
}

/**
 * Safely parse JSON stored in SQLite.
 */
function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Add a message to a conversation.
 *
 * mediaRefs can contain IDs of media files referenced by
 * this message.
 *
 * metadata can contain additional message information.
 */
function addMessage(
  conversationId,
  role,
  content,
  mediaRefs = [],
  metadata = {}
) {
  const id = crypto.randomUUID();
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
    id,
    conversationId,
    role,
    content,
    JSON.stringify(mediaRefs),
    JSON.stringify(metadata),
    now
  );

  db.prepare(`
    UPDATE conversations
    SET updated_at = ?
    WHERE id = ?
  `).run(now, conversationId);

  const message = db.prepare(`
    SELECT *
    FROM messages
    WHERE id = ?
  `).get(id);

  return parseMessage(message);
}

/**
 * Get the most recent messages for the LLM context.
 *
 * The newest messages are selected first and then reversed
 * so the final result remains chronological.
 */
function getContextMessages(
  conversationId,
  maxMessages = DEFAULT_MAX_MESSAGES
) {
  const messages = db.prepare(`
    SELECT *
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(conversationId, maxMessages);

  return messages
    .reverse()
    .map(parseMessage);
}

/**
 * Check whether the conversation has enough messages
 * that context summarization may be useful.
 */
function shouldSummarize(conversationId) {
  const result = db.prepare(`
    SELECT COUNT(*) AS count
    FROM messages
    WHERE conversation_id = ?
  `).get(conversationId);

  return result.count >= SUMMARY_TRIGGER;
}

/**
 * Delete a conversation.
 *
 * The database schema handles related messages through
 * the conversation foreign-key relationship.
 */
function deleteConversation(conversationId) {
  const result = db.prepare(`
    DELETE FROM conversations
    WHERE id = ?
  `).run(conversationId);

  return result.changes > 0;
}

export {
  createConversation,
  getConversation,
  addMessage,
  getContextMessages,
  shouldSummarize,
  deleteConversation,
};