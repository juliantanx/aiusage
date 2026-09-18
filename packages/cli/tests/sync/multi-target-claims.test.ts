import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { generateRecordId } from '@aiusage/core'
import type { StatsRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { deleteSyncedRecord, insertSyncedRecord } from '../../src/db/synced-records.js'
import { getClaimingTargets, recordNamespaceVerdict, replaceNamespaceClaims } from '../../src/db/sync-claims.js'
import { SyncOrchestrator } from '../../src/sync/index.js'
import { mapStatsRecordToSyncRecord } from '../../src/sync/mapper.js'
import { FakeSyncBackend } from './helpers/fake-backend.js'

// A pulled record is deleted locally only when *no* sync target claims it any
// more. Every target keeps its own claims per (device namespace, record id);
// reconciling one target never touches another target's claims.

const X = 'device-x'
const B = 'device-b'
const T_A = 'github:example/repo-a'
const T_B = 's3:bucket-b'
const DAY = Date.UTC(2026, 8, 6, 12, 0, 0)

function local(owner: string, n: number, overrides: Partial<StatsRecord> = {}): StatsRecord {
  return {
    id: generateRecordId(owner, `msg_${n}`, 0),
    ts: DAY + n * 60_000,
    ingestedAt: DAY,
    updatedAt: DAY,
    lineOffset: 100 * (n + 1),
    tool: 'claude-code',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    inputTokens: 100 + n,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    thinkingTokens: 0,
    cost: 0.001,
    costSource: 'pricing',
    sessionId: 'sess-x',
    sourceFile: 'C:\\Users\\x\\.claude\\projects\\p\\s.jsonl',
    cwd: 'C:\\proj',
    device: 'X',
    deviceInstanceId: owner,
    platform: 'win32',
    ...overrides,
  }
}

function newDb(): Database.Database {
  const db = new Database(':memory:')
  initializeDatabase(db)
  return db
}

function sync(db: Database.Database, backend: FakeSyncBackend, deviceInstanceId: string, target: string, knownTargets: string[] = [T_A, T_B]) {
  return new SyncOrchestrator(db, backend, { deviceInstanceId, target, consentVerified: true, knownTargets }).sync()
}

const syncedIds = (db: Database.Database, owner: string) =>
  (db.prepare(`SELECT id FROM synced_records WHERE device_instance_id = ? ORDER BY id`).all(owner) as Array<{ id: string }>).map(r => r.id)
const mergedIds = (db: Database.Database, owner: string) =>
  (db.prepare(`SELECT id FROM records WHERE origin = 'synced' AND device_instance_id = ? ORDER BY id`).all(owner) as Array<{ id: string }>).map(r => r.id)

describe('per-target record claims', () => {
  let dbX: Database.Database
  let dbB: Database.Database
  let targetA: FakeSyncBackend
  let targetB: FakeSyncBackend
  let records: StatsRecord[]
  let wireIds: string[]

  beforeEach(() => {
    dbX = newDb()
    dbB = newDb()
    targetA = new FakeSyncBackend()
    targetB = new FakeSyncBackend()
    records = [0, 1, 2].map(n => local(X, n))
    for (const r of records) insertRecord(dbX, r)
    wireIds = records.map(r => mapStatsRecordToSyncRecord(r).id).sort()
  })

  it('does not delete a record one target dropped while another target still claims it, and needs no re-insertion later', async () => {
    // X publishes to both targets; B mirrors both.
    await sync(dbX, targetA, X, T_A)
    await sync(dbX, targetB, X, T_B)
    await sync(dbB, targetA, B, T_A)
    await sync(dbB, targetB, B, T_B)
    expect(syncedIds(dbB, X)).toEqual(wireIds)
    const R = mapStatsRecordToSyncRecord(records[1]).id
    expect(getClaimingTargets(dbB, R).sort()).toEqual([T_A, T_B].sort())

    // Mark B's merged copy so a delete + re-insert would be visible.
    dbB.prepare(`UPDATE records SET ingested_at = 424242 WHERE id = ?`).run(R)

    // X removes R and only syncs target B.
    dbX.prepare(`DELETE FROM records WHERE id = ?`).run(records[1].id)
    await sync(dbX, targetB, X, T_B)
    expect(targetB.linesUnder(X).map(l => l.id)).not.toContain(R)
    expect(targetA.linesUnder(X).map(l => l.id)).toContain(R)

    // Reconciling target B releases only B's claim.
    const b1 = await sync(dbB, targetB, B, T_B)
    expect(b1.status).toBe('ok')
    expect(b1.prunedCount ?? 0).toBe(0)
    expect(syncedIds(dbB, X)).toContain(R)
    expect(mergedIds(dbB, X)).toContain(R)
    expect(getClaimingTargets(dbB, R)).toEqual([T_A])

    // Syncing target A again keeps R without touching the row.
    const b2 = await sync(dbB, targetA, B, T_A)
    expect(b2.status).toBe('ok')
    expect(b2.pulledCount).toBe(0)
    expect(b2.prunedCount ?? 0).toBe(0)
    expect(dbB.prepare(`SELECT ingested_at FROM records WHERE id = ?`).get(R)).toEqual({ ingested_at: 424242 })

    // Only once target A drops it too does the record disappear.
    await sync(dbX, targetA, X, T_A)
    const b3 = await sync(dbB, targetA, B, T_A)
    expect(b3.prunedCount).toBe(1)
    expect(syncedIds(dbB, X)).not.toContain(R)
    expect(mergedIds(dbB, X)).not.toContain(R)
    expect(getClaimingTargets(dbB, R)).toEqual([])
    expect(syncedIds(dbB, X)).toHaveLength(2)
  })

  it('switching between targets with overlapping and divergent record sets never loses a claimed record', async () => {
    // Target A carries {r0, r1, r2}; target B carries {r2, r3} (X synced B later, after a partial rebuild).
    await sync(dbX, targetA, X, T_A)
    dbX.prepare(`DELETE FROM records WHERE id IN (?, ?)`).run(records[0].id, records[1].id)
    insertRecord(dbX, local(X, 3))
    await sync(dbX, targetB, X, T_B)
    const r0 = mapStatsRecordToSyncRecord(records[0]).id
    const r1 = mapStatsRecordToSyncRecord(records[1]).id
    const r2 = mapStatsRecordToSyncRecord(records[2]).id
    const r3 = mapStatsRecordToSyncRecord(local(X, 3)).id

    await sync(dbB, targetA, B, T_A)
    expect(syncedIds(dbB, X)).toEqual([r0, r1, r2].sort())

    // Switching to B adds r3 and prunes nothing: r0 and r1 are still claimed by A.
    const b1 = await sync(dbB, targetB, B, T_B)
    expect(b1.prunedCount ?? 0).toBe(0)
    expect(syncedIds(dbB, X)).toEqual([r0, r1, r2, r3].sort())
    expect(getClaimingTargets(dbB, r2).sort()).toEqual([T_A, T_B].sort())
    expect(getClaimingTargets(dbB, r3)).toEqual([T_B])

    // Switching back to A prunes nothing either: r3 is claimed by B.
    const b2 = await sync(dbB, targetA, B, T_A)
    expect(b2.prunedCount ?? 0).toBe(0)
    expect(syncedIds(dbB, X)).toEqual([r0, r1, r2, r3].sort())

    // X now publishes its current state to A too: r0 and r1 vanish from A and
    // were never on B, so they go; r3 stays.
    await sync(dbX, targetA, X, T_A)
    const b3 = await sync(dbB, targetA, B, T_A)
    expect(b3.prunedCount).toBe(2)
    expect(syncedIds(dbB, X)).toEqual([r2, r3].sort())
    expect(mergedIds(dbB, X)).toEqual([r2, r3].sort())
  })

  it('a namespace that disappears from one target only releases that target\'s claims', async () => {
    await sync(dbX, targetA, X, T_A)
    await sync(dbX, targetB, X, T_B)
    await sync(dbB, targetA, B, T_A)
    await sync(dbB, targetB, B, T_B)

    for (const path of [...targetB.files.keys()]) if (path.startsWith(`${X}/`)) targetB.files.delete(path)
    const b = await sync(dbB, targetB, B, T_B)
    expect(b.prunedCount ?? 0).toBe(0)
    expect(syncedIds(dbB, X)).toEqual(wireIds)
    for (const id of wireIds) expect(getClaimingTargets(dbB, id)).toEqual([T_A])

    for (const path of [...targetA.files.keys()]) if (path.startsWith(`${X}/`)) targetA.files.delete(path)
    const b2 = await sync(dbB, targetA, B, T_A)
    expect(b2.prunedCount).toBe(3)
    expect(syncedIds(dbB, X)).toEqual([])
    expect(mergedIds(dbB, X)).toEqual([])
  })

  it('cloud claims protect rows from file-target reconciliation, and a cloud tombstone releases only the cloud claim', async () => {
    const wire = mapStatsRecordToSyncRecord(records[0])
    insertSyncedRecord(dbB, wire)
    replaceNamespaceClaims(dbB, 'cloud', X, [wire.id])

    // X's namespace on the file target does not contain the record.
    dbX.prepare(`DELETE FROM records WHERE id = ?`).run(records[0].id)
    await sync(dbX, targetA, X, T_A)
    const b = await sync(dbB, targetA, B, T_A)
    expect(b.prunedCount ?? 0).toBe(0)
    expect(syncedIds(dbB, X)).toContain(wire.id)
    expect(getClaimingTargets(dbB, wire.id)).toEqual(['cloud'])

    // A cloud tombstone drops the last claim, so the row goes (tombstones are
    // applied after a complete pull, which is the cloud's verdict on X).
    recordNamespaceVerdict(dbB, 'cloud', X, 99)
    expect(deleteSyncedRecord(dbB, 'cloud', wire.id)).toBe(true)
    expect(syncedIds(dbB, X)).not.toContain(wire.id)

    // With another claim in place the tombstone releases only cloud's claim.
    insertSyncedRecord(dbB, wire)
    replaceNamespaceClaims(dbB, 'cloud', X, [wire.id])
    replaceNamespaceClaims(dbB, T_A, X, [wire.id])
    expect(deleteSyncedRecord(dbB, 'cloud', wire.id)).toBe(false)
    expect(syncedIds(dbB, X)).toContain(wire.id)
    expect(getClaimingTargets(dbB, wire.id)).toEqual([T_A])
  })
})
