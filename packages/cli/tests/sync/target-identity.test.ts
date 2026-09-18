import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generateRecordId } from '@aiusage/core'
import type { StatsRecord } from '@aiusage/core'
import type { SyncConfig } from '../../src/config.js'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { getClaimingTargets, getNamespaceVerdicts, recordNamespaceVerdict, replaceNamespaceClaims } from '../../src/db/sync-claims.js'
import { insertSyncedRecord, mergeSyncedRecordsIntoRecords } from '../../src/db/synced-records.js'
import { adoptLegacySyncTarget, getLegacySyncTarget, getSyncTarget } from '../../src/sync/target.js'
import { SyncOrchestrator } from '../../src/sync/index.js'
import { mapStatsRecordToSyncRecord } from '../../src/sync/mapper.js'
import { knownSyncTargets } from '../../src/commands/sync.js'
import { FakeSyncBackend } from './helpers/fake-backend.js'

// The sync target key scopes consent, publish bookkeeping and record claims.
// Two configurations may share it only when they address the same physical
// store, otherwise reconciling one prunes rows the other still carries.

const github = (over: Partial<SyncConfig> = {}): SyncConfig => ({ backend: 'github', repo: 'org/usage', ...over })
const s3 = (over: Partial<SyncConfig> = {}): SyncConfig => ({ backend: 's3', bucket: 'usage', ...over })

describe('getSyncTarget', () => {
  it('keeps the legacy keys for default configurations', () => {
    expect(getSyncTarget(github())).toBe('github:org/usage')
    expect(getSyncTarget(github({ branch: 'main' }))).toBe('github:org/usage')
    expect(getSyncTarget(github({ branch: ' main ' }))).toBe('github:org/usage')
    expect(getSyncTarget(s3())).toBe('s3:usage')
    expect(getSyncTarget(s3({ prefix: 'aiusage/' }))).toBe('s3:usage')
    expect(getSyncTarget(s3({ prefix: '/aiusage' }))).toBe('s3:usage')
    expect(getSyncTarget(s3({ endpoint: 'https://s3.amazonaws.com/' }))).toBe('s3:usage')
    expect(getSyncTarget(s3({ region: 'eu-west-1' }))).toBe('s3:usage')
    expect(getSyncTarget({ backend: 'cloud' })).toBe('cloud')
    expect(getSyncTarget(undefined)).toBeNull()
    expect(getSyncTarget({ backend: 'github' })).toBeNull()
  })

  it('distinguishes branches of the same repository', () => {
    const main = getSyncTarget(github())
    const other = getSyncTarget(github({ branch: 'usage-2026' }))
    expect(other).toBe('github:org/usage?branch=usage-2026')
    expect(other).not.toBe(main)
    expect(getSyncTarget(github({ branch: 'usage-2026' }))).toBe(other)
  })

  it('distinguishes prefixes of the same bucket, with normalised spelling', () => {
    const a = getSyncTarget(s3({ prefix: 'team-a/' }))
    const b = getSyncTarget(s3({ prefix: 'team-b/' }))
    expect(a).toBe('s3:usage?prefix=team-a%2F')
    expect(a).not.toBe(b)
    expect(getSyncTarget(s3({ prefix: 'team-a' }))).toBe(a)
    expect(getSyncTarget(s3({ prefix: '/team-a/' }))).toBe(a)
    expect(a).not.toBe(getSyncTarget(s3()))
  })

  it('distinguishes the same bucket name on different endpoints', () => {
    const r2 = getSyncTarget(s3({ endpoint: 'https://acct.r2.cloudflarestorage.com' }))
    const minio = getSyncTarget(s3({ endpoint: 'https://minio.internal:9000' }))
    expect(r2).toBe('s3:usage?endpoint=https%3A%2F%2Facct.r2.cloudflarestorage.com')
    expect(r2).not.toBe(minio)
    expect(r2).not.toBe(getSyncTarget(s3()))
    expect(getSyncTarget(s3({ endpoint: 'https://acct.r2.cloudflarestorage.com/' }))).toBe(r2)
    expect(getSyncTarget(s3({ endpoint: 'https://acct.r2.cloudflarestorage.com', prefix: 'x/' })))
      .toBe('s3:usage?prefix=x%2F&endpoint=https%3A%2F%2Facct.r2.cloudflarestorage.com')
  })

  it('reports the legacy key only when it differs from the current one', () => {
    expect(getLegacySyncTarget(github())).toBeNull()
    expect(getLegacySyncTarget(github({ branch: 'x' }))).toBe('github:org/usage')
    expect(getLegacySyncTarget(s3())).toBeNull()
    expect(getLegacySyncTarget(s3({ prefix: 'p/' }))).toBe('s3:usage')
    expect(getLegacySyncTarget(s3({ endpoint: 'https://e' }))).toBe('s3:usage')
    expect(getLegacySyncTarget({ backend: 'cloud' })).toBeNull()
    expect(getLegacySyncTarget(undefined)).toBeNull()
  })
})

describe('adoptLegacySyncTarget', () => {
  let dir: string
  let db: Database.Database
  const config = s3({ prefix: 'team-a/' })
  const target = getSyncTarget(config)!
  const legacy = 's3:usage'
  const state = () => JSON.parse(readFileSync(join(dir, 'state.json'), 'utf-8'))
  const rows = (table: string, t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE target = ?`).get(t) as { n: number }).n

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiusage-target-'))
    db = new Database(':memory:')
    initializeDatabase(db)
    writeFileSync(join(dir, 'state.json'), JSON.stringify({
      deviceInstanceId: 'me',
      lastSyncStatus: 'ok',
      lastSyncTarget: legacy,
      syncConsents: { [legacy]: { syncConsentAt: 1, syncConsentTarget: 'fp' } },
      syncTargets: { [legacy]: { lastSyncAt: 2, lastSyncStatus: 'ok', lastSyncTarget: legacy } },
    }))
    insertRecord(db, {
      id: 'r1', ts: 1, ingestedAt: 1, updatedAt: 1, lineOffset: 0, tool: 'claude-code', model: 'm', provider: 'p',
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0, cost: 0,
      costSource: 'pricing', sessionId: 's', sourceFile: 'C:\\s.jsonl', device: 'D', deviceInstanceId: 'me',
    })
    db.prepare(`INSERT INTO sync_record_state (record_id, target, synced_at) VALUES ('r1', ?, 5)`).run(legacy)
    db.prepare(`INSERT INTO synced_records (id, ts, tool, model, provider, session_key, device, device_instance_id, updated_at) VALUES ('p1', 1, 't', 'm', 'p', 'k', 'X', 'device-x', 1)`).run()
    replaceNamespaceClaims(db, legacy, 'device-x', ['p1'])
    db.prepare(`INSERT INTO sync_retired_wire_ids (target, wire_id) VALUES (?, 'old')`).run(legacy)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('copies state and bookkeeping recorded under the legacy key, once, leaving the legacy key in place', () => {
    const first = adoptLegacySyncTarget(dir, db, config)
    expect(first).toEqual({ target, legacy, stateCopied: true, syncStateRows: 1, claimRows: 1, retiredWireIdRows: 1 })

    const s = state()
    expect(s.syncConsents[target]).toEqual({ syncConsentAt: 1, syncConsentTarget: 'fp' })
    expect(s.syncConsents[legacy]).toEqual({ syncConsentAt: 1, syncConsentTarget: 'fp' })
    expect(s.syncTargets[target]).toEqual({ lastSyncAt: 2, lastSyncStatus: 'ok', lastSyncTarget: target })
    expect(s.syncTargets[legacy].lastSyncTarget).toBe(legacy)
    for (const table of ['sync_record_state', 'sync_record_claims', 'sync_retired_wire_ids']) {
      expect(rows(table, target)).toBe(1)
      expect(rows(table, legacy)).toBe(1)
    }
    expect(getClaimingTargets(db, 'p1').sort()).toEqual([legacy, target].sort())

    // Idempotent: a second call copies nothing, even after the legacy key gained rows.
    db.prepare(`INSERT INTO sync_retired_wire_ids (target, wire_id) VALUES (?, 'newer')`).run(legacy)
    const second = adoptLegacySyncTarget(dir, db, config)
    expect(second).toEqual({ target, legacy, stateCopied: false, syncStateRows: 0, claimRows: 0, retiredWireIdRows: 0 })
    expect(rows('sync_retired_wire_ids', target)).toBe(1)
  })

  it('does nothing for a default configuration or when the new key already has state', () => {
    expect(adoptLegacySyncTarget(dir, db, s3())).toBeNull()
    expect(adoptLegacySyncTarget(dir, db, { backend: 'cloud' })).toBeNull()

    replaceNamespaceClaims(db, target, 'device-y', ['p9'])
    const result = adoptLegacySyncTarget(dir, db, config)
    expect(result?.claimRows).toBe(0)
    expect(getClaimingTargets(db, 'p1')).toEqual([legacy])
    expect(result?.syncStateRows).toBe(1)
  })

  it('never copies namespace verdicts: a verdict permits deletion and was made by whoever synced under the legacy key', () => {
    recordNamespaceVerdict(db, legacy, 'device-x', 7)
    const result = adoptLegacySyncTarget(dir, db, config)
    expect(result?.claimRows).toBe(1)
    expect(getNamespaceVerdicts(db, 'device-x').get(legacy)).toBe(7)
    expect(getNamespaceVerdicts(db, 'device-x').has(target)).toBe(false)
  })

  it('keeps the legacy key among the known targets: it may still be the key of another configuration', () => {
    adoptLegacySyncTarget(dir, db, config)
    expect(knownSyncTargets(state(), target)).toEqual([legacy, target].sort())
    expect(knownSyncTargets({ ...state(), syncTargets: { ...state().syncTargets, cloud: {} } }, target)).toEqual(['cloud', legacy, target].sort())
    expect(knownSyncTargets(null, target)).toEqual([target])
  })
})

describe('a configuration whose key changed next to one that kept it', () => {
  // Before the upgrade, branch `main` and branch `dev` of one repository
  // shared the key `github:org/usage`. After it, `dev` gets its own key and
  // adopts the old one, but `main` still syncs under the old key — so the
  // old key must keep counting as a target that has not judged anything yet.
  const X = 'device-x'
  const ME = 'device-me'
  const DAY = Date.UTC(2026, 8, 6, 12, 0, 0)
  const mainConfig = github()
  const devConfig = github({ branch: 'dev' })
  const mainTarget = getSyncTarget(mainConfig)!
  const devTarget = getSyncTarget(devConfig)!

  function local(n: number): StatsRecord {
    return {
      id: generateRecordId(X, `msg_${n}`, 0), ts: DAY + n * 60_000, ingestedAt: DAY, updatedAt: DAY, lineOffset: 100 * (n + 1),
      tool: 'claude-code', model: 'm', provider: 'anthropic', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 'sess', sourceFile: 'C:\\s.jsonl', device: 'X', deviceInstanceId: X,
    }
  }
  const syncedIds = (db: Database.Database) =>
    (db.prepare(`SELECT id FROM synced_records WHERE device_instance_id = ? ORDER BY id`).all(X) as Array<{ id: string }>).map(r => r.id)

  it('syncing the changed configuration first never deletes a row only the unchanged one carries', async () => {
    expect(getLegacySyncTarget(devConfig)).toBe(mainTarget)
    const dbX = new Database(':memory:'); initializeDatabase(dbX)
    const dbMe = new Database(':memory:'); initializeDatabase(dbMe)
    const main = new FakeSyncBackend()
    const dev = new FakeSyncBackend()
    const records = [0, 1, 2].map(local)
    const wire = records.map(mapStatsRecordToSyncRecord)
    for (const r of records.slice(0, 2)) insertRecord(dbX, r)
    await new SyncOrchestrator(dbX, main, { deviceInstanceId: X, target: mainTarget, consentVerified: true }).sync() // main: r0 r1
    dbX.prepare(`DELETE FROM records WHERE id = ?`).run(records[0].id)
    insertRecord(dbX, records[2])
    await new SyncOrchestrator(dbX, dev, { deviceInstanceId: X, target: devTarget, consentVerified: true }).sync() // dev: r1 r2

    // ME mirrored both branches under the shared key before claims existed.
    for (const w of wire) insertSyncedRecord(dbMe, w)
    dbMe.prepare(`UPDATE synced_records SET unclaimed_since = 0`).run()
    mergeSyncedRecordsIntoRecords(dbMe, ME)
    const state = { deviceInstanceId: ME, syncTargets: { [mainTarget]: { lastSyncAt: 1, lastSyncStatus: 'ok' as const, lastSyncTarget: mainTarget } } }

    const known = knownSyncTargets(state, devTarget)
    expect(known).toEqual([mainTarget, devTarget].sort())
    const first = await new SyncOrchestrator(dbMe, dev, { deviceInstanceId: ME, target: devTarget, consentVerified: true, knownTargets: known }).sync()
    expect(first.status).toBe('ok')
    expect(first.prunedCount).toBe(0)
    expect(syncedIds(dbMe)).toEqual(wire.map(w => w.id).sort())
    expect(getClaimingTargets(dbMe, wire[0].id)).toEqual([])

    // The unchanged configuration claims what it carries the next time it syncs.
    await new SyncOrchestrator(dbMe, main, { deviceInstanceId: ME, target: mainTarget, consentVerified: true, knownTargets: known }).sync()
    expect(getClaimingTargets(dbMe, wire[0].id)).toEqual([mainTarget])
    expect(syncedIds(dbMe)).toEqual(wire.map(w => w.id).sort())
  })
})

describe('distinct stores never share claims', () => {
  const X = 'device-x'
  const B = 'device-b'
  const DAY = Date.UTC(2026, 8, 6, 12, 0, 0)

  function local(n: number): StatsRecord {
    return {
      id: generateRecordId(X, `msg_${n}`, 0), ts: DAY + n * 60_000, ingestedAt: DAY, updatedAt: DAY, lineOffset: 100 * (n + 1),
      tool: 'claude-code', model: 'm', provider: 'anthropic', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 'sess', sourceFile: 'C:\\s.jsonl', device: 'X', deviceInstanceId: X,
    }
  }

  const sync = (db: Database.Database, backend: FakeSyncBackend, device: string, target: string) =>
    new SyncOrchestrator(db, backend, { deviceInstanceId: device, target, consentVerified: true }).sync()

  it.each([
    ['same repository, different branches', github(), github({ branch: 'other' })],
    ['same bucket, different prefixes', s3({ prefix: 'a/' }), s3({ prefix: 'b/' })],
    ['same bucket name, different endpoints', s3({ endpoint: 'https://one.example' }), s3({ endpoint: 'https://two.example' })],
  ])('%s: dropping a record from one store keeps it while the other still carries it', async (_name, configA, configB) => {
    const targetA = getSyncTarget(configA)!
    const targetB = getSyncTarget(configB)!
    expect(targetA).not.toBe(targetB)

    const dbX = new Database(':memory:'); initializeDatabase(dbX)
    const dbB = new Database(':memory:'); initializeDatabase(dbB)
    const storeA = new FakeSyncBackend()
    const storeB = new FakeSyncBackend()
    const records = [0, 1].map(local)
    for (const r of records) insertRecord(dbX, r)
    await sync(dbX, storeA, X, targetA)
    await sync(dbX, storeB, X, targetB)
    await sync(dbB, storeA, B, targetA)
    await sync(dbB, storeB, B, targetB)
    const R = mapStatsRecordToSyncRecord(records[0]).id
    expect(getClaimingTargets(dbB, R).sort()).toEqual([targetA, targetB].sort())

    dbX.prepare(`DELETE FROM records WHERE id = ?`).run(records[0].id)
    await sync(dbX, storeB, X, targetB)
    const result = await sync(dbB, storeB, B, targetB)
    expect(result.prunedCount ?? 0).toBe(0)
    expect(getClaimingTargets(dbB, R)).toEqual([targetA])
    expect(dbB.prepare(`SELECT COUNT(*) AS n FROM synced_records WHERE id = ?`).get(R)).toEqual({ n: 1 })
  })
})
