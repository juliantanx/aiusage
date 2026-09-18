import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import type { SyncRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { insertSyncedRecord, mergeSyncedRecordsIntoRecords } from '../../src/db/synced-records.js'
import { getClaimingTargets, replaceNamespaceClaims } from '../../src/db/sync-claims.js'
import { repairSyncContamination } from '../../src/sync/repair.js'
import { cleanAll, cleanOldData } from '../../src/commands/clean.js'

// Whatever removes a mirrored row outside reconciliation must remove its
// claims too: a claim without a row would shield a later pull of the same id
// from pruning forever.

const OWN = 'device-a'
const PEER = 'device-b'

function synced(id: string, owner: string, ts = 1000): SyncRecord {
  return {
    id, ts, tool: 'claude-code', model: 'm', provider: 'p',
    inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0,
    cost: 0, costSource: 'pricing', sessionKey: `k-${id}`, device: 'MSI', deviceInstanceId: owner, updatedAt: ts,
  }
}

const claimCount = (db: Database.Database) => (db.prepare(`SELECT COUNT(*) AS n FROM sync_record_claims`).get() as { n: number }).n
const syncedIds = (db: Database.Database) => (db.prepare(`SELECT id FROM synced_records ORDER BY id`).all() as Array<{ id: string }>).map(r => r.id)

describe('claims never outlive their rows', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  it('sync --repair --apply removes a claimed echo together with every claim on it', async () => {
    // An own-device echo (our id in synced_records) that two targets claim, next to a genuine peer row.
    insertSyncedRecord(db, synced('echo', OWN))
    insertSyncedRecord(db, synced('genuine', PEER))
    mergeSyncedRecordsIntoRecords(db, OWN)
    replaceNamespaceClaims(db, 'github:org/usage', PEER, ['echo', 'genuine'])
    replaceNamespaceClaims(db, 'cloud', PEER, ['echo'])
    expect(getClaimingTargets(db, 'echo').sort()).toEqual(['cloud', 'github:org/usage'])

    const dry = await repairSyncContamination(db, { deviceInstanceId: OWN })
    expect(dry.local.echoSyncedIds).toEqual(['echo'])
    expect(claimCount(db)).toBe(3)

    const applied = await repairSyncContamination(db, { deviceInstanceId: OWN, apply: true })
    expect(applied.applied).toBe(true)
    expect(syncedIds(db)).toEqual(['genuine'])
    expect(db.prepare(`SELECT id FROM records WHERE origin = 'synced'`).all()).toEqual([{ id: 'genuine' }])
    expect(getClaimingTargets(db, 'echo')).toEqual([])
    expect(getClaimingTargets(db, 'genuine')).toEqual(['github:org/usage'])
    expect(claimCount(db)).toBe(1)
  })

  it('sync --repair --apply removes the claims of orphaned rows it deletes', async () => {
    // Orphaned rows are unclaimed by definition; a claim from a *different*
    // record id must survive, a stray claim on the deleted id must not.
    insertSyncedRecord(db, synced('orphan', 'device-gone'))
    insertSyncedRecord(db, synced('kept', PEER))
    replaceNamespaceClaims(db, 'cloud', PEER, ['kept'])
    const { FakeSyncBackend } = await import('./helpers/fake-backend.js')
    const backend = new FakeSyncBackend()
    backend.files.set(`${PEER}/1970/01/01.ndjson`, JSON.stringify(synced('kept', PEER)) + '\n')

    const applied = await repairSyncContamination(db, { deviceInstanceId: OWN, target: 'github:org/usage', backend, apply: true })
    expect(applied.local.orphanedSyncedIds).toEqual(['orphan'])
    expect(syncedIds(db)).toEqual(['kept'])
    expect(claimCount(db)).toBe(1)
    expect(getClaimingTargets(db, 'kept')).toEqual(['cloud'])
  })

  it('retention clean-up and a full clean drop the claims of the rows they delete', () => {
    const now = Date.now()
    const day = 86_400_000
    insertSyncedRecord(db, synced('old', PEER, now - 30 * day))
    insertSyncedRecord(db, synced('recent', PEER, now - day))
    replaceNamespaceClaims(db, 'cloud', PEER, ['old', 'recent'])

    cleanOldData(db, 20)
    expect(syncedIds(db)).toEqual(['recent'])
    expect(getClaimingTargets(db, 'old')).toEqual([])
    expect(getClaimingTargets(db, 'recent')).toEqual(['cloud'])

    cleanAll(db)
    expect(syncedIds(db)).toEqual([])
    expect(claimCount(db)).toBe(0)
  })
})
