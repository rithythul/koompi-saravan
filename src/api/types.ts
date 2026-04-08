/**
 * API Types
 */

export interface Bindings {
  // Environment variables
  GEMINI_API_KEY?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_BUSINESS_ACCOUNT_ID?: string;
  TIKTOK_ACCESS_TOKEN?: string;
  TIKTOK_CREATOR_ID?: string;
  FACEBOOK_ACCESS_TOKEN?: string;
  YOUTUBE_REFRESH_TOKEN?: string;
  PINTEREST_ACCESS_TOKEN?: string;
  LINKEDIN_ACCESS_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHANNEL_ID?: string;
  X_API_KEY?: string;
  X_ACCESS_TOKEN?: string;

  // Config
  DRY_RUN?: string;
  KILL_SWITCH?: string;
  DEFAULT_OUTPUT_DIR?: string;
}

export interface Platform {
  name: string;
  id: string;
  enabled: boolean;
  supportedContentTypes: ('video' | 'image' | 'carousel')[];
}

export interface PublishRequest {
  platforms: string[];
  content: {
    type: 'video' | 'image' | 'carousel';
    mediaUrl: string;
    caption: string;
    hashtags?: string[];
    scheduleAt?: string;
  };
  options?: {
    dryRun?: boolean;
    validateOnly?: boolean;
  };
}

export interface PublishResponse {
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  warnings?: string[];
}

export interface BatchPublishResponse {
  results: PublishResponse[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  };
}

export interface AnalyticsSummary {
  kpis: {
    publishedVideos: number;
    activeAccounts: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagementRate: number;
  };
  byPlatform: Record<string, {
    views: number;
    likes: number;
    comments: number;
    posts: number;
  }>;
  period: {
    start: string;
    end: string;
  };
}

export interface PostAnalytics {
  id: string;
  platform: string;
  platformPostId: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ErrorResponse {
  error: string;
  message?: string;
  validationErrors?: ValidationError[];
}
