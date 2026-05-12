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

    const syncRecords = unsynced.map(mapStatsRecordToSyncRecord)
    const content = syncRecords.map(r => JSON.stringify(r)).join('\n') + '\n'

    const current = await this.backend.readFile(path)
    await this.backend.writeFile(path, content, current?.sha)

    const syncedAt = Date.now()
    for (const record of unsynced) {
      this.db.prepare('UPDATE records SET synced_at = ? WHERE id = ?').run(syncedAt, record.id)
    }

    return unsynced.length
  }
}
