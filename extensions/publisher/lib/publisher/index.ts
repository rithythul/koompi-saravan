/**
 * Publisher Factory
 *
 * Creates publisher instances for all platforms.
 */

import type { GoogleMediaConfig } from '../config.js';
import type { BasePublisher, Platform } from './base.js';
import { createInstagramPublisher } from './instagram.js';
import { createTikTokPublisher } from './tiktok.js';
import { createYouTubePublisher } from './youtube.js';
import { createFacebookPublisher } from './facebook.js';
import { createPinterestPublisher } from './pinterest.js';
import { createLinkedInPublisher } from './linkedin.js';
import { createTelegramPublisher } from './telegram.js';
import { createXPublisher } from './x.js';

export * from './base.js';

/**
 * Create a publisher instance for the specified platform
 */
export function createPublisher(platform: Platform, config: GoogleMediaConfig): BasePublisher {
  switch (platform) {
    case 'instagram':
      return createInstagramPublisher(config);
    case 'tiktok':
      return createTikTokPublisher(config);
    case 'youtube':
      return createYouTubePublisher(config);
    case 'facebook':
      return createFacebookPublisher(config);
    case 'pinterest':
      return createPinterestPublisher(config);
    case 'linkedin':
      return createLinkedInPublisher(config);
    case 'telegram':
      return createTelegramPublisher(config);
    case 'x':
      return createXPublisher(config);
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

/**
 * Get list of supported platforms
 */
export function getSupportedPlatforms(): Platform[] {
  return ['instagram', 'tiktok', 'youtube', 'facebook', 'pinterest', 'linkedin', 'telegram', 'x'];
}

/**
 * Create all publishers
 */
export function createAllPublishers(config: GoogleMediaConfig): Map<Platform, BasePublisher> {
  const publishers = new Map<Platform, BasePublisher>();
  for (const platform of getSupportedPlatforms()) {
    try {
      publishers.set(platform, createPublisher(platform, config));
    } catch {
      // Skip platforms that can't be created (missing config)
    }
  }
  return publishers;
}
