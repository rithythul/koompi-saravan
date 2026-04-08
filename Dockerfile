FROM node:22-alpine

WORKDIR /app

# Install Bun
RUN npm install -g bun

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Expose API port
EXPOSE 3001

ENV PORT=3001

CMD ["bun", "run", "src/api/server.ts"]
