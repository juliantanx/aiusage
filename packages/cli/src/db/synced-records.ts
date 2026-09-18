import type Database from 'better-sqlite3'
import type { SyncRecord } from '@aiusage/core'
import { UNKNOWN_DEVICE_INSTANCE_ID } from './records.js'
import { getNamespaceVerdicts, hasClaim, nextSyncTick, recordNamespaceVerdict, releaseClaim, UNKNOWN_NAMESPACE_VERDICT } from './sync-claims.js'

/**
 * Upsert a pulled record. A new row starts *unresolved* (`unclaimed_since =
 * tick`, the sync clock tick of the pull, see `nextSyncTick`): no target
 * claims it until the namespace it came from is reconciled reliably. An
 * existing row only takes the incoming values when they are newer
 * (`updatedAt`), whatever target or snapshot they came from — the local
 * value of a record is the newest version ever observed, and an update never
 * changes the row's claims or its unresolved state.
 * Returns true when a row was inserted or updated.
 */
export function insertSyncedRecord(db: Database.Database, record: SyncRecord, tick: number = nextSyncTick(db)): boolean {
  // Only replace if the incoming record is newer than what we already have.
  // Without this check, a stale remote record could silently overwrite a newer one.
  const result = db.prepare(`
    INSERT INTO synced_records (
      id, ts, tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_key, device, device_instance_id, platform, updated_at,
      source_file, cwd, unclaimed_since
    ) VALUES (
      @id, @ts, @tool, @model, @provider, @inputTokens, @outputTokens,
      @cacheReadTokens, @cacheWriteTokens, @thinkingTokens,
      @cost, @costSource, @sessionKey, @device, @deviceInstanceId, @platform, @updatedAt,
      @sourceFile, @cwd, @tick
    )
    ON CONFLICT(id) DO UPDATE SET
      ts = excluded.ts,
      tool = excluded.tool,
      model = excluded.model,
      provider = excluded.provider,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      cache_read_tokens = excluded.cache_read_tokens,
      cache_write_tokens = excluded.cache_write_tokens,
      thinking_tokens = excluded.thinking_tokens,
      cost = excluded.cost,
      cost_source = excluded.cost_source,
      session_key = excluded.session_key,
      device = excluded.device,
      device_instance_id = excluded.device_instance_id,
      platform = excluded.platform,
      updated_at = excluded.updated_at,
      source_file = excluded.source_file,
      cwd = excluded.cwd
    WHERE excluded.updated_at > synced_records.updated_at
  `).run({
    id: record.id,
    ts: record.ts,
    tool: record.tool,
    model: record.model,
    provider: record.provider,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cacheReadTokens: record.cacheReadTokens,
    cacheWriteTokens: record.cacheWriteTokens,
    thinkingTokens: record.thinkingTokens,
    cost: record.cost,
    costSource: record.costSource,
    sessionKey: record.sessionKey,
    device: record.device,
    deviceInstanceId: record.deviceInstanceId,
    platform: record.platform ?? '',
    updatedAt: record.updatedAt,
    sourceFile: record.sourceFile ?? '',
    cwd: record.cwd ?? '',
    tick,
  })
  return result.changes > 0
}

export function getSyncedRecordById(db: Database.Database, id: string): SyncRecord | null {
  const row = db.prepare('SELECT * FROM synced_records WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return mapRowToSyncRecord(row)
}

/**
 * Tick stamped on a row whose last claim was released while some known target
 * had not judged its namespace yet. Every verdict is from a later tick, so the
 * row waits for exactly the verdicts that are missing: a target that has a
 * verdict and no claim did not carry the row at its last reliable read,
 * however long ago that was.
 */
const AWAITING_MISSING_VERDICTS = 0

/**
 * True when every known target — `target`, which is releasing a claim,
 * included — has a verdict on the namespace rows of `owner` are judged under.
 * A target's claims are exactly what its last reliable read of the namespace
 * held, so a target with a verdict and no claim on a row did not carry it at
 * that read; a target without a verdict (never synced since the upgrade or
 * since `clean --all`, or whose last read of the namespace could not be
 * verified) may carry anything. For `target` itself the verdict is normally
 * the one it has just recorded for the namespace it released the claim in;
 * it is missing when the row is attributed to *another* namespace (two
 * devices publishing one id) that `target` could not verify in this run —
 * where it may have just seen the row.
 */
function everyKnownTargetHasJudged(db: Database.Database, target: string, owner: string, knownTargets: Iterable<string>): boolean {
  const verdicts = getNamespaceVerdicts(db, namespaceVerdictKey(owner))
  if (!verdicts.has(target)) return false
  for (const known of knownTargets) {
    if (!verdicts.has(known)) return false
  }
  return true
}

/**
 * Decide the fate of rows whose claim `target` has just released: a row some
 * target still claims is left alone; one that lost its last claim is deleted
 * with its merged copy when every known target (`target` included) has
 * judged its namespace, and left unresolved otherwise. A row is judged under the device
 * it is *attributed to* (`device_instance_id`), exactly as
 * `pruneUnresolvedSyncedRecords` judges it afterwards — not under the
 * namespace the last claim happened to be held for, which differs when two
 * devices publish the same id.
 *
 * A sync that reconciles several namespaces must call this once, after all
 * of them (see the `released` option of `reconcileSyncedNamespace`): an id
 * that left one namespace and appeared in another of the same target is
 * claimed again by the time the last namespace is reconciled, and settling
 * in between would delete a row the target carries. Returns the number of
 * rows deleted.
 */
export function settleReleasedSyncedRecords(db: Database.Database, target: string, ids: Iterable<string>, knownTargets: Iterable<string> = [target]): number {
  return db.transaction(() => settleReleasedRows(db, target, ids, knownTargets))()
}

function settleReleasedRows(db: Database.Database, target: string, ids: Iterable<string>, knownTargets: Iterable<string>): number {
  const known = [...knownTargets]
  const find = db.prepare(`
    SELECT device_instance_id AS owner FROM synced_records
    WHERE id = ? AND id NOT IN (SELECT record_id FROM sync_record_claims)
  `)
  const defer = db.prepare(`UPDATE synced_records SET unclaimed_since = ${AWAITING_MISSING_VERDICTS} WHERE id = ?`)
  const del = db.prepare(`DELETE FROM synced_records WHERE id = ?`)
  const delMerged = db.prepare(`DELETE FROM records WHERE id = ? AND origin = 'synced'`)
  // A merged copy whose mirrored row is gone already has nothing left to mirror.
  const delStrayMerged = db.prepare(`DELETE FROM records WHERE id = ? AND origin = 'synced' AND id NOT IN (SELECT id FROM synced_records)`)
  const judged = new Map<string, boolean>()
  let pruned = 0
  for (const id of ids) {
    const row = find.get(id) as { owner: string } | undefined
    if (!row) {
      delStrayMerged.run(id)
      continue
    }
    const key = namespaceVerdictKey(row.owner)
    if (!judged.has(key)) judged.set(key, everyKnownTargetHasJudged(db, target, row.owner, known))
    if (!judged.get(key)) {
      defer.run(id)
      continue
    }
    pruned += del.run(id).changes
    delMerged.run(id)
  }
  return pruned
}

/**
 * Release `target`'s claim on a pulled record and, when that was the last
 * claim, remove it from both `synced_records` and its merged copy in
 * `records` — provided every known target, `target` included, has judged the
 * row's namespace (a tombstone is applied after a complete pull, which is the
 * cloud's verdict); otherwise the row becomes unresolved and is left to
 * `pruneUnresolvedSyncedRecords` (see `reconcileSyncedNamespace`). A target
 * can only release its own claim: a row `target` never claimed (an unresolved
 * row, or one claimed by other targets only) is left alone. Locally parsed
 * rows (`origin = 'local'`) are never touched.
 *
 * `owner` names the namespace the retraction comes from (the device a cloud
 * tombstone belongs to): only the claim `target` holds for that namespace is
 * released, so a copy of the same id that another device still publishes on
 * `target` keeps its claim and the row. When omitted, every claim `target`
 * holds on the id is released. `knownTargets` is as for
 * `reconcileSyncedNamespace`.
 * Returns true when a `synced_records` row was removed.
 */
export function deleteSyncedRecord(
  db: Database.Database,
  target: string,
  id: string,
  options: { owner?: string; knownTargets?: Iterable<string> } = {},
): boolean {
  const knownTargets = options.knownTargets ?? [target]
  return db.transaction(() => {
    if (!hasClaim(db, target, id, options.owner)) return false
    if (!releaseClaim(db, target, id, options.owner)) return false
    return settleReleasedRows(db, target, [id], knownTargets) > 0
  })()
}

function fillRemoteIds(db: Database.Database, ids: Iterable<string>): void {
  db.exec(`CREATE TEMP TABLE IF NOT EXISTS sync_remote_ids (id TEXT PRIMARY KEY)`)
  db.exec(`DELETE FROM sync_remote_ids`)
  const insert = db.prepare(`INSERT OR IGNORE INTO sync_remote_ids (id) VALUES (?)`)
  for (const id of ids) insert.run(id)
}

/**
 * Make the local mirror of `owner`'s namespace, as seen from `target`, match
 * `remoteIds` exactly, and record `target`'s verdict on the namespace.
 *
 *  - Legacy rows stamped `'unknown'` (or empty) whose id is present in the
 *    namespace are relabelled to `owner`: the namespace they sit in is the
 *    device that parsed them, and exposing `'unknown'` as a device of its own
 *    was a display bug.
 *  - `target`'s claims for `owner` are replaced by `remoteIds`; the claimed
 *    rows are resolved (`unclaimed_since = NULL`).
 *  - Rows whose claim `target` released here and that no target claims any
 *    more are removed from `synced_records`, together with their merged
 *    copies in `records` (`origin = 'synced'` only) — provided every known
 *    target, this one included, has judged the namespace of the device the
 *    row is attributed to (see `settleReleasedRows`). A known target
 *    without a verdict has not established its claims yet and may well carry
 *    the row, so the released rows become *unresolved* instead
 *    (`unclaimed_since = 0`) and go once the missing verdicts are in, unless
 *    one of those targets claims them first. A target only ever releases its
 *    own claim: a row another target still claims survives, and so does a
 *    row that was unresolved already (one `target` never claimed) — only
 *    `pruneUnresolvedSyncedRecords` may remove those, once every known
 *    target has judged the namespace. Locally parsed rows are never deleted
 *    here.
 *  - The verdict `(target, owner, judgedAt)` is recorded, `judgedAt` being
 *    the sync clock tick of the run (see `nextSyncTick`) — under
 *    `namespaceVerdictKey(owner)`, the key the verdict is looked up by.
 *
 * Callers must only invoke this with a `remoteIds` set they read completely
 * and reliably (a verified snapshot, an authoritatively empty namespace, or a
 * confirmed absence); a namespace whose files could not all be read, parsed
 * or verified must be skipped, never reconciled against a partial set.
 *
 * `options.knownTargets` is every sync target this device knows (`target`
 * included or not); when omitted, `target` is the only one. A caller that
 * reconciles several namespaces in one run passes the same `options.released`
 * set to every call: the ids whose claim was released are added to it
 * instead of being settled here, and the caller settles them once with
 * `settleReleasedSyncedRecords` after the last namespace, when an id that
 * moved from one namespace to another has its new claim.
 *
 * Returns the number of `synced_records` rows removed (0 with `released`).
 */
export function reconcileSyncedNamespace(
  db: Database.Database,
  target: string,
  owner: string,
  remoteIds: Iterable<string>,
  judgedAt: number = nextSyncTick(db),
  options: { knownTargets?: Iterable<string>; released?: Set<string> } = {},
): number {
  const knownTargets = options.knownTargets ?? [target]
  return db.transaction(() => {
    fillRemoteIds(db, remoteIds)

    if (owner !== '' && owner !== UNKNOWN_DEVICE_INSTANCE_ID) {
      db.prepare(`
        UPDATE synced_records SET device_instance_id = @owner
        WHERE device_instance_id IN ('${UNKNOWN_DEVICE_INSTANCE_ID}', '')
          AND id IN (SELECT id FROM sync_remote_ids)
      `).run({ owner })
      db.prepare(`
        UPDATE records SET device_instance_id = @owner
        WHERE origin = 'synced'
          AND device_instance_id IN ('${UNKNOWN_DEVICE_INSTANCE_ID}', '')
          AND id IN (SELECT id FROM sync_remote_ids)
      `).run({ owner })
    }

    // The claims this target is about to release: the only rows this
    // reconciliation may delete.
    db.exec(`CREATE TEMP TABLE IF NOT EXISTS sync_released_ids (id TEXT PRIMARY KEY)`)
    db.exec(`DELETE FROM sync_released_ids`)
    db.prepare(`
      INSERT OR IGNORE INTO sync_released_ids (id)
      SELECT record_id FROM sync_record_claims
      WHERE target = @target AND device_instance_id = @owner
        AND record_id NOT IN (SELECT id FROM sync_remote_ids)
    `).run({ target, owner })

    db.prepare(`DELETE FROM sync_record_claims WHERE target = @target AND device_instance_id = @owner`).run({ target, owner })
    db.prepare(`
      INSERT OR IGNORE INTO sync_record_claims (target, device_instance_id, record_id)
      SELECT @target, @owner, id FROM sync_remote_ids
    `).run({ target, owner })
    db.prepare(`
      UPDATE synced_records SET unclaimed_since = NULL
      WHERE unclaimed_since IS NOT NULL AND id IN (SELECT id FROM sync_remote_ids)
    `).run()

    // A released row goes only when no target claims it any more — and only
    // when every known target has judged its namespace, so that "no
    // claim" means "not carried" rather than "not looked at yet".
    const released = (db.prepare(`SELECT id FROM sync_released_ids`).all() as Array<{ id: string }>).map(r => r.id)
    // Recorded before settling: the released rows are judged by it too.
    recordNamespaceVerdict(db, target, namespaceVerdictKey(owner), judgedAt)
    let pruned = 0
    if (options.released) for (const id of released) options.released.add(id)
    else pruned = settleReleasedRows(db, target, released, knownTargets)
    db.exec(`DELETE FROM sync_released_ids`)
    db.exec(`DELETE FROM sync_remote_ids`)
    return pruned
  })()
}

/**
 * Pulled rows that no target claims, grouped by the device they are
 * attributed to. These are the *unresolved* rows: they predate migration v14
 * (claims did not exist yet) or were read from a namespace no target has
 * verified since; only a verdict from every known target can settle them.
 */
export function getUnclaimedSyncedRecords(db: Database.Database): Map<string, string[]> {
  const rows = db.prepare(`
    SELECT id, device_instance_id FROM synced_records
    WHERE id NOT IN (SELECT record_id FROM sync_record_claims)
    ORDER BY device_instance_id, id
  `).all() as Array<{ id: string; device_instance_id: string }>
  const byOwner = new Map<string, string[]>()
  for (const row of rows) {
    const list = byOwner.get(row.device_instance_id) ?? []
    list.push(row.id)
    byOwner.set(row.device_instance_id, list)
  }
  return byOwner
}

/** Devices that unresolved rows are attributed to. */
export function getUnclaimedOwners(db: Database.Database): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT device_instance_id AS owner FROM synced_records
    WHERE id NOT IN (SELECT record_id FROM sync_record_claims)
    ORDER BY device_instance_id
  `).all() as Array<{ owner: string }>
  return rows.map(r => r.owner)
}

/** Verdict key under which rows attributed to `owner` are judged. */
export function namespaceVerdictKey(owner: string): string {
  return owner === '' || owner === UNKNOWN_DEVICE_INSTANCE_ID ? UNKNOWN_NAMESPACE_VERDICT : owner
}

/**
 * Remove unresolved rows whose provenance has been settled negatively: every
 * target in `knownTargets` has judged the row's namespace in a sync *after*
 * the one that made the row unresolved (so the row was on none of them) and
 * still no target claims it. Rows of a namespace that some known target has
 * not judged yet — because that target has not been synced since the
 * upgrade, or skipped the namespace as unverifiable — are kept; they may be
 * exactly what that target still carries. Rows stamped `'unknown'` are
 * judged under `UNKNOWN_NAMESPACE_VERDICT`. Returns the number of
 * `synced_records` rows removed (merged copies go with them).
 */
export function pruneUnresolvedSyncedRecords(db: Database.Database, knownTargets: Iterable<string>): number {
  const targets = [...new Set(knownTargets)]
  if (targets.length === 0) return 0
  return db.transaction(() => {
    const owners = (db.prepare(`
      SELECT DISTINCT device_instance_id AS owner FROM synced_records
      WHERE id NOT IN (SELECT record_id FROM sync_record_claims)
    `).all() as Array<{ owner: string }>).map(r => r.owner)
    let pruned = 0
    const settled = db.prepare(`
      SELECT id FROM synced_records
      WHERE device_instance_id = @owner
        AND id NOT IN (SELECT record_id FROM sync_record_claims)
        AND COALESCE(unclaimed_since, 0) < @cutoff
    `)
    // Merged copies go by id, with the row they mirror. A `records` row of
    // the same device that has no `synced_records` counterpart (re-flagged by
    // `repairRecordProvenance`) was never judged by anyone and stays.
    const del = db.prepare(`DELETE FROM synced_records WHERE id = ?`)
    const delMerged = db.prepare(`DELETE FROM records WHERE id = ? AND origin = 'synced'`)
    for (const owner of owners) {
      const verdicts = getNamespaceVerdicts(db, namespaceVerdictKey(owner))
      let cutoff = Infinity
      for (const target of targets) {
        const judgedAt = verdicts.get(target)
        if (judgedAt === undefined) { cutoff = -Infinity; break }
        cutoff = Math.min(cutoff, judgedAt)
      }
      if (cutoff === -Infinity) continue
      for (const { id } of settled.all({ owner, cutoff }) as Array<{ id: string }>) {
        pruned += del.run(id).changes
        delMerged.run(id)
      }
    }
    return pruned
  })()
}

/**
 * Merge synced_records into records table so API queries can see them.
 * Inserts records that don't already exist in records and refreshes merged
 * copies (`origin = 'synced'`) whose remote counterpart has been updated
 * since, so both tables always describe the same remote state.
 *
 * Every row written here is stamped `origin = 'synced'` — that flag, not the
 * `source_file` value, is what marks it as pulled. `source_file` and `cwd`
 * are copied verbatim so cross-device project stats keep working.
 *
 * Rows carrying `currentDeviceInstanceId` (when given) are skipped: a copy of
 * this device's own record can only reach `synced_records` by being echoed
 * through another device's namespace, and the authoritative row already lives
 * in `records` with `origin = 'local'`.
 *
 * Returns the number of newly inserted records.
 */
export function mergeSyncedRecordsIntoRecords(db: Database.Database, currentDeviceInstanceId?: string): number {
  const now = Date.now()
  const ownFilter = currentDeviceInstanceId !== undefined ? 'AND sr.device_instance_id != @currentDeviceInstanceId' : ''
  const params = currentDeviceInstanceId !== undefined ? { currentDeviceInstanceId } : {}

  // Refresh merged copies that fell behind their synced_records row.
  db.prepare(`
    UPDATE records SET
      ts = sr.ts, updated_at = sr.updated_at, tool = sr.tool, model = sr.model, provider = sr.provider,
      input_tokens = sr.input_tokens, output_tokens = sr.output_tokens,
      cache_read_tokens = sr.cache_read_tokens, cache_write_tokens = sr.cache_write_tokens,
      thinking_tokens = sr.thinking_tokens, cost = sr.cost, cost_source = sr.cost_source,
      session_id = sr.session_key, device = sr.device, device_instance_id = sr.device_instance_id,
      platform = sr.platform,
      source_file = CASE WHEN sr.source_file != '' THEN sr.source_file ELSE records.source_file END,
      cwd = sr.cwd
    FROM synced_records sr
    WHERE sr.id = records.id
      AND records.origin = 'synced'
      AND sr.updated_at > records.updated_at
      ${ownFilter}
  `).run(params)

  const newRows = db.prepare(`
    SELECT sr.* FROM synced_records sr
    LEFT JOIN records r ON sr.id = r.id
    WHERE r.id IS NULL ${ownFilter}
  `).all(params) as Record<string, unknown>[]

  if (newRows.length === 0) return 0

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO records (
      id, ts, ingested_at, synced_at, updated_at, line_offset,
      tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_id, source_file, cwd, device, device_instance_id, platform, origin
    ) VALUES (
      @id, @ts, @ingestedAt, @syncedAt, @updatedAt, 0,
      @tool, @model, @provider, @inputTokens, @outputTokens,
      @cacheReadTokens, @cacheWriteTokens, @thinkingTokens,
      @cost, @costSource, @sessionId, @sourceFile, @cwd, @device, @deviceInstanceId, @platform, 'synced'
    )
  `)

  const tx = db.transaction((rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const sourceFile = (typeof row.source_file === 'string' && row.source_file)
        ? row.source_file
        : `synced/${row.device_instance_id}`
      insertStmt.run({
        id: row.id,
        ts: row.ts,
        ingestedAt: now,
        syncedAt: now,
        updatedAt: row.updated_at,
        tool: row.tool,
        model: row.model,
        provider: row.provider,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheReadTokens: row.cache_read_tokens,
        cacheWriteTokens: row.cache_write_tokens,
        thinkingTokens: row.thinking_tokens,
        cost: row.cost,
        costSource: row.cost_source,
        sessionId: row.session_key,
        sourceFile,
        cwd: (typeof row.cwd === 'string' ? row.cwd : '') || '',
        device: row.device,
        deviceInstanceId: row.device_instance_id,
        platform: (typeof row.platform === 'string' ? row.platform : '') || '',
      })
    }
  })

  tx(newRows)
  return newRows.length
}

function mapRowToSyncRecord(row: Record<string, unknown>): SyncRecord {
  return {
    id: row.id as string,
    ts: row.ts as number,
    tool: row.tool as SyncRecord['tool'],
    model: row.model as string,
    provider: row.provider as string,
    inputTokens: row.input_tokens as number,
    outputTokens: row.output_tokens as number,
    cacheReadTokens: row.cache_read_tokens as number,
    cacheWriteTokens: row.cache_write_tokens as number,
    thinkingTokens: row.thinking_tokens as number,
    cost: row.cost as number,
    costSource: row.cost_source as SyncRecord['costSource'],
    sessionKey: row.session_key as string,
    device: row.device as string,
    deviceInstanceId: row.device_instance_id as string,
    platform: row.platform as string | undefined,
    updatedAt: row.updated_at as number,
    sourceFile: (row.source_file as string) || undefined,
    cwd: (row.cwd as string) || undefined,
  }
}
