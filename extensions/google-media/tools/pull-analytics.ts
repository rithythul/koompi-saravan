import { randomUUID } from 'crypto';

import { Type } from '@sinclair/typebox';

import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { fetchInstagramMediaMetrics } from '../lib/platforms/instagram-client.js';
import { fetchTikTokVideoMetrics } from '../lib/platforms/tiktok-client.js';
import {
  getRecentPosts,
  getHourPerformance,
  initStore,
  savePostMetric,
  updateHourPerformance,
} from '../lib/store.js';
import type { Platform, Post } from '../lib/types.js';

interface PlatformMetrics {
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
}

interface PullAnalyticsDependencies {
  fetchMetrics?: (platform: Platform, post: Post) => Promise<PlatformMetrics>;
}

function stableHash(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function buildSimulatedMetrics(platform: Platform, post: Post): PlatformMetrics {
  const seed = stableHash(`${platform}:${post.platformPostId ?? post.id}:${post.postedAt}`);
  const views = 700 + (seed % 9300);
  const likes = Math.max(10, Math.round(views * (0.04 + ((seed >> 3) % 40) / 1000)));
  const comments = Math.max(1, Math.round(likes * (0.08 + ((seed >> 5) % 15) / 100)));
  const shares = Math.max(1, Math.round(likes * (0.05 + ((seed >> 7) % 10) / 100)));
  const saves = Math.max(1, Math.round(likes * (0.03 + ((seed >> 11) % 12) / 100)));
  const reach = Math.max(views, Math.round(views * (1.08 + ((seed >> 13) % 20) / 100)));
  const impressions = Math.max(reach, Math.round(reach * (1.12 + ((seed >> 17) % 25) / 100)));
  const completionRate = Number((0.28 + ((seed % 45) / 100)).toFixed(2));
  const avgWatchTimeSeconds = Number((5 + ((seed >> 9) % 22) * 0.75).toFixed(2));

  return {
    views,
    likes,
    comments,
    shares,
    saves,
    completionRate,
    avgWatchTimeSeconds,
    reach,
    impressions,
    platformData: {
      source: 'simulated',
      seed,
    },
  };
}

async function fetchLivePlatformMetrics(platform: Platform, post: Post, config: ReturnType<typeof loadConfig>): Promise<PlatformMetrics> {
  if (!post.platformPostId) {
    throw new Error(`Post ${post.id} is missing platformPostId, so live analytics cannot be fetched.`);
  }

  if (platform === 'instagram') {
    return fetchInstagramMediaMetrics(config, {
      platformPostId: post.platformPostId,
    });
  }

  return fetchTikTokVideoMetrics(config, {
    platformPostId: post.platformPostId,
  });
}

export function createPullAnalyticsTool(
  configOverrides: GoogleMediaConfigInput = {},
  dependencies: PullAnalyticsDependencies = {},
) {
  const fetchMetrics =
    dependencies.fetchMetrics ??
    (async (platform: Platform, post: Post) => {
      const config = loadConfig(configOverrides);
      if (config.dryRun) {
        return buildSimulatedMetrics(platform, post);
      }

      return fetchLivePlatformMetrics(platform, post, config);
    });

  return {
    name: 'pull_analytics',
    description:
      'Fetch the latest metrics for recent TikTok and Instagram posts, store snapshots locally, and refresh hour-level performance aggregates.',
    parameters: Type.Object({
      platform: Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
        Type.Literal('all'),
      ], {
        default: 'all',
        description: 'Platform to update. Use all to process both platforms.',
      }),
      postsSince: Type.Optional(
        Type.String({
          description: 'Only update posts published after this ISO timestamp.',
        }),
      ),
      maxPosts: Type.Optional(
        Type.Number({
          minimum: 1,
          maximum: 200,
          default: 50,
          description: 'Maximum number of recent posts to inspect per platform.',
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        platform: Platform | 'all';
        postsSince?: string;
        maxPosts?: number;
      },
    ) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      const platforms: Platform[] = params.platform === 'all' ? ['tiktok', 'instagram'] : [params.platform];
      const results = {
        platforms: [] as Platform[],
        postsUpdated: 0,
        metricsCreated: 0,
        hourPerformanceRows: 0,
        errors: [] as string[],
      };

      for (const platform of platforms) {
        try {
          const posts = getRecentPosts(store, {
            platform,
            since: params.postsSince,
            limit: params.maxPosts ?? 50,
          });

          for (const post of posts) {
            const metrics = await fetchMetrics(platform, post);
            savePostMetric(store, {
              id: randomUUID(),
              postId: post.id,
              pulledAt: new Date().toISOString(),
              views: metrics.views,
              likes: metrics.likes,
              comments: metrics.comments,
              shares: metrics.shares,
              saves: metrics.saves,
              completionRate: metrics.completionRate,
              avgWatchTimeSeconds: metrics.avgWatchTimeSeconds,
              reach: metrics.reach,
              impressions: metrics.impressions,
              platformData: metrics.platformData,
            });
            results.postsUpdated += 1;
            results.metricsCreated += 1;
          }

          results.platforms.push(platform);
        } catch (error) {
          results.errors.push(
            `${platform}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      results.hourPerformanceRows = updateHourPerformance(store).length;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: results.errors.length === 0,
                ...results,
                summaries: results.platforms.reduce<Record<string, { overallHours: number }>>((accumulator, platform) => {
                  accumulator[platform] = {
                    overallHours: getHourPerformance(store, platform).length,
                  };
                  return accumulator;
                }, {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}

export const pullAnalyticsTool = createPullAnalyticsTool();
