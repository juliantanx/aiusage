import type Database from 'better-sqlite3'
import { unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { AIUSAGE_DIR, loadConfig } from '../config.js'
import type { SyncRecord } from '@aiusage/core'
import { cloudClear } from '../sync/cloud.js'
import type { SyncBackend } from '../sync/index.js'
import { buildManifest, manifestPath, serializeManifest, serializeSnapshot } from '../sync/manifest.js'
import { listedOwners, readNamespaceSnapshot } from '../sync/snapshot.js'
import { createBackend } from './sync.js'
import { dropDanglingClaims } from '../db/sync-claims.js'

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
  deletedRetiredWireIds: number
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
  dropDanglingClaims(db)

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
  db.prepare('DELETE FROM sync_record_claims').run()
  db.prepare('DELETE FROM sync_namespace_verdicts').run()
  // A full wipe leaves no sync bookkeeping behind at all: the retirements
  // pending for the cloud backend describe records that no longer exist here
  // (the cloud is cleared alongside, or `--local-only` was chosen knowingly).
  const retiredResult = db.prepare('DELETE FROM sync_retired_wire_ids').run()

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
    deletedRetiredWireIds: retiredResult.changes,
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


export interface RemoteCleanResult {
  removedRecords: number
  /** Day files rewritten or deleted (manifests not included). */
  modifiedFiles: number
  /**
   * Namespaces left untouched because their snapshot could not be verified
   * (a manifest that does not parse or does not match its files, a file gone
   * missing, a malformed line): rewriting them could bless a partial or
   * corrupt state. Keyed by owner, with the reason.
   */
  skippedNamespaces: Array<{ owner: string; reason: string }>
}

/**
 * Remove every record older than `cutoff` from the day files on a file-based
 * target, namespace by namespace, following the snapshot rules of sync and
 * `sync --repair` so peers keep verifying the namespaces that changed.
 *
 * A namespace is only modified after its current snapshot was read
 * *reliably* — through its manifest when it has one (every named file
 * present, parsing cleanly and matching its digest), or with every listed
 * file parsing cleanly when it has none. Anything else is skipped and
 * reported: the owner may be rewriting it (S3 writes object by object), it
 * may have been left half-written, or a file may be corrupt, and a manifest
 * published over such a state would make it authoritative for every peer.
 * Verification also means the rewritten files derive from one consistent
 * snapshot, so a manifest this function writes can only ever describe that
 * snapshot minus the removed records — never a mixture with files the owner
 * wrote in between (those fail the digest check on every peer until the
 * owner's next sync, which republishes the namespace from its database).
 *
 * Within a namespace the kept records are rewritten in canonical form,
 * **then** the manifest is refreshed, **then** day files left without a
 * record are deleted. An interrupted run therefore leaves either the previous
 * manifest (a mismatch peers skip) or a manifest describing exactly the files
 * that remain. The manifest is refreshed for this device's own namespace and
 * for every namespace that already carried one; a namespace still written by
 * a pre-manifest client is left without, as that client would never maintain
 * it. Day files a manifest does not name are leftovers of an interrupted
 * deletion by the owner and are not touched.
 */
export async function cleanRemoteBefore(backend: SyncBackend, cutoff: number, deviceInstanceId?: string): Promise<RemoteCleanResult> {
  const listing = await backend.listFiles()

  let removedRecords = 0
  let modifiedFiles = 0
  const skippedNamespaces: RemoteCleanResult['skippedNamespaces'] = []
  for (const owner of listedOwners(listing)) {
    const snapshot = await readNamespaceSnapshot(backend, owner, listing)
    if (!snapshot.reliable) {
      skippedNamespaces.push({ owner, reason: snapshot.problems[0] ?? 'snapshot could not be verified' })
      continue
    }

    const rewrites: Array<{ path: string; content: string }> = []
    const deletions: string[] = []
    const finalFiles = new Map<string, SyncRecord[]>()
    for (const [rel, records] of snapshot.files) {
      const kept = records.filter(record => record.ts >= cutoff)
      if (kept.length === records.length) {
        if (records.length > 0) finalFiles.set(rel, records)
        continue
      }
      removedRecords += records.length - kept.length
      if (kept.length === 0) {
        deletions.push(`${owner}/${rel}`)
      } else {
        rewrites.push({ path: `${owner}/${rel}`, content: serializeSnapshot(kept) })
        finalFiles.set(rel, kept)
      }
    }
    if (rewrites.length === 0 && deletions.length === 0) continue

    for (const { path, content } of rewrites) {
      await backend.writeFile(path, content)
      modifiedFiles++
    }
    if (owner === deviceInstanceId || snapshot.hasManifest) {
      await backend.writeFile(manifestPath(owner), serializeManifest(buildManifest(finalFiles)))
    }
    for (const path of deletions) {
      if (backend.deleteFile) await backend.deleteFile(path)
      else await backend.writeFile(path, '')
      modifiedFiles++
    }
  }
  return { removedRecords, modifiedFiles, skippedNamespaces }
}

/**
 * Wipe a file-based target completely. `deleteAllData` is called
 * unconditionally rather than only when day files are listed: an interrupted
 * operation can leave a namespace consisting of nothing but its
 * `manifest.json`, which peers would otherwise keep reading. Returns the
 * number of day files removed.
 */
export async function cleanRemoteAll(backend: SyncBackend): Promise<number> {
  if (!backend.deleteAllData) throw new Error('Backend cannot clear remote data')
  return backend.deleteAllData()
}

export async function propagateClean(options: {
  all: boolean
  beforeDays?: number
  target?: string
  /** This device's id, so that its own namespace always gets a refreshed manifest. */
  deviceInstanceId?: string
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
      const fileCount = await cleanRemoteAll(backend)
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
      const { removedRecords, modifiedFiles, skippedNamespaces } = await cleanRemoteBefore(backend, cutoff, options.deviceInstanceId)
      await backend.flush?.()
      const skipped = skippedNamespaces.length > 0
        ? `; ${skippedNamespaces.length} namespace(s) could not be verified and were left untouched (${skippedNamespaces.map(n => `${n.owner}: ${n.reason}`).join('; ')})`
        : ''
      results.push({
        backend: {
          type: config.sync.backend as 'github' | 's3',
          label: config.sync.backend === 'github' ? `GitHub (${config.sync.repo})` : `S3 (${config.sync.bucket})`,
        },
        status: 'ok',
        detail: `removed ${removedRecords} records from ${modifiedFiles} files${skipped}`,
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
