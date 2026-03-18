import { describe, expect, test } from 'bun:test';

import { assertAutomationEnabled, loadConfig, requireGeminiApiKey } from '../lib/config.js';

describe('config helpers', () => {
  test('loadConfig applies defaults and resolves output dir', () => {
    const config = loadConfig({ defaultOutputDir: './var/test-output' });

    expect(config.defaultOutputDir.endsWith('/var/test-output')).toBe(true);
    expect(config.dryRun).toBe(false);
    expect(config.killSwitch).toBe(false);
  });

  test('assertAutomationEnabled rejects kill switch', () => {
    expect(() =>
      assertAutomationEnabled(
        loadConfig({
          killSwitch: true,
        }),
      ),
    ).toThrow('Automation is disabled by kill switch');
  });

  test('requireGeminiApiKey throws when no key is configured', () => {
    expect(() => requireGeminiApiKey(loadConfig({ geminiApiKey: '' }))).toThrow(
      'Gemini API key not configured',
    );
  });
});
