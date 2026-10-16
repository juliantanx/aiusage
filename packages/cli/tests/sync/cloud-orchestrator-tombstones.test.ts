import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { generateRecordId, generateSyncRecordId } from '@aiusage/core'
import type { StatsRecord, SyncRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { insertSyncedRecord, mergeSyncedRecordsIntoRecords } from '../../src/db/synced-records.js'
import { getRetiredWireIds, replaceNamespaceClaims } from '../../src/db/sync-claims.js'

const pulled: { records: SyncRecord[]; tombstones: Array<Record<string, unknown>> } = { records: [], tombstones: [] }

vi.mock('../../src/sync/cloud.js', () => ({
  CloudSyncError: class CloudSyncError extends Error {},
  cloudPull: vi.fn(async () => ({
    records: pulled.records,
    tombstones: pulled.tombstones,
    hasMore: false,
    syncGeneration: 1,
  })),
  cloudPush: vi.fn(async () => ({ inserted: 0, updated: 0, skipped: 0, syncGeneration: 1 })),
}))

const OWN = 'device-a'
const PEER = 'device-b'
const DB_PATH = 'C:\\ag\\s.db'

function antigravity(id: string, lineOffset: number): StatsRecord {
  return {
    id: generateRecordId(OWN, `antigravity:s:${id}`, 0),
    ts: 1000, ingestedAt: 1000, updatedAt: 1000, lineOffset,
    tool: 'antigravity', model: 'gemini-2.5-pro', provider: 'google',
    inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0,
    cost: 0, costSource: 'pricing', sessionId: 's', sourceFile: DB_PATH, device: 'G14', deviceInstanceId: OWN,
  }
}

function peerRecord(id: string): SyncRecord {
  return {
    id, ts: 1000, tool: 'claude-code', model: 'm', provider: 'p',
    inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0,
    cost: 0, costSource: 'pricing', sessionKey: 'k', device: 'MSI', deviceInstanceId: PEER, updatedAt: 1000,
  }
}

describe('CloudSyncOrchestrator tombstones', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    pulled.records = []
    pulled.tombstones = []
    vi.clearAllMocks()
  })

  it('pushes retired wire ids as tombstones once and pushes re-keyed records under their parser ids', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    const { cloudPush } = await import('../../src/sync/cloud.js')
    const pair = [antigravity('r1', 3), antigravity('r2', 3)]
    for (const r of pair) insertRecord(db, r)
    const retired = generateSyncRecordId(OWN, DB_PATH, 3)
    db.prepare(`INSERT INTO sync_retired_wire_ids (target, wire_id) VALUES ('cloud', ?)`).run(retired)

    const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(result.status).toBe('ok')
    expect(result.uploadedCount).toBe(2)
    expect(result.retiredCount).toBe(1)

    const calls = vi.mocked(cloudPush).mock.calls
    const recordPush = calls.find(c => c[0].length > 0)!
    expect(recordPush[0].map(r => r.id).sort()).toEqual(pair.map(r => r.id).sort())
    const tombstonePush = calls.find(c => c[1].length > 0)!
    expect(tombstonePush[1]).toEqual([{ record_id: retired, updatedAt: expect.any(Number) }])
    expect(getRetiredWireIds(db, 'cloud')).toEqual([])

    // Second sync: nothing left to retract, nothing new to push.
    vi.mocked(cloudPush).mockClear()
    const again = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(again.retiredCount).toBe(0)
    expect(again.uploadedCount).toBe(0)
    expect(cloudPush).not.toHaveBeenCalled()
  })

  describe('retired ids the server did not apply', () => {
    function retire(...ids: string[]): void {
      for (const id of ids) db.prepare(`INSERT INTO sync_retired_wire_ids (target, wire_id) VALUES ('cloud', ?)`).run(id)
    }
    const tombstonesSent = async (): Promise<string[][]> => {
      const { cloudPush } = await import('../../src/sync/cloud.js')
      return vi.mocked(cloudPush).mock.calls.filter(c => c[1].length > 0).map(c => c[1].map(t => t.record_id))
    }

    it('forgets only the ids whose tombstones the server applied, and sends the rest again', async () => {
      const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
      const { cloudPush } = await import('../../src/sync/cloud.js')
      retire('applied', 'refused')
      vi.mocked(cloudPush).mockResolvedValueOnce({ inserted: 0, updated: 0, skipped: 1, rejectedTombstoneIds: ['refused'], syncGeneration: 1 })

      const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
      expect(result).toMatchObject({ status: 'ok', retiredCount: 1, unretiredCount: 1 })
      expect(getRetiredWireIds(db, 'cloud')).toEqual(['refused'])

      vi.mocked(cloudPush).mockClear()
      const again = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
      expect(again).toMatchObject({ status: 'ok', retiredCount: 1 })
      expect(again.unretiredCount).toBeUndefined()
      expect(await tombstonesSent()).toEqual([['refused']])
      expect(getRetiredWireIds(db, 'cloud')).toEqual([])
    })

    it('keeps every id of a batch the server applied none of', async () => {
      const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
      const { cloudPush } = await import('../../src/sync/cloud.js')
      retire('a', 'b')
      vi.mocked(cloudPush).mockResolvedValueOnce({ inserted: 0, updated: 0, skipped: 2, rejectedTombstoneIds: ['a', 'b'], syncGeneration: 1 })

      const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
      expect(result).toMatchObject({ status: 'ok', retiredCount: 0, unretiredCount: 2 })
      expect(getRetiredWireIds(db, 'cloud').sort()).toEqual(['a', 'b'])
    })

    it('forgets an id the cloud cannot hold without sending it: there is no cloud record to retract', async () => {
      const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
      retire('ok', 'bad\u0000id', '')

      const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
      expect(result).toMatchObject({ status: 'ok', retiredCount: 1 })
      expect(result.unretiredCount).toBeUndefined()
      expect(await tombstonesSent()).toEqual([['ok']])
      expect(getRetiredWireIds(db, 'cloud')).toEqual([])
    })

    it('forgets an id the cloud cannot hold also when it is the only one', async () => {
      const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
      retire('bad\u0000id')

      const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
      expect(result).toMatchObject({ status: 'ok', retiredCount: 0 })
      expect(result.unretiredCount).toBeUndefined()
      expect(await tombstonesSent()).toEqual([])
      expect(getRetiredWireIds(db, 'cloud')).toEqual([])
    })

    it('keeps every id when the request fails, and retracts them on the retry', async () => {
      const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
      const { cloudPush } = await import('../../src/sync/cloud.js')
      retire('a', 'b')
      vi.mocked(cloudPush).mockRejectedValueOnce(new Error('connection reset'))

      const failed = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
      expect(failed.status).toBe('failed')
      expect(getRetiredWireIds(db, 'cloud').sort()).toEqual(['a', 'b'])

      const retried = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
      expect(retried).toMatchObject({ status: 'ok', retiredCount: 2 })
      expect(getRetiredWireIds(db, 'cloud')).toEqual([])
    })
  })

  it('applies tombstones from other devices and ignores its own', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    // Both rows were pulled from the cloud earlier (claimed by it).
    insertSyncedRecord(db, peerRecord('gone'))
    insertSyncedRecord(db, peerRecord('kept'))
    replaceNamespaceClaims(db, 'cloud', PEER, ['gone', 'kept'])
    mergeSyncedRecordsIntoRecords(db, OWN)
    insertRecord(db, antigravity('mine', 1))
    const mineWire = antigravity('mine', 1).id

    // The peer retracted 'gone': the server returns it as a tombstone and no longer as a record.
    pulled.records = [peerRecord('kept')]
    pulled.tombstones = [
      { id: 'gone', device_instance_id: PEER },
      { id: mineWire, device_instance_id: OWN },
    ]
    const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(result.status).toBe('ok')
    expect(result.prunedCount).toBe(1)
    expect(db.prepare(`SELECT id FROM synced_records ORDER BY id`).all()).toEqual([{ id: 'kept' }])
    expect(db.prepare(`SELECT id FROM records WHERE origin = 'synced'`).all()).toEqual([{ id: 'kept' }])
    expect(db.prepare(`SELECT COUNT(*) AS n FROM records WHERE origin = 'local'`).get()).toEqual({ n: 1 })
  })

  it("a tombstone releases only its own device's claim: the same id still published by another device stays", async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    // Two devices publish the same parser-generated id (the same tool data on
    // both machines); the server keys records by device, so both rows exist.
    pulled.records = [peerRecord('shared')]
    pulled.tombstones = [{ id: 'shared', device_instance_id: 'device-c', deleted_at: '2026-09-06T00:00:00Z' }]
    const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(result).toMatchObject({ status: 'ok', prunedCount: 0 })
    expect(db.prepare(`SELECT device_instance_id FROM synced_records WHERE id = 'shared'`).get()).toEqual({ device_instance_id: PEER })
    expect(db.prepare(`SELECT target, device_instance_id FROM sync_record_claims WHERE record_id = 'shared'`).all()).toEqual([{ target: 'cloud', device_instance_id: PEER }])
    expect(db.prepare(`SELECT COUNT(*) AS n FROM records WHERE id = 'shared' AND origin = 'synced'`).get()).toEqual({ n: 1 })
  })

  it('a tombstone never deletes a row the cloud does not claim', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    // Unresolved (pulled before claims existed) and claimed by another target only.
    insertSyncedRecord(db, peerRecord('unresolved'))
    insertSyncedRecord(db, peerRecord('github-only'))
    replaceNamespaceClaims(db, 'github:u/r', PEER, ['github-only'])
    pulled.tombstones = [
      { id: 'unresolved', device_instance_id: PEER },
      { id: 'github-only', device_instance_id: PEER },
    ]
    const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN, knownTargets: ['cloud', 'github:u/r'] }).sync()
    expect(result.status).toBe('ok')
    expect(result.prunedCount).toBe(0)
    expect(db.prepare(`SELECT id FROM synced_records ORDER BY id`).all()).toEqual([{ id: 'github-only' }, { id: 'unresolved' }])
  })

  it('adopts pre-init local rows before pushing', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    const { cloudPush } = await import('../../src/sync/cloud.js')
    insertRecord(db, { ...antigravity('legacy', 1), deviceInstanceId: 'unknown' })
    const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: OWN }).sync()
    expect(result.uploadedCount).toBe(1)
    expect(vi.mocked(cloudPush).mock.calls[0][0][0].deviceInstanceId).toBe(OWN)
    expect(db.prepare(`SELECT COUNT(*) AS n FROM records WHERE device_instance_id = 'unknown'`).get()).toEqual({ n: 0 })
  })
})
