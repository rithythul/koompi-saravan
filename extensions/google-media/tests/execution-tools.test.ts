import { describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { loadConfig } from '../lib/config.js';
import { getPostByRunId, getPublishedPostByRunAndPlatform, initStore, listPlannedPosts } from '../lib/store.js';
import { createBuildDailyPlanTool } from '../tools/build-daily-plan.js';
import { createExecutePlannedPostTool } from '../tools/execute-planned-post.js';
import { createRunDailyPlanTool } from '../tools/run-daily-plan.js';

async function createConfig(prefix: string) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const outputDir = path.join(tempRoot, 'outputs');
  return loadConfig({
    defaultOutputDir: outputDir,
    dryRun: true,
    publicMediaBaseUrl: 'https://cdn.example.com/media',
  });
}

describe('execution tools', () => {
  test('execute_planned_post runs generation, render, publish, and post logging', async () => {
    const config = await createConfig('google-media-execute-post-');
    const store = initStore(config);

    const buildTool = createBuildDailyPlanTool(config);
    await buildTool.execute('build', {
      date: '2026-03-25',
      platform: 'instagram',
      postCount: 1,
      objective: 'conversions',
      activeHoursStart: 18,
      activeHoursEnd: 18,
    });

    const plannedPosts = listPlannedPosts(store, { date: '2026-03-25', platform: 'instagram' });
    const executeTool = createExecutePlannedPostTool(config);
    const result = await executeTool.execute('execute', {
      plannedPostId: plannedPosts[0].id,
      autoPublish: true,
    });

    const payload = JSON.parse(result.content[0].text);
    const post = getPostByRunId(store, payload.runId, 'instagram');
    const publication = getPublishedPostByRunAndPlatform(store, payload.runId, 'instagram');
    const updatedPlan = listPlannedPosts(store, { date: '2026-03-25', platform: 'instagram' })[0];

    expect(payload.success).toBe(true);
    expect(payload.publicVideoUrl).toContain('https://cdn.example.com/media/');
    expect(post?.id).toBeDefined();
    expect(publication?.status).toBe('dry_run');
    expect(updatedPlan.status).toBe('completed');
  });

  test('run_daily_plan builds and executes a date plan', async () => {
    const config = await createConfig('google-media-run-daily-plan-');
    const store = initStore(config);
    const tool = createRunDailyPlanTool(config);

    const result = await tool.execute('run', {
      date: '2026-03-26',
      platform: 'tiktok',
      postCount: 2,
      objective: 'engagement',
      autoPublish: false,
    });

    const payload = JSON.parse(result.content[0].text);
    const plans = listPlannedPosts(store, { date: '2026-03-26', platform: 'tiktok' });

    expect(payload.success).toBe(true);
    expect(payload.executedCount).toBe(2);
    expect(plans).toHaveLength(2);
    expect(plans.every((plan) => plan.status === 'completed')).toBe(true);
  });
});
