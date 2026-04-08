# ---- Build stage ----
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production=false

COPY tsconfig.json ./
COPY src ./src

# Typecheck
RUN bun run typecheck

# ---- Production stage ----
FROM oven/bun:1-alpine AS production

# Non-root user
RUN addgroup -S sarawan && adduser -S sarawan -G sarawan

WORKDIR /app

# Install production deps only
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Create data directory for SQLite
RUN mkdir -p /app/var && chown sarawan:sarawan /app/var

USER sarawan

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["bun", "run", "src/api/server.ts"]
