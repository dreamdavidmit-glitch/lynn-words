CREATE TABLE IF NOT EXISTS care_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitored_sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO monitored_sites (name, url, created_at)
VALUES ('Lynn 的小词窝', 'https://dreamdavidmit-glitch.github.io/lynn-words/', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO monitored_sites (name, url, created_at)
VALUES ('云端进度服务', 'https://lynn-words-sync.lynn-words-work.workers.dev/health', CURRENT_TIMESTAMP);
