import { randomUUID } from 'crypto';

import { Type } from '@sinclair/typebox';

import { buildCopySeed, buildPlanReason, summarizeContentPerformance } from '../lib/planning.js';
import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { getPostPerformanceRows, initStore, savePlannedPost } from '../lib/store.js';
import { createGenerateScheduleTool } from './generate-schedule.js';
import type { ContentVariant, PlanningObjective, Platform } from '../lib/types.js';

export function createBuildDailyPlanTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'build_daily_plan',
    description:
      'Create a full day of planned posts by combining optimized schedule windows with conversion-aware content selection.',
    parameters: Type.Object({
      date: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
      platform: Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
        Type.Literal('all'),
      ], { default: 'all' }),
      postCount: Type.Number({ minimum: 1, maximum: 96 }),
      objective: Type.Optional(
        Type.Union([
          Type.Literal('conversions'),
          Type.Literal('revenue'),
          Type.Literal('engagement'),
        ], { default: 'conversions' }),
      ),
      daysBack: Type.Optional(Type.Number({ minimum: 1, maximum: 180, default: 30 })),
      explorationRate: Type.Optional(Type.Number({ minimum: 0, maximum: 0.3, default: 0.1 })),
      minGapMinutes: Type.Optional(Type.Number({ minimum: 5, maximum: 240, default: 30 })),
      activeHoursStart: Type.Optional(Type.Number({ minimum: 0, maximum: 23, default: 6 })),
      activeHoursEnd: Type.Optional(Type.Number({ minimum: 0, maximum: 23, default: 23 })),
      defaultContentType: Type.Optional(Type.String({ description: 'Fallback content type when history is thin.' })),
    }),
    async execute(
      _id: string,
      params: {
        date: string;
        platform: Platform | 'all';
        postCount: number;
        objective?: PlanningObjective;
        daysBack?: number;
        explorationRate?: number;
        minGapMinutes?: number;
        activeHoursStart?: number;
        activeHoursEnd?: number;
        defaultContentType?: ContentVariant;
      },
    ) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      const scheduleTool = createGenerateScheduleTool(configOverrides);
      const objective = params.objective ?? 'conversions';
      const daysBack = params.daysBack ?? 30;
      const scheduleResult = await scheduleTool.execute('build-daily-plan', {
        postCount: params.postCount,
        date: params.date,
        platform: params.platform,
        explorationRate: params.explorationRate,
        minGapMinutes: params.minGapMinutes,
        activeHoursStart: params.activeHoursStart,
        activeHoursEnd: params.activeHoursEnd,
      });
      const schedulePayload = JSON.parse(scheduleResult.content[0].text) as {
        schedules: Record<
          string,
          { slots: Array<{ time: string; hour: number; confidence: number; reason: string }> }
        >;
      };
      const platforms: Platform[] =
        params.platform === 'all' ? ['tiktok', 'instagram'] : [params.platform];
      const plans = [];

      for (const platform of platforms) {
        const rows = getPostPerformanceRows(store, { platform, daysBack });
        const contentSummaries = summarizeContentPerformance(rows, objective);
        const slots = schedulePayload.schedules[platform]?.slots ?? [];
        const fallbackContentType =
          params.defaultContentType ?? contentSummaries[0]?.contentType ?? 'hook_reveal';

        for (const [index, slot] of slots.entries()) {
          const strategy = slot.confidence <= 0.15 ? 'exploration' : 'optimized';
          const contentSummary =
            strategy === 'exploration'
              ? contentSummaries[Math.min(1, Math.max(contentSummaries.length - 1, 0))] ??
                contentSummaries[0]
              : contentSummaries[index % Math.max(contentSummaries.length, 1)];
          const contentType = contentSummary?.contentType ?? fallbackContentType;
          const referencePost = contentSummary?.referencePosts[0];
          const copy = buildCopySeed({
            platform,
            objective,
            contentType,
            referencePost,
            scheduleStrategy: strategy,
            scheduledHour: slot.hour,
          });
          const reason = buildPlanReason({
            objective,
            contentSummary,
            scheduledHour: slot.hour,
            scheduleStrategy: strategy,
            platform,
          });

          const planned = savePlannedPost(store, {
            id: randomUUID(),
            platform,
            scheduledFor: slot.time,
            contentType,
            scheduleStrategy: strategy,
            confidence: slot.confidence,
            reason,
            hookText: copy.hookText,
            caption: copy.caption,
            objective,
            sourcePostIds: contentSummary?.referencePosts.map((row) => row.id) ?? [],
            status: 'planned',
            metadata: {
              scheduleReason: slot.reason,
              sampleSize: rows.length,
              slotIndex: index,
            },
          });

          plans.push(planned);
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                objective,
                date: params.date,
                plannedCount: plans.length,
                plans,
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

export const buildDailyPlanTool = createBuildDailyPlanTool();
