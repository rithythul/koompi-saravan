import type { GoogleMediaConfig } from '../config.js';
import { requireTikTokPublishConfig } from '../config.js';

export interface TikTokAnalyticsInput {
  platformPostId: string;
}

export interface TikTokAnalyticsResponse {
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

export interface TikTokPublishInput {
  caption: string;
  videoUrl: string;
}

export interface TikTokPublishResponse {
  platformPostId: string;
  publishId?: string;
  metadata?: Record<string, unknown>;
}

export async function publishTikTokVideo(
  config: GoogleMediaConfig,
  input: TikTokPublishInput,
): Promise<TikTokPublishResponse> {
  const tikTok = requireTikTokPublishConfig(config);

  const publishResponse = await fetch(`${tikTok.apiBaseUrl}/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tikTok.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: input.caption.slice(0, 150),
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: input.videoUrl,
      },
      creator_id: tikTok.creatorId,
    }),
  });

  if (!publishResponse.ok) {
    throw new Error(
      `TikTok publish failed: ${publishResponse.status} ${await publishResponse.text()}`,
    );
  }

  const publishData = (await publishResponse.json()) as {
    data?: { publish_id?: string; video_id?: string };
    publish_id?: string;
    video_id?: string;
  };

  const platformPostId =
    publishData.data?.video_id ?? publishData.video_id ?? publishData.data?.publish_id ?? publishData.publish_id;

  if (!platformPostId) {
    throw new Error('TikTok publish did not return a publish or video ID.');
  }

  return {
    platformPostId,
    publishId: publishData.data?.publish_id ?? publishData.publish_id,
    metadata: {
      creatorId: tikTok.creatorId,
    },
  };
}

function numberFromUnknown(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function firstVideoRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const data = (payload as { data?: unknown }).data;
  if (data && typeof data === 'object') {
    const candidateLists = [
      (data as { videos?: unknown }).videos,
      (data as { list?: unknown }).list,
      (data as { items?: unknown }).items,
    ];

    for (const candidate of candidateLists) {
      if (Array.isArray(candidate) && candidate[0] && typeof candidate[0] === 'object') {
        return candidate[0] as Record<string, unknown>;
      }
    }

    if ('video' in (data as Record<string, unknown>)) {
      const video = (data as { video?: unknown }).video;
      if (video && typeof video === 'object') {
        return video as Record<string, unknown>;
      }
    }
  }

  return null;
}

export async function fetchTikTokVideoMetrics(
  config: GoogleMediaConfig,
  input: TikTokAnalyticsInput,
): Promise<TikTokAnalyticsResponse> {
  const tikTok = requireTikTokPublishConfig(config);
  const url = new URL(`${tikTok.apiBaseUrl}/video/query/`);
  url.searchParams.set(
    'fields',
    [
      'id',
      'view_count',
      'like_count',
      'comment_count',
      'share_count',
      'average_watch_duration',
      'completion_rate',
      'impression_count',
      'reach',
      'save_count',
    ].join(','),
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tikTok.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      creator_id: tikTok.creatorId,
      filters: {
        video_ids: [input.platformPostId],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`TikTok analytics failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const video = firstVideoRecord(payload);
  if (!video) {
    throw new Error('TikTok analytics did not return a matching video record.');
  }

  const views = numberFromUnknown(video.view_count ?? video.views);
  const likes = numberFromUnknown(video.like_count ?? video.likes);
  const comments = numberFromUnknown(video.comment_count ?? video.comments);
  const shares = numberFromUnknown(video.share_count ?? video.shares);
  const saves = numberFromUnknown(video.save_count ?? video.saves);
  const reach = numberFromUnknown(video.reach ?? video.unique_viewers);
  const impressions = numberFromUnknown(video.impression_count ?? video.impressions ?? views);
  const avgWatchTimeSeconds = numberFromUnknown(
    video.average_watch_duration ?? video.avg_watch_time_seconds,
  );
  const completionRate = numberFromUnknown(video.completion_rate);

  return {
    views,
    likes,
    comments,
    shares,
    saves,
    completionRate: completionRate > 0 ? completionRate : undefined,
    avgWatchTimeSeconds: avgWatchTimeSeconds > 0 ? avgWatchTimeSeconds : undefined,
    reach: reach > 0 ? reach : views,
    impressions: impressions > 0 ? impressions : views,
    metadata: {
      source: 'tiktok-api',
      creatorId: tikTok.creatorId,
    },
  };
}
