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
