import { describe, expect, test, beforeAll } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { initDatabaseModule } from '../lib/db.js';
import { loadConfig } from '../lib/config.js';
import { initStore, createRun, getPublishedPostByRunAndPlatform, saveRenderedVideo } from '../lib/store.js';
import { createPublishTool } from '../tools/publish.js';

beforeAll(async () => {
  await initDatabaseModule();
});

async function seedRenderedRun(tempRoot: string, runId: string) {
  const config = loadConfig({ defaultOutputDir: path.join(tempRoot, 'outputs'), dryRun: true });
  const store = initStore(config);
  const runDir = path.join(tempRoot, 'outputs', '2026-03-18', runId);
  await fs.mkdir(runDir, { recursive: true });
  const videoPath = path.join(runDir, 'hook-reveal.mp4');
  await fs.writeFile(videoPath, 'fake-video');

  createRun(store, {
    id: runId,
    outputDir: runDir,
    metadata: { seeded: true },
  });

  saveRenderedVideo(store, {
    id: `${runId}-render`,
    runId,
    compositionId: 'HookReveal',
    filePath: videoPath,
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 150,
    metadata: { seeded: true },
  });

  return { config, store, videoPath };
}

describe('publish tools', () => {
  test('publish records a dry-run publication for telegram', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'publisher-publish-telegram-'));
    const runId = 'run-telegram';
    const { config, store } = await seedRenderedRun(tempRoot, runId);

    // Reuse the same store instance by passing the existing store
    const tool = createPublishTool(config);
    const result = await tool.execute('tool-call', {
      runId,
      caption: 'Test caption',
      hashtags: ['saravan', 'automation'],
      platform: 'telegram',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.status).toBe('dry_run');

    const publication = getPublishedPostByRunAndPlatform(store, runId, 'telegram');
    expect(publication?.status).toBe('dry_run');
    expect(publication?.platformPostId).toBe(`dryrun-telegram-${runId}`);
  });

  test('publish records a dry-run publication for x', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'publisher-publish-x-'));
    const runId = 'run-x';
    const { config, store } = await seedRenderedRun(tempRoot, runId);

    const tool = createPublishTool(config);
    const result = await tool.execute('tool-call', {
      runId,
      caption: 'Test caption',
      hashtags: ['saravan', 'automation'],
      platform: 'x',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.status).toBe('dry_run');

    const publication = getPublishedPostByRunAndPlatform(store, runId, 'x');
    expect(publication?.status).toBe('dry_run');
    expect(publication?.platformPostId).toBe(`dryrun-x-${runId}`);
  });

  test('publish blocks duplicate dry-run publications for the same run', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'publisher-publish-duplicate-'));
    const runId = 'run-duplicate';
    const { config } = await seedRenderedRun(tempRoot, runId);

    const tool = createPublishTool(config);
    await tool.execute('tool-call-1', {
      runId,
      caption: 'First caption',
      platform: 'telegram',
    });

    const secondResult = await tool.execute('tool-call-2', {
      runId,
      caption: 'Second caption',
      platform: 'telegram',
    });

    const payload = JSON.parse(secondResult.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('already has a dry-run publication');
  });
});
