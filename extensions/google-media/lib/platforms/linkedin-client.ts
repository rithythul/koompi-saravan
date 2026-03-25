import { type GoogleMediaConfig } from '../config.js';
import { type SocialPlatformClient } from './types.js';

export class LinkedInClient implements SocialPlatformClient {
  platform = 'linkedin';
  constructor(private config: GoogleMediaConfig) {}

  async publish(input: { caption: string; videoUrl: string }) {
    console.log('LinkedIn publish placeholder');
    return { platformPostId: 'li-post-1' };
  }

  async fetchMetrics(platformPostId: string) {
    return { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0 };
  }
}
