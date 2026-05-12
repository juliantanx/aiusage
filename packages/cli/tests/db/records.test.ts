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
