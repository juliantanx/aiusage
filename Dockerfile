FROM node:20-slim

LABEL org.opencontainers.image.title="aiusage" \
      org.opencontainers.image.description="Track AI coding assistant usage, token consumption, cost, and tool calls across Claude Code, Codex, OpenCode, and more" \
      org.opencontainers.image.url="https://github.com/juliantanx/aiusage" \
      org.opencontainers.image.source="https://github.com/juliantanx/aiusage" \
      org.opencontainers.image.licenses="MIT"

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile

COPY . .
# Only build server packages (skip Electron widget)
RUN pnpm --filter @aiusage/core build && pnpm --filter @aiusage/web build && pnpm --filter @juliantanx/aiusage build

VOLUME /root/.aiusage
EXPOSE 3847

CMD ["node", "packages/cli/dist/index.js", "serve", "--host", "0.0.0.0", "--port", "3847"]
