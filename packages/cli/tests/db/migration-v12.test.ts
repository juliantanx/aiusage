import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord, getUnsyncedRecords } from '../../src/db/records.js'
import { migrateV12 } from '../../src/db/migrations/v12.js'
import type { StatsRecord } from '@aiusage/core'

// Issue #12: users who ran the buggy v1.5.0–v1.5.7 backfill have cwd populated
// locally but never propagated (updated_at was not bumped). The corrected
// `WHERE cwd = ''` backfill no longer matches them, so migration v12 must
// re-mark already-enriched records as changed to force a one-time re-upload.

function makeRecord(overrides: Partial<StatsRecord>): StatsRecord {
  return {
    id: 'rec',
    ts: 1000,
    ingestedAt: 1000,
    syncedAt: 5000,
    updatedAt: 1000, // < syncedAt → looks already-synced-and-untouched
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
    sessionId: 'sess',
    sourceFile: '/Users/a/.codex/sessions/2026/06/01/rollout-x.jsonl',
    cwd: '',
    device: 'host-b',
    deviceInstanceId: 'device-b',
    platform: 'darwin',
    ...overrides,
  }
}

describe('migration v12 (issue #12 re-propagation repair)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db) // builds full schema; ends at v12
    // initializeDatabase already ran v12 on the empty DB. Roll back just the
    // version row so we can seed records and re-run migrateV12 deterministically.
    db.prepare('DELETE FROM schema_version WHERE version = 12').run()
  })

  afterEach(() => db.close())

  it('bumps updated_at on cwd-enriched records so they re-propagate', () => {
    insertRecord(db, makeRecord({ id: 'codex-enriched', cwd: '/Users/a/Projects/proj' }))

    expect(getUnsyncedRecords(db).map(r => r.id)).not.toContain('codex-enriched')

    migrateV12(db)

    const row = db.prepare('SELECT updated_at, synced_at FROM records WHERE id = ?').get('codex-enriched') as {
      updated_at: number; synced_at: number
    }
    expect(row.updated_at).toBeGreaterThan(row.synced_at)
    expect(getUnsyncedRecords(db).map(r => r.id)).toContain('codex-enriched')
  })

  it('bumps hermes per-session source_file records', () => {
    insertRecord(db, makeRecord({
      id: 'hermes-enriched',
      tool: 'hermes',
      cwd: '',
      sourceFile: '/path/to/hermes.db:session:s1:My Title',
    }))

    migrateV12(db)

    expect(getUnsyncedRecords(db).map(r => r.id)).toContain('hermes-enriched')
  })

  it('does not touch records without cwd or session source_file', () => {
    insertRecord(db, makeRecord({ id: 'no-cwd', cwd: '', sourceFile: '/Users/a/.codex/sessions/x.jsonl' }))

    migrateV12(db)

    expect(getUnsyncedRecords(db).map(r => r.id)).not.toContain('no-cwd')
  })

  it('does not re-propagate merged synced/ records', () => {
    insertRecord(db, makeRecord({ id: 'merged', cwd: '/Users/a/Projects/proj', sourceFile: 'synced/device-x' }))

    migrateV12(db)

    expect(getUnsyncedRecords(db).map(r => r.id)).not.toContain('merged')
  })
})
