import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendRoot = path.resolve(__dirname, "../..");
const dataDir = path.join(backendRoot, "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const databasePath = path.join(dataDir, "multimodal.db");

const db = new Database(databasePath);

// Improve SQLite behavior for a web application.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------
// Database schema
// ---------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    context_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    media_refs TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,

    FOREIGN KEY (conversation_id)
      REFERENCES conversations(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    thumbnail_path TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (conversation_id)
      REFERENCES conversations(id)
      ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id);

  CREATE INDEX IF NOT EXISTS idx_media_conversation
    ON media(conversation_id);

  CREATE INDEX IF NOT EXISTS idx_media_created_at
    ON media(created_at);
`);

console.log(`📦 SQLite database ready: ${databasePath}`);

export default db;