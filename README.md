# Saravan Social Media Automation

OpenClaw-orchestrated pipeline for automated short-form video content generation.

## Project Structure

```
saravan-media/
├── extensions/
│   └── google-media/        # OpenClaw plugin for Gemini tools
│       ├── openclaw.plugin.json
│       ├── index.ts
│       ├── lib/
│       │   └── gemini-client.ts
│       └── tools/
│           └── nano-banana.ts   # Image generation
│
└── remotion-template/       # Video composition templates
    ├── root.tsx
    ├── src/
    │   ├── compositions/
    │   │   └── HookReveal.tsx   # Hook → reveal template
    │   └── render.ts            # Programmatic render API
    └── package.json
```

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| google-media extension | ✅ Built | Nano Banana tool ready |
| HookReveal template | ✅ Built | 5-second hook→reveal video |
| Remotion render API | ✅ Built | Programmatic rendering |
| publish tools | ✅ Built | TikTok + Instagram publishing with dry-run and idempotency |
| analytics tools | ✅ Built | Post logging, analytics pull, pattern analysis, schedule generation |
| conversion loop | ✅ Built | Conversion logging, next-post planning, daily plan generation |
| Veo tool | 🔲 Todo | Waiting for API access |
| Lyria tool | 🔲 Todo | Music generation |
| TTS tool | 🔲 Todo | Voiceover generation |
| autonomous execution loop | 🔲 Todo | Run planned posts end-to-end without manual intervention |

## Quick Start

### Install dependencies

```bash
cd extensions/google-media && bun install
cd ../../remotion-template && bun install
```

### Set up environment variables

Create a local `.env` file from `.env.example` and fill in the secrets:

```bash
cp .env.example .env
```

For local development, `.env` is the right place for API keys because it is already ignored by git in [.gitignore](.gitignore).
For production or hosted automation, use your secret manager or deployment environment variables instead of committing secrets anywhere.

If you run the tools with Bun, `.env` is loaded automatically. If OpenClaw is launched another way, make sure the same variables are exported into that process.

Minimum setup:

```bash
export GEMINI_API_KEY=your-key-here
export INSTAGRAM_ACCESS_TOKEN=your-instagram-token
export INSTAGRAM_BUSINESS_ACCOUNT_ID=your-instagram-business-account-id
export TIKTOK_ACCESS_TOKEN=your-tiktok-token
export TIKTOK_CREATOR_ID=your-tiktok-creator-id
```

### Test image generation (once plugin loaded in OpenClaw)

```
Use nano_banana tool with prompt: "A colorful tropical dessert on a wooden table, food photography"
```

### Phase 5 / 6 loop tools

Available planning tools now include:

- `log_conversion`
- `plan_next_post`
- `build_daily_plan`
- `update_hour_performance`

Recommended loop:

1. Publish content and record the post with `log_post`
2. Pull metrics with `pull_analytics`
3. Record downstream outcomes with `log_conversion`
4. Generate the next recommendation with `plan_next_post`
5. Generate a full day queue with `build_daily_plan`

### Render a test video

```bash
cd remotion-template
bun run start    # Open Remotion Studio
bun run build    # Render HookReveal composition
```

## Templates

### HookReveal
- **Duration:** 5 seconds
- **Format:** 9:16 (1080x1920)
- **Use case:** Facts, tips, hot takes
- **Phases:**
  1. Hook text appears (0-2s)
  2. Pause for impact (2-3s)
  3. Reveal with animation (3-5s)

## Next Steps

1. Configure real Instagram and TikTok credentials in `.env`
2. Validate publish + analytics against sandbox/live accounts
3. Wire `build_daily_plan` into scheduled OpenClaw jobs
4. Build more Remotion templates
5. Add richer attribution inputs if conversions come from external systems

## Cost Estimates

- ~$1.53/video at scale (30/day)
- ~$45.90/day or ~$1,400/month at full scale
- Start at 3-5 videos/day to validate
