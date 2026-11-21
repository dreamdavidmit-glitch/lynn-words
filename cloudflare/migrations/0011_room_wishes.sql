CREATE TABLE room_wishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_key TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 180),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  cost INTEGER,
  decided_at TEXT,
  CHECK (
    (status = 'pending' AND cost IS NULL AND decided_at IS NULL)
    OR (status = 'declined' AND cost IS NULL AND decided_at IS NOT NULL)
    OR (status = 'approved' AND cost IS NOT NULL AND cost >= 0 AND decided_at IS NOT NULL)
  )
);

CREATE INDEX room_wishes_approved ON room_wishes (cost) WHERE status = 'approved';
