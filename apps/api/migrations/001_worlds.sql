CREATE TABLE worlds (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  snapshot_version INTEGER NOT NULL CHECK (snapshot_version >= 1),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  t0_json TEXT CHECK (t0_json IS NULL OR json_valid(t0_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE world_history (
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  tick INTEGER NOT NULL CHECK (tick >= 0),
  timestamp TEXT NOT NULL,
  action_json TEXT NOT NULL CHECK (json_valid(action_json)),
  effects_json TEXT NOT NULL CHECK (json_valid(effects_json)),
  PRIMARY KEY (world_id, revision)
);
CREATE TRIGGER immutable_t0 BEFORE UPDATE OF t0_json ON worlds
WHEN OLD.t0_json IS NOT NULL AND NEW.t0_json IS NOT OLD.t0_json
BEGIN SELECT RAISE(ABORT, 't0 is immutable'); END;
CREATE TRIGGER immutable_history BEFORE UPDATE ON world_history
BEGIN SELECT RAISE(ABORT, 'history is immutable'); END;
-- Cascade runs after parent deletion; retained history cannot be selectively deleted.
CREATE TRIGGER retained_history BEFORE DELETE ON world_history
WHEN EXISTS (SELECT 1 FROM worlds WHERE id = OLD.world_id)
BEGIN SELECT RAISE(ABORT, 'retained history is immutable'); END;
CREATE TRIGGER draft_disposal_only BEFORE DELETE ON worlds
WHEN json_extract(OLD.snapshot_json, '$.lifecycle') <> 'SETTING_UP'
BEGIN SELECT RAISE(ABORT, 'only drafts can be disposed'); END;
