import db from "./src/models/database.js";

const rows = db
  .prepare(`
    SELECT
      id,
      original_name,
      media_type,
      mime_type,
      status
    FROM media
    WHERE media_type = 'image'
    ORDER BY created_at DESC
  `)
  .all();

console.table(rows);