import { type GoogleMediaConfig } from '../config.js';
import { type SocialPlatformClient } from './types.js';
import { publishInstagramVideo, fetchInstagramMediaMetrics } from './instagram-client.js';
import { publishTikTokVideo, fetchTikTokVideoMetrics } from './tiktok-client.js';
import { publishFacebookVideo, fetchFacebookMediaMetrics } from './facebook-client.js';
import { publishYouTubeVideo, fetchYouTubeVideoMetrics } from './youtube-client.js';
import { publishLinkedInVideo, fetchLinkedInPostMetrics } from './linkedin-client.js';
import { TelegramClient } from './telegram-client.js';
import { XClient } from './x-client.js';
import { RateLimiter } from '../rate-limiter.js';
import { CircuitBreaker } from '../circuit-breaker.js';

const clientCache = new Map<string, {
    client: SocialPlatformClient,
    limiter: RateLimiter,
    breaker: CircuitBreaker
}>();

export function getPlatformClient(platform: string, config: GoogleMediaConfig): SocialPlatformClient {
  if (!clientCache.has(platform)) {
      const limiter = new RateLimiter(100, 100);
      const breaker = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 60000 });
      let baseClient: SocialPlatformClient;

      switch (platform) {
        case 'instagram':
            baseClient = {
                platform: 'instagram',
                publish: (input) => publishInstagramVideo(config, input),
                fetchMetrics: (postId) => fetchInstagramMediaMetrics(config, { platformPostId: postId }),
            };
            break;
        case 'tiktok':
            baseClient = {
                platform: 'tiktok',
                publish: (input) => publishTikTokVideo(config, input),
                fetchMetrics: (postId) => fetchTikTokVideoMetrics(config, { platformPostId: postId }),
            };
            break;
        case 'facebook':
            baseClient = {
                platform: 'facebook',
                publish: (input) => publishFacebookVideo(config, input),
                fetchMetrics: (postId) => fetchFacebookMediaMetrics(config, { platformPostId: postId }),
            };
            break;
        case 'youtube':
            baseClient = {
                platform: 'youtube',
                publish: (input) => publishYouTubeVideo(config, input),
                fetchMetrics: (postId) => fetchYouTubeVideoMetrics(config, { platformPostId: postId }),
            };
            break;
        case 'linkedin':
            baseClient = {
                platform: 'linkedin',
                publish: (input) => publishLinkedInVideo(config, input),
                fetchMetrics: (postId) => fetchLinkedInPostMetrics(config, { platformPostId: postId }),
            };
            break;
        case 'telegram': baseClient = new TelegramClient(config); break;
        case 'x': baseClient = new XClient(config); break;
        default:
            throw new Error(`Platform ${platform} not supported`);
      }
      clientCache.set(platform, { client: baseClient, limiter, breaker });
  }

  const { client, limiter, breaker } = clientCache.get(platform)!;

  return {
    platform,
    publish: async (input) => {
      if (!limiter.tryAcquire()) throw new Error('Rate limit exceeded');
      if (!breaker.canCall()) throw new Error('Circuit breaker open');
      try {
        const res = await client.publish(input);
        breaker.recordSuccess();
        return res;
      } catch (e) {
        breaker.recordFailure();
        throw e;
      }
    },
    fetchMetrics: async (postId) => {
        if (!limiter.tryAcquire()) throw new Error('Rate limit exceeded');
        if (!breaker.canCall()) throw new Error('Circuit breaker open');
        try {
            const res = await client.fetchMetrics(postId);
            breaker.recordSuccess();
            return res;
        } catch (e) {
            breaker.recordFailure();
            throw e;
        }
    }
  };
}
