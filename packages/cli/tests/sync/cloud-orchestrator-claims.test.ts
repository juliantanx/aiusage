import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { generateRecordId, generateSyncRecordId } from '@aiusage/core'
import type { StatsRecord, SyncRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord, markRecordsSynced } from '../../src/db/records.js'
import { getClaimingTargets, getNamespaceVerdicts, getRetiredWireIds, replaceNamespaceClaims } from '../../src/db/sync-claims.js'
import { pruneUnresolvedSyncedRecords, reconcileSyncedNamespace } from '../../src/db/synced-records.js'

// A complete cloud pull is authoritative for what the cloud target claims:
// owners that come back with nothing (the server's data was cleared and a new
// generation started) lose their cloud claims, and rows no other target claims
// go with them. Local database failures abort the sync before any of that.
// The generation the pull observes is the one every push goes out under, and
// a pull whose pages span two generations is restarted.

const { pulled, defaultPull } = vi.hoisted(() => {
  const pulled = { records: [] as SyncRecord[], tombstones: [] as Array<Record<string, unknown>>, generation: 1 }
  const defaultPull = async () => ({
    records: pulled.records,
    tombstones: pulled.tombstones,
    hasMore: false,
    syncGeneration: pulled.generation,
  })
  return { pulled, defaultPull }
})

vi.mock('../../src/sync/cloud.js', () => ({
  CloudSyncError: class CloudSyncError extends Error {},
  cloudPull: vi.fn(defaultPull),
  cloudPush: vi.fn(async () => ({ inserted: 0, updated: 0, skipped: 0, syncGeneration: pulled.generation })),
}))

type PullPage = { records: SyncRecord[]; tombstones: Array<Record<string, unknown>>; hasMore: boolean; nextCursor?: string; syncGeneration: number }
const page = (generation: number, ids: string[], nextCursor?: string): PullPage =>
  ({ records: ids.map(id => peerRecord(id)), tombstones: [], hasMore: nextCursor !== undefined, nextCursor, syncGeneration: generation })

const OWN = 'device-a'
const X = 'device-x'
const T_A = 'github:org/usage'

function peerRecord(id: string, owner = X): SyncRecord {
  return {
    id, ts: 1000, tool: 'claude-code', model: 'm', provider: 'p',
    inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0,
    cost: 0, costSource: 'pricing', sessionKey: `k-${id}`, device: 'MSI', deviceInstanceId: owner, updatedAt: 1000,
  }
}

const syncedIds = (db: Database.Database) => (db.prepare(`SELECT id FROM synced_records ORDER BY id`).all() as Array<{ id: string }>).map(r => r.id)
const mergedIds = (db: Database.Database) => (db.prepare(`SELECT id FROM records WHERE origin = 'synced' ORDER BY id`).all() as Array<{ id: string }>).map(r => r.id)

describe('CloudSyncOrchestrator claims', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    pulled.records = []
    pulled.tombstones = []
    pulled.generation = 1
    vi.clearAllMocks()
  })

  it('releases cloud claims of owners absent from a complete pull after a generation reset, keeping rows other targets claim', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    pulled.records = [peerRecord('r1'), peerRecord('r2'), peerRecord('r3')]
    const first = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(first.status).toBe('ok')
    expect(first.syncGeneration).toBe(1)
    expect(syncedIds(db)).toEqual(['r1', 'r2', 'r3'])
    for (const id of ['r1', 'r2', 'r3']) expect(getClaimingTargets(db, id)).toEqual(['cloud'])

    // r1 is also carried by a GitHub target.
    replaceNamespaceClaims(db, T_A, X, ['r1'])

    // The server was cleared: the new generation returns neither records nor tombstones.
    pulled.records = []
    pulled.generation = 2
    const second = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(second.status).toBe('ok')
    expect(second.syncGeneration).toBe(2)
    expect(second.prunedCount).toBe(2)
    expect(getClaimingTargets(db, 'r1')).toEqual([T_A])
    expect(getClaimingTargets(db, 'r2')).toEqual([])
    expect(syncedIds(db)).toEqual(['r1'])
    expect(mergedIds(db)).toEqual(['r1'])

    // Convergence: another empty pull changes nothing.
    const third = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(third.prunedCount).toBe(0)
    expect(syncedIds(db)).toEqual(['r1'])
  })

  it('releases the cloud claim of a record missing from a complete pull even when its owner is still present', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    pulled.records = [peerRecord('r1'), peerRecord('r2')]
    await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()

    pulled.records = [peerRecord('r2')]
    const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(result.prunedCount).toBe(1)
    expect(syncedIds(db)).toEqual(['r2'])
    expect(getClaimingTargets(db, 'r2')).toEqual(['cloud'])
  })

  it('keeps rows whose last claim the cloud released while a known file target has not judged their namespace', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    const knownTargets = ['cloud', T_A]
    pulled.records = [peerRecord('r1'), peerRecord('r2')]
    await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN, knownTargets }).sync()

    // r1 is retracted with a tombstone, r2 simply stops coming back. The
    // GitHub target is known but has not been synced yet: it may carry both.
    pulled.records = []
    pulled.tombstones = [{ id: 'r1', device_instance_id: X, deleted_at: 2000 }]
    const second = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN, knownTargets }).sync()
    expect(second).toMatchObject({ status: 'ok', prunedCount: 0 })
    expect(syncedIds(db)).toEqual(['r1', 'r2'])
    expect(mergedIds(db)).toEqual(['r1', 'r2'])
    expect(getClaimingTargets(db, 'r1')).toEqual([])
    expect(db.prepare(`SELECT COUNT(*) AS n FROM synced_records WHERE unclaimed_since IS NULL`).get()).toEqual({ n: 0 })

    // GitHub judges the namespace: it carries r1 only.
    reconcileSyncedNamespace(db, T_A, X, ['r1'], undefined, { knownTargets })
    pulled.tombstones = []
    const third = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN, knownTargets }).sync()
    expect(third).toMatchObject({ status: 'ok', prunedCount: 1 })
    expect(syncedIds(db)).toEqual(['r1'])
    expect(getClaimingTargets(db, 'r1')).toEqual([T_A])
  })

  it('never touches rows of a device the cloud has not claimed', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    // Pulled through GitHub only; the cloud has never seen device-y.
    db.prepare(`INSERT INTO synced_records (id, ts, tool, model, provider, session_key, device, device_instance_id, updated_at) VALUES ('g1', 1, 't', 'm', 'p', 'k', 'Y', 'device-y', 1)`).run()
    replaceNamespaceClaims(db, T_A, 'device-y', ['g1'])
    db.prepare(`INSERT INTO synced_records (id, ts, tool, model, provider, session_key, device, device_instance_id, updated_at) VALUES ('u1', 1, 't', 'm', 'p', 'k', 'Z', 'device-z', 1)`).run()

    const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(result.prunedCount).toBe(0)
    expect(syncedIds(db)).toEqual(['g1', 'u1'])
  })

  it('aborts before touching any claim when the local database fails during the pull', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    const { cloudPush } = await import('../../src/sync/cloud.js')
    pulled.records = [peerRecord('r1'), peerRecord('r2')]
    await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()

    // The server now carries r3 as well, but r1 is gone; inserting r3 fails locally.
    db.exec(`CREATE TRIGGER boom BEFORE INSERT ON synced_records WHEN NEW.id = 'r3' BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END`)
    pulled.records = [peerRecord('r2'), peerRecord('r3')]
    vi.mocked(cloudPush).mockClear()
    const failed = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(failed.status).toBe('failed')
    expect(failed.error).toContain('simulated disk failure')
    expect(syncedIds(db)).toEqual(['r1', 'r2'])
    expect(getClaimingTargets(db, 'r1')).toEqual(['cloud'])
    expect(cloudPush).not.toHaveBeenCalled()

    db.exec(`DROP TRIGGER boom`)
    const recovered = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(recovered.status).toBe('ok')
    expect(recovered.prunedCount).toBe(1)
    expect(syncedIds(db)).toEqual(['r2', 'r3'])
  })

  it('a failed cloud sync withdraws the cloud verdict, so another target cannot settle a row the cloud was just seen to carry', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    const knownTargets = ['cloud', T_A]
    // u1 is unresolved from before claims existed; the cloud judges X and lacks it.
    db.prepare(`INSERT INTO synced_records (id, ts, tool, model, provider, session_key, device, device_instance_id, updated_at, unclaimed_since) VALUES ('u1', 1000, 'claude-code', 'm', 'p', 'k-u1', 'MSI', ?, 1000, 0)`).run(X)
    pulled.records = [peerRecord('r1')]
    expect(await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN, knownTargets }).sync()).toMatchObject({ status: 'ok', prunedCount: 0 })
    expect(getNamespaceVerdicts(db, X).has('cloud')).toBe(true)

    // The cloud now returns u1, but applying the pull fails locally.
    db.exec(`CREATE TRIGGER boom BEFORE INSERT ON synced_records WHEN NEW.id = 'r9' BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END`)
    pulled.records = [peerRecord('r1'), peerRecord('u1'), peerRecord('r9')]
    expect(await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN, knownTargets }).sync()).toMatchObject({ status: 'failed' })
    expect(getNamespaceVerdicts(db, X).has('cloud')).toBe(false)

    // GitHub verifies X without u1: the cloud's earlier verdict must not count.
    reconcileSyncedNamespace(db, T_A, X, [], undefined, { knownTargets })
    expect(pruneUnresolvedSyncedRecords(db, knownTargets)).toBe(0)
    expect(syncedIds(db)).toContain('u1')

    db.exec(`DROP TRIGGER boom`)
    expect(await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN, knownTargets }).sync()).toMatchObject({ status: 'ok', prunedCount: 0 })
    expect(getClaimingTargets(db, 'u1')).toEqual(['cloud'])
  })

  it('retracts the wire id a legacy unknown-device row was pushed under and re-pushes it under the real device id', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    const { cloudPush } = await import('../../src/sync/cloud.js')
    const record: StatsRecord = {
      id: generateRecordId('unknown', 'msg_1', 0), ts: 1000, ingestedAt: 1000, updatedAt: 1000, lineOffset: 512,
      tool: 'claude-code', model: 'm', provider: 'anthropic', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 's', sourceFile: 'C:\\s.jsonl', device: 'D', deviceInstanceId: 'unknown',
    }
    insertRecord(db, record)
    markRecordsSynced(db, [record.id], 5000, 'cloud') // pushed by an older client as sha256('unknown', file, offset)
    const oldWireId = generateSyncRecordId('unknown', 'C:\\s.jsonl', 512)
    const newWireId = generateSyncRecordId(OWN, 'C:\\s.jsonl', 512)

    const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(result.status).toBe('ok')
    expect(result.uploadedCount).toBe(1)
    expect(result.retiredCount).toBe(1)
    const calls = vi.mocked(cloudPush).mock.calls
    expect(calls.find(c => c[0].length > 0)![0].map(r => [r.id, r.deviceInstanceId])).toEqual([[newWireId, OWN]])
    expect(calls.find(c => c[1].length > 0)![1]).toEqual([{ record_id: oldWireId, updatedAt: expect.any(Number) }])
    expect(getRetiredWireIds(db, 'cloud')).toEqual([])

    vi.mocked(cloudPush).mockClear()
    const again = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(again.uploadedCount).toBe(0)
    expect(again.retiredCount).toBe(0)
    expect(cloudPush).not.toHaveBeenCalled()
  })

  it('pushes local records and retired wire ids under the generation the pull observed, not the one the sync started with', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    const { cloudPush } = await import('../../src/sync/cloud.js')
    const record: StatsRecord = {
      id: generateRecordId(OWN, 'msg_1', 0), ts: 1000, ingestedAt: 1000, updatedAt: 1000, lineOffset: 64,
      tool: 'claude-code', model: 'm', provider: 'anthropic', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 's', sourceFile: 'C:\\s.jsonl', device: 'D', deviceInstanceId: OWN,
    }
    insertRecord(db, record)
    db.prepare(`INSERT INTO sync_retired_wire_ids (target, wire_id) VALUES ('cloud', 'retired-1')`).run()

    // The server was cleared since this client last synced: it now serves generation 2.
    pulled.generation = 2
    const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync(1)
    expect(result.status).toBe('ok')
    expect(result.syncGeneration).toBe(2)
    expect(result.uploadedCount).toBe(1)
    expect(result.retiredCount).toBe(1)
    const calls = vi.mocked(cloudPush).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls.map(c => c[3])).toEqual([2, 2])
    expect(calls[0][0].map(r => r.id)).toEqual([generateSyncRecordId(OWN, 'C:\\s.jsonl', 64)])
    expect(calls[1][1]).toEqual([{ record_id: 'retired-1', updatedAt: expect.any(Number) }])
    expect(getRetiredWireIds(db, 'cloud')).toEqual([])
  })

  it('restarts the pull when the generation changes between pages and reconciles against the new generation only', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    const { cloudPull } = await import('../../src/sync/cloud.js')
    pulled.records = [peerRecord('old1'), peerRecord('old2')]
    await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(syncedIds(db)).toEqual(['old1', 'old2'])

    // Page 1 still comes from generation 1; the server is cleared before
    // page 2, which reports generation 2 with a record that was pushed
    // afresh. Stitching them together would keep old1 forever.
    vi.mocked(cloudPull)
      .mockImplementationOnce(async () => page(1, ['old1'], '100'))
      .mockImplementationOnce(async () => page(2, ['new1']))
      .mockImplementationOnce(async () => page(2, ['new1'], '1'))
      .mockImplementationOnce(async () => page(2, ['new2']))
    vi.mocked(cloudPull).mockClear()
    const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(result.status).toBe('ok')
    expect(result.syncGeneration).toBe(2)
    expect(cloudPull).toHaveBeenCalledTimes(4)
    expect(vi.mocked(cloudPull).mock.calls.map(c => c[0])).toEqual([undefined, '100', undefined, '1'])
    expect(syncedIds(db)).toEqual(['new1', 'new2'])
    expect(getClaimingTargets(db, 'old1')).toEqual([])
    expect(getClaimingTargets(db, 'new2')).toEqual(['cloud'])
  })

  it('fails instead of reconciling when the generation keeps changing during the pull', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    const { cloudPull, cloudPush } = await import('../../src/sync/cloud.js')
    pulled.records = [peerRecord('r1')]
    await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()

    let attempt = 0
    vi.mocked(cloudPull).mockImplementation(async (cursor?: string) => {
      if (cursor === undefined) attempt++
      return cursor === undefined ? page(attempt, [], '1') : page(attempt + 1, ['x'])
    })
    vi.mocked(cloudPush).mockClear()
    try {
      const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
      expect(result.status).toBe('failed')
      expect(result.error).toContain('generation changed')
      expect(attempt).toBe(4)
      expect(syncedIds(db)).toEqual(['r1'])
      expect(getClaimingTargets(db, 'r1')).toEqual(['cloud'])
      expect(cloudPush).not.toHaveBeenCalled()
    } finally {
      vi.mocked(cloudPull).mockImplementation(defaultPull)
    }
  })
})
