/**
 * Analytics Routes
 *
 * GET /api/analytics/summary - Get analytics summary
 * GET /api/analytics/posts - Get post-level analytics
 * POST /api/analytics/refresh - Trigger analytics refresh
 */

import { Hono } from 'hono';
import type { Bindings, AnalyticsSummary, PostAnalytics } from '../types.js';
import * as db from '../lib/db.js';

const app = new Hono<{ Bindings: Bindings }>();

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
    : ['telegram', 'x'];

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
 * Trigger analytics refresh for a platform
 */
app.post('/refresh', async (c) => {
  const body = await c.req.json();
  const { platform } = body;

  if (!platform) {
    return c.json({
      error: 'Validation Error',
      message: 'platform is required',
    }, 400);
  }

  // TODO: Implement actual analytics refresh via platform APIs
  return c.json({
    message: 'Analytics refresh triggered',
    platform,
    status: 'pending',
    refreshId: crypto.randomUUID(),
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

  const platforms = platformsQuery ? platformsQuery.split(',') : ['telegram', 'x'];

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
