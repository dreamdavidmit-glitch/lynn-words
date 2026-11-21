CREATE TABLE room_corners (
  author TEXT PRIMARY KEY CHECK(author IN ('lynn','david')),
  private_note TEXT NOT NULL DEFAULT '',
  photo_id INTEGER REFERENCES room_photos(id) ON DELETE SET NULL,
  exhibit_note TEXT NOT NULL DEFAULT ''
);
