# aiusage

Track and analyze AI coding assistant usage across Claude Code, Codex, and OpenClaw. Aggregates token consumption, costs, and tool call statistics from local session logs.

English | [中文](./README_zh.md)

## Project Structure

```
packages/
  core/     - Shared types, database schema, pricing data
  cli/      - CLI tool for parsing logs, querying data, cloud sync
  web/      - SvelteKit web dashboard (SPA)
```

## Tech Stack

- **Runtime:** Node.js, TypeScript
- **Database:** better-sqlite3 (local, WAL mode)
- **CLI:** Commander.js
- **Web:** SvelteKit + adapter-static
- **Build:** tsup (core/cli), Vite (web)
- **Tests:** Vitest
- **Sync:** GitHub API, AWS S3 / Cloudflare R2

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## CLI Commands

```bash
# Show usage summary
aiusage summary [--week|--month] [--from YYYY-MM-DD] [--to YYYY-MM-DD]

# Show current status
aiusage status

# Export data
aiusage export --format csv|json|ndjson [--range day|week|month] [-o file]

# Start web dashboard
aiusage serve [--port 3847]

# Clean old data
aiusage clean [--before 30d] [--remote] [--all-devices]

# Recalculate costs
aiusage recalc [--pricing]

# Configure cloud sync
aiusage init --backend github --repo user/repo --token ghp_...
aiusage init --backend s3 --bucket my-bucket --access-key-id ... --secret-access-key ...

# Run sync
aiusage sync
```

## Web Dashboard

The web dashboard provides a browser-based view of usage data with:

- **Overview** — total tokens, cost, active days, per-tool breakdown
- **Tokens** — daily token usage chart (input/output/thinking)
- **Cost** — daily cost chart with by-tool and by-model breakdowns
- **Models** — model distribution with usage share
- **Tool Calls** — tool call frequency ranking
- **Sessions** — session list with filtering and pagination

Start the dashboard:

```bash
aiusage serve
# Open http://localhost:3847
```

## Cloud Sync

Sync usage data across devices via GitHub or S3-compatible storage.

### GitHub

```bash
aiusage init --backend github --repo user/aiusage-data --token ghp_xxxx
aiusage sync
```

### S3 / Cloudflare R2

```bash
aiusage init --backend s3 \
  --bucket my-bucket \
  --prefix aiusage/ \
  --endpoint https://xxx.r2.cloudflarestorage.com \
  --region auto \
  --access-key-id AKIA... \
  --secret-access-key ...

aiusage sync
```

Sync uses optimistic locking (ETag on S3, SHA on GitHub) to prevent conflicts across devices. Consent is verified via SHA256 fingerprint before each sync.

## Data Storage

- Local database: `~/.aiusage/cache.db`
- Config: `~/.aiusage/config.json`
- State: `~/.aiusage/state.json`

## License

MIT
