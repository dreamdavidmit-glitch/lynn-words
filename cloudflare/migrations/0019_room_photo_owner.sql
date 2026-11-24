ALTER TABLE room_photos ADD COLUMN owner TEXT NOT NULL DEFAULT 'lynn' CHECK (owner IN ('lynn', 'david'));
DROP INDEX IF EXISTS room_photos_wall_slot_idx;
CREATE UNIQUE INDEX room_photos_owner_slot_idx ON room_photos (owner, wall_slot)
WHERE wall_slot BETWEEN 0 AND 11;
