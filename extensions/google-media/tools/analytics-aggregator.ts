/**
 * Analytics Aggregator - Multi-Platform Analytics
 *
 * Aggregates analytics from all platforms into unified format
 */

import { GoogleMediaConfig } from '../lib/config.js';

export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'pinterest' | 'linkedin' | 'facebook';

export type AnalyticsSummary = {
  kpis: {
    publishedVideos: number;
    activeAccounts: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagementRate: number;
    viewsDelta?: number;
    engagementDelta?: number;
  };
  interactionSeries: Array<{ date: string; interactions: number }>;
  engagementSeries: Array<{ date: string; rate: number }>;
  postingHeatmap: Array<{ date: string; count: number }>;
  postingStreak: number;
  contentMix: Record<Platform, number>;
};

export type PostAnalytics = {
  analyticsId: string;
  platformPostId: string;
  genviralPostId?: string; // We'll rename this to sarawanPostId
  externalId?: string;
  platform: Platform;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  engagementRate: number;
};

export type AnalyticsTarget = {
  id: string;
  platform: Platform;
  identifier: string; // @username or account ID
  alias?: string;
  displayName?: string;
  favorite?: boolean;
  refreshPolicy?: {
    freeDailyRefresh: boolean;
  };
};

/**
 * Get analytics summary across platforms
 */
export async function getAnalyticsSummary(
  options: {
    range?: '14d' | '30d' | '90d' | '1y' | 'all';
    start?: string;
    end?: string;
    platforms?: Platform[];
    accounts?: string[];
  } = {},
  config: Partial<GoogleMediaConfig> = {},
): Promise<AnalyticsSummary> {
  // TODO: Aggregate analytics from all platform clients
  // 1. Query each platform API
  // 2. Normalize to common format
  // 3. Calculate engagement rates, deltas
  // 4. Build series data for charts

  return {
    kpis: {
      publishedVideos: 0,
      activeAccounts: 0,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      engagementRate: 0,
    },
    interactionSeries: [],
    engagementSeries: [],
    postingHeatmap: [],
    postingStreak: 0,
    contentMix: {
      tiktok: 0,
      instagram: 0,
      youtube: 0,
      pinterest: 0,
      linkedin: 0,
      facebook: 0,
    },
  };
}

/**
 * Get post-level analytics
 */
export async function getPostAnalytics(
  options: {
    range?: '14d' | '30d' | '90d' | '1y' | 'all';
    start?: string;
    end?: string;
    platforms?: Platform[];
    accounts?: string[];
    sortBy?: 'published_at' | 'views' | 'likes' | 'comments' | 'shares';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  } = {},
  config: Partial<GoogleMediaConfig> = {},
): Promise<{ posts: PostAnalytics[]; total: number }> {
  // TODO: Query post analytics from all platforms
  return {
    posts: [],
    total: 0,
  };
}

/**
 * List tracked analytics accounts
 */
export async function listAnalyticsTargets(
  config: Partial<GoogleMediaConfig> = {},
): Promise<AnalyticsTarget[]> {
  // TODO: Load from storage
  return [];
}

/**
 * Add a tracked analytics account
 */
export async function createAnalyticsTarget(
  platform: Platform,
  identifier: string,
  options: { alias?: string } = {},
  config: Partial<GoogleMediaConfig> = {},
): Promise<AnalyticsTarget> {
  const target: AnalyticsTarget = {
    id: crypto.randomUUID(),
    platform,
    identifier,
    alias: options.alias,
  };

  // TODO: Save to storage
  // TODO: Validate account exists on platform

  return target;
}

/**
 * Trigger analytics refresh for a target
 */
export async function refreshAnalyticsTarget(
  targetId: string,
  config: Partial<GoogleMediaConfig> = {},
): Promise<{ refreshId: string; status: string }> {
  // TODO: Trigger async refresh job
  return {
    refreshId: crypto.randomUUID(),
    status: 'pending',
  };
}

/**
 * Check refresh status
 */
export async function getRefreshStatus(
  refreshId: string,
  config: Partial<GoogleMediaConfig> = {},
): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed';
  creditsUsed?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}> {
  // TODO: Check refresh job status
  return {
    status: 'pending',
  };
}

/**
 * OpenClaw tool definitions
 */
export const analyticsSummaryTool = {
  name: 'analytics_summary',
  description: 'Get analytics summary with KPIs, trends, and content mix across all platforms.',
  parameters: {
    type: 'object',
    properties: {
      range: {
        type: 'string',
        enum: ['14d', '30d', '90d', '1y', 'all'],
        description: 'Date range preset (default: 30d)',
      },
      platforms: {
        type: 'string',
        description: 'Comma-separated platform filter (e.g., tiktok,instagram)',
      },
    },
  },
};

export const analyticsPostsTool = {
  name: 'analytics_posts',
  description: 'List post-level analytics with sorting and filtering.',
  parameters: {
    type: 'object',
    properties: {
      range: {
        type: 'string',
        enum: ['14d', '30d', '90d', '1y', 'all'],
      },
      platforms: {
        type: 'string',
        description: 'Comma-separated platform filter',
      },
      sort_by: {
        type: 'string',
        enum: ['published_at', 'views', 'likes', 'comments', 'shares'],
        description: 'Sort field (default: views)',
      },
      sort_order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (default: desc)',
      },
      limit: {
        type: 'number',
        description: 'Max results (default: 25, max: 100)',
      },
    },
  },
};

export const createAnalyticsTargetTool = {
  name: 'create_analytics_target',
  description: 'Add a new tracked analytics account.',
  parameters: {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        enum: ['tiktok', 'instagram', 'youtube', 'pinterest', 'linkedin', 'facebook'],
      },
      identifier: {
        type: 'string',
        description: '@username or account ID',
      },
      alias: {
        type: 'string',
        description: 'Friendly name for this account',
      },
    },
    required: ['platform', 'identifier'],
  },
};

export const refreshAnalyticsTool = {
  name: 'refresh_analytics',
  description: 'Trigger a refresh for an analytics target.',
  parameters: {
    type: 'object',
    properties: {
      target_id: {
        type: 'string',
        description: 'Analytics target ID',
      },
    },
    required: ['target_id'],
  },
};

export function createAnalyticsSummaryTool(config: any = {}) {
  return {
    ...analyticsSummaryTool,
    execute: async (params: any) => {
      const platforms = params.platforms?.split(',') as Platform[] | undefined;
      return getAnalyticsSummary({ ...params, platforms }, config);
    },
  };
}

export function createAnalyticsPostsTool(config: any = {}) {
  return {
    ...analyticsPostsTool,
    execute: async (params: any) => {
      const platforms = params.platforms?.split(',') as Platform[] | undefined;
      return getPostAnalytics({ ...params, platforms }, config);
    },
  };
}

export function createCreateAnalyticsTargetTool(config: any = {}) {
  return {
    ...createAnalyticsTargetTool,
    execute: async (params: any) => {
      return createAnalyticsTarget(params.platform, params.identifier, { alias: params.alias }, config);
    },
  };
}

export function createRefreshAnalyticsTool(config: any = {}) {
  return {
    ...refreshAnalyticsTool,
    execute: async (params: any) => {
      return refreshAnalyticsTarget(params.target_id, config);
    },
  };
}
