import type Database from 'better-sqlite3'
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

export function generateStatus(db: Database.Database): StatusResult {
  const state = getState(join(homedir(), '.aiusage'))
  const recordCount = (db.prepare('SELECT COUNT(*) as count FROM records').get() as any).count

  return {
    version: '0.0.1',
    deviceName: state?.deviceInstanceId?.slice(0, 8) ?? 'unknown',
    databaseSize: '0 KB',
    recordCount,
    syncStatus: state?.lastSyncStatus ?? 'not_configured',
    lastSyncAt: state?.lastSyncAt,
  }
}
