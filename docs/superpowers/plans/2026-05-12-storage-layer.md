# Storage Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the storage layer with SQLite schema, migrations, watermark management, PID lock, and directory initialization.

**Architecture:** IO layer in `packages/cli` that handles all database operations, file system management, and persistence. Depends on `@aiusage/core` for types and parsing.

**Tech Stack:** TypeScript, better-sqlite3, Vitest

---

## File Structure

```
packages/cli/
├── src/
│   ├── db/
│   │   ├── index.ts              # Database connection and initialization
│   │   ├── schema.ts             # Schema creation and PRAGMA settings
│   │   ├── migrations/
│   │   │   ├── index.ts          # Migration runner
│   │   │   └── v1.ts             # Initial schema
│   │   ├── records.ts            # Records CRUD operations
│   │   ├── synced-records.ts     # Synced records operations
│   │   ├── tool-calls.ts         # Tool calls operations
│   │   └── tombstones.ts         # Tombstones operations
│   ├── watermark.ts              # Watermark management
│   ├── lock.ts                   # PID file lock
│   ├── init.ts                   # Directory initialization
│   └── index.ts                  # Main entry point
├── tests/
│   ├── db/
│   │   ├── schema.test.ts
│   │   ├── records.test.ts
│   │   ├── synced-records.test.ts
│   │   ├── tool-calls.test.ts
│   │   └── tombstones.test.ts
│   ├── watermark.test.ts
│   ├── lock.test.ts
│   └── init.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Task 1: CLI Package Scaffold

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/cli/src/index.ts`

- [ ] **Step 1: Create packages/cli/package.json**

```json
{
  "name": "@aiusage/cli",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "aiusage": "./dist/index.js"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@aiusage/core": "workspace:*",
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create packages/cli/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/cli/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create placeholder src/index.ts**

```typescript
export {}
```

- [ ] **Step 5: Run pnpm install**

Run: `pnpm install`
Expected: Dependencies installed successfully

- [ ] **Step 6: Commit**

```bash
git add packages/cli/
git commit -m "chore: scaffold CLI package"
```

---

## Task 2: SQLite Schema and Migrations

**Files:**
- Create: `packages/cli/src/db/schema.ts`
- Create: `packages/cli/src/db/migrations/v1.ts`
- Create: `packages/cli/src/db/migrations/index.ts`
- Create: `packages/cli/src/db/index.ts`
- Create: `packages/cli/tests/db/schema.test.ts`

- [ ] **Step 1: Write failing test for schema creation**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'

describe('Database Schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('creates schema_version table', () => {
    initializeDatabase(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const tableNames = tables.map((t: any) => t.name)
    expect(tableNames).toContain('schema_version')
  })

  it('creates records table with correct columns', () => {
    initializeDatabase(db)
    const columns = db.prepare("PRAGMA table_info(records)").all()
    const columnNames = columns.map((c: any) => c.name)
    expect(columnNames).toContain('id')
    expect(columnNames).toContain('ts')
    expect(columnNames).toContain('ingested_at')
    expect(columnNames).toContain('synced_at')
    expect(columnNames).toContain('updated_at')
    expect(columnNames).toContain('line_offset')
    expect(columnNames).toContain('tool')
    expect(columnNames).toContain('model')
    expect(columnNames).toContain('provider')
    expect(columnNames).toContain('input_tokens')
    expect(columnNames).toContain('output_tokens')
    expect(columnNames).toContain('cache_read_tokens')
    expect(columnNames).toContain('cache_write_tokens')
    expect(columnNames).toContain('thinking_tokens')
    expect(columnNames).toContain('cost')
    expect(columnNames).toContain('cost_source')
    expect(columnNames).toContain('session_id')
    expect(columnNames).toContain('source_file')
    expect(columnNames).toContain('device')
    expect(columnNames).toContain('device_instance_id')
  })

  it('creates synced_records table', () => {
    initializeDatabase(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const tableNames = tables.map((t: any) => t.name)
    expect(tableNames).toContain('synced_records')
  })

  it('creates sync_tombstones table', () => {
    initializeDatabase(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const tableNames = tables.map((t: any) => t.name)
    expect(tableNames).toContain('sync_tombstones')
  })

  it('creates tool_calls table', () => {
    initializeDatabase(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const tableNames = tables.map((t: any) => t.name)
    expect(tableNames).toContain('tool_calls')
  })

  it('creates all required indexes', () => {
    initializeDatabase(db)
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all()
    const indexNames = indexes.map((i: any) => i.name)
    expect(indexNames).toContain('idx_records_ts')
    expect(indexNames).toContain('idx_records_tool')
    expect(indexNames).toContain('idx_records_model')
    expect(indexNames).toContain('idx_records_session')
    expect(indexNames).toContain('idx_records_source')
  })

  it('sets WAL mode', () => {
    initializeDatabase(db)
    const mode = db.pragma('journal_mode', { simple: true })
    expect(mode).toBe('wal')
  })

  it('sets foreign_keys on', () => {
    initializeDatabase(db)
    const fk = db.pragma('foreign_keys', { simple: true })
    expect(fk).toBe(1)
  })

  it('records schema version 1', () => {
    initializeDatabase(db)
    const version = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get()
    expect((version as any).version).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- tests/db/schema.test.ts`
Expected: FAIL with "Cannot find module '../../src/db/index.js'"

- [ ] **Step 3: Create schema.ts with PRAGMA and table creation**

```typescript
import type Database from 'better-sqlite3'

export function applyPragmas(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
}

export function createSchemaVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT DEFAULT (datetime('now'))
    )
  `)
}

export function createV1Schema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE records (
      id                TEXT PRIMARY KEY,
      ts                INTEGER NOT NULL,
      ingested_at       INTEGER NOT NULL,
      synced_at         INTEGER,
      updated_at        INTEGER NOT NULL,
      line_offset       INTEGER NOT NULL,
      tool              TEXT NOT NULL,
      model             TEXT NOT NULL,
      provider          TEXT NOT NULL,
      input_tokens      INTEGER DEFAULT 0,
      output_tokens     INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      thinking_tokens   INTEGER DEFAULT 0,
      cost              REAL DEFAULT 0,
      cost_source       TEXT NOT NULL DEFAULT 'pricing',
      session_id        TEXT NOT NULL,
      source_file       TEXT NOT NULL,
      device            TEXT NOT NULL,
      device_instance_id TEXT NOT NULL
    );

    CREATE TABLE synced_records (
      id                TEXT PRIMARY KEY,
      ts                INTEGER NOT NULL,
      tool              TEXT NOT NULL,
      model             TEXT NOT NULL,
      provider          TEXT NOT NULL,
      input_tokens      INTEGER DEFAULT 0,
      output_tokens     INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      thinking_tokens   INTEGER DEFAULT 0,
      cost              REAL DEFAULT 0,
      cost_source       TEXT NOT NULL DEFAULT 'pricing',
      session_key       TEXT NOT NULL,
      device            TEXT NOT NULL,
      device_instance_id TEXT NOT NULL,
      updated_at        INTEGER NOT NULL
    );

    CREATE TABLE sync_tombstones (
      id                TEXT NOT NULL,
      device_scope      TEXT NOT NULL,
      deleted_at        INTEGER NOT NULL,
      reason            TEXT NOT NULL,
      PRIMARY KEY (id, device_scope)
    );

    CREATE TABLE tool_calls (
      id          TEXT PRIMARY KEY,
      record_id   TEXT REFERENCES records(id) ON DELETE CASCADE,
      tool        TEXT,
      name        TEXT NOT NULL,
      ts          INTEGER NOT NULL,
      call_index  INTEGER DEFAULT 0
    );

    CREATE INDEX idx_records_ts         ON records(ts DESC);
    CREATE INDEX idx_records_ingested   ON records(ingested_at DESC);
    CREATE INDEX idx_records_updated    ON records(updated_at DESC);
    CREATE INDEX idx_records_tool       ON records(tool);
    CREATE INDEX idx_records_model      ON records(model);
    CREATE INDEX idx_records_session    ON records(session_id);
    CREATE INDEX idx_records_source     ON records(source_file);
    CREATE INDEX idx_records_cost_source ON records(cost_source);
    CREATE INDEX idx_synced_records_ts      ON synced_records(ts DESC);
    CREATE INDEX idx_synced_records_tool    ON synced_records(tool);
    CREATE INDEX idx_synced_records_model   ON synced_records(model);
    CREATE INDEX idx_synced_records_session ON synced_records(session_key);
    CREATE INDEX idx_synced_records_device  ON synced_records(device);
    CREATE INDEX idx_synced_records_updated ON synced_records(updated_at DESC);
    CREATE INDEX idx_sync_tombstones_deleted_at ON sync_tombstones(deleted_at DESC);
    CREATE INDEX idx_tombstones_device_scope ON sync_tombstones(device_scope);
    CREATE INDEX idx_tc_record_id       ON tool_calls(record_id);
    CREATE INDEX idx_tc_name            ON tool_calls(name);
    CREATE INDEX idx_tc_ts              ON tool_calls(ts DESC);
  `)
}
```

- [ ] **Step 4: Create migrations/v1.ts**

```typescript
import type Database from 'better-sqlite3'
import { createV1Schema } from '../schema.js'

export function migrateV1(db: Database.Database): void {
  createV1Schema(db)
  db.prepare('INSERT INTO schema_version (version) VALUES (1)').run()
}
```

- [ ] **Step 5: Create migrations/index.ts**

```typescript
import type Database from 'better-sqlite3'
import { migrateV1 } from './v1.js'
import { createSchemaVersionTable } from '../schema.js'

const MIGRATIONS = [
  { version: 1, migrate: migrateV1 },
]

export function runMigrations(db: Database.Database): void {
  createSchemaVersionTable(db)

  const currentVersion = db.prepare(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  ).get() as { version: number } | undefined

  const current = currentVersion?.version ?? 0

  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      db.transaction(() => {
        migration.migrate(db)
      })()
    }
  }
}
```

- [ ] **Step 6: Create db/index.ts**

```typescript
import Database from 'better-sqlite3'
import { applyPragmas } from './schema.js'
import { runMigrations } from './migrations/index.js'

export function initializeDatabase(db: Database.Database): void {
  applyPragmas(db)
  runMigrations(db)
}

export function createDatabase(path: string): Database.Database {
  const db = new Database(path)
  initializeDatabase(db)
  return db
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd packages/cli && pnpm test -- tests/db/schema.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/db/ packages/cli/tests/db/schema.test.ts
git commit -m "feat(cli): add SQLite schema and migration system"
```

---

## Task 3: Records CRUD Operations

**Files:**
- Create: `packages/cli/src/db/records.ts`
- Create: `packages/cli/tests/db/records.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord, getRecordById, getRecordsBySourceFile, deleteRecordsBySourceFile, getUnsyncedRecords } from '../../src/db/records.js'
import type { StatsRecord } from '@aiusage/core'

function createTestRecord(overrides: Partial<StatsRecord> = {}): StatsRecord {
  return {
    id: 'test-record-1',
    ts: 1776738085346,
    ingestedAt: 1776738085700,
    updatedAt: 1776738085700,
    lineOffset: 100,
    tool: 'claude-code',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 200,
    thinkingTokens: 0,
    cost: 0.001,
    costSource: 'pricing',
    sessionId: 'abc123',
    sourceFile: '/path/to/file.jsonl',
    device: 'test-device',
    deviceInstanceId: 'device-123',
    ...overrides,
  }
}

describe('Records CRUD', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('inserts a record', () => {
    const record = createTestRecord()
    insertRecord(db, record)
    const retrieved = getRecordById(db, 'test-record-1')
    expect(retrieved).not.toBeNull()
    expect(retrieved!.id).toBe('test-record-1')
    expect(retrieved!.model).toBe('claude-sonnet-4-6')
  })

  it('returns null for non-existent record', () => {
    const retrieved = getRecordById(db, 'non-existent')
    expect(retrieved).toBeNull()
  })

  it('gets records by source file', () => {
    insertRecord(db, createTestRecord({ id: 'r1', sourceFile: '/path/a.jsonl' }))
    insertRecord(db, createTestRecord({ id: 'r2', sourceFile: '/path/a.jsonl' }))
    insertRecord(db, createTestRecord({ id: 'r3', sourceFile: '/path/b.jsonl' }))

    const records = getRecordsBySourceFile(db, '/path/a.jsonl')
    expect(records).toHaveLength(2)
  })

  it('deletes records by source file', () => {
    insertRecord(db, createTestRecord({ id: 'r1', sourceFile: '/path/a.jsonl' }))
    insertRecord(db, createTestRecord({ id: 'r2', sourceFile: '/path/a.jsonl' }))
    insertRecord(db, createTestRecord({ id: 'r3', sourceFile: '/path/b.jsonl' }))

    const deleted = deleteRecordsBySourceFile(db, '/path/a.jsonl')
    expect(deleted).toBe(2)
    expect(getRecordById(db, 'r1')).toBeNull()
    expect(getRecordById(db, 'r2')).toBeNull()
    expect(getRecordById(db, 'r3')).not.toBeNull()
  })

  it('gets unsynced records (synced_at is null)', () => {
    insertRecord(db, createTestRecord({ id: 'r1' }))
    insertRecord(db, createTestRecord({ id: 'r2', syncedAt: 1776738085800 }))

    const unsynced = getUnsyncedRecords(db)
    expect(unsynced).toHaveLength(1)
    expect(unsynced[0].id).toBe('r1')
  })

  it('gets records where updated_at > synced_at', () => {
    insertRecord(db, createTestRecord({ id: 'r1', syncedAt: 1776738085600, updatedAt: 1776738085700 }))

    const unsynced = getUnsyncedRecords(db)
    expect(unsynced).toHaveLength(1)
    expect(unsynced[0].id).toBe('r1')
  })

  it('upserts record on duplicate id', () => {
    const record = createTestRecord()
    insertRecord(db, record)
    insertRecord(db, { ...record, model: 'gpt-4o', updatedAt: 1776738085800 })

    const retrieved = getRecordById(db, 'test-record-1')
    expect(retrieved!.model).toBe('gpt-4o')
    expect(retrieved!.updatedAt).toBe(1776738085800)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- tests/db/records.test.ts`
Expected: FAIL with "Cannot find module '../../src/db/records.js'"

- [ ] **Step 3: Write implementation**

```typescript
import type Database from 'better-sqlite3'
import type { StatsRecord } from '@aiusage/core'

export function insertRecord(db: Database.Database, record: StatsRecord): void {
  db.prepare(`
    INSERT OR REPLACE INTO records (
      id, ts, ingested_at, synced_at, updated_at, line_offset,
      tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_id, source_file, device, device_instance_id
    ) VALUES (
      @id, @ts, @ingestedAt, @syncedAt, @updatedAt, @lineOffset,
      @tool, @model, @provider, @inputTokens, @outputTokens,
      @cacheReadTokens, @cacheWriteTokens, @thinkingTokens,
      @cost, @costSource, @sessionId, @sourceFile, @device, @deviceInstanceId
    )
  `).run({
    id: record.id,
    ts: record.ts,
    ingestedAt: record.ingestedAt,
    syncedAt: record.syncedAt ?? null,
    updatedAt: record.updatedAt,
    lineOffset: record.lineOffset,
    tool: record.tool,
    model: record.model,
    provider: record.provider,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cacheReadTokens: record.cacheReadTokens,
    cacheWriteTokens: record.cacheWriteTokens,
    thinkingTokens: record.thinkingTokens,
    cost: record.cost,
    costSource: record.costSource,
    sessionId: record.sessionId,
    sourceFile: record.sourceFile,
    device: record.device,
    deviceInstanceId: record.deviceInstanceId,
  })
}

export function getRecordById(db: Database.Database, id: string): StatsRecord | null {
  const row = db.prepare('SELECT * FROM records WHERE id = ?').get(id) as any
  if (!row) return null
  return mapRowToRecord(row)
}

export function getRecordsBySourceFile(db: Database.Database, sourceFile: string): StatsRecord[] {
  const rows = db.prepare('SELECT * FROM records WHERE source_file = ?').all(sourceFile) as any[]
  return rows.map(mapRowToRecord)
}

export function deleteRecordsBySourceFile(db: Database.Database, sourceFile: string): number {
  const result = db.prepare('DELETE FROM records WHERE source_file = ?').run(sourceFile)
  return result.changes
}

export function getUnsyncedRecords(db: Database.Database): StatsRecord[] {
  const rows = db.prepare(
    'SELECT * FROM records WHERE synced_at IS NULL OR updated_at > synced_at'
  ).all() as any[]
  return rows.map(mapRowToRecord)
}

function mapRowToRecord(row: any): StatsRecord {
  return {
    id: row.id,
    ts: row.ts,
    ingestedAt: row.ingested_at,
    syncedAt: row.synced_at ?? undefined,
    updatedAt: row.updated_at,
    lineOffset: row.line_offset,
    tool: row.tool,
    model: row.model,
    provider: row.provider,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    thinkingTokens: row.thinking_tokens,
    cost: row.cost,
    costSource: row.cost_source,
    sessionId: row.session_id,
    sourceFile: row.source_file,
    device: row.device,
    deviceInstanceId: row.device_instance_id,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test -- tests/db/records.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/db/records.ts packages/cli/tests/db/records.test.ts
git commit -m "feat(cli): add records CRUD operations"
```

---

## Task 4: Tool Calls Operations

**Files:**
- Create: `packages/cli/src/db/tool-calls.ts`
- Create: `packages/cli/tests/db/tool-calls.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertToolCall, getToolCallsByRecordId, getToolCallStats, deleteOrphanToolCalls } from '../../src/db/tool-calls.js'
import type { ToolCallRecord } from '@aiusage/core'

function createTestToolCall(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    id: 'tc-1',
    recordId: 'record-1',
    name: 'Read',
    ts: 1776738085346,
    callIndex: 0,
    ...overrides,
  }
}

describe('Tool Calls Operations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('inserts a tool call', () => {
    const tc = createTestToolCall()
    insertToolCall(db, tc)
    const results = getToolCallsByRecordId(db, 'record-1')
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Read')
  })

  it('inserts orphan tool call (recordId = null)', () => {
    const tc = createTestToolCall({ id: 'tc-orphan', recordId: null, tool: 'codex' })
    insertToolCall(db, tc)
    const results = getToolCallsByRecordId(db, null)
    expect(results).toHaveLength(1)
    expect(results[0].recordId).toBeNull()
  })

  it('gets tool call stats grouped by name', () => {
    insertToolCall(db, createTestToolCall({ id: 'tc1', name: 'Read' }))
    insertToolCall(db, createTestToolCall({ id: 'tc2', name: 'Read' }))
    insertToolCall(db, createTestToolCall({ id: 'tc3', name: 'Bash' }))

    const stats = getToolCallStats(db)
    expect(stats).toHaveLength(2)
    expect(stats.find(s => s.name === 'Read')?.count).toBe(2)
    expect(stats.find(s => s.name === 'Bash')?.count).toBe(1)
  })

  it('deletes orphan tool calls older than timestamp', () => {
    insertToolCall(db, createTestToolCall({ id: 'tc1', recordId: null, tool: 'codex', ts: 1000 }))
    insertToolCall(db, createTestToolCall({ id: 'tc2', recordId: null, tool: 'codex', ts: 2000 }))
    insertToolCall(db, createTestToolCall({ id: 'tc3', recordId: 'record-1', ts: 1000 }))

    const deleted = deleteOrphanToolCalls(db, 1500)
    expect(deleted).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- tests/db/tool-calls.test.ts`
Expected: FAIL with "Cannot find module '../../src/db/tool-calls.js'"

- [ ] **Step 3: Write implementation**

```typescript
import type Database from 'better-sqlite3'
import type { ToolCallRecord } from '@aiusage/core'

export function insertToolCall(db: Database.Database, tc: ToolCallRecord): void {
  db.prepare(`
    INSERT OR REPLACE INTO tool_calls (id, record_id, tool, name, ts, call_index)
    VALUES (@id, @recordId, @tool, @name, @ts, @callIndex)
  `).run({
    id: tc.id,
    recordId: tc.recordId ?? null,
    tool: tc.recordId ? null : (tc as any).tool,
    name: tc.name,
    ts: tc.ts,
    callIndex: tc.callIndex,
  })
}

export function getToolCallsByRecordId(db: Database.Database, recordId: string | null): ToolCallRecord[] {
  const rows = recordId === null
    ? db.prepare('SELECT * FROM tool_calls WHERE record_id IS NULL').all() as any[]
    : db.prepare('SELECT * FROM tool_calls WHERE record_id = ?').all(recordId) as any[]

  return rows.map(mapRowToToolCall)
}

export function getToolCallStats(db: Database.Database): Array<{ name: string; count: number }> {
  return db.prepare(`
    SELECT name, COUNT(*) as count
    FROM tool_calls
    GROUP BY name
    ORDER BY count DESC
  `).all() as Array<{ name: string; count: number }>
}

export function deleteOrphanToolCalls(db: Database.Database, beforeTs: number): number {
  const result = db.prepare(
    'DELETE FROM tool_calls WHERE record_id IS NULL AND ts < ?'
  ).run(beforeTs)
  return result.changes
}

function mapRowToToolCall(row: any): ToolCallRecord {
  return {
    id: row.id,
    recordId: row.record_id,
    name: row.name,
    ts: row.ts,
    callIndex: row.call_index,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test -- tests/db/tool-calls.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/db/tool-calls.ts packages/cli/tests/db/tool-calls.test.ts
git commit -m "feat(cli): add tool calls operations"
```

---

## Task 5: Synced Records and Tombstones Operations

**Files:**
- Create: `packages/cli/src/db/synced-records.ts`
- Create: `packages/cli/src/db/tombstones.ts`
- Create: `packages/cli/tests/db/synced-records.test.ts`
- Create: `packages/cli/tests/db/tombstones.test.ts`

- [ ] **Step 1: Write failing test for synced records**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertSyncedRecord, getSyncedRecordById, upsertSyncedRecord } from '../../src/db/synced-records.js'
import type { SyncRecord } from '@aiusage/core'

function createTestSyncRecord(overrides: Partial<SyncRecord> = {}): SyncRecord {
  return {
    id: 'sync-1',
    ts: 1776738085346,
    tool: 'claude-code',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 200,
    thinkingTokens: 0,
    cost: 0.001,
    costSource: 'pricing',
    sessionKey: 'abc123def456',
    device: 'test-device',
    deviceInstanceId: 'device-123',
    updatedAt: 1776738085700,
    ...overrides,
  }
}

describe('Synced Records', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('inserts a synced record', () => {
    const record = createTestSyncRecord()
    insertSyncedRecord(db, record)
    const retrieved = getSyncedRecordById(db, 'sync-1')
    expect(retrieved).not.toBeNull()
    expect(retrieved!.id).toBe('sync-1')
  })

  it('upserts synced record with newer updatedAt', () => {
    const record = createTestSyncRecord()
    insertSyncedRecord(db, record)
    upsertSyncedRecord(db, { ...record, model: 'gpt-4o', updatedAt: 1776738085800 })

    const retrieved = getSyncedRecordById(db, 'sync-1')
    expect(retrieved!.model).toBe('gpt-4o')
    expect(retrieved!.updatedAt).toBe(1776738085800)
  })

  it('does not overwrite with older updatedAt', () => {
    const record = createTestSyncRecord({ updatedAt: 1776738085800 })
    insertSyncedRecord(db, record)
    upsertSyncedRecord(db, { ...record, model: 'gpt-4o', updatedAt: 1776738085700 })

    const retrieved = getSyncedRecordById(db, 'sync-1')
    expect(retrieved!.model).toBe('claude-sonnet-4-6')
  })
})
```

- [ ] **Step 2: Write failing test for tombstones**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertTombstone, getTombstonesByScope, isTombstoned } from '../../src/db/tombstones.js'
import type { SyncTombstone } from '@aiusage/core'

describe('Tombstones', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('inserts a tombstone', () => {
    const tombstone: SyncTombstone = {
      id: 'sync-1',
      deviceScope: 'device-123',
      deletedAt: 1776738085700,
      reason: 'retention',
    }
    insertTombstone(db, tombstone)
    const tombstones = getTombstonesByScope(db, 'device-123')
    expect(tombstones).toHaveLength(1)
    expect(tombstones[0].id).toBe('sync-1')
  })

  it('checks if record is tombstoned for specific device', () => {
    const tombstone: SyncTombstone = {
      id: 'sync-1',
      deviceScope: 'device-123',
      deletedAt: 1776738085700,
      reason: 'retention',
    }
    insertTombstone(db, tombstone)
    expect(isTombstoned(db, 'sync-1', 'device-123')).toBe(true)
    expect(isTombstoned(db, 'sync-1', 'device-456')).toBe(false)
  })

  it('checks if record is tombstoned globally', () => {
    const tombstone: SyncTombstone = {
      id: 'sync-1',
      deviceScope: '*',
      deletedAt: 1776738085700,
      reason: 'manual_clean',
    }
    insertTombstone(db, tombstone)
    expect(isTombstoned(db, 'sync-1', 'device-123')).toBe(true)
    expect(isTombstoned(db, 'sync-1', 'device-456')).toBe(true)
  })

  it('device-specific tombstone does not affect other devices', () => {
    const tombstone: SyncTombstone = {
      id: 'sync-1',
      deviceScope: 'device-123',
      deletedAt: 1776738085700,
      reason: 'retention',
    }
    insertTombstone(db, tombstone)
    expect(isTombstoned(db, 'sync-1', 'device-456')).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/cli && pnpm test -- tests/db/synced-records.test.ts tests/db/tombstones.test.ts`
Expected: FAIL

- [ ] **Step 4: Write synced-records.ts implementation**

```typescript
import type Database from 'better-sqlite3'
import type { SyncRecord } from '@aiusage/core'

export function insertSyncedRecord(db: Database.Database, record: SyncRecord): void {
  db.prepare(`
    INSERT OR REPLACE INTO synced_records (
      id, ts, tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_key, device, device_instance_id, updated_at
    ) VALUES (
      @id, @ts, @tool, @model, @provider, @inputTokens, @outputTokens,
      @cacheReadTokens, @cacheWriteTokens, @thinkingTokens,
      @cost, @costSource, @sessionKey, @device, @deviceInstanceId, @updatedAt
    )
  `).run({
    id: record.id,
    ts: record.ts,
    tool: record.tool,
    model: record.model,
    provider: record.provider,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cacheReadTokens: record.cacheReadTokens,
    cacheWriteTokens: record.cacheWriteTokens,
    thinkingTokens: record.thinkingTokens,
    cost: record.cost,
    costSource: record.costSource,
    sessionKey: record.sessionKey,
    device: record.device,
    deviceInstanceId: record.deviceInstanceId,
    updatedAt: record.updatedAt,
  })
}

export function getSyncedRecordById(db: Database.Database, id: string): SyncRecord | null {
  const row = db.prepare('SELECT * FROM synced_records WHERE id = ?').get(id) as any
  if (!row) return null
  return mapRowToSyncRecord(row)
}

export function upsertSyncedRecord(db: Database.Database, record: SyncRecord): void {
  const existing = getSyncedRecordById(db, record.id)
  if (!existing || record.updatedAt > existing.updatedAt) {
    insertSyncedRecord(db, record)
  }
}

function mapRowToSyncRecord(row: any): SyncRecord {
  return {
    id: row.id,
    ts: row.ts,
    tool: row.tool,
    model: row.model,
    provider: row.provider,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    thinkingTokens: row.thinking_tokens,
    cost: row.cost,
    costSource: row.cost_source,
    sessionKey: row.session_key,
    device: row.device,
    deviceInstanceId: row.device_instance_id,
    updatedAt: row.updated_at,
  }
}
```

- [ ] **Step 5: Write tombstones.ts implementation**

```typescript
import type Database from 'better-sqlite3'
import type { SyncTombstone } from '@aiusage/core'

export function insertTombstone(db: Database.Database, tombstone: SyncTombstone): void {
  db.prepare(`
    INSERT OR REPLACE INTO sync_tombstones (id, device_scope, deleted_at, reason)
    VALUES (@id, @deviceScope, @deletedAt, @reason)
  `).run({
    id: tombstone.id,
    deviceScope: tombstone.deviceScope,
    deletedAt: tombstone.deletedAt,
    reason: tombstone.reason,
  })
}

export function getTombstonesByScope(db: Database.Database, deviceScope: string): SyncTombstone[] {
  const rows = db.prepare(
    'SELECT * FROM sync_tombstones WHERE device_scope = ? OR device_scope = ?'
  ).all(deviceScope, '*') as any[]
  return rows.map(mapRowToTombstone)
}

export function isTombstoned(db: Database.Database, id: string, deviceInstanceId: string): boolean {
  const row = db.prepare(
    'SELECT 1 FROM sync_tombstones WHERE id = ? AND (device_scope = ? OR device_scope = ?)'
  ).get(id, deviceInstanceId, '*')
  return !!row
}

function mapRowToTombstone(row: any): SyncTombstone {
  return {
    id: row.id,
    deviceScope: row.device_scope,
    deletedAt: row.deleted_at,
    reason: row.reason,
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/cli && pnpm test -- tests/db/synced-records.test.ts tests/db/tombstones.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/db/synced-records.ts packages/cli/src/db/tombstones.ts packages/cli/tests/db/
git commit -m "feat(cli): add synced records and tombstones operations"
```

---

## Task 6: Watermark Management

**Files:**
- Create: `packages/cli/src/watermark.ts`
- Create: `packages/cli/tests/watermark.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { WatermarkManager } from '../src/watermark.js'

describe('WatermarkManager', () => {
  const testDir = join(tmpdir(), 'aiusage-watermark-test')
  const watermarkPath = join(testDir, 'watermark.json')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('loads empty watermark when file does not exist', () => {
    const wm = new WatermarkManager(watermarkPath)
    const entry = wm.getEntry('claude-code', '/path/to/file.jsonl')
    expect(entry).toBeNull()
  })

  it('saves and loads watermark entry', () => {
    const wm = new WatermarkManager(watermarkPath)
    wm.setEntry('claude-code', '/path/to/file.jsonl', {
      offset: 1000,
      size: 1000,
      mtime: 1776738085346,
      fileIdentity: { dev: 123, ino: 456 },
      headFingerprint: 'abc123',
    })
    wm.save()

    const wm2 = new WatermarkManager(watermarkPath)
    const entry = wm2.getEntry('claude-code', '/path/to/file.jsonl')
    expect(entry).not.toBeNull()
    expect(entry!.offset).toBe(1000)
    expect(entry!.size).toBe(1000)
    expect(entry!.mtime).toBe(1776738085346)
    expect(entry!.fileIdentity).toEqual({ dev: 123, ino: 456 })
    expect(entry!.headFingerprint).toBe('abc123')
  })

  it('returns null for non-existent tool', () => {
    const wm = new WatermarkManager(watermarkPath)
    const entry = wm.getEntry('codex', '/path/to/file.jsonl')
    expect(entry).toBeNull()
  })

  it('cleans up entries for non-existent files', () => {
    const wm = new WatermarkManager(watermarkPath)
    wm.setEntry('claude-code', '/non/existent/file.jsonl', {
      offset: 1000,
      size: 1000,
      mtime: 1776738085346,
    })
    wm.setEntry('claude-code', '/another/file.jsonl', {
      offset: 500,
      size: 500,
      mtime: 1776738085000,
    })
    wm.save()

    // Clean should remove non-existent entries
    wm.cleanup(['/another/file.jsonl'])
    wm.save()

    const wm2 = new WatermarkManager(watermarkPath)
    expect(wm2.getEntry('claude-code', '/non/existent/file.jsonl')).toBeNull()
    expect(wm2.getEntry('claude-code', '/another/file.jsonl')).not.toBeNull()
  })

  it('handles multiple tools', () => {
    const wm = new WatermarkManager(watermarkPath)
    wm.setEntry('claude-code', '/path/a.jsonl', { offset: 100, size: 100, mtime: 1000 })
    wm.setEntry('codex', '/path/b.jsonl', { offset: 200, size: 200, mtime: 2000 })
    wm.save()

    const wm2 = new WatermarkManager(watermarkPath)
    expect(wm2.getEntry('claude-code', '/path/a.jsonl')!.offset).toBe(100)
    expect(wm2.getEntry('codex', '/path/b.jsonl')!.offset).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- tests/watermark.test.ts`
Expected: FAIL with "Cannot find module '../src/watermark.js'"

- [ ] **Step 3: Write implementation**

```typescript
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { Tool } from '@aiusage/core'

export interface WatermarkEntry {
  offset: number
  size: number
  mtime: number
  fileIdentity?: { dev?: number; ino?: number; volumeSerial?: string; fileIndex?: string }
  headFingerprint?: string
}

export type WatermarkData = Record<Tool, Record<string, WatermarkEntry>>

export class WatermarkManager {
  private data: WatermarkData
  private path: string

  constructor(path: string) {
    this.path = path
    this.data = this.load()
  }

  private load(): WatermarkData {
    if (!existsSync(this.path)) {
      return {
        'claude-code': {},
        'codex': {},
        'openclaw': {},
      }
    }
    try {
      const content = readFileSync(this.path, 'utf-8')
      return JSON.parse(content)
    } catch {
      return {
        'claude-code': {},
        'codex': {},
        'openclaw': {},
      }
    }
  }

  save(): void {
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  getEntry(tool: Tool, filePath: string): WatermarkEntry | null {
    return this.data[tool]?.[filePath] ?? null
  }

  setEntry(tool: Tool, filePath: string, entry: WatermarkEntry): void {
    if (!this.data[tool]) {
      this.data[tool] = {}
    }
    this.data[tool][filePath] = entry
  }

  cleanup(existingFiles: string[]): void {
    const existingSet = new Set(existingFiles)
    for (const tool of Object.keys(this.data) as Tool[]) {
      for (const filePath of Object.keys(this.data[tool])) {
        if (!existingSet.has(filePath)) {
          delete this.data[tool][filePath]
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test -- tests/watermark.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/watermark.ts packages/cli/tests/watermark.test.ts
git commit -m "feat(cli): add watermark management"
```

---

## Task 7: PID Lock

**Files:**
- Create: `packages/cli/src/lock.ts`
- Create: `packages/cli/tests/lock.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { acquireLock, releaseLock, isLocked } from '../src/lock.js'

describe('PID Lock', () => {
  const testDir = join(tmpdir(), 'aiusage-lock-test')
  const lockPath = join(testDir, 'parse.lock')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('acquires lock when no lock exists', () => {
    const acquired = acquireLock(lockPath)
    expect(acquired).toBe(true)
    expect(existsSync(lockPath)).toBe(true)
  })

  it('writes PID to lock file', () => {
    acquireLock(lockPath)
    const content = readFileSync(lockPath, 'utf-8')
    expect(content).toBe(process.pid.toString())
  })

  it('releases lock', () => {
    acquireLock(lockPath)
    releaseLock(lockPath)
    expect(existsSync(lockPath)).toBe(false)
  })

  it('checks if locked', () => {
    expect(isLocked(lockPath)).toBe(false)
    acquireLock(lockPath)
    expect(isLocked(lockPath)).toBe(true)
    releaseLock(lockPath)
    expect(isLocked(lockPath)).toBe(false)
  })

  it('detects stale lock from dead process', () => {
    // Write a fake PID that doesn't exist
    const fakePid = 999999999
    require('node:fs').writeFileSync(lockPath, fakePid.toString())
    const acquired = acquireLock(lockPath)
    expect(acquired).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- tests/lock.test.ts`
Expected: FAIL with "Cannot find module '../src/lock.js'"

- [ ] **Step 3: Write implementation**

```typescript
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'

export function acquireLock(lockPath: string, timeoutMs: number = 5000): boolean {
  if (!existsSync(lockPath)) {
    writeFileSync(lockPath, process.pid.toString(), 'utf-8')
    return true
  }

  // Check if the PID in the lock file is still running
  try {
    const content = readFileSync(lockPath, 'utf-8')
    const pid = parseInt(content.trim(), 10)
    if (isNaN(pid)) {
      // Invalid lock file, remove it
      unlinkSync(lockPath)
      writeFileSync(lockPath, process.pid.toString(), 'utf-8')
      return true
    }

    // Try to check if process is running
    try {
      process.kill(pid, 0) // Signal 0 checks existence without sending signal
      // Process is running, wait for timeout
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        // Busy wait (simplified - in real code use setTimeout)
      }
      return false // Timeout
    } catch {
      // Process not running, acquire lock
      unlinkSync(lockPath)
      writeFileSync(lockPath, process.pid.toString(), 'utf-8')
      return true
    }
  } catch {
    // Error reading lock file, try to acquire
    try {
      unlinkSync(lockPath)
    } catch {}
    writeFileSync(lockPath, process.pid.toString(), 'utf-8')
    return true
  }
}

export function releaseLock(lockPath: string): void {
  try {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath)
    }
  } catch {}
}

export function isLocked(lockPath: string): boolean {
  return existsSync(lockPath)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test -- tests/lock.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lock.ts packages/cli/tests/lock.test.ts
git commit -m "feat(cli): add PID lock mechanism"
```

---

## Task 8: Directory Initialization

**Files:**
- Create: `packages/cli/src/init.ts`
- Create: `packages/cli/tests/init.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { ensureAiusageDir, getState, setState } from '../src/init.js'

describe('Directory Initialization', () => {
  const testDir = join(tmpdir(), 'aiusage-init-test')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('creates aiusage directory if not exists', () => {
    const aiusageDir = join(testDir, '.aiusage')
    ensureAiusageDir(aiusageDir)
    expect(existsSync(aiusageDir)).toBe(true)
  })

  it('generates deviceInstanceId on first run', () => {
    const aiusageDir = join(testDir, '.aiusage')
    ensureAiusageDir(aiusageDir)
    const state = getState(aiusageDir)
    expect(state).not.toBeNull()
    expect(state!.deviceInstanceId).toBeDefined()
    expect(state!.deviceInstanceId).toHaveLength(36) // UUID format
  })

  it('preserves existing deviceInstanceId', () => {
    const aiusageDir = join(testDir, '.aiusage')
    ensureAiusageDir(aiusageDir)
    const state1 = getState(aiusageDir)
    ensureAiusageDir(aiusageDir)
    const state2 = getState(aiusageDir)
    expect(state2!.deviceInstanceId).toBe(state1!.deviceInstanceId)
  })

  it('sets and gets state', () => {
    const aiusageDir = join(testDir, '.aiusage')
    ensureAiusageDir(aiusageDir)
    setState(aiusageDir, { lastSyncAt: 1776738085700 })
    const state = getState(aiusageDir)
    expect(state!.lastSyncAt).toBe(1776738085700)
  })

  it('creates state.json with correct structure', () => {
    const aiusageDir = join(testDir, '.aiusage')
    ensureAiusageDir(aiusageDir)
    const content = readFileSync(join(aiusageDir, 'state.json'), 'utf-8')
    const state = JSON.parse(content)
    expect(state).toHaveProperty('deviceInstanceId')
    expect(state).toHaveProperty('lastSyncStatus', 'ok')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- tests/init.test.ts`
Expected: FAIL with "Cannot find module '../src/init.js'"

- [ ] **Step 3: Write implementation**

```typescript
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface State {
  deviceInstanceId: string
  lastSyncAt?: number
  lastSyncStatus: 'ok' | 'failed' | 'conflict_resolved' | 'blocked_pending_consent'
  syncConsentAt?: number
  syncConsentTarget?: string
  lastSyncTarget?: string
  lastSyncUploaded?: number
  lastSyncPulled?: number
  lastRemoteCleanAt?: number
  lastRemoteCleanSummary?: string
}

export function ensureAiusageDir(aiusageDir: string): void {
  if (!existsSync(aiusageDir)) {
    mkdirSync(aiusageDir, { recursive: true, mode: 0o700 })
  }

  const statePath = join(aiusageDir, 'state.json')
  if (!existsSync(statePath)) {
    const initialState: State = {
      deviceInstanceId: randomUUID(),
      lastSyncStatus: 'ok',
    }
    writeFileSync(statePath, JSON.stringify(initialState, null, 2), 'utf-8')
  }
}

export function getState(aiusageDir: string): State | null {
  const statePath = join(aiusageDir, 'state.json')
  if (!existsSync(statePath)) return null
  try {
    const content = readFileSync(statePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export function setState(aiusageDir: string, updates: Partial<State>): void {
  const statePath = join(aiusageDir, 'state.json')
  const current = getState(aiusageDir) ?? {
    deviceInstanceId: randomUUID(),
    lastSyncStatus: 'ok' as const,
  }
  const updated = { ...current, ...updates }
  writeFileSync(statePath, JSON.stringify(updated, null, 2), 'utf-8')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test -- tests/init.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/init.ts packages/cli/tests/init.test.ts
git commit -m "feat(cli): add directory initialization with device identity"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] SQLite schema with all tables and indexes
   - [x] Schema migration system
   - [x] Records CRUD operations
   - [x] Tool calls operations
   - [x] Synced records operations
   - [x] Tombstones operations with deviceScope semantics
   - [x] Watermark management
   - [x] PID lock mechanism
   - [x] Directory initialization with deviceInstanceId

2. **Placeholder scan:**
   - [x] No TBD/TODO in plan
   - [x] All code blocks are complete

3. **Type consistency:**
   - [x] All interfaces match @aiusage/core types
   - [x] Database column names match spec

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-12-storage-layer.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
