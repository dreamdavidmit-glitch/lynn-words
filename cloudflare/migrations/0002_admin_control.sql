CREATE TABLE IF NOT EXISTS auth_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  generation INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO auth_control (id, generation, updated_at)
VALUES (1, 1, CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS auth_attempts (
  scope TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, fingerprint)
);
