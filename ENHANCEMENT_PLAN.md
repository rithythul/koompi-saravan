# Sarawan Social — Enhancement Plan

**Date:** 2026-04-09

---

## Phase 1: Quick Wins ✅ (Done)

- [x] Fix TypeScript errors in `publish.ts`
- [x] Multi-stage Dockerfile with non-root user, health check, proper layering
- [x] Structured JSON logging
- [x] Graceful shutdown (already existed, verified)
- [x] `docker-compose.yml` with API + PostgreSQL
- [x] `nginx.conf` reverse proxy
- [x] `koompi-cloud-deploy.sh` deployment script

## Phase 2: Architecture Improvements (Should-Have)

- [ ] **Fix auth middleware** — default to auth-required; dev mode opt-in via `AUTH_DISABLED=true`
- [ ] **CORS restriction** — configurable origins via `CORS_ORIGINS` env var
- [ ] **Add Zod validation** to all route handlers (lib already installed)
- [ ] **Eliminate `any` types** — typed params in analytics-store and db
- [ ] **Unify platform config** — single source of truth for env var names
- [ ] **Choose one database** — PostgreSQL or SQLite, not both with no sync
- [ ] **Add request body size limits** — especially for upload endpoints
- [ ] **Add ESLint/Biome** for consistent code quality

## Phase 3: Production Readiness (Must-Have Before Deploy)

- [ ] **Proper secrets management** — never log credentials, validate at startup
- [ ] **Health check endpoint** — include DB connectivity status
- [ ] **Request ID middleware** — for tracing
- [ ] **Structured error responses** — consistent error format
- [ ] **Startup validation** — fail fast on missing required env vars
- [ ] **SSL/TLS** — handled by nginx reverse proxy
- [ ] **Log rotation** — configured in deploy script

## Phase 4: Missing Features (Nice-to-Have)

- [ ] **Media upload implementation** — multipart form → KStorage/S3
- [ ] **Analytics fetching** — actual platform API calls for metrics
- [ ] **Post deletion** — call platform delete APIs
- [ ] **WebSocket** for real-time publish status
- [ ] **Web dashboard** — React or HTML-based UI
- [ ] **Test suite** — at minimum, route handler tests

---

## Dependencies

No new dependencies needed for Phase 1-2. Phase 3+ may need:
- `zod` schemas (already have `@hono/zod-validator`)
- `helmet` for security headers (or manual Hono headers)
- `pino` for production logging (or keep custom JSON logger)
