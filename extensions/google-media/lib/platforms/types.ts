import type { GoogleMediaConfig } from '../config.js';

export interface SocialPlatformClient {
  platform: string;
  publish(input: { caption: string; videoUrl: string }): Promise<{ platformPostId: string; permalink?: string; metadata?: Record<string, unknown> }>;
  fetchMetrics(platformPostId: string): Promise<{ views: number; likes: number; comments: number; shares: number; saves: number; reach: number; impressions: number; }>;
}
