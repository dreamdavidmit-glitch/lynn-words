CREATE TABLE daily_cards (
  day TEXT PRIMARY KEY,
  template INTEGER CHECK (template BETWEEN 1 AND 12),
  content_type TEXT,
  blob_data BLOB,
  CHECK ((template IS NOT NULL AND blob_data IS NULL AND content_type IS NULL)
      OR (template IS NULL AND blob_data IS NOT NULL AND content_type IS NOT NULL))
);
CREATE TABLE daily_checkins (
  day TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL
);
CREATE TABLE daily_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  time TEXT NOT NULL,
  dismissed_day TEXT
);

ALTER TABLE messages ADD COLUMN photo_id INTEGER REFERENCES room_photos(id) ON DELETE SET NULL;
CREATE INDEX messages_photo_idx ON messages(photo_id) WHERE photo_id IS NOT NULL;
ALTER TABLE room_photos ADD COLUMN notice_sent INTEGER NOT NULL DEFAULT 0;
UPDATE room_photos SET notice_sent = 1;
CREATE TRIGGER room_photo_uploaded_notification AFTER INSERT ON room_photos
WHEN NEW.wall_slot BETWEEN 0 AND 11 AND NEW.notice_sent=0
BEGIN
  INSERT INTO messages(sender, body, created_at, photo_id)
  VALUES (CASE NEW.owner WHEN 'david' THEN 'owner' ELSE 'lynn' END,
    CASE NEW.owner WHEN 'david' THEN 'David 上传了一张新的记忆照片。' ELSE 'Lynn 上传了一张新的记忆照片。' END,
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), NEW.id);
  UPDATE room_photos SET notice_sent=1 WHERE id=NEW.id;
END;
CREATE TRIGGER room_photo_hung_notification AFTER UPDATE OF wall_slot ON room_photos
WHEN NEW.wall_slot BETWEEN 0 AND 11 AND NEW.notice_sent=0
BEGIN
  INSERT INTO messages(sender, body, created_at, photo_id)
  VALUES (CASE NEW.owner WHEN 'david' THEN 'owner' ELSE 'lynn' END,
    CASE NEW.owner WHEN 'david' THEN 'David 挂上了一张新的记忆照片。' ELSE 'Lynn 挂上了一张新的记忆照片。' END,
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), NEW.id);
  UPDATE room_photos SET notice_sent=1 WHERE id=NEW.id;
END;
