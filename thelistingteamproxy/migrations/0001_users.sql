-- hub/16 Task 2 — user accounts, identities, revocable sessions.
-- D1 bills rows SCANNED: every lookup below is by primary key or an indexed
-- column, so the indexes are load-bearing, not decorative.

CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,              -- uuid
  email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name               TEXT NOT NULL DEFAULT '',
  role               TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  ghl_user_id        TEXT NOT NULL DEFAULT '',
  active             INTEGER NOT NULL DEFAULT 1,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until       INTEGER NOT NULL DEFAULT 0,    -- epoch ms; 0 = not locked
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  pass_hash  TEXT NOT NULL,   -- hex, chained-PBKDF2 (see pbkdf2Chain in worker.js)
  pass_salt  TEXT NOT NULL,   -- hex, 16 random bytes
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,  -- SHA-256(token); the token itself is never stored
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,  -- absolute, epoch ms
  revoked    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
