CREATE TABLE room_entry_states (room TEXT PRIMARY KEY, opened INTEGER NOT NULL);
CREATE TABLE room_glass_marks (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL CHECK(room IN ('lynn','david')),
 mark TEXT NOT NULL, points TEXT NOT NULL, UNIQUE(room,mark)
);
CREATE INDEX room_glass_wall ON room_glass_marks(room,seq);
