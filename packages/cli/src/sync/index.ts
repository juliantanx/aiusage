import type Database from 'better-sqlite3'
import type { SyncRecord } from '@aiusage/core'
import {
  backfillUnknownDeviceInstanceId,
  getLocalRecordsForDevice,
  getUnsyncedRecords,
  isUploadableLocalRecord,
  markRecordsSynced,
  repairRecordProvenance,
  UNKNOWN_DEVICE_INSTANCE_ID,
} from '../db/records.js'
import {
  getUnclaimedOwners,
  insertSyncedRecord,
  mergeSyncedRecordsIntoRecords,
  pruneUnresolvedSyncedRecords,
  reconcileSyncedNamespace,
  settleReleasedSyncedRecords,
} from '../db/synced-records.js'
import {
  clearRetiredWireIds,
  getClaimedOwners,
  nextSyncTick,
  recordNamespaceVerdict,
  UNKNOWN_NAMESPACE_VERDICT,
  withdrawNamespaceVerdict,
} from '../db/sync-claims.js'
import { mapStatsRecordToSyncRecord } from './mapper.js'
import {
  buildManifest,
  contentDigest,
  isDayFilePath,
  manifestPath,
  matchesCanonical,
  parseNdjsonLines,
  serializeManifest,
  serializeSnapshot,
} from './manifest.js'
import { classifyPulledRecord, namespaceOwnerFromPath } from './ownership.js'
import { listedOwners, planNamespaceRead, readNamespaceFiles, type NamespaceReadPlan } from './snapshot.js'
import type { SyncProgress } from './runtime.js'

export { contentDigest, parseSyncRecordLine, serializeSnapshot } from './manifest.js'

export interface SyncBackend {
  /**
   * Content of `path`, or `null` only when the file is confirmed absent.
   * Every other failure (permissions, I/O, corrupt cache) must throw: the
   * orchestrator prunes local rows against what it reads, so a failure that
   * looked like "not there" would be interpreted as a deletion.
   */
  readFile(path: string): Promise<string | null>
  writeFile(path: string, content: string): Promise<void>
  /**
   * Every data file (`*.ndjson`) and namespace manifest under the sync root.
   * Must throw if listing fails; an empty array means the target is empty.
   */
  listFiles(): Promise<string[]>
  /** Optional: delete a single file from the backend */
  deleteFile?(path: string): Promise<void>
  /** Optional: delete all data files. Returns the number of files deleted. */
  deleteAllData?(): Promise<number>
  /**
   * Optional: hex MD5 digests of file contents keyed by path, for every file
   * the backend can report one for cheaply (e.g. S3 ETags from a listing).
   * Files missing from the map are compared by reading them.
   */
  listFileDigests?(): Promise<Map<string, string>>
  /** Optional: called before sync to fetch latest remote state (e.g. git pull) */
  prepare?(): Promise<void>
  /** Optional: called after all writes to push changes (e.g. git commit + push) */
  flush?(): Promise<boolean>
}

export interface SyncOptions {
  deviceInstanceId: string
  target: string
  consentVerified: boolean
  /**
   * Every sync target this device has ever used (`target` is always
   * included). An unresolved pulled row — one no target claims: pulled before
   * claims existed, or read from a namespace that could not be verified — is
   * deleted only once every one of these targets has judged its namespace
   * reliably since the row became unresolved. Likewise, a row whose last
   * claim this target releases is deleted on the spot only when every other
   * one of these targets has judged its namespace; otherwise it becomes
   * unresolved. When omitted, unresolved rows are never pruned and `target`
   * is taken to be the only target there is.
   */
  knownTargets?: string[]
  onProgress?: (progress: SyncProgress) => void
}

export interface SyncResult {
  status: 'ok' | 'blocked_pending_consent' | 'failed'
  pulledCount: number
  uploadedCount: number
  mergedCount: number
  /**
   * Remote lines ignored during pull because they did not belong to the
   * namespace they were read from (or were echoes of this device's own
   * records). Non-zero means a peer still has a contaminated namespace —
   * see `aiusage sync --repair`.
   */
  ignoredCount?: number
  /** Local rows whose provenance flag was corrected before uploading. */
  repairedCount?: number
  /**
   * Pulled rows removed: claimed by this target only and gone from their
   * owner's namespace, or unresolved and judged absent by every known target.
   */
  prunedCount?: number
  /** Lines removed from this device's own namespace because the record no longer exists locally. */
  retiredCount?: number
  /** Local records that mapped to a wire id already taken by another local record (the newer one wins). */
  collisionCount?: number
  /** Files written or deleted in this device's namespace (manifest included). */
  writtenFiles?: number
  /**
   * Foreign namespaces that were read but not reconciled because they could
   * not be trusted this time: a file listed but missing, a malformed line, a
   * manifest whose digests do not match the files (the owner is rewriting it
   * or was interrupted). Their rows were upserted but nothing was pruned.
   */
  skippedNamespaces?: number
  error?: string
}

export function getSyncPath(ts: string | number, deviceInstanceId: string): string {
  const d = new Date(ts)
  const date = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
  return `${deviceInstanceId}/${date}.ndjson`
}

/** Parse ndjson content into a Map<id, SyncRecord> (later duplicates win). */
export function parseNdjson(content: string): Map<string, SyncRecord> {
  const records = new Map<string, SyncRecord>()
  for (const record of parseNdjsonLines(content).records) records.set(record.id, record)
  return records
}

export interface LocalSnapshot {
  /** Wire records keyed by id, one per local record (collisions resolved to the newest). */
  records: Map<string, SyncRecord>
  /** Local records that lost a wire-id collision. */
  collisions: Array<{ wireId: string; recordIds: string[] }>
}

/**
 * Build the authoritative wire snapshot of this device's local records. Wire
 * ids are expected to be unique; if two local rows still map to the same id
 * the most recently updated one is kept and the clash is reported so it can
 * surface in the sync result and in `sync --repair`.
 */
export function buildLocalSnapshot(db: Database.Database, deviceInstanceId: string): LocalSnapshot {
  const records = new Map<string, SyncRecord>()
  const losers = new Map<string, string[]>()
  const winnerLocalId = new Map<string, string>()
  for (const record of getLocalRecordsForDevice(db, deviceInstanceId)) {
    if (!isUploadableLocalRecord(record, deviceInstanceId)) continue
    const wire = mapStatsRecordToSyncRecord(record)
    const prev = records.get(wire.id)
    if (!prev) {
      records.set(wire.id, wire)
      winnerLocalId.set(wire.id, record.id)
      continue
    }
    const list = losers.get(wire.id) ?? []
    if (wire.updatedAt > prev.updatedAt) {
      list.push(winnerLocalId.get(wire.id)!)
      records.set(wire.id, wire)
      winnerLocalId.set(wire.id, record.id)
    } else {
      list.push(record.id)
    }
    losers.set(wire.id, list)
  }
  const collisions = Array.from(losers.entries()).map(([wireId, recordIds]) => ({ wireId, recordIds }))
  return { records, collisions }
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
      // Provenance guard first: nothing stamped with another device's id may
      // ever be treated as local, whatever its source_file says. Then adopt
      // the pre-init rows this device parsed before it had an id.
      const repairedCount = repairRecordProvenance(this.db, this.options.deviceInstanceId)
      backfillUnknownDeviceInstanceId(this.db, this.options.deviceInstanceId)
      await this.backend.prepare?.()
      const listing = await this.backend.listFiles()
      const { pulledCount, ignoredCount, prunedCount, skippedNamespaces } = await this.pull(listing)
      this.options.onProgress?.({ phase: 'merging', pulledCount })
      const mergedCount = mergeSyncedRecordsIntoRecords(this.db, this.options.deviceInstanceId)
      const upload = await this.upload(listing)
      await this.backend.flush?.()
      this.options.onProgress?.({ phase: 'finalizing', pulledCount, uploadedCount: upload.uploadedCount })
      return {
        status: 'ok',
        pulledCount,
        uploadedCount: upload.uploadedCount,
        mergedCount,
        ignoredCount,
        repairedCount,
        prunedCount,
        retiredCount: upload.retiredCount,
        collisionCount: upload.collisionCount,
        writtenFiles: upload.writtenFiles,
        skippedNamespaces,
      }
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

  /**
   * Mirror every foreign namespace.
   *
   * Every namespace of interest is planned through its manifest: those with
   * day files in the listing, those this target claimed before, and those
   * that unresolved rows are attributed to. The plan reads the manifest (one
   * file) and decides which day files make up the snapshot — for a namespace
   * without any listed day file that is what tells *deleted* (no manifest:
   * reconciled against the empty set), *authoritatively empty* (a valid
   * manifest naming no file: the same) and *unverifiable* (a manifest naming
   * files that are gone, or one that does not parse: skipped) apart. Then the
   * day files are read — those the manifest names, or, for a namespace
   * written by a pre-manifest client, every listed one — and their lines
   * upserted as they are read. A namespace is *reconciled* (its ids become
   * this target's claims, rows whose last claim that released are pruned —
   * or, while a known target has not judged the namespace yet, left
   * unresolved for that target to claim or settle — and the verdict is
   * recorded) only when it was read reliably: every named file present, every
   * line parsed, every digest matching. The verdict this target recorded for
   * a namespace earlier is withdrawn when the namespace is read again and
   * comes back only with that reconciliation: the lines are upserted either
   * way, so after an unverifiable read the old verdict no longer says what
   * the target carries. Our own namespace is never read here.
   *
   * Failure semantics: a backend read failure or a local database failure
   * while upserting propagates and aborts the sync before anything is
   * reconciled. Lines upserted before the failure stay — an upsert only adds
   * an unresolved row (which no reconciliation can prune until every known
   * target has judged its namespace) or refreshes a row with a newer version
   * of itself — and this target's verdicts on the namespaces read so far
   * stay withdrawn until its next reliable read of them. The reconciliation
   * of all namespaces then runs in one transaction: claims, verdicts and
   * prunes land for every reliable namespace, or for none.
   */
  private async pull(allPaths: string[]): Promise<{ pulledCount: number; ignoredCount: number; prunedCount: number; skippedNamespaces: number }> {
    const own = this.options.deviceInstanceId
    const target = this.options.target
    const knownTargets = this.options.knownTargets ? new Set<string>([target, ...this.options.knownTargets]) : null
    // This run's tick on the sync clock: rows upserted below become
    // unresolved as of this tick, and verdicts are recorded under it.
    const tick = nextSyncTick(this.db)
    const localDevicePrefix = `${own}/`
    const dataPaths = allPaths.filter(p => isDayFilePath(p) && !p.startsWith(localDevicePrefix))

    const listedByOwner = new Map<string, string[]>()
    for (const path of dataPaths) {
      const owner = namespaceOwnerFromPath(path)
      if (!listedByOwner.has(owner)) listedByOwner.set(owner, [])
      listedByOwner.get(owner)!.push(path)
    }

    // Every namespace whose state matters to this target: listed now, claimed
    // here before, or the attributed owner of rows still awaiting a verdict.
    const owners = new Set<string>(listedOwners(allPaths))
    for (const owner of getClaimedOwners(this.db, target)) owners.add(owner)
    for (const owner of getUnclaimedOwners(this.db)) owners.add(owner)
    owners.delete(own)
    owners.delete(UNKNOWN_DEVICE_INSTANCE_ID)
    owners.delete('')

    // Phase 1: manifests decide which files make up each namespace, and what
    // a namespace with nothing listed means.
    const plans = new Map<string, { read: NamespaceReadPlan; reliable: boolean; ids: Set<string> }>()
    for (const owner of [...owners].sort()) {
      const read = await planNamespaceRead(this.backend, owner, listedByOwner.get(owner) ?? [])
      plans.set(owner, { read, reliable: read.reliable, ids: new Set() })
    }

    const totalFiles = [...plans.values()].reduce((n, p) => n + p.read.paths.length, 0)
    this.options.onProgress?.({ phase: 'pulling', completedFiles: 0, totalFiles, pulledCount: 0 })

    // Phase 2: read and upsert. Lines are applied as they are read, whether
    // or not the namespace turns out to be reliable: an upsert only ever adds
    // or refreshes a row, and a row added from a half-published snapshot is
    // unclaimed until the first reliable read, which then keeps or prunes it.
    // Withholding the lines instead would hide a namespace whose owner
    // crashed mid-rewrite and never came back. The manifest is therefore the
    // commit boundary for *pruning*, not for additions.
    let totalPulled = 0
    let totalIgnored = 0
    let completed = 0
    // What this target concluded from earlier reads stops counting the
    // moment it reads again: from here on rows it does not claim may be seen
    // in its namespaces, and only a reliable reconciliation (phase 3) can say
    // once more that it does not carry them.
    withdrawNamespaceVerdict(this.db, target, UNKNOWN_NAMESPACE_VERDICT)
    for (const [owner, plan] of plans) {
      withdrawNamespaceVerdict(this.db, target, owner)
      const snapshot = await readNamespaceFiles(this.backend, plan.read, {
        collect: false,
        visit: (path, records) => {
          this.options.onProgress?.({ phase: 'pulling', currentPath: path, completedFiles: completed, totalFiles, pulledCount: totalPulled })
          for (const record of records) {
            // Only records that belong to the namespace they were read from are
            // trusted. Anything else is a pre-fix echo whose authoritative copy
            // lives elsewhere (or is our own local row).
            if (classifyPulledRecord(record, owner, own)) {
              totalIgnored++
              continue
            }
            // Lines written before the origin device had an id belong to the
            // namespace owner; storing them as 'unknown' would surface a phantom
            // device.
            if (!record.deviceInstanceId || record.deviceInstanceId === UNKNOWN_DEVICE_INSTANCE_ID) {
              record.deviceInstanceId = owner
            }
            plan.ids.add(record.id)
            if (insertSyncedRecord(this.db, record, tick)) totalPulled++
          }
          completed++
          this.options.onProgress?.({ phase: 'pulling', currentPath: path, completedFiles: completed, totalFiles, pulledCount: totalPulled })
        },
      })
      // A file that vanished between listing and reading is counted as done
      // too, so the progress total still adds up.
      completed += snapshot.missing.length
      plan.reliable = snapshot.reliable
    }

    // Phase 3: reconcile. Only namespaces read reliably replace this target's
    // claims and get a verdict; the others are skipped untouched. One
    // transaction: a failure part-way leaves no namespace half-reconciled.
    const { prunedCount, skippedNamespaces } = this.db.transaction(() => {
      let prunedCount = 0
      let skippedNamespaces = 0
      // Released claims are settled once every namespace has its new claims:
      // an id that left one namespace for another of this target must not be
      // deleted in between.
      const released = new Set<string>()
      for (const [owner, plan] of plans) {
        if (plan.reliable) reconcileSyncedNamespace(this.db, target, owner, plan.ids, tick, { released })
        else skippedNamespaces++
      }
      prunedCount += settleReleasedSyncedRecords(this.db, target, released, knownTargets ?? [target])
      // Legacy rows stamped 'unknown' can sit in any namespace of the target
      // (a reliable read relabels them to its owner and claims them), so this
      // target has judged them only once every namespace here read reliably.
      if (skippedNamespaces === 0) recordNamespaceVerdict(this.db, target, UNKNOWN_NAMESPACE_VERDICT, tick)
      // Unresolved rows go only once every known target has judged their
      // namespace since they became unresolved and none claimed them.
      if (knownTargets) prunedCount += pruneUnresolvedSyncedRecords(this.db, knownTargets)
      return { prunedCount, skippedNamespaces }
    })()

    return { pulledCount: totalPulled, ignoredCount: totalIgnored, prunedCount, skippedNamespaces }
  }

  /**
   * Publish this device's namespace as an authoritative snapshot of its local
   * records. Every day file is compared with the remote copy (by digest when
   * the backend can provide one, otherwise by canonical content) and only
   * written when it differs — a file holding the same records in another
   * order is left alone, one with duplicated or malformed lines is rewritten.
   * Then the manifest is written if it changed, and finally files for days
   * that no longer have any local record are removed (when the snapshot is
   * empty, an empty manifest is published first and removed last). Nothing
   * outside `<deviceInstanceId>/` is ever touched.
   *
   * The order matters for backends that cannot replace the namespace
   * atomically (S3): peers verify every file against the manifest, so a
   * reader that overlaps with this sequence sees either the previous
   * consistent snapshot or a mismatch — never a partial snapshot it would
   * prune against.
   */
  private async upload(allPaths: string[]): Promise<{ uploadedCount: number; retiredCount: number; collisionCount: number; writtenFiles: number }> {
    const deviceInstanceId = this.options.deviceInstanceId
    const target = this.options.target
    const prefix = `${deviceInstanceId}/`

    // The query already restricts to origin = 'local' rows owned by this
    // device; the explicit filter is the last line of defence so that no
    // record stamped with another device's id can reach our namespace.
    const unsynced = getUnsyncedRecords(this.db, target, deviceInstanceId)
      .filter(record => isUploadableLocalRecord(record, deviceInstanceId))

    const snapshot = buildLocalSnapshot(this.db, deviceInstanceId)
    const byRel = new Map<string, SyncRecord[]>()
    for (const wire of snapshot.records.values()) {
      const path = getSyncPath(wire.ts, deviceInstanceId)
      if (!path.startsWith(prefix)) continue
      const rel = path.slice(prefix.length)
      if (!byRel.has(rel)) byRel.set(rel, [])
      byRel.get(rel)!.push(wire)
    }

    const ownPaths = allPaths.filter(p => p.startsWith(prefix) && isDayFilePath(p))
    const ownPathSet = new Set(ownPaths)
    const stalePaths = ownPaths.filter(p => !byRel.has(p.slice(prefix.length)))
    const uploads = Array.from(byRel.entries()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    const totalFiles = uploads.length + 1 + stalePaths.length
    const digests = await this.backend.listFileDigests?.()

    let retiredCount = 0
    let writtenFiles = 0
    let completed = 0
    let uploadedCount = 0

    this.options.onProgress?.({ phase: 'uploading', completedFiles: 0, totalFiles, uploadedCount: 0 })

    for (const [rel, records] of uploads) {
      const path = prefix + rel
      this.options.onProgress?.({ phase: 'uploading', currentPath: path, completedFiles: completed, totalFiles, uploadedCount })
      const content = serializeSnapshot(records)
      const digest = digests?.get(path)
      let unchanged = digest !== undefined && digest === contentDigest(content)
      if (!unchanged && ownPathSet.has(path)) {
        const existingContent = await this.backend.readFile(path)
        if (existingContent !== null) {
          unchanged = matchesCanonical(existingContent, content)
          if (!unchanged) {
            for (const id of parseNdjson(existingContent).keys()) if (!snapshot.records.has(id)) retiredCount++
          }
        }
      }
      if (!unchanged) {
        await this.backend.writeFile(path, content)
        writtenFiles++
      }
      uploadedCount += records.length
      completed++
      this.options.onProgress?.({ phase: 'uploading', currentPath: path, completedFiles: completed, totalFiles, uploadedCount })
    }

    // The manifest goes after the day files it describes and before any
    // deletion, so peers never validate a snapshot that is not fully there.
    // That holds for an empty snapshot too: the empty manifest is published
    // before the last day files are deleted, so an interrupted deletion
    // leaves files the manifest does not name (ignored) rather than a
    // manifest-less namespace peers would read as a legacy snapshot.
    const manifestFile = manifestPath(deviceInstanceId)
    const manifestContent = serializeManifest(buildManifest(byRel))
    this.options.onProgress?.({ phase: 'uploading', currentPath: manifestFile, completedFiles: completed, totalFiles, uploadedCount })
    const existingManifest = await this.backend.readFile(manifestFile)
    const publishManifest = byRel.size > 0 || existingManifest !== null || stalePaths.length > 0
    if (publishManifest && existingManifest !== manifestContent) {
      await this.backend.writeFile(manifestFile, manifestContent)
      writtenFiles++
    }
    completed++

    for (const path of stalePaths) {
      this.options.onProgress?.({ phase: 'uploading', currentPath: path, completedFiles: completed, totalFiles, uploadedCount })
      const existingContent = await this.backend.readFile(path)
      if (existingContent !== null) retiredCount += parseNdjson(existingContent).size
      if (this.backend.deleteFile) await this.backend.deleteFile(path)
      else await this.backend.writeFile(path, '')
      writtenFiles++
      completed++
    }

    // Once nothing is left to describe, the empty manifest itself goes, so a
    // device that wiped its data leaves no trace on the target. Removing it
    // last keeps the namespace verifiable at every step before.
    if (byRel.size === 0 && publishManifest && this.backend.deleteFile) {
      await this.backend.deleteFile(manifestFile)
      writtenFiles++
    }

    // Bookkeeping: rows newly published (or changed since their last upload)
    // are what `uploadedCount` reports; retired wire ids are moot once the
    // snapshot has been rewritten.
    markRecordsSynced(this.db, unsynced.map(r => r.id), Date.now(), target)
    clearRetiredWireIds(this.db, target)

    return { uploadedCount: unsynced.length, retiredCount, collisionCount: snapshot.collisions.length, writtenFiles }
  }
}
