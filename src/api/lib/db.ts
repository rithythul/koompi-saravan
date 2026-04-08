/**
 * PostgreSQL Database Connection
 *
 * Connection pool and query helpers using `postgres` package.
 * Only activates when DATABASE_URL is set.
 */

import postgres from 'postgres';

let sql: ReturnType<typeof postgres> | null = null;

export function getPool(): ReturnType<typeof postgres> | null {
  return sql;
}

export async function query<T = any>(queryString: string, params: any[] = []): Promise<T[]> {
  if (!sql) throw new Error('PostgreSQL not connected. Set DATABASE_URL.');
  return sql.unsafe(queryString, params) as unknown as Promise<T[]>;
}

export async function initDb(): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.log('⚠️  DATABASE_URL not set — using SQLite fallback (no PostgreSQL)');
    return false;
  }

  try {
    sql = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    // Create tables
    await sql`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        platform_post_id TEXT,
        content_type TEXT,
        media_url TEXT,
        caption TEXT,
        hashtags TEXT DEFAULT '',
        scheduled_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ,
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS analytics (
        id SERIAL PRIMARY KEY,
        post_id TEXT REFERENCES posts(id),
        platform TEXT,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        engagement_rate FLOAT DEFAULT 0,
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

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
