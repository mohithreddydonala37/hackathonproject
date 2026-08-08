const sqlite3 = require('sqlite3').verbose();
const config = require('./config');
const fs = require('fs');
const path = require('path');

// Ensure data directory exists
const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let dbInstance = null;

function getDbConnection() {
  if (!dbInstance) {
    dbInstance = new sqlite3.Database(config.dbPath);
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db) {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        session_id TEXT PRIMARY KEY,
        candidate_id TEXT,
        state_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });
}

function closeDbConnection() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      dbInstance.close((err) => {
        dbInstance = null;
        if (err) reject(err);
        else resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  getDbConnection,
  closeDbConnection
};
