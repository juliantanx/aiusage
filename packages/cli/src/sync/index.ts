import type Database from 'better-sqlite3'
import type { SyncRecord } from '@aiusage/core'
import { getUnsyncedRecords } from '../db/records.js'
import { insertSyncedRecord } from '../db/synced-records.js'
import { mapStatsRecordToSyncRecord } from './mapper.js'

export interface SyncBackend {
  readFile(path: string): Promise<{ sha: string; content: string } | null>
  writeFile(path: string, content: string, sha?: string): Promise<void>
}

export interface SyncOptions {
  deviceInstanceId: string
  consentVerified: boolean
}

export interface SyncResult {
  status: 'ok' | 'blocked_pending_consent' | 'failed'
  pulledCount: number
  uploadedCount: number
  error?: string
}

const BATCH_SIZE = 5000

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
      return { status: 'blocked_pending_consent', pulledCount: 0, uploadedCount: 0 }
    }

    try {
      const pulledCount = await this.pull()
      const uploadedCount = await this.upload()
      return { status: 'ok', pulledCount, uploadedCount }
    } catch (error) {
      return {
        status: 'failed',
        pulledCount: 0,
        uploadedCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  private async pull(): Promise<number> {
    const now = new Date()
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}.ndjson`
    const remote = await this.backend.readFile(path)
    if (!remote) return 0

    const lines = remote.content.split('\n').filter(Boolean)
    let count = 0
    for (const line of lines) {
      try {
        const record: SyncRecord = JSON.parse(line)
        insertSyncedRecord(this.db, record)
        count++
      } catch {}
    }
    return count
  }

  private async upload(): Promise<number> {
    const unsynced = getUnsyncedRecords(this.db)
    if (unsynced.length === 0) return 0

    const now = new Date()
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}.ndjson`

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
    const localSyncRecords = unsynced.map(mapStatsRecordToSyncRecord)
    for (const record of localSyncRecords) {
      const existing = remoteRecords.get(record.id)
      if (!existing || record.updatedAt >= existing.updatedAt) {
        remoteRecords.set(record.id, record)
      }
    }

    // Write merged data in batches
    const allRecords = Array.from(remoteRecords.values())
    let currentSha: string | undefined = remote?.sha

    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      const batch = allRecords.slice(i, i + BATCH_SIZE)
      const content = batch.map(r => JSON.stringify(r)).join('\n') + '\n'
      await this.backend.writeFile(path, content, currentSha)
      // After first write, subsequent writes need the new SHA from re-reading
      if (i + BATCH_SIZE < allRecords.length) {
        const updated = await this.backend.readFile(path)
        currentSha = updated?.sha
      }
    }

    // Mark local records as synced
    const syncedAt = Date.now()
    for (const record of unsynced) {
      this.db.prepare('UPDATE records SET synced_at = ? WHERE id = ?').run(syncedAt, record.id)
    }

    return unsynced.length
  }
}
