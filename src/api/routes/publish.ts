/**
 * Publish Routes
 *
 * POST /api/publish - Publish to one or more platforms
 * GET /api/publish/status/:postId - Get publish status
 * DELETE /api/publish/:postId - Delete a post
 */

import { Hono } from 'hono';
import type { Bindings, PublishRequest, BatchPublishResponse, PublishResponse } from '../types.js';
import { postToAll, createClient, ALL_PLATFORMS } from '../../platforms/manager.js';
import type { PlatformName } from '../../platforms/index.js';
import * as store from '../lib/analytics-store.js';

const app = new Hono<{ Bindings: Bindings }>();

function toSocialPost(body: PublishRequest): { text: string; imageUrl?: string; videoPath?: string } {
  return {
    text: body.content.caption + (body.content.hashtags?.length ? '\n' + body.content.hashtags.map(t => '#' + t).join(' ') : ''),
    imageUrl: body.content.type === 'image' ? body.content.mediaUrl : undefined,
    videoPath: body.content.type === 'video' ? body.content.mediaUrl : undefined,
  };
}

/**
 * POST /api/publish
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json() as PublishRequest;

    if (!body.platforms?.length) {
      return c.json({ error: 'Validation Error', message: 'At least one platform is required' }, 400);
    }
    if (!body.content?.type || !body.content.mediaUrl || !body.content.caption) {
      return c.json({ error: 'Validation Error', message: 'content.type, content.mediaUrl, and content.caption are required' }, 400);
    }

    const platforms = body.platforms as PlatformName[];

    // Validate only — check if platform clients exist
    if (body.options?.validateOnly) {
      const results: PublishResponse[] = platforms.map(p => {
        const valid = (ALL_PLATFORMS as string[]).includes(p);
        return { platform: p, success: valid, error: valid ? undefined : `Unsupported platform: ${p}` };
      });
      const ok = results.filter(r => r.success).length;
      return c.json({ results, summary: { total: results.length, successful: ok, failed: results.length - ok, skipped: 0 } } as BatchPublishResponse);
    }

    // Publish
    const dryRun = c.env.DRY_RUN === 'true' || body.options?.dryRun;
    if (dryRun) {
      console.log('[DRY RUN] Would publish to:', platforms);
    }

    const content = toSocialPost(body);
    const results = dryRun
      ? platforms.map(p => ({ platform: p, success: true, warnings: ['dry run'] }))
      : await postToAll(content, platforms);

    // Save to analytics store
    for (const r of results) {
      if (r.success && r.postId) {
        store.savePost({
          id: r.postId,
          platform: r.platform,
          platform_post_id: r.postId,
          content_type: body.content.type,
          media_url: body.content.mediaUrl,
          caption: body.content.caption,
          hashtags: body.content.hashtags?.join(',') || '',
          scheduled_at: body.content.scheduleAt || undefined,
          published_at: new Date().toISOString(),
          status: 'published',
        });
      }
    }

    const ok = results.filter(r => r.success).length;
    return c.json({
      results,
      summary: { total: results.length, successful: ok, failed: results.length - ok, skipped: 0 },
    } as BatchPublishResponse);
  } catch (error) {
    console.error('Publish error:', error);
    return c.json({ error: 'Publish Failed', message: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * GET /api/publish/status/:postId
 */
app.get('/status/:postId', async (c) => {
  const postId = c.req.param('postId');
  const post = store.getPost(postId);
  if (!post) {
    return c.json({ error: 'Post not found', postId }, 404);
  }
  const metrics = store.getLatestMetrics(postId);
  return c.json({
    postId: post.id,
    platform: post.platform,
    platformPostId: post.platform_post_id,
    status: post.status,
    publishedAt: post.published_at,
    metrics: metrics ? { views: metrics.views, likes: metrics.likes, comments: metrics.comments, shares: metrics.shares, engagementRate: metrics.engagement_rate } : undefined,
  });
});

/**
 * DELETE /api/publish/:postId
 */
app.delete('/:postId', async (c) => {
  const postId = c.req.param('postId');
  const platform = c.req.query('platform');
  if (!platform) {
    return c.json({ error: 'Validation Error', message: 'platform query parameter is required' }, 400);
  }
  const post = store.getPost(postId);
  if (!post) {
    return c.json({ error: 'Post not found', postId }, 404);
  }
  return c.json({
    message: 'Delete must be done manually on the platform',
    postId,
    platform,
    postUrl: post.platform_post_id ? `https://${platform}.com/p/${post.platform_post_id}` : undefined,
  });
});

export default app;
