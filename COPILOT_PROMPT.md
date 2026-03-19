# Saravan Media - Copilot Continuation Prompt

## Project Overview

You are continuing development of **Saravan Media** — an OpenClaw-orchestrated social media automation pipeline that generates, publishes, and optimizes short-form video content for TikTok and Instagram.

**GitHub:** https://github.com/rithythul/koompi-saravan
**Location:** `~/projects/ocworkspace/saravan-media`

---

## Current State (Phases 1-5 Complete)

| Phase | Tools Built | Status |
|-------|-------------|--------|
| 1-2 | `nano_banana`, `render_hook_reveal` | ✅ Done |
| 3 | `log_post`, `pull_analytics`, `analyze_patterns`, `generate_schedule`, `update_hour_performance` | ✅ Done |
| 4 | `publish_tiktok`, `publish_instagram` | ✅ Done |
| 5 | `log_conversion`, `build_daily_plan`, `run_daily_plan`, `plan_next_post`, `execute_planned_post` | ✅ Done |

**All 25 tests passing.**

---

## What's Built

### Content Generation
- `nano_banana` — Generate images via Gemini API
- `render_hook_reveal` — Render 5-second hook→reveal videos with Remotion

### Analytics & Learning
- `log_post` — Track posts in SQLite
- `pull_analytics` — Fetch engagement metrics from TikTok/IG
- `analyze_patterns` — Identify optimal posting times with Gemini
- `generate_schedule` — 90/10 exploitation/exploration scheduling
- `update_hour_performance` — Aggregate hourly performance

### Publishing
- `publish_tiktok` — Post to TikTok via Content Posting API
- `publish_instagram` — Post to Instagram Reels via Graph API
- Both support dry-run mode and idempotency

### Conversion & Planning
- `log_conversion` — Track business outcomes (clicks, signups, sales)
- `build_daily_plan` — Generate full day of planned posts
- `run_daily_plan` — Execute all planned posts
- `plan_next_post` — Suggest optimal next post
- `execute_planned_post` — Run single planned post

### Infrastructure
- SQLite database with migrations
- Platform clients for TikTok and Instagram
- Config system with dry-run, kill switch
- Public media serving

---

## Phase 6: What to Build Next

### Priority 1: OpenClaw Integration

**Goal:** Make the plugin loadable in OpenClaw and callable from agent sessions.

**Tasks:**
1. Ensure `openclaw.plugin.json` is correct and exports all tools
2. Test loading the plugin in a local OpenClaw instance
3. Create a test session that calls each tool
4. Document the config needed in `~/.openclaw/config.jsonc`

**Files to check/modify:**
- `extensions/google-media/index.ts` — Plugin entry point
- `extensions/google-media/openclaw.plugin.json` — Manifest
- `README.md` — Add OpenClaw setup instructions

### Priority 2: Cron Job Wiring

**Goal:** Automate daily content pipeline via OpenClaw cron.

**Cron jobs needed:**

```yaml
# Hourly: Pull analytics
- id: saravan-hourly-analytics
  schedule: "15 * * * *"
  sessionTarget: isolated
  payload:
    kind: agentTurn
    message: |
      Pull analytics from all platforms using pull_analytics tool.
      Then run update_hour_performance to refresh aggregated data.

# Daily: Generate and publish content  
- id: saravan-daily-content
  schedule: "0 5 * * *"
  sessionTarget: isolated
  payload:
    kind: agentTurn
    message: |
      Run the full daily content pipeline:
      
      1. Use build_daily_plan to generate today's posts
      2. Use run_daily_plan to execute all planned posts
      3. Report results with post IDs and scheduled times
```

**Tasks:**
1. Create `scripts/setup-cron.ts` to register these jobs via OpenClaw cron API
2. Add instructions to README for enabling automation
3. Test with a manual cron trigger

### Priority 3: More Remotion Templates

**Goal:** Add variety to avoid content looking like spam.

**Templates to build:**

| Template | Description | Duration |
|----------|-------------|----------|
| `slideshow_caption` | Image carousel with animated captions | 15s |
| `quote_card` | Quote with animated background | 10s |
| `countdown_list` | "5 things you need to know" format | 30s |
| `talking_head` | TTS voiceover with background | 20s |

**Files to create:**
- `remotion-template/src/compositions/SlideshowCaption.tsx`
- `remotion-template/src/compositions/QuoteCard.tsx`
- `remotion-template/src/compositions/CountdownList.tsx`
- `remotion-template/src/compositions/TalkingHead.tsx`
- Update `remotion-template/root.tsx` to register compositions
- Add render tools: `render_slideshow_caption`, etc.

### Priority 4: Error Handling & Resilience

**Goal:** Make the pipeline robust for production use.

**Tasks:**
1. Add retry logic to platform API calls (3 retries with exponential backoff)
2. Add circuit breaker for when APIs are down
3. Log all errors to SQLite for debugging
4. Add health check tool to verify: API keys, DB status, Remotion availability
5. Create `tools/health_check.ts`

### Priority 5: Dashboard / Reporting

**Goal:** Provide visibility into what the system is doing.

**Tasks:**
1. Create `tools/get_daily_summary.ts` — Report today's posts, views, conversions
2. Create `tools/get_performance_report.ts` — Weekly/monthly performance
3. Create `tools/export_analytics.ts` — CSV/JSON export for analysis
4. Consider a simple web dashboard (optional)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OPENCLAW                                  │
│                                                                  │
│  CRON JOBS ───► AGENT ───► TOOLS ───► SQLITE                    │
│                                                                  │
│  Tools:                                                          │
│    • nano_banana (image gen)                                     │
│    • render_* (video composition)                                │
│    • log_post, pull_analytics, analyze_patterns                  │
│    • generate_schedule, build_daily_plan                         │
│    • publish_tiktok, publish_instagram                           │
│    • log_conversion, run_daily_plan                              │
└─────────────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
    ┌─────────┐         ┌──────────┐
    │ GEMINI  │         │ PLATFORM │
    │   API   │         │   APIs   │
    └─────────┘         └──────────┘
```

---

## Key Constraints

1. **Use bun, not npm** — All package management with bun
2. **TypeScript strict mode** — No `any` types
3. **Test everything** — Every tool needs tests
4. **Dry-run first** — All destructive operations support `dryRun: true`
5. **Idempotency** — Publishing tools prevent duplicates
6. **Kill switch** — `config.automationEnabled` can stop all automation

---

## Database Schema

```sql
-- Already exists
content_runs         -- Track generation runs
rendered_videos      -- Track rendered MP4s
published_posts      -- Track published content
posts                -- Analytics tracking
post_metrics         -- Engagement data
hour_performance     -- Pre-aggregated hourly stats
conversions          -- Business outcomes
planned_posts        -- Daily plan queue
```

---

## Testing

```bash
# Run all tests
cd ~/projects/ocworkspace/saravan-media/extensions/google-media
bun test

# Run specific test file
bun test tests/conversion-planning.test.ts

# Check test coverage
bun test --coverage
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
GEMINI_API_KEY=your-key-from-ai.google.dev

# Optional for real publishing
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_ACCESS_TOKEN=

INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_ACCESS_TOKEN=
```

---

## First Task for Copilot

**Start with Priority 1: OpenClaw Integration**

1. Review `extensions/google-media/index.ts` to ensure all tools are exported
2. Verify `openclaw.plugin.json` has correct manifest
3. Add a test that simulates loading the plugin
4. Update README with:
   - How to add plugin to OpenClaw config
   - How to test tools from an OpenClaw session
   - Example commands

---

## Commands Reference

```bash
# Install dependencies
cd ~/projects/ocworkspace/saravan-media/extensions/google-media && bun install
cd ~/projects/ocworkspace/saravan-media/remotion-template && bun install

# Run tests
cd ~/projects/ocworkspace/saravan-media/extensions/google-media && bun test

# Start Remotion Studio (preview videos)
cd ~/projects/ocworkspace/saravan-media/remotion-template && bun run start

# Render test video
cd ~/projects/ocworkspace/saravan-media/remotion-template && bun run build

# Check git status
cd ~/projects/ocworkspace/saravan-media && git status

# Commit changes
git add -A && git commit -m "description"
git push origin master
```

---

## Success Metrics

When Phase 6 is complete, you should be able to:

1. ✅ Load plugin in OpenClaw and call tools from chat
2. ✅ Run `build_daily_plan` and see planned posts in SQLite
3. ✅ Execute `run_daily_plan` to publish (in dry-run mode)
4. ✅ Have cron jobs running daily without manual intervention
5. ✅ See 4+ video templates available for variety
6. ✅ Get daily summary reports in Telegram

---

## Questions to Answer Before Building

1. Is the plugin loading correctly in OpenClaw?
2. Do all tools work when called from an agent session?
3. What's the minimum viable cron setup?
4. Which template should be built first for maximum variety?

---

Good luck! The foundation is solid. Focus on integration and automation to make it usable in production.
