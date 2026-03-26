import type { PlatformClient, SocialPost, PostResult, AnalyticsData, PlatformName } from './index.js';
import { LinkedInClient } from './linkedin/client.js';
import { FacebookClient } from './facebook/client.js';
import { InstagramClient } from './instagram/client.js';
import { TikTokClient } from './tiktok/client.js';
import { YouTubeClient } from './youtube/client.js';
import { PinterestClient } from './pinterest/client.js';
import { TelegramClient } from './telegram/client.js';
import { XClient } from './x/client.js';
import { config } from '../config.js';

function createClient(platform: PlatformName): PlatformClient {
  switch (platform) {
    case 'linkedin':
      return new LinkedInClient(config.linkedin);
    case 'facebook':
      return new FacebookClient(config.facebook);
    case 'instagram':
      return new InstagramClient(config.instagram);
    case 'tiktok':
      return new TikTokClient(config.tiktok);
    case 'youtube':
      return new YouTubeClient(config.youtube);
    case 'pinterest':
      return new PinterestClient(config.pinterest);
    case 'telegram':
      return new TelegramClient(config.telegram);
    case 'x':
      return new XClient(config.x);
  }
}

const ALL_PLATFORMS: PlatformName[] = ['linkedin', 'facebook', 'instagram', 'tiktok', 'youtube', 'pinterest', 'telegram', 'x'];

export async function postToAll(
  content: SocialPost,
  platforms: PlatformName[] = ALL_PLATFORMS,
): Promise<PostResult[]> {
  const results = await Promise.allSettled(
    platforms.map(p => {
      const client = createClient(p);
      return client.post(content);
    }),
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      platform: platforms[i],
      success: false,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

export async function postToOne(
  content: SocialPost,
  platform: PlatformName,
): Promise<PostResult> {
  const client = createClient(platform);
  return client.post(content);
}

export interface AnalyticsQuery {
  platform: PlatformName;
  postId: string;
}

export interface AggregatedAnalytics {
  platform: string;
  postId: string;
  data?: AnalyticsData;
  error?: string;
}

export async function getAnalyticsAll(
  queries: AnalyticsQuery[],
): Promise<AggregatedAnalytics[]> {
  const results = await Promise.allSettled(
    queries.map(async q => {
      const client = createClient(q.platform);
      const data = await client.getAnalytics(q.postId);
      return { platform: q.platform, postId: q.postId, data };
    }),
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      platform: queries[i].platform,
      postId: queries[i].postId,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

export { createClient, ALL_PLATFORMS };
