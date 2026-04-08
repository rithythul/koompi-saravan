/**
 * Publish Routes
 *
 * POST /api/publish - Publish to one or more platforms
 * GET /api/publish/status/:postId - Get publish status
 * DELETE /api/publish/:postId - Delete a post
 */

import { Hono } from 'hono';
import type { Bindings, PublishRequest, BatchPublishResponse, PublishResponse } from '../types.js';
import { publishToPlatforms } from '../../../extensions/publisher/tools/publish.js';
import { loadConfig } from '../../../extensions/publisher/lib/config.js';
import * as store from '../lib/analytics-store.js';

const app = new Hono<{ Bindings: Bindings }>();

/**
 * POST /api/publish
 *
 * Publish content to one or more platforms
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json() as PublishRequest;

    // Validate request
    if (!body.platforms || body.platforms.length === 0) {
      return c.json({
        error: 'Validation Error',
        message: 'At least one platform is required',
      }, 400);
    }

    if (!body.content) {
      return c.json({
        error: 'Validation Error',
        message: 'Content is required',
      }, 400);
    }

    if (!body.content.type || !body.content.mediaUrl || !body.content.caption) {
      return c.json({
        error: 'Validation Error',
        message: 'content.type, content.mediaUrl, and content.caption are required',
      }, 400);
    }

    // Load config from environment
    const config = loadConfig({
      instagramAccessToken: c.env.INSTAGRAM_ACCESS_TOKEN,
      instagramBusinessAccountId: c.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
      tiktokAccessToken: c.env.TIKTOK_ACCESS_TOKEN,
      tiktokCreatorId: c.env.TIKTOK_CREATOR_ID,
      facebookAccessToken: c.env.FACEBOOK_ACCESS_TOKEN,
      youtubeRefreshToken: c.env.YOUTUBE_REFRESH_TOKEN,
      pinterestAccessToken: c.env.PINTEREST_ACCESS_TOKEN,
      linkedinAccessToken: c.env.LINKEDIN_ACCESS_TOKEN,
      telegramBotToken: c.env.TELEGRAM_BOT_TOKEN,
      telegramChannelId: c.env.TELEGRAM_CHANNEL_ID,
      xApiKey: c.env.X_API_KEY,
      xAccessToken: c.env.X_ACCESS_TOKEN,
      dryRun: c.env.DRY_RUN === 'true',
    });

    // Check for validateOnly option
    if (body.options?.validateOnly) {
      // Just validate, don't publish
      const validationResults: PublishResponse[] = [];

      // Convert scheduleAt to Date for validation
      const contentForValidation = {
        ...body.content,
        scheduleAt: body.content.scheduleAt ? new Date(body.content.scheduleAt) : undefined,
      };

      for (const platform of body.platforms) {
        try {
          const { createPublisher } = await import('../../../extensions/publisher/lib/publisher/index.js');
          const publisher = createPublisher(platform as any, config);
          const validation = await publisher.validate(contentForValidation);

          validationResults.push({
            platform,
            success: validation.valid,
            warnings: validation.warnings,
            error: validation.errors.length > 0 ? validation.errors.join(', ') : undefined,
          });
        } catch (error) {
          validationResults.push({
            platform,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return c.json({
        results: validationResults,
        summary: {
          total: validationResults.length,
          successful: validationResults.filter((r) => r.success).length,
          failed: validationResults.filter((r) => !r.success).length,
          skipped: 0,
        },
      } as BatchPublishResponse);
    }

    // Execute publish
    const result = await publishToPlatforms({
      platforms: body.platforms as any,
      content: body.content,
      options: body.options,
    }, config);

    // Save post records to analytics store
    for (const platformResult of result.results) {
      if (platformResult.success && platformResult.postId) {
        store.savePost({
          id: platformResult.postId,
          platform: platformResult.platform,
          platform_post_id: platformResult.postId,
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

    return c.json(result as BatchPublishResponse);
  } catch (error) {
    console.error('Publish error:', error);
    return c.json({
      error: 'Publish Failed',
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * GET /api/publish/status/:postId
 *
 * Get status of a published post
 */
app.get('/status/:postId', async (c) => {
  const postId = c.req.param('postId');

  const post = store.getPost(postId);

  if (!post) {
    return c.json({
      error: 'Post not found',
      postId,
    }, 404);
  }

  const metrics = store.getLatestMetrics(postId);

  return c.json({
    postId: post.id,
    platform: post.platform,
    platformPostId: post.platform_post_id,
    status: post.status,
    publishedAt: post.published_at,
    metrics: metrics
      ? {
          views: metrics.views,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          engagementRate: metrics.engagement_rate,
        }
      : undefined,
  });
});

/**
 * DELETE /api/publish/:postId
 *
 * Delete a published post
 */
app.delete('/:postId', async (c) => {
  const postId = c.req.param('postId');
  const platform = c.req.query('platform');

  if (!platform) {
    return c.json({
      error: 'Validation Error',
      message: 'platform query parameter is required',
    }, 400);
  }

  // TODO: Implement delete via platform publisher
  // For now, just mark as deleted in the database
  const post = store.getPost(postId);

  if (!post) {
    return c.json({
      error: 'Post not found',
      postId,
    }, 404);
  }

  return c.json({
    message: 'Delete must be done manually on the platform',
    postId,
    platform,
    postUrl: post.platform_post_id
      ? `https://${platform}.com/p/${post.platform_post_id}`
      : undefined,
  });
});

export default app;
