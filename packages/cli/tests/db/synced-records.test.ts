import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertSyncedRecord, getSyncedRecordById } from '../../src/db/synced-records.js'
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
    insertSyncedRecord(db, { ...record, model: 'gpt-4o', updatedAt: 1776738085800 })

    const retrieved = getSyncedRecordById(db, 'sync-1')
    expect(retrieved!.model).toBe('gpt-4o')
    expect(retrieved!.updatedAt).toBe(1776738085800)
  })

  it('does not overwrite with older updatedAt', () => {
    const record = createTestSyncRecord({ updatedAt: 1776738085800 })
    insertSyncedRecord(db, record)
    insertSyncedRecord(db, { ...record, model: 'gpt-4o', updatedAt: 1776738085700 })

    const retrieved = getSyncedRecordById(db, 'sync-1')
    expect(retrieved!.model).toBe('claude-sonnet-4-6')
  })
})
