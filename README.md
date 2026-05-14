# aiusage

Track and analyze AI coding assistant usage across Claude Code, Codex, and OpenClaw. Aggregates token consumption, costs, and tool call statistics from local session logs.

English | [中文](./README_zh.md)

## Features

- Parse JSONL session logs from Claude Code / Codex / OpenClaw
- Aggregate token usage and cost by tool, model, and date
- Tool call frequency statistics
- Multi-device data sync via GitHub / S3 / R2
- Web dashboard with charts

## Quick Start

**Prerequisites:** Node.js >= 18, pnpm

```bash
# Clone and build
git clone https://github.com/juliantanx/aiusage.git
cd aiusage
pnpm install
pnpm build

# Add CLI to global PATH
cd packages/cli
npm link
cd ../..

# Parse local session logs
aiusage parse

# View usage summary
aiusage summary

# Start web dashboard
aiusage serve
# Open http://localhost:3847
```

Day-to-day usage is just two commands:

```bash
aiusage parse   # ingest new data
aiusage serve   # open dashboard
```

**Automate parsing (optional):**

```bash
# Linux/macOS — every 30 minutes
crontab -e
# Add:
*/30 * * * * /usr/local/bin/aiusage parse >> ~/.aiusage/cron.log 2>&1

# Windows
schtasks /create /tn "AiusageParse" /tr "aiusage parse" /sc minute /mo 30
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `aiusage parse` | Parse local AI session logs into database |
| `aiusage summary` | Show usage summary (supports `--week` `--month`) |
| `aiusage status` | Show current status |
| `aiusage serve` | Start web dashboard (supports `--port`) |
| `aiusage sync` | Sync data with remote backend |
| `aiusage export` | Export data (`--format csv/json/ndjson`) |
| `aiusage clean` | Clean old data (`--before 30d`) |
| `aiusage recalc` | Recalculate costs (`--pricing`) |
| `aiusage init` | Configure sync backend (`--backend github/s3`) |

## Web Dashboard

```bash
aiusage serve
# Open http://localhost:3847
```

- **Overview** — total tokens, cost, active days, per-tool breakdown
- **Tokens** — daily token usage chart (input/output/thinking)
- **Cost** — daily cost chart with by-tool and by-model breakdowns
- **Models** — model distribution with usage share
- **Tool Calls** — tool call frequency ranking
- **Sessions** — session list with filtering and pagination

---

## Deployment

Need multi-machine aggregation or cloud access? Choose your scenario:

| Scenario | Method | Description |
|----------|--------|-------------|
| Multiple machines, aggregate data | [Multi-Machine Sync](#multi-machine-sync) | Sync via GitHub/S3 |
| Multiple machines + unified dashboard | [Docker](#docker-deployment) | Pull image, 24/7 dashboard |

For single-machine usage, just follow the Quick Start above — no extra setup needed.

### Multi-Machine Sync

Use this to aggregate token usage from multiple machines into one dashboard.

**Architecture:**

```
Machine A ──┐
Machine B ──┼──▶ GitHub / S3 (shared storage) ──▶ Any machine: aiusage summary / serve
Machine C ──┘
```

**Step 1 — Choose a sync backend:**

**Option A: GitHub (recommended)**

1. Create a **private** repository on GitHub (e.g. `aiusage-data`)
2. Generate a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope

**Option B: AWS S3 / Cloudflare R2**

1. Create an S3 or R2 bucket
2. Create an IAM user/role with read/write permissions
3. Note the access key ID, secret access key, and endpoint

**Step 2 — Install and configure on each machine:**

On **every** machine that uses Claude Code / Codex / OpenClaw:

```bash
# Install aiusage CLI
git clone https://github.com/juliantanx/aiusage.git
cd aiusage
pnpm install
pnpm build
cd packages/cli
npm link
cd ../..

# Configure sync backend — GitHub
aiusage init --backend github \
  --repo <user>/aiusage-data \
  --token ghp_xxxxxxxxxxxxxxxxxxxx

# OR configure sync backend — S3 / R2
aiusage init --backend s3 \
  --bucket my-aiusage-bucket \
  --prefix aiusage/ \
  --endpoint https://<account-id>.r2.cloudflarestorage.com \
  --region auto \
  --access-key-id AKIAxxxxxxxxxxxx \
  --secret-access-key xxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Step 3 — Parse and sync (each machine):**

```bash
aiusage parse
aiusage sync
```

**Step 4 — View aggregated data (any machine):**

```bash
aiusage sync      # pull latest data from all machines
aiusage summary   # view summary
aiusage serve     # or start dashboard
```

**Automate (recommended):**

```bash
# Linux/macOS
crontab -e
# Add:
*/30 * * * * /usr/local/bin/aiusage parse && /usr/local/bin/aiusage sync >> ~/.aiusage/cron.log 2>&1

# Windows
schtasks /create /tn "AiusageSync" /tr "aiusage parse && aiusage sync" /sc minute /mo 30
```

**How sync works:**

- Each machine has a unique `deviceInstanceId` (generated on first run)
- Data is stored as monthly NDJSON files (`YYYY/MM.ndjson`) in the remote backend
- Pull merges remote records into local `synced_records` table; Upload merges local records to remote (never overwrites)
- Optimistic locking (ETag on S3, SHA on GitHub) prevents conflicts
- Session IDs are anonymized via `sha256(device + sessionId)`

---

### Docker Deployment

Run on a cloud server with the pre-built image. Data from all machines is aggregated via the sync backend automatically.

**Architecture:**

```
Machine A ──┐                           ┌── Browser: https://aiusage.your-domain.com
Machine B ──┼──▶ GitHub / S3 ──▶ Cloud Server (Docker)
Machine C ──┘                           └── port 3847
```

**Step 1 — Pull image and run:**

```bash
# Pull image
docker pull juliantanx/aiusage

# Run container
docker run -d \
  --name aiusage \
  -p 3847:3847 \
  -v aiusage-data:/root/.aiusage \
  juliantanx/aiusage

# Configure sync backend
docker exec -it aiusage node packages/cli/dist/index.js init \
  --backend github \
  --repo <user>/aiusage-data \
  --token ghp_xxxxxxxxxxxxxxxxxxxx

# Initial data pull
docker exec -it aiusage node packages/cli/dist/index.js sync
```

**Step 2 — Scheduled sync:**

```bash
# Install cron in container and create scheduled task
docker exec -it aiusage bash -c "apt-get update && apt-get install -y cron"
docker exec -it aiusage bash -c \
  'echo "*/30 * * * * node /app/packages/cli/dist/index.js parse && node /app/packages/cli/dist/index.js sync >> /root/.aiusage/cron.log 2>&1" | crontab -'
docker restart aiusage
```

**Step 3 — Access:**

Open `http://<server-ip>:3847`.

For HTTPS with a custom domain:

```bash
# Caddy (auto HTTPS, recommended)
caddy reverse-proxy --from aiusage.your-domain.com --to localhost:3847

# Or Nginx
server {
    listen 80;
    server_name aiusage.your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3847;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Build image yourself (optional):**

A `Dockerfile` is included in the project root:

```bash
docker build -t aiusage .
```

---

## Data Storage

| Item | Path |
|------|------|
| Local database | `~/.aiusage/cache.db` |
| Config | `~/.aiusage/config.json` |
| State (watermarks, sync) | `~/.aiusage/state.json` |

## Database Visualization

The local database is a standard SQLite file, so you can open it directly in DBeaver, TablePlus, DataGrip, DB Browser for SQLite, or any similar tool.

```bash
aiusage status
# Shows the exact DB Path, schema version, and object counts
```

- Open `~/.aiusage/cache.db` as a SQLite database.
- Prefer read-only mode in your database tool. `aiusage` writes to the same file and uses WAL mode.
- If your tool asks about sidecar files, keep `cache.db-wal` and `cache.db-shm` alongside the main database file.
- Start with the read-only views:
  - `v_usage_records`: one row per usage record with normalized timestamp and token totals
  - `v_tool_calls`: tool call rows joined with their parent usage record
  - `v_sessions`: session-level aggregates for pivoting and charting
- Raw internal tables remain available for advanced inspection:
  - `records`
  - `tool_calls`
  - `synced_records`
  - `sync_tombstones`

## Tech Stack

- **Runtime:** Node.js, TypeScript
- **Database:** better-sqlite3 (local, WAL mode)
- **CLI:** Commander.js
- **Web:** SvelteKit + adapter-static
- **Build:** tsup (core/cli), Vite (web)
- **Sync:** GitHub API, AWS S3 / Cloudflare R2

## Project Structure

```
packages/
  core/     - Shared types, database schema, pricing data
  cli/      - CLI tool for parsing logs, querying data, cloud sync
  web/      - SvelteKit web dashboard (SPA)
```

## License

MIT
