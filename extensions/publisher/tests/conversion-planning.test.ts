import { describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { loadConfig } from '../lib/config.js';
import {
  getConversionsForPost,
  getPostByRunId,
  initStore,
  listPlannedPosts,
  savePost,
  savePostMetric,
  updateHourPerformance,
} from '../lib/store.js';
import { createBuildDailyPlanTool } from '../tools/build-daily-plan.js';
import { createLogConversionTool } from '../tools/log-conversion.js';
import { createPlanNextPostTool } from '../tools/plan-next-post.js';

async function createConfig(prefix: string) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return loadConfig({ defaultOutputDir: path.join(tempRoot, 'outputs'), dryRun: true });
}

describe('conversion logging and planning tools', () => {
  test('log_conversion resolves a post from runId and stores the event', async () => {
    const config = await createConfig('google-media-conversion-log-');
    const store = initStore(config);

    savePost(store, {
      id: 'post-conv-1',
      platform: 'tiktok',
      platformPostId: 'tt-post-1',
      postedAt: '2026-03-19T17:00:00.000Z',
      contentType: 'hook_reveal',
      videoPath: '/tmp/conv.mp4',
      scheduledBy: 'optimized',
      scheduledHour: 17,
      runId: 'run-conv-1',
    });

    const tool = createLogConversionTool(config);
    const result = await tool.execute('tool-call', {
      runId: 'run-conv-1',
      platform: 'tiktok',
      eventType: 'purchase',
      occurredAt: '2026-03-19T18:05:00.000Z',
      value: 49,
      currency: 'usd',
      quantity: 2,
      source: 'shopify',
    });

    const payload = JSON.parse(result.content[0].text);
    const post = getPostByRunId(store, 'run-conv-1', 'tiktok');
    const conversions = getConversionsForPost(store, post!.id);

    expect(payload.success).toBe(true);
    expect(conversions).toHaveLength(1);
    expect(conversions[0].value).toBe(49);
    expect(conversions[0].currency).toBe('USD');
    expect(conversions[0].quantity).toBe(2);
  });

  test('plan_next_post uses performance and conversions to persist a high-confidence plan', async () => {
    const config = await createConfig('google-media-plan-next-');
    const store = initStore(config);

    savePost(store, {
      id: 'post-plan-1',
      platform: 'instagram',
      postedAt: '2026-03-17T18:00:00.000Z',
      contentType: 'hook_reveal',
      videoPath: '/tmp/plan-1.mp4',
      hookText: 'Top hook',
      caption: 'Top caption',
      scheduledBy: 'optimized',
      scheduledHour: 18,
    });
    savePostMetric(store, {
      id: 'metric-plan-1',
      postId: 'post-plan-1',
      pulledAt: '2026-03-17T20:00:00.000Z',
      views: 3000,
      likes: 180,
      comments: 12,
      shares: 21,
      saves: 26,
      completionRate: 0.7,
      avgWatchTimeSeconds: 14.1,
      reach: 3300,
      impressions: 3600,
      platformData: {},
    });

    savePost(store, {
      id: 'post-plan-2',
      platform: 'instagram',
      postedAt: '2026-03-18T21:00:00.000Z',
      contentType: 'quote_card',
      videoPath: '/tmp/plan-2.mp4',
      scheduledBy: 'manual',
      scheduledHour: 21,
    });
    savePostMetric(store, {
      id: 'metric-plan-2',
      postId: 'post-plan-2',
      pulledAt: '2026-03-18T22:00:00.000Z',
      views: 1100,
      likes: 42,
      comments: 3,
      shares: 4,
      saves: 5,
      completionRate: 0.33,
      avgWatchTimeSeconds: 8,
      reach: 1210,
      impressions: 1450,
      platformData: {},
    });

    const conversionTool = createLogConversionTool(config);
    await conversionTool.execute('tool-conv', {
      postId: 'post-plan-1',
      eventType: 'purchase',
      occurredAt: '2026-03-18T22:15:00.000Z',
      value: 120,
      quantity: 1,
      currency: 'USD',
    });

    updateHourPerformance(store);

    const tool = createPlanNextPostTool(config);
    const result = await tool.execute('tool-call', {
      platform: 'instagram',
      objective: 'revenue',
      after: '2026-03-19T10:00:00.000Z',
      withinDays: 3,
      daysBack: 30,
    });

    const payload = JSON.parse(result.content[0].text);
    const plans = listPlannedPosts(store, { platform: 'instagram' });

    expect(payload.success).toBe(true);
    expect(payload.plans).toHaveLength(1);
    expect(payload.plans[0].contentType).toBe('hook_reveal');
    expect(payload.plans[0].confidence).toBeGreaterThan(0.5);
    expect(plans).toHaveLength(1);
    expect(plans[0].objective).toBe('revenue');
  });

  test('build_daily_plan creates a persisted day plan with optimized and exploration slots', async () => {
    const config = await createConfig('google-media-daily-plan-');
    const store = initStore(config);

    for (const seed of [
      {
        id: 'daily-1',
        hour: 18,
        contentType: 'hook_reveal',
        views: 2600,
        revenue: 90,
      },
      {
        id: 'daily-2',
        hour: 20,
        contentType: 'slideshow_caption',
        views: 1800,
        revenue: 45,
      },
    ]) {
      savePost(store, {
        id: seed.id,
        platform: 'tiktok',
        postedAt: `2026-03-1${seed.hour === 18 ? 7 : 8}T${String(seed.hour).padStart(2, '0')}:00:00.000Z`,
        contentType: seed.contentType,
        videoPath: `/tmp/${seed.id}.mp4`,
        scheduledBy: 'optimized',
        scheduledHour: seed.hour,
      });
      savePostMetric(store, {
        id: `${seed.id}-metric`,
        postId: seed.id,
        pulledAt: `2026-03-1${seed.hour === 18 ? 7 : 8}T${String(seed.hour + 1).padStart(2, '0')}:00:00.000Z`,
        views: seed.views,
        likes: Math.round(seed.views * 0.06),
        comments: 8,
        shares: 10,
        saves: 12,
        completionRate: 0.58,
        avgWatchTimeSeconds: 11.1,
        reach: seed.views + 150,
        impressions: seed.views + 320,
        platformData: {},
      });
    }

    const conversionTool = createLogConversionTool(config);
    await conversionTool.execute('conv-1', {
      postId: 'daily-1',
      eventType: 'purchase',
      occurredAt: '2026-03-18T20:15:00.000Z',
      value: 90,
      quantity: 1,
      currency: 'USD',
    });
    await conversionTool.execute('conv-2', {
      postId: 'daily-2',
      eventType: 'lead',
      occurredAt: '2026-03-18T22:15:00.000Z',
      value: 15,
      quantity: 1,
      currency: 'USD',
    });

    updateHourPerformance(store);

    const tool = createBuildDailyPlanTool(config);
    const result = await tool.execute('tool-call', {
      date: '2026-03-24',
      platform: 'tiktok',
      postCount: 4,
      objective: 'conversions',
      explorationRate: 0.25,
      minGapMinutes: 60,
      activeHoursStart: 18,
      activeHoursEnd: 22,
    });

    const payload = JSON.parse(result.content[0].text);
    const plans = listPlannedPosts(store, { date: '2026-03-24', platform: 'tiktok' });

    expect(payload.success).toBe(true);
    expect(payload.plannedCount).toBe(4);
    expect(plans).toHaveLength(4);
    expect(plans.some((plan) => plan.scheduleStrategy === 'exploration')).toBe(true);
    expect(plans.some((plan) => plan.contentType === 'hook_reveal')).toBe(true);
  });
});
