import type Database from 'better-sqlite3'

export interface CleanResult {
  deletedCount: number
  deletedSyncedCount: number
  deletedOrphanToolCalls: number
}

export function cleanOldData(db: Database.Database, days: number): CleanResult {
  const cutoff = Date.now() - days * 86400000

  const recordsResult = db.prepare('DELETE FROM records WHERE ts < ?').run(cutoff)
  const deletedCount = recordsResult.changes

  const syncedResult = db.prepare('DELETE FROM synced_records WHERE ts < ?').run(cutoff)
  const deletedSyncedCount = syncedResult.changes

  const orphanResult = db.prepare('DELETE FROM tool_calls WHERE record_id IS NULL AND ts < ?').run(cutoff)
  const deletedOrphanToolCalls = orphanResult.changes

  return {
    deletedCount,
    deletedSyncedCount,
    deletedOrphanToolCalls,
  }
}
