ALTER TABLE room_live_players ADD COLUMN seat TEXT;
ALTER TABLE room_live_players ADD COLUMN gesture TEXT;

CREATE TABLE IF NOT EXISTS room_photo_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL REFERENCES room_photos(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (author IN ('lynn','david')),
  client_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 400),
  created_at TEXT NOT NULL,
  UNIQUE(photo_id, author, client_id)
);

CREATE INDEX IF NOT EXISTS room_photo_notes_thread ON room_photo_notes(photo_id, id DESC);
