import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { generateSessionKey, generateSyncRecordId } from '@aiusage/core'
import type { StatsRecord, SyncRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord, markRecordsSynced } from '../../src/db/records.js'
import { insertSyncedRecord, mergeSyncedRecordsIntoRecords } from '../../src/db/synced-records.js'
import { SyncOrchestrator } from '../../src/sync/index.js'
import { repairSyncContamination, planRemoteRepair, SessionKeyChain } from '../../src/sync/repair.js'
import { generateSummary } from '../../src/commands/summary.js'
import { FakeSyncBackend } from './helpers/fake-backend.js'

// Models the real contaminated state observed in the field:
//   G14 (A) uploaded 4 records; MSI (B) pulled, merged, and re-uploaded them under
//   B's namespace as echoes (colliding id, hashed session key); A then pulled the
//   echoes back, merged them, and re-uploaded them under A's namespace again.

const A = 'device-a'
const B = 'device-b'
const FILE_A = 'C:\\Users\\alice\\.claude\\projects\\p\\s.jsonl'
const DAY = Date.UTC(2026, 8, 6, 10, 0, 0)

function localRecord(n: number): StatsRecord {
  return {
    id: `local-${n}`,
    ts: DAY + n * 1000,
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
    sessionId: 'sess-a',
    sourceFile: FILE_A,
    cwd: 'C:\\proj',
    device: 'G14',
    deviceInstanceId: A,
    platform: 'win32',
  }
}

/** Wire line as A legitimately uploaded it. */
function wireOf(r: StatsRecord): SyncRecord {
  return {
    id: generateSyncRecordId(r.deviceInstanceId, r.sourceFile, r.lineOffset),
    ts: r.ts, tool: r.tool, model: r.model, provider: r.provider,
    inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens,
    cacheWriteTokens: r.cacheWriteTokens, thinkingTokens: r.thinkingTokens, cost: r.cost, costSource: r.costSource,
    sessionKey: generateSessionKey(r.device, r.sessionId), device: r.device, deviceInstanceId: r.deviceInstanceId,
    platform: r.platform, updatedAt: r.updatedAt, sourceFile: r.sourceFile, cwd: r.cwd,
  }
}

/** What the old bug produced when another device re-uploaded `parent`. */
function echoOf(parent: SyncRecord, deviceInstanceId = parent.deviceInstanceId): SyncRecord {
  return {
    ...parent,
    id: generateSyncRecordId(deviceInstanceId, parent.sourceFile ?? '', 0),
    deviceInstanceId,
    sessionKey: generateSessionKey(parent.device, parent.sessionKey),
    updatedAt: parent.updatedAt + 1,
  }
}

const ndjson = (records: SyncRecord[]) => records.map(r => JSON.stringify(r)).join('\n') + '\n'

describe('sync repair', () => {
  let backend: FakeSyncBackend
  let dbA: Database.Database
  let locals: StatsRecord[]
  let wires: SyncRecord[]
  let echoesUnderB: SyncRecord[]
  let doubleEchoesUnderA: SyncRecord[]
  let bOwn: SyncRecord

  beforeEach(() => {
    backend = new FakeSyncBackend()
    dbA = new Database(':memory:')
    initializeDatabase(dbA)
    locals = [0, 1, 2, 3].map(localRecord)
    for (const r of locals) insertRecord(dbA, r)
    markRecordsSynced(dbA, locals.map(r => r.id), DAY + 1, 't') // A already uploaded them
    wires = locals.map(wireOf)

    // B's genuine record.
    bOwn = wireOf({ ...localRecord(7), id: 'b-7', deviceInstanceId: B, device: 'MSI', sourceFile: 'C:\\Users\\msi\\s.jsonl', sessionId: 'sess-b' })

    // Echo chain. Note every echo of the same file collapses to ONE id, so B's
    // namespace holds a single line standing in for all four originals.
    echoesUnderB = [echoOf(wires[3])]
    doubleEchoesUnderA = [echoOf(echoesUnderB[0])]
    // Also an 'unknown'-device echo (pre-init records that bounced).
    const unknownWire = { ...wires[1], id: generateSyncRecordId('unknown', FILE_A, 200), deviceInstanceId: 'unknown' }
    const unknownEcho = { ...echoOf(unknownWire, 'unknown') }

    backend.files.set(`${A}/2026/09/06.ndjson`, ndjson([...wires, unknownWire, ...doubleEchoesUnderA]))
    backend.files.set(`${B}/2026/09/06.ndjson`, ndjson([bOwn, ...echoesUnderB, unknownEcho]))

    // A's local DB as the old code left it: echoes pulled into synced_records
    // (own-device + 'unknown') and merged into records.
    for (const e of [...echoesUnderB, unknownEcho, bOwn]) insertSyncedRecord(dbA, e)
    mergeSyncedRecordsIntoRecords(dbA) // no device filter → old behaviour
  })

  it('classifies contamination deterministically without changing anything (dry run)', async () => {
    const before = { files: new Map(backend.files), records: dbA.prepare('SELECT COUNT(*) n FROM records').get(), synced: dbA.prepare('SELECT COUNT(*) n FROM synced_records').get() }

    const report = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, allNamespaces: true })

    expect(report.applied).toBe(false)
    expect(new Map(backend.files)).toEqual(before.files)
    expect(dbA.prepare('SELECT COUNT(*) n FROM records').get()).toEqual(before.records)
    expect(dbA.prepare('SELECT COUNT(*) n FROM synced_records').get()).toEqual(before.synced)

    const nsA = report.remote!.namespaces.find(n => n.owner === A)!
    const nsB = report.remote!.namespaces.find(n => n.owner === B)!
    // The pre-init 'unknown' line has no local counterpart: A's namespace is a
    // snapshot of A's database, so it is stale.
    expect(nsA).toMatchObject({ lines: 6, foreignLines: 0, echoLines: 1, staleLines: 1, duplicateLines: 0 })
    expect(nsB).toMatchObject({ lines: 3, foreignLines: 1, echoLines: 1, staleLines: 0, duplicateLines: 0 })
    // Own-device echo + 'unknown' chain echo in synced_records; B's own record untouched.
    expect(report.local.echoSyncedIds.sort()).toEqual([echoesUnderB[0].id, echoOf({ ...wires[1], id: '', deviceInstanceId: 'unknown' }, 'unknown').id].sort())
    expect(report.local.echoSyncedIds).not.toContain(bOwn.id)
    expect(report.local.echoMergedIds.sort()).toEqual(report.local.echoSyncedIds.slice().sort())
    expect(report.local.reflagRecordIds).toEqual([])
  })

  it('applies the repair: genuine records survive, echoes are removed, totals are exact', async () => {
    const report = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, allNamespaces: true, apply: true })
    expect(report.applied).toBe(true)
    expect(report.remoteResult).toMatchObject({ rewritten: 2, deleted: 0, flushed: true })

    // Remote: A keeps exactly its 4 local records (the orphaned 'unknown' line is stale); B keeps only its own.
    const linesA = backend.linesUnder(A)
    expect(linesA.map(l => l.id).sort()).toEqual(wires.map(w => w.id).sort())
    expect(backend.linesUnder(B).map(l => l.id)).toEqual([bOwn.id])

    // Local: only A's 4 local rows + B's genuine record remain.
    expect(dbA.prepare(`SELECT COUNT(*) n FROM records WHERE origin = 'local'`).get()).toEqual({ n: 4 })
    expect(dbA.prepare(`SELECT id FROM synced_records`).all()).toEqual([{ id: bOwn.id }])
    expect(dbA.prepare(`SELECT COUNT(*) n FROM records WHERE origin = 'synced'`).get()).toEqual({ n: 1 })

    const summary = generateSummary(dbA, { currentDeviceInstanceId: A })
    expect(summary.recordCount).toBe(5)
    expect(summary.deviceCount).toBe(2)

    // Idempotent: a second run finds nothing.
    const again = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, allNamespaces: true })
    expect(again.local).toMatchObject({ reflagRecordIds: [], echoSyncedIds: [], echoMergedIds: [] })
    expect(again.remote!.files).toEqual([])

    // And a normal sync afterwards is a no-op that re-creates nothing.
    const r = await new SyncOrchestrator(dbA, backend, { deviceInstanceId: A, target: 't', consentVerified: true }).sync()
    expect(r).toMatchObject({ status: 'ok', pulledCount: 0, uploadedCount: 0, mergedCount: 0, ignoredCount: 0 })
  })

  it('only rewrites this device\'s namespace unless --all-namespaces is given', async () => {
    const report = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, apply: true })
    expect(report.remote!.files.map(f => f.owner)).toEqual([A])
    expect(backend.linesUnder(B)).toHaveLength(3) // B's namespace untouched
  })

  it('deletes a remote file whose every line was contamination', async () => {
    backend.files.set(`${B}/2026/09/07.ndjson`, ndjson([echoOf(wires[0])]))
    const report = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, allNamespaces: true, apply: true })
    expect(report.remoteResult!.deleted).toBe(1)
    expect(backend.files.has(`${B}/2026/09/07.ndjson`)).toBe(false)
  })

  it('never flags a genuine record whose usage happens to match another', async () => {
    // Two different sessions with identical usage numbers are not echoes of each other.
    const chain = new SessionKeyChain()
    const twin = { ...wires[0], sessionKey: generateSessionKey('G14', 'another-session') }
    chain.add(wires[0].sessionKey)
    chain.add(twin.sessionKey)
    expect(chain.isEcho(wires[0])).toBe(false)
    expect(chain.isEcho(twin)).toBe(false)
    expect(chain.isEcho(echoOf(wires[0]))).toBe(true)
    // A genuine record from a different device alias is not an echo either.
    expect(chain.isEcho({ device: 'MSI', sessionKey: generateSessionKey('MSI', 'sess-a') })).toBe(false)
  })

  it('treats a line stamped with a concrete foreign device id as contamination even without a parent', async () => {
    const stray: SyncRecord = { ...bOwn, id: 'stray', deviceInstanceId: 'device-c', sessionKey: generateSessionKey('MSI', 'x') }
    backend.files.set(`${B}/2026/09/08.ndjson`, ndjson([stray]))
    const plan = await planRemoteRepair(backend, { deviceInstanceId: B })
    const file = plan.files.find(f => f.path === `${B}/2026/09/08.ndjson`)!
    expect(file).toMatchObject({ foreignLines: 1, echoLines: 0, keptRecords: [] })
  })
})
