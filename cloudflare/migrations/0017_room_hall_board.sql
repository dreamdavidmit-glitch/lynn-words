CREATE TABLE room_hall_board (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('lynn','david')),
  kind TEXT NOT NULL CHECK (kind IN ('stroke','note','erase')),
  data TEXT NOT NULL,
  UNIQUE (author, client_id)
);
