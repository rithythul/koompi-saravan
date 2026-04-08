import { Type } from '@sinclair/typebox';

import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { getGeminiClient } from '../lib/gemini-client.js';
import { getPostsMetricsJoined, initStore } from '../lib/store.js';
import type { Platform, PostingInsights, PostWithLatestMetric } from '../lib/types.js';

interface AnalyzePatternsDependencies {
  generateRecommendations?: (input: {
    platform: Platform;
    topHours: PostingInsights['topHours'];
    bottomHours: PostingInsights['bottomHours'];
    bestDayOfWeek?: PostingInsights['bestDayOfWeek'];
    analyzedPosts: number;
  }) => Promise<string[]>;
}

function aggregateDayPerformance(rows: PostWithLatestMetric[]): PostingInsights['bestDayOfWeek'] {
  const buckets = new Map<number, { totalViews: number; posts: number }>();

  for (const row of rows) {
    const day = new Date(row.postedAt).getUTCDay();
    const current = buckets.get(day) ?? { totalViews: 0, posts: 0 };
    current.totalViews += row.views;
    current.posts += 1;
    buckets.set(day, current);
  }

  const best = Array.from(buckets.entries())
    .map(([day, bucket]) => ({
      day,
      avgViews: Math.round(bucket.totalViews / Math.max(bucket.posts, 1)),
    }))
    .sort((left, right) => right.avgViews - left.avgViews)[0];

  return best;
}

function buildHeuristicRecommendations(input: {
  platform: Platform;
  topHours: PostingInsights['topHours'];
  bottomHours: PostingInsights['bottomHours'];
  bestDayOfWeek?: PostingInsights['bestDayOfWeek'];
  analyzedPosts: number;
}): string[] {
  const recommendations: string[] = [];
  const bestHours = input.topHours.slice(0, 2).map((entry) => `${entry.hour}:00 UTC`);
  const weakestHours = input.bottomHours.slice(0, 2).map((entry) => `${entry.hour}:00 UTC`);

  if (bestHours.length > 0) {
    recommendations.push(
      `Prioritize ${input.platform} posts around ${bestHours.join(' and ')} because those windows lead on average views.`,
    );
  }

  if (input.bestDayOfWeek) {
    recommendations.push(
      `Bias higher-value ${input.platform} posts toward weekday index ${input.bestDayOfWeek.day} until more day-specific data disproves it.`,
    );
  }

  if (weakestHours.length > 0) {
    recommendations.push(
      `Reduce routine posting around ${weakestHours.join(' and ')} unless you are explicitly exploring new audience windows.`,
    );
  }

  recommendations.push(
    `Keep roughly 10% exploration slots because ${input.analyzedPosts} posts is enough to optimize, but not enough to stop learning.`,
  );

  return recommendations.slice(0, 5);
}

async function generateGeminiRecommendations(input: {
  config: GoogleMediaConfigInput;
  platform: Platform;
  topHours: PostingInsights['topHours'];
  bottomHours: PostingInsights['bottomHours'];
  bestDayOfWeek?: PostingInsights['bestDayOfWeek'];
  analyzedPosts: number;
}): Promise<string[]> {
  const client = getGeminiClient(input.config);
  const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const prompt = `You are a social media strategist optimizing short-form video distribution.

Platform: ${input.platform}
Analyzed posts: ${input.analyzedPosts}
Top hours:
${input.topHours.map((entry) => `- ${entry.hour}:00 UTC | ${entry.avgViews} avg views | ${entry.avgEngagement} avg engagement | ${entry.postCount} posts`).join('\n')}

Bottom hours:
${input.bottomHours.map((entry) => `- ${entry.hour}:00 UTC | ${entry.avgViews} avg views | ${entry.avgEngagement} avg engagement | ${entry.postCount} posts`).join('\n')}

${input.bestDayOfWeek ? `Best day of week: ${input.bestDayOfWeek.day} with ${input.bestDayOfWeek.avgViews} avg views\n` : ''}

Return a JSON array of 3 to 5 short recommendations. Mention specific hours when useful.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\[[\s\S]*\]/);

  if (!jsonMatch) {
    return [text.trim()].filter(Boolean);
  }

  const parsed = JSON.parse(jsonMatch[0]) as unknown;
  if (!Array.isArray(parsed)) {
    return [text.trim()].filter(Boolean);
  }

  return parsed.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
  );
}

export function createAnalyzePatternsTool(
  configOverrides: GoogleMediaConfigInput = {},
  dependencies: AnalyzePatternsDependencies = {},
) {
  const recommendationGenerator = dependencies.generateRecommendations;

  return {
    name: 'analyze_posting_patterns',
    description:
      'Analyze recent post performance, identify strong and weak posting windows, and return scheduling guidance for the next batch.',
    parameters: Type.Object({
      platform: Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
        Type.Literal('all'),
      ], {
        default: 'all',
        description: 'Which platform to analyze.',
      }),
      daysBack: Type.Optional(
        Type.Number({
          minimum: 1,
          maximum: 90,
          default: 7,
          description: 'Lookback window for historical analysis.',
        }),
      ),
      minPosts: Type.Optional(
        Type.Number({
          minimum: 1,
          maximum: 1000,
          default: 20,
          description: 'Minimum number of posts required before analysis is considered reliable.',
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        platform: Platform | 'all';
        daysBack?: number;
        minPosts?: number;
      },
    ) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      const platforms: Platform[] =
        params.platform === 'all' ? ['tiktok', 'instagram'] : [params.platform];
      const insights: Array<
        | { platform: Platform; status: 'insufficient_data'; message: string; postsFound: number }
        | ({ status: 'success'; recommendationSource: 'gemini' | 'heuristic' } & PostingInsights)
      > = [];
      const daysBack = params.daysBack ?? 7;
      const minPosts = params.minPosts ?? 20;

      for (const platform of platforms) {
        const rows = getPostsMetricsJoined(store, {
          platform,
          daysBack,
        });

        if (rows.length < minPosts) {
          insights.push({
            platform,
            status: 'insufficient_data',
            message: `Only ${rows.length} posts found. Need ${minPosts}+ for reliable analysis.`,
            postsFound: rows.length,
          });
          continue;
        }

        const hourBuckets = new Map<
          number,
          { posts: number; totalViews: number; totalEngagement: number }
        >();
        for (const row of rows) {
          const current = hourBuckets.get(row.scheduledHour) ?? {
            posts: 0,
            totalViews: 0,
            totalEngagement: 0,
          };
          current.posts += 1;
          current.totalViews += row.views;
          current.totalEngagement += row.likes + row.comments + row.shares + row.saves;
          hourBuckets.set(row.scheduledHour, current);
        }

        const hourStats = Array.from(hourBuckets.entries())
          .map(([hour, bucket]) => ({
            hour,
            avgViews: Math.round(bucket.totalViews / Math.max(bucket.posts, 1)),
            avgEngagement: Number(
              (bucket.totalEngagement / Math.max(bucket.posts, 1)).toFixed(1),
            ),
            postCount: bucket.posts,
          }))
          .sort((left, right) => right.avgViews - left.avgViews);

        const topHours = hourStats.slice(0, 5);
        const bottomHours = hourStats.slice(-5).reverse();
        const bestDayOfWeek = aggregateDayPerformance(rows);

        let recommendations: string[];
        let recommendationSource: 'gemini' | 'heuristic' = 'heuristic';

        try {
          if (recommendationGenerator) {
            recommendations = await recommendationGenerator({
              platform,
              topHours,
              bottomHours,
              bestDayOfWeek,
              analyzedPosts: rows.length,
            });
          } else if (config.geminiApiKey) {
            recommendations = await generateGeminiRecommendations({
              config,
              platform,
              topHours,
              bottomHours,
              bestDayOfWeek,
              analyzedPosts: rows.length,
            });
            recommendationSource = 'gemini';
          } else {
            recommendations = buildHeuristicRecommendations({
              platform,
              topHours,
              bottomHours,
              bestDayOfWeek,
              analyzedPosts: rows.length,
            });
          }
        } catch {
          recommendations = buildHeuristicRecommendations({
            platform,
            topHours,
            bottomHours,
            bestDayOfWeek,
            analyzedPosts: rows.length,
          });
          recommendationSource = 'heuristic';
        }

        insights.push({
          platform,
          status: 'success',
          recommendationSource,
          analyzedPosts: rows.length,
          dateRange: {
            from: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString(),
            to: new Date().toISOString(),
          },
          topHours,
          bottomHours,
          bestDayOfWeek,
          recommendations,
        });
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                insights,
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

export const analyzePatternsTool = createAnalyzePatternsTool();
