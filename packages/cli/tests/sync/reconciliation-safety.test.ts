import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { generateRecordId } from '@aiusage/core'
import type { StatsRecord, SyncRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { getClaimingTargets, getNamespaceVerdicts } from '../../src/db/sync-claims.js'
import { SyncOrchestrator, serializeSnapshot } from '../../src/sync/index.js'
import { buildManifest, manifestPath, parseManifest, serializeManifest } from '../../src/sync/manifest.js'
import { mapStatsRecordToSyncRecord } from '../../src/sync/mapper.js'
import { FakeSyncBackend } from './helpers/fake-backend.js'

// Authoritative reconciliation is destructive, so it must fail closed: no
// backend failure, no half-written namespace and no malformed file may ever
// be read as "the owner deleted these records".

const A = 'device-a'
const B = 'device-b'
const C = 'device-c'
const TARGET = 'github:example/repo'
const DAY6 = Date.UTC(2026, 8, 6, 12, 0, 0)
const DAY7 = Date.UTC(2026, 8, 7, 12, 0, 0)

function local(owner: string, n: number, overrides: Partial<StatsRecord> = {}): StatsRecord {
  return {
    id: generateRecordId(owner, `msg_${n}`, 0),
    ts: DAY6 + n * 60_000,
    ingestedAt: DAY6,
    updatedAt: DAY6,
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
    sessionId: `sess-${owner}`,
    sourceFile: `C:\\Users\\${owner}\\.claude\\projects\\p\\s.jsonl`,
    cwd: 'C:\\proj',
    device: owner.toUpperCase(),
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

function sync(db: Database.Database, backend: FakeSyncBackend, deviceInstanceId: string) {
  return new SyncOrchestrator(db, backend, { deviceInstanceId, target: TARGET, consentVerified: true, knownTargets: [TARGET] }).sync()
}

const syncedIds = (db: Database.Database, owner: string) =>
  (db.prepare(`SELECT id FROM synced_records WHERE device_instance_id = ? ORDER BY id`).all(owner) as Array<{ id: string }>).map(r => r.id)
const mergedCount = (db: Database.Database, owner: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM records WHERE origin = 'synced' AND device_instance_id = ?`).get(owner) as { n: number }).n
const ndjson = (records: SyncRecord[]) => records.map(r => JSON.stringify(r)).join('\n') + '\n'

/** A backend whose next operations fail, or whose writes stop after a budget. */
class FlakyBackend extends FakeSyncBackend {
  listError: Error | null = null
  readErrors = new Map<string, Error>()
  /** Paths that are listed but vanish when read (S3: deleted between LIST and GET). */
  vanished = new Set<string>()
  /** Number of writes still allowed before writeFile throws. */
  writeBudget = Infinity
  /** Number of deletions still allowed before deleteFile throws. */
  deleteBudget = Infinity

  override async listFiles(): Promise<string[]> {
    if (this.listError) throw this.listError
    return super.listFiles()
  }

  override async readFile(path: string): Promise<string | null> {
    const error = this.readErrors.get(path)
    if (error) throw error
    if (this.vanished.has(path)) return null
    return super.readFile(path)
  }

  override async writeFile(path: string, content: string): Promise<void> {
    if (this.writeBudget <= 0) throw new Error('simulated network failure during PutObject')
    this.writeBudget--
    return super.writeFile(path, content)
  }

  override async deleteFile(path: string): Promise<void> {
    if (this.deleteBudget <= 0) throw new Error('simulated network failure during DeleteObject')
    this.deleteBudget--
    return super.deleteFile(path)
  }
}

describe('destructive reconciliation fails closed', () => {
  let backend: FlakyBackend
  let dbA: Database.Database
  let dbB: Database.Database
  let dbC: Database.Database
  let wiresA: SyncRecord[]

  beforeEach(async () => {
    backend = new FlakyBackend()
    dbA = newDb()
    dbB = newDb()
    dbC = newDb()
    const recordsA = [0, 1, 2].map(n => local(A, n))
    const recordsC = [0, 1].map(n => local(C, n))
    for (const r of recordsA) insertRecord(dbA, r)
    for (const r of recordsC) insertRecord(dbC, r)
    wiresA = recordsA.map(mapStatsRecordToSyncRecord)
    await sync(dbA, backend, A)
    await sync(dbC, backend, C)
    await sync(dbB, backend, B)
    expect(syncedIds(dbB, A)).toHaveLength(3)
    expect(syncedIds(dbB, C)).toHaveLength(2)
  })

  it('aborts the sync when the listing fails, without pruning anything', async () => {
    backend.listError = new Error('LIST failed')
    const b = await sync(dbB, backend, B)
    expect(b.status).toBe('failed')
    expect(b.error).toBe('LIST failed')
    expect(syncedIds(dbB, A)).toHaveLength(3)
    expect(syncedIds(dbB, C)).toHaveLength(2)
    expect(mergedCount(dbB, A)).toBe(3)
    expect(backend.mutations.filter(p => p.startsWith(`${B}/`))).toEqual([])
  })

  it('aborts the sync when the local database fails during the pull, before anything is reconciled', async () => {
    // A drops one record and adds another; inserting the new one fails locally.
    dbA.prepare(`DELETE FROM records WHERE id = ?`).run(local(A, 1).id)
    insertRecord(dbA, local(A, 3))
    await sync(dbA, backend, A)
    const dropped = wiresA[1].id
    const added = mapStatsRecordToSyncRecord(local(A, 3)).id
    dbB.exec(`CREATE TRIGGER boom BEFORE INSERT ON synced_records WHEN NEW.id = '${added}' BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END`)

    const failed = await sync(dbB, backend, B)
    expect(failed.status).toBe('failed')
    expect(failed.error).toContain('simulated disk failure')
    expect(syncedIds(dbB, A)).toContain(dropped)
    expect(syncedIds(dbB, A)).toHaveLength(3)
    expect(mergedCount(dbB, A)).toBe(3)
    expect(syncedIds(dbB, C)).toHaveLength(2)
    expect(backend.mutations.filter(p => p.startsWith(`${B}/`))).toEqual([])

    // Once the database works again the sync converges.
    dbB.exec(`DROP TRIGGER boom`)
    const recovered = await sync(dbB, backend, B)
    expect(recovered.status).toBe('ok')
    expect(recovered.prunedCount).toBe(1)
    expect(syncedIds(dbB, A)).not.toContain(dropped)
    expect(syncedIds(dbB, A)).toContain(added)
    expect(syncedIds(dbB, A)).toHaveLength(3)
  })

  it('aborts the sync when one file of a multi-file namespace cannot be read', async () => {
    // A now spans two day files; B has both mirrored.
    insertRecord(dbA, local(A, 9, { ts: DAY7 }))
    await sync(dbA, backend, A)
    await sync(dbB, backend, B)
    expect(syncedIds(dbB, A)).toHaveLength(4)

    // Meanwhile A retires a record (so a naive reconcile would prune something).
    dbA.prepare(`DELETE FROM records WHERE id = ?`).run(local(A, 0).id)
    await sync(dbA, backend, A)

    backend.readErrors.set(`${A}/2026/09/07.ndjson`, new Error('EACCES'))
    const b = await sync(dbB, backend, B)
    expect(b.status).toBe('failed')
    expect(b.error).toBe('EACCES')
    expect(syncedIds(dbB, A)).toHaveLength(4)
    expect(mergedCount(dbB, A)).toBe(4)

    // Once the file is readable again the sync converges normally.
    backend.readErrors.clear()
    const b2 = await sync(dbB, backend, B)
    expect(b2.status).toBe('ok')
    expect(b2.prunedCount).toBe(1)
    expect(syncedIds(dbB, A)).toHaveLength(3)
  })

  it('skips a namespace whose listed file vanished before it could be read, and still reconciles the others', async () => {
    dbA.prepare(`DELETE FROM records WHERE id = ?`).run(local(A, 0).id)
    await sync(dbA, backend, A)
    dbC.prepare(`DELETE FROM records WHERE id = ?`).run(local(C, 0).id)
    await sync(dbC, backend, C)

    backend.vanished.add(`${A}/2026/09/06.ndjson`)
    const b = await sync(dbB, backend, B)
    expect(b.status).toBe('ok')
    expect(b.skippedNamespaces).toBe(1)
    expect(syncedIds(dbB, A)).toHaveLength(3) // untouched
    expect(syncedIds(dbB, C)).toHaveLength(1) // reconciled
    expect(b.prunedCount).toBe(1)

    backend.vanished.clear()
    const b2 = await sync(dbB, backend, B)
    expect(b2.skippedNamespaces).toBe(0)
    expect(b2.prunedCount).toBe(1)
    expect(syncedIds(dbB, A)).toHaveLength(2)
  })

  it('skips a namespace containing a malformed line but keeps the lines that parsed', async () => {
    const extra = { ...wiresA[0], id: 'a-extra-line', updatedAt: wiresA[0].updatedAt + 1 }
    const path = `${A}/2026/09/06.ndjson`
    backend.files.set(path, backend.files.get(path)! + JSON.stringify(extra) + '\n' + '{"id": "truncated", "ts": 12\n')
    const b = await sync(dbB, backend, B)
    expect(b.status).toBe('ok')
    expect(b.skippedNamespaces).toBe(1)
    expect(b.prunedCount ?? 0).toBe(0)
    expect(syncedIds(dbB, A)).toContain('a-extra-line')
    expect(syncedIds(dbB, A)).toHaveLength(4)

    // A's next sync canonicalises its file (malformed line dropped, stale line retired); B converges.
    const a = await sync(dbA, backend, A)
    expect(a.retiredCount).toBe(1)
    expect(a.writtenFiles).toBe(1)
    const b2 = await sync(dbB, backend, B)
    expect(b2.skippedNamespaces).toBe(0)
    expect(b2.prunedCount).toBe(1)
    expect(syncedIds(dbB, A)).toEqual(wiresA.map(w => w.id).sort())
  })

  it('skips a namespace whose manifest cannot be parsed or does not match its files', async () => {
    dbA.prepare(`DELETE FROM records WHERE id = ?`).run(local(A, 0).id)
    await sync(dbA, backend, A)
    const good = backend.files.get(manifestPath(A))!

    backend.files.set(manifestPath(A), '{ not json')
    let b = await sync(dbB, backend, B)
    expect(b).toMatchObject({ status: 'ok', skippedNamespaces: 1, prunedCount: 0 })
    expect(syncedIds(dbB, A)).toHaveLength(3)

    // A manifest describing a different file content (e.g. the owner crashed after rewriting the file).
    const stale = parseManifest(good)!
    stale.files['2026/09/06.ndjson'].digest = 'f'.repeat(32)
    backend.files.set(manifestPath(A), serializeManifest(stale))
    b = await sync(dbB, backend, B)
    expect(b).toMatchObject({ status: 'ok', skippedNamespaces: 1, prunedCount: 0 })
    expect(syncedIds(dbB, A)).toHaveLength(3)

    backend.files.set(manifestPath(A), good)
    b = await sync(dbB, backend, B)
    expect(b).toMatchObject({ status: 'ok', skippedNamespaces: 0, prunedCount: 1 })
    expect(syncedIds(dbB, A)).toHaveLength(2)
  })

  it('never lets a peer prune against a partially rewritten S3 namespace when a record moves between day files', async () => {
    // A's record 1 gets a later timestamp on the origin device (a re-parse
    // that corrected it), so it moves from the 06 file to a new 07 file.
    const moved = local(A, 1, { ts: DAY7, updatedAt: DAY6 + 1 })
    const movedWireId = mapStatsRecordToSyncRecord(moved).id
    insertRecord(dbA, moved)
    expect(syncedIds(dbB, A)).toContain(movedWireId)

    // The owner's upload is interrupted after rewriting 06 (now without the
    // record) and before 07 exists: at this instant the record is in no file.
    backend.writeBudget = 1
    const a = await sync(dbA, backend, A)
    expect(a.status).toBe('failed')
    expect(backend.files.has(`${A}/2026/09/07.ndjson`)).toBe(false)
    expect(backend.linesUnder(A).map(l => l.id)).not.toContain(movedWireId)

    // The manifest still describes the previous snapshot, so the peer sees a
    // mismatch and keeps everything.
    backend.writeBudget = Infinity
    const b = await sync(dbB, backend, B)
    expect(b).toMatchObject({ status: 'ok', skippedNamespaces: 1, prunedCount: 0 })
    expect(syncedIds(dbB, A)).toContain(movedWireId)
    expect(mergedCount(dbB, A)).toBe(3)

    // Interrupted again, this time after the new file but before the manifest.
    backend.writeBudget = 1
    const a2 = await sync(dbA, backend, A)
    expect(a2.status).toBe('failed')
    expect(backend.files.has(`${A}/2026/09/07.ndjson`)).toBe(true)
    backend.writeBudget = Infinity
    const b2 = await sync(dbB, backend, B)
    expect(b2).toMatchObject({ status: 'ok', skippedNamespaces: 1, prunedCount: 0 })
    expect(syncedIds(dbB, A)).toHaveLength(3)

    // The owner completes; the peer verifies the manifest and converges.
    const a3 = await sync(dbA, backend, A)
    expect(a3.status).toBe('ok')
    expect(parseManifest(backend.files.get(manifestPath(A))!)!.files).toHaveProperty('2026/09/07.ndjson')
    const b3 = await sync(dbB, backend, B)
    expect(b3).toMatchObject({ status: 'ok', skippedNamespaces: 0, prunedCount: 0 })
    expect(syncedIds(dbB, A)).toHaveLength(3)
    expect(syncedIds(dbB, A)).toContain(movedWireId)
    expect(dbB.prepare(`SELECT ts FROM synced_records WHERE id = ?`).get(movedWireId)).toEqual({ ts: DAY7 })

    // Repeated syncs after the failures are no-ops.
    for (let i = 0; i < 3; i++) {
      const mutations = backend.mutations.length
      const ra = await sync(dbA, backend, A)
      const rb = await sync(dbB, backend, B)
      expect(ra).toMatchObject({ status: 'ok', writtenFiles: 0, retiredCount: 0 })
      expect(rb).toMatchObject({ status: 'ok', pulledCount: 0, prunedCount: 0, skippedNamespaces: 0 })
      expect(backend.mutations.length).toBe(mutations)
    }
  })

  it('publishes an empty manifest before deleting the last day files, so an interrupted wipe is never read as a legacy namespace', async () => {
    // A drops every local record; its upload is interrupted after the manifest
    // and before the day file could be deleted.
    dbA.prepare(`DELETE FROM records WHERE origin = 'local'`).run()
    backend.deleteBudget = 0
    const a = await sync(dbA, backend, A)
    expect(a.status).toBe('failed')
    expect(backend.files.has(`${A}/2026/09/06.ndjson`)).toBe(true)
    expect(parseManifest(backend.files.get(manifestPath(A))!)).toEqual({ version: 1, files: {} })

    // The leftover file is not named by the manifest: the peer mirrors the
    // empty snapshot instead of keeping the stale rows as a legacy namespace.
    const b = await sync(dbB, backend, B)
    expect(b).toMatchObject({ status: 'ok', skippedNamespaces: 0, prunedCount: 3 })
    expect(syncedIds(dbB, A)).toEqual([])
    expect(mergedCount(dbB, A)).toBe(0)

    // The owner completes: the day file goes, then the empty manifest.
    backend.deleteBudget = Infinity
    const a2 = await sync(dbA, backend, A)
    expect(a2.status).toBe('ok')
    expect([...backend.files.keys()].filter(p => p.startsWith(`${A}/`))).toEqual([])
    expect(backend.deletes).toEqual([`${A}/2026/09/06.ndjson`, manifestPath(A)])
    const b2 = await sync(dbB, backend, B)
    expect(b2).toMatchObject({ status: 'ok', prunedCount: 0, skippedNamespaces: 0 })
    expect(syncedIds(dbB, A)).toEqual([])
    const a3 = await sync(dbA, backend, A)
    expect(a3).toMatchObject({ status: 'ok', writtenFiles: 0 })
  })

  it('never prunes unclaimed legacy "unknown" rows while any namespace could not be read reliably', async () => {
    // Two rows B mirrored before claims existed (migration v14): a line of C
    // that an old client had written stamped 'unknown', and one that is
    // genuinely stale (its id is published nowhere any more).
    const cId = syncedIds(dbB, C)[0]
    dbB.prepare(`DELETE FROM sync_record_claims WHERE record_id = ?`).run(cId)
    dbB.prepare(`UPDATE synced_records SET device_instance_id = 'unknown' WHERE id = ?`).run(cId)
    dbB.prepare(`UPDATE records SET device_instance_id = 'unknown' WHERE id = ?`).run(cId)
    dbB.prepare(`INSERT INTO synced_records (id, ts, tool, model, provider, session_key, device, device_instance_id, updated_at, unclaimed_since) VALUES ('stale-unknown', ?, 't', 'm', 'p', 'k', 'X', 'unknown', ?, 0)`).run(DAY6, DAY6)
    // Like a device that has not synced since the upgrade: no verdict yet.
    dbB.prepare(`DELETE FROM sync_namespace_verdicts`).run()
    const unknownIds = (db: Database.Database) => syncedIds(db, 'unknown')
    expect(unknownIds(dbB)).toEqual([cId, 'stale-unknown'].sort())

    // C's namespace cannot be trusted this time (a malformed line): the
    // rows it may still hold have not been relabelled or claimed, so none of
    // the unclaimed 'unknown' rows may go.
    const pathC = `${C}/2026/09/06.ndjson`
    const good = backend.files.get(pathC)!
    backend.files.set(pathC, good + '{"id": "truncated\n')
    let b = await sync(dbB, backend, B)
    expect(b).toMatchObject({ status: 'ok', skippedNamespaces: 1, prunedCount: 0 })
    expect(unknownIds(dbB)).toEqual([cId, 'stale-unknown'].sort())

    // Once every namespace reads reliably, the line C still publishes is
    // attributed to C and claimed; only the stale row is dropped.
    backend.files.set(pathC, good)
    b = await sync(dbB, backend, B)
    expect(b).toMatchObject({ status: 'ok', skippedNamespaces: 0, prunedCount: 1 })
    expect(unknownIds(dbB)).toEqual([])
    expect(syncedIds(dbB, C)).toContain(cId)
    expect(getClaimingTargets(dbB, cId)).toEqual([TARGET])
    expect(dbB.prepare(`SELECT device_instance_id FROM records WHERE id = ?`).get(cId)).toEqual({ device_instance_id: C })
  })

  it('ignores an .ndjson file outside any namespace folder instead of reading it as a namespace', async () => {
    // `data/notes.ndjson` has no owner; treating its name as one would make
    // pull read `notes.ndjson/manifest.json`, which a real backend refuses
    // (ENOTDIR) — and every sync would fail while the file is there.
    backend.files.set('notes.ndjson', 'not a namespace\n')
    backend.readErrors.set('notes.ndjson/manifest.json', new Error("Cannot read 'notes.ndjson/manifest.json' in the GitHub sync cache (ENOTDIR)"))
    const b = await sync(dbB, backend, B)
    expect(b).toMatchObject({ status: 'ok', skippedNamespaces: 0 })
    expect(syncedIds(dbB, A)).toHaveLength(3)
    expect(syncedIds(dbB, C)).toHaveLength(2)
    expect(syncedIds(dbB, 'notes.ndjson')).toEqual([])
    expect(getNamespaceVerdicts(dbB, 'notes.ndjson').size).toBe(0)
    expect(backend.files.get('notes.ndjson')).toBe('not a namespace\n')
    expect(backend.mutations).not.toContain('notes.ndjson')
  })

  it('ignores day files the manifest does not name (left behind by an interrupted deletion)', async () => {
    // Manifest written, deletion of the retired file never happened.
    const leftover = { ...wiresA[0], id: 'a-leftover', ts: DAY7 }
    backend.files.set(`${A}/2026/09/07.ndjson`, ndjson([leftover]))
    const b = await sync(dbB, backend, B)
    expect(b).toMatchObject({ status: 'ok', skippedNamespaces: 0 })
    expect(syncedIds(dbB, A)).not.toContain('a-leftover')
    expect(syncedIds(dbB, A)).toHaveLength(3)
  })

  it('does not treat a legacy namespace (no manifest) as unreliable, and tolerates duplicated ids across its files', async () => {
    // An older client merged the same record into two day files.
    const legacy = [0, 1].map(n => mapStatsRecordToSyncRecord(local('device-legacy', n)))
    backend.files.set('device-legacy/2026/09/06.ndjson', ndjson(legacy))
    backend.files.set('device-legacy/2026/09/07.ndjson', ndjson([{ ...legacy[0], updatedAt: legacy[0].updatedAt - 1 }, { ...legacy[1], id: 'legacy-gone' }]))
    let b = await sync(dbB, backend, B)
    expect(b).toMatchObject({ status: 'ok', skippedNamespaces: 0 })
    expect(syncedIds(dbB, 'device-legacy')).toEqual([...legacy.map(r => r.id), 'legacy-gone'].sort())

    // The old client's `sync --repair` removed the second file: mirrored exactly.
    backend.files.delete('device-legacy/2026/09/07.ndjson')
    b = await sync(dbB, backend, B)
    expect(b.prunedCount).toBe(1)
    expect(syncedIds(dbB, 'device-legacy')).toEqual(legacy.map(r => r.id).sort())
  })
})

describe('canonical snapshot upload', () => {
  let backend: FakeSyncBackend
  let dbA: Database.Database
  let wires: SyncRecord[]

  beforeEach(() => {
    backend = new FakeSyncBackend()
    dbA = newDb()
    const records = [0, 1, 2].map(n => local(A, n))
    for (const r of records) insertRecord(dbA, r)
    wires = records.map(mapStatsRecordToSyncRecord)
  })

  it('rewrites a day file that contains the same id twice', async () => {
    const path = `${A}/2026/09/06.ndjson`
    backend.files.set(path, ndjson([...wires, wires[1]]))
    const a = await sync(dbA, backend, A)
    expect(a.status).toBe('ok')
    expect(a.writtenFiles).toBe(2) // file + manifest
    expect(backend.files.get(path)).toBe(serializeSnapshot(wires))
    expect(backend.linesUnder(A)).toHaveLength(3)
  })

  it('removes a duplicate copy that lives in another day file', async () => {
    backend.files.set(`${A}/2026/09/06.ndjson`, serializeSnapshot(wires))
    backend.files.set(`${A}/2026/09/05.ndjson`, ndjson([{ ...wires[0], updatedAt: wires[0].updatedAt - 5 }]))
    const a = await sync(dbA, backend, A)
    expect(a.status).toBe('ok')
    expect(a.retiredCount).toBe(1)
    expect(backend.deletes).toEqual([`${A}/2026/09/05.ndjson`])
    expect(backend.linesUnder(A)).toHaveLength(3)
    expect(parseManifest(backend.files.get(manifestPath(A))!)).toEqual(buildManifest(new Map([['2026/09/06.ndjson', wires]])))
  })

  it('rewrites a day file containing a malformed line and leaves an order-only difference alone', async () => {
    const path = `${A}/2026/09/06.ndjson`
    backend.files.set(path, ndjson([...wires].reverse()))
    let a = await sync(dbA, backend, A)
    expect(a.writtenFiles).toBe(1) // manifest only
    expect(backend.files.get(path)).toBe(ndjson([...wires].reverse()))

    backend.files.set(path, backend.files.get(path)! + 'not json\n')
    a = await sync(dbA, backend, A)
    expect(a.writtenFiles).toBe(1) // the file; the manifest digest is unchanged
    expect(backend.files.get(path)).toBe(serializeSnapshot(wires))
  })
})
