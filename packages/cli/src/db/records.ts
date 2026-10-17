import type Database from 'better-sqlite3'
import type { RecordOrigin, StatsRecord, Tool } from '@aiusage/core'
import { generateSyncRecordId } from '@aiusage/core'
import { usesGeneratedWireId } from '../sync/mapper.js'

/**
 * Sentinel device id used by parsers that ran before `state.json` existed.
 * Such rows were still produced on this device, so they count as local; parse
 * re-labels them to the real device id on its next run.
 */
export const UNKNOWN_DEVICE_INSTANCE_ID = 'unknown'

/**
 * SQL fragment (no leading AND) selecting rows that were parsed on this device.
 * Use this — never `source_file NOT LIKE 'synced/%'` — to exclude records that
 * were pulled from other devices and merged into `records`.
 */
export const LOCAL_RECORDS_WHERE = "origin = 'local'"

/**
 * True when `record` may be uploaded under `deviceInstanceId`'s sync namespace:
 * it must have been parsed here (origin = local) and carry this device's id
 * (or the pre-init 'unknown' sentinel, which only local parsing can produce).
 * Pulled records — whatever their `source_file` — never satisfy this.
 */
export function isUploadableLocalRecord(
  record: Pick<StatsRecord, 'origin' | 'deviceInstanceId'>,
  deviceInstanceId: string,
): boolean {
  if ((record.origin ?? 'local') !== 'local') return false
  return record.deviceInstanceId === deviceInstanceId
    || record.deviceInstanceId === UNKNOWN_DEVICE_INSTANCE_ID
}

/** Columns a re-insert overwrites with the incoming value. */
const OVERWRITTEN_COLUMNS = [
  'ts', 'line_offset', 'tool', 'model', 'provider', 'input_tokens', 'output_tokens',
  'cache_read_tokens', 'cache_write_tokens', 'thinking_tokens', 'cost', 'cost_source',
  'session_id', 'source_file', 'device', 'device_instance_id', 'origin',
]
/**
 * Columns a re-insert overwrites only with a non-empty value. Most parsers
 * supply neither: `cwd` is filled in after the insert from the head of the
 * source file, `platform` by a backfill. An empty incoming value says nothing
 * about the stored one and must not erase it.
 */
const KEPT_WHEN_EMPTY_COLUMNS = ['cwd', 'platform']

const RECORD_CHANGED = [
  `(${OVERWRITTEN_COLUMNS.map(c => `records.${c}`).join(', ')}) IS NOT (${OVERWRITTEN_COLUMNS.map(c => `excluded.${c}`).join(', ')})`,
  ...KEPT_WHEN_EMPTY_COLUMNS.map(c => `(excluded.${c} != '' AND records.${c} IS NOT excluded.${c})`),
].join('\n        OR ')

/**
 * Write a parsed record, updating the row in place when its id already exists.
 *
 * An existing row is never deleted and re-created (`INSERT OR REPLACE` does
 * that, which cascades to the row's `tool_calls` and `sync_record_state`). It
 * keeps its `ingested_at` and `synced_at`, and its `updated_at` moves only
 * when a stored field actually changed, so reading a source again leaves an
 * unchanged record synced on every target while a changed one is queued again.
 * A changed row always gets an `updated_at` above the one it had and above
 * every acknowledgement stored for it: a cloud target acknowledges the
 * `updated_at` it was sent (see `markRecordVersionsSynced`) and a file
 * backend the time of its upload, and a record counts as unsynced only while
 * `updated_at` is greater. A new version must therefore never reuse or fall
 * below those values, whatever the caller's clock says.
 */
export function insertRecord(db: Database.Database, record: StatsRecord): void {
  db.prepare(`
    INSERT INTO records (
      id, ts, ingested_at, synced_at, updated_at, line_offset,
      tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_id, source_file, cwd, device, device_instance_id, platform, origin
    ) VALUES (
      @id, @ts, @ingestedAt, @syncedAt, @updatedAt, @lineOffset,
      @tool, @model, @provider, @inputTokens, @outputTokens,
      @cacheReadTokens, @cacheWriteTokens, @thinkingTokens,
      @cost, @costSource, @sessionId, @sourceFile, @cwd, @device, @deviceInstanceId, @platform, @origin
    )
    ON CONFLICT(id) DO UPDATE SET
      ${OVERWRITTEN_COLUMNS.map(c => `${c} = excluded.${c}`).join(',\n      ')},
      ${KEPT_WHEN_EMPTY_COLUMNS.map(c => `${c} = CASE WHEN excluded.${c} != '' THEN excluded.${c} ELSE records.${c} END`).join(',\n      ')},
      updated_at = CASE
        WHEN ${RECORD_CHANGED}
        THEN MAX(
          excluded.updated_at,
          records.updated_at + 1,
          COALESCE(records.synced_at, 0) + 1,
          COALESCE((SELECT MAX(s.synced_at) FROM sync_record_state s WHERE s.record_id = records.id), 0) + 1
        )
        ELSE records.updated_at
      END
  `).run({
    id: record.id,
    ts: record.ts,
    ingestedAt: record.ingestedAt,
    syncedAt: record.syncedAt ?? null,
    updatedAt: record.updatedAt,
    lineOffset: record.lineOffset,
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
    sessionId: record.sessionId,
    sourceFile: record.sourceFile,
    cwd: record.cwd ?? '',
    device: record.device,
    deviceInstanceId: record.deviceInstanceId,
    platform: record.platform ?? '',
    origin: record.origin ?? 'local',
  })
}

export function getRecordById(db: Database.Database, id: string): StatsRecord | null {
  const row = db.prepare('SELECT * FROM records WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return mapRowToRecord(row)
}

export function getRecordsBySourceFile(db: Database.Database, sourceFile: string): StatsRecord[] {
  const rows = db.prepare('SELECT * FROM records WHERE source_file = ?').all(sourceFile) as Record<string, unknown>[]
  return rows.map(mapRowToRecord)
}

export function deleteRecordsBySourceFile(db: Database.Database, sourceFile: string): number {
  const result = db.prepare('DELETE FROM records WHERE source_file = ?').run(sourceFile)
  return result.changes
}

/**
 * Local records that still need uploading.
 *
 * Only rows with `origin = 'local'` are candidates: rows merged from
 * `synced_records` are never returned, regardless of their `source_file`.
 * When `deviceInstanceId` is given, candidates are additionally restricted to
 * rows carrying that device id (or the pre-init 'unknown' sentinel), so a row
 * stamped with another device's id can never be uploaded under this device's
 * namespace even if its provenance flag were wrong.
 */
export function getUnsyncedRecords(db: Database.Database, target?: string, deviceInstanceId?: string): StatsRecord[] {
  const ownerWhere = deviceInstanceId !== undefined
    ? `AND r.device_instance_id IN (@deviceInstanceId, '${UNKNOWN_DEVICE_INSTANCE_ID}')`
    : ''
  const ownerParams = deviceInstanceId !== undefined ? { deviceInstanceId } : {}

  const rows = target
    ? db.prepare(`
        SELECT r.* FROM records r
        LEFT JOIN sync_record_state s
          ON s.record_id = r.id AND s.target = @target
        WHERE r.${LOCAL_RECORDS_WHERE}
          ${ownerWhere}
          AND (s.synced_at IS NULL OR r.updated_at > s.synced_at)
      `).all({ target, ...ownerParams }) as Record<string, unknown>[]
    : db.prepare(`
        SELECT r.* FROM records r
        WHERE r.${LOCAL_RECORDS_WHERE}
          ${ownerWhere}
          AND (r.synced_at IS NULL OR r.updated_at > r.synced_at)
      `).all(ownerParams) as Record<string, unknown>[]
  return rows.map(mapRowToRecord)
}

export function markRecordsSynced(db: Database.Database, ids: string[], syncedAt: number, target?: string): void {
  if (ids.length === 0) return

  if (target) {
    const insertStmt = db.prepare(`
      INSERT INTO sync_record_state (record_id, target, synced_at)
      VALUES (?, ?, ?)
      ON CONFLICT(record_id, target) DO UPDATE SET synced_at = excluded.synced_at
    `)
    const legacyStmt = db.prepare('UPDATE records SET synced_at = ? WHERE id = ?')
    const tx = db.transaction((recordIds: string[]) => {
      for (const id of recordIds) {
        insertStmt.run(id, target, syncedAt)
        legacyStmt.run(syncedAt, id)
      }
    })
    tx(ids)
    return
  }

  const updateStmt = db.prepare('UPDATE records SET synced_at = ? WHERE id = ?')
  const tx = db.transaction((recordIds: string[]) => {
    for (const id of recordIds) updateStmt.run(syncedAt, id)
  })
  tx(ids)
}

/**
 * Acknowledge the versions of records a target has accepted. Each entry names
 * a record and the `updated_at` it had when it was read for sending.
 *
 * The acknowledgement is that `updated_at`, not the time of the call: a
 * record counts as unsynced while `updated_at > synced_at`, so a version
 * written after the one that was sent stays unsynced whenever it is written.
 * A row whose `updated_at` no longer equals the one sent is not marked at
 * all, and neither is a row deleted in the meantime — the upload awaits the
 * network, so the parser can rewrite a record between the read and this call.
 * Returns the number of records acknowledged.
 */
export function markRecordVersionsSynced(
  db: Database.Database,
  versions: Array<Pick<StatsRecord, 'id' | 'updatedAt'>>,
  target: string,
): number {
  if (versions.length === 0) return 0

  const insertStmt = db.prepare(`
    INSERT INTO sync_record_state (record_id, target, synced_at)
    SELECT id, @target, updated_at FROM records WHERE id = @id AND updated_at = @updatedAt
    ON CONFLICT(record_id, target) DO UPDATE SET synced_at = excluded.synced_at
  `)
  const legacyStmt = db.prepare('UPDATE records SET synced_at = updated_at WHERE id = @id AND updated_at = @updatedAt')
  return db.transaction(() => {
    let marked = 0
    for (const { id, updatedAt } of versions) {
      marked += insertStmt.run({ id, updatedAt, target }).changes
      legacyStmt.run({ id, updatedAt })
    }
    return marked
  })()
}

/**
 * Forget what `target` has acknowledged, so every local record counts as
 * unsynced for it again. Used when the target's data was replaced by an empty
 * dataset (a new cloud sync generation). Returns the number of rows removed.
 */
export function clearSyncRecordState(db: Database.Database, target: string): number {
  return db.prepare('DELETE FROM sync_record_state WHERE target = ?').run(target).changes
}

/**
 * Runtime provenance guard, run at the start of every sync once the current
 * device id is known (migrations cannot know it).
 *
 * Any `origin = 'local'` row stamped with a *different, concrete* device id
 * cannot have been produced by a parser on this device — parsers always stamp
 * the current id (or 'unknown' before init). Such rows are pulled copies whose
 * merge fingerprint was lost (e.g. the origin device renamed its alias and
 * re-uploaded, changing the session key), so they are re-flagged as `synced`.
 * Nothing is deleted; the rows remain visible via `synced_records`.
 * Returns the number of rows re-flagged.
 */
export function repairRecordProvenance(db: Database.Database, deviceInstanceId: string): number {
  const result = db.prepare(`
    UPDATE records
    SET origin = 'synced'
    WHERE origin = 'local'
      AND device_instance_id != ?
      AND device_instance_id != '${UNKNOWN_DEVICE_INSTANCE_ID}'
  `).run(deviceInstanceId)
  if (result.changes > 0) {
    db.prepare(`
      DELETE FROM sync_record_state
      WHERE record_id IN (SELECT id FROM records WHERE origin = 'synced')
    `).run()
  }
  return result.changes
}

function mapRowToRecord(row: Record<string, unknown>): StatsRecord {
  return {
    id: row.id as string,
    ts: row.ts as number,
    ingestedAt: row.ingested_at as number,
    syncedAt: row.synced_at != null ? (row.synced_at as number) : undefined,
    updatedAt: row.updated_at as number,
    lineOffset: row.line_offset as number,
    tool: row.tool as StatsRecord['tool'],
    model: row.model as string,
    provider: row.provider as string,
    inputTokens: row.input_tokens as number,
    outputTokens: row.output_tokens as number,
    cacheReadTokens: row.cache_read_tokens as number,
    cacheWriteTokens: row.cache_write_tokens as number,
    thinkingTokens: row.thinking_tokens as number,
    cost: row.cost as number,
    costSource: row.cost_source as StatsRecord['costSource'],
    sessionId: row.session_id as string,
    sourceFile: row.source_file as string,
    cwd: (row.cwd as string) || undefined,
    device: row.device as string,
    deviceInstanceId: row.device_instance_id as string,
    platform: (row.platform as string) || undefined,
    origin: ((row.origin as string) || 'local') as RecordOrigin,
  }
}

/**
 * Local rows still stamped `'unknown'` that were already published somewhere
 * travel, for tools whose wire id is generated from the device id, under
 * `sha256('unknown', sourceFile, lineOffset)`. Adopting them under the real
 * device id changes that wire id, so the old one must be retired on every
 * target that received it (file backends drop it with the next snapshot, the
 * cloud backend pushes a tombstone) and the row must be published again. This
 * records the retired ids and clears the rows' sync state; it does not
 * relabel anything. Returns the number of `(target, wire id)` pairs retired.
 */
export function retireWireIdsOfUnknownLocalRows(db: Database.Database): number {
  const rows = db.prepare(`
    SELECT s.record_id, s.target, r.tool, r.source_file, r.line_offset
    FROM sync_record_state s
    JOIN records r ON r.id = s.record_id
    WHERE r.${LOCAL_RECORDS_WHERE} AND r.device_instance_id = '${UNKNOWN_DEVICE_INSTANCE_ID}'
  `).all() as Array<{ record_id: string; target: string; tool: Tool; source_file: string; line_offset: number }>
  const affected = rows.filter(r => usesGeneratedWireId(r.tool))
  if (affected.length === 0) return 0

  const retire = db.prepare(`INSERT OR IGNORE INTO sync_retired_wire_ids (target, wire_id) VALUES (?, ?)`)
  const forget = db.prepare(`DELETE FROM sync_record_state WHERE record_id = ? AND target = ?`)
  const requeue = db.prepare(`UPDATE records SET synced_at = NULL WHERE id = ?`)
  return db.transaction(() => {
    let retired = 0
    for (const row of affected) {
      retired += retire.run(row.target, generateSyncRecordId(UNKNOWN_DEVICE_INSTANCE_ID, row.source_file, row.line_offset)).changes
      forget.run(row.record_id, row.target)
      requeue.run(row.record_id)
    }
    return retired
  })()
}

/**
 * Re-label locally parsed rows that still carry the pre-init `'unknown'`
 * sentinel with the real device id. Only `origin = 'local'` rows qualify: a
 * pulled row is never relabelled, whatever its device id says. Rows that had
 * already been published under the sentinel have their old wire ids retired
 * first (see `retireWireIdsOfUnknownLocalRows`). Returns the number of rows
 * updated.
 */
export function backfillUnknownDeviceInstanceId(db: Database.Database, deviceInstanceId: string, device?: string): number {
  if (!deviceInstanceId || deviceInstanceId === UNKNOWN_DEVICE_INSTANCE_ID) return 0
  return db.transaction(() => {
    retireWireIdsOfUnknownLocalRows(db)
    const result = device !== undefined
      ? db.prepare(`
          UPDATE records SET device_instance_id = ?, device = ?
          WHERE device_instance_id = '${UNKNOWN_DEVICE_INSTANCE_ID}' AND ${LOCAL_RECORDS_WHERE}
        `).run(deviceInstanceId, device)
      : db.prepare(`
          UPDATE records SET device_instance_id = ?
          WHERE device_instance_id = '${UNKNOWN_DEVICE_INSTANCE_ID}' AND ${LOCAL_RECORDS_WHERE}
        `).run(deviceInstanceId)
    return result.changes
  })()
}

/**
 * The complete, authoritative set of records this device publishes: every
 * locally parsed row stamped with its id. This is what a sync snapshot of the
 * device's remote namespace is built from — never a delta.
 */
export function getLocalRecordsForDevice(db: Database.Database, deviceInstanceId: string): StatsRecord[] {
  const rows = db.prepare(`
    SELECT * FROM records
    WHERE ${LOCAL_RECORDS_WHERE} AND device_instance_id = ?
    ORDER BY ts, id
  `).all(deviceInstanceId) as Record<string, unknown>[]
  return rows.map(mapRowToRecord)
}
