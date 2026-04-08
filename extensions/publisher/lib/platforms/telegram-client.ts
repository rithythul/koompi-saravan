import { type GoogleMediaConfig } from '../config.js';
import { type SocialPlatformClient } from './types.js';

export class TelegramClient implements SocialPlatformClient {
  platform = 'telegram';
  constructor(private config: GoogleMediaConfig) {}

  async publish(input: { caption: string; videoUrl: string }) {
    console.log('Telegram publish placeholder');
    return { platformPostId: 'tg-post-1' };
  }

  async fetchMetrics(platformPostId: string) {
    return { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0 };
  }
}
