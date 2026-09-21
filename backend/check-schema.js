import db from "./src/models/database.js";

console.table(
  db.prepare("PRAGMA table_info(messages)").all()
);