import { describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { loadConfig } from '../lib/config.js';
import { initStore, createRun, getPublishedPostByRunAndPlatform, saveRenderedVideo } from '../lib/store.js';
import { createPublishInstagramTool } from '../tools/publish-instagram.js';
import { createPublishTikTokTool } from '../tools/publish-tiktok.js';

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
  test('publish_instagram records a dry-run publication', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'google-media-publish-instagram-'));
    const runId = 'run-instagram';
    const { config, store } = await seedRenderedRun(tempRoot, runId);

    const tool = createPublishInstagramTool(config);
    const result = await tool.execute('tool-call', {
      runId,
      caption: 'Test caption',
      hashtags: ['saravan', 'automation'],
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.status).toBe('dry_run');

    const publication = getPublishedPostByRunAndPlatform(store, runId, 'instagram');
    expect(publication?.status).toBe('dry_run');
    expect(publication?.platformPostId).toBe(`dryrun-instagram-${runId}`);
  });

  test('publish_tiktok records a dry-run publication', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'google-media-publish-tiktok-'));
    const runId = 'run-tiktok';
    const { config, store } = await seedRenderedRun(tempRoot, runId);

    const tool = createPublishTikTokTool(config);
    const result = await tool.execute('tool-call', {
      runId,
      caption: 'Test caption',
      hashtags: ['saravan', 'automation'],
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.status).toBe('dry_run');

    const publication = getPublishedPostByRunAndPlatform(store, runId, 'tiktok');
    expect(publication?.status).toBe('dry_run');
    expect(publication?.platformPostId).toBe(`dryrun-tiktok-${runId}`);
  });

  test('publish_instagram blocks duplicate dry-run publications for the same run', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'google-media-publish-duplicate-'));
    const runId = 'run-duplicate';
    const { config } = await seedRenderedRun(tempRoot, runId);

    const tool = createPublishInstagramTool(config);
    await tool.execute('tool-call-1', {
      runId,
      caption: 'First caption',
    });

    const secondResult = await tool.execute('tool-call-2', {
      runId,
      caption: 'Second caption',
    });

    const payload = JSON.parse(secondResult.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('already has a dry-run publication');
  });
});
