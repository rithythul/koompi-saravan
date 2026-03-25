import type { GoogleMediaConfig } from '../config.js';
import fetchWithRetry from '../fetch-with-retry.js';
import { requireInstagramPublishConfig } from '../config.js';

export interface InstagramAnalyticsInput {
  platformPostId: string;
}

export interface InstagramAnalyticsResponse {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  completionRate?: number;
  avgWatchTimeSeconds?: number;
  reach: number;
  impressions: number;
  metadata?: Record<string, unknown>;
}

export interface InstagramPublishInput {
  caption: string;
  videoUrl: string;
}

export interface InstagramPublishResponse {
  platformPostId: string;
  creationId?: string;
  permalink?: string;
  metadata?: Record<string, unknown>;
}

export async function publishInstagramVideo(
  config: GoogleMediaConfig,
  input: InstagramPublishInput,
): Promise<InstagramPublishResponse> {
  const instagram = requireInstagramPublishConfig(config);

  const sanitizedCaption = sanitizeCaption(input.caption);
  const validatedVideoUrl = validateVideoUrl(input.videoUrl);

  const createContainerResponse = await fetchWithRetry(
    `${instagram.apiBaseUrl}/${instagram.businessAccountId}/media`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        media_type: 'REELS',
        video_url: validatedVideoUrl,
        caption: sanitizedCaption,
        access_token: instagram.accessToken,
      }),
    },
  );

  if (!createContainerResponse.ok) {
    const errorText = await createContainerResponse.text();
    throw new Error(
      redactTokens(`Instagram container creation failed: ${createContainerResponse.status} ${errorText}`),
    );
  }

  const createContainerData = (await createContainerResponse.json()) as { id?: string };
  if (!createContainerData.id) {
    throw new Error('Instagram container creation did not return a container ID.');
  }

  const publishResponse = await fetchWithRetry(
    `${instagram.apiBaseUrl}/${instagram.businessAccountId}/media_publish`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creation_id: createContainerData.id,
        access_token: instagram.accessToken,
      }),
    },
  );

  if (!publishResponse.ok) {
    const errorText = await publishResponse.text();
    throw new Error(
      redactTokens(`Instagram publish failed: ${publishResponse.status} ${errorText}`),
    );
  }

  const publishData = (await publishResponse.json()) as { id?: string; permalink?: string };
  if (!publishData.id) {
    throw new Error('Instagram publish did not return a post ID.');
  }

  return {
    platformPostId: publishData.id || '',
    creationId: createContainerData.id,
    permalink: publishData.permalink,
    metadata: {
      creationId: createContainerData.id,
    },
  };
}

function sanitizeCaption(caption: string): string {
  // Strip HTML tags
  let sanitized = caption.replace(/<[^>]*>?/gm, '');
  // Limit length (e.g., Instagram captions are max 2200 characters)
  // A more robust solution would consider platform-specific limits from config
  sanitized = sanitized.substring(0, 2200);
  // Escape special characters (basic example, can be expanded)
  sanitized = sanitized.replace(/["&'<>\\/]/g, function (s) {
    switch (s) {
      case '"': return '&quot;';
      case '&': return '&amp;';
      case '\'': return '&#39;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '/': return '&#x2F;';
      default: return s;
    }
  });
  return sanitized;
}

function validateVideoUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== 'https:') {
      throw new Error('Video URL must be HTTPS.');
    }
    // Basic domain validation - can be expanded if needed
    if (!urlObj.hostname.includes('.')) {
      throw new Error('Video URL must have a valid domain.');
    }
    return url;
  } catch (error: any) {
    throw new Error(`Invalid video URL: ${error.message}`);
  }
}

function redactTokens(message: string): string {
  return message.replace(/(Bearer\s[a-zA-Z0-9-_.]+)|(access_token=[a-zA-Z0-9-_.]+)/g, '[REDACTED_TOKEN]');
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function extractInsightMetric(data: unknown, key: string): unknown {
  if (!Array.isArray(data)) {
    return undefined;
  }

  const metric = data.find((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    return 'name' in entry && (entry as { name?: unknown }).name === key;
  }) as { values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } } | undefined;

  if (metric?.values?.[0]?.value !== undefined) {
    return metric.values[0].value;
  }

  return metric?.total_value?.value;
}

export async function fetchInstagramMediaMetrics(
  config: GoogleMediaConfig,
  input: InstagramAnalyticsInput,
): Promise<InstagramAnalyticsResponse> {
  const instagram = requireInstagramPublishConfig(config);
  const metrics = [
    'plays',
    'likes',
    'comments',
    'shares',
    'saved',
    'reach',
    'impressions',
    'total_interactions',
    'ig_reels_avg_watch_time',
    'ig_reels_video_view_total_time',
  ].join(',');
  const url = new URL(`${instagram.apiBaseUrl}/${input.platformPostId}/insights`);
  url.searchParams.set('metric', metrics);
  url.searchParams.set('access_token', instagram.accessToken);

  const response = await fetchWithRetry(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      redactTokens(`Instagram analytics failed: ${response.status} ${errorText}`),
    );
  }

  const payload = (await response.json()) as { data?: unknown };
  const views = normalizeNumber(extractInsightMetric(payload.data, 'plays'));
  const likes = normalizeNumber(extractInsightMetric(payload.data, 'likes'));
  const comments = normalizeNumber(extractInsightMetric(payload.data, 'comments'));
  const shares = normalizeNumber(extractInsightMetric(payload.data, 'shares'));
  const saves = normalizeNumber(extractInsightMetric(payload.data, 'saved'));
  const reach = normalizeNumber(extractInsightMetric(payload.data, 'reach'));
  const impressions = normalizeNumber(extractInsightMetric(payload.data, 'impressions'));
  const avgWatchTimeSeconds = normalizeNumber(
    extractInsightMetric(payload.data, 'ig_reels_avg_watch_time'),
  );

  return {
    views,
    likes,
    comments,
    shares,
    saves,
    completionRate: undefined,
    avgWatchTimeSeconds: avgWatchTimeSeconds > 0 ? avgWatchTimeSeconds : undefined,
    reach,
    impressions,
    metadata: {
      source: 'instagram-api',
      rawMetricsReturned: Array.isArray(payload.data) ? payload.data.length : 0,
    },
  };
}
