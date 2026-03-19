CREATE TABLE IF NOT EXISTS conversion_events (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  value REAL,
  currency TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id)
);

CREATE INDEX IF NOT EXISTS idx_conversion_events_post_id ON conversion_events(post_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_occurred_at ON conversion_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_conversion_events_type ON conversion_events(event_type);

CREATE TABLE IF NOT EXISTS planned_posts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  content_type TEXT NOT NULL,
  schedule_strategy TEXT NOT NULL,
  confidence REAL NOT NULL,
  reason TEXT NOT NULL,
  hook_text TEXT,
  caption TEXT,
  objective TEXT NOT NULL,
  source_post_ids TEXT NOT NULL DEFAULT '[]',
  run_id TEXT,
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES content_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_planned_posts_platform_scheduled_for ON planned_posts(platform, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_planned_posts_status ON planned_posts(status);
CREATE INDEX IF NOT EXISTS idx_planned_posts_objective ON planned_posts(objective);
