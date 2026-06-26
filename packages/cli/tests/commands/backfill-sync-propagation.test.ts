import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord, getUnsyncedRecords } from '../../src/db/records.js'
import { backfillCwd, backfillHermesSourceFiles } from '../../src/commands/parse.js'
import type { StatsRecord } from '@aiusage/core'

// Regression tests for issue #12: backfills that enrich records (cwd, hermes
// source_file) must bump updated_at so the enriched data propagates to other
// devices on the next sync. Without the bump, getUnsyncedRecords never re-selects
// the record (it filters updated_at > synced_at) and the cross-device project
// stats stay broken — Codex sessions vanish on the device running `aiusage serve`.

const testDir = join(tmpdir(), 'aiusage-backfill-sync-test')

function makeSyncedRecord(overrides: Partial<StatsRecord>): StatsRecord {
  // updatedAt < syncedAt simulates "already uploaded, untouched since".
  return {
    id: 'rec-1',
    ts: 1000,
    ingestedAt: 1000,
    syncedAt: 5000,
    updatedAt: 1000,
    lineOffset: 0,
    tool: 'codex',
    model: 'gpt-5',
    provider: 'openai',
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    thinkingTokens: 0,
    cost: 0,
    costSource: 'pricing',
    sessionId: 'sess-1',
    sourceFile: '',
    cwd: '',
    device: 'host-b',
    deviceInstanceId: 'device-b',
    platform: 'darwin',
    ...overrides,
  }
}

describe('backfill sync propagation (issue #12)', () => {
  let db: Database.Database

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('backfillCwd sets cwd AND re-marks the record as unsynced', () => {
    const codexFile = join(testDir, 'rollout-test.jsonl')
    writeFileSync(codexFile, JSON.stringify({
      type: 'session_meta',
      payload: { id: 'sess-1', cwd: '/Users/alice/Projects/my-project' },
    }) + '\n')

    insertRecord(db, makeSyncedRecord({ sourceFile: codexFile, cwd: '' }))

    // Already synced → not in the unsynced set before the backfill.
    expect(getUnsyncedRecords(db).map(r => r.id)).not.toContain('rec-1')

    backfillCwd(db)

    const row = db.prepare('SELECT cwd, updated_at, synced_at FROM records WHERE id = ?').get('rec-1') as {
      cwd: string; updated_at: number; synced_at: number
    }
    expect(row.cwd).toBe('/Users/alice/Projects/my-project')
    // The bump is what makes it propagate: updated_at must now exceed synced_at.
    expect(row.updated_at).toBeGreaterThan(row.synced_at)
    expect(getUnsyncedRecords(db).map(r => r.id)).toContain('rec-1')
  })

  it('backfillHermesSourceFiles rewrites source_file AND re-marks as unsynced', () => {
    const dbPath = join(testDir, 'missing-hermes.db') // no file → title lookup skipped
    insertRecord(db, makeSyncedRecord({
      tool: 'hermes',
      sourceFile: dbPath,
      cwd: 'n/a',
      sessionId: 'sess-1',
    }))

    expect(getUnsyncedRecords(db).map(r => r.id)).not.toContain('rec-1')

    backfillHermesSourceFiles(db)

    const row = db.prepare('SELECT source_file, updated_at, synced_at FROM records WHERE id = ?').get('rec-1') as {
      source_file: string; updated_at: number; synced_at: number
    }
    expect(row.source_file).toBe(`${dbPath}:session:sess-1`)
    expect(row.updated_at).toBeGreaterThan(row.synced_at)
    expect(getUnsyncedRecords(db).map(r => r.id)).toContain('rec-1')
  })
})
