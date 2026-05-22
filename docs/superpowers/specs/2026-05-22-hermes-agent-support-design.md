# F1: Hermes Agent Support — Design Spec

**Date:** 2026-05-22
**Status:** Approved

---

## Overview

Add support for Hermes Agent as a tracked AI coding tool in aiusage. Hermes stores session data in a SQLite database (`~/.hermes/state.db`), making it structurally identical to OpenCode. The implementation follows the `parse-opencode.ts` pattern.

---

## Data Source

**File:** `~/.hermes/state.db` (SQLite)
**Default path:** same across macOS, Linux, and Windows (user home-relative)
**User override:** `config.json` → `sources.hermes`

### Relevant Schema

**`sessions` table** — one row per agent session, with aggregated token data:

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Session ID, e.g. `20260522_082935_440bae` |
| `model` | TEXT | e.g. `deepseek-v4-flash`, `qianfan-code-latest` |
| `billing_provider` | TEXT | e.g. `custom`, `openai`, or NULL |
| `billing_base_url` | TEXT | API base URL, or NULL |
| `started_at` | REAL | Unix timestamp in seconds (float) |
| `ended_at` | REAL | Unix timestamp in seconds (float), NULL if ongoing |
| `input_tokens` | INTEGER | |
| `output_tokens` | INTEGER | |
| `cache_read_tokens` | INTEGER | |
| `cache_write_tokens` | INTEGER | |
| `reasoning_tokens` | INTEGER | Maps to `thinkingTokens` |
| `estimated_cost_usd` | REAL | Hermes-calculated cost estimate |
| `actual_cost_usd` | REAL | NULL in most observed cases |
| `cost_source` | TEXT | e.g. `'none'`, `'pricing'` |
| `tool_call_count` | INTEGER | |

**`messages` table** — individual turns, used for tool call extraction:

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | |
| `session_id` | TEXT | FK → sessions.id |
| `role` | TEXT | `user`, `assistant`, `tool` |
| `tool_calls` | TEXT | JSON array of OpenAI-format tool calls, or NULL |
| `timestamp` | REAL | Unix timestamp in seconds (float) |

Tool call format in `tool_calls` JSON:
```json
[{ "function": { "name": "terminal" }, ... }]
```

---

## Architecture

Hermes is **not** JSONL-based, so no Parser class is added to `@aiusage/core`. The implementation lives entirely in the CLI package, mirroring the OpenCode pattern:

```
parse.ts
  └── runParseHermes()       ← new file: parse-hermes.ts
        ├── sessions table   ← one StatsRecord per completed session
        └── messages table   ← ToolCallRecord[] per session
```

---

## Implementation Details

### 1. `packages/core/src/types.ts`

Add `'hermes'` to the `Tool` union:

```ts
export type Tool = 'claude-code' | 'codex' | 'openclaw' | 'opencode' | 'hermes'
```

### 2. `packages/cli/src/watermark.ts`

Add cursor type and watermark support:

```ts
export interface HermesCursor {
  lastEndedAt: number   // seconds float
  lastId: string
}

// WatermarkState gains:
hermes?: HermesCursor | null

// defaultFileData() gains:
'hermes': {}

// WatermarkManager gains:
getHermesCursor(): HermesCursor | null
setHermesCursor(cursor: HermesCursor): void
```

### 3. `packages/cli/src/config.ts`

```ts
export interface SourcesConfig {
  // ... existing entries ...
  /** Custom path to Hermes state.db (default: ~/.hermes/state.db) */
  'hermes'?: string
}
```

### 4. `packages/cli/src/commands/parse-hermes.ts` (new file)

```ts
export interface HermesImportOptions {
  dbPath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  cursor: HermesCursor | null
}

export interface HermesImportResult {
  records: StatsRecord[]
  toolCalls: ToolCallRecord[]
  nextCursor: HermesCursor | null
  errors: string[]
}

export function runParseHermes(db, options): HermesImportResult
```

**Session query:**
```sql
SELECT id, model, billing_provider, started_at, ended_at,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
       reasoning_tokens, estimated_cost_usd, actual_cost_usd
FROM sessions
WHERE ended_at IS NOT NULL
  AND (ended_at > ? OR (ended_at = ? AND id > ?))
ORDER BY ended_at, id
```

**Per-session logic:**

- `ts = Math.round(session.started_at * 1000)` — convert seconds to ms
- `provider`: use `billing_provider` unless it is NULL or `'custom'`, then `inferProvider(model)`
- **Cost resolution** (priority order):
  1. `actual_cost_usd > 0` → `cost = actual_cost_usd`, `costSource: 'log'`
  2. `estimated_cost_usd > 0` → `cost = estimated_cost_usd`, `costSource: 'log'`
  3. model known → `calculateCost(model, tokens)`, `costSource: 'pricing'`
  4. fallback → `cost = 0`, `costSource: 'unknown'`
- `recordId = generateRecordId(deviceInstanceId, dbPath + ':' + session.id, ts)`
- `lineOffset = 0` (DB-sourced, no byte offset)

**Tool call extraction** (per session):
```sql
SELECT tool_calls, timestamp FROM messages
WHERE session_id = ? AND tool_calls IS NOT NULL
ORDER BY timestamp, id
```
Parse JSON array, extract `function.name` from each entry. Assign sequential `callIndex` across all messages in the session.

**Cursor advance:** update `lastEndedAt` / `lastId` for every row visited.

### 5. `packages/cli/src/commands/parse.ts`

Add Hermes discovery and parsing, parallel to the existing OpenCode block:

```ts
// Default path (same on all platforms)
const hermesDbPath = options?.hermesDbPath
  ?? config?.sources?.['hermes']
  ?? join(homedir(), '.hermes', 'state.db')

if ((!filterTool || filterTool === 'hermes') && existsSync(hermesDbPath)) {
  const hermesDb = new Database(hermesDbPath, { readonly: true })
  try {
    const result = runParseHermes(hermesDb, {
      dbPath: hermesDbPath,
      device,
      deviceInstanceId,
      platform: devicePlatform,
      now: Date.now(),
      cursor: wm.getHermesCursor(),
    })
    for (const record of result.records) insertRecord(db, record)
    for (const tc of result.toolCalls) insertToolCall(db, tc)
    if (result.nextCursor) {
      wm.setHermesCursor(result.nextCursor)
      wm.save()
    }
    parsedCount += result.records.length
    toolCallCount += result.toolCalls.length
    errors.push(...result.errors)
  } finally {
    hermesDb.close()
  }
}
```

---

## Edge Cases

| Case | Handling |
|------|----------|
| Session still running (`ended_at IS NULL`) | Skipped; picked up after session ends |
| `billing_provider = 'custom'` | Fall back to `inferProvider(model)` |
| `estimated_cost_usd = 0` (Hermes reports 0 for some providers) | Fall through to pricing table |
| Model unknown | `cost = 0`, `costSource: 'unknown'` |
| `tool_calls` JSON is malformed | Log to `errors`, continue |
| DB file missing | Skip silently (same as other tools) |

---

## Testing

- Unit tests in `packages/core/tests/` — not applicable (no core parser added)
- Integration tests in `packages/cli/tests/` — new `parse-hermes.test.ts`:
  - Build an in-memory SQLite DB with fixture sessions
  - Assert correct `StatsRecord` fields (tokens, cost, provider, ts)
  - Assert tool call extraction
  - Assert cursor advances correctly
  - Assert ongoing sessions (no `ended_at`) are skipped
  - Assert cost fallback priority (actual → estimated → pricing → unknown)

---

## Out of Scope

- No changes to `@aiusage/core` Aggregator (Hermes is not JSONL-based)
- No UI changes (Hermes records flow into existing dashboard automatically via the `tool` field)
- No platform-specific default paths (Hermes uses `~/.hermes` uniformly)
