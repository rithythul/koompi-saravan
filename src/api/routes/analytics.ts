/**
 * Analytics Routes
 *
 * GET /api/analytics/summary - Get analytics summary
 * GET /api/analytics/posts - Get post-level analytics
 * POST /api/analytics/refresh - Trigger analytics refresh from platform APIs
 * GET /api/analytics/performance - Get content performance insights
 */

import { Hono } from 'hono';
import type { Bindings, AnalyticsSummary, PostAnalytics } from '../types.js';
import * as db from '../lib/db.js';
import { config } from '../../config.js';
import {
  InstagramClient,
  TikTokClient,
  YouTubeClient,
  XClient,
  LinkedInClient,
  FacebookClient,
  PinterestClient,
  TelegramClient,
  type AnalyticsData,
} from '../../platforms/index.js';

const app = new Hono<{ Bindings: Bindings }>();

// Initialize platform clients
const platformClients = {
  instagram: new InstagramClient(config.instagram),
  tiktok: new TikTokClient(config.tiktok),
  youtube: new YouTubeClient(config.youtube),
  x: new XClient(config.x),
  linkedin: new LinkedInClient(config.linkedin),
  facebook: new FacebookClient(config.facebook),
  pinterest: new PinterestClient(config.pinterest),
  telegram: new TelegramClient(config.telegram),
};

/**
 * GET /api/analytics/summary
 *
 * Get analytics summary across all platforms
 */
app.get('/summary', async (c) => {
  const range = c.req.query('range') || '30d';
  const platformsQuery = c.req.query('platforms');

  // Parse platforms from query
  const platforms = platformsQuery
    ? platformsQuery.split(',')
    : ['instagram', 'tiktok', 'youtube', 'facebook', 'pinterest', 'linkedin', 'telegram', 'x'];

  // Parse range
  const daysBack = range === '14d' ? 14 : range === '90d' ? 90 : range === '1y' ? 365 : 30;

  const summary = await db.getAnalyticsSummary(platforms, daysBack);

  return c.json({
    kpis: summary.kpis,
    byPlatform: summary.byPlatform,
    period: {
      start: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    },
  } as AnalyticsSummary);
});

/**
 * GET /api/analytics/posts
 *
 * Get post-level analytics with filtering
 */
app.get('/posts', async (c) => {
  const range = c.req.query('range') || '30d';
  const platformsQuery = c.req.query('platforms');
  const limit = parseInt(c.req.query('limit') || '25');
  const offset = parseInt(c.req.query('offset') || '0');
  const sortBy = c.req.query('sortBy') || 'published_at';
  const sortOrder = c.req.query('sortOrder') || 'desc';

  // Parse platforms
  const platforms = platformsQuery ? platformsQuery.split(',') : undefined;

  // Parse date range
  const daysBack = range === '14d' ? 14 : range === '90d' ? 90 : range === '1y' ? 365 : 30;
  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Get posts
  const posts = await db.getPosts({
    platforms,
    startDate,
    endDate: new Date(),
    status: 'published',
    limit,
    offset,
  });

  // Get metrics for posts
  const postIds = posts.map((p) => p.id);
  const metricsMap = await db.getMetricsForPosts(postIds);

  // Combine posts with metrics
  const postsWithAnalytics: PostAnalytics[] = posts.map((post) => {
    const metrics = metricsMap.get(post.id);
    return {
      id: post.id,
      platform: post.platform,
      platformPostId: post.platform_post_id ?? '',
      publishedAt: post.published_at?.toISOString() ?? '',
      views: metrics?.views ?? 0,
      likes: metrics?.likes ?? 0,
      comments: metrics?.comments ?? 0,
      shares: metrics?.shares ?? 0,
      engagementRate: metrics?.engagement_rate ?? 0,
    };
  });

  // Sort if needed
  if (sortBy === 'views') {
    postsWithAnalytics.sort((a, b) => sortOrder === 'desc' ? b.views - a.views : a.views - b.views);
  } else if (sortBy === 'likes') {
    postsWithAnalytics.sort((a, b) => sortOrder === 'desc' ? b.likes - a.likes : a.likes - b.likes);
  } else if (sortBy === 'engagementRate') {
    postsWithAnalytics.sort((a, b) => sortOrder === 'desc' ? b.engagementRate - a.engagementRate : a.engagementRate - b.engagementRate);
  }

  // Get total count
  const allPosts = await db.getPosts({
    platforms,
    startDate,
    endDate: new Date(),
    status: 'published',
  });

  return c.json({
    posts: postsWithAnalytics,
    total: allPosts.length,
    limit,
    offset,
  });
});

/**
 * GET /api/analytics/posts/:postId
 *
 * Get analytics for a specific post
 */
app.get('/posts/:postId', async (c) => {
  const postId = c.req.param('postId');

  const post = await db.getPost(postId);
  if (!post) {
    return c.json({
      error: 'Post not found',
      id: postId,
    }, 404);
  }

  const metrics = await db.getLatestMetrics(postId);

  return c.json({
    id: post.id,
    platform: post.platform,
    platformPostId: post.platform_post_id ?? '',
    publishedAt: post.published_at?.toISOString() ?? '',
    views: metrics?.views ?? 0,
    likes: metrics?.likes ?? 0,
    comments: metrics?.comments ?? 0,
    shares: metrics?.shares ?? 0,
    saves: metrics?.saves ?? 0,
    engagementRate: metrics?.engagement_rate ?? 0,
  } as PostAnalytics);
});

/**
 * POST /api/analytics/refresh
 *
 * Trigger analytics refresh for published posts from platform APIs
 * Supports refreshing a specific platform or all platforms
 */
app.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { platform, daysBack = 7 } = body as { platform?: string; daysBack?: number };

  if (!db.getPool()) {
    return c.json({
      error: 'Database not available',
      message: 'PostgreSQL connection required for analytics refresh',
    }, 503);
  }

  const platforms = platform ? [platform] : ['instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'facebook', 'pinterest', 'telegram'] as const;
  const results = {
    platforms: [] as string[],
    postsUpdated: 0,
    metricsCreated: 0,
    errors: [] as Array<{ platform: string; postId: string; error: string }>,
  };

  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  for (const p of platforms) {
    try {
      const client = platformClients[p as keyof typeof platformClients];
      if (!client) {
        results.errors.push({ platform: p, postId: 'N/A', error: 'Platform client not found' });
        continue;
      }

      // Get published posts for this platform
      const posts = await db.getPosts({
        platforms: [p],
        startDate,
        endDate: new Date(),
        status: 'published',
        limit: 100,
      });

      for (const post of posts) {
        if (!post.platform_post_id) {
          continue; // Skip posts without platform ID
        }

        try {
          const analytics = await client.getAnalytics(post.platform_post_id);

          // Calculate engagement rate
          const engagementRate = analytics.views > 0
            ? ((analytics.likes + analytics.comments + analytics.shares) / analytics.views) * 100
            : 0;

          await db.saveMetrics({
            post_id: post.id,
            views: analytics.views,
            likes: analytics.likes,
            comments: analytics.comments,
            shares: analytics.shares,
            saves: analytics.saves ?? 0,
            engagement_rate: engagementRate,
          });

          results.postsUpdated++;
          results.metricsCreated++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          results.errors.push({
            platform: p,
            postId: post.platform_post_id ?? post.id,
            error: errorMsg,
          });

          // Log specific error hints
          if (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('authentication')) {
            results.errors[results.errors.length - 1].error += ' (Auth error: re-authentication required)';
          } else if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
            results.errors[results.errors.length - 1].error += ' (Rate limited: please retry later)';
          } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
            results.errors[results.errors.length - 1].error += ' (Post may have been deleted)';
          }
        }
      }

      results.platforms.push(p);
    } catch (error) {
      results.errors.push({
        platform: p,
        postId: 'N/A',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return c.json({
    success: results.errors.length === 0,
    message: results.errors.length === 0
      ? 'Analytics refresh completed successfully'
      : `Analytics refresh completed with ${results.errors.length} errors`,
    ...results,
  });
});

/**
 * GET /api/analytics/performance
 *
 * Get content performance insights
 */
app.get('/performance', async (c) => {
  const range = c.req.query('range') || '30d';
  const platformsQuery = c.req.query('platforms');

  const platforms = platformsQuery ? platformsQuery.split(',') : ['instagram', 'tiktok', 'youtube'];

  if (!db.getPool()) {
    return c.json({
      error: 'Database not available',
      message: 'PostgreSQL connection required for performance analytics',
    }, 503);
  }

  // Get hour performance data
  const insights: {
    platform: string;
    bestHours: number[];
    avgEngagementRate: number;
    totalPosts: number;
  }[] = [];

  for (const platform of platforms) {
    const hourData = await db.getHourPerformance(platform);

    // Find best hours (highest engagement)
    const sortedByEngagement = [...hourData].sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate);
    const bestHours = sortedByEngagement.slice(0, 5).map((h) => h.hour);

    const totalPosts = hourData.reduce((sum, h) => sum + h.posts_count, 0);
    const avgEngagementRate = hourData.reduce((sum, h) => sum + h.avg_engagement_rate * h.posts_count, 0) / totalPosts;

    insights.push({
      platform,
      bestHours,
      avgEngagementRate: avgEngagementRate || 0,
      totalPosts,
    });
  }

  return c.json({
    bestPostingTimes: insights,
    recommendations: generateRecommendations(insights),
  });
});

/**
 * GET /api/analytics/hourly/:platform
 *
 * Get hourly performance data for a platform
 */
app.get('/hourly/:platform', async (c) => {
  const platform = c.req.param('platform');

  if (!db.getPool()) {
    return c.json({
      error: 'Database not available',
      message: 'PostgreSQL connection required for hourly analytics',
    }, 503);
  }

  const hourData = await db.getHourPerformance(platform);

  return c.json({
    platform,
    data: hourData,
  });
});

function generateRecommendations(insights: Array<{
  platform: string;
  bestHours: number[];
  avgEngagementRate: number;
  totalPosts: number;
}>): string[] {
  const recommendations: string[] = [];

  for (const insight of insights) {
    if (insight.bestHours.length > 0) {
      const topHour = insight.bestHours[0];
      recommendations.push(
        `For ${insight.platform}, best posting time is around ${topHour}:00`
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('Post more data to get personalized recommendations');
  }

  return recommendations;
}

export default app;
