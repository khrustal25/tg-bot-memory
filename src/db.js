const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function openDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 3000;');
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch {
    // Обычный режим тоже сохраняет данные после перезапуска.
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      file_id TEXT,
      file_name TEXT,
      category TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_user_created
      ON items(user_id, created_at DESC, id DESC);
  `);
  return db;
}

module.exports = { openDatabase };
