import { describe, expect, test, beforeAll } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { initDatabaseModule } from '../lib/db.js';
import { loadConfig } from '../lib/config.js';
import { initStore, createRun, saveRenderedVideo } from '../lib/store.js';
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
  test('publish accepts a request with platforms and content', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'publisher-publish-telegram-'));
    const runId = 'run-telegram';
    const { config } = await seedRenderedRun(tempRoot, runId);

    const tool = createPublishTool(config);
    const result = await tool.execute('tool-call', {
      platforms: ['telegram'],
      content: {
        type: 'video',
        mediaUrl: `file:///path/to/video.mp4`,
        caption: 'Test caption',
        hashtags: ['saravan', 'automation'],
      },
      options: {
        dryRun: true,
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.summary).toBeDefined();
    expect(payload.summary.total).toBe(1);
  });

  test('publish handles multiple platforms', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'publisher-publish-multiple-'));
    const runId = 'run-multiple';
    await seedRenderedRun(tempRoot, runId);

    const tool = createPublishTool();
    const result = await tool.execute('tool-call', {
      platforms: ['telegram', 'x'],
      content: {
        type: 'video',
        mediaUrl: `file:///path/to/video.mp4`,
        caption: 'Test caption for multiple platforms',
        hashtags: ['saravan', 'automation'],
      },
      options: {
        dryRun: true,
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.summary.total).toBe(2);
    expect(payload.results).toBeInstanceOf(Array);
    expect(payload.results).toHaveLength(2);
  });

  test('publish rejects unsupported platforms', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'publisher-publish-unsupported-'));
    const runId = 'run-unsupported';
    await seedRenderedRun(tempRoot, runId);

    const tool = createPublishTool();
    const result = await tool.execute('tool-call', {
      platforms: ['instagram'] as any,
      content: {
        type: 'video',
        mediaUrl: `file:///path/to/video.mp4`,
        caption: 'Test caption',
      },
      options: {
        dryRun: true,
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.results[0].success).toBe(false);
    expect(payload.results[0].error).toContain('not supported');
  });
});
