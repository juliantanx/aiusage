import type Database from 'better-sqlite3'
import type { SyncRecord } from '@aiusage/core'
import { getUnsyncedRecords } from '../db/records.js'
import { insertSyncedRecord, mergeSyncedRecordsIntoRecords } from '../db/synced-records.js'
import { mapStatsRecordToSyncRecord } from './mapper.js'
import type { SyncProgress } from './runtime.js'

export interface SyncBackend {
  readFile(path: string): Promise<{ sha: string; content: string } | null>
  writeFile(path: string, content: string, sha?: string): Promise<void>
  listFiles(): Promise<string[]>
  /** Optional: called before sync to fetch latest remote state (e.g. git pull) */
  prepare?(): Promise<void>
  /** Optional: called after all writes to push changes (e.g. git commit + push) */
  flush?(): Promise<boolean>
}

/** Thrown by backends when a write conflicts (stale sha/ETag). */
export class ConflictError extends Error {
  constructor(path: string) {
    super(`Conflict writing ${path}: remote was modified concurrently`)
    this.name = 'ConflictError'
  }
}

export interface SyncOptions {
  deviceInstanceId: string
  consentVerified: boolean
  onProgress?: (progress: SyncProgress) => void
}

export interface SyncResult {
  status: 'ok' | 'blocked_pending_consent' | 'failed'
  pulledCount: number
  uploadedCount: number
  mergedCount: number
  error?: string
}

export function getSyncPath(ts: string | number): string {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCHours()).padStart(2, '0')}.ndjson`
}

const MAX_CONFLICT_RETRIES = 1

/** Parse ndjson content into a Map<id, SyncRecord>, normalizing string timestamps */
function parseNdjson(content: string): Map<string, SyncRecord> {
  const records = new Map<string, SyncRecord>()
  for (const line of content.split('\n').filter(Boolean)) {
    try {
      const record: SyncRecord = JSON.parse(line)
      // Normalize string timestamps to integers (legacy remote data may have ISO strings)
      if (typeof record.ts === 'string') {
        (record as any).ts = new Date(record.ts).getTime()
      }
      if (typeof record.updatedAt === 'string') {
        (record as any).updatedAt = new Date(record.updatedAt).getTime()
      }
      records.set(record.id, record)
    } catch {}
  }
  return records
}

/** Merge local sync records into remote map; returns count of actually new/updated records */
function mergeRecordsIntoRemote(
  remoteRecords: Map<string, SyncRecord>,
  localSyncRecords: SyncRecord[],
): number {
  let changed = 0
  for (const record of localSyncRecords) {
    const existing = remoteRecords.get(record.id)
    if (!existing || record.updatedAt > existing.updatedAt) {
      remoteRecords.set(record.id, record)
      changed++
    }
  }
  return changed
}

/** Clean up stale "unknown" deviceInstanceId records from remote */
function removeUnknownRecords(remoteRecords: Map<string, SyncRecord>): void {
  for (const [id, record] of remoteRecords) {
    if (record.deviceInstanceId === 'unknown') {
      remoteRecords.delete(id)
    }
  }
}

export class SyncOrchestrator {
  private db: Database.Database
  private backend: SyncBackend
  private options: SyncOptions

  constructor(db: Database.Database, backend: SyncBackend, options: SyncOptions) {
    this.db = db
    this.backend = backend
    this.options = options
  }

  async sync(): Promise<SyncResult> {
    if (!this.options.consentVerified) {
      return { status: 'blocked_pending_consent', pulledCount: 0, uploadedCount: 0, mergedCount: 0 }
    }

    try {
      await this.backend.prepare?.()
      const pulledCount = await this.pull()
      this.options.onProgress?.({ phase: 'merging', pulledCount })
      const mergedCount = mergeSyncedRecordsIntoRecords(this.db)
      const uploadedCount = await this.upload()
      await this.backend.flush?.()
      this.options.onProgress?.({ phase: 'finalizing', pulledCount, uploadedCount })
      return { status: 'ok', pulledCount, uploadedCount, mergedCount }
    } catch (error) {
      return {
        status: 'failed',
        pulledCount: 0,
        uploadedCount: 0,
        mergedCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  private async pull(): Promise<number> {
    const paths = await this.backend.listFiles()
    this.options.onProgress?.({
      phase: 'pulling',
      completedFiles: 0,
      totalFiles: paths.length,
      pulledCount: 0,
    })
    if (paths.length === 0) return 0

    const localDeviceId = this.options.deviceInstanceId
    let totalPulled = 0

    for (const [index, path] of paths.entries()) {
      this.options.onProgress?.({
        phase: 'pulling',
        currentPath: path,
        completedFiles: index,
        totalFiles: paths.length,
        pulledCount: totalPulled,
      })
      const remote = await this.backend.readFile(path)
      if (!remote) continue

      const lines = remote.content.split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const record: SyncRecord = JSON.parse(line)
          // Normalize string timestamps to integers (legacy remote data may have ISO strings)
          if (typeof record.ts === 'string') {
            (record as any).ts = new Date(record.ts).getTime()
          }
          if (typeof record.updatedAt === 'string') {
            (record as any).updatedAt = new Date(record.updatedAt).getTime()
          }
          // Skip records from our own device and stale "unknown" records
          if (record.deviceInstanceId === localDeviceId) continue
          if (record.deviceInstanceId === 'unknown') continue
          insertSyncedRecord(this.db, record)
          totalPulled++
        } catch {}
      }

      this.options.onProgress?.({
        phase: 'pulling',
        currentPath: path,
        completedFiles: index + 1,
        totalFiles: paths.length,
        pulledCount: totalPulled,
      })
    }

    return totalPulled
  }

  private async uploadFileWithRetry(
    path: string,
    localSyncRecords: SyncRecord[],
  ): Promise<number> {
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      // Read current remote state
      const remote = await this.backend.readFile(path)
      const remoteRecords = remote ? parseNdjson(remote.content) : new Map<string, SyncRecord>()

      // Merge local into remote
      const changedCount = mergeRecordsIntoRemote(remoteRecords, localSyncRecords)
      removeUnknownRecords(remoteRecords)

      // Nothing actually new or updated — skip write
      if (changedCount === 0) return 0

      // Write merged data
      const allRecords = Array.from(remoteRecords.values())
      const content = allRecords.map(r => JSON.stringify(r)).join('\n') + '\n'

      try {
        await this.backend.writeFile(path, content, remote?.sha)
        return changedCount
      } catch (error) {
        if (error instanceof ConflictError && attempt < MAX_CONFLICT_RETRIES) {
          // Remote was modified concurrently — re-read and retry once
          continue
        }
        throw error
      }
    }

    // Should not reach here, but satisfy type checker
    return 0
  }

  private async upload(): Promise<number> {
    const unsynced = getUnsyncedRecords(this.db)
    if (unsynced.length === 0) return 0

    // Group records by hour to keep remote GitHub objects small enough to update reliably.
    const byPath = new Map<string, typeof unsynced>()
    for (const record of unsynced) {
      const path = getSyncPath(record.ts)
      if (!byPath.has(path)) byPath.set(path, [])
      byPath.get(path)!.push(record)
    }

    let totalUploaded = 0
    const uploads = Array.from(byPath.entries())

    this.options.onProgress?.({
      phase: 'uploading',
      completedFiles: 0,
      totalFiles: uploads.length,
      uploadedCount: 0,
    })

    for (const [index, [path, localRecords]] of uploads.entries()) {
      this.options.onProgress?.({
        phase: 'uploading',
        currentPath: path,
        completedFiles: index,
        totalFiles: uploads.length,
        uploadedCount: totalUploaded,
      })

      const localSyncRecords = localRecords.map(mapStatsRecordToSyncRecord)
      const changedCount = await this.uploadFileWithRetry(path, localSyncRecords)
      totalUploaded += changedCount

      this.options.onProgress?.({
        phase: 'uploading',
        currentPath: path,
        completedFiles: index + 1,
        totalFiles: uploads.length,
        uploadedCount: totalUploaded,
      })
    }

    // Mark local records as synced
    const syncedAt = Date.now()
    const updateStmt = this.db.prepare('UPDATE records SET synced_at = ? WHERE id = ?')
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) updateStmt.run(syncedAt, id)
    })
    tx(unsynced.map(r => r.id))

    return totalUploaded
  }
}
