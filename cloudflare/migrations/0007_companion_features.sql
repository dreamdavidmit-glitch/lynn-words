CREATE TABLE IF NOT EXISTS companionship (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mood_date TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('tired', 'okay', 'good')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS moods_date_idx ON moods (mood_date DESC, id DESC);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx ON scheduled_messages (delivered_at, scheduled_for);

CREATE TABLE IF NOT EXISTS surprise_letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  gift TEXT NOT NULL DEFAULT '💜',
  unlock_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  opened_at TEXT
);

CREATE INDEX IF NOT EXISTS surprise_letters_unlock_idx ON surprise_letters (unlock_date, opened_at);

CREATE TABLE IF NOT EXISTS milestones (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  achieved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS room_photos_created_idx ON room_photos (created_at DESC, id DESC);
