import type { GoogleMediaConfig } from '../config.js';

export interface SocialPlatformClient {
  platform: string;
  publish(input: { caption: string; videoUrl: string }): Promise<{ platformPostId: string; permalink?: string; metadata?: Record<string, unknown> }>;
  fetchMetrics(platformPostId: string): Promise<{ views: number; likes: number; comments: number; shares: number; saves: number; reach: number; impressions: number; }>;
}

// Platform client types for new implementations
export interface PlatformClient {
  readonly platform: string;
  publish(options: PublishOptions): Promise<PublishResult>;
  getAnalytics(postId: string): Promise<AnalyticsResult>;
}

export interface PublishOptions {
  caption: string;
  mediaUrl: string;
  mediaType: 'video' | 'image' | 'slideshow';
  mediaUrls?: string[];
  scheduledAt?: string;
  dryRun?: boolean;
  [key: string]: unknown;
}

export interface PublishResult {
  platformPostId: string;
  permalink?: string;
  status: 'published' | 'scheduled' | 'draft' | 'failed';
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsResult {
  platformPostId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  reach?: number;
  impressions?: number;
  engagementRate: number;
  fetchedAt: string;
}

