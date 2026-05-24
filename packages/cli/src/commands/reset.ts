import { unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { AIUSAGE_DIR } from '../config.js'

export interface ResetResult {
  deletedRecords: number
  deletedToolCalls: number
  deletedSyncedRecords: number
  watermarkRemoved: boolean
}

export function runReset(db: Database.Database): ResetResult {
  const recordsResult = db.prepare('DELETE FROM records').run()
  const toolCallsResult = db.prepare('DELETE FROM tool_calls').run()
  const syncedResult = db.prepare('DELETE FROM synced_records').run()

  const watermarkPath = join(AIUSAGE_DIR, 'watermark.json')
  let watermarkRemoved = false
  if (existsSync(watermarkPath)) {
    unlinkSync(watermarkPath)
    watermarkRemoved = true
  }

  return {
    deletedRecords: recordsResult.changes,
    deletedToolCalls: toolCallsResult.changes,
    deletedSyncedRecords: syncedResult.changes,
    watermarkRemoved,
  }
}
