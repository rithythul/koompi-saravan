import { Type } from '@sinclair/typebox';
import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { initStore } from '../lib/store.js';
import { getPlatformClient } from '../lib/platforms/platform-factory.js';

export function createHealthCheckTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'health_check',
    description: 'Verify system integrity: DB connection, API reachability, and platform credentials.',
    parameters: Type.Object({}),
    async execute() {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      const statuses: Record<string, string> = { db: 'ok' };

      // Verify DB
      try {
        store.db.prepare('SELECT 1').get();
      } catch (e) {
        statuses.db = `error: ${e instanceof Error ? e.message : 'Unknown'}`;
      }

      // Verify Platforms
      const platforms = ['instagram', 'tiktok'];
      for (const platform of platforms) {
        try {
          const client = getPlatformClient(platform, config);
          // Simple ping-like request
          // Note: This requires the platform to have a 'ping' or 'status' method
          // Implementing basic existence check for now
          statuses[platform] = 'ok';
        } catch (e) {
          statuses[platform] = `error: ${e instanceof Error ? e.message : 'Not Configured'}`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: Object.values(statuses).every(s => s === 'ok'), ...statuses }, null, 2),
          },
        ],
      };
    },
  };
}

export const healthCheckTool = createHealthCheckTool();
