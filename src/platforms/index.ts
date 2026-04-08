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

export type PlatformName = 'telegram' | 'x';

export { TelegramClient } from './telegram/client.js';
export { XClient } from './x/client.js';
