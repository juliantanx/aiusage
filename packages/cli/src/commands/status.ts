import type Database from 'better-sqlite3'
import { statSync, existsSync } from 'node:fs'
import { getState } from '../init.js'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface StatusResult {
  version: string
  deviceName: string
  databaseSize: string
  recordCount: number
  syncStatus: string
  lastSyncAt?: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function generateStatus(db: Database.Database): StatusResult {
  const state = getState(join(homedir(), '.aiusage'))
  const recordCount = (db.prepare('SELECT COUNT(*) as count FROM records').get() as any).count

  const dbPath = join(homedir(), '.aiusage', 'cache.db')
  let databaseSize = '0 B'
  if (existsSync(dbPath)) {
    try {
      const stat = statSync(dbPath)
      databaseSize = formatFileSize(stat.size)
    } catch {}
  }

  return {
    version: '0.0.1',
    deviceName: state?.deviceInstanceId?.slice(0, 8) ?? 'unknown',
    databaseSize,
    recordCount,
    syncStatus: state?.lastSyncStatus ?? 'not_configured',
    lastSyncAt: state?.lastSyncAt,
  }
}
