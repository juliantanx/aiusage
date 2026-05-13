import type Database from 'better-sqlite3'
import type { SyncRecord } from '@aiusage/core'
import { getUnsyncedRecords, insertRecord } from '../db/records.js'
import { insertSyncedRecord, mergeSyncedRecordsIntoRecords } from '../db/synced-records.js'
import { mapStatsRecordToSyncRecord } from './mapper.js'

export interface SyncBackend {
  readFile(path: string): Promise<{ sha: string; content: string } | null>
  writeFile(path: string, content: string, sha?: string): Promise<void>
  listFiles(): Promise<string[]>
}

export interface SyncOptions {
  deviceInstanceId: string
  consentVerified: boolean
}

export interface SyncResult {
  status: 'ok' | 'blocked_pending_consent' | 'failed'
  pulledCount: number
  uploadedCount: number
  mergedCount: number
  error?: string
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
      const pulledCount = await this.pull()
      const mergedCount = mergeSyncedRecordsIntoRecords(this.db)
      const uploadedCount = await this.upload()
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
    if (paths.length === 0) return 0

    const localDeviceId = this.options.deviceInstanceId
    let totalPulled = 0

    for (const path of paths) {
      const remote = await this.backend.readFile(path)
      if (!remote) continue

      const lines = remote.content.split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const record: SyncRecord = JSON.parse(line)
          // Skip records from our own device
          if (record.deviceInstanceId === localDeviceId) continue
          insertSyncedRecord(this.db, record)
          totalPulled++
        } catch {}
      }
    }

    return totalPulled
  }

  private async upload(): Promise<number> {
    const unsynced = getUnsyncedRecords(this.db)
    if (unsynced.length === 0) return 0

    // Group records by month for per-file upload
    const byMonth = new Map<string, typeof unsynced>()
    for (const record of unsynced) {
      const d = new Date(record.ts)
      const path = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}.ndjson`
      if (!byMonth.has(path)) byMonth.set(path, [])
      byMonth.get(path)!.push(record)
    }

    let totalUploaded = 0

    for (const [path, monthRecords] of byMonth) {
      // Read existing remote data to merge (never overwrite)
      const remote = await this.backend.readFile(path)
      const remoteRecords = new Map<string, SyncRecord>()
      if (remote) {
        for (const line of remote.content.split('\n').filter(Boolean)) {
          try {
            const record: SyncRecord = JSON.parse(line)
            remoteRecords.set(record.id, record)
          } catch {}
        }
      }

      // Merge: add new records, update existing if local is newer
      const localSyncRecords = monthRecords.map(mapStatsRecordToSyncRecord)
      for (const record of localSyncRecords) {
        const existing = remoteRecords.get(record.id)
        if (!existing || record.updatedAt >= existing.updatedAt) {
          remoteRecords.set(record.id, record)
        }
      }

      // Write merged data in a single operation
      const allRecords = Array.from(remoteRecords.values())
      const content = allRecords.map(r => JSON.stringify(r)).join('\n') + '\n'
      await this.backend.writeFile(path, content, remote?.sha)

      totalUploaded += monthRecords.length
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
