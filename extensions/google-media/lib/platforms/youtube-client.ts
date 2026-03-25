import { type GoogleMediaConfig } from '../config.js';
import { type SocialPlatformClient } from './types.js';

export class YouTubeClient implements SocialPlatformClient {
  platform = 'youtube';
  constructor(private config: GoogleMediaConfig) {}

  async publish(input: { caption: string; videoUrl: string }) {
    console.log('YouTube publish placeholder');
    return { platformPostId: 'yt-video-1' };
  }

  async fetchMetrics(platformPostId: string) {
    return { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0 };
  }
}
