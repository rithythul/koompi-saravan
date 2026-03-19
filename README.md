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
| autonomous execution loop | ✅ Built | Execute planned posts end-to-end with dry-run-safe fallbacks |
| Veo tool | 🔲 Todo | Waiting for API access |
| Lyria tool | 🔲 Todo | Music generation |
| TTS tool | 🔲 Todo | Voiceover generation |

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

### Load the plugin in OpenClaw

Add the plugin to ~/.openclaw/config.jsonc:

```jsonc
{
  "plugins": [
    {
      "path": "/home/userx/projects/ocworkspace/saravan-media/extensions/google-media",
      "config": {
        "defaultOutputDir": "/home/userx/projects/ocworkspace/saravan-media/var/outputs",
        "dryRun": true,
        "killSwitch": false,
        "publicMediaBaseUrl": "https://cdn.example.com/media",
        "geminiApiKey": "${GEMINI_API_KEY}",
        "instagramAccessToken": "${INSTAGRAM_ACCESS_TOKEN}",
        "instagramBusinessAccountId": "${INSTAGRAM_BUSINESS_ACCOUNT_ID}",
        "tiktokAccessToken": "${TIKTOK_ACCESS_TOKEN}",
        "tiktokCreatorId": "${TIKTOK_CREATOR_ID}"
      }
    }
  ]
}
```

Notes:

- Keep `dryRun` enabled until public media hosting and platform credentials are verified.
- `publicMediaBaseUrl` must serve files from the managed output directory before live publishing can work.
- If OpenClaw does not expand `${...}` placeholders in your environment, replace them with direct config values or export the variables before starting OpenClaw.

### Validate the plugin locally

Run the extension tests, including the plugin-load regression test:

```bash
cd extensions/google-media
bun run typecheck
bun test
```

The plugin integration coverage lives in [extensions/google-media/tests/plugin-integration.test.ts](extensions/google-media/tests/plugin-integration.test.ts).

### Test image generation (once plugin loaded in OpenClaw)

```
Use nano_banana tool with prompt: "A colorful tropical dessert on a wooden table, food photography"
```

### Test tools from an OpenClaw session

Example agent prompts:

```text
Use the nano_banana tool to generate 1 image for:
"A cinematic tropical dessert photo, vibrant lighting, social media ad style"
```

```text
Use the build_daily_plan tool for platform "instagram" with postCount 2 and objective "conversions".
Then summarize the planned posting times.
```

```text
Use the run_daily_plan tool for today on platform "tiktok" with autoPublish false.
Report each planned post id, run id, and publication status.
```

```text
Use the pull_analytics tool for platform "instagram" and then use update_hour_performance.
Summarize which hours are currently strongest.
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

  1. Wire `run_daily_plan` and `pull_analytics` into scheduled OpenClaw jobs
  2. Validate publish + analytics against sandbox/live accounts
  3. Build more Remotion templates
  4. Add health-check and retry tooling for production resilience
  5. Add richer attribution inputs if conversions come from external systems

## Cost Estimates

- ~$1.53/video at scale (30/day)
- ~$45.90/day or ~$1,400/month at full scale
- Start at 3-5 videos/day to validate
