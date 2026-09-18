import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { generateRecordId, generateSessionKey, generateSyncRecordId } from '@aiusage/core'
import type { StatsRecord, SyncRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { SyncOrchestrator, serializeSnapshot } from '../../src/sync/index.js'
import { buildManifest, canonicalDigest, manifestPath, parseManifest, serializeManifest } from '../../src/sync/manifest.js'
import { mapStatsRecordToSyncRecord } from '../../src/sync/mapper.js'
import { planRemoteRepair, repairSyncContamination } from '../../src/sync/repair.js'
import { formatRepairReport } from '../../src/commands/sync.js'
import { FakeSyncBackend } from './helpers/fake-backend.js'

// `sync --repair --apply` rewrites remote namespaces, and with
// `--all-namespaces` other devices' namespaces too. It must read every
// namespace the way pull does — through its manifest — and leave alone any
// namespace it cannot verify: a manifest published over a half-written or
// corrupt state would turn that state into the authoritative snapshot for
// every peer.

const A = 'device-a'
const B = 'device-b'
const C = 'device-c' // pre-manifest client
const D = 'device-d'
const TARGET = 'github:example/repo'
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
    sessionId: `sess-${owner}`,
    sourceFile: `C:\\Users\\${owner}\\.claude\\projects\\p\\s.jsonl`,
    cwd: 'C:\\proj',
    device: owner.toUpperCase(),
    deviceInstanceId: owner,
    platform: 'win32',
    ...overrides,
  }
}

/** What the pre-provenance bug produced when `deviceInstanceId` re-uploaded `parent`. */
function echoOf(parent: SyncRecord, deviceInstanceId: string): SyncRecord {
  return {
    ...parent,
    id: generateSyncRecordId(deviceInstanceId, parent.sourceFile ?? '', 0),
    deviceInstanceId: parent.deviceInstanceId,
    sessionKey: generateSessionKey(parent.device, parent.sessionKey),
    updatedAt: parent.updatedAt + 1,
  }
}

function newDb(): Database.Database {
  const db = new Database(':memory:')
  initializeDatabase(db)
  return db
}

function sync(db: Database.Database, backend: FakeSyncBackend, deviceInstanceId: string) {
  return new SyncOrchestrator(db, backend, { deviceInstanceId, target: TARGET, consentVerified: true }).sync()
}

const ndjson = (records: SyncRecord[]) => records.map(r => JSON.stringify(r)).join('\n') + '\n'
const syncedIds = (db: Database.Database, owner: string) =>
  (db.prepare(`SELECT id FROM synced_records WHERE device_instance_id = ? ORDER BY id`).all(owner) as Array<{ id: string }>).map(r => r.id)

/** Plant `records` as `owner`'s day file and make the manifest agree, as the owner's client would have. */
function publish(backend: FakeSyncBackend, owner: string, rel: string, records: SyncRecord[]): void {
  backend.files.set(`${owner}/${rel}`, serializeSnapshot(records))
  const files = new Map<string, SyncRecord[]>()
  for (const [path, content] of backend.files) {
    if (!path.startsWith(`${owner}/`) || !path.endsWith('.ndjson')) continue
    files.set(path.slice(owner.length + 1), content.split('\n').filter(Boolean).map(l => JSON.parse(l)))
  }
  backend.files.set(manifestPath(owner), serializeManifest(buildManifest(files)))
}

describe('sync --repair reads namespaces through their manifests', () => {
  let backend: FakeSyncBackend
  let dbA: Database.Database
  let wiresA: SyncRecord[]
  let wiresB: SyncRecord[]
  let echoInB: SyncRecord

  beforeEach(async () => {
    backend = new FakeSyncBackend()
    dbA = newDb()
    const localsA = [0, 1, 2].map(n => local(A, n))
    for (const r of localsA) insertRecord(dbA, r)
    wiresA = localsA.map(mapStatsRecordToSyncRecord)
    await sync(dbA, backend, A)

    // B: an upgraded client whose namespace still carries an echo of A's
    // record next to its own (planted with a matching manifest).
    wiresB = [0, 1].map(n => mapStatsRecordToSyncRecord(local(B, n)))
    echoInB = echoOf(wiresA[0], B)
    publish(backend, B, '2026/09/06.ndjson', [...wiresB, echoInB])

    // C: a legacy namespace (no manifest) with an echo as well.
    backend.files.set(`${C}/2026/09/06.ndjson`, ndjson([mapStatsRecordToSyncRecord(local(C, 0)), echoOf(wiresA[1], C)]))
    backend.writes.length = 0
    backend.deletes.length = 0
  })

  it('repairs a verified foreign namespace and refreshes its manifest so peers keep verifying it', async () => {
    const report = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, allNamespaces: true, apply: true })
    expect(report.remote!.skippedNamespaces).toEqual([])
    // The planted line carries A's id inside B's namespace: a foreign-namespace line.
    const nsB = report.remote!.namespaces.find(n => n.owner === B)!
    expect(nsB).toMatchObject({ files: 1, lines: 3, foreignLines: 1, echoLines: 0 })
    expect(nsB.skipped).toBeUndefined()
    expect(report.remoteResult).toMatchObject({ rewritten: 2, deleted: 0 })

    expect(backend.files.get(`${B}/2026/09/06.ndjson`)).toBe(serializeSnapshot(wiresB))
    expect(parseManifest(backend.files.get(manifestPath(B))!)).toEqual({
      version: 1,
      files: { '2026/09/06.ndjson': { digest: canonicalDigest(wiresB), records: 2 } },
    })
    // The legacy namespace is repaired too, and stays manifest-less.
    expect(backend.linesUnder(C)).toHaveLength(1)
    expect(backend.files.has(manifestPath(C))).toBe(false)

    const dbD = newDb()
    const d = await sync(dbD, backend, D)
    expect(d).toMatchObject({ status: 'ok', skippedNamespaces: 0, ignoredCount: 0 })
    expect(syncedIds(dbD, B)).toEqual(wiresB.map(w => w.id).sort())
  })

  describe('leaves a namespace it cannot verify untouched', () => {
    const untouched = (before: Map<string, string>, owner: string) => {
      expect([...backend.files].filter(([p]) => p.startsWith(`${owner}/`))).toEqual([...before].filter(([p]) => p.startsWith(`${owner}/`)))
      expect([...backend.writes.map(w => w.path), ...backend.deletes].filter(p => p.startsWith(`${owner}/`))).toEqual([])
    }

    it('when a day file does not match the manifest (the owner is rewriting it)', async () => {
      // B is mid-publish: the file already holds a new record the manifest does not know.
      backend.files.set(`${B}/2026/09/06.ndjson`, serializeSnapshot([...wiresB, echoInB, mapStatsRecordToSyncRecord(local(B, 5))]))
      const before = new Map(backend.files)

      const report = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, allNamespaces: true, apply: true })
      expect(report.remote!.skippedNamespaces).toEqual([{ owner: B, reason: '2026/09/06.ndjson does not match the manifest' }])
      expect(report.remote!.namespaces.find(n => n.owner === B)).toMatchObject({ lines: 4, foreignLines: 0, echoLines: 0, skipped: '2026/09/06.ndjson does not match the manifest' })
      expect(report.remote!.files.map(f => f.owner)).toEqual([C])
      untouched(before, B)
      expect(formatRepairReport(report)).toContain(`${B}: 4 line(s) in 1 file(s) — NOT verified (2026/09/06.ndjson does not match the manifest), left untouched; its owner's next sync republishes it`)
    })

    it('when the manifest names a file that is missing, or cannot be parsed', async () => {
      backend.files.set(manifestPath(B), serializeManifest({ version: 1, files: { '2026/09/06.ndjson': { digest: canonicalDigest([...wiresB, echoInB]), records: 3 }, '2026/09/07.ndjson': { digest: 'd'.repeat(32), records: 1 } } }))
      let before = new Map(backend.files)
      let report = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, allNamespaces: true, apply: true })
      expect(report.remote!.skippedNamespaces).toEqual([{ owner: B, reason: '2026/09/07.ndjson is missing' }])
      untouched(before, B)

      backend.files.set(manifestPath(B), 'not a manifest')
      before = new Map(backend.files)
      report = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, allNamespaces: true, apply: true })
      expect(report.remote!.skippedNamespaces).toEqual([{ owner: B, reason: 'manifest cannot be parsed' }])
      untouched(before, B)
    })

    it('when a file contains a malformed line, with or without a manifest', async () => {
      backend.files.set(`${B}/2026/09/06.ndjson`, backend.files.get(`${B}/2026/09/06.ndjson`)! + '{"id":\n')
      backend.files.set(`${C}/2026/09/06.ndjson`, 'garbage\n' + backend.files.get(`${C}/2026/09/06.ndjson`)!)
      const before = new Map(backend.files)

      const report = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, allNamespaces: true, apply: true })
      expect(report.remote!.skippedNamespaces).toEqual([
        { owner: B, reason: '2026/09/06.ndjson has 1 malformed line(s)' },
        { owner: C, reason: '2026/09/06.ndjson has 1 malformed line(s)' },
      ])
      expect(report.remote!.files).toEqual([])
      expect(report.remoteResult).toMatchObject({ rewritten: 0, deleted: 0, flushed: false })
      untouched(before, B)
      untouched(before, C)
    })

    it('including this device\'s own namespace, which the next sync republishes anyway', async () => {
      const stale = { ...wiresA[0], id: 'stale-id' }
      backend.files.set(`${A}/2026/09/06.ndjson`, serializeSnapshot([...wiresA, stale]))
      const before = new Map(backend.files)

      const report = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, apply: true })
      expect(report.remote!.skippedNamespaces).toEqual([{ owner: A, reason: '2026/09/06.ndjson does not match the manifest' }])
      expect(formatRepairReport(report)).toContain(`${A} (this device): 4 line(s) in 1 file(s) — NOT verified (2026/09/06.ndjson does not match the manifest), left untouched; the next "aiusage sync" republishes it`)
      untouched(before, A)

      expect(await sync(dbA, backend, A)).toMatchObject({ status: 'ok', retiredCount: 1 })
      const again = await repairSyncContamination(dbA, { deviceInstanceId: A, backend })
      expect(again.remote!.skippedNamespaces).toEqual([])
      expect(again.remote!.files).toEqual([])
    })
  })

  it('ignores day files a manifest does not name, and its unverifiable lines still seed echo detection', async () => {
    // A leftover file (interrupted deletion by B) holding another echo: not
    // scanned, not counted, not rewritten, not named by the refreshed manifest.
    backend.files.set(`${B}/2026/09/05.ndjson`, ndjson([echoOf(wiresA[2], B)]))
    const plan = await planRemoteRepair(backend, { deviceInstanceId: A, allNamespaces: true })
    expect(plan.namespaces.find(n => n.owner === B)).toMatchObject({ files: 1, lines: 3, foreignLines: 1 })
    expect(plan.files.map(f => f.path)).toEqual([`${B}/2026/09/06.ndjson`, `${C}/2026/09/06.ndjson`])
    expect(plan.presentOwners).toEqual(new Set([A, B, C]))

    await repairSyncContamination(dbA, { deviceInstanceId: A, backend, allNamespaces: true, apply: true })
    expect(backend.files.has(`${B}/2026/09/05.ndjson`)).toBe(true)
    expect(Object.keys(parseManifest(backend.files.get(manifestPath(B))!)!.files)).toEqual(['2026/09/06.ndjson'])
  })

  it('refreshes the manifest before deleting a file whose every line was contamination', async () => {
    publish(backend, B, '2026/09/07.ndjson', [echoOf(wiresA[2], B)])
    const ops: string[] = []
    const write = backend.writeFile.bind(backend)
    const del = backend.deleteFile.bind(backend)
    backend.writeFile = async (path, content) => { ops.push(`write ${path}`); return write(path, content) }
    backend.deleteFile = async (path) => { ops.push(`delete ${path}`); return del(path) }

    const report = await repairSyncContamination(dbA, { deviceInstanceId: A, backend, allNamespaces: true, apply: true })
    expect(report.remoteResult).toMatchObject({ rewritten: 2, deleted: 1 })
    expect(backend.files.has(`${B}/2026/09/07.ndjson`)).toBe(false)
    expect(ops.indexOf(`write ${manifestPath(B)}`)).toBeLessThan(ops.indexOf(`delete ${B}/2026/09/07.ndjson`))
    expect(Object.keys(parseManifest(backend.files.get(manifestPath(B))!)!.files)).toEqual(['2026/09/06.ndjson'])
  })
})
