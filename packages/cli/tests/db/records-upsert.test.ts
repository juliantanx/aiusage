import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import type { StatsRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import {
  getRecordById,
  getUnsyncedRecords,
  insertRecord,
  markRecordsSynced,
  markRecordVersionsSynced,
} from '../../src/db/records.js'
import { getToolCallsByRecordId, insertToolCall } from '../../src/db/tool-calls.js'

const CLOUD = 'cloud:https://sync.example.test'
const FILE_TARGET = 'github:someone/usage-data'

function makeRecord(overrides: Partial<StatsRecord> = {}): StatsRecord {
  return {
    id: 'rec-1',
    ts: 1_776_738_085_000,
    ingestedAt: 1_000,
    updatedAt: 1_000,
    lineOffset: 100,
    tool: 'claude-code',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 10,
    cacheWriteTokens: 20,
    thinkingTokens: 0,
    cost: 0.001,
    costSource: 'pricing',
    sessionId: 'session-1',
    sourceFile: '/logs/session-1.jsonl',
    device: 'laptop',
    deviceInstanceId: 'device-1',
    ...overrides,
  }
}

describe('insertRecord on an id that already exists (#89)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  function syncStateRows(id: string): Array<{ target: string; synced_at: number }> {
    return db.prepare('SELECT target, synced_at FROM sync_record_state WHERE record_id = ? ORDER BY target').all(id) as Array<{ target: string; synced_at: number }>
  }

  it('keeps the tool calls of the record', () => {
    insertRecord(db, makeRecord())
    insertToolCall(db, { id: 'tc-1', recordId: 'rec-1', name: 'Read', ts: 1, callIndex: 0 })
    insertToolCall(db, { id: 'tc-2', recordId: 'rec-1', name: 'Grep', ts: 2, callIndex: 0 })

    insertRecord(db, makeRecord({ ingestedAt: 5_000, updatedAt: 5_000 }))
    insertRecord(db, makeRecord({ ingestedAt: 6_000, updatedAt: 6_000, outputTokens: 75 }))

    expect(getToolCallsByRecordId(db, 'rec-1').map(tc => tc.id).sort()).toEqual(['tc-1', 'tc-2'])
  })

  it('leaves an identical record synced for a cloud target', () => {
    insertRecord(db, makeRecord())
    expect(markRecordVersionsSynced(db, [{ id: 'rec-1', updatedAt: 1_000 }], CLOUD)).toBe(1)
    expect(getUnsyncedRecords(db, CLOUD)).toEqual([])

    // What a parser emits when it reads the same source row again: the same
    // content, stamped with the time of the new run.
    insertRecord(db, makeRecord({ ingestedAt: 9_000, updatedAt: 9_000 }))

    expect(syncStateRows('rec-1')).toEqual([{ target: CLOUD, synced_at: 1_000 }])
    expect(getUnsyncedRecords(db, CLOUD)).toEqual([])
    expect(getRecordById(db, 'rec-1')).toMatchObject({ ingestedAt: 1_000, updatedAt: 1_000, syncedAt: 1_000 })
  })

  it('leaves an identical record synced for a file backend', () => {
    insertRecord(db, makeRecord())
    markRecordsSynced(db, ['rec-1'], 2_000, FILE_TARGET)
    markRecordsSynced(db, ['rec-1'], 2_000)

    insertRecord(db, makeRecord({ ingestedAt: 9_000, updatedAt: 9_000 }))

    expect(syncStateRows('rec-1')).toEqual([{ target: FILE_TARGET, synced_at: 2_000 }])
    expect(getUnsyncedRecords(db, FILE_TARGET)).toEqual([])
    expect(getUnsyncedRecords(db)).toEqual([])
    expect(getRecordById(db, 'rec-1')).toMatchObject({ ingestedAt: 1_000, updatedAt: 1_000, syncedAt: 2_000 })
  })

  it('queues a record again when a stored field changed, without forgetting what was acknowledged', () => {
    insertRecord(db, makeRecord())
    markRecordVersionsSynced(db, [{ id: 'rec-1', updatedAt: 1_000 }], CLOUD)

    insertRecord(db, makeRecord({ ingestedAt: 9_000, updatedAt: 9_000, outputTokens: 75, cost: 0.002 }))

    const stored = getRecordById(db, 'rec-1')!
    expect(stored).toMatchObject({ outputTokens: 75, cost: 0.002, ingestedAt: 1_000, updatedAt: 9_000, syncedAt: 1_000 })
    expect(syncStateRows('rec-1')).toEqual([{ target: CLOUD, synced_at: 1_000 }])
    expect(getUnsyncedRecords(db, CLOUD).map(r => r.id)).toEqual(['rec-1'])
    expect(getUnsyncedRecords(db).map(r => r.id)).toEqual(['rec-1'])
  })

  it.each([
    ['ts', { ts: 1_776_738_099_000 }],
    ['lineOffset', { lineOffset: 250 }],
    ['model', { model: 'claude-opus-4-6' }],
    ['provider', { provider: 'bedrock' }],
    ['inputTokens', { inputTokens: 101 }],
    ['cacheReadTokens', { cacheReadTokens: 11 }],
    ['cacheWriteTokens', { cacheWriteTokens: 21 }],
    ['thinkingTokens', { thinkingTokens: 5 }],
    ['costSource', { costSource: 'log' as const }],
    ['sessionId', { sessionId: 'session-2' }],
    ['sourceFile', { sourceFile: '/logs/session-2.jsonl' }],
    ['cwd', { cwd: '/work/project' }],
    ['device', { device: 'desktop' }],
    ['deviceInstanceId', { deviceInstanceId: 'device-2' }],
    ['platform', { platform: 'linux' }],
  ])('treats a different %s as a change', (_field, change) => {
    insertRecord(db, makeRecord())
    insertRecord(db, makeRecord({ ...change, updatedAt: 9_000 }))

    expect(getRecordById(db, 'rec-1')).toMatchObject({ ...change, updatedAt: 9_000, ingestedAt: 1_000 })
  })

  it('does not erase a stored cwd or platform when the parser supplies none', () => {
    insertRecord(db, makeRecord({ cwd: '/work/project', platform: 'win32' }))
    markRecordVersionsSynced(db, [{ id: 'rec-1', updatedAt: 1_000 }], CLOUD)

    insertRecord(db, makeRecord({ updatedAt: 9_000 }))

    expect(getRecordById(db, 'rec-1')).toMatchObject({ cwd: '/work/project', platform: 'win32', updatedAt: 1_000 })
    expect(getUnsyncedRecords(db, CLOUD)).toEqual([])
  })

  it('moves updated_at forward when a change carries a timestamp that is not newer', () => {
    insertRecord(db, makeRecord({ updatedAt: 5_000 }))
    markRecordVersionsSynced(db, [{ id: 'rec-1', updatedAt: 5_000 }], CLOUD)

    // Same millisecond, or a clock that stepped back: the changed version must
    // still be newer than the one that was acknowledged.
    insertRecord(db, makeRecord({ updatedAt: 5_000, outputTokens: 60 }))
    expect(getRecordById(db, 'rec-1')!.updatedAt).toBe(5_001)
    insertRecord(db, makeRecord({ updatedAt: 4_000, outputTokens: 70 }))
    expect(getRecordById(db, 'rec-1')!.updatedAt).toBe(5_002)

    expect(getUnsyncedRecords(db, CLOUD).map(r => r.id)).toEqual(['rec-1'])
  })

  it('moves updated_at past a file backend acknowledgement that is later than the change', () => {
    insertRecord(db, makeRecord({ updatedAt: 1_000 }))
    // A file backend acknowledges with the time of its upload.
    markRecordsSynced(db, ['rec-1'], 2_000, FILE_TARGET)
    markRecordsSynced(db, ['rec-1'], 2_500)

    // The clock stepped back before the record changed.
    insertRecord(db, makeRecord({ updatedAt: 1_500, outputTokens: 60 }))

    expect(getRecordById(db, 'rec-1')!.updatedAt).toBe(2_501)
    expect(getUnsyncedRecords(db, FILE_TARGET).map(r => r.id)).toEqual(['rec-1'])
    expect(getUnsyncedRecords(db).map(r => r.id)).toEqual(['rec-1'])
  })

  it('still inserts a new record exactly as given', () => {
    insertRecord(db, makeRecord({ id: 'rec-new', ingestedAt: 7_000, updatedAt: 7_500, syncedAt: 7_600, cwd: '/c', platform: 'darwin' }))

    expect(getRecordById(db, 'rec-new')).toMatchObject({
      ingestedAt: 7_000, updatedAt: 7_500, syncedAt: 7_600, cwd: '/c', platform: 'darwin', origin: 'local',
    })
  })
})
