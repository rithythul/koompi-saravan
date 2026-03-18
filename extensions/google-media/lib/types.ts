export type RunStatus = 'pending' | 'generated' | 'rendered' | 'published' | 'failed';
export type AssetKind = 'image' | 'video';
export type Platform = 'instagram' | 'tiktok';
export type PublicationStatus = 'draft' | 'published' | 'failed' | 'dry_run';
export type ContentVariant =
  | 'hook_reveal'
  | 'slideshow_caption'
  | 'quote_card'
  | 'countdown_list'
  | (string & {});
export type ScheduleStrategy = 'optimized' | 'exploration' | 'manual';

export interface ContentRun {
  id: string;
  status: RunStatus;
  prompt?: string;
  outputDir: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface GeneratedAsset {
  id: string;
  runId: string;
  kind: AssetKind;
  mimeType: string;
  filePath: string;
  fileSizeBytes: number;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface RenderedVideo {
  id: string;
  runId: string;
  compositionId: string;
  filePath: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface RenderRequest {
  runId?: string;
  hookText: string;
  revealText: string;
  hookColor?: string;
  revealColor?: string;
  backgroundColor?: string;
}

export interface RenderResult {
  success: boolean;
  runId: string;
  outputPath: string;
  compositionId: string;
  width?: number;
  height?: number;
  fps?: number;
  durationInFrames?: number;
  error?: string;
}

export interface PublishedPost {
  id: string;
  runId: string;
  platform: Platform;
  status: PublicationStatus;
  caption: string;
  videoPath: string;
  videoUrl?: string;
  platformPostId?: string;
  permalink?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface PublishRequest {
  runId: string;
  caption: string;
  videoUrl?: string;
  hashtags?: string[];
}

export interface PublishResult {
  success: boolean;
  publicationId: string;
  runId: string;
  platform: Platform;
  status: PublicationStatus;
  platformPostId?: string;
  permalink?: string;
  error?: string;
}

export interface Post {
  id: string;
  platform: Platform;
  platformPostId?: string;
  postedAt: string;
  contentType: ContentVariant;
  videoPath: string;
  hookText?: string;
  caption?: string;
  hashtags?: string[];
  scheduledBy: ScheduleStrategy;
  confidenceScore?: number;
  scheduledHour: number;
  runId?: string;
  createdAt: string;
}

export interface PostMetric {
  id: string;
  postId: string;
  pulledAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  completionRate?: number;
  avgWatchTimeSeconds?: number;
  reach: number;
  impressions: number;
  platformData?: Record<string, unknown>;
  createdAt: string;
}

export interface PostWithLatestMetric extends Post {
  metricId?: string;
  pulledAt?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  completionRate?: number;
  avgWatchTimeSeconds?: number;
  reach: number;
  impressions: number;
  platformData?: Record<string, unknown>;
  metricCreatedAt?: string;
}

export interface HourPerformance {
  id: string;
  platform: Platform;
  hour: number;
  dayOfWeek?: number;
  postCount: number;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalSaves: number;
  avgViews: number;
  avgEngagementRate: number;
  avgCompletionRate: number;
  performanceScore: number;
  lastUpdated: string;
}

export interface PostingInsights {
  platform: Platform;
  analyzedPosts: number;
  dateRange: {
    from: string;
    to: string;
  };
  topHours: Array<{
    hour: number;
    avgViews: number;
    avgEngagement: number;
    postCount: number;
  }>;
  bottomHours: Array<{
    hour: number;
    avgViews: number;
    avgEngagement: number;
    postCount: number;
  }>;
  bestDayOfWeek?: {
    day: number;
    avgViews: number;
  };
  recommendations: string[];
}

export interface OptimizedScheduleSlot {
  time: string;
  hour: number;
  confidence: number;
  reason: string;
}

export interface OptimizedSchedule {
  platform: Platform;
  date: string;
  slots: OptimizedScheduleSlot[];
  explorationSlots: Array<{
    time: string;
    hour: number;
    reason: string;
  }>;
  generatedAt: string;
}
