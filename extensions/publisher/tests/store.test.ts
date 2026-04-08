import { describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { loadConfig } from '../lib/config.js';
import {
  createRun,
  getPublishedPostByRunAndPlatform,
  getRunById,
  initStore,
  saveGeneratedAsset,
  savePublishedPost,
  saveRenderedVideo,
  updateRunStatus,
} from '../lib/store.js';

describe('SQLite store', () => {
  test('persists runs and artifacts', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'google-media-store-'));
    const config = loadConfig({ defaultOutputDir: path.join(tempRoot, 'outputs') });
    const store = initStore(config);

    createRun(store, {
      id: 'run-1',
      prompt: 'Make a test image',
      outputDir: path.join(tempRoot, 'outputs', '2026-03-18', 'run-1'),
    });

    saveGeneratedAsset(store, {
      id: 'asset-1',
      runId: 'run-1',
      kind: 'image',
      mimeType: 'image/png',
      filePath: '/tmp/asset.png',
      fileSizeBytes: 42,
      metadata: { index: 0 },
    });

    saveRenderedVideo(store, {
      id: 'render-1',
      runId: 'run-1',
      compositionId: 'HookReveal',
      filePath: '/tmp/video.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 150,
      metadata: { fileSizeBytes: 420 },
    });

    const updatedRun = updateRunStatus(store, 'run-1', 'rendered', {
      metadata: { summaryPath: '/tmp/run.json' },
    });

    const publication = savePublishedPost(store, {
      id: 'publication-1',
      runId: 'run-1',
      platform: 'instagram',
      status: 'dry_run',
      caption: 'hello world',
      videoPath: '/tmp/video.mp4',
      videoUrl: 'https://example.com/video.mp4',
      platformPostId: 'dryrun-instagram-run-1',
      permalink: undefined,
      metadata: { dryRun: true },
    });

    expect(updatedRun.status).toBe('rendered');
    expect(updatedRun.metadata.summaryPath).toBe('/tmp/run.json');
    expect(getRunById(store, 'run-1')?.id).toBe('run-1');
    expect(publication.status).toBe('dry_run');
    expect(getPublishedPostByRunAndPlatform(store, 'run-1', 'instagram')?.platformPostId).toBe(
      'dryrun-instagram-run-1',
    );
  });
});
