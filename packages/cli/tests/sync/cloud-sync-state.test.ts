import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { StatsRecord } from '@aiusage/core'

// The whole client runs for real against a stubbed `fetch`: `runSync`, the
// orchestrator, the HTTP client, `state.json` and the database. Only the home
// directory is redirected, to a directory of this file's own.
const home = mkdtempSync(join(tmpdir(), 'aiusage-cloud-sync-state-'))
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  return { ...actual, homedir: () => home }
})

const { runSync } = await import('../../src/commands/sync.js')
const { AIUSAGE_DIR, CONFIG_PATH } = await import('../../src/config.js')
const { getState } = await import('../../src/init.js')
const { initializeDatabase } = await import('../../src/db/index.js')
const { insertRecord } = await import('../../src/db/records.js')
const { acquireCloudSyncLock } = await import('../../src/sync/cloud-lock.js')
const { mapStatsRecordToSyncRecord } = await import('../../src/sync/mapper.js')

const DEVICE = 'device-a'
const STATE_PATH = join(AIUSAGE_DIR, 'state.json')

interface PushBody {
  sync_generation: number
  records: Array<{ id: string; inputTokens: number; updatedAt: number }>
  tombstones: unknown[]
}

/** The cloud sync API, as far as the client can tell. */
const server = {
  generation: 1,
  records: new Map<string, Record<string, unknown>>(),
  pushes: [] as PushBody[],
  /** Runs while a push request is pending, before the server answers it. */
  duringPush: undefined as undefined | ((body: PushBody, index: number) => void),
  /** Push requests (0-based, counted over the whole test) the server answers with HTTP 500. */
  failPushes: new Set<number>(),
  pushRequests: 0,
  /** Record ids the server does not store, and reports in `rejected`. */
  rejectIds: new Set<string>(),
  /** Answer as a server from before `rejected` existed: no such field. */
  legacy: false,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

async function fakeFetch(input: unknown, init?: { method?: string; body?: string }): Promise<Response> {
  const url = new URL(String(input))
  if (url.pathname === '/api/cli/sync/pull') {
    return jsonResponse({
      records: [...server.records.values()],
      tombstones: [],
      next_cursor: null,
      has_more: false,
      sync_generation: server.generation,
    })
  }
  if (url.pathname === '/api/cli/sync/push') {
    const body = JSON.parse(init!.body!) as PushBody
    const index = server.pushRequests++
    await Promise.resolve()
    server.duringPush?.(body, index)
    if (server.failPushes.has(index)) return jsonResponse({ error: 'boom', error_code: 'server_error' }, 500)
    if (body.sync_generation < server.generation) {
      return jsonResponse({ error: 'Sync generation stale. Please pull first.', error_code: 'sync_generation_stale' }, 409)
    }
    server.pushes.push(body)
    const rejected = body.records.filter(r => server.rejectIds.has(r.id)).map(r => ({ id: r.id, reason: 'invalid_value' }))
    const stored = body.records.filter(r => !server.rejectIds.has(r.id))
    for (const record of stored) server.records.set(record.id, record)
    return jsonResponse({
      inserted: stored.length, updated: 0, skipped: rejected.length, sync_generation: server.generation,
      ...(server.legacy ? {} : { rejected }),
    })
  }
  throw new Error(`unexpected request: ${url.pathname}`)
}

function record(n: number, overrides: Partial<StatsRecord> = {}): StatsRecord {
  return {
    id: `r${n}`,
    ts: 1000 + n, ingestedAt: 1000, updatedAt: 1000, lineOffset: n,
    tool: 'codex', model: 'gpt-5.5', provider: 'openai',
    inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0,
    cost: 0, costSource: 'pricing', sessionId: 's1', sourceFile: '/logs/a.jsonl', device: 'G14', deviceInstanceId: DEVICE,
    ...overrides,
  }
}

function writeState(state: Record<string, unknown>): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8')
}

function syncedIds(db: Database.Database): string[] {
  return (db.prepare(`SELECT record_id FROM sync_record_state WHERE target = 'cloud' ORDER BY record_id`).all() as Array<{ record_id: string }>)
    .map(row => row.record_id)
}

/** Input tokens the server holds, by position of the record in its source file. */
function sentTokens(): number[] {
  return server.pushes.flatMap(push => push.records.map(r => r.inputTokens))
}

describe('cloud sync state (stubbed fetch, real runSync)', () => {
  let db: Database.Database

  beforeEach(() => {
    rmSync(AIUSAGE_DIR, { recursive: true, force: true })
    mkdirSync(AIUSAGE_DIR, { recursive: true })
    writeFileSync(CONFIG_PATH, JSON.stringify({ sync: { backend: 'cloud' } }), 'utf-8')
    writeFileSync(join(AIUSAGE_DIR, 'leaderboard-credentials.json'),
      JSON.stringify({ device_id: 'dev', device_secret: 'secret', obtained_at: '2026-01-01T00:00:00Z' }), 'utf-8')
    writeState({ deviceInstanceId: DEVICE, lastSyncStatus: 'ok' })

    server.generation = 1
    server.records.clear()
    server.pushes = []
    server.duringPush = undefined
    server.failPushes.clear()
    server.pushRequests = 0
    server.rejectIds.clear()
    server.legacy = false
    vi.stubGlobal('fetch', vi.fn(fakeFetch))

    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    db.close()
  })

  afterAll(() => {
    rmSync(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  })

  describe('#101: only what was sent is marked as synced', () => {
    it('does not mark a record inserted while the push request is pending', async () => {
      insertRecord(db, record(1))
      server.duringPush = () => { insertRecord(db, record(2)) }

      const first = await runSync(db)
      expect(first).toMatchObject({ status: 'ok', uploadedCount: 1 })
      expect(server.pushes).toHaveLength(1)
      expect(server.pushes[0].records).toHaveLength(1)
      // The second record was in no push body, so it has no acknowledgement.
      expect(syncedIds(db)).toEqual(['r1'])

      server.duringPush = undefined
      const second = await runSync(db)
      expect(second).toMatchObject({ status: 'ok', uploadedCount: 1 })
      expect(server.records.size).toBe(2)
      expect(syncedIds(db)).toEqual(['r1', 'r2'])
    })

    it('does not acknowledge a version that was written while the older one was being sent', async () => {
      insertRecord(db, record(1, { inputTokens: 10 }))
      server.duringPush = () => {
        // The parser rewrites the record (a session log that grew): same id,
        // newer contents. It happens before the acknowledgement is stored.
        db.prepare('UPDATE records SET input_tokens = 99, updated_at = ? WHERE id = ?').run(Date.now() - 5, 'r1')
      }

      const first = await runSync(db)
      expect(first).toMatchObject({ status: 'ok', uploadedCount: 1 })
      expect(sentTokens()).toEqual([10])

      server.duringPush = undefined
      const second = await runSync(db)
      expect(second).toMatchObject({ status: 'ok', uploadedCount: 1 })
      expect(sentTokens()).toEqual([10, 99])

      const third = await runSync(db)
      expect(third).toMatchObject({ status: 'ok', uploadedCount: 0 })
    })

    it('does not acknowledge a record that was replaced by INSERT OR REPLACE during the upload', async () => {
      insertRecord(db, record(1, { inputTokens: 10 }))
      server.duringPush = () => { insertRecord(db, record(1, { inputTokens: 42, updatedAt: 1001 })) }

      await runSync(db)
      server.duringPush = undefined
      const second = await runSync(db)
      expect(second).toMatchObject({ status: 'ok', uploadedCount: 1 })
      expect(sentTokens()).toEqual([10, 42])
    })

    it('keeps syncing when a sent record was deleted during the upload', async () => {
      insertRecord(db, record(1))
      insertRecord(db, record(2))
      server.duringPush = () => { db.prepare('DELETE FROM records WHERE id = ?').run('r2') }

      const result = await runSync(db)
      expect(result).toMatchObject({ status: 'ok', uploadedCount: 2 })
      expect(syncedIds(db)).toEqual(['r1'])
    })

    it('marks each accepted batch, so an interrupted push resumes with the rest', async () => {
      const insertAll = db.transaction(() => {
        for (let n = 1; n <= 501; n++) insertRecord(db, record(n))
      })
      insertAll()
      server.failPushes.add(1)

      const first = await runSync(db)
      expect(first.status).toBe('failed')
      expect(server.pushes.map(push => push.records.length)).toEqual([500])
      expect(syncedIds(db)).toHaveLength(500)

      const second = await runSync(db)
      expect(second).toMatchObject({ status: 'ok', uploadedCount: 1 })
      expect(server.pushes.map(push => push.records.length)).toEqual([500, 1])
      expect(server.records.size).toBe(501)
    })
  })

  describe('one cloud sync at a time', () => {
    const LOCK_PATH = join(AIUSAGE_DIR, 'cloud-sync.lock')

    /** Whether the lock can be taken right now; it is given back at once. */
    function lockIsFree(): boolean {
      const release = acquireCloudSyncLock(AIUSAGE_DIR)
      release?.()
      return release !== null
    }

    it('refuses to start while another cloud sync holds the lock, and leaves its state alone', async () => {
      insertRecord(db, record(1))
      const before = readFileSync(STATE_PATH, 'utf-8')
      const release = acquireCloudSyncLock(AIUSAGE_DIR)!
      try {
        const result = await runSync(db)
        expect(result.status).toBe('failed')
        expect(result.error).toMatch(/Another cloud sync is running/)
        expect(fetch).not.toHaveBeenCalled()
        expect(syncedIds(db)).toEqual([])
        expect(readFileSync(STATE_PATH, 'utf-8')).toBe(before)
      } finally {
        release()
      }
      expect(await runSync(db)).toMatchObject({ status: 'ok', uploadedCount: 1 })
    })

    it('lets only one of several contenders in', () => {
      const releases = [1, 2, 3, 4].map(() => acquireCloudSyncLock(AIUSAGE_DIR))
      expect(releases.filter(release => release !== null)).toHaveLength(1)
      for (const release of releases) release?.()
      expect(lockIsFree()).toBe(true)
    })

    it('holds the lock while requests are in flight and releases it afterwards, also when the sync fails', async () => {
      insertRecord(db, record(1))
      let freeDuringPush = true
      server.duringPush = () => { freeDuringPush = lockIsFree() }
      expect((await runSync(db)).status).toBe('ok')
      expect(freeDuringPush).toBe(false)
      expect(lockIsFree()).toBe(true)

      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
      expect((await runSync(db)).status).toBe('failed')
      expect(lockIsFree()).toBe(true)
    })

    it('excludes another process, and is free again as soon as that process is gone', async () => {
      insertRecord(db, record(1))
      // A second process takes the lock the way `acquireCloudSyncLock` does and
      // is then killed without releasing it, as a crashed sync would be.
      const holder = spawn(process.execPath, ['-e', `
        const Database = require('better-sqlite3')
        const lock = new Database(process.argv[1], { timeout: 0 })
        lock.exec('BEGIN EXCLUSIVE')
        process.stdout.write('locked')
        setInterval(() => {}, 1000)
      `, LOCK_PATH], { stdio: ['ignore', 'pipe', 'inherit'] })
      try {
        await new Promise<void>((resolve, reject) => {
          holder.stdout.once('data', () => resolve())
          holder.once('exit', code => reject(new Error(`lock holder exited early (${code})`)))
        })
        const blocked = await runSync(db)
        expect(blocked.status).toBe('failed')
        expect(blocked.error).toMatch(/Another cloud sync is running/)
        expect(fetch).not.toHaveBeenCalled()
      } finally {
        const gone = new Promise(resolve => holder.once('close', resolve))
        holder.kill()
        await gone
      }
      expect(await runSync(db)).toMatchObject({ status: 'ok', uploadedCount: 1 })
    })
  })

  describe('#102: a new cloud generation is uploaded to again', () => {
    function clearCloud(): void {
      server.generation++
      server.records.clear()
      server.pushes = []
    }

    it('uploads the device history again after the cloud data was cleared', async () => {
      for (const n of [1, 2, 3]) insertRecord(db, record(n))

      const first = await runSync(db)
      expect(first).toMatchObject({ status: 'ok', syncGeneration: 1, uploadedCount: 3 })
      expect(getState(AIUSAGE_DIR)?.syncTargets?.cloud).toMatchObject({ syncGeneration: 1 })

      clearCloud()
      const second = await runSync(db)
      expect(second).toMatchObject({ status: 'ok', syncGeneration: 2, uploadedCount: 3 })
      expect(server.records.size).toBe(3)
      expect(server.pushes.every(push => push.sync_generation === 2)).toBe(true)
      expect(getState(AIUSAGE_DIR)?.syncTargets?.cloud).toMatchObject({ syncGeneration: 2, lastSyncUploaded: 3 })

      // Under an unchanged generation nothing is sent twice.
      const third = await runSync(db)
      expect(third).toMatchObject({ status: 'ok', syncGeneration: 2, uploadedCount: 0 })
      expect(server.pushes).toHaveLength(1)
    })

    it('leaves the acknowledgements of other targets alone', async () => {
      insertRecord(db, record(1))
      await runSync(db)
      db.prepare(`INSERT INTO sync_record_state (record_id, target, synced_at) VALUES ('r1', 'github:user/repo', 5000)`).run()

      clearCloud()
      await runSync(db)
      const rows = db.prepare(`SELECT target FROM sync_record_state WHERE record_id = 'r1' ORDER BY target`).all() as Array<{ target: string }>
      expect(rows.map(row => row.target)).toEqual(['cloud', 'github:user/repo'])
    })

    it('uploads again on a device that synced before the generation was stored', async () => {
      // An installation upgraded from a release that kept no generation: its
      // records are acknowledged, the cloud has since been cleared.
      for (const n of [1, 2, 3]) insertRecord(db, record(n))
      db.prepare(`INSERT INTO sync_record_state (record_id, target, synced_at) SELECT id, 'cloud', 2000 FROM records`).run()
      writeState({ deviceInstanceId: DEVICE, lastSyncStatus: 'ok', syncTargets: { cloud: { lastSyncStatus: 'ok', lastSyncTarget: 'cloud' } } })
      server.generation = 2

      const result = await runSync(db)
      expect(result).toMatchObject({ status: 'ok', syncGeneration: 2, uploadedCount: 3 })
      expect(server.records.size).toBe(3)
    })

    it('uploads nothing again on such a device while the cloud is still in its first generation', async () => {
      for (const n of [1, 2, 3]) insertRecord(db, record(n))
      db.prepare(`INSERT INTO sync_record_state (record_id, target, synced_at) SELECT id, 'cloud', 2000 FROM records`).run()

      const result = await runSync(db)
      expect(result).toMatchObject({ status: 'ok', syncGeneration: 1, uploadedCount: 0 })
      expect(server.pushes).toHaveLength(0)
    })

    it('remembers the new generation when the upload after a reset is interrupted', async () => {
      const insertAll = db.transaction(() => {
        for (let n = 1; n <= 501; n++) insertRecord(db, record(n))
      })
      insertAll()
      await runSync(db)
      expect(server.records.size).toBe(501)

      clearCloud()
      server.failPushes.add(server.pushRequests + 1)
      const interrupted = await runSync(db)
      expect(interrupted.status).toBe('failed')
      expect(server.records.size).toBe(500)
      expect(getState(AIUSAGE_DIR)?.syncTargets?.cloud).toMatchObject({ syncGeneration: 2, lastSyncStatus: 'failed' })

      // The retry sends the batch that failed, not the whole history again.
      const retry = await runSync(db)
      expect(retry).toMatchObject({ status: 'ok', syncGeneration: 2, uploadedCount: 1 })
      expect(server.records.size).toBe(501)
    })

    it('keeps the stored generation when a sync fails before the pull completes', async () => {
      insertRecord(db, record(1))
      clearCloud()
      await runSync(db)
      expect(getState(AIUSAGE_DIR)?.syncTargets?.cloud).toMatchObject({ syncGeneration: 2 })

      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
      const failed = await runSync(db)
      expect(failed.status).toBe('failed')
      expect(getState(AIUSAGE_DIR)?.syncTargets?.cloud).toMatchObject({ syncGeneration: 2, lastSyncStatus: 'failed' })
    })
  })

  describe('only records the server stored are acknowledged', () => {
    const wireId = (n: number, overrides: Partial<StatsRecord> = {}) => mapStatsRecordToSyncRecord(record(n, overrides)).id
    const sentIds = () => server.pushes.map(push => push.records.map(r => r.id))

    it('acknowledges a fully stored batch', async () => {
      for (const n of [1, 2, 3]) insertRecord(db, record(n))

      const result = await runSync(db)

      expect(result).toMatchObject({ status: 'ok', uploadedCount: 3 })
      expect(result).not.toHaveProperty('rejectedCount')
      expect(syncedIds(db)).toEqual(['r1', 'r2', 'r3'])
    })

    it('leaves a record the server rejected unsynced, and sends only it again', async () => {
      for (const n of [1, 2, 3]) insertRecord(db, record(n))
      server.rejectIds.add(wireId(2))

      const first = await runSync(db)
      expect(first).toMatchObject({ status: 'ok', uploadedCount: 2, rejectedCount: 1 })
      expect(syncedIds(db)).toEqual(['r1', 'r3'])
      expect(server.records.has(wireId(2))).toBe(false)

      // Still rejected: sent again, still not acknowledged, nothing else resent.
      const second = await runSync(db)
      expect(second).toMatchObject({ status: 'ok', uploadedCount: 0, rejectedCount: 1 })
      expect(sentIds()[1]).toEqual([wireId(2)])
      expect(syncedIds(db)).toEqual(['r1', 'r3'])

      // Accepted once the server takes it.
      server.rejectIds.clear()
      const third = await runSync(db)
      expect(third).toMatchObject({ status: 'ok', uploadedCount: 1 })
      expect(syncedIds(db)).toEqual(['r1', 'r2', 'r3'])
    })

    it('acknowledges nothing of a batch the server rejected entirely', async () => {
      for (const n of [1, 2]) insertRecord(db, record(n))
      server.rejectIds.add(wireId(1)).add(wireId(2))

      const result = await runSync(db)

      expect(result).toMatchObject({ status: 'ok', uploadedCount: 0, rejectedCount: 2 })
      expect(syncedIds(db)).toEqual([])
    })

    it.each([false, true])('does not send or acknowledge a record the cloud cannot store (server reports rejections: %s)', async (reports) => {
      server.legacy = !reports
      insertRecord(db, record(1))
      insertRecord(db, record(2, { model: '' }))
      insertRecord(db, record(3, { inputTokens: 1.5 }))

      const result = await runSync(db)

      expect(result).toMatchObject({ status: 'ok', uploadedCount: 1, rejectedCount: 2 })
      expect(sentIds()).toEqual([[wireId(1)]])
      expect(syncedIds(db)).toEqual(['r1'])
    })

    it('acknowledges every record sent when the server does not report rejections', async () => {
      server.legacy = true
      for (const n of [1, 2]) insertRecord(db, record(n))

      expect(await runSync(db)).toMatchObject({ status: 'ok', uploadedCount: 2 })
      expect(syncedIds(db)).toEqual(['r1', 'r2'])
    })

    it('does not acknowledge a record rewritten while the batch that rejected another one was in flight', async () => {
      for (const n of [1, 2]) insertRecord(db, record(n))
      server.rejectIds.add(wireId(2))
      server.duringPush = () => { insertRecord(db, record(1, { inputTokens: 99, updatedAt: 2000 })) }

      expect(await runSync(db)).toMatchObject({ status: 'ok', rejectedCount: 1 })
      expect(syncedIds(db)).toEqual([])

      server.duringPush = undefined
      server.rejectIds.clear()
      expect(await runSync(db)).toMatchObject({ status: 'ok', uploadedCount: 2 })
      expect(syncedIds(db)).toEqual(['r1', 'r2'])
      expect(server.records.get(wireId(1))).toMatchObject({ inputTokens: 99 })
    })

    it('sends a rejected record again after the cloud data was cleared', async () => {
      for (const n of [1, 2]) insertRecord(db, record(n))
      server.rejectIds.add(wireId(2))
      await runSync(db)

      server.generation++
      server.records.clear()
      server.rejectIds.clear()
      const result = await runSync(db)

      expect(result).toMatchObject({ status: 'ok', syncGeneration: 2, uploadedCount: 2 })
      expect(syncedIds(db)).toEqual(['r1', 'r2'])
    })
  })
})
