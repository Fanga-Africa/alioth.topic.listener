const { createClient } = require('@libsql/client');
require('dotenv').config();

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      destination TEXT NOT NULL UNIQUE,
      is_seed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER,
      category TEXT,
      destination TEXT,
      headers TEXT,
      body TEXT,
      received_at TEXT
    );
  `);
}

module.exports = { db, initDB };