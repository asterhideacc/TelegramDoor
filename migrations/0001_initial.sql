CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  verified_until INTEGER NOT NULL DEFAULT 0, banned_until INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT NOT NULL DEFAULT '', trusted INTEGER NOT NULL DEFAULT 0,
  verify_failures INTEGER NOT NULL DEFAULT 0, cooldown_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS users_last_seen ON users(last_seen DESC);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, user_id TEXT,
  direction TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text', content TEXT NOT NULL DEFAULT '',
  message_id INTEGER, detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS events_time ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS events_status_time ON events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS events_user_time ON events(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS message_links (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_chat TEXT NOT NULL,
  source_message INTEGER NOT NULL, target_chat TEXT NOT NULL, target_message INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(source_chat, source_message), UNIQUE(target_chat, target_message)
);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL, answer TEXT NOT NULL DEFAULT '', expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS updates (
  id INTEGER PRIMARY KEY, state TEXT NOT NULL, started_at INTEGER NOT NULL,
  finished_at INTEGER, error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS updates_started ON updates(started_at);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
);
