import type Database from 'better-sqlite3'
import { statSync, existsSync } from 'node:fs'
import { getState } from '../init.js'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface StatusResult {
  version: string
  deviceName: string
  dbPath: string
  databaseSize: string
  schemaVersion: number
  tableCount: number
  viewCount: number
  recordCount: number
  syncStatus: string
  lastSyncAt?: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getDatabasePath(db: Database.Database): string {
  const row = db.prepare("PRAGMA database_list").get() as { file: string } | undefined
  if (!row?.file) return ':memory:'
  return row.file
}

export function generateStatus(db: Database.Database): StatusResult {
  const state = getState(join(homedir(), '.aiusage'))
  const recordCount = (db.prepare('SELECT COUNT(*) as count FROM records').get() as any).count
  const dbPath = getDatabasePath(db)
  const schemaVersion = ((db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as any)?.version ?? 0) as number
  const tableCount = ((db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get() as any)?.count ?? 0) as number
  const viewCount = ((db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'view'").get() as any)?.count ?? 0) as number

  const sizePath = join(homedir(), '.aiusage', 'cache.db')
  let databaseSize = '0 B'
  if (existsSync(sizePath)) {
    try {
      const stat = statSync(sizePath)
      databaseSize = formatFileSize(stat.size)
    } catch {}
  }

  return {
    version: '0.0.1',
    deviceName: state?.deviceInstanceId?.slice(0, 8) ?? 'unknown',
    dbPath,
    databaseSize,
    schemaVersion,
    tableCount,
    viewCount,
    recordCount,
    syncStatus: state?.lastSyncStatus ?? 'not_configured',
    lastSyncAt: state?.lastSyncAt,
  }
}
