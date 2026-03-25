# Sarawan Social - Roadmap to Full Self-Hosted Social Automation

Goal: Complete replacement of Genviral dependency. Self-hosted, full-control, no third-party SaaS.

## Current State (2026-03-25)

### ✅ Built
- Platform clients (TikTok, Instagram)
- Remotion video rendering (HookReveal template)
- AI image generation (Gemini Nano Banana)
- Post logging + analytics pull
- Pattern analysis + schedule generation
- Conversion tracking + planning tools
- Daily plan execution loop
- Health check + config validation

### 🔲 Missing (Genviral Parity)

## Phase 4: Core Infrastructure (Week 1-2)

### 4.1 Media Storage System
- [ ] `upload` — Upload to KStorage (S3-compatible) with presigned URLs
- [ ] `list-files` — Query uploaded media with filters
- [ ] `delete-file` — Remove media from storage
- Integration with KStorage CLI or direct S3 API

### 4.2 Pack Management System
- [ ] `create-pack` — Create image pack with metadata
- [ ] `list-packs` — List packs with search
- [ ] `get-pack` — Get pack with full image list + AI metadata
- [ ] `update-pack` — Rename, change visibility
- [ ] `delete-pack` — Remove pack
- [ ] `add-pack-image` — Add image to pack with auto-metadata extraction
- [ ] `delete-pack-image` — Remove image from pack
- AI metadata generation (description + keywords) using Gemini

### 4.3 Template System
- [ ] `create-template` — Create reusable slideshow structure
- [ ] `list-templates` — List templates with search
- [ ] `get-template` — Get template config
- [ ] `update-template` — Modify template
- [ ] `delete-template` — Remove template
- [ ] `create-template-from-slideshow` — Convert successful post to template

### 4.4 Folder Organization
- [ ] `create-folder` — Create nested folders for organization
- [ ] `list-folders` — Browse folder hierarchy
- [ ] `get-folder` — Get folder details
- [ ] `move-folder` — Reorganize folder tree
- [ ] `delete-folder` — Remove folder and contents
- [ ] `folder-items-add` — Add files/slideshows to folder
- [ ] `folder-items-remove` — Remove items from folder

## Phase 5: Advanced Content Generation (Week 3-4)

### 5.1 Enhanced Slideshow Engine
- [ ] Multi-template support (not just HookReveal)
- [ ] Text positioning + styling controls
- [ ] Background filters (darken, blur, gradient overlay)
- [ ] Aspect ratio support (9:16, 4:5, 1:1, 16:9)
- [ ] Font size + text width controls
- [ ] Slide preview before rendering

### 5.2 AI Content Intelligence
- [ ] `trend-brief` — Niche research (hashtags, sounds, creators, posting windows)
- [ ] Hook angle recommendations
- [ ] Competitor analysis tools
- [ ] Content performance prediction

### 5.3 Studio AI Integration
- [ ] Video generation (Veo when available)
- [ ] Music generation (Lyria when available)
- [ ] TTS voiceover generation
- [ ] Model catalog + credit tracking

## Phase 6: Multi-Platform Expansion (Week 5-6)

### 6.1 Platform Clients
- [ ] YouTube Shorts publishing
- [ ] Pinterest publishing (board selection, pin titles)
- [ ] LinkedIn publishing
- [ ] Facebook Reels publishing
- [ ] Platform-specific settings (privacy, comments, duet/stitch)

### 6.2 Cross-Platform Features
- [ ] Multi-account posting in single request
- [ ] Platform-specific caption optimization
- [ ] Aspect ratio auto-conversion
- [ ] Platform-specific scheduling windows

## Phase 7: Analytics & Optimization (Week 7-8)

### 7.1 Enhanced Analytics
- [ ] Multi-platform analytics aggregation
- [ ] Tracked account management
- [ ] Analytics refresh triggers
- [ ] Performance benchmarking
- [ ] Content mix analysis

### 7.2 Performance Loop
- [ ] Automated weekly review generation
- [ ] Hook performance tracking
- [ ] CTA testing framework
- [ ] A/B test automation
- [ ] Winner detection + scaling

## Phase 8: Production Hardening (Week 9-10)

### 8.1 Resilience
- [ ] Rate limit handling per platform
- [ ] Exponential backoff with jitter
- [ ] Dead letter queue for failed posts
- [ ] Automatic retry with circuit breaker
- [ ] Health monitoring + alerts

### 8.2 Scheduling
- [ ] Persistent job queue
- [ ] Cron-based scheduling
- [ ] Timezone-aware posting
- [ ] Queue management (pause, resume, cancel)
- [ ] Batch scheduling

### 8.3 API + Dashboard
- [ ] REST API for all operations
- [ ] WebSocket for real-time status
- [ ] Simple web dashboard
- [ ] Post preview + approval workflow
- [ ] Team collaboration features

## Architecture Decisions

### Storage
- **Media:** KStorage (S3-compatible, already built)
- **Metadata:** SQLite for local dev, PostgreSQL for production
- **Cache:** Redis for rate limit tracking + job queue

### Platform APIs
- **TikTok:** Research API + Content Posting API
- **Instagram:** Graph API
- **YouTube:** Data API v3
- **Pinterest:** API v5
- **LinkedIn:** Marketing API
- **Facebook:** Graph API

### Tech Stack
- Runtime: Bun
- Language: TypeScript strict
- Video: Remotion
- AI: Gemini (Flash for text, Nano Banana for images)
- Queue: BullMQ (Redis-backed)
- API: Hono

## File Structure (Target)

```
sarawan-social/
├── packages/
│   ├── core/                    # Shared utilities
│   │   ├── storage/             # KStorage integration
│   │   ├── queue/               # Job queue
│   │   └── analytics/           # Analytics aggregation
│   ├── platforms/               # Platform clients
│   │   ├── tiktok/
│   │   ├── instagram/
│   │   ├── youtube/
│   │   ├── pinterest/
│   │   ├── linkedin/
│   │   └── facebook/
│   ├── content/                 # Content generation
│   │   ├── slideshow/           # Slideshow engine
│   │   ├── templates/           # Template system
│   │   ├── packs/               # Pack management
│   │   └── ai/                  # AI tools
│   └── api/                     # REST API server
├── extensions/
│   └── google-media/            # OpenClaw plugin (current)
├── remotion-template/           # Video templates (current)
└── docs/
    ├── api/                     # API documentation
    ├── guides/                  # User guides
    └── references/              # Reference docs
```

## Success Metrics

- [ ] Post to all 6 platforms without manual intervention
- [ ] Generate + post 30 pieces of content/day
- [ ] Analytics correlation accuracy > 95%
- [ ] System uptime > 99.5%
- [ ] Zero third-party SaaS dependencies for core features
- [ ] Cost < $50/day at full scale (vs Genviral's credit system)

## Next Actions

1. Build media storage tools (upload, list-files)
2. Build pack management system
3. Build template system
4. Add YouTube + Pinterest platform clients
5. Build trend-brief niche research tool
