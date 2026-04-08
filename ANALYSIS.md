# Sarawan Social — Codebase Analysis

**Date:** 2026-04-09
**Scope:** Full codebase review for production readiness

---

## Summary

Sarawan Social is a well-structured social media automation platform with 8 platform clients, a Hono-based REST API, and an analytics store. The codebase is in good shape overall but has gaps before it's production-ready.

## Type Errors

- **`src/api/routes/publish.ts:64-68`** — Fixed. `results` array had mixed types (`PostResult` vs inline `{ warnings }` objects) causing `postId` access errors. Resolved by normalizing to `PublishResponse[]`.

## Architecture Issues

1. **Dual database system** — `src/api/lib/db.ts` (PostgreSQL) and `src/api/lib/analytics-store.ts` (SQLite via `bun:sqlite`) run in parallel. The analytics store uses SQLite exclusively regardless of DATABASE_URL. No data flows between them.
2. **No shared types between OpenClaw plugin and REST API** — `extensions/publisher/` and `src/api/` define their own publish/content types independently.
3. **Platform config inconsistency** — `src/config.ts` reads env vars differently than `src/api/routes/platforms.ts` checks them. Example: config reads `FACEBOOK_PAGE_ACCESS_TOKEN`, routes check `FACEBOOK_ACCESS_TOKEN`.
4. **No input validation library** — Despite `@hono/zod-validator` being installed, no route uses it. Validation is manual `if` checks.
5. **`analytics-store.ts` uses `any[]` params** — violates strict TypeScript. Lines in `getPostsByPlatform` and `getPosts`.

## Security Concerns

1. **Auth middleware skips when API_KEY is not set** — "dev mode" makes the entire API unauthenticated. Should be explicit opt-in, not default.
2. **CORS allows all origins** — `origin: '*'` in production is a security risk.
3. **Rate limiter is in-memory** — Resets on restart, doesn't work across multiple instances.
4. **No request body size limits** — Upload endpoints accept any size.
5. **Platform credentials exposed in platform status endpoint** — `checkPlatformConfigured` reveals which secrets are set (boolean leak).

## Missing Features

1. **Media upload** — All 6 media endpoints are stubs returning "not yet implemented"
2. **Analytics fetching** — Returns zeros; no actual platform API calls
3. **Post deletion** — Returns "must be done manually"
4. **No WebSocket** for real-time status
5. **No admin UI/dashboard**

## Code Quality

1. **`any` types** in `db.ts` (`query<T = any>`) and `analytics-store.ts` (params arrays)
2. **Dead file** — `tiktok-login.js` in root (plain JS, not part of build)
3. **Pipeline dir** excluded from typecheck — `src/pipeline/PipelineController.ts` not checked
4. **No tests** — `bun test` would fail (no test files exist)
5. **No linter config** — no ESLint or Biome

## Dockerfile

- Single stage (not multi-stage)
- Runs as root
- No health check instruction
- Uses `npm install -g bun` instead of official Bun image
- No `.dockerignore` visible

## Dependencies

- Clean and minimal: hono, zod-validator, playwright, postgres
- `playwright` is heavy for a server — only needed if doing browser automation for platform auth
- `@hono/zod-validator` installed but unused

## Recommendations Priority

| Priority | Item |
|----------|------|
| **P0** | Fix type errors ✅, auth middleware default-deny, CORS restriction |
| **P1** | Multi-stage Dockerfile, structured logging, graceful shutdown (already exists), docker-compose, deploy script, nginx config |
| **P2** | Zod validation on all routes, fix `any` types, unified config |
| **P3** | Actual analytics fetching, media upload implementation, dashboard |
