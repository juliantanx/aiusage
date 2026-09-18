import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { generateRecordId, generateSyncRecordId } from '@aiusage/core'
import type { StatsRecord, SyncRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { backfillUnknownDeviceInstanceId, insertRecord, markRecordsSynced, getUnsyncedRecords } from '../../src/db/records.js'
import { insertSyncedRecord, mergeSyncedRecordsIntoRecords } from '../../src/db/synced-records.js'
import { migrateV14 } from '../../src/db/migrations/v14.js'
import {
  clearRetiredWireIds,
  getClaimedOwners,
  getClaimedRecordIds,
  getClaimingTargets,
  getRetiredWireIds,
  nextSyncTick,
  releaseClaim,
  replaceNamespaceClaims,
} from '../../src/db/sync-claims.js'
import { SyncOrchestrator } from '../../src/sync/index.js'
import { mapStatsRecordToSyncRecord } from '../../src/sync/mapper.js'
import { repairSyncContamination } from '../../src/sync/repair.js'
import { FakeSyncBackend } from '../sync/helpers/fake-backend.js'

// v14 adds per-target record claims and records the wire ids that
// Antigravity/Trae records were previously published under, so the cloud
// backend can retract them once they travel under their parser ids.

const DEVICE = 'device-a'
const DB_PATH = 'C:\\Users\\alice\\.gemini\\antigravity\\conversations\\s.db'

function record(overrides: Partial<StatsRecord>): StatsRecord {
  return {
    id: generateRecordId(DEVICE, `antigravity:s:${overrides.lineOffset ?? 0}:${overrides.id ?? ''}`, 0),
    ts: 1000,
    ingestedAt: 1000,
    updatedAt: 1000,
    lineOffset: 0,
    tool: 'antigravity',
    model: 'gemini-2.5-pro',
    provider: 'google',
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    thinkingTokens: 0,
    cost: 0,
    costSource: 'pricing',
    sessionId: 's',
    sourceFile: DB_PATH,
    device: 'G14',
    deviceInstanceId: DEVICE,
    ...overrides,
  }
}

describe('migration v14', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  it('creates the claims, retired-id and verdict tables and the unresolved marker', () => {
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map(t => t.name)
    expect(tables).toContain('sync_record_claims')
    expect(tables).toContain('sync_retired_wire_ids')
    expect(tables).toContain('sync_namespace_verdicts')
    expect(tables).not.toContain('sync_namespaces')
    const columns = (db.prepare(`PRAGMA table_info(synced_records)`).all() as Array<{ name: string }>).map(c => c.name)
    expect(columns).toContain('unclaimed_since')
  })

  it('marks every row mirrored before the upgrade unresolved at sync tick 0', () => {
    const pulled = mapStatsRecordToSyncRecord(record({ id: 'p', deviceInstanceId: 'device-b', tool: 'claude-code', model: 'm', provider: 'p', sourceFile: 'C:\b.jsonl', lineOffset: 1 }))
    insertSyncedRecord(db, pulled)
    // Back to the pre-v14 shape, then upgrade.
    db.exec(`DROP INDEX idx_synced_records_unclaimed; ALTER TABLE synced_records DROP COLUMN unclaimed_since`)
    db.prepare(`DELETE FROM schema_version WHERE version = 14`).run()
    migrateV14(db)
    expect(db.prepare(`SELECT unclaimed_since FROM synced_records`).all()).toEqual([{ unclaimed_since: 0 }])
    expect(nextSyncTick(db)).toBe(1)

    // Idempotent: a second run neither fails nor re-stamps.
    replaceNamespaceClaims(db, 'cloud', 'device-b', [pulled.id])
    expect(db.prepare(`SELECT unclaimed_since FROM synced_records`).all()).toEqual([{ unclaimed_since: null }])
    db.prepare(`DELETE FROM schema_version WHERE version = 14`).run()
    migrateV14(db)
    expect(db.prepare(`SELECT unclaimed_since FROM synced_records`).all()).toEqual([{ unclaimed_since: null }])
  })

  it('retires the old generated wire ids of already-synced Antigravity and Trae records and re-queues them', () => {
    const a1 = record({ id: 'a1', lineOffset: 3 })
    const a2 = record({ id: 'a2', lineOffset: 3 }) // shared (sourceFile, lineOffset): one old wire id for both
    const t1 = record({ id: 't1', tool: 'trae', model: 'trae-agent', provider: 'trae', sourceFile: 'C:\\trae.db' })
    const cc = record({ id: 'cc', tool: 'claude-code', model: 'claude-sonnet-4-6', provider: 'anthropic', sourceFile: 'C:\\s.jsonl', lineOffset: 42 })
    const unsyncedAntigravity = record({ id: 'a3', lineOffset: 9 })
    for (const r of [a1, a2, t1, cc, unsyncedAntigravity]) insertRecord(db, r)
    markRecordsSynced(db, [a1.id, a2.id, t1.id, cc.id], 5000, 'github:u/r')
    markRecordsSynced(db, [a1.id], 5000, 'cloud')

    // Re-run the migration body as an upgrade from v13 would.
    db.prepare(`DELETE FROM schema_version WHERE version = 14`).run()
    migrateV14(db)

    expect(getRetiredWireIds(db, 'github:u/r').sort()).toEqual([
      generateSyncRecordId(DEVICE, DB_PATH, 3),
      generateSyncRecordId(DEVICE, 'C:\\trae.db', 0),
    ].sort())
    expect(getRetiredWireIds(db, 'cloud')).toEqual([generateSyncRecordId(DEVICE, DB_PATH, 3)])

    // Re-keyed records are queued for re-publication; the Claude Code row is untouched.
    const pending = getUnsyncedRecords(db, 'github:u/r', DEVICE).map(r => r.id).sort()
    expect(pending).toEqual(['a1', 'a2', 'a3', 't1'].sort())
    expect(db.prepare(`SELECT synced_at FROM records WHERE id = 'cc'`).get()).toEqual({ synced_at: 5000 })

    // Migration is idempotent.
    db.prepare(`DELETE FROM schema_version WHERE version = 14`).run()
    migrateV14(db)
    expect(getRetiredWireIds(db, 'github:u/r')).toHaveLength(2)
  })

  it('does not retire ids for pulled copies of other devices', () => {
    insertRecord(db, record({ id: 'pulled', deviceInstanceId: 'device-b', origin: 'synced' }))
    db.prepare(`INSERT INTO sync_record_state (record_id, target, synced_at) VALUES ('pulled', 'cloud', 1)`).run()
    db.prepare(`DELETE FROM schema_version WHERE version = 14`).run()
    migrateV14(db)
    expect(getRetiredWireIds(db, 'cloud')).toEqual([])
  })

  it('retires the generated wire ids of already-synced legacy unknown-device rows and re-queues them', () => {
    // A Claude Code row parsed before `aiusage init` and pushed by an older
    // client under sha256('unknown', file, offset); adopting it under the real
    // device id changes that wire id.
    const cc = record({ id: 'cc', tool: 'claude-code', model: 'claude-sonnet-4-6', provider: 'anthropic', sourceFile: 'C:\\s.jsonl', lineOffset: 42, deviceInstanceId: 'unknown' })
    // A Cursor row in the same state publishes under its parser id, which does not depend on the device id.
    const cursor = record({ id: 'cur', tool: 'cursor', model: 'm', provider: 'p', sourceFile: 'C:\\cursor.db', lineOffset: 0, deviceInstanceId: 'unknown' })
    // A pulled copy stamped 'unknown' is never local and must stay out of it.
    insertRecord(db, record({ id: 'pulled-unknown', tool: 'claude-code', model: 'm', provider: 'p', sourceFile: 'C:\\o.jsonl', lineOffset: 7, deviceInstanceId: 'unknown', origin: 'synced' }))
    for (const r of [cc, cursor]) insertRecord(db, r)
    markRecordsSynced(db, [cc.id, cursor.id, 'pulled-unknown'], 5000, 'cloud')
    markRecordsSynced(db, [cc.id, cursor.id], 5000, 'github:u/r')

    db.prepare(`DELETE FROM schema_version WHERE version = 14`).run()
    migrateV14(db)

    const oldWireId = generateSyncRecordId('unknown', 'C:\\s.jsonl', 42)
    expect(getRetiredWireIds(db, 'cloud')).toEqual([oldWireId])
    expect(getRetiredWireIds(db, 'github:u/r')).toEqual([oldWireId])
    expect(getUnsyncedRecords(db, 'cloud', DEVICE).map(r => r.id)).toEqual(['cc'])
    expect(getUnsyncedRecords(db, 'github:u/r', DEVICE).map(r => r.id)).toEqual(['cc'])
    expect(db.prepare(`SELECT synced_at FROM records WHERE id = 'cur'`).get()).toEqual({ synced_at: 5000 })

    // The runtime adoption publishes the row under the real device id.
    expect(backfillUnknownDeviceInstanceId(db, DEVICE)).toBe(2)
    expect(mapStatsRecordToSyncRecord(getUnsyncedRecords(db, 'cloud', DEVICE)[0]).id).toBe(generateSyncRecordId(DEVICE, 'C:\\s.jsonl', 42))
    expect(db.prepare(`SELECT device_instance_id FROM records WHERE id = 'pulled-unknown'`).get()).toEqual({ device_instance_id: 'unknown' })
  })

  it('retires wire ids at adoption time too, for rows synced under the sentinel after the migration', () => {
    const cc = record({ id: 'late', tool: 'claude-code', model: 'm', provider: 'p', sourceFile: 'C:\\late.jsonl', lineOffset: 9, deviceInstanceId: 'unknown' })
    insertRecord(db, cc)
    markRecordsSynced(db, [cc.id], 5000, 'cloud')
    expect(backfillUnknownDeviceInstanceId(db, DEVICE, 'G14')).toBe(1)
    expect(getRetiredWireIds(db, 'cloud')).toEqual([generateSyncRecordId('unknown', 'C:\\late.jsonl', 9)])
    expect(getUnsyncedRecords(db, 'cloud', DEVICE).map(r => r.id)).toEqual(['late'])
    expect(db.prepare(`SELECT device_instance_id, device FROM records WHERE id = 'late'`).get()).toEqual({ device_instance_id: DEVICE, device: 'G14' })
    // Nothing left to do on a second pass.
    expect(backfillUnknownDeviceInstanceId(db, DEVICE)).toBe(0)
    expect(getRetiredWireIds(db, 'cloud')).toHaveLength(1)
  })

  it('tracks record claims per target and namespace', () => {
    replaceNamespaceClaims(db, 't1', 'b', ['r1', 'r2'])
    replaceNamespaceClaims(db, 't1', 'c', ['r3'])
    replaceNamespaceClaims(db, 't2', 'b', ['r2'])
    expect(getClaimedOwners(db, 't1').sort()).toEqual(['b', 'c'])
    expect(getClaimedOwners(db, 't2')).toEqual(['b'])
    expect([...getClaimedRecordIds(db, 't1', 'b')].sort()).toEqual(['r1', 'r2'])
    expect(getClaimingTargets(db, 'r2').sort()).toEqual(['t1', 't2'])

    // Replacing a namespace's claims on one target leaves the other target alone.
    replaceNamespaceClaims(db, 't1', 'b', ['r1'])
    expect(getClaimingTargets(db, 'r2')).toEqual(['t2'])
    expect(releaseClaim(db, 't2', 'r2')).toBe(true)
    expect(releaseClaim(db, 't1', 'r1')).toBe(true)
    expect(releaseClaim(db, 't1', 'r3')).toBe(true)
    expect(getClaimedOwners(db, 't1')).toEqual([])

    replaceNamespaceClaims(db, 't1', 'b', ['r9'])
    replaceNamespaceClaims(db, 't2', 'b', ['r9'])
    expect(releaseClaim(db, 't1', 'r9')).toBe(false)
  })

  it('clears retired ids per target, in full or by id', () => {
    db.prepare(`INSERT INTO sync_retired_wire_ids (target, wire_id) VALUES ('t1', 'x'), ('t1', 'y'), ('t2', 'x')`).run()
    clearRetiredWireIds(db, 't1', ['x'])
    expect(getRetiredWireIds(db, 't1')).toEqual(['y'])
    clearRetiredWireIds(db, 't1')
    expect(getRetiredWireIds(db, 't1')).toEqual([])
    expect(getRetiredWireIds(db, 't2')).toEqual(['x'])
  })
})

describe('upgrade with rows whose namespace disappeared before v14', () => {
  const OWN = 'device-me'
  const GONE = 'device-gone'
  const PRESENT = 'device-present'
  const TARGET = 'github:u/r'
  let db: Database.Database
  let backend: FakeSyncBackend
  let staleIds: string[]

  /** A pre-v14 client: pulled rows exist, no claims for them. */
  function seedPreV14(): void {
    const stale: SyncRecord[] = [0, 1].map(n => mapStatsRecordToSyncRecord(record({
      id: `gone-${n}`, deviceInstanceId: GONE, tool: 'claude-code', model: 'm', provider: 'p', sourceFile: 'C:\\g.jsonl', lineOffset: n,
    })))
    const present = mapStatsRecordToSyncRecord(record({
      id: 'present-0', deviceInstanceId: PRESENT, tool: 'claude-code', model: 'm', provider: 'p', sourceFile: 'C:\\p.jsonl', lineOffset: 0,
    }))
    for (const r of [...stale, present]) insertSyncedRecord(db, r)
    mergeSyncedRecordsIntoRecords(db, OWN)
    staleIds = stale.map(r => r.id)
    expect(db.prepare(`SELECT COUNT(*) AS n FROM sync_record_claims`).get()).toEqual({ n: 0 })
    // The present device still publishes its record; the gone device's namespace no longer exists.
    backend.files.set(`${PRESENT}/1970/01/01.ndjson`, JSON.stringify(present) + '\n')
  }

  const rowsOf = (owner: string) =>
    (db.prepare(`SELECT id FROM synced_records WHERE device_instance_id = ? ORDER BY id`).all(owner) as Array<{ id: string }>).map(r => r.id)
  const mergedOf = (owner: string) =>
    (db.prepare(`SELECT id FROM records WHERE origin = 'synced' AND device_instance_id = ?`).all(owner) as Array<{ id: string }>).map(r => r.id)

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    backend = new FakeSyncBackend()
    seedPreV14()
  })

  it('prunes the stale rows automatically when this is the only target the device has ever known', async () => {
    const result = await new SyncOrchestrator(db, backend, { deviceInstanceId: OWN, target: TARGET, consentVerified: true, knownTargets: [TARGET] }).sync()
    expect(result.status).toBe('ok')
    expect(result.prunedCount).toBe(2)
    expect(rowsOf(GONE)).toEqual([])
    expect(mergedOf(GONE)).toEqual([])
    // The present device's row is adopted by this target's claims.
    expect(rowsOf(PRESENT)).toEqual(['present-0'].map(() => mapStatsRecordToSyncRecord(record({ id: 'present-0', deviceInstanceId: PRESENT, tool: 'claude-code', model: 'm', provider: 'p', sourceFile: 'C:\\p.jsonl', lineOffset: 0 })).id))
    expect(getClaimedOwners(db, TARGET)).toEqual([PRESENT])
  })

  it('prunes merged copies by id: a re-flagged row of the same device that was never mirrored survives', async () => {
    // A local row stamped with another device's id (e.g. a database carried
    // over from a previous machine) is re-flagged `synced` at the start of
    // every sync. It has no `synced_records` counterpart, so no target ever
    // judged it, and settling the device's unresolved rows must not take it.
    insertRecord(db, record({ id: 'carried-over', deviceInstanceId: GONE, tool: 'claude-code', sourceFile: 'C:\\old.jsonl', lineOffset: 7 }))
    const carriedOver = db.prepare(`SELECT id FROM records WHERE device_instance_id = ? AND source_file = 'C:\\old.jsonl'`).get(GONE) as { id: string }

    const result = await new SyncOrchestrator(db, backend, { deviceInstanceId: OWN, target: TARGET, consentVerified: true, knownTargets: [TARGET] }).sync()
    expect(result.status).toBe('ok')
    expect(result.prunedCount).toBe(2)
    expect(rowsOf(GONE)).toEqual([])
    expect(mergedOf(GONE)).toEqual([carriedOver.id])
  })

  it('keeps the stale rows while another known target has not judged them, and lets sync --repair remove them deterministically', async () => {
    const result = await new SyncOrchestrator(db, backend, { deviceInstanceId: OWN, target: TARGET, consentVerified: true, knownTargets: [TARGET, 'cloud'] }).sync()
    expect(result.status).toBe('ok')
    expect(result.prunedCount ?? 0).toBe(0)
    expect(rowsOf(GONE)).toEqual(staleIds.sort())

    const dry = await repairSyncContamination(db, { deviceInstanceId: OWN, target: TARGET, backend })
    expect(dry.local.orphanedDevices).toEqual([GONE])
    expect(dry.local.orphanedSyncedIds.sort()).toEqual(staleIds.sort())
    expect(rowsOf(GONE)).toHaveLength(2)

    const applied = await repairSyncContamination(db, { deviceInstanceId: OWN, target: TARGET, backend, apply: true })
    expect(applied.applied).toBe(true)
    expect(rowsOf(GONE)).toEqual([])
    expect(mergedOf(GONE)).toEqual([])
    expect(rowsOf(PRESENT)).toHaveLength(1)

    const again = await repairSyncContamination(db, { deviceInstanceId: OWN, target: TARGET, backend })
    expect(again.local.orphanedSyncedIds).toEqual([])
  })

  it('does not report rows of a device that is present on the target, nor rows another target claims', async () => {
    replaceNamespaceClaims(db, 'cloud', GONE, [staleIds[0]])
    await new SyncOrchestrator(db, backend, { deviceInstanceId: OWN, target: TARGET, consentVerified: true, knownTargets: [TARGET] }).sync()
    // The cloud-claimed row survives the sole-target prune; the other stale row does not.
    expect(rowsOf(GONE)).toEqual([staleIds[0]])
    const dry = await repairSyncContamination(db, { deviceInstanceId: OWN, target: TARGET, backend })
    expect(dry.local.orphanedSyncedIds).toEqual([])
  })
})
