import { randomUUID } from 'crypto';

import { Type } from '@sinclair/typebox';

import { buildCopySeed, buildPlanReason, summarizeContentPerformance } from '../lib/planning.js';
import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { getHourPerformance, getPostPerformanceRows, initStore, savePlannedPost } from '../lib/store.js';
import type {
  ContentVariant,
  PlanningObjective,
  Platform,
  PostPerformanceRow,
  ScheduleStrategy,
} from '../lib/types.js';

interface CandidateSchedule {
  scheduledFor: string;
  hour: number;
  strategy: ScheduleStrategy;
  confidence: number;
}

function uniqueSortedHours(hours: number[]): number[] {
  return [...new Set(hours)].sort((left, right) => left - right);
}

function chooseCandidateSchedule(options: {
  platform: Platform;
  after: Date;
  withinDays: number;
  preferredHours: number[];
  fallbackHours: number[];
  objective: PlanningObjective;
}): CandidateSchedule {
  const afterTime = options.after.getTime();
  const hours = uniqueSortedHours([...options.preferredHours, ...options.fallbackHours, 18]);

  let bestCandidate: CandidateSchedule | null = null;
  for (let dayOffset = 0; dayOffset <= options.withinDays; dayOffset += 1) {
    const date = new Date(Date.UTC(
      options.after.getUTCFullYear(),
      options.after.getUTCMonth(),
      options.after.getUTCDate() + dayOffset,
      0,
      0,
      0,
      0,
    ));

    for (const [index, hour] of hours.entries()) {
      const candidate = new Date(date.getTime());
      candidate.setUTCHours(hour, 0, 0, 0);
      if (candidate.getTime() <= afterTime) {
        continue;
      }

      const isPreferred = options.preferredHours.includes(hour);
      const isFallbackPreferred = !isPreferred && options.fallbackHours.includes(hour);
      const confidenceBase = isPreferred ? 0.82 : isFallbackPreferred ? 0.68 : 0.38;
      const confidence = Number(
        Math.max(0.1, confidenceBase - dayOffset * 0.03 - index * 0.02).toFixed(2),
      );
      const strategy: ScheduleStrategy = isPreferred || isFallbackPreferred ? 'optimized' : 'exploration';
      const current: CandidateSchedule = {
        scheduledFor: candidate.toISOString(),
        hour,
        strategy,
        confidence,
      };

      if (!bestCandidate) {
        bestCandidate = current;
        continue;
      }

      if (current.confidence > bestCandidate.confidence) {
        bestCandidate = current;
      }
    }
  }

  return (
    bestCandidate ?? {
      scheduledFor: new Date(afterTime + 60 * 60 * 1000).toISOString(),
      hour: new Date(afterTime + 60 * 60 * 1000).getUTCHours(),
      strategy: 'manual',
      confidence: 0.2,
    }
  );
}

function fallbackReference(platform: Platform): Pick<PostPerformanceRow, 'hookText' | 'caption'> {
  return {
    hookText: `Open with a fast, direct hook tailored for ${platform}.`,
    caption: `Keep the caption short, outcome-driven, and explicit about the next action.`,
  };
}

export function createPlanNextPostTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'plan_next_post',
    description:
      'Choose the next best post opportunity using recent metrics, conversions, and hour performance, then persist it as a planned post.',
    parameters: Type.Object({
      platform: Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
        Type.Literal('all'),
      ], { default: 'all' }),
      objective: Type.Optional(
        Type.Union([
          Type.Literal('conversions'),
          Type.Literal('revenue'),
          Type.Literal('engagement'),
        ], { default: 'conversions' }),
      ),
      after: Type.Optional(Type.String({ description: 'ISO timestamp to plan after.' })),
      withinDays: Type.Optional(Type.Number({ minimum: 0, maximum: 30, default: 7 })),
      daysBack: Type.Optional(Type.Number({ minimum: 1, maximum: 180, default: 30 })),
      contentType: Type.Optional(Type.String({ description: 'Optional forced content type.' })),
    }),
    async execute(
      _id: string,
      params: {
        platform: Platform | 'all';
        objective?: PlanningObjective;
        after?: string;
        withinDays?: number;
        daysBack?: number;
        contentType?: ContentVariant;
      },
    ) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      const platforms: Platform[] =
        params.platform === 'all' ? ['tiktok', 'instagram'] : [params.platform];
      const objective = params.objective ?? 'conversions';
      const after = params.after ? new Date(params.after) : new Date();

      if (Number.isNaN(after.getTime())) {
        throw new Error(`Invalid after timestamp: ${params.after}`);
      }

      const withinDays = params.withinDays ?? 7;
      const daysBack = params.daysBack ?? 30;
      const plans = [];

      for (const platform of platforms) {
        const rows = getPostPerformanceRows(store, { platform, daysBack });
        const contentSummaries = summarizeContentPerformance(rows, objective);
        const chosenSummary = params.contentType
          ? contentSummaries.find((summary) => summary.contentType === params.contentType)
          : contentSummaries[0];
        const bestReference = chosenSummary?.referencePosts[0];

        const dayOfWeek = after.getUTCDay();
        const preferredHours = getHourPerformance(store, platform, { dayOfWeek })
          .slice(0, 3)
          .map((row) => row.hour);
        const fallbackHours = getHourPerformance(store, platform)
          .slice(0, 5)
          .map((row) => row.hour);

        const schedule = chooseCandidateSchedule({
          platform,
          after,
          withinDays,
          preferredHours,
          fallbackHours,
          objective,
        });
        const contentType = params.contentType ?? chosenSummary?.contentType ?? 'hook_reveal';
        const copy = buildCopySeed({
          platform,
          objective,
          contentType,
          referencePost: bestReference,
          scheduleStrategy: schedule.strategy,
          scheduledHour: schedule.hour,
        });
        const reason = buildPlanReason({
          objective,
          contentSummary: chosenSummary,
          scheduledHour: schedule.hour,
          scheduleStrategy: schedule.strategy,
          platform,
        });
        const sourcePostIds = chosenSummary?.referencePosts.map((row) => row.id) ?? [];
        const planned = savePlannedPost(store, {
          id: randomUUID(),
          platform,
          scheduledFor: schedule.scheduledFor,
          contentType,
          scheduleStrategy: schedule.strategy,
          confidence: schedule.confidence,
          reason,
          hookText: copy.hookText || fallbackReference(platform).hookText,
          caption: copy.caption || fallbackReference(platform).caption,
          objective,
          sourcePostIds,
          status: 'planned',
          metadata: {
            preferredHours,
            fallbackHours,
            sampleSize: rows.length,
            chosenContentTypeScore: chosenSummary?.averageScore,
          },
        });

        plans.push({
          ...planned,
          evidence: {
            referencePostId: bestReference?.id,
            sampleSize: rows.length,
            topContentTypes: contentSummaries.slice(0, 3).map((summary) => ({
              contentType: summary.contentType,
              averageScore: summary.averageScore,
              averageConversions: summary.averageConversions,
              averageRevenue: summary.averageRevenue,
            })),
          },
        });
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                objective,
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

export const planNextPostTool = createPlanNextPostTool();
