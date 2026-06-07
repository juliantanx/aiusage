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

# Pin pnpm to v9 (compatible with Node 20)
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./

# Copy package.json files for each workspace package
COPY packages/core/package.json packages/core/
COPY packages/site/package.json packages/site/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/core/ packages/core/
COPY packages/site/ packages/site/

# Build
RUN pnpm --filter @aiusage/core build && pnpm --filter @aiusage/site build

# Prepare production directory: copy build output and create a standalone package
# with the workspace core package converted to a local file dependency.
RUN mkdir -p /deploy && \
    cp -r /app/packages/site/build /deploy/build && \
    mkdir -p /deploy/packages/core && \
    cp -r /app/packages/core/dist /deploy/packages/core/dist && \
    cp /app/packages/core/package.json /deploy/packages/core/package.json && \
    cat /app/packages/site/package.json | \
      node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('/dev/stdin','utf8')); delete pkg.devDependencies; delete pkg.scripts; pkg.type='module'; pkg.dependencies=pkg.dependencies||{}; pkg.dependencies['@aiusage/core']='file:./packages/core'; fs.writeFileSync('/deploy/package.json',JSON.stringify(pkg,null,2)+'\n')" && \
    cd /deploy && npm install --omit=dev

FROM node:20-slim

LABEL org.opencontainers.image.title="aiusage-site" \
      org.opencontainers.image.description="Official website and documentation for AIUsage — track AI coding assistant usage, token consumption, costs, and tool calls across Claude Code, Codex, Cursor, and more" \
      org.opencontainers.image.url="https://github.com/juliantanx/aiusage" \
      org.opencontainers.image.source="https://github.com/juliantanx/aiusage" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="juliantanx"

WORKDIR /app

COPY --from=builder /deploy/build ./build
COPY --from=builder /deploy/package.json ./
COPY --from=builder /deploy/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => { if (!r.ok) throw new Error('unhealthy') }).catch(() => process.exit(1))"

CMD ["node", "build"]
