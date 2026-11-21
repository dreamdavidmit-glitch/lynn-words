-- Preserve existing note IDs, authors and request IDs when removing the length check.
CREATE TABLE room_photo_notes_long_text (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL REFERENCES room_photos(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (author IN ('lynn','david')),
  client_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) >= 1),
  created_at TEXT NOT NULL,
  UNIQUE(photo_id, author, client_id)
);

INSERT INTO room_photo_notes_long_text (id,photo_id,author,client_id,body,created_at)
SELECT id,photo_id,author,client_id,body,created_at FROM room_photo_notes;

DROP TABLE room_photo_notes;
ALTER TABLE room_photo_notes_long_text RENAME TO room_photo_notes;
CREATE INDEX room_photo_notes_thread ON room_photo_notes(photo_id, id DESC);
