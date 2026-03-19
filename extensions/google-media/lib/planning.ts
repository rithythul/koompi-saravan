import type {
  ContentVariant,
  PlanningObjective,
  Platform,
  PostPerformanceRow,
  ScheduleStrategy,
} from './types.js';

export interface ContentPerformanceSummary {
  contentType: ContentVariant;
  sampleSize: number;
  averageScore: number;
  averageViews: number;
  averageConversions: number;
  averageRevenue: number;
  averageEngagementRate: number;
  averageCompletionRate: number;
  referencePosts: PostPerformanceRow[];
}

export interface PlannedCopySeed {
  hookText: string;
  caption: string;
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

export function scorePostPerformance(
  row: PostPerformanceRow,
  objective: PlanningObjective,
): number {
  const impressionsBase = Math.max(row.impressions, row.views, 1);
  const engagementRate = safeRate(row.likes + row.comments + row.shares + row.saves, Math.max(row.views, 1));
  const conversionRatePerThousand = safeRate(row.conversionCount * 1000, impressionsBase);
  const revenuePerThousand = safeRate(row.revenue * 1000, impressionsBase);
  const completion = row.completionRate ?? 0;
  const viewsPerThousand = row.views / 1000;

  if (objective === 'revenue') {
    return Number((revenuePerThousand * 0.55 + conversionRatePerThousand * 10 + engagementRate * 25 + completion * 10).toFixed(4));
  }

  if (objective === 'engagement') {
    return Number((viewsPerThousand * 0.3 + engagementRate * 55 + completion * 20 + conversionRatePerThousand * 5).toFixed(4));
  }

  return Number((conversionRatePerThousand * 12 + revenuePerThousand * 0.25 + engagementRate * 25 + completion * 10).toFixed(4));
}

export function summarizeContentPerformance(
  rows: PostPerformanceRow[],
  objective: PlanningObjective,
): ContentPerformanceSummary[] {
  const buckets = new Map<ContentVariant, PostPerformanceRow[]>();

  for (const row of rows) {
    const bucket = buckets.get(row.contentType) ?? [];
    bucket.push(row);
    buckets.set(row.contentType, bucket);
  }

  return Array.from(buckets.entries())
    .map(([contentType, bucket]) => {
      const scoredRows = [...bucket]
        .map((row) => ({ row, score: scorePostPerformance(row, objective) }))
        .sort((left, right) => right.score - left.score);
      const sampleSize = bucket.length;
      const totals = bucket.reduce(
        (accumulator, row) => {
          accumulator.views += row.views;
          accumulator.conversions += row.conversionCount;
          accumulator.revenue += row.revenue;
          accumulator.engagementRate += safeRate(
            row.likes + row.comments + row.shares + row.saves,
            Math.max(row.views, 1),
          );
          accumulator.completionRate += row.completionRate ?? 0;
          return accumulator;
        },
        {
          views: 0,
          conversions: 0,
          revenue: 0,
          engagementRate: 0,
          completionRate: 0,
        },
      );

      return {
        contentType,
        sampleSize,
        averageScore: Number(
          (
            scoredRows.reduce((sum, entry) => sum + entry.score, 0) /
            Math.max(sampleSize, 1)
          ).toFixed(4),
        ),
        averageViews: Math.round(totals.views / Math.max(sampleSize, 1)),
        averageConversions: Number(
          (totals.conversions / Math.max(sampleSize, 1)).toFixed(2),
        ),
        averageRevenue: Number((totals.revenue / Math.max(sampleSize, 1)).toFixed(2)),
        averageEngagementRate: Number(
          (totals.engagementRate / Math.max(sampleSize, 1)).toFixed(4),
        ),
        averageCompletionRate: Number(
          (totals.completionRate / Math.max(sampleSize, 1)).toFixed(4),
        ),
        referencePosts: scoredRows.slice(0, 3).map((entry) => entry.row),
      };
    })
    .sort((left, right) => right.averageScore - left.averageScore);
}

export function buildCopySeed(options: {
  platform: Platform;
  objective: PlanningObjective;
  contentType: ContentVariant;
  referencePost?: PostPerformanceRow;
  scheduleStrategy: ScheduleStrategy;
  scheduledHour: number;
}): PlannedCopySeed {
  const reference = options.referencePost;

  const hookText =
    reference?.hookText?.trim() ||
    `Lead with a ${options.contentType.replace(/_/g, ' ')} angle tuned for ${options.platform} around ${String(options.scheduledHour).padStart(2, '0')}:00 UTC.`;

  const caption =
    reference?.caption?.trim() ||
    `Publish a ${options.contentType.replace(/_/g, ' ')} post optimized for ${options.objective}, with a clear CTA and concise hook.`;

  return {
    hookText,
    caption:
      options.scheduleStrategy === 'exploration'
        ? `${caption} This slot is exploratory, so keep the creative novel but measurable.`
        : caption,
  };
}

export function buildPlanReason(options: {
  objective: PlanningObjective;
  contentSummary?: ContentPerformanceSummary;
  scheduledHour: number;
  scheduleStrategy: ScheduleStrategy;
  platform: Platform;
}): string {
  const contentClause = options.contentSummary
    ? `${options.contentSummary.contentType} leads recent ${options.objective} performance with score ${options.contentSummary.averageScore.toFixed(2)}`
    : 'using the default content type because historical content performance is limited';

  const scheduleClause =
    options.scheduleStrategy === 'exploration'
      ? `this is an exploration slot at ${String(options.scheduledHour).padStart(2, '0')}:00 UTC to discover new ${options.platform} demand windows`
      : `this slot exploits a proven ${options.platform} posting window around ${String(options.scheduledHour).padStart(2, '0')}:00 UTC`;

  return `${contentClause}; ${scheduleClause}.`;
}
