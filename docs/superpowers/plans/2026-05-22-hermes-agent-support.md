# Hermes Agent Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Hermes Agent as a tracked AI coding tool in aiusage, reading token usage from `~/.hermes/state.db`.

**Architecture:** Hermes stores data in SQLite (same pattern as OpenCode). One `StatsRecord` is produced per completed session. Tool calls are extracted from the `messages` table. The implementation lives entirely in the CLI package — no new parser class is needed in `@aiusage/core`.

**Tech Stack:** TypeScript, better-sqlite3, vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/core/src/types.ts` | Modify | Add `'hermes'` to `Tool` union |
| `packages/cli/src/config.ts` | Modify | Add `'hermes'` to `SourcesConfig` |
| `packages/cli/src/watermark.ts` | Modify | Add `HermesCursor` + get/set methods |
| `packages/cli/src/commands/parse-hermes.ts` | Create | All Hermes parsing logic |
| `packages/cli/src/commands/parse.ts` | Modify | Wire Hermes into main parse loop |
| `packages/cli/tests/watermark.test.ts` | Modify | Add cursor tests |
| `packages/cli/tests/commands/parse-hermes.test.ts` | Create | All Hermes parsing tests |

---

## Task 1: Add `'hermes'` to `Tool` type and `SourcesConfig`

**Files:**
- Modify: `packages/core/src/types.ts:1`
- Modify: `packages/cli/src/config.ts:27-35`

These are type-only changes with no runtime behavior — no unit test needed. TypeScript compilation is the verification.

- [ ] **Step 1: Update `Tool` union in types.ts**

In `packages/core/src/types.ts`, change line 1:

```ts
export type Tool = 'claude-code' | 'codex' | 'openclaw' | 'opencode' | 'hermes'
```

- [ ] **Step 2: Add `'hermes'` to `SourcesConfig` in config.ts**

In `packages/cli/src/config.ts`, add to the `SourcesConfig` interface after the `'opencode'` entry:

```ts
/** Custom path to Hermes state.db (default: ~/.hermes/state.db) */
'hermes'?: string
```

- [ ] **Step 3: Build core package to confirm no type errors**

```bash
cd packages/core && pnpm build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types.ts packages/cli/src/config.ts
git commit -m "feat: add hermes to Tool type and SourcesConfig"
```

---

## Task 2: Add `HermesCursor` to `WatermarkManager`

**Files:**
- Modify: `packages/cli/src/watermark.ts`
- Modify: `packages/cli/tests/watermark.test.ts`

- [ ] **Step 1: Write failing tests for `HermesCursor`**

Open `packages/cli/tests/watermark.test.ts` and add at the end of the file:

```ts
describe('WatermarkManager - HermesCursor', () => {
  const testDir = join(tmpdir(), 'aiusage-watermark-hermes-test')
  const watermarkPath = join(testDir, 'watermark.json')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('returns null when no hermes cursor is set', () => {
    const wm = new WatermarkManager(watermarkPath)
    expect(wm.getHermesCursor()).toBeNull()
  })

  it('saves and loads hermes cursor', () => {
    const wm = new WatermarkManager(watermarkPath)
    wm.setHermesCursor({ lastEndedAt: 1779408317.5, lastId: '20260522_080254_59211c' })
    wm.save()

    const wm2 = new WatermarkManager(watermarkPath)
    expect(wm2.getHermesCursor()).toEqual({
      lastEndedAt: 1779408317.5,
      lastId: '20260522_080254_59211c',
    })
  })

  it('loads legacy watermark file without hermes key', () => {
    writeFileSync(watermarkPath, JSON.stringify({
      files: { 'claude-code': {}, 'codex': {}, 'openclaw': {}, 'opencode': {}, 'hermes': {} },
    }))
    const wm = new WatermarkManager(watermarkPath)
    expect(wm.getHermesCursor()).toBeNull()
  })

  it('hermes key included in defaultFileData', () => {
    const wm = new WatermarkManager(watermarkPath)
    // setEntry for hermes should not throw (key exists in files map)
    expect(() => wm.setEntry('hermes', '/some/path', { offset: 0, size: 0, mtime: 0 })).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/cli && pnpm test -- --reporter=verbose tests/watermark.test.ts
```

Expected: FAIL — `getHermesCursor is not a function` (or similar).

- [ ] **Step 3: Update `watermark.ts` with `HermesCursor`**

In `packages/cli/src/watermark.ts`:

Add the interface after `OpenCodeCursor`:
```ts
export interface HermesCursor {
  lastEndedAt: number  // Unix timestamp in seconds (float)
  lastId: string
}
```

Add `hermes?: HermesCursor | null` to `WatermarkState`:
```ts
export interface WatermarkState {
  files: FileWatermarkData
  opencode?: OpenCodeCursor | null
  hermes?: HermesCursor | null
}
```

Update `defaultFileData()` to include `'hermes'`:
```ts
function defaultFileData(): FileWatermarkData {
  return {
    'claude-code': {},
    'codex': {},
    'openclaw': {},
    'opencode': {},
    'hermes': {},
  }
}
```

Update the `load()` return to preserve the `hermes` field:
```ts
return { files: parsed.files ?? defaultFileData(), opencode: parsed.opencode ?? null, hermes: parsed.hermes ?? null }
```

Add methods to `WatermarkManager` class (after `setOpenCodeCursor`):
```ts
getHermesCursor(): HermesCursor | null {
  return this.data.hermes ?? null
}

setHermesCursor(cursor: HermesCursor): void {
  this.data.hermes = cursor
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd packages/cli && pnpm test -- --reporter=verbose tests/watermark.test.ts
```

Expected: all watermark tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/watermark.ts packages/cli/tests/watermark.test.ts
git commit -m "feat: add HermesCursor to WatermarkManager"
```

---

## Task 3: Create `parse-hermes.ts` with full test coverage

**Files:**
- Create: `packages/cli/src/commands/parse-hermes.ts`
- Create: `packages/cli/tests/commands/parse-hermes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/tests/commands/parse-hermes.test.ts`.

The `vi.mock` and dynamic `runParse` import must be at the top of the file so they're available for the integration tests added in Task 4:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { runParseHermes } from '../../src/commands/parse-hermes.js'

vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os')
  return {
    ...actual,
    homedir: () => join(tmpdir(), 'aiusage-parse-hermes-test'),
  }
})

// Must import after mock so it picks up the mocked homedir
const { runParse } = await import('../../src/commands/parse.js')

function createHermesDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      model TEXT,
      billing_provider TEXT,
      billing_base_url TEXT,
      started_at REAL NOT NULL,
      ended_at REAL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL,
      actual_cost_usd REAL
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      tool_calls TEXT,
      timestamp REAL NOT NULL
    )
  `)
}

const BASE_OPTIONS = {
  dbPath: '/home/user/.hermes/state.db',
  device: 'macbook',
  deviceInstanceId: 'device-abc',
  now: 1779500000000,
  cursor: null,
}

describe('runParseHermes', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    createHermesDb(db)
  })

  afterEach(() => {
    db.close()
  })

  it('imports a completed session with token data', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', 'custom', 1779408317.5, 1779408400.0, 5000, 200, 100, 50, 10)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(1)
    expect(result.records[0].tool).toBe('hermes')
    expect(result.records[0].model).toBe('deepseek-v4-flash')
    expect(result.records[0].inputTokens).toBe(5000)
    expect(result.records[0].outputTokens).toBe(200)
    expect(result.records[0].cacheReadTokens).toBe(100)
    expect(result.records[0].cacheWriteTokens).toBe(50)
    expect(result.records[0].thinkingTokens).toBe(10)
    expect(result.records[0].ts).toBe(Math.round(1779408317.5 * 1000))
    expect(result.records[0].sessionId).toBe('sess_1')
    expect(result.records[0].sourceFile).toBe('/home/user/.hermes/state.db')
    expect(result.records[0].lineOffset).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('skips sessions with ended_at IS NULL (still running)', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_running', 'deepseek-v4-flash', 1779408317.5, null, 5000, 200, 0, 0, 0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
  })

  it('infers provider from model when billing_provider is null', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].provider).toBe('deepseek')
  })

  it('infers provider from model when billing_provider is "custom"', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'glm-5.1', 'custom', 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].provider).toBe('zhipu')
  })

  it('uses actual_cost_usd when > 0 (costSource: log)', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, actual_cost_usd, estimated_cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'gpt-4o', 'openai', 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0, 0.005, 0.004)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].cost).toBe(0.005)
    expect(result.records[0].costSource).toBe('log')
  })

  it('uses estimated_cost_usd when actual_cost_usd is null and estimated > 0 (costSource: log)', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, actual_cost_usd, estimated_cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'gpt-4o', 'openai', 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0, null, 0.004)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].cost).toBe(0.004)
    expect(result.records[0].costSource).toBe('log')
  })

  it('falls back to pricing table when both cost fields are 0 or null', () => {
    // claude-sonnet-4-6: input $3/1M, output $15/1M
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, actual_cost_usd, estimated_cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'claude-sonnet-4-6', null, 1779408317.5, 1779408400.0, 1000000, 0, 0, 0, 0, null, 0.0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].cost).toBeCloseTo(3.0, 5)
    expect(result.records[0].costSource).toBe('pricing')
  })

  it('sets costSource unknown when model is unknown', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', null, null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].model).toBe('unknown')
    expect(result.records[0].cost).toBe(0)
    expect(result.records[0].costSource).toBe('unknown')
  })

  it('extracts tool calls from messages table', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    // First assistant message with 2 tool calls
    db.prepare(`
      INSERT INTO messages (session_id, role, tool_calls, timestamp)
      VALUES (?, ?, ?, ?)
    `).run('sess_1', 'assistant', JSON.stringify([
      { id: 'tc1', type: 'function', function: { name: 'terminal', arguments: '{}' } },
      { id: 'tc2', type: 'function', function: { name: 'read_file', arguments: '{}' } },
    ]), 1779408350.0)

    // Second assistant message with 1 tool call
    db.prepare(`
      INSERT INTO messages (session_id, role, tool_calls, timestamp)
      VALUES (?, ?, ?, ?)
    `).run('sess_1', 'assistant', JSON.stringify([
      { id: 'tc3', type: 'function', function: { name: 'patch', arguments: '{}' } },
    ]), 1779408360.0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.toolCalls).toHaveLength(3)
    expect(result.toolCalls.map(tc => tc.name)).toEqual(['terminal', 'read_file', 'patch'])
    expect(result.toolCalls[0].callIndex).toBe(0)
    expect(result.toolCalls[1].callIndex).toBe(1)
    expect(result.toolCalls[2].callIndex).toBe(2)
    expect(result.toolCalls[0].recordId).toBe(result.records[0].id)
  })

  it('skips messages without tool_calls and user messages', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    db.prepare(`INSERT INTO messages (session_id, role, tool_calls, timestamp) VALUES (?, ?, ?, ?)`)
      .run('sess_1', 'user', null, 1779408320.0)
    db.prepare(`INSERT INTO messages (session_id, role, tool_calls, timestamp) VALUES (?, ?, ?, ?)`)
      .run('sess_1', 'assistant', null, 1779408330.0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.toolCalls).toHaveLength(0)
  })

  it('records error for malformed tool_calls JSON but still emits the record', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    db.prepare(`INSERT INTO messages (session_id, role, tool_calls, timestamp) VALUES (?, ?, ?, ?)`)
      .run('sess_1', 'assistant', 'not-valid-json', 1779408330.0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(1)
    expect(result.toolCalls).toHaveLength(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('respects cursor for incremental import', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_2', 'deepseek-v4-flash', null, 1779408500.0, 1779408600.0, 200, 40, 0, 0, 0)

    // First import: get both
    const result1 = runParseHermes(db, BASE_OPTIONS)
    expect(result1.records).toHaveLength(2)
    expect(result1.nextCursor).toEqual({ lastEndedAt: 1779408600.0, lastId: 'sess_2' })

    // Second import with cursor: get nothing
    const result2 = runParseHermes(db, { ...BASE_OPTIONS, cursor: result1.nextCursor })
    expect(result2.records).toHaveLength(0)
    expect(result2.nextCursor).toBeNull()
  })

  it('returns nextCursor pointing to last session visited', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.nextCursor).toEqual({ lastEndedAt: 1779408400.0, lastId: 'sess_1' })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/cli && pnpm test -- --reporter=verbose tests/commands/parse-hermes.test.ts
```

Expected: FAIL — `Cannot find module '../../src/commands/parse-hermes.js'`.

- [ ] **Step 3: Create `parse-hermes.ts`**

Create `packages/cli/src/commands/parse-hermes.ts`:

```ts
import type Database from 'better-sqlite3'
import type { StatsRecord, ToolCallRecord } from '@aiusage/core'
import { generateRecordId, generateToolCallId, inferProvider, calculateCost } from '@aiusage/core'
import type { HermesCursor } from '../watermark.js'

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

interface SessionRow {
  id: string
  model: string | null
  billing_provider: string | null
  started_at: number
  ended_at: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  estimated_cost_usd: number | null
  actual_cost_usd: number | null
}

interface MessageRow {
  id: number
  session_id: string
  tool_calls: string | null
  timestamp: number
}

export function runParseHermes(
  db: Database.Database,
  options: HermesImportOptions,
): HermesImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, cursor } = options
  const records: StatsRecord[] = []
  const toolCalls: ToolCallRecord[] = []
  const errors: string[] = []
  let lastCursor: HermesCursor | null = null

  const sessions = db
    .prepare(
      `SELECT id, model, billing_provider, started_at, ended_at,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
              reasoning_tokens, estimated_cost_usd, actual_cost_usd
       FROM sessions
       WHERE ended_at IS NOT NULL
         AND (ended_at > ? OR (ended_at = ? AND id > ?))
       ORDER BY ended_at, id`,
    )
    .all(
      cursor?.lastEndedAt ?? 0,
      cursor?.lastEndedAt ?? 0,
      cursor?.lastId ?? '',
    ) as SessionRow[]

  const toolCallsStmt = db.prepare(
    `SELECT id, session_id, tool_calls, timestamp
     FROM messages
     WHERE session_id = ? AND tool_calls IS NOT NULL
     ORDER BY timestamp, id`,
  )

  for (const session of sessions) {
    lastCursor = { lastEndedAt: session.ended_at, lastId: session.id }

    const model = session.model ?? 'unknown'
    const ts = Math.round(session.started_at * 1000)

    const rawProvider = session.billing_provider
    const provider = (rawProvider && rawProvider !== 'custom')
      ? rawProvider
      : inferProvider(model)

    const inputTokens = session.input_tokens
    const outputTokens = session.output_tokens
    const cacheReadTokens = session.cache_read_tokens
    const cacheWriteTokens = session.cache_write_tokens
    const thinkingTokens = session.reasoning_tokens

    const tokenArgs = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens }

    let cost: number
    let costSource: StatsRecord['costSource']

    if (session.actual_cost_usd != null && session.actual_cost_usd > 0) {
      cost = session.actual_cost_usd
      costSource = 'log'
    } else if (session.estimated_cost_usd != null && session.estimated_cost_usd > 0) {
      cost = session.estimated_cost_usd
      costSource = 'log'
    } else if (model !== 'unknown') {
      cost = calculateCost(model, tokenArgs)
      costSource = cost > 0 ? 'pricing' : 'unknown'
    } else {
      cost = 0
      costSource = 'unknown'
    }

    const recordId = generateRecordId(deviceInstanceId, dbPath + ':' + session.id, ts)

    const record: StatsRecord = {
      id: recordId,
      ts,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: 0,
      tool: 'hermes',
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
      cost,
      costSource,
      sessionId: session.id,
      sourceFile: dbPath,
      device,
      deviceInstanceId,
      platform,
    }

    records.push(record)

    // Extract tool calls from messages
    const messages = toolCallsStmt.all(session.id) as MessageRow[]
    let callIndex = 0
    for (const message of messages) {
      let toolCallList: Array<{ function?: { name?: string } }>
      try {
        toolCallList = JSON.parse(message.tool_calls!)
      } catch (e) {
        errors.push(`session ${session.id} message ${message.id}: invalid tool_calls JSON: ${e instanceof Error ? e.message : e}`)
        continue
      }
      for (const tc of toolCallList) {
        const name = tc.function?.name
        if (!name) continue
        toolCalls.push({
          id: generateToolCallId(recordId, name, Math.round(message.timestamp * 1000), callIndex),
          recordId,
          name,
          ts: Math.round(message.timestamp * 1000),
          callIndex,
        })
        callIndex++
      }
    }
  }

  return { records, toolCalls, nextCursor: lastCursor, errors }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd packages/cli && pnpm test -- --reporter=verbose tests/commands/parse-hermes.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/parse-hermes.ts packages/cli/tests/commands/parse-hermes.test.ts
git commit -m "feat: add Hermes Agent parser (parse-hermes.ts)"
```

---

## Task 4: Wire Hermes into `parse.ts` with integration tests

**Files:**
- Modify: `packages/cli/src/commands/parse.ts`
- Create: integration tests in `packages/cli/tests/commands/parse-hermes.test.ts` (extend the existing file)

- [ ] **Step 1: Write failing integration tests**

Append to `packages/cli/tests/commands/parse-hermes.test.ts` (the `vi.mock` and `runParse` import are already at the top from Task 3 — do not duplicate them):

```ts
import { initializeDatabase } from '../../src/db/index.js'

describe('runParse with hermes', () => {
  const testDir = join(tmpdir(), 'aiusage-parse-hermes-test')
  let cacheDb: Database.Database
  let hermesDbPath: string

  beforeEach(() => {
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
    writeFileSync(join(testDir, '.aiusage', 'watermark.json'), '{}')

    cacheDb = new Database(':memory:')
    initializeDatabase(cacheDb)

    hermesDbPath = join(testDir, '.hermes', 'state.db')
    mkdirSync(join(testDir, '.hermes'), { recursive: true })

    const hermesDb = new Database(hermesDbPath)
    createHermesDb(hermesDb)

    hermesDb.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 5000, 200, 0, 0, 0)

    hermesDb.prepare(`
      INSERT INTO messages (session_id, role, tool_calls, timestamp)
      VALUES (?, ?, ?, ?)
    `).run('sess_1', 'assistant', JSON.stringify([
      { id: 'tc1', type: 'function', function: { name: 'terminal', arguments: '{}' } },
    ]), 1779408350.0)

    hermesDb.close()
  })

  afterEach(() => {
    cacheDb.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('runParse imports hermes records when tool filter is hermes', async () => {
    const result = await runParse(cacheDb, 'hermes', { hermesDbPath })
    expect(result.parsedCount).toBe(1)
    expect(result.toolCallCount).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('runParse skips hermes when filter is a different tool', async () => {
    const result = await runParse(cacheDb, 'claude-code', { hermesDbPath })
    expect(result.parsedCount).toBe(0)
  })

  it('runParse handles missing hermes db gracefully', async () => {
    const result = await runParse(cacheDb, 'hermes', { hermesDbPath: join(testDir, 'nonexistent.db') })
    expect(result.parsedCount).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('runParse persists cursor so second call imports nothing new', async () => {
    const result1 = await runParse(cacheDb, 'hermes', { hermesDbPath })
    expect(result1.parsedCount).toBe(1)

    const result2 = await runParse(cacheDb, 'hermes', { hermesDbPath })
    expect(result2.parsedCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run integration tests to confirm they fail**

```bash
cd packages/cli && pnpm test -- --reporter=verbose tests/commands/parse-hermes.test.ts
```

Expected: FAIL — `runParse` doesn't accept `hermesDbPath` option yet.

- [ ] **Step 3: Update `parse.ts` to add Hermes support**

In `packages/cli/src/commands/parse.ts`:

**Add import** at top (after existing opencode import):
```ts
import { runParseHermes } from './parse-hermes.js'
```

**Extend the `runParse` options type** (line ~129):
```ts
export async function runParse(db: Database.Database, filterTool?: string, options?: { openCodeDbPath?: string; hermesDbPath?: string }): Promise<ParseResult> {
```

**Add Hermes block** at the end of `runParse`, after the OpenCode block (before the device backfill UPDATE statements):
```ts
// Hermes: SQLite database
const hermesDbPath = options?.hermesDbPath
  ?? config?.sources?.['hermes']
  ?? join(homedir(), '.hermes', 'state.db')

if ((!filterTool || filterTool === 'hermes') && existsSync(hermesDbPath)) {
  try {
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
  } catch (e) {
    errors.push(`${hermesDbPath}: ${e instanceof Error ? e.message : e}`)
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
cd packages/cli && pnpm test -- --reporter=verbose
```

Expected: all tests PASS, including the new integration tests.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/parse.ts packages/cli/tests/commands/parse-hermes.test.ts
git commit -m "feat: wire Hermes parser into runParse"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run full test suite across all packages**

```bash
cd /path/to/aiusage && pnpm --filter @aiusage/core test && pnpm --filter @aiusage/cli test
```

Expected: all tests PASS.

- [ ] **Step 2: Smoke test against real Hermes DB**

```bash
cd packages/cli && pnpm tsx src/index.ts parse --tool hermes
```

Expected: prints imported record count > 0 (assuming `~/.hermes/state.db` exists with completed sessions).

- [ ] **Step 3: Final commit (if any loose files)**

```bash
git status
# If clean, no commit needed. If any stray changes, commit them.
```
