import { describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { loadConfig } from '../lib/config.js';
import {
  getHourPerformance,
  getPostsMetricsJoined,
  getRecentPosts,
  initStore,
  savePost,
  savePostMetric,
  updateHourPerformance,
} from '../lib/store.js';

async function createAnalyticsStore(prefix: string) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const config = loadConfig({ defaultOutputDir: path.join(tempRoot, 'outputs'), dryRun: true });
  const store = initStore(config);
  return { tempRoot, config, store };
}

describe('posts and analytics store', () => {
  test('saves posts and returns only the latest metrics snapshot per post', async () => {
    const { store } = await createAnalyticsStore('google-media-analytics-');

    savePost(store, {
      id: 'post-1',
      platform: 'tiktok',
      platformPostId: 'tt-123',
      postedAt: '2026-03-19T20:00:00.000Z',
      contentType: 'hook_reveal',
      videoPath: '/tmp/test.mp4',
      caption: 'test caption',
      hashtags: ['saravan'],
      scheduledBy: 'optimized',
      confidenceScore: 0.82,
      scheduledHour: 20,
      runId: 'run-1',
    });

    savePostMetric(store, {
      id: 'metric-older',
      postId: 'post-1',
      pulledAt: '2026-03-19T20:15:00.000Z',
      views: 800,
      likes: 35,
      comments: 4,
      shares: 3,
      saves: 2,
      completionRate: 0.41,
      avgWatchTimeSeconds: 8.2,
      reach: 920,
      impressions: 1005,
      platformData: { source: 'older' },
    });

    savePostMetric(store, {
      id: 'metric-latest',
      postId: 'post-1',
      pulledAt: '2026-03-19T21:15:00.000Z',
      views: 1600,
      likes: 70,
      comments: 8,
      shares: 6,
      saves: 5,
      completionRate: 0.56,
      avgWatchTimeSeconds: 10.1,
      reach: 1800,
      impressions: 2050,
      platformData: { source: 'latest' },
    });

    const recentPosts = getRecentPosts(store, { platform: 'tiktok', limit: 5 });
    const joined = getPostsMetricsJoined(store, { platform: 'tiktok', daysBack: 7 });

    expect(recentPosts).toHaveLength(1);
    expect(joined).toHaveLength(1);
    expect(joined[0].metricId).toBe('metric-latest');
    expect(joined[0].views).toBe(1600);
    expect(joined[0].platformData).toEqual({ source: 'latest' });
  });

  test('recomputes hour performance for overall and day-specific buckets', async () => {
    const { store } = await createAnalyticsStore('google-media-hour-perf-');

    savePost(store, {
      id: 'post-ig-1',
      platform: 'instagram',
      postedAt: '2026-03-16T18:00:00.000Z',
      contentType: 'hook_reveal',
      videoPath: '/tmp/ig-1.mp4',
      scheduledBy: 'manual',
      scheduledHour: 18,
    });
    savePostMetric(store, {
      id: 'metric-ig-1',
      postId: 'post-ig-1',
      pulledAt: '2026-03-16T19:00:00.000Z',
      views: 2200,
      likes: 120,
      comments: 9,
      shares: 12,
      saves: 17,
      completionRate: 0.62,
      avgWatchTimeSeconds: 11.8,
      reach: 2400,
      impressions: 2650,
    });

    savePost(store, {
      id: 'post-ig-2',
      platform: 'instagram',
      postedAt: '2026-03-17T20:00:00.000Z',
      contentType: 'hook_reveal',
      videoPath: '/tmp/ig-2.mp4',
      scheduledBy: 'optimized',
      confidenceScore: 0.91,
      scheduledHour: 20,
    });
    savePostMetric(store, {
      id: 'metric-ig-2',
      postId: 'post-ig-2',
      pulledAt: '2026-03-17T21:00:00.000Z',
      views: 3200,
      likes: 175,
      comments: 15,
      shares: 22,
      saves: 25,
      completionRate: 0.71,
      avgWatchTimeSeconds: 13.4,
      reach: 3600,
      impressions: 3890,
    });

    const rows = updateHourPerformance(store);
    const overall = getHourPerformance(store, 'instagram');
    const tuesday = getHourPerformance(store, 'instagram', { dayOfWeek: 2 });

    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(overall).toHaveLength(2);
    expect(overall[0].performanceScore).toBeGreaterThan(0);
    expect(tuesday.some((row) => row.hour === 20)).toBe(true);
  });
});
