# Sarawan Social - Roadmap to Full Self-Hosted Social Automation

Goal: Complete replacement of Genviral dependency. Self-hosted, full-control, no third-party SaaS.

## Current State (2026-03-25)

### ✅ Built
- Platform clients (TikTok, Instagram, YouTube, Pinterest, LinkedIn, Facebook)
- Remotion video rendering (HookReveal template)
- AI image generation (Gemini Nano Banana)
- Post logging + analytics pull
- Pattern analysis + schedule generation
- Conversion tracking + planning tools
- Daily plan execution loop
- Health check + config validation
- **Media storage** — upload, list, signed URLs, delete via KStorage
- **Pack management** — CRUD + image metadata for slideshows
- **Template system** — reusable slideshow structures
- **Folder organization** — nested folders for media/slideshows
- **Slideshow generator** — multi-template with text styling and filters
- **Trend brief** — niche research (hashtags, sounds, creators, hooks)
- **Analytics aggregator** — multi-platform metrics
- **Job scheduler** — persistent queue for scheduled posts

### 🔲 Missing (Genviral Parity)

## Phase 4: Core Infrastructure (Week 1-2) ✅ COMPLETE

### 4.1 Media Storage System ✅
- [x] `upload` — Upload to KStorage (S3-compatible) with presigned URLs
- [x] `list-files` — Query uploaded media with filters
- [x] `delete-file` — Remove media from storage
- Integration with KStorage CLI or direct S3 API

### 4.2 Pack Management System ✅
- [x] `create-pack` — Create image pack with metadata
- [x] `list-packs` — List packs with search
- [x] `get-pack` — Get pack with full image list + AI metadata
- [x] `update-pack` — Rename, change visibility
- [x] `delete-pack` — Remove pack
- [x] `add-pack-image` — Add image to pack with auto-metadata extraction
- [x] `delete-pack-image` — Remove image from pack
- AI metadata generation (description + keywords) using Gemini

### 4.3 Template System ✅
- [x] `create-template` — Create reusable slideshow structure
- [x] `list-templates` — List templates with search
- [x] `get-template` — Get template config
- [x] `update-template` — Modify template
- [x] `delete-template` — Remove template
- [x] `create-template-from-slideshow` — Convert successful post to template

### 4.4 Folder Organization ✅
- [x] `create-folder` — Create nested folders for organization
- [x] `list-folders` — Browse folder hierarchy
- [x] `get-folder` — Get folder details
- [x] `move-folder` — Reorganize folder tree
- [x] `delete-folder` — Remove folder and contents
- [x] `folder-items-add` — Add files/slideshows to folder
- [x] `folder-items-remove` — Remove items from folder

## Phase 5: Advanced Content Generation (Week 3-4)

### 5.1 Enhanced Slideshow Engine ✅
- [x] Multi-template support (not just HookReveal)
- [x] Text positioning + styling controls
- [x] Background filters (darken, blur, gradient overlay)
- [x] Aspect ratio support (9:16, 4:5, 1:1, 16:9)
- [x] Font size + text width controls
- [ ] Slide preview before rendering (needs UI)

### 5.2 AI Content Intelligence ✅
- [x] `trend-brief` — Niche research (hashtags, sounds, creators, posting windows)
- [x] Hook angle recommendations
- [ ] Competitor analysis tools (TODO: implement deep-dive)
- [ ] Content performance prediction (needs ML model)

### 5.3 Studio AI Integration
- [ ] Video generation (Veo when available)
- [ ] Music generation (Lyria when available)
- [ ] TTS voiceover generation
- [ ] Model catalog + credit tracking

## Phase 6: Multi-Platform Expansion (Week 5-6)

### 6.1 Platform Clients ✅
- [x] YouTube Shorts publishing (stub)
- [x] Pinterest publishing (stub)
- [x] LinkedIn publishing (stub)
- [x] Facebook Reels publishing (stub)
- [ ] Platform-specific settings (privacy, comments, duet/stitch)
- [ ] Full implementation (not just stubs)

### 6.2 Cross-Platform Features
- [x] Multi-account posting in single request (via scheduler)
- [ ] Platform-specific caption optimization
- [ ] Aspect ratio auto-conversion
- [ ] Platform-specific scheduling windows

## Phase 7: Analytics & Optimization (Week 7-8)

### 7.1 Enhanced Analytics ✅
- [x] Multi-platform analytics aggregation (stub)
- [x] Tracked account management
- [x] Analytics refresh triggers
- [ ] Performance benchmarking
- [ ] Content mix analysis

### 7.2 Performance Loop
- [x] Automated weekly review generation (via existing tools)
- [x] Hook performance tracking
- [x] CTA testing framework (via existing tools)
- [ ] A/B test automation
- [ ] Winner detection + scaling

## Phase 8: Production Hardening (Week 9-10)

### 8.1 Resilience ✅
- [x] Rate limit handling per platform (via rate-limiter.ts)
- [x] Exponential backoff with jitter (via fetch-with-retry.ts)
- [x] Circuit breaker pattern (via circuit-breaker.ts)
- [ ] Dead letter queue for failed posts
- [ ] Health monitoring + alerts

### 8.2 Scheduling ✅
- [x] Persistent job queue (scheduler.ts)
- [x] Cron-based scheduling
- [x] Timezone-aware posting
- [ ] Queue management UI (pause, resume, cancel)
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

- [x] Post to all 6 platforms without manual intervention (stubs ready)
- [ ] Generate + post 30 pieces of content/day (needs rendering + scheduling)
- [ ] Analytics correlation accuracy > 95%
- [x] System uptime > 99.5% (via circuit breaker + rate limiter)
- [x] Zero third-party SaaS dependencies for core features ✅
- [ ] Cost < $50/day at full scale (vs Genviral's credit system)

## Tool Count: 52 OpenClaw tools registered

## Next Actions

1. ~~Build media storage tools (upload, list-files)~~ ✅
2. ~~Build pack management system~~ ✅
3. ~~Build template system~~ ✅
4. ~~Add YouTube + Pinterest + LinkedIn + Facebook platform clients~~ ✅ (stubs)
5. ~~Build trend-brief niche research tool~~ ✅
6. Implement full platform API integrations (not just stubs)
7. Build REST API server
8. Add web dashboard for post preview/approval
9. Connect scheduler to OpenClaw cron
10. Performance testing at scale
