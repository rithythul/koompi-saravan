CREATE TABLE IF NOT EXISTS content_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  prompt TEXT,
  output_dir TEXT NOT NULL,
  error TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generated_assets (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES content_runs(id)
);

CREATE TABLE IF NOT EXISTS rendered_videos (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  composition_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  fps INTEGER NOT NULL,
  duration_in_frames INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES content_runs(id)
);

CREATE TABLE IF NOT EXISTS published_posts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  caption TEXT NOT NULL,
  video_path TEXT NOT NULL,
  video_url TEXT,
  platform_post_id TEXT,
  permalink TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (run_id, platform),
  FOREIGN KEY (run_id) REFERENCES content_runs(id)
);
