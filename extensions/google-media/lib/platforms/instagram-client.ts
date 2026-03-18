import type { GoogleMediaConfig } from '../config.js';
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

  const createContainerResponse = await fetch(
    `${instagram.apiBaseUrl}/${instagram.businessAccountId}/media`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        media_type: 'REELS',
        video_url: input.videoUrl,
        caption: input.caption,
        access_token: instagram.accessToken,
      }),
    },
  );

  if (!createContainerResponse.ok) {
    throw new Error(
      `Instagram container creation failed: ${createContainerResponse.status} ${await createContainerResponse.text()}`,
    );
  }

  const createContainerData = (await createContainerResponse.json()) as { id?: string };
  if (!createContainerData.id) {
    throw new Error('Instagram container creation did not return a container ID.');
  }

  const publishResponse = await fetch(
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
    throw new Error(
      `Instagram publish failed: ${publishResponse.status} ${await publishResponse.text()}`,
    );
  }

  const publishData = (await publishResponse.json()) as { id?: string; permalink?: string };
  if (!publishData.id) {
    throw new Error('Instagram publish did not return a post ID.');
  }

  return {
    platformPostId: publishData.id,
    creationId: createContainerData.id,
    permalink: publishData.permalink,
    metadata: {
      creationId: createContainerData.id,
    },
  };
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

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Instagram analytics failed: ${response.status} ${await response.text()}`,
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
