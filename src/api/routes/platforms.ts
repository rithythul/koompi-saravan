/**
 * Platforms Routes
 *
 * GET /api/platforms - List all platforms and their status
 * GET /api/platforms/:id - Get platform details
 */

import { Hono } from 'hono';
import type { Bindings, Platform } from '../types.js';

const app = new Hono<{ Bindings: Bindings }>();

// Platform definitions
const PLATFORMS: Record<string, Platform> = {
  instagram: {
    name: 'Instagram',
    id: 'instagram',
    enabled: true,
    supportedContentTypes: ['video', 'image', 'carousel'],
  },
  tiktok: {
    name: 'TikTok',
    id: 'tiktok',
    enabled: true,
    supportedContentTypes: ['video'],
  },
  youtube: {
    name: 'YouTube',
    id: 'youtube',
    enabled: true,
    supportedContentTypes: ['video'],
  },
  facebook: {
    name: 'Facebook',
    id: 'facebook',
    enabled: true,
    supportedContentTypes: ['video', 'image'],
  },
  pinterest: {
    name: 'Pinterest',
    id: 'pinterest',
    enabled: true,
    supportedContentTypes: ['video', 'image'],
  },
  linkedin: {
    name: 'LinkedIn',
    id: 'linkedin',
    enabled: true,
    supportedContentTypes: ['video', 'image'],
  },
  telegram: {
    name: 'Telegram',
    id: 'telegram',
    enabled: true,
    supportedContentTypes: ['video', 'image'],
  },
  x: {
    name: 'X (Twitter)',
    id: 'x',
    enabled: true,
    supportedContentTypes: ['video', 'image'],
  },
};

/**
 * GET /api/platforms
 *
 * List all platforms
 */
app.get('/', (c) => {
  const platforms = Object.values(PLATFORMS).map((p) => ({
    ...p,
    // Check if credentials are configured
    configured: checkPlatformConfigured(p.id, c.env),
  }));

  return c.json({
    platforms,
    total: platforms.length,
  });
});

/**
 * GET /api/platforms/:id
 *
 * Get platform details
 */
app.get('/:id', (c) => {
  const id = c.req.param('id');

  const platform = PLATFORMS[id];
  if (!platform) {
    return c.json({
      error: 'Platform not found',
      id,
    }, 404);
  }

  return c.json({
    ...platform,
    configured: checkPlatformConfigured(id, c.env),
    rateLimit: {
      remaining: getRateLimitRemaining(id),
      resetAt: getRateLimitReset(id),
    },
    supportedContentTypes: platform.supportedContentTypes,
  });
});

/**
 * GET /api/platforms/:id/validate
 *
 * Validate platform credentials
 */
app.get('/:id/validate', async (c) => {
  const id = c.req.param('id');

  const platform = PLATFORMS[id];
  if (!platform) {
    return c.json({
      error: 'Platform not found',
      id,
    }, 404);
  }

  const configured = checkPlatformConfigured(id, c.env);

  // TODO: Implement actual credential validation via API call
  return c.json({
    platform: id,
    configured,
    valid: configured, // For now, just check if configured
    message: configured
      ? 'Credentials are configured'
      : 'Credentials not configured',
  });
});

/**
 * GET /api/platforms/:id/quota
 *
 * Get platform quota/usage info
 */
app.get('/:id/quota', (c) => {
  const id = c.req.param('id');

  const platform = PLATFORMS[id];
  if (!platform) {
    return c.json({
      error: 'Platform not found',
      id,
    }, 404);
  }

  // TODO: Implement actual quota checking
  return c.json({
    platform: id,
    quota: {
      limit: getPlatformLimit(id),
      used: 0,
      remaining: getPlatformLimit(id),
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  });
});

/**
 * Check if platform credentials are configured
 */
function checkPlatformConfigured(platformId: string, env: Bindings): boolean {
  switch (platformId) {
    case 'instagram':
      return !!(env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
    case 'tiktok':
      return !!(env.TIKTOK_ACCESS_TOKEN && env.TIKTOK_CREATOR_ID);
    case 'youtube':
      return !!env.YOUTUBE_REFRESH_TOKEN;
    case 'facebook':
      return !!env.FACEBOOK_ACCESS_TOKEN;
    case 'pinterest':
      return !!env.PINTEREST_ACCESS_TOKEN;
    case 'linkedin':
      return !!env.LINKEDIN_ACCESS_TOKEN;
    case 'telegram':
      return !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHANNEL_ID);
    case 'x':
      return !!(env.X_API_KEY && env.X_ACCESS_TOKEN);
    default:
      return false;
  }
}

/**
 * Get rate limit remaining for platform
 */
function getRateLimitRemaining(platformId: string): number {
  const limits: Record<string, number> = {
    instagram: 25,
    tiktok: 20,
    youtube: 100,
    facebook: 200,
    pinterest: 100,
    linkedin: 100,
    telegram: 20,
    x: 50,
  };
  return limits[platformId] || 0;
}

/**
 * Get rate limit reset time for platform
 */
function getRateLimitReset(platformId: string): string {
  // Most platforms reset hourly or daily
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

/**
 * Get platform daily limit
 */
function getPlatformLimit(platformId: string): number {
  const limits: Record<string, number> = {
    instagram: 25,
    tiktok: 20,
    youtube: 100,
    facebook: 200,
    pinterest: 100,
    linkedin: 100,
    telegram: 1200, // 20/min * 60 min
    x: 50,
  };
  return limits[platformId] || 0;
}

export default app;
