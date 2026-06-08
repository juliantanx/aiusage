import type Database from 'better-sqlite3'
import { unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { AIUSAGE_DIR, loadConfig } from '../config.js'
import { cloudClear } from '../sync/cloud.js'
import { GitSyncBackend } from '../sync/git.js'
import { S3SyncBackend } from '../sync/s3.js'
import { loadCredential } from '../config.js'

export interface CleanResult {
  deletedCount: number
  deletedSyncedCount: number
  deletedOrphanToolCalls: number
}

export interface CleanAllResult {
  deletedRecords: number
  deletedToolCalls: number
  deletedSyncedRecords: number
  deletedSyncRecordState: number
  deletedTombstones: number
  watermarkRemoved: boolean
}

export interface RemoteBackend {
  type: 'cloud' | 'github' | 's3'
  label: string
}

export interface CleanPropagationResult {
  backends: Array<{ backend: RemoteBackend; status: 'ok' | 'skipped'; detail?: string }>
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

export function cleanAll(db: Database.Database): CleanAllResult {
  const recordsResult = db.prepare('DELETE FROM records').run()
  const toolCallsResult = db.prepare('DELETE FROM tool_calls').run()
  const syncedResult = db.prepare('DELETE FROM synced_records').run()
  const syncStateResult = db.prepare('DELETE FROM sync_record_state').run()
  const tombstonesResult = db.prepare('DELETE FROM sync_tombstones').run()

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
    deletedSyncRecordState: syncStateResult.changes,
    deletedTombstones: tombstonesResult.changes,
    watermarkRemoved,
  }
}

export function getRemoteBackends(): RemoteBackend[] {
  const config = loadConfig()
  if (!config?.sync) return []

  const backends: RemoteBackend[] = []

  if (config.sync.backend === 'cloud') {
    backends.push({ type: 'cloud', label: 'AIUsage Cloud (cloud)' })
  } else if (config.sync.backend === 'github' && config.sync.repo) {
    backends.push({ type: 'github', label: `GitHub (${config.sync.repo})` })
  } else if (config.sync.backend === 's3' && config.sync.bucket) {
    backends.push({ type: 's3', label: `S3 (${config.sync.bucket})` })
  }

  return backends
}

function createBackend(config: ReturnType<typeof loadConfig>) {
  if (!config?.sync) return null

  if (config.sync.backend === 'github') {
    if (!config.sync.repo) return null
    const token = loadCredential(`github/${config.sync.repo}/token`)
    if (!token) return null
    return new GitSyncBackend({
      repo: config.sync.repo,
      token,
      cacheDir: join(AIUSAGE_DIR, 'sync-repo'),
    })
  }

  if (config.sync.backend === 's3') {
    if (!config.sync.bucket) return null
    const accessKeyId = loadCredential(`s3/${config.sync.bucket}/accessKeyId`)
    const secretAccessKey = loadCredential(`s3/${config.sync.bucket}/secretAccessKey`)
    if (!accessKeyId || !secretAccessKey) return null
    return new S3SyncBackend({
      bucket: config.sync.bucket,
      prefix: config.sync.prefix ?? 'aiusage/',
      accessKeyId,
      secretAccessKey,
      endpoint: config.sync.endpoint,
      region: config.sync.region,
    })
  }

  return null
}

export async function propagateClean(options: {
  all: boolean
  beforeDays?: number
  target?: string
}): Promise<CleanPropagationResult> {
  const config = loadConfig()
  if (!config?.sync) return { backends: [] }

  const results: CleanPropagationResult['backends'] = []

  if (config.sync.backend === 'cloud') {
    if (!options.target || options.target === 'cloud') {
      try {
        const result = await cloudClear()
        results.push({
          backend: { type: 'cloud', label: 'AIUsage Cloud' },
          status: 'ok',
          detail: `generation updated to ${result.syncGeneration}`,
        })
      } catch (err) {
        results.push({
          backend: { type: 'cloud', label: 'AIUsage Cloud' },
          status: 'skipped',
          detail: err instanceof Error ? err.message : 'unknown error',
        })
      }
    }
    return { backends: results }
  }

  // GitHub or S3
  if (options.target && options.target !== config.sync.backend) {
    return { backends: results }
  }

  const backend = createBackend(config)
  if (!backend) {
    return { backends: [{
      backend: { type: config.sync.backend as 'github' | 's3', label: config.sync.backend },
      status: 'skipped',
      detail: 'Could not create backend (missing credentials)',
    }] }
  }

  try {
    await backend.prepare?.()

    if (options.all) {
      const files = await backend.listFiles()
      const fileCount = files.length
      if (fileCount > 0) {
        await backend.deleteAllData()
      }
      await backend.flush?.()
      results.push({
        backend: {
          type: config.sync.backend as 'github' | 's3',
          label: config.sync.backend === 'github' ? `GitHub (${config.sync.repo})` : `S3 (${config.sync.bucket})`,
        },
        status: 'ok',
        detail: `cleared ${fileCount} files`,
      })
    } else if (options.beforeDays) {
      const cutoff = Date.now() - options.beforeDays * 86400000
      const files = await backend.listFiles()
      let removedRecords = 0
      let modifiedFiles = 0

      for (const file of files) {
        const content = await backend.readFile(file)
        if (!content) continue

        const lines = content.split('\n').filter(Boolean)
        const kept: string[] = []
        for (const line of lines) {
          try {
            const record = JSON.parse(line)
            const ts = typeof record.ts === 'string' ? new Date(record.ts).getTime() : record.ts
            if (ts >= cutoff) {
              kept.push(line)
            } else {
              removedRecords++
            }
          } catch {
            kept.push(line)
          }
        }

        if (kept.length === 0) {
          await backend.deleteFile?.(file)
          modifiedFiles++
        } else if (kept.length < lines.length) {
          await backend.writeFile(file, kept.join('\n') + '\n')
          modifiedFiles++
        }
      }

      await backend.flush?.()
      results.push({
        backend: {
          type: config.sync.backend as 'github' | 's3',
          label: config.sync.backend === 'github' ? `GitHub (${config.sync.repo})` : `S3 (${config.sync.bucket})`,
        },
        status: 'ok',
        detail: `removed ${removedRecords} records from ${modifiedFiles} files`,
      })
    }
  } catch (err) {
    results.push({
      backend: {
        type: config.sync.backend as 'github' | 's3',
        label: config.sync.backend === 'github' ? `GitHub (${config.sync.repo})` : `S3 (${config.sync.bucket})`,
      },
      status: 'skipped',
      detail: err instanceof Error ? err.message : 'unknown error',
    })
  }

  return { backends: results }
}
