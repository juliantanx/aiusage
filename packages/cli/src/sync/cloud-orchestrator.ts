import type Database from 'better-sqlite3'
import type { StatsRecord, SyncRecord } from '@aiusage/core'
import {
  backfillUnknownDeviceInstanceId,
  clearSyncRecordState,
  getUnsyncedRecords,
  isUploadableLocalRecord,
  markRecordVersionsSynced,
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
import { cloudRecordProblem, toCloudRecord } from './cloud-dto.js'
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
  /**
   * The server generation this target's upload acknowledgements
   * (`sync_record_state`) belong to: the one the pull observed or, when the
   * sync failed before it could act on that, the one passed to `sync()`. The
   * caller stores it and passes it to the next `sync()`.
   */
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
  /**
   * Local records not uploaded because the cloud cannot store them (see
   * `cloudRecordProblem`) or because the server did not store them. They
   * are not acknowledged: they stay local, count as unsynced and go out
   * again with the next sync, by then possibly corrected by a re-parse.
   */
  rejectedCount?: number
  /**
   * Retired wire ids (see `retiredCount`) whose tombstones the server did not
   * apply. They stay queued and go out again with the next sync.
   */
  unretiredCount?: number
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

  /**
   * `syncGeneration` is the server generation this target last synced under
   * (`CloudSyncResult.syncGeneration` of the previous sync). An installation
   * that never stored one passes nothing: every dataset starts at generation
   * 1, so acknowledgements of unknown age are valid exactly while the server
   * is still there.
   */
  async sync(syncGeneration: number = 1): Promise<CloudSyncResult> {
    // The generation the acknowledgements in `sync_record_state` belong to.
    let ackGeneration = syncGeneration
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
      //
      // A generation other than the one last synced under is a dataset this
      // device has uploaded nothing to: the server starts a new, empty one
      // when the cloud data is cleared. What the previous one acknowledged
      // says nothing about it, so those acknowledgements go and the whole
      // local history is pushed again. From here on the acknowledgements
      // belong to the new generation, also when a push below fails.
      this.options.onProgress?.({ phase: 'uploading', pulledCount: insertedCount })
      if (pullResult.syncGeneration !== ackGeneration) {
        clearSyncRecordState(this.db, this.target)
        ackGeneration = pullResult.syncGeneration
      }
      // Each batch is marked as synced once the server accepted it (see `push`).
      const { uploadedCount, rejectedCount } = await this.push(pullResult.syncGeneration)
      const { retiredCount, unretiredCount } = await this.pushRetiredIds(pullResult.syncGeneration)

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
        ...(rejectedCount > 0 ? { rejectedCount } : {}),
        ...(unretiredCount > 0 ? { unretiredCount } : {}),
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
        syncGeneration: ackGeneration,
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

  /**
   * Push every unsynced local record and return how many the server stored
   * and how many it did not. Exactly the versions that were read here are
   * acknowledged, batch by batch as the server accepts them: a record
   * inserted or rewritten while a request is in flight was not sent and stays
   * unsynced, and a failure in a later batch leaves only the batches from
   * there on to send again.
   *
   * Only what the server stored, or already holds in the same or a newer
   * version, is acknowledged. A record the cloud cannot store is not sent,
   * and one the server reports as rejected is left unsynced, so neither is
   * taken for synced while the cloud does not have it.
   */
  private async push(syncGeneration: number): Promise<{ uploadedCount: number; rejectedCount: number }> {
    const unsynced = this.getUploadableRecords(this.target)
    let uploadedCount = 0
    let rejectedCount = 0

    for (let i = 0; i < unsynced.length; i += BATCH_SIZE) {
      const sendable: Array<{ local: StatsRecord; wire: SyncRecord }> = []
      for (const local of unsynced.slice(i, i + BATCH_SIZE)) {
        const wire = mapStatsRecordToSyncRecord(local)
        if (cloudRecordProblem(toCloudRecord(wire))) rejectedCount++
        else sendable.push({ local, wire })
      }
      if (sendable.length === 0) continue
      const result = await cloudPush(sendable.map(r => r.wire), [], this.options.deviceInstanceId, syncGeneration)
      const rejected = new Set(result.rejectedIds ?? [])
      const stored = sendable.filter(r => !rejected.has(r.wire.id))
      markRecordVersionsSynced(this.db, stored.map(r => r.local), this.target)
      uploadedCount += stored.length
      rejectedCount += sendable.length - stored.length
    }

    return { uploadedCount, rejectedCount }
  }

  /**
   * The cloud store is upsert-only, so wire ids this device will never publish
   * again (migration v14: Antigravity/Trae records re-keyed to their parser
   * ids) are retracted with tombstones. An id is forgotten locally only once
   * the server applied its tombstone, so an interrupted sync retries the rest,
   * and one the server reports as rejected is kept and sent again. An id the
   * cloud cannot hold (empty, or with a NUL, which PostgreSQL text cannot
   * store) has no cloud record to retract: it is forgotten without being sent.
   */
  private async pushRetiredIds(syncGeneration: number): Promise<{ retiredCount: number; unretiredCount: number }> {
    const retired = getRetiredWireIds(this.db, this.target)
    let retiredCount = 0
    let unretiredCount = 0
    const now = Date.now()
    const storable = (id: string): boolean => id !== '' && !id.includes('\u0000')
    for (let i = 0; i < retired.length; i += BATCH_SIZE) {
      const batch = retired.slice(i, i + BATCH_SIZE)
      clearRetiredWireIds(this.db, this.target, batch.filter(id => !storable(id)))
      const sendable = batch.filter(storable)
      if (sendable.length === 0) continue
      const result = await cloudPush([], sendable.map(record_id => ({ record_id, updatedAt: now })), this.options.deviceInstanceId, syncGeneration)
      const rejected = new Set(result.rejectedTombstoneIds ?? [])
      const applied = sendable.filter(id => !rejected.has(id))
      clearRetiredWireIds(this.db, this.target, applied)
      retiredCount += applied.length
      unretiredCount += sendable.length - applied.length
    }
    return { retiredCount, unretiredCount }
  }
}
