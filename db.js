const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

/* ---------------------------------------------------------------------------
 * Where the database lives — and why redeploys were wiping it.
 *
 * Railway (like most container hosts) gives each deploy a FRESH, EPHEMERAL
 * filesystem. Anything written inside the app directory — including
 * ./data/app.db — is thrown away the moment you redeploy. The only storage
 * that survives a redeploy is a mounted Volume.
 *
 * So the database path is resolved in this order:
 *   1. DATA_DIR                     — explicit override, if you set one
 *   2. RAILWAY_VOLUME_MOUNT_PATH    — auto-set by Railway when a Volume is
 *                                     attached, so persistence "just works"
 *                                     once you add one (no env var needed)
 *   3. ./data                       — local dev only; EPHEMERAL on Railway
 *
 * To make scores/accounts persistent on Railway: Service → Settings → add a
 * Volume (mount path can be anything, e.g. /data). That's it — this file
 * detects the mount automatically. See README "Persistence".
 * ------------------------------------------------------------------------- */

const onRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
const explicit = process.env.DATA_DIR && process.env.DATA_DIR.trim();
const volumeMount = process.env.RAILWAY_VOLUME_MOUNT_PATH && process.env.RAILWAY_VOLUME_MOUNT_PATH.trim();

const dataDir = explicit || volumeMount || path.join(__dirname, 'data');
const persistent = !!(explicit || volumeMount);

fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'app.db');

// Loud, unmissable startup banner so the deploy logs tell you the truth.
if (persistent) {
  const via = explicit ? 'DATA_DIR' : 'Railway Volume (RAILWAY_VOLUME_MOUNT_PATH)';
  console.log(`[db] Persistent storage → ${dbPath}  (via ${via})`);
} else if (onRailway) {
  console.warn(
    '\n==================== ⚠️  DATA IS NOT PERSISTENT ====================\n' +
    `[db] The database is on the EPHEMERAL container filesystem: ${dbPath}\n` +
    '[db] Every redeploy will WIPE all accounts and scores.\n' +
    '[db] Fix: in Railway, open this service → Settings → add a Volume\n' +
    '[db] (any mount path, e.g. /data). No env var needed — this app\n' +
    '[db] detects RAILWAY_VOLUME_MOUNT_PATH automatically on next deploy.\n' +
    '===================================================================\n'
  );
} else {
  console.log(`[db] Local storage → ${dbPath}  (ephemeral; fine for local dev)`);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  score INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, game)
);
`);

module.exports = db;
