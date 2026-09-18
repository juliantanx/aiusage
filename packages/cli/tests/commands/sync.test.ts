import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatRepairReport, runSync, runSyncRepair } from '../../src/commands/sync.js'
import { replaceNamespaceClaims } from '../../src/db/sync-claims.js'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'

// Mock the init module
vi.mock('../../src/init.js', () => ({
  getState: vi.fn(),
  setState: vi.fn(),
  setSyncTargetState: vi.fn(),
}))

vi.mock('../../src/sync/consent.js', () => ({ verifyConsent: vi.fn(() => true) }))
vi.mock('../../src/sync/git.js', () => ({ GitSyncBackend: class {} }))
const repairCalls = vi.fn()
vi.mock('../../src/sync/repair.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/sync/repair.js')>('../../src/sync/repair.js')
  return {
    ...actual,
    repairSyncContamination: async (_db: unknown, options: unknown) => {
      repairCalls(options)
      return {
        deviceInstanceId: 'dev-123',
        local: { reflagRecordIds: [], echoSyncedIds: [], echoMergedIds: [], staleSyncStateCount: 0, wireIdCollisions: [], orphanedSyncedIds: [], orphanedDevices: [] },
        remote: null,
        applied: false,
      }
    },
  }
})
const orchestratorOptions = vi.fn()
vi.mock('../../src/sync/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/sync/index.js')>('../../src/sync/index.js')
  return {
    ...actual,
    SyncOrchestrator: class {
      constructor(_db: unknown, _backend: unknown, options: unknown) { orchestratorOptions(options) }
      async sync() { return { status: 'ok', pulledCount: 0, uploadedCount: 0, mergedCount: 0 } }
    },
  }
})

// Mock the config loading
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
})

describe('Sync Command', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    vi.clearAllMocks()
  })

  it('returns failed when no config exists', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValue(false)

    const result = await runSync(db)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('not configured')
  })

  it('returns blocked when consent is missing', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    const { getState } = await import('../../src/init.js')

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      sync: { backend: 'github', repo: 'user/repo' },
    }))
    vi.mocked(getState).mockReturnValue({
      deviceInstanceId: 'dev-123',
      lastSyncStatus: 'ok',
    })

    const result = await runSync(db)
    expect(result.status).toBe('blocked_pending_consent')
  })

  it('keeps the key clients up to 1.5.17 used for this configuration among the known targets', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    const { getState } = await import('../../src/init.js')
    const legacy = 'github:user/repo'
    const target = 'github:user/repo?branch=dev'

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      sync: { backend: 'github', repo: 'user/repo', branch: 'dev' },
    }))
    vi.mocked(getState).mockReturnValue({
      deviceInstanceId: 'dev-123',
      lastSyncStatus: 'ok',
      lastSyncTarget: legacy,
      syncConsents: { [target]: { syncConsentAt: 1, syncConsentTarget: 'fp' } },
      syncTargets: { [legacy]: { lastSyncAt: 1, lastSyncStatus: 'ok', lastSyncTarget: legacy } },
    })
    vi.stubEnv('AIUSAGE_GITHUB_TOKEN', 'token')
    try {
      const result = await runSync(db)
      expect(result.status).toBe('ok')
      // Named after the sync so the user can release it if it is abandoned.
      expect(result.lingeringLegacyTarget).toBe(legacy)
    } finally {
      vi.unstubAllEnvs()
    }
    expect(orchestratorOptions).toHaveBeenCalledTimes(1)
    // The old key may still be the current key of the default branch of the
    // same repository, so this configuration alone must never settle rows
    // recorded under it.
    expect(orchestratorOptions.mock.calls[0][0]).toMatchObject({ target, knownTargets: [legacy, target].sort() })
  })

  it('names the legacy key only while this device still counts it', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    const { getState } = await import('../../src/init.js')
    const legacy = 'github:user/repo'
    const target = 'github:user/repo?branch=dev'
    const consents = { [target]: { syncConsentAt: 1, syncConsentTarget: 'fp' }, [legacy]: { syncConsentAt: 1, syncConsentTarget: 'fp' } }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.stubEnv('AIUSAGE_GITHUB_TOKEN', 'token')
    try {
      // Default configuration: it has no legacy key, so the (identical) key it
      // syncs under is never reported.
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ sync: { backend: 'github', repo: 'user/repo' } }))
      vi.mocked(getState).mockReturnValue({ deviceInstanceId: 'dev-123', lastSyncStatus: 'ok', syncConsents: consents })
      expect((await runSync(db)).lingeringLegacyTarget).toBeUndefined()

      // Non-default branch whose legacy key is no longer listed or recorded.
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ sync: { backend: 'github', repo: 'user/repo', branch: 'dev' } }))
      vi.mocked(getState).mockReturnValue({ deviceInstanceId: 'dev-123', lastSyncStatus: 'ok', syncConsents: { [target]: consents[target] } })
      expect((await runSync(db)).lingeringLegacyTarget).toBeUndefined()

      // Not listed in state, but still holding claims in the database.
      replaceNamespaceClaims(db, legacy, 'peer', ['r1'])
      expect((await runSync(db)).lingeringLegacyTarget).toBe(legacy)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  describe('--repair --forget-target', () => {
    const legacy = 'github:user/repo'
    const target = 'github:user/repo?branch=dev'
    const claimRows = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM sync_record_claims WHERE target = ?`).get(t) as { n: number }).n

    async function configure(sync: Record<string, unknown>, state: Record<string, unknown>) {
      const { existsSync, readFileSync } = await import('node:fs')
      const { getState } = await import('../../src/init.js')
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ sync }))
      vi.mocked(getState).mockReturnValue({
        deviceInstanceId: 'dev-123',
        lastSyncStatus: 'ok',
        lastSyncTarget: legacy,
        syncConsents: { [legacy]: { syncConsentAt: 1, syncConsentTarget: 'fp' }, [target]: { syncConsentAt: 1, syncConsentTarget: 'fp' } },
        syncTargets: { [legacy]: { lastSyncAt: 1, lastSyncStatus: 'ok', lastSyncTarget: legacy }, [target]: { lastSyncAt: 2, lastSyncStatus: 'ok', lastSyncTarget: target } },
        ...state,
      })
    }

    beforeEach(() => {
      db.prepare(`INSERT INTO synced_records (id, ts, tool, model, provider, session_key, device, device_instance_id, updated_at) VALUES ('p1', 1, 't', 'm', 'p', 'k', 'X', 'device-x', 1)`).run()
      replaceNamespaceClaims(db, legacy, 'device-x', ['p1'])
      replaceNamespaceClaims(db, target, 'device-x', ['p1'])
    })

    it('forgets the legacy key: database first, then state, without touching the remote', async () => {
      await configure({ backend: 'github', repo: 'user/repo', branch: 'dev' }, {})
      const { setState } = await import('../../src/init.js')

      const dry = await runSyncRepair(db, { forgetTarget: legacy })
      expect(dry.status).toBe('ok')
      expect(dry.forget).toMatchObject({ target: legacy, applied: false, bookkeeping: { claimRows: 1, lastClaimRows: 0 }, remainingTargets: [target] })
      expect(claimRows(legacy)).toBe(1)
      expect(setState).not.toHaveBeenCalled()

      const applied = await runSyncRepair(db, { forgetTarget: legacy, apply: true })
      expect(applied.status).toBe('ok')
      expect(applied.forget).toMatchObject({ target: legacy, applied: true, bookkeeping: { claimRows: 1 } })
      expect(applied.report).toBeUndefined()
      expect(claimRows(legacy)).toBe(0)
      expect(claimRows(target)).toBe(1)
      expect(repairCalls).not.toHaveBeenCalled()
      expect(setState).toHaveBeenCalledTimes(1)
      expect(vi.mocked(setState).mock.calls[0][1]).toEqual({
        syncConsents: { [target]: { syncConsentAt: 1, syncConsentTarget: 'fp' } },
        syncTargets: { [target]: { lastSyncAt: 2, lastSyncStatus: 'ok', lastSyncTarget: target } },
        lastSyncTarget: undefined,
      })
    })

    it('refuses the configured target, including "cloud" while the cloud is the backend, and unknown keys', async () => {
      await configure({ backend: 'github', repo: 'user/repo', branch: 'dev' }, {})
      const current = await runSyncRepair(db, { forgetTarget: target, apply: true })
      expect(current.status).toBe('failed')
      expect(current.error).toMatch(/configured/)
      const unknown = await runSyncRepair(db, { forgetTarget: 's3:nowhere', apply: true })
      expect(unknown.status).toBe('failed')
      expect(unknown.error).toMatch(/nknown/)
      expect(claimRows(legacy)).toBe(1)

      await configure({ backend: 'cloud' }, { syncTargets: { cloud: { lastSyncAt: 1 }, [legacy]: { lastSyncAt: 1 } } })
      const cloud = await runSyncRepair(db, { forgetTarget: 'cloud', apply: true })
      expect(cloud.status).toBe('failed')
      expect(cloud.error).toMatch(/configured/)
      // A file-backend key is forgotten with the cloud configured: local bookkeeping only.
      const other = await runSyncRepair(db, { forgetTarget: legacy, apply: true })
      expect(other.status).toBe('ok')
      expect(other.forget?.applied).toBe(true)
      expect(claimRows(legacy)).toBe(0)
    })

    it('plain --repair names other recorded keys as a report-only hint', async () => {
      await configure({ backend: 'github', repo: 'user/repo', branch: 'dev' }, {})
      vi.stubEnv('AIUSAGE_GITHUB_TOKEN', 'token')
      try {
        const result = await runSyncRepair(db, {})
        expect(result.status).toBe('ok')
        expect(result.report?.otherTargets).toEqual([legacy])
        expect(repairCalls).toHaveBeenCalledWith(expect.objectContaining({ target, apply: undefined }))
        const text = formatRepairReport(result.report!)
        expect(text).toContain(legacy)
        expect(text).toContain('--forget-target')
      } finally {
        vi.unstubAllEnvs()
      }
      expect(claimRows(legacy)).toBe(1)
    })
  })
})
