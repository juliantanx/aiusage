import type Database from 'better-sqlite3'
import type { SyncRecord } from '@aiusage/core'
import { generateSessionKey } from '@aiusage/core'
import { UNKNOWN_DEVICE_INSTANCE_ID } from '../db/records.js'
import { getUnclaimedSyncedRecords } from '../db/synced-records.js'
import { countSyncTargetBookkeeping, dropDanglingClaims, forgetSyncTargetBookkeeping, type SyncTargetBookkeeping } from '../db/sync-claims.js'
import { getState } from '../init.js'
import type { SyncBackend } from './index.js'
import { forgetSyncTargetState, isSyncTargetInState, knownSyncTargets } from './target.js'
import { buildLocalSnapshot } from './index.js'
import { buildManifest, manifestPath, serializeManifest, serializeSnapshot } from './manifest.js'
import { listedOwners, readNamespaceSnapshot, type NamespaceSnapshot } from './snapshot.js'

/**
 * Opt-in cleanup of state left behind by earlier sync bugs.
 *
 * Before `records.origin` existed, records pulled from device A were merged
 * into device B's `records` table and — because their `source_file` no longer
 * started with `synced/` — re-uploaded under B's namespace as if B had
 * produced them. Each such round trip produced an *echo*: a copy of the record
 * with a colliding id (`sha256(A, sourceFile, 0)`) and a session key that is
 * the hash of the original's session key. Echoes bounced back to A and to any
 * third device, double-counting usage everywhere.
 *
 * Before namespaces became authoritative snapshots, upload only ever merged
 * into the remote files, so a record deleted or re-keyed locally (cache
 * rebuild, id-algorithm change, Antigravity wire-id collision fix) left a
 * *stale* line behind in the device's own namespace, and two local records
 * mapping to the same wire id left one of them missing (*collision*).
 *
 * Nothing in this module runs automatically. `aiusage sync --repair` reports
 * what would change; `--apply` performs it. Every rule below is deterministic:
 *
 *  - **foreign-namespace line**: a remote line whose `deviceInstanceId` is a
 *    concrete id different from the namespace it sits in. Only the owning
 *    device ever writes to a namespace, and post-fix it only writes its own
 *    records, so such a line can only be a pre-fix echo. Its authoritative copy
 *    is in the other device's namespace.
 *  - **echo (session-key chain)**: a row/line E for which a known session key
 *    K exists such that `generateSessionKey(E.device, K) === E.sessionKey`. The mapper
 *    derives a wire session key as `sha256(device + '\0' + sessionId)[0:24]`;
 *    a merged row's `session_id` *is* the parent's session key, so re-uploading
 *    it hashes the hash. A genuine record's session id is a tool-generated
 *    identifier, never another session's 24-hex hash, so this relation cannot
 *    hold by accident.
 *  - **own-device echo**: a `synced_records` row stamped with this device's own
 *    id. Pull never reads our own namespace, so our id can only appear there by
 *    bouncing through another device. The authoritative row is in `records`.
 *  - **stale line**: a line in *this device's* namespace whose id is not
 *    produced by any local record. The namespace is a snapshot of the local
 *    database, so the line describes a record that no longer exists (or now
 *    travels under a different id). Only this device can judge its own
 *    namespace; other namespaces are never checked for staleness.
 *  - **duplicate line**: the same wire id appearing more than once in one
 *    namespace (in one day file or across several). Only the most recently
 *    updated copy is kept — chosen among the copies no rule above removes
 *    (those are counted under the rule that removes them). Echoes carry
 *    colliding ids, so a contaminated copy can share an id with a legitimate
 *    line; it is never the one the id resolves to, however recent it is.
 *  - **wire-id collision** (report only): two local records that map to the
 *    same wire id. The mapper is expected to make this impossible; a non-zero
 *    count is a parser or mapper bug worth reporting.
 *  - **orphaned pulled row**: an *unresolved* `synced_records` row (no sync
 *    target claims it: pulled before per-target claims existed, migration
 *    v14, or read from a namespace that could not be verified since) that
 *    the configured target provably does not carry: its device has no
 *    namespace there (neither day files nor a manifest — absent, rather
 *    than empty or unverifiable), or the device's namespace verified and
 *    does not contain the row. A row of a namespace that could not be
 *    verified is never reported. Sync deletes such rows by itself once every
 *    target this device knows has judged the namespace; a target that is
 *    never synced again withholds that verdict forever, which is what repair
 *    is for. If the device does publish the row on another target, syncing
 *    that target first claims it and it stops being reported.
 *
 * Remote namespaces are read the way pull reads them (`snapshot.ts`): through
 * the manifest when there is one, every listed file otherwise. A namespace
 * whose snapshot cannot be verified — a manifest that does not parse or does
 * not match its files, a file gone missing, a malformed line — is *skipped*:
 * it is reported, its lines still seed the echo detection, but none of its
 * files is rewritten. Rewriting it (and publishing a manifest over the
 * result) could turn a half-written or corrupt state into the authoritative
 * one. For this device's own namespace the next `aiusage sync` republishes
 * the snapshot from the local database anyway; another device's namespace
 * is its owner's to fix.
 *
 * Deleting an echo never loses usage: by construction the parent it was
 * derived from still exists (or is itself an echo whose parent exists).
 * Deleting a stale line never loses usage either: the local database is the
 * source of truth for this device, and the next sync would drop it anyway.
 */

/**
 * Every session key known to the system (local rows, pulled rows, remote
 * lines). A record is an echo when its session key is the hash of one of
 * these keys under its own device alias — the exact transformation the mapper
 * applies when a merged row (whose `session_id` is already a key) is
 * re-uploaded. Usage fields are deliberately not compared: backfills rewrite
 * model/cost/timestamps on the origin device after an echo was taken, and the
 * chain relation alone is already a hash pre-image argument.
 */
export class SessionKeyChain {
  private readonly keys = new Set<string>()
  /** device alias → { generateSessionKey(alias, k) : k ∈ keys }, built lazily. */
  private readonly hashedByDevice = new Map<string, Set<string>>()

  add(sessionKey: string): void {
    if (!sessionKey) return
    if (!this.keys.has(sessionKey)) {
      this.keys.add(sessionKey)
      this.hashedByDevice.clear()
    }
  }

  get size(): number {
    return this.keys.size
  }

  /** True when `record.sessionKey` is `generateSessionKey(record.device, k)` for a known key `k`. */
  isEcho(record: { device: string; sessionKey: string }): boolean {
    if (!record.sessionKey) return false
    let hashed = this.hashedByDevice.get(record.device)
    if (!hashed) {
      hashed = new Set()
      for (const k of this.keys) hashed.add(generateSessionKey(record.device, k))
      this.hashedByDevice.set(record.device, hashed)
    }
    return hashed.has(record.sessionKey)
  }
}

// ---------------------------------------------------------------------------
// Local database
// ---------------------------------------------------------------------------

export interface LocalRepairPlan {
  /** `records` rows still flagged local that are provably pulled copies. */
  reflagRecordIds: string[]
  /** `synced_records` rows that are echoes (own-device or chain). */
  echoSyncedIds: string[]
  /** `records` rows (origin = synced) that were merged from those echoes. */
  echoMergedIds: string[]
  /** `sync_record_state` rows attached to non-local records. */
  staleSyncStateCount: number
  /** Local records sharing a wire id (report only; the mapper should make this impossible). */
  wireIdCollisions: Array<{ wireId: string; recordIds: string[] }>
  /** Unresolved pulled rows the configured target provably does not carry (device absent, or verified namespace without them). */
  orphanedSyncedIds: string[]
  /** The devices those rows are attributed to. */
  orphanedDevices: string[]
}

interface SyncedRow {
  id: string
  device: string
  device_instance_id: string
  session_key: string
}

/**
 * Collect every session key this device knows about: its own local rows
 * (wire key = hash(device, sessionId)), all pulled rows, and — when provided —
 * every line read from the remote backend.
 */
function buildSessionKeyChain(db: Database.Database, remoteLines?: Iterable<SyncRecord>): SessionKeyChain {
  const chain = new SessionKeyChain()
  const localRows = db.prepare(`
    SELECT DISTINCT device, session_id FROM records WHERE origin = 'local'
  `).all() as Array<{ device: string; session_id: string }>
  for (const r of localRows) chain.add(generateSessionKey(r.device, r.session_id))
  const syncedRows = db.prepare(`SELECT DISTINCT session_key FROM synced_records`).all() as Array<{ session_key: string }>
  for (const r of syncedRows) chain.add(r.session_key)
  if (remoteLines) {
    for (const line of remoteLines) chain.add(line.sessionKey)
  }
  return chain
}

export interface RemotePresence {
  /** Namespace owners with day files or a manifest on the target. */
  presentOwners: Set<string>
  /** Owners whose namespace snapshot verified. */
  verifiedOwners: Set<string>
  /** Every wire id in a verified namespace. */
  verifiedIds: Set<string>
}

export function planLocalRepair(
  db: Database.Database,
  deviceInstanceId: string,
  remoteLines?: Iterable<SyncRecord>,
  /** What the configured target carries; omit when unknown (cloud). */
  remote?: RemotePresence,
): LocalRepairPlan {
  // 1. Provenance: local-flagged rows that are provably pulled copies.
  const reflagRows = db.prepare(`
    SELECT id FROM records
    WHERE origin = 'local'
      AND (
        source_file LIKE 'synced/%'
        OR (device_instance_id != @deviceInstanceId AND device_instance_id != '${UNKNOWN_DEVICE_INSTANCE_ID}')
        OR EXISTS (
          SELECT 1 FROM synced_records s
          WHERE s.id = records.id AND s.session_key = records.session_id
        )
      )
  `).all({ deviceInstanceId }) as Array<{ id: string }>
  const reflagRecordIds = reflagRows.map(r => r.id)

  // 2. Echoes in synced_records.
  const chain = buildSessionKeyChain(db, remoteLines)
  const syncedRows = db.prepare(`
    SELECT id, device, device_instance_id, session_key FROM synced_records
  `).all() as SyncedRow[]
  const echoSyncedIds: string[] = []
  for (const row of syncedRows) {
    const ownDevice = row.device_instance_id === deviceInstanceId
    const echoed = chain.isEcho({ device: row.device, sessionKey: row.session_key })
    if (ownDevice || echoed) echoSyncedIds.push(row.id)
  }

  // 3. records rows merged from those echoes (never local: origin = synced,
  //    or about to be re-flagged as such).
  const echoSet = new Set(echoSyncedIds)
  const reflagSet = new Set(reflagRecordIds)
  const mergedRows = db.prepare(`SELECT id, origin FROM records`).all() as Array<{ id: string; origin: string }>
  const echoMergedIds = mergedRows
    .filter(r => echoSet.has(r.id) && (r.origin === 'synced' || reflagSet.has(r.id)))
    .map(r => r.id)

  // 4. Stale sync bookkeeping.
  const stale = db.prepare(`
    SELECT COUNT(*) AS n FROM sync_record_state
    WHERE record_id IN (SELECT id FROM records WHERE origin = 'synced')
  `).get() as { n: number }

  // 5. Wire-id collisions among this device's own records.
  const { collisions } = buildLocalSnapshot(db, deviceInstanceId)

  // 6. Orphaned pulled rows: unresolved, and provably not on the target —
  //    their device is absent, or its verified namespace lacks them.
  const orphanedSyncedIds: string[] = []
  const orphanedDevices: string[] = []
  if (remote) {
    for (const [owner, ids] of getUnclaimedSyncedRecords(db)) {
      if (owner === deviceInstanceId || owner === UNKNOWN_DEVICE_INSTANCE_ID || owner === '') continue
      const absent = !remote.presentOwners.has(owner)
      const verified = remote.verifiedOwners.has(owner)
      if (!absent && !verified) continue
      const fresh = ids.filter(id => !echoSet.has(id) && (absent || !remote.verifiedIds.has(id)))
      if (fresh.length === 0) continue
      orphanedDevices.push(owner)
      orphanedSyncedIds.push(...fresh)
    }
  }

  return {
    reflagRecordIds,
    echoSyncedIds,
    echoMergedIds,
    staleSyncStateCount: stale.n + reflagRecordIds.length,
    wireIdCollisions: collisions,
    orphanedSyncedIds,
    orphanedDevices,
  }
}

export function applyLocalRepair(db: Database.Database, plan: LocalRepairPlan): void {
  const reflag = db.prepare(`UPDATE records SET origin = 'synced' WHERE id = ?`)
  const delMerged = db.prepare(`DELETE FROM records WHERE id = ? AND origin = 'synced'`)
  const delSynced = db.prepare(`DELETE FROM synced_records WHERE id = ?`)
  db.transaction(() => {
    for (const id of plan.reflagRecordIds) reflag.run(id)
    for (const id of plan.echoMergedIds) delMerged.run(id)
    for (const id of plan.echoSyncedIds) delSynced.run(id)
    for (const id of plan.orphanedSyncedIds) { delMerged.run(id); delSynced.run(id) }
    db.prepare(`
      DELETE FROM sync_record_state
      WHERE record_id IN (SELECT id FROM records WHERE origin = 'synced')
         OR record_id NOT IN (SELECT id FROM records)
    `).run()
    // A claim describes a row that is mirrored; the rows removed above are
    // not, so their claims go with them (a dangling claim would keep a later
    // pull of the same id from ever being pruned).
    dropDanglingClaims(db)
  })()
}

// ---------------------------------------------------------------------------
// Remote namespaces (file-based backends)
// ---------------------------------------------------------------------------

export interface RemoteFilePlan {
  path: string
  owner: string
  totalLines: number
  foreignLines: number
  echoLines: number
  /** Lines in this device's own namespace with no matching local record. */
  staleLines: number
  /** Older copies of an id that also appears elsewhere in the namespace. */
  duplicateLines: number
  /** Records that survive; the file is deleted when this is empty. */
  keptRecords: SyncRecord[]
}

export interface RemoteNamespaceSummary {
  owner: string
  files: number
  lines: number
  foreignLines: number
  echoLines: number
  staleLines: number
  duplicateLines: number
  /** Set when the namespace could not be verified and is left untouched. */
  skipped?: string
}

export interface RemoteRepairPlan {
  scannedFiles: number
  scannedLines: number
  /** Every parsed line across all namespaces (used to seed the local parent index). */
  allRecords: SyncRecord[]
  files: RemoteFilePlan[]
  namespaces: RemoteNamespaceSummary[]
  /** Namespace owners that have at least one data file on the target. */
  presentOwners: Set<string>
  /**
   * Content of every namespace after the plan is applied, keyed by owner then
   * by path relative to the namespace. Used to rewrite the manifest of a
   * repaired namespace so peers keep verifying it.
   */
  finalFiles: Map<string, Map<string, SyncRecord[]>>
  /** Owners whose namespace carried a manifest when scanned. */
  ownersWithManifest: Set<string>
  /** Namespaces whose snapshot could not be verified; none of their files is planned. */
  skippedNamespaces: Array<{ owner: string; reason: string }>
}

export interface RemoteRepairOptions {
  deviceInstanceId: string
  /** Repair every namespace, not just this device's own. */
  allNamespaces?: boolean
  /** Extra known session keys (e.g. this device's local rows) to recognise echoes of. */
  sessionKeys?: SessionKeyChain
  /**
   * Wire ids this device currently publishes. When given, lines in the
   * device's own namespace with any other id are stale. Other namespaces are
   * never judged for staleness: only their owner knows their local state.
   */
  ownWireIds?: Set<string>
}

export async function planRemoteRepair(backend: SyncBackend, options: RemoteRepairOptions): Promise<RemoteRepairPlan> {
  const listing = await backend.listFiles()
  const chain = options.sessionKeys ?? new SessionKeyChain()
  const allRecords: SyncRecord[] = []
  const presentOwners = new Set<string>()
  const ownersWithManifest = new Set<string>()
  const skippedNamespaces: RemoteRepairPlan['skippedNamespaces'] = []
  const files: RemoteFilePlan[] = []
  const namespaces: RemoteNamespaceSummary[] = []
  const finalFiles = new Map<string, Map<string, SyncRecord[]>>()
  let scannedFiles = 0

  // Every namespace is read before any line is classified: an echo is
  // recognised by its parent's session key, and the parent may sit in a
  // namespace that sorts after the echo's. Classifying while reading would
  // let such an echo pass for a legitimate line in the namespaces read first.
  const snapshots: NamespaceSnapshot[] = []
  for (const owner of listedOwners(listing)) {
    presentOwners.add(owner)
    // Every namespace is read the way pull reads it: the manifest decides
    // which files make up the snapshot and whether it can be trusted.
    const snapshot = await readNamespaceSnapshot(backend, owner, listing)
    snapshots.push(snapshot)
    if (snapshot.hasManifest) ownersWithManifest.add(owner)
    for (const records of snapshot.files.values()) {
      for (const record of records) {
        chain.add(record.sessionKey)
        allRecords.push(record)
      }
    }
    scannedFiles += snapshot.files.size
  }

  for (const snapshot of snapshots) {
    const owner = snapshot.owner
    const ns: RemoteNamespaceSummary = { owner, files: snapshot.files.size, lines: 0, foreignLines: 0, echoLines: 0, staleLines: 0, duplicateLines: 0 }
    for (const records of snapshot.files.values()) ns.lines += records.length
    namespaces.push(ns)

    if (!snapshot.reliable) {
      const reason = snapshot.problems[0] ?? 'snapshot could not be verified'
      ns.skipped = reason
      skippedNamespaces.push({ owner, reason })
      continue
    }

    const isOwn = owner === options.deviceInstanceId
    const repairable = options.allNamespaces || isOwn

    // Every line is classified on its own first. Foreign, echo and stale
    // lines are removed, whatever else the namespace holds, so none of them
    // may stand in for a line that stays.
    const verdictOf = (record: SyncRecord): 'foreign' | 'echo' | 'stale' | null => {
      const did = record.deviceInstanceId
      if (!!did && did !== UNKNOWN_DEVICE_INSTANCE_ID && did !== owner) return 'foreign'
      if (chain.isEcho(record)) return 'echo'
      if (isOwn && options.ownWireIds !== undefined && !options.ownWireIds.has(record.id)) return 'stale'
      return null
    }

    // Duplicate detection, among the lines that would otherwise survive: the
    // copy of an id with the highest updatedAt (ties: the first in path
    // order) is the one to keep. A contaminated copy never competes — were
    // it the newest, the legitimate line would go as its older duplicate and
    // the winner as contamination, and the record would be lost.
    const best = new Map<string, { rel: string; index: number; updatedAt: number }>()
    for (const [rel, records] of snapshot.files) {
      records.forEach((record, index) => {
        if (verdictOf(record) !== null) return
        const prev = best.get(record.id)
        if (!prev || record.updatedAt > prev.updatedAt) best.set(record.id, { rel, index, updatedAt: record.updatedAt })
      })
    }

    const perOwner = new Map<string, SyncRecord[]>()
    for (const [rel, records] of snapshot.files) {
      let foreignLines = 0
      let echoLines = 0
      let staleLines = 0
      let duplicateLines = 0
      const keptRecords: SyncRecord[] = []
      records.forEach((record, index) => {
        const verdict = verdictOf(record)
        const winner = best.get(record.id)
        if (verdict === 'foreign') foreignLines++
        else if (verdict === 'echo') echoLines++
        else if (verdict === 'stale') staleLines++
        // Every surviving line took part in the contest above, so it has a
        // winner; should that ever stop holding, the line is kept, not dropped.
        else if (!winner || (winner.rel === rel && winner.index === index)) keptRecords.push(record)
        else duplicateLines++
      })
      ns.foreignLines += foreignLines
      ns.echoLines += echoLines
      ns.staleLines += staleLines
      ns.duplicateLines += duplicateLines
      const changed = repairable && (foreignLines > 0 || echoLines > 0 || staleLines > 0 || duplicateLines > 0)
      if (changed) {
        files.push({ path: `${owner}/${rel}`, owner, totalLines: records.length, foreignLines, echoLines, staleLines, duplicateLines, keptRecords })
      }
      const finalRecords = changed ? keptRecords : records
      if (finalRecords.length > 0) perOwner.set(rel, finalRecords)
    }
    if (perOwner.size > 0) finalFiles.set(owner, perOwner)
  }

  return {
    scannedFiles,
    scannedLines: allRecords.length,
    allRecords,
    files,
    namespaces: namespaces.sort((a, b) => a.owner.localeCompare(b.owner)),
    presentOwners,
    finalFiles,
    ownersWithManifest,
    skippedNamespaces,
  }
}

/**
 * Rewrite the planned files. Files are written (in canonical form) before any
 * deletion, and the manifest of every namespace that changed is refreshed in
 * between so peers keep verifying it — for this device's own namespace
 * always, for other namespaces only when they already carried one (a
 * namespace still written by a pre-manifest client must not acquire a
 * manifest that client would never maintain). Only namespaces the plan read
 * reliably have files here, so a manifest written by repair describes that
 * verified snapshot minus the removed lines and nothing else.
 */
export async function applyRemoteRepair(backend: SyncBackend, plan: RemoteRepairPlan, deviceInstanceId?: string): Promise<{ rewritten: number; deleted: number }> {
  let rewritten = 0
  let deleted = 0
  const touchedOwners = new Set<string>()
  for (const file of plan.files) {
    if (file.keptRecords.length > 0) {
      await backend.writeFile(file.path, serializeSnapshot(file.keptRecords))
      rewritten++
      touchedOwners.add(file.owner)
    }
  }
  for (const owner of touchedOwners) {
    if (owner !== deviceInstanceId && !plan.ownersWithManifest.has(owner)) continue
    const files = plan.finalFiles.get(owner) ?? new Map<string, SyncRecord[]>()
    await backend.writeFile(manifestPath(owner), serializeManifest(buildManifest(files)))
  }
  for (const file of plan.files) {
    if (file.keptRecords.length > 0) continue
    if ((file.owner === deviceInstanceId || plan.ownersWithManifest.has(file.owner)) && !touchedOwners.has(file.owner)) {
      // The manifest must stop naming the file before the file goes, or a
      // peer reading in between finds a named file missing and skips the
      // namespace; the manifest going first leaves an unnamed leftover
      // instead, which peers ignore.
      touchedOwners.add(file.owner)
      const files = plan.finalFiles.get(file.owner) ?? new Map<string, SyncRecord[]>()
      await backend.writeFile(manifestPath(file.owner), serializeManifest(buildManifest(files)))
    }
    if (backend.deleteFile) await backend.deleteFile(file.path)
    else await backend.writeFile(file.path, '')
    deleted++
  }
  return { rewritten, deleted }
}

// ---------------------------------------------------------------------------
// Combined entry point
// ---------------------------------------------------------------------------

export interface RepairReport {
  deviceInstanceId: string
  local: LocalRepairPlan
  remote: RemoteRepairPlan | null
  applied: boolean
  remoteResult?: { rewritten: number; deleted: number; flushed: boolean }
  /**
   * Sync target keys other than the configured one that this device still
   * counts (see `otherSyncTargets`). Report only: each keeps the rows it
   * claims and withholds a verdict until it syncs again, and only the user
   * knows whether it ever will — `--forget-target` is the way to say it won't.
   */
  otherTargets?: string[]
}

export interface RepairOptions {
  deviceInstanceId: string
  /** The configured sync target (informational; orphan detection uses the backend listing). */
  target?: string
  /** File-based backend; omit for cloud (local repair only). */
  backend?: SyncBackend
  allNamespaces?: boolean
  apply?: boolean
}

/**
 * Analyse (and optionally repair) contamination. Remote lines are read first
 * so that local echo detection can see parents that only exist remotely.
 */
export async function repairSyncContamination(db: Database.Database, options: RepairOptions): Promise<RepairReport> {
  const { deviceInstanceId, backend } = options
  let remote: RemoteRepairPlan | null = null

  if (backend) {
    await backend.prepare?.()
    // Seed the remote echo check with this device's local rows: an echo of a
    // record that was only ever uploaded from here still has its parent here.
    const sessionKeys = buildSessionKeyChain(db)
    const ownWireIds = new Set(buildLocalSnapshot(db, deviceInstanceId).records.keys())
    remote = await planRemoteRepair(backend, { deviceInstanceId, allNamespaces: options.allNamespaces, sessionKeys, ownWireIds })
  }

  let presence: RemotePresence | undefined
  if (backend && remote) {
    const skipped = new Set(remote.skippedNamespaces.map(n => n.owner))
    presence = {
      presentOwners: new Set(remote.presentOwners),
      verifiedOwners: new Set([...remote.presentOwners].filter(o => !skipped.has(o))),
      verifiedIds: new Set<string>(),
    }
    for (const [owner, files] of remote.finalFiles) {
      if (skipped.has(owner)) continue
      for (const records of files.values()) for (const r of records) presence.verifiedIds.add(r.id)
    }
    for (const record of remote.allRecords) if (!skipped.has(record.deviceInstanceId)) presence.verifiedIds.add(record.id)
    // A device with nothing listed may still have a manifest on the target:
    // its namespace is then authoritatively empty or unverifiable, either
    // way not absent, and its unresolved rows are sync's to settle.
    for (const owner of getUnclaimedSyncedRecords(db).keys()) {
      if (owner === deviceInstanceId || owner === UNKNOWN_DEVICE_INSTANCE_ID || owner === '' || presence.presentOwners.has(owner)) continue
      if (await backend.readFile(manifestPath(owner)) !== null) presence.presentOwners.add(owner)
    }
  }
  const local = planLocalRepair(db, deviceInstanceId, remote?.allRecords, presence)
  const report: RepairReport = { deviceInstanceId, local, remote, applied: false }

  if (!options.apply) return report

  applyLocalRepair(db, local)
  if (backend && remote) {
    const result = await applyRemoteRepair(backend, remote, deviceInstanceId)
    const flushed = remote.files.length > 0 ? (await backend.flush?.()) ?? false : false
    report.remoteResult = { ...result, flushed }
  }
  report.applied = true
  return report
}

// ---------------------------------------------------------------------------
// Forgetting a sync target
// ---------------------------------------------------------------------------

export interface ForgetTargetOptions {
  aiusageDir: string
  /** The key to forget. */
  target: string
  /** The key of the configured backend, which can never be forgotten. */
  currentTarget: string
  /** Perform the change; without it the report is a dry run. */
  apply?: boolean
}

export interface ForgetTargetReport {
  target: string
  /** What the key holds (dry run), or what was removed and stamped (applied). */
  bookkeeping: SyncTargetBookkeeping
  /** The key is listed in `state.json` (consent, last-sync status or last target). */
  inState: boolean
  applied: boolean
  /** The sync tick at which the rows that lost their last claim became unresolved. */
  tick?: number
  /**
   * The known targets left after the forget. Every one of them has to sync
   * again before the released rows can be pruned.
   */
  remainingTargets: string[]
}

/**
 * `aiusage sync --repair --forget-target <key>`: stop counting a sync target
 * this device will not sync with again.
 *
 * A target's claims keep every row they name and, as a known target, it
 * withholds the verdict unresolved rows wait for; a target that is never
 * synced again — typically the key a configuration used before its key
 * changed, which `adoptLegacySyncTarget` deliberately leaves in place because
 * it may still be the default configuration's — therefore keeps rows alive
 * forever. Nothing recorded locally can tell that a key is abandoned, so this
 * is explicit and opt-in.
 *
 * Refused for the configured target (it is in use) and for a key nothing is
 * recorded under (a typo would otherwise "succeed"). With `apply`, the
 * database is changed first, in one transaction (`forgetSyncTargetBookkeeping`:
 * rows lose the key's claims and become unresolved at the tick taken before
 * the change; nothing is deleted), and `state.json` is updated second. That
 * order makes a crash in between harmless: the key is still a known target,
 * so the released rows still wait for its verdict and nothing is pruned
 * early, and re-running the same command completes the forget — the
 * database part changes nothing the second time. Deletion of the released
 * rows happens only later, through the normal prune, once every remaining
 * known target has synced and judged their namespace.
 */
export function forgetSyncTarget(db: Database.Database, options: ForgetTargetOptions): ForgetTargetReport {
  const { aiusageDir, target, currentTarget } = options
  if (target === currentTarget) {
    throw new Error(`"${target}" is the configured sync target and cannot be forgotten while it is in use.`)
  }
  const state = getState(aiusageDir)
  const inState = isSyncTargetInState(state, target)
  const bookkeeping = countSyncTargetBookkeeping(db, target)
  const inDb = Object.values(bookkeeping).some(n => n > 0)
  if (!inState && !inDb) {
    throw new Error(`Unknown sync target "${target}": nothing is recorded under it. Run "aiusage sync --repair" to see the keys this device knows.`)
  }
  const remaining = () => knownSyncTargets(getState(aiusageDir), currentTarget).filter(key => key !== target)

  if (!options.apply) return { target, bookkeeping, inState, applied: false, remainingTargets: remaining() }

  const { tick, ...removed } = forgetSyncTargetBookkeeping(db, target)
  try {
    forgetSyncTargetState(aiusageDir, target)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Removed the bookkeeping of "${target}" from the database, but could not update state.json (${reason}). Nothing is lost: re-run the same command to finish forgetting the key.`)
  }
  return { target, bookkeeping: removed, inState, applied: true, tick, remainingTargets: remaining() }
}

