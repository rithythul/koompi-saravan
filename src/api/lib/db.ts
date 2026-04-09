/**
 * PostgreSQL Database Connection
 *
 * Connection pool and query helpers using `postgres` package.
 * Only activates when DATABASE_URL is set.
 *
 * This is now the unified database for both posts and analytics.
 * The SQLite-based analytics-store has been migrated here.
 */

import postgres from 'postgres';

export type ErrorType = 'transient' | 'permanent' | null;

export interface PostRecord {
  id: string;
  platform: string;
  platform_post_id: string | null;
  content_type: string;
  media_url: string;
  caption: string | null;
  hashtags: string;
  scheduled_at: Date | null;
  published_at: Date | null;
  status: 'pending' | 'publishing' | 'published' | 'failed' | 'deleted';
  error_message: string | null;
  content_hash: string | null;
  external_id: string | null;
  retry_count: number;
  last_retry_at: Date | null;
  error_type: ErrorType;
  created_at: Date;
  updated_at: Date;
}

export interface MetricsRecord {
  id: string;
  post_id: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagement_rate: number;
  fetched_at: Date;
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
  updated_at: Date;
}

let sql: ReturnType<typeof postgres> | null = null;

export function getPool(): ReturnType<typeof postgres> | null {
  return sql;
}

export async function query<T = unknown>(queryString: string, params: (string | number | Date)[] = []): Promise<T[]> {
  if (!sql) throw new Error('PostgreSQL not connected. Set DATABASE_URL.');
  return sql.unsafe(queryString, params) as unknown as Promise<T[]>;
}

export async function initDb(): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.log('⚠️  DATABASE_URL not set — PostgreSQL features unavailable');
    return false;
  }

  try {
    sql = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    // Create posts table
    await sql`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        platform_post_id TEXT,
        content_type TEXT NOT NULL,
        media_url TEXT NOT NULL,
        caption TEXT,
        hashtags TEXT DEFAULT '',
        scheduled_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        content_hash TEXT,
        external_id TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_retry_at TIMESTAMPTZ,
        error_type TEXT CHECK (error_type IN ('transient', 'permanent') OR error_type IS NULL),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Create indexes for posts
    await sql`CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_posts_content_hash ON posts(content_hash)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_posts_external_id ON posts(external_id)`;

    // Migration: Add new columns for retry functionality (for existing databases)
    try {
      await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ`;
      await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS error_type TEXT CHECK (error_type IN ('transient', 'permanent') OR error_type IS NULL)`;
    } catch {
      // Columns may already exist, ignore error
    }

    // Create metrics table
    await sql`
      CREATE TABLE IF NOT EXISTS metrics (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        views INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        comments INTEGER NOT NULL DEFAULT 0,
        shares INTEGER NOT NULL DEFAULT 0,
        saves INTEGER DEFAULT 0,
        engagement_rate REAL NOT NULL DEFAULT 0,
        fetched_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_metrics_post_id ON metrics(post_id)`;

    // Create hour_performance table
    await sql`
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
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(platform, hour, day_of_week)
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_hour_performance_platform ON hour_performance(platform)`;

    console.log('✅ PostgreSQL connected and tables ready');
    return true;
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err);
    sql = null;
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}

// Post operations
export async function savePost(post: Omit<PostRecord, 'created_at' | 'updated_at'>): Promise<void> {
  if (!sql) throw new Error('PostgreSQL not connected');
  const now = new Date();
  await sql`
    INSERT INTO posts (
      id, platform, platform_post_id, content_type, media_url, caption, hashtags,
      scheduled_at, published_at, status, error_message, content_hash, external_id,
      retry_count, last_retry_at, error_type, created_at, updated_at
    ) VALUES (
      ${post.id}, ${post.platform}, ${post.platform_post_id}, ${post.content_type},
      ${post.media_url}, ${post.caption}, ${post.hashtags}, ${post.scheduled_at},
      ${post.published_at}, ${post.status}, ${post.error_message}, ${post.content_hash}, ${post.external_id},
      ${post.retry_count ?? 0}, ${post.last_retry_at ?? null}, ${post.error_type ?? null}, ${now}, ${now}
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      platform_post_id = EXCLUDED.platform_post_id,
      error_message = EXCLUDED.error_message,
      retry_count = EXCLUDED.retry_count,
      last_retry_at = EXCLUDED.last_retry_at,
      error_type = EXCLUDED.error_type,
      updated_at = ${now}
  `;
}

export async function getPost(id: string): Promise<PostRecord | null> {
  if (!sql) throw new Error('PostgreSQL not connected');
  const result = await sql<PostRecord[]>`SELECT * FROM posts WHERE id = ${id}`;
  return result[0] ?? null;
}

export async function getPosts(options: {
  platforms?: string[];
  status?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
} = {}): Promise<PostRecord[]> {
  if (!sql) throw new Error('PostgreSQL not connected');
  const { platforms, status, startDate, endDate, limit = 50, offset = 0 } = options;

  // Build the query dynamically
  let queryString = `SELECT * FROM posts WHERE 1=1`;
  const params: (string | Date | number)[] = [];
  let paramIndex = 1;

  if (platforms && platforms.length > 0) {
    const placeholders = platforms.map(() => `$${paramIndex++}`).join(',');
    queryString += ` AND platform IN (${placeholders})`;
    params.push(...platforms);
  }

  if (status) {
    queryString += ` AND status = $${paramIndex++}`;
    params.push(status);
  }

  if (startDate) {
    queryString += ` AND published_at >= $${paramIndex++}`;
    params.push(startDate);
  }

  if (endDate) {
    queryString += ` AND published_at <= $${paramIndex++}`;
    params.push(endDate);
  }

  queryString += ` ORDER BY published_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  return await query<PostRecord>(queryString, params);
}

export async function getPostsByPlatform(
  platform: string,
  options: { limit?: number; offset?: number; status?: string } = {}
): Promise<PostRecord[]> {
  if (!sql) throw new Error('PostgreSQL not connected');
  const { limit = 50, offset = 0, status } = options;

  let queryString = `SELECT * FROM posts WHERE platform = $1`;
  const params: (string | number)[] = [platform];
  let paramIndex = 2;

  if (status) {
    queryString += ` AND status = $${paramIndex++}`;
    params.push(status);
  }

  queryString += ` ORDER BY published_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  return await query<PostRecord>(queryString, params);
}

/**
 * Compute a content hash for idempotency checking
 * Hash format: SHA256(platform + type + caption + mediaUrl)
 */
export async function computeContentHash(platform: string, contentType: string, caption: string, mediaUrl: string): Promise<string> {
  const data = `${platform}:${contentType}:${caption}:${mediaUrl}`;
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Find a duplicate post by content hash within the specified time window
 * @param contentHash The content hash to search for
 * @param hoursBack Number of hours to look back (default: 24)
 * @returns The duplicate post record if found, null otherwise
 */
export async function findDuplicateByContentHash(contentHash: string, hoursBack: number = 24): Promise<PostRecord | null> {
  if (!sql) throw new Error('PostgreSQL not connected');
  const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const result = await sql<PostRecord[]>`
    SELECT * FROM posts
    WHERE content_hash = ${contentHash}
      AND published_at >= ${cutoffDate}
      AND status = 'published'
    ORDER BY published_at DESC
    LIMIT 1
  `;
  return result[0] ?? null;
}

/**
 * Find a duplicate post by external ID
 * @param externalId The external ID to search for
 * @returns The duplicate post record if found, null otherwise
 */
export async function findDuplicateByExternalId(externalId: string): Promise<PostRecord | null> {
  if (!sql) throw new Error('PostgreSQL not connected');
  const result = await sql<PostRecord[]>`
    SELECT * FROM posts
    WHERE external_id = ${externalId}
    ORDER BY published_at DESC
    LIMIT 1
  `;
  return result[0] ?? null;
}

// Metrics operations
export async function saveMetrics(metrics: Omit<MetricsRecord, 'id' | 'fetched_at'>): Promise<void> {
  if (!sql) throw new Error('PostgreSQL not connected');
  const id = crypto.randomUUID();
  const now = new Date();
  await sql`
    INSERT INTO metrics (
      id, post_id, views, likes, comments, shares, saves, engagement_rate, fetched_at
    ) VALUES (
      ${id}, ${metrics.post_id}, ${metrics.views}, ${metrics.likes},
      ${metrics.comments}, ${metrics.shares}, ${metrics.saves}, ${metrics.engagement_rate}, ${now}
    )
  `;
  await updateHourPerformance(metrics.post_id);
}

export async function getLatestMetrics(postId: string): Promise<MetricsRecord | null> {
  if (!sql) throw new Error('PostgreSQL not connected');
  const result = await sql<MetricsRecord[]>`
    SELECT * FROM metrics
    WHERE post_id = ${postId}
    ORDER BY fetched_at DESC
    LIMIT 1
  `;
  return result[0] ?? null;
}

export async function getMetricsForPosts(postIds: string[]): Promise<Map<string, MetricsRecord>> {
  if (!sql) throw new Error('PostgreSQL not connected');

  if (postIds.length === 0) return new Map();

  const placeholders = postIds.map((_, i) => `$${i + 1}`).join(',');
  const queryString = `
    SELECT DISTINCT ON (post_id) * FROM metrics
    WHERE post_id IN (${placeholders})
    ORDER BY post_id, fetched_at DESC
  `;

  const results = await query<MetricsRecord>(queryString, postIds);
  return new Map(results.map(r => [r.post_id, r]));
}

async function updateHourPerformance(postId: string): Promise<void> {
  if (!sql) throw new Error('PostgreSQL not connected');

  const postResult = await sql<{ platform: string; published_at: Date }[]>`
    SELECT platform, published_at FROM posts WHERE id = ${postId}
  `;
  const post = postResult[0];
  if (!post) return;

  const publishedAt = post.published_at;
  const hour = publishedAt.getHours();
  const dayOfWeek = publishedAt.getDay();

  const metrics = await getLatestMetrics(postId);
  if (!metrics) return;

  const id = `${post.platform}-${hour}-${dayOfWeek}`;

  await sql`
    INSERT INTO hour_performance (
      id, platform, hour, day_of_week, posts_count, total_views,
      total_likes, total_comments, total_shares, avg_engagement_rate, updated_at
    ) VALUES (
      ${id}, ${post.platform}, ${hour}, ${dayOfWeek}, 1, ${metrics.views},
      ${metrics.likes}, ${metrics.comments}, ${metrics.shares}, ${metrics.engagement_rate}, NOW()
    )
    ON CONFLICT (platform, hour, day_of_week) DO UPDATE SET
      posts_count = hour_performance.posts_count + 1,
      total_views = hour_performance.total_views + EXCLUDED.total_views,
      total_likes = hour_performance.total_likes + EXCLUDED.total_likes,
      total_comments = hour_performance.total_comments + EXCLUDED.total_comments,
      total_shares = hour_performance.total_shares + EXCLUDED.total_shares,
      updated_at = NOW()
  `;
}

export async function getHourPerformance(platform: string): Promise<HourPerformanceRecord[]> {
  if (!sql) throw new Error('PostgreSQL not connected');
  return await sql<HourPerformanceRecord[]>`
    SELECT * FROM hour_performance
    WHERE platform = ${platform}
    ORDER BY hour, day_of_week
  `;
}

export async function getAnalyticsSummary(platforms: string[], daysBack: number = 30): Promise<{
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
}> {
  if (!sql) throw new Error('PostgreSQL not connected');
  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const placeholders = platforms.map((_, i) => `$${i + 2}`).join(',');
  const queryString = `
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
    LEFT JOIN LATERAL (
      SELECT views, likes, comments, shares, saves, engagement_rate
      FROM metrics WHERE post_id = p.id ORDER BY fetched_at DESC LIMIT 1
    ) m ON true
    WHERE p.platform IN (${placeholders})
      AND p.published_at >= $1
      AND p.status = 'published'
    GROUP BY p.platform
  `;

  const results = await query<{
    platform: string;
    posts: bigint;
    views: bigint;
    likes: bigint;
    comments: bigint;
    shares: bigint;
    saves: bigint;
    engagement_rate: number;
  }>(queryString, [startDate, ...platforms]);

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
    const views = Number(row.views);
    const likes = Number(row.likes);
    const comments = Number(row.comments);
    const shares = Number(row.shares);
    const saves = Number(row.saves);
    const posts = Number(row.posts);

    byPlatform[row.platform] = { views, likes, comments, posts };

    totalViews += views;
    totalLikes += likes;
    totalComments += comments;
    totalShares += shares;
    totalSaves += saves;
    totalPosts += posts;
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

/**
 * Classify an error as transient or permanent based on error message/status
 */
export function classifyError(error: string | Error | unknown): ErrorType {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Transient errors (should retry)
  const transientPatterns = [
    'timeout', 'timed out', 'etimedout', 'esockettimedout',
    'econnreset', 'econnrefused', 'network',
    'rate limit', '429', 'too many requests',
    '503', 'service unavailable', '502', 'bad gateway',
    '504', 'gateway timeout',
    'temporary', 'try again', 'unavailable',
  ];

  // Permanent errors (should not retry)
  const permanentPatterns = [
    '401', 'unauthorized', 'authentication',
    '403', 'forbidden',
    '404', 'not found',
    '400', 'bad request', 'invalid',
    'access token', 'expired token', 'invalid token',
    'permission denied', 'not allowed',
  ];

  for (const pattern of permanentPatterns) {
    if (lowerMessage.includes(pattern)) {
      return 'permanent';
    }
  }

  for (const pattern of transientPatterns) {
    if (lowerMessage.includes(pattern)) {
      return 'transient';
    }
  }

  // Default to permanent for unknown errors
  return 'permanent';
}

/**
 * Update post with retry information
 */
export async function updatePostRetry(
  postId: string,
  retryCount: number,
  errorType: ErrorType,
  errorMessage: string | null,
): Promise<void> {
  if (!sql) throw new Error('PostgreSQL not connected');
  const now = new Date();
  await sql`
    UPDATE posts
    SET retry_count = ${retryCount},
        last_retry_at = ${now},
        error_type = ${errorType},
        error_message = ${errorMessage},
        updated_at = ${now}
    WHERE id = ${postId}
  `;
}

/**
 * Get failed posts that are eligible for retry
 */
export async function getFailedPosts(options: {
  errorType?: ErrorType;
  maxRetries?: number;
  limit?: number;
} = {}): Promise<PostRecord[]> {
  if (!sql) throw new Error('PostgreSQL not connected');
  const { errorType, maxRetries = 3, limit = 50 } = options;

  let queryString = 'SELECT * FROM posts WHERE status = $1 AND retry_count < $2';
  const params: (string | number)[] = ['failed', maxRetries];
  let paramIndex = 3;

  if (errorType) {
    queryString += ` AND error_type = $${paramIndex++}`;
    params.push(errorType);
  }

  queryString += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  return await query<PostRecord>(queryString, params);
}
