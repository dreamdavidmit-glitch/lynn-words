CREATE TABLE IF NOT EXISTS room_live_players (
  role TEXT PRIMARY KEY CHECK (role IN ('lynn','david')),
  visit TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  pose TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS room_live_doors (
  room TEXT PRIMARY KEY CHECK (room IN ('lynn','david')),
  opened INTEGER NOT NULL CHECK (opened IN (0,1))
);
