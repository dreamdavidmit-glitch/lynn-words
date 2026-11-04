CREATE TABLE IF NOT EXISTS progress_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  device_id TEXT NOT NULL,
  encoding TEXT NOT NULL CHECK (encoding IN ('json', 'gzip')),
  payload BLOB NOT NULL,
  reason TEXT NOT NULL DEFAULT 'sync'
);

CREATE INDEX IF NOT EXISTS progress_snapshots_created_at
ON progress_snapshots (created_at DESC, id DESC);
