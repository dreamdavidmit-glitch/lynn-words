ALTER TABLE room_photos ADD COLUMN wall_slot INTEGER NOT NULL DEFAULT -1;
ALTER TABLE room_photos ADD COLUMN frame_style TEXT NOT NULL DEFAULT 'walnut';

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) - 1 AS slot
  FROM room_photos
)
UPDATE room_photos
SET wall_slot = (SELECT slot FROM ranked WHERE ranked.id = room_photos.id)
WHERE wall_slot = -1;

CREATE UNIQUE INDEX IF NOT EXISTS room_photos_wall_slot_idx
ON room_photos (wall_slot)
WHERE wall_slot BETWEEN 0 AND 11;
