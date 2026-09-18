import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generateRecordId, generateSyncRecordId } from '@aiusage/core'
import type { StatsRecord, SyncRecord } from '@aiusage/core'
import type { SyncConfig } from '../../src/config.js'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { countSyncTargetBookkeeping, getClaimingTargets, getNamespaceVerdicts, nextSyncTick, recordNamespaceVerdict, replaceNamespaceClaims } from '../../src/db/sync-claims.js'
import { insertSyncedRecord, mergeSyncedRecordsIntoRecords } from '../../src/db/synced-records.js'
import { adoptLegacySyncTarget, getSyncTarget, knownSyncTargets, otherSyncTargets } from '../../src/sync/target.js'
import { forgetSyncTarget, repairSyncContamination } from '../../src/sync/repair.js'
import { SyncOrchestrator } from '../../src/sync/index.js'
import { mapStatsRecordToSyncRecord } from '../../src/sync/mapper.js'
import { formatForgetTargetReport, formatRepairReport, syncUsageError } from '../../src/commands/sync.js'
import { getState, setSyncTargetState } from '../../src/init.js'
import { FakeSyncBackend } from './helpers/fake-backend.js'

// A target key that nothing syncs under any more still counts: its claims
// keep every row they name, and unresolved rows wait for a verdict it will
// never record. `aiusage sync --repair --forget-target <key>` is the explicit
// way out. It only releases bookkeeping — deletion still happens through the
// normal prune, once every remaining known target has judged the namespace.

const X = 'device-x'
const ME = 'device-me'
const DAY = Date.UTC(2026, 8, 6, 12, 0, 0)
const config: SyncConfig = { backend: 'github', repo: 'org/usage', branch: 'dev' }
const NEW = getSyncTarget(config)!
const OLD = 'github:org/usage'

function local(owner: string, n: number, overrides: Partial<StatsRecord> = {}): StatsRecord {
  const sourceFile = overrides.sourceFile ?? `C:\\Users\\${owner}\\.claude\\projects\\p\\s.jsonl`
  const lineOffset = overrides.lineOffset ?? 100 * (n + 1)
  return {
    id: generateRecordId(owner, `msg_${n}`, 0), ts: DAY + n * 60_000, ingestedAt: DAY, updatedAt: DAY, lineOffset,
    tool: 'claude-code', model: 'm', provider: 'anthropic', inputTokens: 1 + n, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0,
    thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: `sess-${owner}`, sourceFile, device: owner.toUpperCase(), deviceInstanceId: owner,
    ...overrides,
  }
}

function newDb(): Database.Database {
  const db = new Database(':memory:')
  initializeDatabase(db)
  return db
}

const sync = (db: Database.Database, backend: FakeSyncBackend, device: string, target: string, knownTargets: string[]) =>
  new SyncOrchestrator(db, backend, { deviceInstanceId: device, target, consentVerified: true, knownTargets }).sync()

const syncedIds = (db: Database.Database) =>
  (db.prepare(`SELECT id FROM synced_records WHERE device_instance_id = ? ORDER BY id`).all(X) as Array<{ id: string }>).map(r => r.id)
const mergedIds = (db: Database.Database) =>
  (db.prepare(`SELECT id FROM records WHERE origin = 'synced' AND device_instance_id = ? ORDER BY id`).all(X) as Array<{ id: string }>).map(r => r.id)
const unclaimedSince = (db: Database.Database, id: string) =>
  (db.prepare(`SELECT unclaimed_since FROM synced_records WHERE id = ?`).get(id) as { unclaimed_since: number | null } | undefined)?.unclaimed_since

/** Everything the forget may touch, for "nothing changed" comparisons. */
const dump = (db: Database.Database) => ({
  claims: db.prepare(`SELECT * FROM sync_record_claims ORDER BY target, device_instance_id, record_id`).all(),
  verdicts: db.prepare(`SELECT * FROM sync_namespace_verdicts ORDER BY target, device_instance_id`).all(),
  syncState: db.prepare(`SELECT * FROM sync_record_state ORDER BY target, record_id`).all(),
  retired: db.prepare(`SELECT * FROM sync_retired_wire_ids ORDER BY target, wire_id`).all(),
  synced: db.prepare(`SELECT id, unclaimed_since FROM synced_records ORDER BY id`).all(),
  records: db.prepare(`SELECT id, origin FROM records ORDER BY id`).all(),
})

describe('sync --repair --forget-target', () => {
  let dir: string
  let dbMe: Database.Database
  let devStore: FakeSyncBackend
  let mainStore: FakeSyncBackend
  let r0: string
  let r1: string
  let r2: string
  let a5: string
  let oldA5: string
  const statePath = () => join(dir, 'state.json')
  const state = () => getState(dir)!
  const rawState = () => readFileSync(statePath(), 'utf-8')

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'aiusage-forget-'))
    writeFileSync(statePath(), JSON.stringify({
      deviceInstanceId: ME,
      lastSyncStatus: 'ok',
      lastSyncTarget: OLD,
      syncConsents: { [OLD]: { syncConsentAt: 1, syncConsentTarget: 'fp' } },
      syncTargets: { [OLD]: { lastSyncAt: 2, lastSyncStatus: 'ok', lastSyncTarget: OLD } },
    }))
    dbMe = newDb()
    devStore = new FakeSyncBackend()
    mainStore = new FakeSyncBackend()

    // X publishes r0 r1 r2 (Claude Code) and one Antigravity record, whose
    // wire id up to 1.5.17 was sha256(device, sourceFile, lineOffset) and is
    // now the parser id.
    const dbX = newDb()
    const antigravity = local(X, 5, { tool: 'antigravity', sourceFile: 'C:\\ag\\state.db', lineOffset: 3 })
    const records = [local(X, 0), local(X, 1), local(X, 2), antigravity]
    const wire: SyncRecord[] = records.map(mapStatsRecordToSyncRecord)
    ;[r0, r1, r2, a5] = wire.map(w => w.id)
    oldA5 = generateSyncRecordId(X, antigravity.sourceFile, antigravity.lineOffset)
    expect(a5).not.toBe(oldA5)

    // Branch main still carries r0 r1 r2; branch dev (this device's
    // configuration) carries r1 r2 and the Antigravity record under its new id.
    for (const r of records.slice(0, 3)) insertRecord(dbX, r)
    await sync(dbX, mainStore, X, OLD, [OLD])
    dbX.prepare(`DELETE FROM records WHERE id = ?`).run(records[0].id)
    insertRecord(dbX, antigravity)
    await sync(dbX, devStore, X, NEW, [NEW])
    dbX.close()

    // ME mirrored branch dev before the upgrade, under the shared key: every
    // row claimed by OLD, the Antigravity record under its old wire id, plus
    // publish bookkeeping and a retired wire id under OLD.
    const legacyRows = [wire[0], wire[1], wire[2], { ...wire[3], id: oldA5 }]
    for (const w of legacyRows) insertSyncedRecord(dbMe, w)
    replaceNamespaceClaims(dbMe, OLD, X, legacyRows.map(r => r.id))
    recordNamespaceVerdict(dbMe, OLD, X, 1)
    mergeSyncedRecordsIntoRecords(dbMe, ME)
    const mine = local(ME, 9)
    insertRecord(dbMe, mine)
    dbMe.prepare(`INSERT INTO sync_record_state (record_id, target, synced_at) VALUES (?, ?, 5)`).run(mine.id, OLD)
    dbMe.prepare(`INSERT INTO sync_retired_wire_ids (target, wire_id) VALUES (?, 'retired-old')`).run(OLD)

    // Upgrade: the dev configuration gets its own key, adopts OLD's state and
    // syncs. Its verified snapshot lacks r0 and the old Antigravity id, so it
    // releases its copied claims on them — but OLD's claims keep both rows.
    adoptLegacySyncTarget(dir, dbMe, config)
    const first = await sync(dbMe, devStore, ME, NEW, knownSyncTargets(state(), NEW))
    setSyncTargetState(dir, NEW, { lastSyncAt: 3, lastSyncStatus: 'ok' })
    expect(first.status).toBe('ok')
    expect(first.prunedCount).toBe(0)
    expect(syncedIds(dbMe)).toEqual([r0, r1, r2, a5, oldA5].sort())
    expect(getClaimingTargets(dbMe, r0)).toEqual([OLD])
    expect(getClaimingTargets(dbMe, oldA5)).toEqual([OLD])
    expect(getClaimingTargets(dbMe, r1).sort()).toEqual([OLD, NEW].sort())
    expect(getClaimingTargets(dbMe, a5)).toEqual([NEW])
    expect(knownSyncTargets(state(), NEW)).toEqual([OLD, NEW].sort())
  })

  afterEach(() => {
    dbMe.close()
    try { chmodSync(statePath(), 0o644) } catch { /* already writable */ }
    rmSync(dir, { recursive: true, force: true })
  })

  it('rows only the forgotten key claimed become unresolved at the tick taken before the change, and go only with the next sync', async () => {
    const tick = nextSyncTick(dbMe)
    const report = forgetSyncTarget(dbMe, { aiusageDir: dir, target: OLD, currentTarget: NEW, apply: true })
    expect(report.applied).toBe(true)
    expect(report.tick).toBe(tick)
    expect(report.bookkeeping).toEqual({ claimRows: 4, verdictRows: 1, syncStateRows: 1, retiredWireIdRows: 1, lastClaimRows: 2 })
    expect(report.remainingTargets).toEqual([NEW])

    // The forget itself deletes nothing.
    expect(syncedIds(dbMe)).toEqual([r0, r1, r2, a5, oldA5].sort())
    expect(mergedIds(dbMe)).toEqual([r0, r1, r2, a5, oldA5].sort())
    expect(unclaimedSince(dbMe, r0)).toBe(tick)
    expect(unclaimedSince(dbMe, oldA5)).toBe(tick)
    expect(getClaimingTargets(dbMe, r0)).toEqual([])
    expect(countSyncTargetBookkeeping(dbMe, OLD)).toEqual({ claimRows: 0, verdictRows: 0, syncStateRows: 0, retiredWireIdRows: 0, lastClaimRows: 0 })
    expect(getNamespaceVerdicts(dbMe, X).has(OLD)).toBe(false)

    // The current target is now the only known target; its next sync judges
    // X's namespace at a later tick and prunes what it does not carry.
    const known = knownSyncTargets(state(), NEW)
    expect(known).toEqual([NEW])
    const next = await sync(dbMe, devStore, ME, NEW, known)
    expect(next.status).toBe('ok')
    expect(next.prunedCount).toBe(2)
    expect(syncedIds(dbMe)).toEqual([r1, r2, a5].sort())
    expect(mergedIds(dbMe)).toEqual([r1, r2, a5].sort())
    for (const id of [r1, r2, a5]) {
      expect(getClaimingTargets(dbMe, id)).toEqual([NEW])
      expect(unclaimedSince(dbMe, id)).toBeNull()
    }
  })

  it('a row the current target still claims is untouched', async () => {
    expect(unclaimedSince(dbMe, r1)).toBeNull()
    forgetSyncTarget(dbMe, { aiusageDir: dir, target: OLD, currentTarget: NEW, apply: true })
    expect(unclaimedSince(dbMe, r1)).toBeNull()
    expect(unclaimedSince(dbMe, r2)).toBeNull()
    expect(getClaimingTargets(dbMe, r1)).toEqual([NEW])
    const mergedBefore = dbMe.prepare(`SELECT * FROM records WHERE id = ?`).get(r1)
    await sync(dbMe, devStore, ME, NEW, knownSyncTargets(state(), NEW))
    expect(dbMe.prepare(`SELECT * FROM records WHERE id = ?`).get(r1)).toEqual(mergedBefore)
  })

  it('a retired Antigravity-style wire id mirrored before the upgrade and claimed only under the old key is gone after forget + sync', async () => {
    expect(syncedIds(dbMe)).toContain(oldA5)
    forgetSyncTarget(dbMe, { aiusageDir: dir, target: OLD, currentTarget: NEW, apply: true })
    expect(syncedIds(dbMe)).toContain(oldA5)
    await sync(dbMe, devStore, ME, NEW, knownSyncTargets(state(), NEW))
    expect(syncedIds(dbMe)).not.toContain(oldA5)
    expect(mergedIds(dbMe)).not.toContain(oldA5)
    expect(syncedIds(dbMe)).toContain(a5)
    expect(getClaimingTargets(dbMe, a5)).toEqual([NEW])
  })

  it('dry run: reports the counts and changes neither the database nor state', () => {
    const before = dump(dbMe)
    const stateBefore = rawState()
    const report = forgetSyncTarget(dbMe, { aiusageDir: dir, target: OLD, currentTarget: NEW })
    expect(report).toEqual({
      target: OLD,
      bookkeeping: { claimRows: 4, verdictRows: 1, syncStateRows: 1, retiredWireIdRows: 1, lastClaimRows: 2 },
      inState: true,
      applied: false,
      remainingTargets: [NEW],
    })
    expect(dump(dbMe)).toEqual(before)
    expect(rawState()).toBe(stateBefore)
    const text = formatForgetTargetReport(report)
    expect(text).toContain(OLD)
    expect(text).toContain('4 claim')
    expect(text).toContain('2 ')
    expect(text).toContain('--apply')
    expect(text).toContain(NEW)
  })

  it('refuses the current target, an unknown key, and --forget-target without --repair', () => {
    const before = dump(dbMe)
    expect(() => forgetSyncTarget(dbMe, { aiusageDir: dir, target: NEW, currentTarget: NEW, apply: true })).toThrow(/configured|current/i)
    expect(() => forgetSyncTarget(dbMe, { aiusageDir: dir, target: 's3:nowhere', currentTarget: NEW, apply: true })).toThrow(/unknown/i)
    expect(dump(dbMe)).toEqual(before)
    expect(knownSyncTargets(state(), NEW)).toEqual([OLD, NEW].sort())

    expect(syncUsageError({ forgetTarget: OLD })).toMatch(/--repair/)
    expect(syncUsageError({ forgetTarget: OLD, apply: true })).toMatch(/--repair/)
    expect(syncUsageError({ repair: true, forgetTarget: OLD })).toBeNull()
    expect(syncUsageError({ repair: true })).toBeNull()
    expect(syncUsageError({})).toBeNull()

    // A key that has been forgotten completely is unknown too.
    forgetSyncTarget(dbMe, { aiusageDir: dir, target: OLD, currentTarget: NEW, apply: true })
    expect(() => forgetSyncTarget(dbMe, { aiusageDir: dir, target: OLD, currentTarget: NEW, apply: true })).toThrow(/unknown/i)
  })

  it('is idempotent and safe against a crash between the database commit and the state write', async () => {
    // state.json cannot be written: the database part commits, the state part fails.
    chmodSync(statePath(), 0o444)
    const tick = nextSyncTick(dbMe)
    expect(() => forgetSyncTarget(dbMe, { aiusageDir: dir, target: OLD, currentTarget: NEW, apply: true })).toThrow(/re-run/i)
    const afterDb = dump(dbMe)
    expect(countSyncTargetBookkeeping(dbMe, OLD)).toEqual({ claimRows: 0, verdictRows: 0, syncStateRows: 0, retiredWireIdRows: 0, lastClaimRows: 0 })
    expect(unclaimedSince(dbMe, r0)).toBe(tick)
    expect(state().syncConsents?.[OLD]).toBeDefined()
    expect(knownSyncTargets(state(), NEW)).toEqual([OLD, NEW].sort())

    // With the key still known, nothing is deleted early.
    const early = await sync(dbMe, devStore, ME, NEW, knownSyncTargets(state(), NEW))
    expect(early.prunedCount).toBe(0)
    expect(syncedIds(dbMe)).toEqual([r0, r1, r2, a5, oldA5].sort())
    expect(unclaimedSince(dbMe, r0)).toBe(tick)

    // Re-running completes it: the database is untouched, the key leaves state.
    chmodSync(statePath(), 0o644)
    const afterSync = dump(dbMe)
    const again = forgetSyncTarget(dbMe, { aiusageDir: dir, target: OLD, currentTarget: NEW, apply: true })
    expect(again.applied).toBe(true)
    expect(again.bookkeeping).toEqual({ claimRows: 0, verdictRows: 0, syncStateRows: 0, retiredWireIdRows: 0, lastClaimRows: 0 })
    expect(dump(dbMe)).toEqual(afterSync)
    expect(afterSync.claims).toEqual(afterDb.claims)
    const s = state()
    expect(s.syncConsents?.[OLD]).toBeUndefined()
    expect(s.syncTargets?.[OLD]).toBeUndefined()
    expect(s.lastSyncTarget).not.toBe(OLD)
    expect(s.syncTargets?.[NEW]).toBeDefined()
    expect(knownSyncTargets(s, NEW)).toEqual([NEW])

    // Only now does the normal prune settle the released rows.
    const settled = await sync(dbMe, devStore, ME, NEW, knownSyncTargets(state(), NEW))
    expect(settled.prunedCount).toBe(2)
    expect(syncedIds(dbMe)).toEqual([r1, r2, a5].sort())
  })

  it('cannot be undone by adoptLegacySyncTarget: the key\'s rows are gone, so nothing is copied, and it is no longer a known target', () => {
    forgetSyncTarget(dbMe, { aiusageDir: dir, target: OLD, currentTarget: NEW, apply: true })
    const before = dump(dbMe)
    const stateBefore = rawState()
    const adoption = adoptLegacySyncTarget(dir, dbMe, config)
    expect(adoption).toEqual({ target: NEW, legacy: OLD, stateCopied: false, syncStateRows: 0, claimRows: 0, retiredWireIdRows: 0 })
    expect(dump(dbMe)).toEqual(before)
    expect(rawState()).toBe(stateBefore)
    expect(knownSyncTargets(state(), NEW)).toEqual([NEW])
    expect(otherSyncTargets(dbMe, state(), NEW)).toEqual([])
  })

  it('syncing under the forgotten key later makes it a known target again and pulls its rows back', async () => {
    forgetSyncTarget(dbMe, { aiusageDir: dir, target: OLD, currentTarget: NEW, apply: true })
    await sync(dbMe, devStore, ME, NEW, knownSyncTargets(state(), NEW))
    expect(syncedIds(dbMe)).toEqual([r1, r2, a5].sort())

    // Branch main is used again: r0 comes back under its key, and the key is recorded again.
    const result = await sync(dbMe, mainStore, ME, OLD, knownSyncTargets(state(), OLD))
    setSyncTargetState(dir, OLD, { lastSyncAt: 9, lastSyncStatus: 'ok' })
    expect(result.status).toBe('ok')
    expect(result.pulledCount).toBe(1)
    expect(syncedIds(dbMe)).toEqual([r0, r1, r2, a5].sort())
    expect(mergedIds(dbMe)).toContain(r0)
    expect(getClaimingTargets(dbMe, r0)).toEqual([OLD])
    expect(getClaimingTargets(dbMe, r1).sort()).toEqual([OLD, NEW].sort())
    expect(knownSyncTargets(state(), NEW)).toEqual([OLD, NEW].sort())
    expect(countSyncTargetBookkeeping(dbMe, OLD).claimRows).toBe(3)
  })

  it('plain sync --repair names the non-current key as a hint and changes nothing', async () => {
    const before = dump(dbMe)
    const stateBefore = rawState()
    const others = otherSyncTargets(dbMe, state(), NEW)
    expect(others).toEqual([OLD])
    const report = await repairSyncContamination(dbMe, { deviceInstanceId: ME, target: NEW, backend: devStore })
    const text = formatRepairReport({ ...report, otherTargets: others })
    expect(text).toContain(OLD)
    expect(text).toContain('--forget-target')
    expect(dump(dbMe)).toEqual(before)
    expect(rawState()).toBe(stateBefore)

    // Without a non-current key there is no hint.
    expect(formatRepairReport({ ...report, otherTargets: [] })).not.toContain('--forget-target')
    expect(formatRepairReport(report)).not.toContain('--forget-target')

    // A key known only from state, or only from a verdict, is named too.
    expect(otherSyncTargets(dbMe, { ...state(), syncTargets: { ...state().syncTargets, cloud: {} } }, NEW).sort()).toEqual([OLD, 'cloud'].sort())
    recordNamespaceVerdict(dbMe, 's3:archive', X, 1)
    expect(otherSyncTargets(dbMe, state(), NEW).sort()).toEqual([OLD, 's3:archive'].sort())
  })
})
