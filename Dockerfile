FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

VOLUME /root/.aiusage
EXPOSE 3847

CMD ["node", "packages/cli/dist/index.js", "serve", "--port", "3847"]
