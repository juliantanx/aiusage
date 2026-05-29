FROM node:20-slim AS builder

ARG BUILD_DATE

LABEL org.opencontainers.image.title="aiusage-site" \
      org.opencontainers.image.description="Official website and documentation for AIUsage — track AI coding assistant usage, token consumption, costs, and tool calls across Claude Code, Codex, Cursor, and more" \
      org.opencontainers.image.url="https://github.com/juliantanx/aiusage" \
      org.opencontainers.image.source="https://github.com/juliantanx/aiusage" \
      org.opencontainers.image.documentation="https://github.com/juliantanx/aiusage/tree/main/packages/site" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="juliantanx" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.authors="Julian <juliantanx@users.noreply.github.com>"

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/site/package.json packages/site/

RUN pnpm install --frozen-lockfile

COPY packages/core/ packages/core/
COPY packages/site/ packages/site/

RUN pnpm --filter @aiusage/core build && pnpm --filter @aiusage/site build

FROM node:20-slim

LABEL org.opencontainers.image.title="aiusage-site" \
      org.opencontainers.image.description="Official website and documentation for AIUsage — track AI coding assistant usage, token consumption, costs, and tool calls across Claude Code, Codex, Cursor, and more" \
      org.opencontainers.image.url="https://github.com/juliantanx/aiusage" \
      org.opencontainers.image.source="https://github.com/juliantanx/aiusage" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="juliantanx"

WORKDIR /app

COPY --from=builder /app/packages/site/build ./build
COPY --from=builder /app/packages/site/package.json ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => { if (!r.ok) throw new Error('unhealthy') }).catch(() => process.exit(1))"

CMD ["node", "build"]
