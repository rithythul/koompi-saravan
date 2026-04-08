import { Type } from '@sinclair/typebox';

import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { getHourPerformance, initStore, updateHourPerformance } from '../lib/store.js';
import type { Platform } from '../lib/types.js';

export function createUpdateHourPerformanceTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'update_hour_performance',
    description:
      'Recompute cached hour-level performance aggregates from the latest post and metrics snapshots.',
    parameters: Type.Object({
      platform: Type.Optional(
        Type.Union([
          Type.Literal('tiktok'),
          Type.Literal('instagram'),
          Type.Literal('all'),
        ], {
          default: 'all',
          description: 'Optional platform filter for reporting after recompute.',
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        platform?: Platform | 'all';
      },
    ) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      const rows = updateHourPerformance(store);
      const platforms: Array<Platform> =
        params.platform && params.platform !== 'all'
          ? [params.platform]
          : ['tiktok', 'instagram'];

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                rowsUpdated: rows.length,
                summaries: platforms.reduce<Record<string, { overallHours: number }>>((accumulator, platform) => {
                  accumulator[platform] = {
                    overallHours: getHourPerformance(store, platform).length,
                  };
                  return accumulator;
                }, {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}

export const updateHourPerformanceTool = createUpdateHourPerformanceTool();
