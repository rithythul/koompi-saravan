# Sarawan Social — Hand-off Document

**Date:** 2026-04-08
**Status:** Full platform publishing + REST API implemented
**Commit:** `3cfd4ae`

---

## What Was Just Completed

### 1. Full Platform Publishing (8 platforms)
- ✅ Instagram (video, image, carousel)
- ✅ TikTok (video only)
- ✅ YouTube (video/Shorts)
- ✅ Facebook (video, image)
- ✅ Pinterest (video, image)
- ✅ LinkedIn (video, image)
- ✅ Telegram (video, image)
- ✅ X/Twitter (video, image)

**Location:** `extensions/publisher/lib/publisher/`

Each platform has:
- Content validation (caption length, hashtags, content types)
- Rate limit awareness
- Error handling with retry logic
- Circuit breaker for repeated failures

### 2. Unified Publish Tool
- Single endpoint to publish to multiple platforms
- Located at: `extensions/publisher/tools/publish.ts`
- OpenClaw tool name: `publish`

### 3. REST API with Hono
**Base URL:** `http://localhost:3001` (default)

**Endpoints:**
```
GET  /health                              - Health check
GET  /api/platforms                        - List all platforms + config status
POST /api/publish                         - Publish to platforms
GET  /api/publish/status/:postId          - Get post status
GET  /api/analytics/summary               - Analytics summary
GET  /api/analytics/posts                  - Post analytics with pagination
GET  /api/analytics/posts/:postId         - Single post analytics
GET  /api/analytics/performance           - Performance insights
GET  /api/analytics/hourly/:platform      - Hourly performance data
POST /api/analytics/refresh               - Trigger analytics refresh
GET  /api/media                           - List media
POST /api/media/upload                    - Upload media
```

**Location:** `src/api/`

### 4. Analytics Store
- SQLite-based persistence at `var/analytics.db`
- Tracks posts, metrics, and hourly performance
- Auto-calculates engagement rates
- Located at: `src/api/lib/analytics-store.ts`

---

## How to Run

### Start the API Server
```bash
cd /home/KOOMPI/workspace/sarawan-social
bun run api
```

### Start with custom port
```bash
PORT=3002 bun run api
```

---

## Environment Variables Required

Set these in `~/.secrets/` or `~/.openclaw/.env`:

```bash
# Gemini AI
GEMINI_API_KEY=

# Instagram
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ACCOUNT_ID=

# TikTok
TIKTOK_ACCESS_TOKEN=
TIKTOK_CREATOR_ID=

# YouTube
YT_CLIENT_ID=
YT_CLIENT_SECRET=
YT_REFRESH_TOKEN=

# Facebook
FB_APP_ID=
FB_APP_SECRET=
FB_ACCESS_TOKEN=

# Pinterest
PINTEREST_ACCESS_TOKEN=

# LinkedIn
LI_CLIENT_ID=
LI_CLIENT_SECRET=
LI_ACCESS_TOKEN=

# Telegram
TG_BOT_TOKEN=
TG_CHANNEL_ID=

# X (Twitter)
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
```

---

## OpenClaw Integration

The plugin is loaded from:
```
/home/KOOMPI/workspace/sarawan-social/extensions/publisher
```

**Config in:** `~/.openclaw/openclaw.json`
```jsonc
"plugins": {
  "load": {
    "paths": ["/home/KOOMPI/workspace/sarawan-social/extensions/publisher"]
  },
  "entries": {
    "publisher": {
      "enabled": true,
      "config": {
        "dryRun": true,
        "killSwitch": false,
        // ... API keys
      }
    }
  }
}
```

---

## What's Still Missing (Backlog)

### High Priority
1. **Actual Analytics Fetching** — Currently stub (returns zeros)
   - Need to implement API calls to each platform's analytics endpoints
   - Map platform-specific metrics to unified format

2. **Media Upload Handling** — POST /api/media/upload not implemented
   - Need to handle multipart form data
   - Upload to KStorage or similar

3. **Post Deletion** — DELETE /api/publish/:postId not implemented
   - Need to call platform APIs to delete posts

### Medium Priority
4. **Web Dashboard** — No UI exists yet
   - Analytics visualization
   - Post approval workflow
   - Content calendar view

5. **Hook Library** — No database of proven hooks
   - Store hooks with performance data
   - A/B test different hooks

6. **Hashtag Optimizer** — AI-powered hashtag suggestions
   - Analyze trending hashtags per niche
   - Suggest optimal hashtag sets

### Lower Priority
7. **Competitor Analysis** — Deep-dive into competitor content
8. **Content Performance Prediction** — ML model for predicting post performance
9. **AI Studio Integration** — Veo (video), Lyria (music), TTS (voiceover)

---

## Quick Start for Next Developer

### 1. Install dependencies
```bash
cd /home/KOOMPI/workspace/sarawan-social
bun install
```

### 2. Typecheck
```bash
bun run typecheck
```

### 3. Run tests
```bash
bun test
```

### 4. Start API server
```bash
bun run api
```

### 5. Test publish endpoint (dry run)
```bash
curl -X POST http://localhost:3001/api/publish \
  -H "Content-Type: application/json" \
  -d '{
    "platforms": ["instagram"],
    "content": {
      "type": "image",
      "mediaUrl": "https://example.com/test.jpg",
      "caption": "Test post from Sarawan Social"
    },
    "options": {
      "dryRun": true,
      "validateOnly": true
    }
  }'
```

---

## Architecture Notes

### Publisher Pattern
All platform publishers extend `BasePublisher` from `extensions/publisher/lib/publisher/base.ts`:

```typescript
class MyPlatformPublisher extends BasePublisher {
  readonly platform = 'myplatform';
  readonly supportsScheduling = boolean;
  readonly supportedContentTypes: ContentType[];

  async publish(content: PublishContent): Promise<PublishResult>;
  async getPostStatus(postId: string): Promise<PostStatus>;
  async deletePost(postId: string): Promise<void>;
  async validate(content: PublishContent): Promise<ValidationResult>;
  async getRateLimit(): Promise<RateLimitInfo>;
}
```

### Analytics Store
Uses `bun:sqlite` with WAL mode for better concurrency.

**Tables:**
- `posts` — Published posts with metadata
- `metrics` — Analytics snapshots per post
- `hour_performance` — Aggregated hourly performance data

### Retry Logic
- Exponential backoff with jitter
- Circuit breaker opens after 5 failures
- Respects `Retry-After` headers

---

## Known Issues

1. **Analytics returns zeros** — Need to implement actual platform API calls
2. **Some tests failing** — Pre-existing test failures in old test files
3. **No actual media upload** — Upload endpoint stub only
4. **OpenClaw plugin not tested** — Should verify plugin loads correctly after restart

---

## Contact

- **Project:** Sarawan Social
- **Location:** `/home/KOOMPI/workspace/sarawan-social`
- **Plugin Path:** `/home/KOOMPI/workspace/sarawan-social/extensions/publisher`
- **API Default Port:** 3001

---

## Git Commands

```bash
# View recent commits
git log --oneline -10

# Check what changed since last commit
git diff HEAD~1

# View file history
git log --follow -- extensions/publisher/lib/publisher/base.ts

# See what's in the working directory
git status
```
