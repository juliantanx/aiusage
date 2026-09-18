import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { generateRecordId, generateSyncRecordId } from '@aiusage/core'
import type { StatsRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord, deleteRecordsBySourceFile } from '../../src/db/records.js'
import { SyncOrchestrator } from '../../src/sync/index.js'
import { manifestPath, parseManifest } from '../../src/sync/manifest.js'
import { mapStatsRecordToSyncRecord } from '../../src/sync/mapper.js'
import { runParseAntigravity } from '../../src/commands/parse-antigravity.js'
import { generateSummary } from '../../src/commands/summary.js'
import { FakeSyncBackend } from './helpers/fake-backend.js'
import { createAntigravitySchema, seedAntigravityGenerations } from '../helpers/antigravity-fixture.js'

// Every device's remote namespace (`<deviceInstanceId>/YYYY/MM/DD.ndjson`) is
// an authoritative snapshot of that device's local-origin records. Upload
// replaces the namespace with the current local state; pull mirrors each
// foreign namespace exactly, removing rows that vanished remotely.

const A = '0a1b2c3d-1111-4aaa-8aaa-aaaaaaaaaaaa' // G14
const B = '0a1b2c3d-2222-4bbb-8bbb-bbbbbbbbbbbb' // MSI
const C = '0a1b2c3d-3333-4ccc-8ccc-cccccccccccc'
const TARGET = 'github:example/aiusage-data'
const OTHER_TARGET = 's3:example-bucket'
const FILE_A = 'C:\\Users\\alice\\.claude\\projects\\p\\session.jsonl'
const ANTIGRAVITY_DB = 'C:\\Users\\alice\\.gemini\\antigravity\\conversations\\session-1.db'
const DAY = Date.UTC(2026, 8, 6, 12, 0, 0)

function claudeRecord(deviceInstanceId: string, n: number, overrides: Partial<StatsRecord> = {}): StatsRecord {
  return {
    id: generateRecordId(deviceInstanceId, `msg_${n}`, 0),
    ts: DAY + n * 60_000,
    ingestedAt: DAY + 1_000_000,
    updatedAt: DAY + 1_000_000,
    lineOffset: 100 + n * 1234,
    tool: 'claude-code',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    inputTokens: 1000 + n,
    outputTokens: 500 + n,
    cacheReadTokens: 0,
    cacheWriteTokens: 200,
    thinkingTokens: 0,
    cost: 0.01 * (n + 1),
    costSource: 'pricing',
    sessionId: 'sess-a',
    sourceFile: FILE_A,
    cwd: 'C:\\proj',
    device: 'G14',
    deviceInstanceId,
    platform: 'win32',
    ...overrides,
  }
}

/** Two Antigravity records exactly as the parser emits them: same db, same generation index. */
function antigravityPair(deviceInstanceId: string): StatsRecord[] {
  return ['response:r-1', 'response:r-2'].map((identity, n) => ({
    ...claudeRecord(deviceInstanceId, n),
    id: generateRecordId(deviceInstanceId, `antigravity:session-1:${identity}`, 0),
    tool: 'antigravity' as const,
    model: 'gemini-2.5-pro',
    provider: 'google',
    lineOffset: 7,
    sessionId: 'session-1',
    sourceFile: ANTIGRAVITY_DB,
  }))
}

function newDb(): Database.Database {
  const db = new Database(':memory:')
  initializeDatabase(db)
  return db
}

function sync(db: Database.Database, backend: FakeSyncBackend, deviceInstanceId: string, target = TARGET) {
  return new SyncOrchestrator(db, backend, { deviceInstanceId, target, consentVerified: true }).sync()
}

function syncedIds(db: Database.Database, owner: string): string[] {
  return (db.prepare(`SELECT id FROM synced_records WHERE device_instance_id = ? ORDER BY id`).all(owner) as Array<{ id: string }>).map(r => r.id)
}

function mergedIds(db: Database.Database, owner: string): string[] {
  return (db.prepare(`SELECT id FROM records WHERE origin = 'synced' AND device_instance_id = ? ORDER BY id`).all(owner) as Array<{ id: string }>).map(r => r.id)
}

function deviceIds(db: Database.Database): string[] {
  const rows = db.prepare(`
    SELECT device_instance_id AS d FROM records
    UNION SELECT device_instance_id AS d FROM synced_records
  `).all() as Array<{ d: string }>
  return rows.map(r => r.d).sort()
}

describe('Antigravity wire ids', () => {
  let backend: FakeSyncBackend
  let dbA: Database.Database
  let dbB: Database.Database

  beforeEach(() => {
    backend = new FakeSyncBackend()
    dbA = newDb()
    dbB = newDb()
  })

  it('keeps two records with the same sourceFile and lineOffset distinct through upload and pull', async () => {
    const pair = antigravityPair(A)
    for (const r of pair) insertRecord(dbA, r)
    expect(pair[0].id).not.toBe(pair[1].id)
    // The old wire id collapsed both records into one.
    expect(generateSyncRecordId(A, pair[0].sourceFile, pair[0].lineOffset))
      .toBe(generateSyncRecordId(A, pair[1].sourceFile, pair[1].lineOffset))

    const a = await sync(dbA, backend, A)
    expect(a.status).toBe('ok')
    expect(a.uploadedCount).toBe(2)
    const lines = backend.linesUnder(A)
    expect(lines).toHaveLength(2)
    expect(lines.map(l => l.id).sort()).toEqual(pair.map(r => r.id).sort())

    const b = await sync(dbB, backend, B)
    expect(b.pulledCount).toBe(2)
    expect(syncedIds(dbB, A)).toEqual(pair.map(r => r.id).sort())
    expect(generateSummary(dbB, { currentDeviceInstanceId: B }).recordCount).toBe(2)
  })

  it('maps all 972 parser records to 972 distinct wire ids', () => {
    const conversation = new Database(':memory:')
    createAntigravitySchema(conversation)
    // 324 generations x (1 usage + 2 retries) = 972 records sharing 324 line offsets.
    seedAntigravityGenerations(conversation, 324, 2, DAY)
    const parsed = runParseAntigravity(conversation, {
      dbPath: ANTIGRAVITY_DB,
      device: 'G14',
      deviceInstanceId: A,
      now: DAY,
      fallbackTs: DAY,
      startIndex: 0,
    })
    conversation.close()
    expect(parsed.errors).toEqual([])
    expect(parsed.records).toHaveLength(972)
    expect(new Set(parsed.records.map(r => r.id)).size).toBe(972)
    expect(new Set(parsed.records.map(r => `${r.sourceFile}:${r.lineOffset}`)).size).toBe(324)

    const wireIds = parsed.records.map(r => mapStatsRecordToSyncRecord(r).id)
    expect(new Set(wireIds).size).toBe(972)
  })

  it('uploads all 972 parser records as 972 remote lines', async () => {
    const conversation = new Database(':memory:')
    createAntigravitySchema(conversation)
    seedAntigravityGenerations(conversation, 324, 2, DAY)
    const parsed = runParseAntigravity(conversation, {
      dbPath: ANTIGRAVITY_DB, device: 'G14', deviceInstanceId: A, now: DAY, fallbackTs: DAY, startIndex: 0,
    })
    conversation.close()
    for (const r of parsed.records) insertRecord(dbA, r)

    const a = await sync(dbA, backend, A)
    expect(a.status).toBe('ok')
    expect(a.uploadedCount).toBe(972)
    expect(backend.linesUnder(A)).toHaveLength(972)

    const b = await sync(dbB, backend, B)
    expect(b.pulledCount).toBe(972)
    expect(generateSummary(dbB, { currentDeviceInstanceId: B }).recordCount).toBe(972)
  })
})

describe('authoritative device namespaces', () => {
  let backend: FakeSyncBackend
  let dbA: Database.Database
  let dbB: Database.Database
  let recordsA: StatsRecord[]

  beforeEach(() => {
    backend = new FakeSyncBackend()
    dbA = newDb()
    dbB = newDb()
    recordsA = [0, 1, 2, 3].map(n => claudeRecord(A, n))
    for (const r of recordsA) insertRecord(dbA, r)
  })

  it('rebuilding device A with new record ids retires the old ids remotely and on device B', async () => {
    await sync(dbA, backend, A)
    await sync(dbB, backend, B)
    const oldWireIds = backend.linesUnder(A).map(l => l.id).sort()
    expect(syncedIds(dbB, A)).toEqual(oldWireIds)

    // A's cache is rebuilt: same usage, different local ids and byte offsets
    // (as after an id-algorithm change), so every wire id changes.
    deleteRecordsBySourceFile(dbA, FILE_A)
    const rebuilt = [0, 1, 2, 3].map(n => claudeRecord(A, n, {
      id: generateRecordId(A, `msg_${n}`, 1),
      lineOffset: 5000 + n * 999,
      updatedAt: DAY + 2_000_000,
    }))
    for (const r of rebuilt) insertRecord(dbA, r)

    const a = await sync(dbA, backend, A)
    expect(a.status).toBe('ok')
    const newWireIds = backend.linesUnder(A).map(l => l.id).sort()
    expect(newWireIds).toHaveLength(4)
    expect(newWireIds.some(id => oldWireIds.includes(id))).toBe(false)

    const b = await sync(dbB, backend, B)
    expect(b.status).toBe('ok')
    expect(b.prunedCount).toBe(4)
    expect(syncedIds(dbB, A)).toEqual(newWireIds)
    expect(mergedIds(dbB, A)).toEqual(newWireIds)
    expect(generateSummary(dbB, { currentDeviceInstanceId: B }).recordCount).toBe(4)
    expect(generateSummary(dbB, { currentDeviceInstanceId: B }).totalTokens)
      .toBe(generateSummary(dbA, { currentDeviceInstanceId: A }).totalTokens)
  })

  it('deleting a local record on device A removes it from device B', async () => {
    await sync(dbA, backend, A)
    await sync(dbB, backend, B)
    expect(syncedIds(dbB, A)).toHaveLength(4)

    const removed = recordsA[2]
    dbA.prepare(`DELETE FROM records WHERE id = ?`).run(removed.id)
    const removedWireId = mapStatsRecordToSyncRecord(removed).id

    const a = await sync(dbA, backend, A)
    expect(a.status).toBe('ok')
    expect(a.retiredCount).toBe(1)
    expect(backend.linesUnder(A).map(l => l.id)).not.toContain(removedWireId)
    expect(backend.linesUnder(A)).toHaveLength(3)

    const b = await sync(dbB, backend, B)
    expect(b.prunedCount).toBe(1)
    expect(syncedIds(dbB, A)).not.toContain(removedWireId)
    expect(mergedIds(dbB, A)).not.toContain(removedWireId)
    expect(generateSummary(dbB, { currentDeviceInstanceId: B }).recordCount).toBe(3)
  })

  it('deletes the day file (and the manifest) when every record of that day is gone', async () => {
    await sync(dbA, backend, A)
    expect([...backend.files.keys()].sort()).toEqual([`${A}/2026/09/06.ndjson`, `${A}/manifest.json`])
    dbA.prepare(`DELETE FROM records`).run()
    const a = await sync(dbA, backend, A)
    expect(a.status).toBe('ok')
    expect(backend.files.size).toBe(0)
    // An empty manifest is published first (a peer never finds a manifest
    // naming a missing file, nor a manifest-less leftover), the day file is
    // deleted next, and the empty manifest is removed last.
    const lastWrite = backend.writes[backend.writes.length - 1]
    expect(lastWrite.path).toBe(manifestPath(A))
    expect(parseManifest(lastWrite.content)).toEqual({ version: 1, files: {} })
    expect(backend.deletes).toEqual([`${A}/2026/09/06.ndjson`, `${A}/manifest.json`])
  })

  it('is idempotent: a second sync without changes performs zero writes', async () => {
    insertRecord(dbB, claudeRecord(B, 0, { device: 'MSI', sessionId: 'sess-b', sourceFile: 'C:\\Users\\msi\\s.jsonl' }))
    await sync(dbA, backend, A)
    await sync(dbB, backend, B)
    await sync(dbA, backend, A)
    const snapshot = new Map(backend.files)
    const mutations = backend.mutations.length

    for (const [db, dev] of [[dbA, A], [dbB, B], [dbA, A], [dbB, B]] as const) {
      const r = await sync(db, backend, dev)
      expect(r.status).toBe('ok')
      expect(r.uploadedCount).toBe(0)
      expect(r.pulledCount).toBe(0)
      expect(r.mergedCount).toBe(0)
      expect(r.prunedCount ?? 0).toBe(0)
      expect(r.retiredCount ?? 0).toBe(0)
    }
    expect(backend.mutations.length).toBe(mutations)
    expect(new Map(backend.files)).toEqual(snapshot)
  })

  it('does not rewrite a file whose remote content already matches, even in another line order', async () => {
    await sync(dbA, backend, A)
    const path = `${A}/2026/09/06.ndjson`
    const reversed = backend.files.get(path)!.split('\n').filter(Boolean).reverse().join('\n') + '\n'
    backend.files.set(path, reversed)
    const before = backend.mutations.length
    await sync(dbA, backend, A)
    expect(backend.mutations.length).toBe(before)
    expect(backend.files.get(path)).toBe(reversed)
  })

  it('never writes to or deletes from the namespace of another device', async () => {
    // B owns a namespace with a line A would consider stale, plus a day A has no data for.
    insertRecord(dbB, claudeRecord(B, 0, { device: 'MSI', sessionId: 'sess-b', sourceFile: 'C:\\Users\\msi\\s.jsonl' }))
    await sync(dbB, backend, B)
    backend.files.set(`${B}/2026/01/01.ndjson`, JSON.stringify({ ...backend.linesUnder(B)[0], id: 'stale-in-b', ts: Date.UTC(2026, 0, 1) }) + '\n')
    const filesB = new Map([...backend.files].filter(([p]) => p.startsWith(`${B}/`)))

    // A's database also holds rows stamped with B's id (a pulled copy that lost
    // its provenance) and pre-init rows: none of them may leak into B's files.
    insertRecord(dbA, claudeRecord(B, 7, { origin: 'local', device: 'MSI' }))
    insertRecord(dbA, claudeRecord('unknown', 8))

    const before = backend.mutations.length
    const a = await sync(dbA, backend, A)
    expect(a.status).toBe('ok')
    const touched = backend.mutations.slice(before)
    expect(touched.length).toBeGreaterThan(0)
    for (const path of touched) expect(path.startsWith(`${A}/`)).toBe(true)
    for (const [path, content] of filesB) expect(backend.files.get(path)).toBe(content)
    expect(backend.linesUnder(B).some(l => l.deviceInstanceId === A || l.deviceInstanceId === 'unknown')).toBe(false)
  })

  it('migrates legacy local rows stamped "unknown" to the current device without exposing a third device', async () => {
    insertRecord(dbA, claudeRecord('unknown', 9))
    insertRecord(dbA, claudeRecord('unknown', 10))

    const a = await sync(dbA, backend, A)
    expect(a.status).toBe('ok')
    expect(a.uploadedCount).toBe(6)
    expect(dbA.prepare(`SELECT COUNT(*) AS n FROM records WHERE device_instance_id = 'unknown'`).get()).toEqual({ n: 0 })
    const lines = backend.linesUnder(A)
    expect(lines).toHaveLength(6)
    expect(lines.every(l => l.deviceInstanceId === A)).toBe(true)

    // A legacy namespace line written by an old client still carries 'unknown'.
    backend.files.set(`${C}/2026/09/06.ndjson`, JSON.stringify({
      ...mapStatsRecordToSyncRecord(claudeRecord(C, 0, { device: 'old-laptop' })),
      deviceInstanceId: 'unknown',
    }) + '\n')

    const b = await sync(dbB, backend, B)
    expect(b.status).toBe('ok')
    expect(b.pulledCount).toBe(7)
    expect(deviceIds(dbB)).toEqual([A, C])
    expect(syncedIds(dbB, C)).toHaveLength(1)
    expect(mergedIds(dbB, C)).toHaveLength(1)
  })

  it('never relabels or uploads rows genuinely owned by another device', async () => {
    await sync(dbA, backend, A)
    await sync(dbB, backend, B)
    // Pulled copies of A's rows now live in B's records table (origin = synced).
    expect(mergedIds(dbB, A)).toHaveLength(4)
    insertRecord(dbB, claudeRecord(B, 0, { device: 'MSI', sessionId: 'sess-b', sourceFile: 'C:\\Users\\msi\\s.jsonl' }))

    const b = await sync(dbB, backend, B)
    expect(b.uploadedCount).toBe(1)
    const linesB = backend.linesUnder(B)
    expect(linesB).toHaveLength(1)
    expect(linesB[0].deviceInstanceId).toBe(B)
    expect(dbB.prepare(`SELECT COUNT(*) AS n FROM records WHERE device_instance_id = ? AND origin = 'synced'`).get(A)).toEqual({ n: 4 })
    expect(dbB.prepare(`SELECT COUNT(*) AS n FROM records WHERE device_instance_id = ? AND origin = 'local'`).get(A)).toEqual({ n: 0 })
  })

  it('never re-uploads synced copies as local records, even after their origin flag was lost', async () => {
    await sync(dbA, backend, A)
    await sync(dbB, backend, B)
    // Corrupt B's provenance the way the pre-v13 bug did.
    dbB.prepare(`UPDATE records SET origin = 'local' WHERE device_instance_id = ?`).run(A)

    const b = await sync(dbB, backend, B)
    expect(b.status).toBe('ok')
    expect(b.repairedCount).toBe(4)
    expect(b.uploadedCount).toBe(0)
    expect(backend.linesUnder(B)).toHaveLength(0)
    expect(backend.linesUnder(A)).toHaveLength(4)
    for (const path of backend.mutations) expect(path.startsWith(`${A}/`)).toBe(true)
  })

  it('survives concurrent syncs from two devices without losing either namespace', async () => {
    insertRecord(dbB, claudeRecord(B, 0, { device: 'MSI', sessionId: 'sess-b', sourceFile: 'C:\\Users\\msi\\s.jsonl' }))
    const [a, b] = await Promise.all([sync(dbA, backend, A), sync(dbB, backend, B)])
    expect(a.status).toBe('ok')
    expect(b.status).toBe('ok')
    expect(backend.linesUnder(A)).toHaveLength(4)
    expect(backend.linesUnder(B)).toHaveLength(1)

    const [a2, b2] = await Promise.all([sync(dbA, backend, A), sync(dbB, backend, B)])
    expect(a2.status).toBe('ok')
    expect(b2.status).toBe('ok')
    expect(backend.linesUnder(A)).toHaveLength(4)
    expect(backend.linesUnder(B)).toHaveLength(1)
    expect(generateSummary(dbA, { currentDeviceInstanceId: A }).recordCount).toBe(5)
    expect(generateSummary(dbB, { currentDeviceInstanceId: B }).recordCount).toBe(5)
  })

  it('keeps local (parsed) records untouched when a peer namespace disappears', async () => {
    await sync(dbA, backend, A)
    await sync(dbB, backend, B)
    for (const path of [...backend.files.keys()]) if (path.startsWith(`${A}/`)) backend.files.delete(path)

    const b = await sync(dbB, backend, B)
    expect(b.prunedCount).toBe(4)
    expect(syncedIds(dbB, A)).toHaveLength(0)
    expect(mergedIds(dbB, A)).toHaveLength(0)
    expect(dbA.prepare(`SELECT COUNT(*) AS n FROM records WHERE origin = 'local'`).get()).toEqual({ n: 4 })
  })

  it('keeps a record while any target still claims it, and prunes it once every claim is gone', async () => {
    await sync(dbA, backend, A)
    await sync(dbB, backend, B)
    expect(syncedIds(dbB, A)).toHaveLength(4)

    // B switches to a different target that has never carried A's namespace.
    const other = new FakeSyncBackend()
    const b = await sync(dbB, other, B, OTHER_TARGET)
    expect(b.status).toBe('ok')
    expect(b.prunedCount ?? 0).toBe(0)
    expect(syncedIds(dbB, A)).toHaveLength(4)

    // A publishes on the other target too, then removes one record there.
    await sync(dbA, other, A, OTHER_TARGET)
    await sync(dbB, other, B, OTHER_TARGET)
    const removed = mapStatsRecordToSyncRecord(recordsA[0]).id
    dbA.prepare(`DELETE FROM records WHERE id = ?`).run(recordsA[0].id)
    await sync(dbA, other, A, OTHER_TARGET)

    // The first target still claims the record: reconciling the other must not delete it.
    const b2 = await sync(dbB, other, B, OTHER_TARGET)
    expect(b2.status).toBe('ok')
    expect(b2.prunedCount ?? 0).toBe(0)
    expect(syncedIds(dbB, A)).toContain(removed)
    expect(mergedIds(dbB, A)).toContain(removed)

    // Once A's namespace on the first target drops it as well, it goes.
    await sync(dbA, backend, A)
    const b3 = await sync(dbB, backend, B)
    expect(b3.prunedCount).toBe(1)
    expect(syncedIds(dbB, A)).toHaveLength(3)
    expect(mergedIds(dbB, A)).toHaveLength(3)
  })
})
