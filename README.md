# aiusage

Track AI coding assistant usage, token consumption, cost, and tool calls in one place across Claude Code, Codex, OpenClaw, and OpenCode.

English | [中文](./README_zh.md)

## Why aiusage

- Aggregate local session logs from multiple AI coding assistants into one view.
- Analyze token usage, cost, model mix, and tool call activity.
- Explore the data through a local dashboard with weekly and monthly views.
- Sync usage data across multiple machines with GitHub, S3, or R2.
- Keep everything local-first, with optional cloud sync when you need shared visibility.

## Quick Start

**Prerequisites:** Node.js >= 18

```bash
# Install
npm install -g @juliantanx/aiusage

# Parse local session logs
aiusage parse

# Start the dashboard
aiusage serve
# Open http://localhost:3847
```

Day-to-day usage is usually just:

```bash
aiusage parse
aiusage serve
```

`aiusage` does not run a built-in background parser. If you want automatic imports, schedule `aiusage parse` with cron or Task Scheduler.

<details>
<summary>Build from source</summary>

```bash
git clone https://github.com/juliantanx/aiusage.git
cd aiusage
pnpm install
pnpm build
cd packages/cli
npm link
```

</details>

## Screenshot

![Weekly overview dashboard](./docs/assets/readme/weekly-overview.png)

Weekly overview of cost, tokens, active days, and tool usage across assistants.

## Common Commands

| Command | Purpose |
| --- | --- |
| `aiusage parse` | Import newly appended local session data |
| `aiusage serve` | Start the local dashboard |
| `aiusage summary` | Print a usage summary in the terminal |
| `aiusage status` | Show database path, schema version, and record counts |
| `aiusage sync` | Push and pull data with a configured remote backend |
| `aiusage export` | Export records as CSV, JSON, or NDJSON |
| `aiusage clean` | Remove old data |
| `aiusage recalc` | Recalculate costs with updated pricing |
| `aiusage init` | Configure a sync backend |

## Web Dashboard

```bash
aiusage serve
# Open http://localhost:3847
```

On the overview page's first load, the dashboard triggers `/api/refresh`, which runs one incremental local parse before loading summary data.

- **Overview** — weekly or monthly totals, cost, active days, and per-tool breakdowns.
- **Tokens** — token usage trends over time.
- **Cost** — cost trends with by-tool and by-model breakdowns.
- **Models** — model share and distribution.
- **Tool Calls** — tool call frequency and ranking.
- **Projects** — project-level usage rollups.
- **Sessions** — session browsing with filters and pagination.
- **Pricing** — active model pricing reference.

---

## Deployment

Need multi-machine aggregation or cloud access? Choose your scenario:

| Scenario | Method | Description |
|----------|--------|-------------|
| Multiple machines, aggregate data | [Multi-Machine Sync](#multi-machine-sync) | Sync via GitHub/S3/R2 |
| Multiple machines + unified dashboard | [Docker Deployment](#docker-deployment) | Run a 24/7 dashboard from synced data |

For single-machine usage, Quick Start is enough.

### Multi-Machine Sync

Use this to aggregate token usage from multiple machines into one dashboard. Works with Claude Code, Codex, OpenClaw, and OpenCode.

**Architecture:**

```
Machine A ──┐
Machine B ──┼──▶ GitHub / S3 / R2 (shared storage) ──▶ Any machine: aiusage summary / serve
Machine C ──┘
```

**Step 1 — Choose a sync backend**

**Option A: GitHub (recommended)**

1. Create a **private** repository on GitHub (for example `aiusage-data`)
2. Generate a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope

**Option B: AWS S3 / Cloudflare R2**

1. Create an S3 or R2 bucket
2. Create an IAM user or role with read/write permissions
3. Note the access key ID, secret access key, and endpoint

**Step 2 — Install and configure on each machine**

On every machine that uses Claude Code, Codex, OpenClaw, or OpenCode:

```bash
# Install aiusage CLI
npm install -g @juliantanx/aiusage

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

**Step 3 — Parse and sync on each machine**

```bash
aiusage parse
aiusage sync
```

**Step 4 — View aggregated data on any machine**

```bash
aiusage sync
aiusage summary
aiusage serve
```

**Automate (recommended)**

```bash
# Linux/macOS
crontab -e
# Add:
*/30 * * * * /usr/local/bin/aiusage parse && /usr/local/bin/aiusage sync >> ~/.aiusage/cron.log 2>&1

# Windows
schtasks /create /tn "AiusageSync" /tr "aiusage parse && aiusage sync" /sc minute /mo 30
```

**How sync works**

- Each machine has a unique `deviceInstanceId` generated on first run.
- Each device writes to its own daily file (`{deviceInstanceId}/YYYY/MM/DD.ndjson`) in the remote backend.
- Pull reads other devices' files into the local `synced_records` table; upload writes only this device's files.
- Device-partitioned files avoid write conflicts, so no locking is needed.
- Sync frequency comes from your external scheduler or manual runs; aiusage does not include a built-in sync daemon.
- Session IDs are anonymized via `sha256(device + sessionId)`.

---

### Docker Deployment

Run the pre-built image on a server for a 24/7 dashboard. The container does **not** run any AI coding tools itself — it only serves the web dashboard and pulls synced data from GitHub, S3, or R2.

**Architecture:**

```
Machine A ──┐                           ┌── Browser: https://aiusage.your-domain.com
Machine B ──┼──▶ GitHub / S3 / R2 ──▶ Cloud Server (Docker)
Machine C ──┘                           └── port 3847
```

**How data flows**

1. Each dev machine runs `aiusage parse && aiusage sync` to upload local usage data.
2. The Docker container runs `aiusage sync` to pull that data into its local SQLite database.
3. The web dashboard reads from the local database and displays aggregated stats.

**Data storage in Docker**

| Item | Container path | Description |
|------|---------------|-------------|
| Database | `/root/.aiusage/cache.db` | SQLite database with aggregated usage data |
| Config | `/root/.aiusage/config.json` | Sync backend config and credentials |
| State | `/root/.aiusage/state.json` | Watermarks and sync state |

All data lives under `/root/.aiusage`, which is declared as a `VOLUME`. You **must** mount this volume to persist data across container restarts.

**Step 1 — Pull image and run**

```bash
# Pull image
docker pull juliantanx/aiusage

# Run container (mount volume for data persistence)
docker run -d \
  --name aiusage \
  -p 3847:3847 \
  -v aiusage-data:/root/.aiusage \
  juliantanx/aiusage

# Configure sync backend
docker exec -it aiusage aiusage init \
  --backend github \
  --repo <user>/aiusage-data \
  --token ghp_xxxxxxxxxxxxxxxxxxxx

# Initial data pull
docker exec -it aiusage aiusage sync
```

> Without the `-v` flag, data is lost when the container is removed.

**Step 2 — Scheduled sync**

```bash
# Install cron in container and create scheduled task
docker exec -it aiusage bash -c "apt-get update && apt-get install -y cron"
docker exec -it aiusage bash -c \
  'echo "*/30 * * * * aiusage sync >> /root/.aiusage/cron.log 2>&1" | crontab -'
docker restart aiusage
```

> Note: `parse` is not needed here — the container has no local AI session logs. Only `sync` is needed to pull data from the remote backend.

**Step 3 — Access**

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

**Build image yourself (optional)**

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

### Default Source Paths

`aiusage parse` auto-discovers session logs from the following default locations:

| Tool | macOS | Linux | Windows |
|------|-------|-------|---------|
| Claude Code | `~/.claude/projects/` | `~/.claude/projects/` | `%USERPROFILE%\.claude\projects\` |
| Codex | `~/.codex/sessions/` | `~/.codex/sessions/` | `%USERPROFILE%\.codex\sessions\` |
| OpenClaw | `~/.openclaw/agents/*/sessions/` | `~/.openclaw/agents/*/sessions/` | `%USERPROFILE%\.openclaw\agents\*\sessions\` |
| OpenCode | `~/Library/Application Support/opencode/opencode.db` | `~/.local/share/opencode/opencode.db` | `%APPDATA%\opencode\opencode.db` |

> On Linux, OpenCode respects `$XDG_DATA_HOME` if set.

### Custom Source Paths

If you installed a tool to a non-default location, override the paths in `~/.aiusage/config.json`:

```json
{
  "sources": {
    "claude-code": "/custom/path/.claude/projects",
    "codex": "/custom/path/.codex/sessions",
    "openclaw": "/custom/sessions-dir",
    "opencode": "/custom/path/opencode.db"
  }
}
```

Only the paths you specify are overridden; unspecified tools fall back to their defaults.

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

```text
packages/
  core/     - Shared types, database schema, pricing data
  cli/      - CLI tool for parsing logs, querying data, cloud sync
  web/      - SvelteKit web dashboard (SPA)
```

## License

MIT
