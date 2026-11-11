CREATE TABLE IF NOT EXISTS presence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL CHECK (status IN ('online', 'away', 'offline')),
  studying INTEGER NOT NULL DEFAULT 0 CHECK (studying IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  last_seen_at TEXT NOT NULL
);
