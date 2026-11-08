PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS inspections (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at            TEXT,
  input_type             TEXT NOT NULL CHECK (input_type IN ('image','video','webcam')),
  filename               TEXT,
  models_used            TEXT,
  conf_threshold         REAL,
  nms_mode               TEXT CHECK (nms_mode IN ('end2end','nms')),
  iou_threshold          REAL,
  total_detections       INTEGER NOT NULL DEFAULT 0,
  class_summary          TEXT NOT NULL DEFAULT '{"D00":0,"D10":0,"D20":0,"D40":0}',
  frames_total           INTEGER,
  frames_processed       INTEGER NOT NULL DEFAULT 0,
  frames_with_detections INTEGER NOT NULL DEFAULT 0,
  processing_ms          INTEGER,
  output_name            TEXT,
  status                 TEXT NOT NULL CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  error_message          TEXT
);
CREATE INDEX IF NOT EXISTS idx_inspections_created ON inspections (created_at DESC);
