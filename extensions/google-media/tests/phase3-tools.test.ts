import { describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { loadConfig } from '../lib/config.js';
import { getHourPerformance, getPostsMetricsJoined, initStore, savePost, savePostMetric } from '../lib/store.js';
import { createAnalyzePatternsTool } from '../tools/analyze-patterns.js';
import { createGenerateScheduleTool } from '../tools/generate-schedule.js';
import { createLogPostTool } from '../tools/log-post.js';
import { createPullAnalyticsTool } from '../tools/pull-analytics.js';

async function createConfig(prefix: string) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return loadConfig({ defaultOutputDir: path.join(tempRoot, 'outputs'), dryRun: true });
}

describe('phase 3 tools', () => {
  test('log_post stores a tracked post and derives scheduled hour from postedAt', async () => {
    const config = await createConfig('google-media-log-post-');
    const store = initStore(config);
    const tool = createLogPostTool(config);

    const result = await tool.execute('tool-call', {
      platform: 'tiktok',
      platformPostId: 'tt-live-1',
      postedAt: '2026-03-19T17:45:00.000Z',
      contentType: 'hook_reveal',
      videoPath: '/tmp/hook-reveal.mp4',
      caption: 'Caption',
      hashtags: ['saravan', 'phase3'],
      scheduledBy: 'optimized',
      confidenceScore: 0.77,
      runId: 'run-phase3',
    });

    const payload = JSON.parse(result.content[0].text);
    const posts = getPostsMetricsJoined(store, { platform: 'tiktok', daysBack: 7 });

    expect(payload.success).toBe(true);
    expect(posts).toHaveLength(1);
    expect(posts[0].scheduledHour).toBe(17);
    expect(posts[0].hashtags).toEqual(['saravan', 'phase3']);
  });

  test('pull_analytics creates metric snapshots and refreshes hour performance', async () => {
    const config = await createConfig('google-media-pull-analytics-');
    const store = initStore(config);

    savePost(store, {
      id: 'post-analytics-1',
      platform: 'instagram',
      platformPostId: 'ig-analytics-1',
      postedAt: '2026-03-19T18:00:00.000Z',
      contentType: 'hook_reveal',
      videoPath: '/tmp/hook.mp4',
      scheduledBy: 'manual',
      scheduledHour: 18,
    });

    const tool = createPullAnalyticsTool(config, {
      fetchMetrics: async () => ({
        views: 1500,
        likes: 90,
        comments: 12,
        shares: 14,
        saves: 18,
        completionRate: 0.59,
        avgWatchTimeSeconds: 11.5,
        reach: 1700,
        impressions: 1950,
        platformData: { source: 'test' },
      }),
    });

    const result = await tool.execute('tool-call', {
      platform: 'instagram',
      maxPosts: 10,
    });

    const payload = JSON.parse(result.content[0].text);
    const joined = getPostsMetricsJoined(store, { platform: 'instagram', daysBack: 7 });
    const hourPerformance = getHourPerformance(store, 'instagram');

    expect(payload.success).toBe(true);
    expect(payload.postsUpdated).toBe(1);
    expect(joined[0].views).toBe(1500);
    expect(hourPerformance).toHaveLength(1);
    expect(hourPerformance[0].avgViews).toBe(1500);
  });

  test('analyze_posting_patterns returns heuristic insights without Gemini', async () => {
    const config = await createConfig('google-media-analyze-patterns-');
    const store = initStore(config);

    for (let index = 0; index < 4; index += 1) {
      const postId = `post-${index}`;
      const hour = index < 2 ? 18 : 21;
      savePost(store, {
        id: postId,
        platform: 'tiktok',
        postedAt: `2026-03-1${index + 1}T${String(hour).padStart(2, '0')}:00:00.000Z`,
        contentType: 'hook_reveal',
        videoPath: `/tmp/${postId}.mp4`,
        scheduledBy: 'optimized',
        scheduledHour: hour,
      });
      savePostMetric(store, {
        id: `metric-${index}`,
        postId,
        pulledAt: `2026-03-1${index + 1}T${String(hour + 1).padStart(2, '0')}:00:00.000Z`,
        views: index < 2 ? 3200 : 1200,
        likes: index < 2 ? 180 : 65,
        comments: index < 2 ? 14 : 6,
        shares: index < 2 ? 20 : 5,
        saves: index < 2 ? 22 : 4,
        completionRate: index < 2 ? 0.68 : 0.39,
        avgWatchTimeSeconds: index < 2 ? 13.2 : 8.4,
        reach: index < 2 ? 3500 : 1450,
        impressions: index < 2 ? 3820 : 1600,
      });
    }

    const tool = createAnalyzePatternsTool(config);
    const result = await tool.execute('tool-call', {
      platform: 'tiktok',
      daysBack: 30,
      minPosts: 4,
    });

    const payload = JSON.parse(result.content[0].text);
    const insight = payload.insights[0];

    expect(payload.success).toBe(true);
    expect(insight.status).toBe('success');
    expect(insight.recommendationSource).toBe('heuristic');
    expect(insight.topHours[0].hour).toBe(18);
    expect(insight.recommendations.length).toBeGreaterThan(0);
  });

  test('generate_optimized_schedule returns ordered slots with exploration', async () => {
    const config = await createConfig('google-media-generate-schedule-');
    const store = initStore(config);

    savePost(store, {
      id: 'sched-1',
      platform: 'instagram',
      postedAt: '2026-03-17T18:00:00.000Z',
      contentType: 'hook_reveal',
      videoPath: '/tmp/sched-1.mp4',
      scheduledBy: 'optimized',
      scheduledHour: 18,
    });
    savePostMetric(store, {
      id: 'sched-metric-1',
      postId: 'sched-1',
      pulledAt: '2026-03-17T19:00:00.000Z',
      views: 3000,
      likes: 160,
      comments: 11,
      shares: 19,
      saves: 20,
      completionRate: 0.66,
      avgWatchTimeSeconds: 12.7,
      reach: 3300,
      impressions: 3575,
    });
    savePost(store, {
      id: 'sched-2',
      platform: 'instagram',
      postedAt: '2026-03-18T21:00:00.000Z',
      contentType: 'hook_reveal',
      videoPath: '/tmp/sched-2.mp4',
      scheduledBy: 'manual',
      scheduledHour: 21,
    });
    savePostMetric(store, {
      id: 'sched-metric-2',
      postId: 'sched-2',
      pulledAt: '2026-03-18T22:00:00.000Z',
      views: 1200,
      likes: 55,
      comments: 5,
      shares: 4,
      saves: 6,
      completionRate: 0.37,
      avgWatchTimeSeconds: 7.9,
      reach: 1320,
      impressions: 1490,
    });

    const tool = createGenerateScheduleTool(config, {
      random: () => 0,
      now: () => new Date('2026-03-19T05:00:00.000Z'),
    });

    const result = await tool.execute('tool-call', {
      postCount: 4,
      date: '2026-03-24',
      platform: 'instagram',
      explorationRate: 0.25,
      minGapMinutes: 60,
      activeHoursStart: 18,
      activeHoursEnd: 22,
    });

    const payload = JSON.parse(result.content[0].text);
    const schedule = payload.schedules.instagram;

    expect(payload.success).toBe(true);
    expect(schedule.totalSlots).toBe(4);
    expect(schedule.explorationSlots).toHaveLength(1);
    expect(schedule.slots[0].time <= schedule.slots[1].time).toBe(true);
    expect(schedule.generatedAt).toBe('2026-03-19T05:00:00.000Z');
  });
});
