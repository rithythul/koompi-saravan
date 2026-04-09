/**
 * Publish Routes
 *
 * POST /api/publish - Publish to one or more platforms
 * GET /api/publish/status/:postId - Get publish status
 * POST /api/publish/retry/:postId - Retry a failed post
 * DELETE /api/publish/:postId - Delete a post
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type {
  Bindings,
  PublishRequest,
  BatchPublishResponse,
  PublishResponse,
  RetryResponse,
  RetryOptions,
} from '../types.js';
import { postToAll, createClient, ALL_PLATFORMS, retryPublishAll, MAX_RETRIES } from '../../platforms/manager.js';
import type { PlatformName } from '../../platforms/index.js';
import * as db from '../lib/db.js';
import { publishRequestSchema, platformsArraySchema } from '../lib/validation.js';
import { computeContentHash, findDuplicateByContentHash, findDuplicateByExternalId } from '../lib/db.js';

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

    // Idempotency check: Check for duplicate by external_id first
    if (body.external_id) {
      const duplicateByExternalId = await findDuplicateByExternalId(body.external_id);
      if (duplicateByExternalId) {
        const hoursAgo = Math.floor((Date.now() - duplicateByExternalId.published_at!.getTime()) / (1000 * 60 * 60));
        return c.json({
          results: [{
            platform: duplicateByExternalId.platform,
            success: true,
            postId: duplicateByExternalId.id,
            postUrl: duplicateByExternalId.platform_post_id
              ? `https://${duplicateByExternalId.platform}.com/p/${duplicateByExternalId.platform_post_id}`
              : undefined,
            warnings: ['duplicate post'],
          }],
          summary: { total: 1, successful: 1, failed: 0, skipped: 0 },
          status: 'duplicate',
          duplicateInfo: {
            existingPostId: duplicateByExternalId.id,
            message: `Identical content was published ${hoursAgo} hours ago via external_id`,
            publishedAt: duplicateByExternalId.published_at!.toISOString(),
          },
        } as BatchPublishResponse, 200);
      }
    }

    // Idempotency check: Check for duplicate by content hash
    const contentHash = body.idempotency_key || await computeContentHash(
      platforms.join(','),
      body.content.type,
      body.content.caption,
      body.content.mediaUrl
    );

    const duplicateByHash = await findDuplicateByContentHash(contentHash, 24);
    if (duplicateByHash) {
      const hoursAgo = Math.floor((Date.now() - duplicateByHash.published_at!.getTime()) / (1000 * 60 * 60));
      return c.json({
        results: [{
          platform: duplicateByHash.platform,
          success: true,
          postId: duplicateByHash.id,
          postUrl: duplicateByHash.platform_post_id
            ? `https://${duplicateByHash.platform}.com/p/${duplicateByHash.platform_post_id}`
            : undefined,
          warnings: ['duplicate post'],
        }],
        summary: { total: 1, successful: 1, failed: 0, skipped: 0 },
        status: 'duplicate',
        duplicateInfo: {
          existingPostId: duplicateByHash.id,
          message: `Identical content was published ${hoursAgo} hours ago`,
          publishedAt: duplicateByHash.published_at!.toISOString(),
        },
      } as BatchPublishResponse, 200);
    }

    // Publish
    const dryRun = c.env.DRY_RUN === 'true' || body.options?.dryRun;
    if (dryRun) {
      console.log('[DRY RUN] Would publish to:', platforms);
    }

    const content = toSocialPost(body);
    const publishResults = dryRun
      ? platforms.map(p => ({ platform: p, success: true as const, postId: `dry-run-${crypto.randomUUID().slice(0, 8)}`, url: undefined as string | undefined, error: undefined as string | undefined, retryCount: 0, errorType: null as string | null }))
      : await retryPublishAll(content, platforms) as Array<{ platform: string; success: boolean; postId?: string; url?: string; error?: string; retryCount: number; errorType: string | null }>;

    const results: PublishResponse[] = publishResults.map(r => ({
      platform: r.platform,
      success: r.success,
      postId: r.postId ?? r.url,
      postUrl: r.url,
      error: r.error,
    }));

    // Save to database
    for (let i = 0; i < publishResults.length; i++) {
      const r = publishResults[i];
      const postId = r.postId ?? r.url ?? `pending-${crypto.randomUUID()}`;

      if (r.success) {
        await db.savePost({
          id: postId,
          platform: r.platform,
          platform_post_id: r.postId ?? null,
          content_type: body.content.type,
          media_url: body.content.mediaUrl,
          caption: body.content.caption,
          hashtags: body.content.hashtags?.join(',') || '',
          scheduled_at: body.content.scheduleAt ? new Date(body.content.scheduleAt) : null,
          published_at: new Date(),
          status: 'published',
          error_message: null,
          content_hash: contentHash,
          external_id: body.external_id || null,
          retry_count: 0,
          last_retry_at: null,
          error_type: null,
        });
      } else if (r.errorType === 'permanent' || r.retryCount >= MAX_RETRIES) {
        // Save failed post with error info
        await db.savePost({
          id: postId,
          platform: r.platform,
          platform_post_id: null,
          content_type: body.content.type,
          media_url: body.content.mediaUrl,
          caption: body.content.caption,
          hashtags: body.content.hashtags?.join(',') || '',
          scheduled_at: body.content.scheduleAt ? new Date(body.content.scheduleAt) : null,
          published_at: null,
          status: 'failed',
          error_message: r.error ?? 'Unknown error',
          content_hash: contentHash,
          external_id: body.external_id || null,
          retry_count: r.retryCount,
          last_retry_at: r.retryCount > 0 ? new Date() : null,
          error_type: (r.errorType as import('../types.js').ErrorType) ?? null,
        });
      }
    }

    const ok = results.filter(r => r.success).length;
    const overallStatus = ok === platforms.length ? 'success' : ok > 0 ? 'partial' : 'failed';
    return c.json({
      results,
      summary: { total: results.length, successful: ok, failed: results.length - ok, skipped: 0 },
      status: overallStatus,
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
 * POST /api/publish/retry/:postId
 *
 * Retry a failed post
 */
app.post('/retry/:postId', async (c) => {
  const postId = c.req.param('postId');
  if (!postId) {
    return c.json({ error: 'Validation Error', message: 'postId is required' }, 400);
  }

  const post = await db.getPost(postId);
  if (!post) {
    return c.json({ error: 'Post not found', postId }, 404);
  }

  if (post.status !== 'failed') {
    return c.json({
      error: 'Invalid State',
      message: `Post is ${post.status}, only failed posts can be retried`,
      postId,
      currentStatus: post.status,
    }, 400);
  }

  const maxRetries = 3;
  if (post.retry_count >= maxRetries) {
    return c.json({
      error: 'Max Retries Exceeded',
      message: `Post has been retried ${post.retry_count} times, max ${maxRetries} retries allowed`,
      postId,
      retryCount: post.retry_count,
    }, 400);
  }

  // Check if error is permanent - don't allow retry for permanent errors
  if (post.error_type === 'permanent') {
    return c.json({
      error: 'Permanent Error',
      message: 'Post failed with a permanent error that cannot be retried',
      postId,
      errorMessage: post.error_message,
    }, 400);
  }

  try {
    // Reconstruct the social post from the database record
    const content = {
      text: (post.caption ?? '') + (post.hashtags ? '\n' + post.hashtags.split(',').map(t => '#' + t).join(' ') : ''),
      imageUrl: post.content_type === 'image' ? post.media_url : undefined,
      videoPath: post.content_type === 'video' ? post.media_url : undefined,
    };

    // Update status to publishing
    await db.savePost({
      ...post,
      status: 'publishing',
    });

    // Retry the publish with auto-retry for transient errors
    const result = await retryPublishAll(content, [post.platform as PlatformName]);
    const r = result[0];

    if (r.success) {
      // Update post as published
      await db.savePost({
        ...post,
        status: 'published',
        platform_post_id: r.postId ?? null,
        published_at: new Date(),
        error_message: null,
        retry_count: post.retry_count + 1,
        last_retry_at: new Date(),
        error_type: null,
      });

      return c.json({
        postId,
        status: 'published',
        retryCount: post.retry_count + 1,
        results: [{
          platform: r.platform,
          success: true,
          postId: r.postId ?? r.url,
          postUrl: r.url,
        }],
      } as RetryResponse);
    }

    // Update post with new error info
    await db.savePost({
      ...post,
      status: 'failed',
      error_message: r.error ?? 'Unknown error',
      retry_count: post.retry_count + 1,
      last_retry_at: new Date(),
      error_type: (r.errorType as import('../types.js').ErrorType) ?? null,
    });

    const isMaxRetriesExceeded = post.retry_count + 1 >= maxRetries;

    return c.json({
      postId,
      status: 'failed',
      retryCount: post.retry_count + 1,
      results: [{
        platform: r.platform,
        success: false,
        error: r.error,
      }],
      error: isMaxRetriesExceeded ? 'Max retries exceeded' : r.error,
    } as RetryResponse, isMaxRetriesExceeded ? 400 : 200);
  } catch (error) {
    const errorType = db.classifyError(error);
    await db.savePost({
      ...post,
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
      retry_count: post.retry_count + 1,
      last_retry_at: new Date(),
      error_type: errorType,
    });

    return c.json({
      error: 'Retry Failed',
      message: error instanceof Error ? error.message : String(error),
      postId,
      retryCount: post.retry_count + 1,
    }, 500);
  }
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
