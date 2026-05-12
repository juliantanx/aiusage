# AI CLI Stats — Design Spec

**Date:** 2026-05-12
**Status:** Approved

## Overview

A CLI tool that passively reads local session logs from AI coding assistants (Claude Code, Codex, OpenClaw), aggregates token usage, tool call frequency, and model distribution, then presents the data via a terminal summary and a local web dashboard. Multi-device data is synced through user-provided cloud storage.

## Goals

- Track token consumption (input, output, cache) per tool and model
- Show cost breakdown by tool, model, provider, and time period
- Show tool call frequency and distribution
- Support multi-device aggregation via cloud sync
- Install with a single command: `npm i -g ai-cli-stats`
- Run on Windows, macOS, Linux

## Non-Goals

- Real-time interception of API calls (no proxy)
- Hosting a backend service
- Supporting tools without local log files in v1

## Supported Tools (v1)

| Tool | Log Path | Format |
|------|----------|--------|
| Claude Code | `~/.claude/projects/**/*.jsonl` | JSONL, `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}` |
| Codex | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` | JSONL, `event_msg` with `payload.type=token_count` containing `total_token_usage` and `last_token_usage` |
| OpenClaw | `~/.openclaw/agents/*/sessions/*.jsonl` | JSONL, `message.usage.{input, output, cacheRead, cacheWrite, totalTokens, cost}` |

## Architecture

### Monorepo Structure

```
ai-cli-stats/                        # pnpm workspaces
├── packages/
│   ├── core/                        # Pure logic, no IO side effects
│   │   ├── parsers/
│   │   │   ├── claude-code.ts
│   │   │   ├── codex.ts
│   │   │   └── openclaw.ts
│   │   ├── aggregator.ts
│   │   ├── sync/
│   │   │   ├── github.ts
│   │   │   └── s3.ts
│   │   └── types.ts
│   ├── cli/                         # Commander.js entry point
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── serve.ts
│   │   │   ├── summary.ts
│   │   │   └── sync.ts
│   │   └── index.ts
│   └── web/                         # SvelteKit + Chart.js
│       ├── src/
│       │   ├── routes/
│       │   └── lib/
│       └── build/                   # Embedded into CLI package at publish time
└── package.json
```

### Data Flow

```
Local log files
    → Parser (per tool, streams JSONL line by line)
    → Aggregator (normalizes to StatsRecord)
    → Local cache (~/.ai-cli-stats/cache.jsonl)
    → Cloud sync (GitHub private repo or S3/R2)
    → CLI summary output / Web Dashboard API
```

### Unified Data Model

```typescript
interface StatsRecord {
  ts: number                          // Unix timestamp ms
  tool: 'claude-code' | 'codex' | 'openclaw'
  model: string                       // e.g. "claude-sonnet-4-6"
  provider: string                    // e.g. "anthropic", "qianfan"
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number                        // USD, 0 if not available
  toolCalls: { name: string }[]
  sessionId: string
  device: string                      // hostname
}
```

## CLI Commands

```bash
ai-stats init           # First-run wizard: configure cloud storage credentials
ai-stats                # Launch Web Dashboard at http://localhost:3847
ai-stats summary        # Terminal summary (today by default)
ai-stats summary --week # Weekly summary
ai-stats summary --month
ai-stats sync           # Manual cloud sync
```

## Web Dashboard Pages

| Page | Content |
|------|---------|
| Overview | Total tokens, total cost, active days, most-used tool |
| Tokens | Daily/weekly/monthly input+output token trend (line chart) |
| Cost | Cost trend + breakdown by tool/model (pie + bar chart) |
| Models | Model call distribution: call count and token share |
| Tools | Tool call frequency ranking (top N) |
| Sessions | Session list, filterable by tool and date |

## Cloud Sync

Two backends supported, configured via `ai-stats init`:

| Backend | Best For | Setup |
|---------|----------|-------|
| GitHub private repo | Developers | Personal access token |
| S3 / Cloudflare R2 | Power users | Access key + bucket |

**Sync behavior:**
- Incremental: only upload new records since last sync
- Local cache is source of truth; cloud is backup/merge layer
- Deduplication by `sessionId + ts`
- Conflict resolution: last-write-wins per record
- Sync triggered on: `ai-stats sync` (manual) or `ai-stats serve` startup (auto)

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Malformed JSONL line | Skip line, log to `~/.ai-cli-stats/errors.log` |
| Tool not installed (path missing) | Silent skip; note in summary output |
| Cloud sync failure (offline / bad credentials) | Show clear error, local data unaffected |
| Parser format mismatch (tool upgrade) | Error includes file path and line number for issue reporting |

## Cross-Platform Path Handling

```typescript
const TOOL_PATHS = {
  'claude-code': path.join(os.homedir(), '.claude', 'projects'),
  'codex':       path.join(os.homedir(), '.codex', 'sessions'),
  'openclaw':    path.join(os.homedir(), '.openclaw', 'agents'),
}
```

All file paths use `path.join` and `os.homedir()` — no hardcoded Unix paths.

## Testing Strategy

- **Unit**: Each parser tested with real JSONL fixture samples (captured from actual tool sessions). Snapshot tests for parsed output.
- **Integration**: Aggregator tested with mixed multi-tool fixture data to verify correct normalization.
- **E2E**: Full `ai-stats summary` run against a fixture log directory, output format verified.
- **Coverage targets**: `core` package >= 80%, `cli` commands >= 60%.

## Local Config File

Stored at `~/.ai-cli-stats/config.json`:

```json
{
  "sync": {
    "backend": "github",
    "repo": "username/ai-stats-data",
    "token": "<PAT>"
  },
  "device": "macbook-pro"
}
```

Credentials are stored locally only, never committed to the stats data repo.

## Publishing

- Single npm package: `ai-cli-stats`
- Web build output (`packages/web/build/`) is bundled into the CLI package at publish time
- `bin` entry points to `packages/cli/dist/index.js`
- Minimum Node.js version: 18 (LTS)
