import { Type } from '@sinclair/typebox';

import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { initStore, listPlannedPosts } from '../lib/store.js';
import { createBuildDailyPlanTool } from './build-daily-plan.js';
import { createExecutePlannedPostTool } from './execute-planned-post.js';
import type { PlanningObjective, Platform } from '../lib/types.js';

function safeParseToolPayload(result: { content: Array<{ text?: string }> }): Record<string, unknown> {
  const text = result.content[0]?.text;
  if (!text) {
    throw new Error('Tool returned no text payload.');
  }

  return JSON.parse(text) as Record<string, unknown>;
}

export function createRunDailyPlanTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'run_daily_plan',
    description:
      'Generate a daily plan if needed, then execute each planned post end-to-end for the selected date.',
    parameters: Type.Object({
      date: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
      platform: Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
        Type.Literal('all'),
      ], { default: 'all' }),
      postCount: Type.Optional(Type.Number({ minimum: 1, maximum: 96, default: 1 })),
      objective: Type.Optional(
        Type.Union([
          Type.Literal('conversions'),
          Type.Literal('revenue'),
          Type.Literal('engagement'),
        ], { default: 'conversions' }),
      ),
      executeExistingOnly: Type.Optional(Type.Boolean({ default: false })),
      autoPublish: Type.Optional(Type.Boolean({ default: true })),
    }),
    async execute(
      _id: string,
      params: {
        date: string;
        platform: Platform | 'all';
        postCount?: number;
        objective?: PlanningObjective;
        executeExistingOnly?: boolean;
        autoPublish?: boolean;
      },
    ) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      const buildDailyPlanTool = createBuildDailyPlanTool(configOverrides);
      const executePlannedPostTool = createExecutePlannedPostTool(configOverrides);
      const objective = params.objective ?? 'conversions';

      let plannedPosts = listPlannedPosts(store, {
        date: params.date,
        ...(params.platform !== 'all' ? { platform: params.platform } : {}),
        status: 'planned',
      });

      if (!params.executeExistingOnly && plannedPosts.length === 0) {
        await buildDailyPlanTool.execute('run-daily-plan-build', {
          date: params.date,
          platform: params.platform,
          postCount: params.postCount ?? 1,
          objective,
        });

        plannedPosts = listPlannedPosts(store, {
          date: params.date,
          ...(params.platform !== 'all' ? { platform: params.platform } : {}),
          status: 'planned',
        });
      }

      const executionResults = [];
      for (const plannedPost of plannedPosts) {
        const result = safeParseToolPayload(
          await executePlannedPostTool.execute(`run-daily-plan-${plannedPost.id}`, {
            plannedPostId: plannedPost.id,
            autoPublish: params.autoPublish,
          }),
        );
        executionResults.push(result);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                date: params.date,
                objective,
                executedCount: executionResults.length,
                results: executionResults,
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

export const runDailyPlanTool = createRunDailyPlanTool();
