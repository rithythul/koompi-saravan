/**
 * Analytics Store
 *
 * SQLite-based storage for post analytics.
 */

import Database from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'var', 'analytics.db');

export interface PostRecord {
  id: string;
  platform: string;
  platform_post_id: string;
  content_type: string;
  media_url: string;
  caption: string;
  hashtags: string;
  scheduled_at?: string;
  published_at: string;
  status: 'pending' | 'publishing' | 'published' | 'failed';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface MetricsRecord {
  id: string;
  post_id: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  engagement_rate: number;
  fetched_at: string;
}

export interface HourPerformanceRecord {
  id: string;
  platform: string;
  hour: number;
  day_of_week: number;
  posts_count: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  avg_engagement_rate: number;
  updated_at: string;
}

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      platform_post_id TEXT,
      content_type TEXT NOT NULL,
      media_url TEXT NOT NULL,
      caption TEXT,
      hashtags TEXT,
      scheduled_at TEXT,
      published_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at);

    CREATE TABLE IF NOT EXISTS metrics (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      saves INTEGER DEFAULT 0,
      engagement_rate REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_post_id ON metrics(post_id);

    CREATE TABLE IF NOT EXISTS hour_performance (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
      day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
      posts_count INTEGER NOT NULL DEFAULT 1,
      total_views INTEGER NOT NULL DEFAULT 0,
      total_likes INTEGER NOT NULL DEFAULT 0,
      total_comments INTEGER NOT NULL DEFAULT 0,
      total_shares INTEGER NOT NULL DEFAULT 0,
      avg_engagement_rate REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(platform, hour, day_of_week)
    );

    CREATE INDEX IF NOT EXISTS idx_hour_performance_platform ON hour_performance(platform);
  `);
}

export function savePost(post: Omit<PostRecord, 'created_at' | 'updated_at'>): void {
  const database = getDb();
  const now = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO posts (
      id, platform, platform_post_id, content_type, media_url, caption, hashtags,
      scheduled_at, published_at, status, error_message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    post.id,
    post.platform,
    post.platform_post_id ?? '',
    post.content_type,
    post.media_url,
    post.caption ?? '',
    post.hashtags ?? '',
    post.scheduled_at ?? null,
    post.published_at,
    post.status,
    post.error_message ?? null,
    now,
    now
  );
}

export function getPost(id: string): PostRecord | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM posts WHERE id = ?');
  return stmt.get(id) as PostRecord | null;
}

export function getPostsByPlatform(
  platform: string,
  options: { limit?: number; offset?: number; status?: string } = {}
): PostRecord[] {
  const database = getDb();
  const { limit = 50, offset = 0, status } = options;

  let query = 'SELECT * FROM posts WHERE platform = ?';
  const params: any[] = [platform];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = database.prepare(query);
  return stmt.all(...params) as PostRecord[];
}

export function getPosts(options: {
  platforms?: string[];
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
} = {}): PostRecord[] {
  const database = getDb();
  const { platforms, status, startDate, endDate, limit = 50, offset = 0 } = options;

  let query = 'SELECT * FROM posts WHERE 1=1';
  const params: any[] = [];

  if (platforms && platforms.length > 0) {
    const placeholders = platforms.map(() => '?').join(',');
    query += ` AND platform IN (${placeholders})`;
    params.push(...platforms);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (startDate) {
    query += ' AND published_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND published_at <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = database.prepare(query);
  return stmt.all(...params) as PostRecord[];
}

export function saveMetrics(metrics: Omit<MetricsRecord, 'id' | 'fetched_at'>): void {
  const database = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO metrics (
      id, post_id, views, likes, comments, shares, saves, engagement_rate, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    metrics.post_id,
    metrics.views,
    metrics.likes,
    metrics.comments,
    metrics.shares,
    metrics.saves ?? 0,
    metrics.engagement_rate,
    now
  );

  updateHourPerformance(metrics.post_id, database);
}

export function getLatestMetrics(postId: string): MetricsRecord | null {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM metrics
    WHERE post_id = ?
    ORDER BY fetched_at DESC
    LIMIT 1
  `);
  return stmt.get(postId) as MetricsRecord | null;
}

export function getMetricsForPosts(postIds: string[]): Map<string, MetricsRecord> {
  const database = getDb();
  const placeholders = postIds.map(() => '?').join(',');

  const stmt = database.prepare(`
    SELECT * FROM metrics
    WHERE post_id IN (${placeholders})
    GROUP BY post_id
    HAVING fetched_at = MAX(fetched_at)
  `);

  const results = stmt.all(...postIds) as MetricsRecord[];
  return new Map(results.map((r) => [r.post_id, r]));
}

function updateHourPerformance(postId: string, database: Database): void {
  const postStmt = database.prepare('SELECT platform, published_at FROM posts WHERE id = ?');
  const post = postStmt.get(postId) as { platform: string; published_at: string } | null;

  if (!post) return;

  const publishedAt = new Date(post.published_at);
  const hour = publishedAt.getHours();
  const dayOfWeek = publishedAt.getDay();

  const metricsStmt = database.prepare(`
    SELECT views, likes, comments, shares, engagement_rate
    FROM metrics
    WHERE post_id = ?
    ORDER BY fetched_at DESC
    LIMIT 1
  `);
  const metrics = metricsStmt.get(postId) as {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagement_rate: number;
  } | null;

  if (!metrics) return;

  const id = `${post.platform}-${hour}-${dayOfWeek}`;
  const upsertStmt = database.prepare(`
    INSERT INTO hour_performance (
      id, platform, hour, day_of_week, posts_count, total_views,
      total_likes, total_comments, total_shares, avg_engagement_rate, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(platform, hour, day_of_week) DO UPDATE SET
      posts_count = posts_count + 1,
      total_views = total_views + excluded.total_views,
      total_likes = total_likes + excluded.total_likes,
      total_comments = total_comments + excluded.total_comments,
      total_shares = total_shares + excluded.total_shares,
      updated_at = datetime('now')
  `);

  upsertStmt.run(
    id,
    post.platform,
    hour,
    dayOfWeek,
    metrics.views,
    metrics.likes,
    metrics.comments,
    metrics.shares,
    metrics.engagement_rate
  );
}

export function getHourPerformance(platform: string): HourPerformanceRecord[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM hour_performance
    WHERE platform = ?
    ORDER BY hour, day_of_week
  `);
  return stmt.all(platform) as HourPerformanceRecord[];
}

export function getAnalyticsSummary(platforms: string[], daysBack: number = 30): {
  kpis: {
    publishedVideos: number;
    activeAccounts: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagementRate: number;
  };
  byPlatform: Record<string, {
    views: number;
    likes: number;
    comments: number;
    posts: number;
  }>;
} {
  const database = getDb();
  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  const placeholders = platforms.map(() => '?').join(',');
  const stmt = database.prepare(`
    SELECT
      p.platform,
      COUNT(DISTINCT p.id) as posts,
      COALESCE(SUM(m.views), 0) as views,
      COALESCE(SUM(m.likes), 0) as likes,
      COALESCE(SUM(m.comments), 0) as comments,
      COALESCE(SUM(m.shares), 0) as shares,
      COALESCE(SUM(m.saves), 0) as saves,
      COALESCE(AVG(m.engagement_rate), 0) as engagement_rate
    FROM posts p
    LEFT JOIN metrics m ON m.post_id = p.id
    WHERE p.platform IN (${placeholders})
      AND p.published_at >= ?
      AND p.status = 'published'
    GROUP BY p.platform
  `);

  const results = stmt.all(...platforms, startDate) as any[];

  const byPlatform: Record<string, {
    views: number;
    likes: number;
    comments: number;
    posts: number;
  }> = {};

  let totalViews = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalSaves = 0;
  let totalPosts = 0;
  let totalEngagementRate = 0;
  let platformCount = 0;

  for (const row of results) {
    byPlatform[row.platform] = {
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      posts: row.posts,
    };

    totalViews += row.views;
    totalLikes += row.likes;
    totalComments += row.comments;
    totalShares += row.shares;
    totalSaves += row.saves;
    totalPosts += row.posts;
    if (row.engagement_rate > 0) {
      totalEngagementRate += row.engagement_rate;
      platformCount++;
    }
  }

  return {
    kpis: {
      publishedVideos: totalPosts,
      activeAccounts: results.length,
      views: totalViews,
      likes: totalLikes,
      comments: totalComments,
      shares: totalShares,
      saves: totalSaves,
      engagementRate: platformCount > 0 ? totalEngagementRate / platformCount : 0,
    },
    byPlatform,
  };
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
