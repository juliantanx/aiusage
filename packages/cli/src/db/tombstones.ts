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
  ).all(deviceScope, '*') as Record<string, unknown>[]
  return rows.map(mapRowToTombstone)
}

export function isTombstoned(db: Database.Database, id: string, deviceInstanceId: string): boolean {
  const row = db.prepare(
    'SELECT 1 FROM sync_tombstones WHERE id = ? AND (device_scope = ? OR device_scope = ?)'
  ).get(id, deviceInstanceId, '*')
  return !!row
}

function mapRowToTombstone(row: Record<string, unknown>): SyncTombstone {
  return {
    id: row.id as string,
    deviceScope: row.device_scope as string,
    deletedAt: row.deleted_at as number,
    reason: row.reason as SyncTombstone['reason'],
  }
}
