CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_post_id TEXT,
  posted_at TEXT NOT NULL,
  content_type TEXT NOT NULL,
  video_path TEXT NOT NULL,
  hook_text TEXT,
  caption TEXT,
  hashtags TEXT NOT NULL DEFAULT '[]',
  scheduled_by TEXT NOT NULL,
  confidence_score REAL,
  scheduled_hour INTEGER NOT NULL,
  run_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES content_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON posts(posted_at);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_hour ON posts(scheduled_hour);
CREATE INDEX IF NOT EXISTS idx_posts_run_id ON posts(run_id);

CREATE TABLE IF NOT EXISTS post_metrics (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  pulled_at TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  completion_rate REAL,
  avg_watch_time_seconds REAL,
  reach INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  platform_data TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id)
);

CREATE INDEX IF NOT EXISTS idx_post_metrics_post_id ON post_metrics(post_id);
CREATE INDEX IF NOT EXISTS idx_post_metrics_pulled_at ON post_metrics(pulled_at);

CREATE TABLE IF NOT EXISTS hour_performance (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  hour INTEGER NOT NULL,
  day_of_week INTEGER,
  post_count INTEGER NOT NULL DEFAULT 0,
  total_views INTEGER NOT NULL DEFAULT 0,
  total_likes INTEGER NOT NULL DEFAULT 0,
  total_shares INTEGER NOT NULL DEFAULT 0,
  total_saves INTEGER NOT NULL DEFAULT 0,
  avg_views REAL NOT NULL DEFAULT 0,
  avg_engagement_rate REAL NOT NULL DEFAULT 0,
  avg_completion_rate REAL NOT NULL DEFAULT 0,
  performance_score REAL NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL,
  UNIQUE(platform, hour, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_hour_performance_score ON hour_performance(performance_score DESC);
CREATE INDEX IF NOT EXISTS idx_hour_performance_platform_day ON hour_performance(platform, day_of_week, hour);
