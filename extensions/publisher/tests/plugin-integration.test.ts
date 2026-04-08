import { describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';

import registerGoogleMediaPlugin, { createRegisteredTools, registeredToolNames, tools } from '../index.js';

const manifestPath = path.resolve(import.meta.dir, '..', 'openclaw.plugin.json');

describe('OpenClaw plugin integration', () => {
  test('registers every tool when the plugin is loaded', () => {
    const registered: Array<{ name: string; description: string; execute: unknown }> = [];

    registerGoogleMediaPlugin(
      {
        registerTool(tool) {
          registered.push({
            name: tool.name,
            description: tool.description,
            execute: tool.execute,
          });
        },
      },
      {
        config: {
          dryRun: true,
          defaultOutputDir: './var/plugin-test-output',
        },
      },
    );

    expect(registered.map((tool) => tool.name)).toEqual(registeredToolNames);
    expect(new Set(registered.map((tool) => tool.name)).size).toBe(registeredToolNames.length);
    expect(registered.every((tool) => typeof tool.description === 'string' && tool.description.length > 0)).toBe(true);
    expect(registered.every((tool) => typeof tool.execute === 'function')).toBe(true);
  });

  test('named exports stay aligned with the registered tool factories', () => {
    const exportedToolNames = Object.values(tools)
      .map((tool) => tool.name)
      .sort();
    const factoryToolNames = createRegisteredTools()
      .map((tool) => tool.name)
      .sort();

    expect(exportedToolNames).toEqual(factoryToolNames);
  });

  test('manifest stays aligned with the current plugin metadata', async () => {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
      id: string;
      name: string;
      description: string;
      version: string;
      configSchema: {
        additionalProperties: boolean;
        properties: Record<string, unknown>;
      };
      uiHints: Record<string, unknown>;
    };

    expect(manifest.id).toBe('google-media');
    expect(manifest.name).toBe('Google Media Tools');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.description).toContain('publishing');
    expect(manifest.configSchema.additionalProperties).toBe(false);

    const expectedConfigKeys = [
      'geminiApiKey',
      'defaultOutputDir',
      'dryRun',
      'killSwitch',
      'publicMediaBaseUrl',
      'instagramAccessToken',
      'instagramBusinessAccountId',
      'instagramApiBaseUrl',
      'tiktokAccessToken',
      'tiktokCreatorId',
      'tiktokApiBaseUrl',
    ].sort();

    expect(Object.keys(manifest.configSchema.properties).sort()).toEqual(expectedConfigKeys);
    expect(Object.keys(manifest.uiHints).sort()).toEqual(expectedConfigKeys);
  });
});
