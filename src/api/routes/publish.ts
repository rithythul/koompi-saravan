/**
 * Publish Routes
 *
 * POST /api/publish - Publish to one or more platforms
 * GET /api/publish/status/:postId - Get publish status
 * DELETE /api/publish/:postId - Delete a post
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, PublishRequest, BatchPublishResponse, PublishResponse } from '../types.js';
import { postToAll, createClient, ALL_PLATFORMS } from '../../platforms/manager.js';
import type { PlatformName } from '../../platforms/index.js';
import * as db from '../lib/db.js';
import { publishRequestSchema, platformsArraySchema } from '../lib/validation.js';

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
app.post('/', zValidator('json', publishRequestSchema), async (c) => {
  try {
    const body = c.req.valid('json');

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
    const results: PublishResponse[] = dryRun
      ? platforms.map(p => ({ platform: p, success: true, postId: `dry-run-${crypto.randomUUID().slice(0, 8)}`, warnings: ['dry run'] }))
      : (await postToAll(content, platforms)).map(r => ({
          platform: r.platform,
          success: r.success,
          postId: r.postId ?? r.url,
          postUrl: r.url,
          error: r.error,
        }));

    // Save to database
    for (const r of results) {
      if (r.success && r.postId && !r.warnings) {
        await db.savePost({
          id: r.postId,
          platform: r.platform,
          platform_post_id: r.postId,
          content_type: body.content.type,
          media_url: body.content.mediaUrl,
          caption: body.content.caption,
          hashtags: body.content.hashtags?.join(',') || '',
          scheduled_at: body.content.scheduleAt ? new Date(body.content.scheduleAt) : null,
          published_at: new Date(),
          status: 'published',
          error_message: null,
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
  if (!postId) {
    return c.json({ error: 'Validation Error', message: 'postId is required' }, 400);
  }
  const post = await db.getPost(postId);
  if (!post) {
    return c.json({ error: 'Post not found', postId }, 404);
  }
  const metrics = await db.getLatestMetrics(postId);
  return c.json({
    postId: post.id,
    platform: post.platform,
    platformPostId: post.platform_post_id ?? '',
    status: post.status,
    publishedAt: post.published_at?.toISOString(),
    metrics: metrics ? { views: metrics.views, likes: metrics.likes, comments: metrics.comments, shares: metrics.shares, engagementRate: metrics.engagement_rate } : undefined,
  });
});

/**
 * DELETE /api/publish/:postId
 *
 * Delete a post from the platform and our database
 */
app.delete('/:postId', async (c) => {
  const postId = c.req.param('postId');
  if (!postId) {
    return c.json({ error: 'Validation Error', message: 'postId is required' }, 400);
  }

  const platform = c.req.query('platform');
  if (!platform) {
    return c.json({ error: 'Validation Error', message: 'platform query parameter is required' }, 400);
  }

  // Validate platform
  const platformResult = platformsArraySchema.safeParse([platform]);
  if (!platformResult.success) {
    return c.json({ error: 'Validation Error', message: 'Invalid platform', validationErrors: platformResult.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })) }, 400);
  }

  const post = await db.getPost(postId);
  if (!post) {
    return c.json({ error: 'Post not found', postId }, 404);
  }

  try {
    // Attempt to delete from platform
    const client = createClient(platform as PlatformName);

    // TODO: Add delete method to PlatformClient interface
    // For now, we only remove from our database
    // await client.deletePost(post.platform_post_id ?? '');

    // Remove from database (soft delete by updating status)
    await db.savePost({
      ...post,
      status: 'deleted',
      error_message: 'Deleted via API',
    });

    return c.json({
      message: 'Post deleted successfully',
      postId,
      platform,
      postUrl: post.platform_post_id ? `https://${platform}.com/p/${post.platform_post_id}` : undefined,
    });
  } catch (error) {
    return c.json({
      error: 'Delete Failed',
      message: error instanceof Error ? error.message : String(error),
      postId,
      platform,
    }, 500);
  }
});

export default app;
