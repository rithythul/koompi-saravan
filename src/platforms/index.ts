export interface SocialPost {
  text: string;
  imageUrl?: string;
  videoPath?: string;
  title?: string;
}

export interface PostResult {
  platform: string;
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

export interface AnalyticsData {
  views: number;
  likes: number;
  shares: number;
  comments: number;
  [key: string]: number;
}

export interface PlatformClient {
  name: string;
  post(content: SocialPost): Promise<PostResult>;
  getAnalytics(postId: string): Promise<AnalyticsData>;
}

export type PlatformName = 'linkedin' | 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'pinterest' | 'telegram' | 'x';

export { LinkedInClient } from './linkedin/client.js';
export { FacebookClient } from './facebook/client.js';
export { InstagramClient } from './instagram/client.js';
export { TikTokClient } from './tiktok/client.js';
export { YouTubeClient } from './youtube/client.js';
export { PinterestClient } from './pinterest/client.js';
export { TelegramClient } from './telegram/client.js';
export { XClient } from './x/client.js';
