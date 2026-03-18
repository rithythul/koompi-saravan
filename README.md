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
| Veo tool | 🔲 Todo | Waiting for API access |
| Lyria tool | 🔲 Todo | Music generation |
| TTS tool | 🔲 Todo | Voiceover generation |
| tiktok-publisher | 🔲 Todo | Posting + analytics |
| instagram-publisher | 🔲 Todo | Posting + analytics |

## Quick Start

### Install dependencies

```bash
cd extensions/google-media && bun install
cd ../../remotion-template && bun install
```

### Set up Gemini API key

```bash
export GEMINI_API_KEY=your-key-here
```

### Test image generation (once plugin loaded in OpenClaw)

```
Use nano_banana tool with prompt: "A colorful tropical dessert on a wooden table, food photography"
```

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

1. Install dependencies and test Nano Banana
2. Add Veo tool when API access granted
3. Build 4 more Remotion templates
4. Create tiktok-publisher extension
5. Wire up cron jobs for daily automation

## Cost Estimates

- ~$1.53/video at scale (30/day)
- ~$45.90/day or ~$1,400/month at full scale
- Start at 3-5 videos/day to validate
