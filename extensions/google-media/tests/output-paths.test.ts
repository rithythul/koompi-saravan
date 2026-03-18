import { describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { createRunOutputPaths, resolveSafeAssetPath, sanitizeFileStem } from '../lib/output-paths.js';
import { loadConfig } from '../lib/config.js';

describe('output path helpers', () => {
  test('createRunOutputPaths creates a run directory inside the managed root', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'google-media-output-'));
    const config = loadConfig({ defaultOutputDir: tempRoot });

    const paths = await createRunOutputPaths(config, 'run-123', new Date('2026-03-18T12:00:00Z'));

    expect(paths.runDir.startsWith(tempRoot)).toBe(true);
    expect((await fs.stat(paths.runDir)).isDirectory()).toBe(true);
  });

  test('resolveSafeAssetPath blocks path traversal', () => {
    expect(() => resolveSafeAssetPath('/tmp/run', '../escape.png')).toThrow(
      'Nested or relative file names are not allowed',
    );
  });

  test('sanitizeFileStem normalizes filenames', () => {
    expect(sanitizeFileStem('  Hello, World!  ')).toBe('hello-world');
  });
});
