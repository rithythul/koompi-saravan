import { Type } from '@sinclair/typebox';

import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { getHourPerformance, initStore } from '../lib/store.js';
import type { HourPerformance, OptimizedSchedule, Platform } from '../lib/types.js';

interface GenerateScheduleDependencies {
  random?: () => number;
  now?: () => Date;
}

interface CandidateSlot {
  time: string;
  hour: number;
  score: number;
}

function buildHourScoreMap(
  overallRows: HourPerformance[],
  dayRows: HourPerformance[],
  activeHours: number[],
): Map<number, number> {
  const overallByHour = new Map(overallRows.map((row) => [row.hour, row.performanceScore]));
  const dayByHour = new Map(dayRows.map((row) => [row.hour, row.performanceScore]));
  const scores = new Map<number, number>();

  for (const hour of activeHours) {
    scores.set(hour, dayByHour.get(hour) ?? overallByHour.get(hour) ?? 50);
  }

  return scores;
}

function reasonForScore(score: number): string {
  if (score >= 80) {
    return 'High-performing hour backed by strong historical results';
  }

  if (score >= 60) {
    return 'Solid historical performance with room to keep exploiting';
  }

  return 'Limited signal for this hour, so confidence is moderate';
}

export function createGenerateScheduleTool(
  configOverrides: GoogleMediaConfigInput = {},
  dependencies: GenerateScheduleDependencies = {},
) {
  const random = dependencies.random ?? Math.random;
  const now = dependencies.now ?? (() => new Date());

  return {
    name: 'generate_optimized_schedule',
    description:
      'Generate an exploitation-plus-exploration posting plan using historical hour performance for TikTok and Instagram.',
    parameters: Type.Object({
      postCount: Type.Number({
        minimum: 1,
        maximum: 96,
        description: 'Number of posts to schedule for the selected date.',
      }),
      date: Type.String({
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'UTC date to schedule in YYYY-MM-DD format.',
      }),
      platform: Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
        Type.Literal('all'),
      ], {
        default: 'all',
        description: 'Platform to schedule.',
      }),
      explorationRate: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 0.3,
          default: 0.1,
          description: 'Share of slots reserved for exploration.',
        }),
      ),
      minGapMinutes: Type.Optional(
        Type.Number({
          minimum: 5,
          maximum: 240,
          default: 30,
          description: 'Minimum spacing between scheduled posts.',
        }),
      ),
      activeHoursStart: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 23,
          default: 6,
        }),
      ),
      activeHoursEnd: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 23,
          default: 23,
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        postCount: number;
        date: string;
        platform: Platform | 'all';
        explorationRate?: number;
        minGapMinutes?: number;
        activeHoursStart?: number;
        activeHoursEnd?: number;
      },
    ) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      const platforms: Platform[] = params.platform === 'all' ? ['tiktok', 'instagram'] : [params.platform];
      const explorationRate = params.explorationRate ?? 0.1;
      const minGapMinutes = params.minGapMinutes ?? 30;
      const activeStart = params.activeHoursStart ?? 6;
      const activeEnd = params.activeHoursEnd ?? 23;

      if (activeStart > activeEnd) {
        throw new Error('activeHoursStart must be less than or equal to activeHoursEnd.');
      }

      const dateStart = new Date(`${params.date}T00:00:00.000Z`);
      if (Number.isNaN(dateStart.getTime())) {
        throw new Error(`Invalid schedule date: ${params.date}`);
      }

      const activeHours = Array.from(
        { length: activeEnd - activeStart + 1 },
        (_, index) => activeStart + index,
      );
      const scheduleEnd = new Date(
        `${params.date}T${String(activeEnd).padStart(2, '0')}:59:59.999Z`,
      );
      const candidateSlots: CandidateSlot[] = [];
      const minGapMs = minGapMinutes * 60 * 1000;

      for (
        let timestamp = new Date(
          `${params.date}T${String(activeStart).padStart(2, '0')}:00:00.000Z`,
        ).getTime();
        timestamp <= scheduleEnd.getTime();
        timestamp += minGapMs
      ) {
        const candidateDate = new Date(timestamp);
        const hour = candidateDate.getUTCHours();
        if (hour >= activeStart && hour <= activeEnd) {
          candidateSlots.push({
            time: candidateDate.toISOString(),
            hour,
            score: 50,
          });
        }
      }

      if (params.postCount > candidateSlots.length) {
        throw new Error(
          `Requested ${params.postCount} posts but only ${candidateSlots.length} slots fit inside the active window with a ${minGapMinutes}-minute gap.`,
        );
      }

      const dayOfWeek = dateStart.getUTCDay();
      const schedules: Record<
        string,
        OptimizedSchedule & { totalSlots: number; exploitationSlots: number }
      > = {};

      for (const platform of platforms) {
        const overallRows = getHourPerformance(store, platform);
        const dayRows = getHourPerformance(store, platform, { dayOfWeek });
        const hourScores = buildHourScoreMap(overallRows, dayRows, activeHours);
        const scoredCandidates = candidateSlots.map((candidate) => ({
          ...candidate,
          score: Number((hourScores.get(candidate.hour) ?? 50).toFixed(2)),
        }));

        const explorationCount = Math.ceil(params.postCount * explorationRate);
        const exploitationCount = params.postCount - explorationCount;
        const exploitation = [...scoredCandidates]
          .sort((left, right) => {
            if (right.score !== left.score) {
              return right.score - left.score;
            }

            return left.time.localeCompare(right.time);
          })
          .slice(0, exploitationCount);
        const exploitationTimes = new Set(exploitation.map((slot) => slot.time));
        const explorationPool = scoredCandidates.filter(
          (slot) => !exploitationTimes.has(slot.time),
        );
        const exploration = [...explorationPool]
          .map((slot) => ({ slot, order: random() }))
          .sort((left, right) => left.order - right.order)
          .slice(0, explorationCount)
          .map(({ slot }) => slot);

        const allSlots = [
          ...exploitation.map((slot) => ({
            time: slot.time,
            hour: slot.hour,
            confidence: Number((slot.score / 100).toFixed(2)),
            reason: reasonForScore(slot.score),
            type: 'exploitation' as const,
          })),
          ...exploration.map((slot) => ({
            time: slot.time,
            hour: slot.hour,
            confidence: 0.1,
            reason: 'Exploration slot to test a less-certain audience window',
            type: 'exploration' as const,
          })),
        ].sort((left, right) => left.time.localeCompare(right.time));

        schedules[platform] = {
          platform,
          date: params.date,
          slots: allSlots.map(({ time, hour, confidence, reason }) => ({
            time,
            hour,
            confidence,
            reason,
          })),
          explorationSlots: exploration.map(({ time, hour }) => ({
            time,
            hour,
            reason: 'Exploration slot to collect new performance data',
          })),
          generatedAt: now().toISOString(),
          totalSlots: allSlots.length,
          exploitationSlots: exploitation.length,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                schedules,
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

export const generateScheduleTool = createGenerateScheduleTool();
