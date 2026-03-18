# Saravan Media - Data-Driven Posting System

## Development Prompt Guide for Dev Team

This document guides development of the learning-based posting system. The goal: **post at optimal times based on historical performance data, not fixed schedules.**

---

## Overview

### The Problem
- Fixed schedules (e.g., "every 30 minutes") ignore audience behavior
- Posting at wrong times = wasted content
- No feedback loop to improve over time

### The Solution
- Log every post with metadata
- Pull analytics from TikTok/IG APIs
- Analyze patterns with Gemini
- Generate optimized schedules dynamically
- Learn and improve continuously

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OPENCLAW ORCHESTRATION                    │
│                                                                  │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐              │
│  │ HOURLY JOB │   │ DAILY JOB  │   │ ON-DEMAND  │              │
│  │ Pull stats │   │ Plan day   │   │ Manual run │              │
│  └─────┬──────┘   └─────┬──────┘   └─────┬──────┘              │
│        │                │                │                      │
│        └────────────────┼────────────────┘                      │
│                         ▼                                       │
│              ┌─────────────────────┐                           │
│              │   GOOGLE-MEDIA      │                           │
│              │   PLUGIN TOOLS      │                           │
│              │                     │                           │
│              │  • nano_banana      │                           │
│              │  • render_*         │                           │
│              │  • analyze_patterns │ ◄── NEW                   │
│              │  • generate_schedule│ ◄── NEW                   │
│              │  • pull_analytics   │ ◄── NEW                   │
│              │  • log_post         │ ◄── NEW                   │
│              └──────────┬──────────┘                           │
│                         │                                       │
└─────────────────────────┼───────────────────────────────────────┘
                          ▼
              ┌─────────────────────┐
              │      SQLITE DB      │
              │                     │
              │  • posts            │
              │  • post_metrics     │
              │  • hour_performance │
              │  • content_runs     │ (existing)
              └─────────────────────┘
```

---

## Database Schema

### Migration File: `002_posts_and_analytics.sql`

Create file: `extensions/google-media/lib/migrations/002_posts_and_analytics.sql`

```sql
-- Posts: track what was published, when, and with what content
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  
  -- Platform info
  platform TEXT NOT NULL,              -- 'tiktok' | 'instagram'
  platform_post_id TEXT,               -- ID returned by platform API
  posted_at DATETIME NOT NULL,
  
  -- Content info
  content_type TEXT NOT NULL,          -- 'hook_reveal' | 'slideshow_caption' | etc
  video_path TEXT NOT NULL,
  
  -- Text content
  hook_text TEXT,
  caption TEXT,
  hashtags TEXT,                       -- JSON array
  
  -- Scheduling metadata
  scheduled_by TEXT NOT NULL,          -- 'optimized' | 'exploration' | 'manual'
  confidence_score REAL,               -- 0.0-1.0, how confident was the scheduler
  scheduled_hour INTEGER,              -- 0-23, for quick queries
  
  -- Link to internal tracking
  run_id TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (run_id) REFERENCES content_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON posts(posted_at);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_hour ON posts(scheduled_hour);

-- Post Metrics: engagement data pulled from platform APIs
CREATE TABLE IF NOT EXISTS post_metrics (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  pulled_at DATETIME NOT NULL,
  
  -- Engagement metrics
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  
  -- Retention metrics
  completion_rate REAL,                -- 0.0-1.0
  avg_watch_time_seconds REAL,
  
  -- Reach metrics
  reach INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  
  -- Platform-specific
  platform_data TEXT,                  -- JSON blob for extra fields
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (post_id) REFERENCES posts(id)
);

CREATE INDEX IF NOT EXISTS idx_post_metrics_post_id ON post_metrics(post_id);
CREATE INDEX IF NOT EXISTS idx_post_metrics_pulled_at ON post_metrics(pulled_at);

-- Hour Performance: pre-aggregated for fast queries
CREATE TABLE IF NOT EXISTS hour_performance (
  id TEXT PRIMARY KEY,
  
  -- Dimensions
  platform TEXT NOT NULL,
  hour INTEGER NOT NULL,               -- 0-23
  day_of_week INTEGER,                 -- 0-6 (null = any day)
  
  -- Aggregated metrics
  post_count INTEGER DEFAULT 0,
  total_views INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_shares INTEGER DEFAULT 0,
  total_saves INTEGER DEFAULT 0,
  
  -- Computed averages
  avg_views REAL DEFAULT 0,
  avg_engagement_rate REAL DEFAULT 0,  -- (likes+comments+shares+saves) / views
  avg_completion_rate REAL DEFAULT 0,
  
  -- Score for ranking (0-100)
  performance_score REAL DEFAULT 0,
  
  -- Metadata
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(platform, hour, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_hour_performance_score ON hour_performance(performance_score DESC);
```

### TypeScript Types: `extensions/google-media/lib/types.ts`

Add to existing file:

```typescript
// === POSTS ===

export type Platform = 'tiktok' | 'instagram';
export type ContentVariant = 'hook_reveal' | 'slideshow_caption' | 'quote_card' | 'countdown_list';
export type ScheduleStrategy = 'optimized' | 'exploration' | 'manual';

export interface Post {
  id: string;
  platform: Platform;
  platformPostId?: string;
  postedAt: string; // ISO timestamp
  contentType: ContentVariant;
  videoPath: string;
  hookText?: string;
  caption?: string;
  hashtags?: string[];
  scheduledBy: ScheduleStrategy;
  confidenceScore?: number;
  scheduledHour: number;
  runId?: string;
  createdAt: string;
}

export interface PostMetric {
  id: string;
  postId: string;
  pulledAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  completionRate?: number;
  avgWatchTimeSeconds?: number;
  reach: number;
  impressions: number;
  platformData?: Record<string, unknown>;
  createdAt: string;
}

export interface HourPerformance {
  id: string;
  platform: Platform;
  hour: number;
  dayOfWeek?: number;
  postCount: number;
  totalViews: number;
  avgViews: number;
  avgEngagementRate: number;
  avgCompletionRate: number;
  performanceScore: number;
  lastUpdated: string;
}

// === ANALYTICS ===

export interface PostingInsights {
  platform: Platform;
  analyzedPosts: number;
  dateRange: {
    from: string;
    to: string;
  };
  topHours: Array<{
    hour: number;
    avgViews: number;
    avgEngagement: number;
    postCount: number;
  }>;
  bottomHours: Array<{
    hour: number;
    avgViews: number;
    avgEngagement: number;
    postCount: number;
  }>;
  bestDayOfWeek?: {
    day: number;
    avgViews: number;
  };
  recommendations: string[];
}

export interface OptimizedSchedule {
  platform: Platform;
  date: string;
  slots: Array<{
    time: string;           // ISO timestamp
    hour: number;
    confidence: number;     // 0.0-1.0
    reason: string;
  }>;
  explorationSlots: Array<{
    time: string;
    hour: number;
    reason: string;
  }>;
  generatedAt: string;
}
```

---

## Tool Implementations

### Tool 1: `log_post`

**File**: `extensions/google-media/tools/log-post.ts`

**Purpose**: Record a post in the database when publishing

```typescript
import { Type } from '@sinclair/typebox';
import { initStore, savePost } from '../lib/store.js';
import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';

export function createLogPostTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'log_post',
    description: 'Record a published post in the tracking database. Call this after successfully posting to TikTok or Instagram.',
    parameters: Type.Object({
      platform: Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
      ], { description: 'Platform where post was published' }),
      
      platformPostId: Type.Optional(Type.String({
        description: 'Post ID returned by platform API',
      })),
      
      postedAt: Type.String({
        description: 'ISO timestamp when post went live',
      }),
      
      contentType: Type.String({
        description: 'Template used: hook_reveal, slideshow_caption, etc',
      }),
      
      videoPath: Type.String({
        description: 'Path to the video file',
      }),
      
      hookText: Type.Optional(Type.String()),
      caption: Type.Optional(Type.String()),
      hashtags: Type.Optional(Type.Array(Type.String())),
      
      scheduledBy: Type.Union([
        Type.Literal('optimized'),
        Type.Literal('exploration'),
        Type.Literal('manual'),
      ], { description: 'How was this post scheduled?' }),
      
      confidenceScore: Type.Optional(Type.Number({
        description: 'Confidence level 0.0-1.0 for optimized posts',
      })),
      
      runId: Type.Optional(Type.String()),
    }),
    
    async execute(_id: string, params) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      
      const postDate = new Date(params.postedAt);
      const scheduledHour = postDate.getUTCHours();
      
      const post = savePost(store, {
        id: randomUUID(),
        platform: params.platform,
        platformPostId: params.platformPostId,
        postedAt: params.postedAt,
        contentType: params.contentType,
        videoPath: params.videoPath,
        hookText: params.hookText,
        caption: params.caption,
        hashtags: params.hashtags,
        scheduledBy: params.scheduledBy,
        confidenceScore: params.confidenceScore,
        scheduledHour,
        runId: params.runId,
      });
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            postId: post.id,
            loggedAt: post.createdAt,
          }, null, 2),
        }],
      };
    },
  };
}

export const logPostTool = createLogPostTool();
```

---

### Tool 2: `pull_analytics`

**File**: `extensions/google-media/tools/pull-analytics.ts`

**Purpose**: Fetch engagement metrics from platform APIs and store locally

```typescript
import { Type } from '@sinclair/typebox';
import { initStore, savePostMetric, getRecentPosts } from '../lib/store.js';
import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';

export function createPullAnalyticsTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'pull_analytics',
    description: `Fetch engagement metrics from TikTok/Instagram APIs for recent posts.
    
Call this hourly to keep metrics up to date. Stores results in SQLite for analysis.`,
    
    parameters: Type.Object({
      platform: Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
        Type.Literal('all'),
      ], { default: 'all' }),
      
      postsSince: Type.Optional(Type.String({
        description: 'ISO timestamp - only fetch posts after this time',
      })),
      
      maxPosts: Type.Optional(Type.Number({
        description: 'Maximum posts to fetch (default: 50)',
        default: 50,
      })),
    }),
    
    async execute(_id: string, params) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      
      const platforms = params.platform === 'all' 
        ? ['tiktok', 'instagram'] as const
        : [params.platform];
      
      const results = {
        platforms: [] as string[],
        postsUpdated: 0,
        errors: [] as string[],
      };
      
      for (const platform of platforms) {
        try {
          // Get posts that need metrics
          const posts = getRecentPosts(store, {
            platform,
            since: params.postsSince,
            limit: params.maxPosts || 50,
          });
          
          // TODO: Call actual platform API
          // For now, mock the response
          for (const post of posts) {
            const metrics = await fetchPlatformMetrics(platform, post.platformPostId);
            
            savePostMetric(store, {
              id: randomUUID(),
              postId: post.id,
              pulledAt: new Date().toISOString(),
              views: metrics.views,
              likes: metrics.likes,
              comments: metrics.comments,
              shares: metrics.shares,
              saves: metrics.saves,
              completionRate: metrics.completionRate,
              reach: metrics.reach,
              impressions: metrics.impressions,
            });
            
            results.postsUpdated++;
          }
          
          results.platforms.push(platform);
        } catch (error) {
          results.errors.push(`${platform}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: results.errors.length === 0,
            ...results,
          }, null, 2),
        }],
      };
    },
  };
}

// TODO: Implement actual API calls
async function fetchPlatformMetrics(
  platform: 'tiktok' | 'instagram',
  postId: string | undefined,
): Promise<{
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  completionRate?: number;
  reach: number;
  impressions: number;
}> {
  if (!postId) {
    return { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0 };
  }
  
  // MOCK DATA - replace with actual API calls
  // TikTok: https://developers.tiktok.com/doc/content-posting-api-reference-get-video-analytics
  // Instagram: https://developers.facebook.com/docs/instagram-platform/reference/media
  
  return {
    views: Math.floor(Math.random() * 10000),
    likes: Math.floor(Math.random() * 500),
    comments: Math.floor(Math.random() * 50),
    shares: Math.floor(Math.random() * 30),
    saves: Math.floor(Math.random() * 20),
    completionRate: 0.3 + Math.random() * 0.5,
    reach: Math.floor(Math.random() * 15000),
    impressions: Math.floor(Math.random() * 20000),
  };
}

export const pullAnalyticsTool = createPullAnalyticsTool();
```

---

### Tool 3: `analyze_posting_patterns`

**File**: `extensions/google-media/tools/analyze-patterns.ts`

**Purpose**: Analyze historical data and provide insights for scheduling

```typescript
import { Type } from '@sinclair/typebox';
import { initStore, getPostsMetricsJoined, getHourPerformance } from '../lib/store.js';
import { loadConfig, requireGeminiApiKey, type GoogleMediaConfigInput } from '../lib/config.js';
import { getGeminiClient } from '../lib/gemini-client.js';

export function createAnalyzePatternsTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'analyze_posting_patterns',
    description: `Analyze historical posting performance and return actionable insights.

This tool queries the SQLite database for engagement patterns and uses Gemini
to generate recommendations. Call this before generating a daily schedule.`,
    
    parameters: Type.Object({
      platform: Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
        Type.Literal('all'),
      ], { default: 'all', description: 'Platform to analyze' }),
      
      daysBack: Type.Optional(Type.Number({
        description: 'How many days of history to analyze (default: 7)',
        default: 7,
      })),
      
      minPosts: Type.Optional(Type.Number({
        description: 'Minimum posts required for reliable analysis (default: 20)',
        default: 20,
      })),
    }),
    
    async execute(_id: string, params) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      
      const platforms = params.platform === 'all'
        ? ['tiktok', 'instagram'] as const
        : [params.platform];
      
      const insights = [];
      
      for (const platform of platforms) {
        // Query posts with metrics
        const data = getPostsMetricsJoined(store, {
          platform,
          daysBack: params.daysBack || 7,
        });
        
        if (data.length < (params.minPosts || 20)) {
          insights.push({
            platform,
            status: 'insufficient_data',
            message: `Only ${data.length} posts found. Need ${params.minPosts || 20}+ for reliable analysis.`,
            postsFound: data.length,
          });
          continue;
        }
        
        // Aggregate by hour
        const hourBuckets = new Map<number, {
          posts: number;
          totalViews: number;
          totalEngagement: number;
          totalCompletion: number;
        }>();
        
        for (const row of data) {
          const hour = row.scheduledHour;
          const bucket = hourBuckets.get(hour) || {
            posts: 0,
            totalViews: 0,
            totalEngagement: 0,
            totalCompletion: 0,
          };
          bucket.posts++;
          bucket.totalViews += row.views || 0;
          bucket.totalEngagement += (row.likes || 0) + (row.comments || 0) + (row.shares || 0) + (row.saves || 0);
          bucket.totalCompletion += row.completionRate || 0;
          hourBuckets.set(hour, bucket);
        }
        
        // Calculate averages and sort
        const hourStats = Array.from(hourBuckets.entries())
          .map(([hour, bucket]) => ({
            hour,
            avgViews: Math.round(bucket.totalViews / bucket.posts),
            avgEngagement: Number((bucket.totalEngagement / bucket.posts).toFixed(1)),
            avgCompletion: Number((bucket.totalCompletion / bucket.posts).toFixed(2)),
            postCount: bucket.posts,
          }))
          .sort((a, b) => b.avgViews - a.avgViews);
        
        const topHours = hourStats.slice(0, 5);
        const bottomHours = hourStats.slice(-5).reverse();
        
        // Use Gemini to generate recommendations
        const gemini = getGeminiClient(config.geminiApiKey);
        const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
        
        const prompt = `You are a social media strategist. Analyze this posting performance data for ${platform}:

Top performing hours (by avg views):
${topHours.map(h => `  ${h.hour}:00 - ${h.avgViews} avg views, ${h.avgEngagement} avg engagement, ${h.postCount} posts`).join('\n')}

Lowest performing hours:
${bottomHours.map(h => `  ${h.hour}:00 - ${h.avgViews} avg views, ${h.avgEngagement} avg engagement`).join('\n')}

Total posts analyzed: ${data.length}

Provide 3-5 concise recommendations for optimizing posting schedule. Be specific about hours.
Format as a JSON array of strings.`;

        const result = await model.generateContent(prompt);
        const response = result.response.text();
        
        // Parse recommendations from Gemini response
        let recommendations: string[] = [];
        try {
          const jsonMatch = response.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            recommendations = JSON.parse(jsonMatch[0]);
          }
        } catch {
          recommendations = [response];
        }
        
        insights.push({
          platform,
          status: 'success',
          analyzedPosts: data.length,
          dateRange: {
            from: new Date(Date.now() - (params.daysBack || 7) * 24 * 60 * 60 * 1000).toISOString(),
            to: new Date().toISOString(),
          },
          topHours,
          bottomHours,
          recommendations,
        });
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            insights,
          }, null, 2),
        }],
      };
    },
  };
}

export const analyzePatternsTool = createAnalyzePatternsTool();
```

---

### Tool 4: `generate_optimized_schedule`

**File**: `extensions/google-media/tools/generate-schedule.ts`

**Purpose**: Create optimized posting schedule based on historical performance

```typescript
import { Type } from '@sinclair/typebox';
import { initStore, getHourPerformance } from '../lib/store.js';
import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';

export function createGenerateScheduleTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'generate_optimized_schedule',
    description: `Generate an optimized posting schedule based on historical performance data.

Returns a list of posting times with confidence scores. Uses 90% exploitation
(posting at proven times) and 10% exploration (random times to discover new windows).`,
    
    parameters: Type.Object({
      postCount: Type.Number({
        description: 'Number of posts to schedule',
        minimum: 1,
        maximum: 50,
      }),
      
      date: Type.String({
        description: 'Date to schedule for (YYYY-MM-DD)',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      }),
      
      platform: Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
        Type.Literal('all'),
      ], { default: 'all' }),
      
      explorationRate: Type.Optional(Type.Number({
        description: 'Fraction of posts for exploration (default: 0.1)',
        minimum: 0,
        maximum: 0.3,
        default: 0.1,
      })),
      
      minGapMinutes: Type.Optional(Type.Number({
        description: 'Minimum minutes between posts (default: 30)',
        default: 30,
      })),
      
      activeHoursStart: Type.Optional(Type.Number({
        description: 'Start of active posting window, 0-23 (default: 6)',
        default: 6,
      })),
      
      activeHoursEnd: Type.Optional(Type.Number({
        description: 'End of active posting window, 0-23 (default: 23)',
        default: 23,
      })),
    }),
    
    async execute(_id: string, params) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      
      const platforms = params.platform === 'all'
        ? ['tiktok', 'instagram'] as const
        : [params.platform];
      
      const results: Record<string, any> = {};
      
      for (const platform of platforms) {
        // Get hour performance data
        const hourPerf = getHourPerformance(store, platform);
        
        // Score each hour (0-100)
        const hourScores = new Map<number, number>();
        const maxViews = Math.max(...hourPerf.map(h => h.avgViews || 0), 1);
        
        for (let hour = params.activeHoursStart || 6; hour <= (params.activeHoursEnd || 23); hour++) {
          const perf = hourPerf.find(h => h.hour === hour);
          if (perf && perf.postCount > 0) {
            // Score based on views relative to max
            const viewScore = (perf.avgViews / maxViews) * 70;
            const engagementBonus = (perf.avgEngagementRate || 0) * 30;
            hourScores.set(hour, Math.min(100, viewScore + engagementBonus));
          } else {
            // No data = neutral score
            hourScores.set(hour, 50);
          }
        }
        
        // Calculate slots needed
        const explorationCount = Math.ceil(params.postCount * (params.explorationRate || 0.1));
        const exploitationCount = params.postCount - explorationCount;
        
        // Generate exploitation slots (weighted by score)
        const exploitationSlots = [];
        const sortedHours = Array.from(hourScores.entries())
          .sort((a, b) => b[1] - a[1]);
        
        // Distribute posts across top hours, weighted by score
        let slotsAssigned = 0;
        const totalScore = Array.from(hourScores.values()).reduce((a, b) => a + b, 0);
        
        for (const [hour, score] of sortedHours) {
          if (slotsAssigned >= exploitationCount) break;
          
          // How many slots for this hour?
          const proportion = score / totalScore;
          const slotsForHour = Math.ceil(proportion * exploitationCount);
          
          for (let i = 0; i < slotsForHour && slotsAssigned < exploitationCount; i++) {
            // Add jitter: ±15 minutes
            const jitterMinutes = Math.floor(Math.random() * 30) - 15;
            const baseTime = new Date(`${params.date}T${hour.toString().padStart(2, '0')}:00:00Z`);
            const finalTime = new Date(baseTime.getTime() + jitterMinutes * 60 * 1000);
            
            // Avoid collisions
            const minGap = (params.minGapMinutes || 30) * 60 * 1000;
            const tooClose = exploitationSlots.some(s => 
              Math.abs(new Date(s.time).getTime() - finalTime.getTime()) < minGap
            );
            
            if (!tooClose) {
              exploitationSlots.push({
                time: finalTime.toISOString(),
                hour: finalTime.getUTCHours(),
                confidence: score / 100,
                reason: score >= 70 ? 'High-performing hour' : score >= 50 ? 'Moderate performance' : 'Testing underperforming hour',
              });
              slotsAssigned++;
            }
          }
        }
        
        // Generate exploration slots (random hours)
        const explorationSlots = [];
        const allHours = Array.from({ length: 24 }, (_, i) => i)
          .filter(h => h >= (params.activeHoursStart || 6) && h <= (params.activeHoursEnd || 23));
        
        for (let i = 0; i < explorationCount; i++) {
          const randomHour = allHours[Math.floor(Math.random() * allHours.length)];
          const randomMinute = Math.floor(Math.random() * 60);
          const baseTime = new Date(`${params.date}T${randomHour.toString().padStart(2, '0')}:${randomMinute.toString().padStart(2, '0')}:00Z`);
          
          explorationSlots.push({
            time: baseTime.toISOString(),
            hour: randomHour,
            reason: 'Exploration slot - testing new time window',
          });
        }
        
        // Combine and sort by time
        const allSlots = [
          ...exploitationSlots.map(s => ({ ...s, type: 'exploitation' as const })),
          ...explorationSlots.map(s => ({ ...s, type: 'exploration' as const, confidence: 0.1 })),
        ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        
        results[platform] = {
          date: params.date,
          totalSlots: allSlots.length,
          exploitationSlots: exploitationSlots.length,
          explorationSlots: explorationSlots.length,
          slots: allSlots,
          generatedAt: new Date().toISOString(),
        };
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            schedules: results,
          }, null, 2),
        }],
      };
    },
  };
}

export const generateScheduleTool = createGenerateScheduleTool();
```

---

## Store Functions

Add to `extensions/google-media/lib/store.ts`:

```typescript
// === POSTS ===

export function savePost(
  store: GoogleMediaStore,
  post: Omit<Post, 'createdAt'>,
): Post {
  const createdAt = new Date().toISOString();
  
  store.db
    .prepare(`INSERT INTO posts (
      id, platform, platform_post_id, posted_at, content_type, video_path,
      hook_text, caption, hashtags, scheduled_by, confidence_score,
      scheduled_hour, run_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      post.id,
      post.platform,
      post.platformPostId ?? null,
      post.postedAt,
      post.contentType,
      post.videoPath,
      post.hookText ?? null,
      post.caption ?? null,
      JSON.stringify(post.hashtags ?? []),
      post.scheduledBy,
      post.confidenceScore ?? null,
      post.scheduledHour,
      post.runId ?? null,
      createdAt,
    );
  
  return { ...post, createdAt };
}

export function getRecentPosts(
  store: GoogleMediaStore,
  options: {
    platform?: Platform;
    since?: string;
    limit?: number;
  },
): Post[] {
  let sql = 'SELECT * FROM posts WHERE 1=1';
  const params: any[] = [];
  
  if (options.platform) {
    sql += ' AND platform = ?';
    params.push(options.platform);
  }
  
  if (options.since) {
    sql += ' AND posted_at >= ?';
    params.push(options.since);
  }
  
  sql += ' ORDER BY posted_at DESC';
  
  if (options.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }
  
  const rows = store.db.prepare(sql).all(...params) as Record<string, any>[];
  return rows.map(mapPost);
}

export function getPostsMetricsJoined(
  store: GoogleMediaStore,
  options: {
    platform: Platform;
    daysBack: number;
  },
): Array<Post & PostMetric> {
  const since = new Date(Date.now() - options.daysBack * 24 * 60 * 60 * 1000).toISOString();
  
  const sql = `
    SELECT 
      p.*,
      m.views, m.likes, m.comments, m.shares, m.saves,
      m.completion_rate, m.reach, m.impressions
    FROM posts p
    LEFT JOIN post_metrics m ON p.id = m.post_id
    WHERE p.platform = ?
      AND p.posted_at >= ?
    ORDER BY p.posted_at DESC
  `;
  
  const rows = store.db.prepare(sql).all(options.platform, since) as Record<string, any>[];
  return rows.map(row => ({
    ...mapPost(row),
    views: row.views || 0,
    likes: row.likes || 0,
    comments: row.comments || 0,
    shares: row.shares || 0,
    saves: row.saves || 0,
    completionRate: row.completion_rate,
    reach: row.reach || 0,
    impressions: row.impressions || 0,
  }));
}

// === METRICS ===

export function savePostMetric(
  store: GoogleMediaStore,
  metric: Omit<PostMetric, 'createdAt'>,
): PostMetric {
  const createdAt = new Date().toISOString();
  
  store.db
    .prepare(`INSERT INTO post_metrics (
      id, post_id, pulled_at, views, likes, comments, shares, saves,
      completion_rate, avg_watch_time_seconds, reach, impressions,
      platform_data, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      metric.id,
      metric.postId,
      metric.pulledAt,
      metric.views,
      metric.likes,
      metric.comments,
      metric.shares,
      metric.saves,
      metric.completionRate ?? null,
      metric.avgWatchTimeSeconds ?? null,
      metric.reach,
      metric.impressions,
      metric.platformData ? JSON.stringify(metric.platformData) : null,
      createdAt,
    );
  
  return { ...metric, createdAt };
}

// === HOUR PERFORMANCE ===

export function getHourPerformance(
  store: GoogleMediaStore,
  platform: Platform,
): HourPerformance[] {
  const rows = store.db
    .prepare('SELECT * FROM hour_performance WHERE platform = ? ORDER BY performance_score DESC')
    .all(platform) as Record<string, any>[];
  
  return rows.map(mapHourPerformance);
}

export function updateHourPerformance(store: GoogleMediaStore): void {
  // Recompute hour performance from raw data
  const sql = `
    INSERT OR REPLACE INTO hour_performance (id, platform, hour, day_of_week, post_count, total_views, total_likes, total_shares, total_saves, avg_views, avg_engagement_rate, avg_completion_rate, performance_score, last_updated)
    SELECT 
      printf('%s-%d-all', p.platform, p.scheduled_hour) as id,
      p.platform,
      p.scheduled_hour as hour,
      NULL as day_of_week,
      COUNT(*) as post_count,
      SUM(COALESCE(m.views, 0)) as total_views,
      SUM(COALESCE(m.likes, 0)) as total_likes,
      SUM(COALESCE(m.shares, 0)) as total_shares,
      SUM(COALESCE(m.saves, 0)) as total_saves,
      AVG(COALESCE(m.views, 0)) as avg_views,
      AVG((COALESCE(m.likes, 0) + COALESCE(m.comments, 0) + COALESCE(m.shares, 0) + COALESCE(m.saves, 0)) * 1.0 / NULLIF(m.views, 0)) as avg_engagement_rate,
      AVG(m.completion_rate) as avg_completion_rate,
      0 as performance_score,
      CURRENT_TIMESTAMP as last_updated
    FROM posts p
    LEFT JOIN post_metrics m ON p.id = m.post_id
    GROUP BY p.platform, p.scheduled_hour
  `;
  
  store.db.exec(sql);
  
  // Update performance scores (normalize to 0-100)
  const updateScoreSql = `
    UPDATE hour_performance
    SET performance_score = (
      SELECT ROUND(
        50 + 
        (avg_views - (SELECT AVG(avg_views) FROM hour_performance hp2 WHERE hp2.platform = hour_performance.platform)) /
        NULLIF((SELECT MAX(avg_views) - MIN(avg_views) FROM hour_performance hp3 WHERE hp3.platform = hour_performance.platform), 0) * 50,
        2
      )
    )
  `;
  
  store.db.exec(updateScoreSql);
}

// === HELPERS ===

function mapPost(row: Record<string, any>): Post {
  return {
    id: row.id,
    platform: row.platform,
    platformPostId: row.platform_post_id,
    postedAt: row.posted_at,
    contentType: row.content_type,
    videoPath: row.video_path,
    hookText: row.hook_text,
    caption: row.caption,
    hashtags: row.hashtags ? JSON.parse(row.hashtags) : [],
    scheduledBy: row.scheduled_by,
    confidenceScore: row.confidence_score,
    scheduledHour: row.scheduled_hour,
    runId: row.run_id,
    createdAt: row.created_at,
  };
}

function mapHourPerformance(row: Record<string, any>): HourPerformance {
  return {
    id: row.id,
    platform: row.platform,
    hour: row.hour,
    dayOfWeek: row.day_of_week,
    postCount: row.post_count,
    totalViews: row.total_views,
    avgViews: row.avg_views,
    avgEngagementRate: row.avg_engagement_rate,
    avgCompletionRate: row.avg_completion_rate,
    performanceScore: row.performance_score,
    lastUpdated: row.last_updated,
  };
}
```

---

## Cron Job Configuration

### Hourly: Pull Analytics

```yaml
# OpenClaw cron config
- id: saravan-hourly-analytics
  schedule:
    kind: cron
    expr: "15 * * * *"  # Every hour at minute 15
  sessionTarget: isolated
  payload:
    kind: agentTurn
    message: |
      Pull the latest analytics for all platforms.
      
      Use pull_analytics tool with:
      - platform: "all"
      - postsSince: "24 hours ago"
      - maxPosts: 50
      
      Then use update_hour_performance to refresh aggregated data.
      
      Report how many posts were updated.
```

### Daily: Generate Content + Schedule

```yaml
- id: saravan-daily-content
  schedule:
    kind: cron
    expr: "0 5 * * *"  # 5 AM daily
  sessionTarget: isolated
  payload:
    kind: agentTurn
    message: |
      Generate today's social media content pipeline.
      
      STEP 1: Analyze patterns
      Use analyze_posting_patterns with:
      - platform: "all"
      - daysBack: 7
      
      STEP 2: Generate optimized schedule
      Use generate_optimized_schedule with:
      - postCount: 30
      - date: "today's date"
      - platform: "all"
      - explorationRate: 0.1
      
      STEP 3: Create content for each slot
      For each scheduled slot:
      - Use nano_banana to generate a background image
      - Use render_hook_reveal to create the video
      - Save the video path for posting
      
      STEP 4: Queue posts
      Log each generated video with log_post tool.
      
      Report the final schedule with video paths.
```

---

## Testing Checklist

### Unit Tests

Create `extensions/google-media/tests/analytics.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { initStore, savePost, savePostMetric, getPostsMetricsJoined } from '../lib/store.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync } from 'fs';

describe('Posts and Analytics', () => {
  let store: ReturnType<typeof initStore>;
  
  beforeEach(() => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'saravan-test-'));
    store = initStore({ defaultOutputDir: tmpDir });
  });
  
  test('savePost creates a post record', () => {
    const post = savePost(store, {
      id: 'test-1',
      platform: 'tiktok',
      postedAt: new Date().toISOString(),
      contentType: 'hook_reveal',
      videoPath: '/tmp/test.mp4',
      scheduledBy: 'manual',
      scheduledHour: 18,
    });
    
    expect(post.id).toBe('test-1');
    expect(post.platform).toBe('tiktok');
    expect(post.scheduledHour).toBe(18);
  });
  
  test('getPostsMetricsJoined returns posts with metrics', () => {
    savePost(store, {
      id: 'test-2',
      platform: 'tiktok',
      postedAt: new Date().toISOString(),
      contentType: 'hook_reveal',
      videoPath: '/tmp/test.mp4',
      scheduledBy: 'optimized',
      scheduledHour: 20,
    });
    
    savePostMetric(store, {
      id: 'metric-1',
      postId: 'test-2',
      pulledAt: new Date().toISOString(),
      views: 1000,
      likes: 50,
      comments: 10,
      shares: 5,
      saves: 3,
      reach: 1200,
      impressions: 1500,
    });
    
    const results = getPostsMetricsJoined(store, {
      platform: 'tiktok',
      daysBack: 1,
    });
    
    expect(results.length).toBe(1);
    expect(results[0].views).toBe(1000);
    expect(results[0].scheduledHour).toBe(20);
  });
});
```

---

## Integration Test

```bash
# Run the full pipeline manually
cd ~/projects/ocworkspace/saravan-media

# 1. Validate setup
bun run scripts/validate.ts

# 2. Test analytics pull (will use mock data)
bun -e '
import { pullAnalyticsTool } from "./extensions/google-media/tools/pull-analytics.js";
const result = await pullAnalyticsTool.execute("test", { platform: "tiktok" });
console.log(result.content[0].text);
'

# 3. Test schedule generation
bun -e '
import { generateScheduleTool } from "./extensions/google-media/tools/generate-schedule.js";
const result = await generateScheduleTool.execute("test", {
  postCount: 10,
  date: "2026-03-20",
  platform: "tiktok"
});
console.log(result.content[0].text);
'
```

---

## Summary of New Components

| Component | File | Purpose |
|-----------|------|---------|
| Migration | `migrations/002_posts_and_analytics.sql` | Database schema |
| Types | `lib/types.ts` (extend) | TypeScript interfaces |
| log_post tool | `tools/log-post.ts` | Record published posts |
| pull_analytics tool | `tools/pull-analytics.ts` | Fetch platform metrics |
| analyze_patterns tool | `tools/analyze-patterns.ts` | AI-powered insights |
| generate_schedule tool | `tools/generate-schedule.ts` | Optimized scheduling |
| Store functions | `lib/store.ts` (extend) | Database operations |
| Tests | `tests/analytics.test.ts` | Unit tests |

---

## Implementation Order

1. **Migration + Types** - Foundation
2. **Store functions** - Data layer
3. **log_post** - Basic tracking
4. **pull_analytics** - Data collection
5. **generate_schedule** - Core algorithm (without Gemini first)
6. **analyze_patterns** - Add Gemini insights
7. **Tests** - Validate everything
8. **Cron jobs** - Automation

---

## Questions for PM

1. What's the minimum viable data before we trust the schedule?
2. Should we support custom time zones per platform?
3. How to handle viral outliers in the algorithm?
4. Priority: TikTok-only first, or both platforms from day 1?
