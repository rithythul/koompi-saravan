import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Database } from './db.js';

import type { GoogleMediaConfig } from './config.js';
import { getOutputRoot } from './output-paths.js';
import type {
  ContentRun,
  ConversionEvent,
  PlannedPost,
  GeneratedAsset,
  HourPerformance,
  Post,
  PostMetric,
  PostPerformanceRow,
  PostWithLatestMetric,
  PublishedPost,
  RenderedVideo,
  RunStatus,
} from './types.js';

export interface GoogleMediaStore {
  db: Database;
  dbPath: string;
}

const stores = new Map<string, GoogleMediaStore>();
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const initSql = fs
  .readdirSync(migrationsDir)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort((left, right) => left.localeCompare(right))
  .map((fileName) => fs.readFileSync(path.join(migrationsDir, fileName), 'utf8'))
  .join('\n\n');

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.trim() === '') {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function serializeMetadata(value?: Record<string, unknown>): string {
  return JSON.stringify(value ?? {});
}

function serializeStringArray(value?: string[]): string {
  return JSON.stringify(value ?? []);
}

function getDatabasePath(config: GoogleMediaConfig): string {
  return path.join(path.dirname(getOutputRoot(config)), 'google-media.sqlite');
}

function openStore(dbPath: string): GoogleMediaStore {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(initSql);
  return { db, dbPath };
}

export function initStore(config: GoogleMediaConfig): GoogleMediaStore {
  const dbPath = getDatabasePath(config);
  const existing = stores.get(dbPath);
  if (existing) {
    return existing;
  }

  const store = openStore(dbPath);
  stores.set(dbPath, store);
  return store;
}

function mapRun(row: Record<string, unknown>): ContentRun {
  return {
    id: String(row.id),
    status: row.status as RunStatus,
    prompt: row.prompt ? String(row.prompt) : undefined,
    outputDir: String(row.output_dir),
    error: row.error ? String(row.error) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    metadata: parseJsonObject(row.metadata_json),
  };
}

function mapRenderedVideo(row: Record<string, unknown>): RenderedVideo {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    compositionId: String(row.composition_id),
    filePath: String(row.file_path),
    width: Number(row.width),
    height: Number(row.height),
    fps: Number(row.fps),
    durationInFrames: Number(row.duration_in_frames),
    createdAt: String(row.created_at),
    metadata: parseJsonObject(row.metadata_json),
  };
}

function mapPost(row: Record<string, unknown>): Post {
  return {
    id: String(row.id),
    platform: row.platform as Post['platform'],
    platformPostId: row.platform_post_id ? String(row.platform_post_id) : undefined,
    postedAt: String(row.posted_at),
    contentType: row.content_type as Post['contentType'],
    videoPath: String(row.video_path),
    hookText: row.hook_text ? String(row.hook_text) : undefined,
    caption: row.caption ? String(row.caption) : undefined,
    hashtags: parseJsonArray(row.hashtags),
    scheduledBy: row.scheduled_by as Post['scheduledBy'],
    confidenceScore:
      row.confidence_score === null || row.confidence_score === undefined
        ? undefined
        : Number(row.confidence_score),
    scheduledHour: Number(row.scheduled_hour),
    runId: row.run_id ? String(row.run_id) : undefined,
    createdAt: String(row.created_at),
  };
}

function mapHourPerformance(row: Record<string, unknown>): HourPerformance {
  return {
    id: String(row.id),
    platform: row.platform as HourPerformance['platform'],
    hour: Number(row.hour),
    dayOfWeek:
      row.day_of_week === null || row.day_of_week === undefined
        ? undefined
        : Number(row.day_of_week),
    postCount: Number(row.post_count ?? 0),
    totalViews: Number(row.total_views ?? 0),
    totalLikes: Number(row.total_likes ?? 0),
    totalShares: Number(row.total_shares ?? 0),
    totalSaves: Number(row.total_saves ?? 0),
    avgViews: Number(row.avg_views ?? 0),
    avgEngagementRate: Number(row.avg_engagement_rate ?? 0),
    avgCompletionRate: Number(row.avg_completion_rate ?? 0),
    performanceScore: Number(row.performance_score ?? 0),
    lastUpdated: String(row.last_updated),
  };
}

function mapPublishedPost(row: Record<string, unknown>): PublishedPost {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    platform: row.platform as PublishedPost['platform'],
    status: row.status as PublishedPost['status'],
    caption: String(row.caption),
    videoPath: String(row.video_path),
    videoUrl: row.video_url ? String(row.video_url) : undefined,
    platformPostId: row.platform_post_id ? String(row.platform_post_id) : undefined,
    permalink: row.permalink ? String(row.permalink) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    metadata: parseJsonObject(row.metadata_json),
  };
}

function mapConversionEvent(row: Record<string, unknown>): ConversionEvent {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    occurredAt: String(row.occurred_at),
    eventType: String(row.event_type) as ConversionEvent['eventType'],
    value:
      row.value === null || row.value === undefined ? undefined : Number(row.value),
    currency: row.currency ? String(row.currency) : undefined,
    quantity: Number(row.quantity ?? 1),
    metadata: parseJsonObject(row.metadata_json),
    createdAt: String(row.created_at),
  };
}

function mapPlannedPost(row: Record<string, unknown>): PlannedPost {
  return {
    id: String(row.id),
    platform: row.platform as PlannedPost['platform'],
    scheduledFor: String(row.scheduled_for),
    contentType: row.content_type as PlannedPost['contentType'],
    scheduleStrategy: row.schedule_strategy as PlannedPost['scheduleStrategy'],
    confidence: Number(row.confidence),
    reason: String(row.reason),
    hookText: row.hook_text ? String(row.hook_text) : undefined,
    caption: row.caption ? String(row.caption) : undefined,
    objective: row.objective as PlannedPost['objective'],
    sourcePostIds: parseJsonArray(row.source_post_ids),
    runId: row.run_id ? String(row.run_id) : undefined,
    status: row.status as PlannedPost['status'],
    metadata: parseJsonObject(row.metadata_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function scoreHourPerformanceRows(rows: Array<Omit<HourPerformance, 'performanceScore'>>): HourPerformance[] {
  const groups = new Map<string, Array<Omit<HourPerformance, 'performanceScore'>>>();

  for (const row of rows) {
    const key = `${row.platform}:${row.dayOfWeek ?? 'all'}`;
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  }

  const scored: HourPerformance[] = [];

  for (const groupRows of groups.values()) {
    const maxViews = Math.max(...groupRows.map((row) => row.avgViews), 1);
    const maxEngagement = Math.max(...groupRows.map((row) => row.avgEngagementRate), 0.0001);
    const maxCompletion = Math.max(...groupRows.map((row) => row.avgCompletionRate), 0.0001);

    for (const row of groupRows) {
      const viewScore = (row.avgViews / maxViews) * 60;
      const engagementScore = (row.avgEngagementRate / maxEngagement) * 25;
      const completionScore = (row.avgCompletionRate / maxCompletion) * 10;
      const volumeBonus = Math.min(5, row.postCount);
      const performanceScore = Number(
        Math.max(0, Math.min(100, viewScore + engagementScore + completionScore + volumeBonus)).toFixed(2),
      );

      scored.push({
        ...row,
        performanceScore,
      });
    }
  }

  return scored;
}

export function createRun(
  store: GoogleMediaStore,
  input: {
    id: string;
    prompt?: string;
    outputDir: string;
    status?: RunStatus;
    metadata?: Record<string, unknown>;
  },
): ContentRun {
  const now = new Date().toISOString();
  const status = input.status ?? 'pending';

  store.db
    .prepare(
      `INSERT INTO content_runs (id, status, prompt, output_dir, error, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
    )
    .run(
      input.id,
      status,
      input.prompt ?? null,
      input.outputDir,
      serializeMetadata(input.metadata),
      now,
      now,
    );

  return getRunById(store, input.id)!;
}

export function getRunById(store: GoogleMediaStore, runId: string): ContentRun | null {
  const row = store.db
    .prepare('SELECT * FROM content_runs WHERE id = ?')
    .get(runId) as Record<string, unknown> | undefined;

  return row ? mapRun(row) : null;
}

export function getLatestRenderedVideoForRun(
  store: GoogleMediaStore,
  runId: string,
): RenderedVideo | null {
  const row = store.db
    .prepare(
      `SELECT * FROM rendered_videos
       WHERE run_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(runId) as Record<string, unknown> | undefined;

  return row ? mapRenderedVideo(row) : null;
}

export function getPostById(store: GoogleMediaStore, postId: string): Post | null {
  const row = store.db
    .prepare('SELECT * FROM posts WHERE id = ? LIMIT 1')
    .get(postId) as Record<string, unknown> | undefined;

  return row ? mapPost(row) : null;
}

export function getPostByPlatformPostId(
  store: GoogleMediaStore,
  platform: Post['platform'],
  platformPostId: string,
): Post | null {
  const row = store.db
    .prepare(
      `SELECT * FROM posts
       WHERE platform = ? AND platform_post_id = ?
       ORDER BY posted_at DESC
       LIMIT 1`,
    )
    .get(platform, platformPostId) as Record<string, unknown> | undefined;

  return row ? mapPost(row) : null;
}

export function getPostByRunId(
  store: GoogleMediaStore,
  runId: string,
  platform?: Post['platform'],
): Post | null {
  const row = platform
    ? (store.db
        .prepare(
          `SELECT * FROM posts
           WHERE run_id = ? AND platform = ?
           ORDER BY posted_at DESC
           LIMIT 1`,
        )
        .get(runId, platform) as Record<string, unknown> | undefined)
    : (store.db
        .prepare(
          `SELECT * FROM posts
           WHERE run_id = ?
           ORDER BY posted_at DESC
           LIMIT 1`,
        )
        .get(runId) as Record<string, unknown> | undefined);

  return row ? mapPost(row) : null;
}

export function savePost(
  store: GoogleMediaStore,
  post: Omit<Post, 'createdAt'>,
): Post {
  const createdAt = new Date().toISOString();

  store.db
    .prepare(
      `INSERT INTO posts (
         id, platform, platform_post_id, posted_at, content_type, video_path,
         hook_text, caption, hashtags, scheduled_by, confidence_score,
         scheduled_hour, run_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      post.id,
      post.platform,
      post.platformPostId ?? null,
      post.postedAt,
      post.contentType,
      post.videoPath,
      post.hookText ?? null,
      post.caption ?? null,
      serializeStringArray(post.hashtags),
      post.scheduledBy,
      post.confidenceScore ?? null,
      post.scheduledHour,
      post.runId ?? null,
      createdAt,
    );

  return {
    ...post,
    createdAt,
  };
}

export function getRecentPosts(
  store: GoogleMediaStore,
  options: {
    platform?: Post['platform'];
    since?: string;
    limit?: number;
  } = {},
): Post[] {
  let sql = 'SELECT * FROM posts WHERE 1 = 1';
  const params: Array<string | number> = [];

  if (options.platform) {
    sql += ' AND platform = ?';
    params.push(options.platform);
  }

  if (options.since) {
    sql += ' AND posted_at >= ?';
    params.push(options.since);
  }

  sql += ' ORDER BY posted_at DESC LIMIT ?';
  params.push(options.limit ?? 50);

  const rows = store.db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapPost);
}

export function savePostMetric(
  store: GoogleMediaStore,
  metric: Omit<PostMetric, 'createdAt'>,
): PostMetric {
  const createdAt = new Date().toISOString();

  store.db
    .prepare(
      `INSERT INTO post_metrics (
         id, post_id, pulled_at, views, likes, comments, shares, saves,
         completion_rate, avg_watch_time_seconds, reach, impressions,
         platform_data, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      metric.id,
      metric.postId,
      metric.pulledAt,
      metric.views,
      metric.likes,
      metric.comments,
      metric.shares,
      metric.saves,
      metric.completionRate ?? null,
      metric.avgWatchTimeSeconds ?? null,
      metric.reach,
      metric.impressions,
      metric.platformData ? serializeMetadata(metric.platformData) : null,
      createdAt,
    );

  return {
    ...metric,
    createdAt,
  };
}

export function saveConversionEvent(
  store: GoogleMediaStore,
  conversion: Omit<ConversionEvent, 'createdAt'>,
): ConversionEvent {
  const createdAt = new Date().toISOString();

  store.db
    .prepare(
      `INSERT INTO conversion_events (
         id, post_id, occurred_at, event_type, value, currency, quantity, metadata_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      conversion.id,
      conversion.postId,
      conversion.occurredAt,
      conversion.eventType,
      conversion.value ?? null,
      conversion.currency ?? null,
      conversion.quantity,
      serializeMetadata(conversion.metadata),
      createdAt,
    );

  return {
    ...conversion,
    createdAt,
  };
}

export function getConversionsForPost(
  store: GoogleMediaStore,
  postId: string,
): ConversionEvent[] {
  const rows = store.db
    .prepare(
      `SELECT * FROM conversion_events
       WHERE post_id = ?
       ORDER BY occurred_at DESC`,
    )
    .all(postId) as Record<string, unknown>[];

  return rows.map(mapConversionEvent);
}

export function getPostsMetricsJoined(
  store: GoogleMediaStore,
  options: {
    platform: Post['platform'];
    daysBack: number;
  },
): PostWithLatestMetric[] {
  const since = new Date(Date.now() - options.daysBack * 24 * 60 * 60 * 1000).toISOString();

  const rows = store.db
    .prepare(
      `SELECT
         p.*,
         m.id AS metric_id,
         m.pulled_at,
         m.views,
         m.likes,
         m.comments,
         m.shares,
         m.saves,
         m.completion_rate,
         m.avg_watch_time_seconds,
         m.reach,
         m.impressions,
         m.platform_data,
         m.created_at AS metric_created_at
       FROM posts p
       LEFT JOIN post_metrics m
         ON m.post_id = p.id
        AND m.pulled_at = (
          SELECT MAX(pm.pulled_at)
          FROM post_metrics pm
          WHERE pm.post_id = p.id
        )
       WHERE p.platform = ?
         AND p.posted_at >= ?
       ORDER BY p.posted_at DESC`,
    )
    .all(options.platform, since) as Record<string, unknown>[];

  return rows.map((row) => ({
    ...mapPost(row),
    metricId: row.metric_id ? String(row.metric_id) : undefined,
    pulledAt: row.pulled_at ? String(row.pulled_at) : undefined,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    shares: Number(row.shares ?? 0),
    saves: Number(row.saves ?? 0),
    completionRate:
      row.completion_rate === null || row.completion_rate === undefined
        ? undefined
        : Number(row.completion_rate),
    avgWatchTimeSeconds:
      row.avg_watch_time_seconds === null || row.avg_watch_time_seconds === undefined
        ? undefined
        : Number(row.avg_watch_time_seconds),
    reach: Number(row.reach ?? 0),
    impressions: Number(row.impressions ?? 0),
    platformData: parseJsonObject(row.platform_data),
    metricCreatedAt: row.metric_created_at ? String(row.metric_created_at) : undefined,
  }));
}

export function getPostPerformanceRows(
  store: GoogleMediaStore,
  options: {
    platform: Post['platform'];
    daysBack: number;
  },
): PostPerformanceRow[] {
  const since = new Date(Date.now() - options.daysBack * 24 * 60 * 60 * 1000).toISOString();

  const rows = store.db
    .prepare(
      `WITH latest_metrics AS (
         SELECT pm.*
         FROM post_metrics pm
         INNER JOIN (
           SELECT post_id, MAX(pulled_at) AS max_pulled_at
           FROM post_metrics
           GROUP BY post_id
         ) latest
           ON latest.post_id = pm.post_id
          AND latest.max_pulled_at = pm.pulled_at
       ), conversion_rollup AS (
         SELECT
           post_id,
           SUM(quantity) AS conversion_count,
           SUM(COALESCE(value, 0) * COALESCE(quantity, 1)) AS revenue,
           MAX(occurred_at) AS last_conversion_at
         FROM conversion_events
         GROUP BY post_id
       )
       SELECT
         p.*,
         m.id AS metric_id,
         m.pulled_at,
         m.views,
         m.likes,
         m.comments,
         m.shares,
         m.saves,
         m.completion_rate,
         m.avg_watch_time_seconds,
         m.reach,
         m.impressions,
         m.platform_data,
         m.created_at AS metric_created_at,
         cr.conversion_count,
         cr.revenue,
         cr.last_conversion_at
       FROM posts p
       LEFT JOIN latest_metrics m ON m.post_id = p.id
       LEFT JOIN conversion_rollup cr ON cr.post_id = p.id
       WHERE p.platform = ?
         AND p.posted_at >= ?
       ORDER BY p.posted_at DESC`,
    )
    .all(options.platform, since) as Record<string, unknown>[];

  return rows.map((row) => ({
    ...mapPost(row),
    metricId: row.metric_id ? String(row.metric_id) : undefined,
    pulledAt: row.pulled_at ? String(row.pulled_at) : undefined,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    shares: Number(row.shares ?? 0),
    saves: Number(row.saves ?? 0),
    completionRate:
      row.completion_rate === null || row.completion_rate === undefined
        ? undefined
        : Number(row.completion_rate),
    avgWatchTimeSeconds:
      row.avg_watch_time_seconds === null || row.avg_watch_time_seconds === undefined
        ? undefined
        : Number(row.avg_watch_time_seconds),
    reach: Number(row.reach ?? 0),
    impressions: Number(row.impressions ?? 0),
    platformData: parseJsonObject(row.platform_data),
    metricCreatedAt: row.metric_created_at ? String(row.metric_created_at) : undefined,
    conversionCount: Number(row.conversion_count ?? 0),
    revenue: Number(row.revenue ?? 0),
    lastConversionAt: row.last_conversion_at ? String(row.last_conversion_at) : undefined,
  }));
}

export function getHourPerformance(
  store: GoogleMediaStore,
  platform: HourPerformance['platform'],
  options: {
    dayOfWeek?: number;
  } = {},
): HourPerformance[] {
  const rows =
    options.dayOfWeek === undefined
      ? (store.db
          .prepare(
            `SELECT *
             FROM hour_performance
             WHERE platform = ? AND day_of_week IS NULL
             ORDER BY performance_score DESC, hour ASC`,
          )
          .all(platform) as Record<string, unknown>[])
      : (store.db
          .prepare(
            `SELECT *
             FROM hour_performance
             WHERE platform = ? AND day_of_week = ?
             ORDER BY performance_score DESC, hour ASC`,
          )
          .all(platform, options.dayOfWeek) as Record<string, unknown>[]);

  return rows.map(mapHourPerformance);
}

export function updateHourPerformance(store: GoogleMediaStore): HourPerformance[] {
  const overallRows = store.db
    .prepare(
      `WITH latest_metrics AS (
         SELECT pm.*
         FROM post_metrics pm
         INNER JOIN (
           SELECT post_id, MAX(pulled_at) AS max_pulled_at
           FROM post_metrics
           GROUP BY post_id
         ) latest
           ON latest.post_id = pm.post_id
          AND latest.max_pulled_at = pm.pulled_at
       )
       SELECT
         printf('%s-%02d-all', p.platform, p.scheduled_hour) AS id,
         p.platform,
         p.scheduled_hour AS hour,
         NULL AS day_of_week,
         COUNT(*) AS post_count,
         SUM(COALESCE(m.views, 0)) AS total_views,
         SUM(COALESCE(m.likes, 0)) AS total_likes,
         SUM(COALESCE(m.shares, 0)) AS total_shares,
         SUM(COALESCE(m.saves, 0)) AS total_saves,
         AVG(COALESCE(m.views, 0)) AS avg_views,
         AVG(
           CASE
             WHEN COALESCE(m.views, 0) > 0 THEN
               (COALESCE(m.likes, 0) + COALESCE(m.comments, 0) + COALESCE(m.shares, 0) + COALESCE(m.saves, 0)) * 1.0 / m.views
             ELSE 0
           END
         ) AS avg_engagement_rate,
         AVG(COALESCE(m.completion_rate, 0)) AS avg_completion_rate,
         CURRENT_TIMESTAMP AS last_updated
       FROM posts p
       LEFT JOIN latest_metrics m ON m.post_id = p.id
       GROUP BY p.platform, p.scheduled_hour`,
    )
    .all() as Array<Record<string, unknown>>;

  const dayRows = store.db
    .prepare(
      `WITH latest_metrics AS (
         SELECT pm.*
         FROM post_metrics pm
         INNER JOIN (
           SELECT post_id, MAX(pulled_at) AS max_pulled_at
           FROM post_metrics
           GROUP BY post_id
         ) latest
           ON latest.post_id = pm.post_id
          AND latest.max_pulled_at = pm.pulled_at
       )
       SELECT
         printf('%s-%02d-%d', p.platform, p.scheduled_hour, CAST(strftime('%w', p.posted_at) AS INTEGER)) AS id,
         p.platform,
         p.scheduled_hour AS hour,
         CAST(strftime('%w', p.posted_at) AS INTEGER) AS day_of_week,
         COUNT(*) AS post_count,
         SUM(COALESCE(m.views, 0)) AS total_views,
         SUM(COALESCE(m.likes, 0)) AS total_likes,
         SUM(COALESCE(m.shares, 0)) AS total_shares,
         SUM(COALESCE(m.saves, 0)) AS total_saves,
         AVG(COALESCE(m.views, 0)) AS avg_views,
         AVG(
           CASE
             WHEN COALESCE(m.views, 0) > 0 THEN
               (COALESCE(m.likes, 0) + COALESCE(m.comments, 0) + COALESCE(m.shares, 0) + COALESCE(m.saves, 0)) * 1.0 / m.views
             ELSE 0
           END
         ) AS avg_engagement_rate,
         AVG(COALESCE(m.completion_rate, 0)) AS avg_completion_rate,
         CURRENT_TIMESTAMP AS last_updated
       FROM posts p
       LEFT JOIN latest_metrics m ON m.post_id = p.id
       GROUP BY p.platform, p.scheduled_hour, CAST(strftime('%w', p.posted_at) AS INTEGER)`,
    )
    .all() as Array<Record<string, unknown>>;

  const scoredRows = scoreHourPerformanceRows(
    [...overallRows, ...dayRows].map((row) => ({
      id: String(row.id),
      platform: row.platform as HourPerformance['platform'],
      hour: Number(row.hour),
      dayOfWeek:
        row.day_of_week === null || row.day_of_week === undefined
          ? undefined
          : Number(row.day_of_week),
      postCount: Number(row.post_count ?? 0),
      totalViews: Number(row.total_views ?? 0),
      totalLikes: Number(row.total_likes ?? 0),
      totalShares: Number(row.total_shares ?? 0),
      totalSaves: Number(row.total_saves ?? 0),
      avgViews: Number(row.avg_views ?? 0),
      avgEngagementRate: Number(row.avg_engagement_rate ?? 0),
      avgCompletionRate: Number(row.avg_completion_rate ?? 0),
      lastUpdated: String(row.last_updated),
    })),
  );

  const insertStatement = store.db.prepare(
    `INSERT OR REPLACE INTO hour_performance (
       id, platform, hour, day_of_week, post_count, total_views, total_likes, total_shares,
       total_saves, avg_views, avg_engagement_rate, avg_completion_rate, performance_score, last_updated
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  store.db.exec('DELETE FROM hour_performance');

  for (const row of scoredRows) {
    insertStatement.run(
      row.id,
      row.platform,
      row.hour,
      row.dayOfWeek ?? null,
      row.postCount,
      row.totalViews,
      row.totalLikes,
      row.totalShares,
      row.totalSaves,
      row.avgViews,
      row.avgEngagementRate,
      row.avgCompletionRate,
      row.performanceScore,
      row.lastUpdated,
    );
  }

  return scoredRows;
}

export function updateRunStatus(
  store: GoogleMediaStore,
  runId: string,
  status: RunStatus,
  options: {
    error?: string;
    metadata?: Record<string, unknown>;
  } = {},
): ContentRun {
  const existing = getRunById(store, runId);
  if (!existing) {
    throw new Error(`Run not found: ${runId}`);
  }

  const metadata = { ...existing.metadata, ...(options.metadata ?? {}) };
  const updatedAt = new Date().toISOString();

  store.db
    .prepare(
      `UPDATE content_runs
       SET status = ?,
           error = ?,
           metadata_json = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      status,
      options.error ?? null,
      serializeMetadata(metadata),
      updatedAt,
      runId,
    );

  return getRunById(store, runId)!;
}

export function saveGeneratedAsset(
  store: GoogleMediaStore,
  asset: Omit<GeneratedAsset, 'createdAt'>,
): GeneratedAsset {
  const createdAt = new Date().toISOString();
  store.db
    .prepare(
      `INSERT INTO generated_assets (id, run_id, kind, mime_type, file_path, file_size_bytes, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      asset.id,
      asset.runId,
      asset.kind,
      asset.mimeType,
      asset.filePath,
      asset.fileSizeBytes,
      serializeMetadata(asset.metadata),
      createdAt,
    );

  return {
    ...asset,
    createdAt,
  };
}

export function saveRenderedVideo(
  store: GoogleMediaStore,
  video: Omit<RenderedVideo, 'createdAt'>,
): RenderedVideo {
  const createdAt = new Date().toISOString();
  store.db
    .prepare(
      `INSERT INTO rendered_videos (id, run_id, composition_id, file_path, width, height, fps, duration_in_frames, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      video.id,
      video.runId,
      video.compositionId,
      video.filePath,
      video.width,
      video.height,
      video.fps,
      video.durationInFrames,
      serializeMetadata(video.metadata),
      createdAt,
    );

  return {
    ...video,
    createdAt,
  };
}

export function getPublishedPostByRunAndPlatform(
  store: GoogleMediaStore,
  runId: string,
  platform: PublishedPost['platform'],
): PublishedPost | null {
  const row = store.db
    .prepare(
      `SELECT * FROM published_posts
       WHERE run_id = ? AND platform = ?
       LIMIT 1`,
    )
    .get(runId, platform) as Record<string, unknown> | undefined;

  return row ? mapPublishedPost(row) : null;
}

export function savePublishedPost(
  store: GoogleMediaStore,
  publication: Omit<PublishedPost, 'createdAt' | 'updatedAt'>,
): PublishedPost {
  const existing = getPublishedPostByRunAndPlatform(store, publication.runId, publication.platform);
  const createdAt = existing?.createdAt ?? new Date().toISOString();
  const updatedAt = new Date().toISOString();

  store.db
    .prepare(
      `INSERT INTO published_posts (
         id, run_id, platform, status, caption, video_path, video_url, platform_post_id, permalink, metadata_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id, platform) DO UPDATE SET
         id = excluded.id,
         status = excluded.status,
         caption = excluded.caption,
         video_path = excluded.video_path,
         video_url = excluded.video_url,
         platform_post_id = excluded.platform_post_id,
         permalink = excluded.permalink,
         metadata_json = excluded.metadata_json,
         updated_at = excluded.updated_at`,
    )
    .run(
      publication.id,
      publication.runId,
      publication.platform,
      publication.status,
      publication.caption,
      publication.videoPath,
      publication.videoUrl ?? null,
      publication.platformPostId ?? null,
      publication.permalink ?? null,
      serializeMetadata(publication.metadata),
      createdAt,
      updatedAt,
    );

  return getPublishedPostByRunAndPlatform(store, publication.runId, publication.platform)!;
}

export function savePlannedPost(
  store: GoogleMediaStore,
  plannedPost: Omit<PlannedPost, 'createdAt' | 'updatedAt'>,
): PlannedPost {
  const existing = getPlannedPostById(store, plannedPost.id);
  const createdAt = existing?.createdAt ?? new Date().toISOString();
  const updatedAt = new Date().toISOString();

  store.db
    .prepare(
      `INSERT INTO planned_posts (
         id, platform, scheduled_for, content_type, schedule_strategy, confidence,
         reason, hook_text, caption, objective, source_post_ids, run_id, status,
         metadata_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         platform = excluded.platform,
         scheduled_for = excluded.scheduled_for,
         content_type = excluded.content_type,
         schedule_strategy = excluded.schedule_strategy,
         confidence = excluded.confidence,
         reason = excluded.reason,
         hook_text = excluded.hook_text,
         caption = excluded.caption,
         objective = excluded.objective,
         source_post_ids = excluded.source_post_ids,
         run_id = excluded.run_id,
         status = excluded.status,
         metadata_json = excluded.metadata_json,
         updated_at = excluded.updated_at`,
    )
    .run(
      plannedPost.id,
      plannedPost.platform,
      plannedPost.scheduledFor,
      plannedPost.contentType,
      plannedPost.scheduleStrategy,
      plannedPost.confidence,
      plannedPost.reason,
      plannedPost.hookText ?? null,
      plannedPost.caption ?? null,
      plannedPost.objective,
      serializeStringArray(plannedPost.sourcePostIds),
      plannedPost.runId ?? null,
      plannedPost.status,
      serializeMetadata(plannedPost.metadata),
      createdAt,
      updatedAt,
    );

  return getPlannedPostById(store, plannedPost.id)!;
}

export function getPlannedPostById(
  store: GoogleMediaStore,
  plannedPostId: string,
): PlannedPost | null {
  const row = store.db
    .prepare('SELECT * FROM planned_posts WHERE id = ? LIMIT 1')
    .get(plannedPostId) as Record<string, unknown> | undefined;

  return row ? mapPlannedPost(row) : null;
}

export function listPlannedPosts(
  store: GoogleMediaStore,
  options: {
    date?: string;
    platform?: PlannedPost['platform'];
    status?: PlannedPost['status'];
  } = {},
): PlannedPost[] {
  let sql = 'SELECT * FROM planned_posts WHERE 1 = 1';
  const params: Array<string> = [];

  if (options.date) {
    sql += ' AND substr(scheduled_for, 1, 10) = ?';
    params.push(options.date);
  }

  if (options.platform) {
    sql += ' AND platform = ?';
    params.push(options.platform);
  }

  if (options.status) {
    sql += ' AND status = ?';
    params.push(options.status);
  }

  sql += ' ORDER BY scheduled_for ASC';

  const rows = store.db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapPlannedPost);
}

export function updatePlannedPostStatus(
  store: GoogleMediaStore,
  plannedPostId: string,
  status: PlannedPost['status'],
  metadata?: Record<string, unknown>,
): PlannedPost {
  const existing = getPlannedPostById(store, plannedPostId);
  if (!existing) {
    throw new Error(`Planned post not found: ${plannedPostId}`);
  }

  const updatedMetadata = {
    ...existing.metadata,
    ...(metadata ?? {}),
  };

  store.db
    .prepare(
      `UPDATE planned_posts
       SET status = ?, metadata_json = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(status, serializeMetadata(updatedMetadata), new Date().toISOString(), plannedPostId);

  return getPlannedPostById(store, plannedPostId)!;
}
