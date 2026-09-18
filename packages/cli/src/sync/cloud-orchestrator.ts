import type Database from 'better-sqlite3'
import type { SyncRecord } from '@aiusage/core'
import {
  backfillUnknownDeviceInstanceId,
  getUnsyncedRecords,
  isUploadableLocalRecord,
  markRecordsSynced,
  repairRecordProvenance,
} from '../db/records.js'
import {
  deleteSyncedRecord,
  getUnclaimedOwners,
  insertSyncedRecord,
  mergeSyncedRecordsIntoRecords,
  namespaceVerdictKey,
  pruneUnresolvedSyncedRecords,
  reconcileSyncedNamespace,
  settleReleasedSyncedRecords,
} from '../db/synced-records.js'
import {
  clearRetiredWireIds,
  getClaimedOwners,
  getRetiredWireIds,
  nextSyncTick,
  recordNamespaceVerdict,
  UNKNOWN_NAMESPACE_VERDICT,
  withdrawNamespaceVerdict,
} from '../db/sync-claims.js'
import { mapStatsRecordToSyncRecord } from './mapper.js'
import { cloudPush, cloudPull, CloudSyncError, type CloudPulledTombstone } from './cloud.js'
import type { SyncProgress } from './runtime.js'

export interface CloudSyncOptions {
  deviceInstanceId: string
  target?: string
  /**
   * Every sync target this device has ever used (the cloud target is always
   * included); see `SyncOptions.knownTargets`. When omitted, unresolved rows
   * are never pruned and the cloud is taken to be the only target there is.
   */
  knownTargets?: string[]
  onProgress?: (progress: SyncProgress) => void
}

export interface CloudSyncResult {
  status: 'ok' | 'failed'
  pulledCount: number
  uploadedCount: number
  mergedCount: number
  syncGeneration: number
  /**
   * Pulled rows removed because the cloud no longer carries them (a tombstone
   * from their origin device, or absence from a complete pull after the
   * server's data was cleared) and no other target claims them, or because
   * they were unresolved and every known target has judged them absent.
   */
  prunedCount?: number
  /** Wire ids this device retracted from the server (see migration v14). */
  retiredCount?: number
  error?: string
}

const BATCH_SIZE = 500
/** How often a pull is restarted when the server's generation changes between its pages. */
const MAX_PULL_RESTARTS = 3

export class CloudSyncOrchestrator {
  private db: Database.Database
  private options: CloudSyncOptions

  constructor(db: Database.Database, options: CloudSyncOptions) {
    this.db = db
    this.options = options
  }

  private get target(): string {
    return this.options.target ?? 'cloud'
  }

  async sync(syncGeneration: number = 1): Promise<CloudSyncResult> {
    try {
      // Step 0: provenance guard — rows stamped with another device's id are
      // never local, whatever their source_file says — then adopt pre-init rows.
      repairRecordProvenance(this.db, this.options.deviceInstanceId)
      backfillUnknownDeviceInstanceId(this.db, this.options.deviceInstanceId)

      // Step 1: Pull records from other devices
      this.options.onProgress?.({ phase: 'pulling', pulledCount: 0 })
      const pullResult = await this.pullAll(syncGeneration)

      // Step 2: Insert pulled records into synced_records.
      // The server returns every device's records, including our own. Our own
      // rows already live in `records` (origin = local) — and for tools whose
      // local id differs from the wire id (e.g. Claude Code message ids) they
      // would otherwise be merged back as fresh "local" rows and re-pushed.
      // A database failure here propagates: the sync fails before any claim
      // is touched rather than reconciling against a partially applied pull.
      // What the cloud concluded from earlier pulls stops counting before the
      // first row of this one is applied, exactly as for a file target (see
      // `SyncOrchestrator.pull`): if the sync fails below, rows it has just
      // been seen to carry must not pass for "judged absent on the cloud".
      // Step 2a records the verdicts again.
      let insertedCount = 0
      const claimed = new Map<string, Set<string>>()
      const tick = nextSyncTick(this.db)
      for (const record of pullResult.records) {
        if (record.deviceInstanceId === this.options.deviceInstanceId) continue
        const owner = record.deviceInstanceId || ''
        if (!claimed.has(owner)) claimed.set(owner, new Set())
        claimed.get(owner)!.add(record.id)
      }
      this.db.transaction(() => {
        withdrawNamespaceVerdict(this.db, this.target, UNKNOWN_NAMESPACE_VERDICT)
        for (const owner of claimed.keys()) withdrawNamespaceVerdict(this.db, this.target, namespaceVerdictKey(owner))
      })()
      for (const record of pullResult.records) {
        if (record.deviceInstanceId === this.options.deviceInstanceId) continue
        insertSyncedRecord(this.db, record, tick)
        insertedCount++
      }

      // Step 2a: The pull is complete (every page of the server's current
      // generation was read), so it is authoritative for what the cloud
      // target claims: every device the cloud claimed before, every device
      // that came back, and every device unresolved rows are attributed to
      // is reconciled against what came back for it — nothing, when the
      // server's data was cleared and a new generation started — and rows
      // whose last claim that released are removed. A file-based target
      // reconciling later must not delete rows the cloud still carries, and
      // vice versa. A complete pull leaves nothing unread, so it is also the
      // cloud's verdict on legacy rows stamped 'unknown'.
      let prunedCount = 0
      const judgedAt = tick
      const knownTargets = this.options.knownTargets ? new Set<string>([this.target, ...this.options.knownTargets]) : null
      this.db.transaction(() => {
        const owners = new Set<string>([...claimed.keys(), ...getClaimedOwners(this.db, this.target), ...getUnclaimedOwners(this.db)])
        owners.delete(this.options.deviceInstanceId)
        // Settled once every device has its new claims, so an id that moved
        // from one device to another is not deleted in between.
        const released = new Set<string>()
        for (const owner of owners) {
          reconcileSyncedNamespace(this.db, this.target, owner, claimed.get(owner) ?? [], judgedAt, { released })
        }
        prunedCount += settleReleasedSyncedRecords(this.db, this.target, released, knownTargets ?? [this.target])
        recordNamespaceVerdict(this.db, this.target, UNKNOWN_NAMESPACE_VERDICT, judgedAt)
        if (knownTargets) prunedCount += pruneUnresolvedSyncedRecords(this.db, knownTargets)
      })()

      // Step 2b: Apply tombstones — records their origin device retracted.
      // A tombstone releases only the claim the cloud holds for the device it
      // comes from: the same id published by another device is that device's
      // record and stays. The row goes once no target claims it (and every
      // known target has judged its namespace, as in step 2a), and a row the
      // cloud never claimed is not touched.
      for (const tombstone of pullResult.tombstones) {
        if (!tombstone.id || !tombstone.device_instance_id || tombstone.device_instance_id === this.options.deviceInstanceId) continue
        const options = { owner: tombstone.device_instance_id, knownTargets: knownTargets ?? [this.target] }
        if (deleteSyncedRecord(this.db, this.target, tombstone.id, options)) prunedCount++
      }

      // Step 3: Merge synced_records into records
      this.options.onProgress?.({ phase: 'merging', pulledCount: insertedCount })
      const mergedCount = mergeSyncedRecordsIntoRecords(this.db, this.options.deviceInstanceId)

      // Step 4: Push local records to cloud, then retract retired wire ids.
      // Both go out under the generation the pull just observed: after the
      // server's data was cleared (`aiusage clean --all`) the generation the
      // caller knew about is stale and every push under it would be rejected.
      this.options.onProgress?.({ phase: 'uploading', pulledCount: insertedCount })
      const uploadedCount = await this.push(pullResult.syncGeneration)
      const retiredCount = await this.pushRetiredIds(pullResult.syncGeneration)

      // Step 5: Mark local records as synced
      const unsynced = this.getUploadableRecords(this.target)
      if (unsynced.length > 0) {
        markRecordsSynced(this.db, unsynced.map(r => r.id), Date.now(), this.target)
      }

      this.options.onProgress?.({
        phase: 'finalizing',
        pulledCount: insertedCount,
        uploadedCount,
      })

      return {
        status: 'ok',
        pulledCount: insertedCount,
        uploadedCount,
        mergedCount,
        syncGeneration: pullResult.syncGeneration,
        prunedCount,
        retiredCount,
      }
    } catch (error) {
      const message = error instanceof CloudSyncError ? error.message
        : error instanceof Error ? error.message
        : 'Unknown error'

      return {
        status: 'failed',
        pulledCount: 0,
        uploadedCount: 0,
        mergedCount: 0,
        syncGeneration,
        error: message,
      }
    }
  }

  /**
   * Read every page of the server's current generation. The generation is
   * pinned by the first page: if a later page reports another one, the
   * server's data was cleared mid-pull and the pages read so far describe a
   * generation that no longer exists, so the pull starts over. A pull that
   * cannot observe one stable generation fails rather than stitching pages of
   * two generations into one "complete" snapshot the caller would reconcile
   * against.
   */
  private async pullAll(syncGeneration: number): Promise<{ records: SyncRecord[]; tombstones: CloudPulledTombstone[]; syncGeneration: number }> {
    let restarts = 0
    for (;;) {
      const allRecords: SyncRecord[] = []
      const allTombstones: CloudPulledTombstone[] = []
      let cursor: string | undefined
      let hasMore = true
      let generation: number | null = null
      let changed = false

      while (hasMore) {
        const result = await cloudPull(cursor, 1000)
        if (generation === null) {
          generation = result.syncGeneration
        } else if (result.syncGeneration !== generation) {
          changed = true
          break
        }
        // Cursors are decimal change_seq bigints. Check progress only after
        // generation handling: a reset legitimately restarts the sequence.
        if (result.hasMore && (!result.nextCursor || !/^[0-9]+$/.test(result.nextCursor)
          || BigInt(result.nextCursor) <= BigInt(cursor ?? '0'))) {
          throw new CloudSyncError('Cloud pull cursor did not advance.', 'invalid_response')
        }
        allRecords.push(...result.records)
        allTombstones.push(...(result.tombstones ?? []))
        cursor = result.nextCursor
        hasMore = result.hasMore
      }

      if (!changed) {
        return { records: allRecords, tombstones: allTombstones, syncGeneration: generation ?? syncGeneration }
      }
      if (++restarts > MAX_PULL_RESTARTS) {
        throw new CloudSyncError('Cloud sync generation changed repeatedly during pull; try again later.', 'sync_generation_changed')
      }
    }
  }

  /**
   * Local rows eligible for push: parsed on this device and stamped with its
   * id. The query filters on provenance; the explicit predicate is the final
   * guard so nothing pulled from another device is ever pushed as ours.
   */
  private getUploadableRecords(target: string) {
    const deviceInstanceId = this.options.deviceInstanceId
    return getUnsyncedRecords(this.db, target, deviceInstanceId)
      .filter(record => isUploadableLocalRecord(record, deviceInstanceId))
  }

  private async push(syncGeneration: number): Promise<number> {
    const unsynced = this.getUploadableRecords(this.target)
    if (unsynced.length === 0) {
      return 0
    }

    // Convert to SyncRecord format
    const syncRecords = unsynced.map(mapStatsRecordToSyncRecord)

    for (let i = 0; i < syncRecords.length; i += BATCH_SIZE) {
      const batch = syncRecords.slice(i, i + BATCH_SIZE)
      await cloudPush(batch, [], this.options.deviceInstanceId, syncGeneration)
    }

    return unsynced.length
  }

  /**
   * The cloud store is upsert-only, so wire ids this device will never publish
   * again (migration v14: Antigravity/Trae records re-keyed to their parser
   * ids) are retracted with tombstones. Each batch is forgotten locally only
   * once the server accepted it, so an interrupted sync retries the rest.
   */
  private async pushRetiredIds(syncGeneration: number): Promise<number> {
    const retired = getRetiredWireIds(this.db, this.target)
    if (retired.length === 0) return 0
    const now = Date.now()
    for (let i = 0; i < retired.length; i += BATCH_SIZE) {
      const batch = retired.slice(i, i + BATCH_SIZE)
      await cloudPush([], batch.map(record_id => ({ record_id, updatedAt: now })), this.options.deviceInstanceId, syncGeneration)
      clearRetiredWireIds(this.db, this.target, batch)
    }
    return retired.length
  }
}
