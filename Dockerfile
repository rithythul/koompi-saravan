FROM oven/bun:1

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build
RUN bun build src/api/server.ts --outdir dist --target bun

# Expose API port
EXPOSE 3001

ENV PORT=3001

CMD ["bun", "run", "src/api/server.ts"]
