/**
 * Publisher Tests
 *
 * Basic tests for platform publishers
 */

import { describe, it, expect } from 'bun:test';
import { createPublisher, getSupportedPlatforms } from '../lib/publisher/index.js';
import type { PublishContent } from '../lib/publisher/index.js';
import type { GoogleMediaConfig } from '../lib/config.js';

const mockConfig: GoogleMediaConfig = {
  defaultOutputDir: '/tmp/test',
  dryRun: true,
  killSwitch: false,
  instagramApiBaseUrl: 'https://graph.facebook.com/v23.0',
  tiktokApiBaseUrl: 'https://open.tiktokapis.com/v2',
  pinterestApiBaseUrl: 'https://api.pinterest.com/v5',
};

describe('Publisher Factory', () => {
  it('should return all supported platforms', () => {
    const platforms = getSupportedPlatforms();
    expect(platforms).toHaveLength(8);
    expect(platforms).toContain('instagram');
    expect(platforms).toContain('tiktok');
    expect(platforms).toContain('youtube');
    expect(platforms).toContain('facebook');
    expect(platforms).toContain('pinterest');
    expect(platforms).toContain('linkedin');
    expect(platforms).toContain('telegram');
    expect(platforms).toContain('x');
  });

  it('should create publisher for each platform', () => {
    const platforms = getSupportedPlatforms();

    for (const platform of platforms) {
      const publisher = createPublisher(platform, mockConfig);
      expect(publisher).toBeDefined();
      expect(publisher.platform).toBe(platform);
    }
  });
});

describe('Publisher Validation', () => {
  it('Instagram should validate video content', async () => {
    const publisher = createPublisher('instagram', mockConfig);
    const content: PublishContent = {
      type: 'video',
      mediaUrl: 'https://example.com/video.mp4',
      caption: 'Test caption',
    };

    const result = await publisher.validate(content);
    expect(result.valid).toBe(true);
  });

  it('TikTok should reject image content', async () => {
    const publisher = createPublisher('tiktok', mockConfig);
    const content: PublishContent = {
      type: 'image',
      mediaUrl: 'https://example.com/image.jpg',
      caption: 'Test caption',
    };

    const result = await publisher.validate(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('TikTok only supports video content, not image');
  });

  it('X should reject long captions', async () => {
    const publisher = createPublisher('x', mockConfig);
    const content: PublishContent = {
      type: 'image',
      mediaUrl: 'https://example.com/image.jpg',
      caption: 'a'.repeat(300), // Over 280 limit
    };

    const result = await publisher.validate(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('280'))).toBe(true);
  });
});
