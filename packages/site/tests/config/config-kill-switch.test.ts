import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// One site_config table shared by several server instances, each of which is
// a separate copy of config.ts with its own cache (vi.resetModules). A test
// can hold a SELECT back with `holdNext`, or make every statement fail.
const db = vi.hoisted(() => {
  const state = {
    rows: new Map<string, number>(),
    selects: [] as string[],
    failing: false,
    held: null as null | { release: () => void },
    holdNext: false,
  }
  function sql(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
    const text = strings.join('?').replace(/\s+/g, ' ').trim()
    if (state.failing) return Promise.reject(new Error('connection refused'))
    if (text.startsWith('SELECT value FROM site_config WHERE key = ?')) {
      const key = values[0] as string
      state.selects.push(key)
      const result = state.rows.has(key) ? [{ value: state.rows.get(key) }] : []
      if (state.holdNext) {
        state.holdNext = false
        return new Promise(resolve => { state.held = { release: () => resolve(result) } })
      }
      return Promise.resolve(result)
    }
    if (text.startsWith('INSERT INTO site_config')) {
      state.rows.set(values[0] as string, values[1] as number)
      return Promise.resolve([])
    }
    // checkCloudSyncAccess past the kill switch: no such user.
    if (text.startsWith('SELECT cloud_sync_enabled')) return Promise.resolve([])
    throw new Error(`unexpected statement: ${text}`)
  }
  return { state, sql }
})

vi.mock('../../src/lib/server/db/pool.js', () => ({ sql: db.sql }))

type ConfigModule = typeof import('../../src/lib/server/config.js')
type StarCheckModule = typeof import('../../src/lib/server/cloud/star-check.js')

/** A fresh server instance: its own config cache over the shared table. */
async function instance(): Promise<ConfigModule & StarCheckModule> {
  vi.resetModules()
  const config = await import('../../src/lib/server/config.js')
  const starCheck = await import('../../src/lib/server/cloud/star-check.js')
  return { ...config, ...starCheck }
}

const SWITCH = 'cloud.sync_globally_enabled'

beforeEach(() => {
  db.state.rows.clear()
  db.state.selects.length = 0
  db.state.failing = false
  db.state.held = null
  db.state.holdNext = false
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cloud sync kill switch across server instances', () => {
  it('is the key CFG names', async () => {
    const { CFG, getDefaultValue } = await instance()
    expect(CFG.CLOUD_SYNC_GLOBALLY_ENABLED).toBe(SWITCH)
    expect(getDefaultValue(SWITCH)).toBe(1)
  })

  it('stops cloud sync on every instance as soon as one of them saves 0, also when the key had no row', async () => {
    const a = await instance()
    const b = await instance()

    // B reads the missing key: the default, enabled.
    expect(await b.getConfigValue(SWITCH)).toBe(1)
    expect((await b.checkCloudSyncAccess('user_1')).error_code).toBe('GITHUB_BINDING_REQUIRED')

    await a.setConfig(SWITCH, 0, 'off', 'admin_1')

    expect(await b.getConfigValue(SWITCH)).toBe(0)
    expect(await b.checkCloudSyncAccess('user_1')).toEqual({
      allowed: false,
      error_code: 'CLOUD_SYNC_DISABLED',
      message: 'AIUsage Cloud is currently unavailable.',
    })
  })

  it('stops cloud sync when a stored 1 is changed to 0 by another instance', async () => {
    db.state.rows.set(SWITCH, 1)
    const a = await instance()
    const b = await instance()
    expect(await b.getConfigValue(SWITCH)).toBe(1)

    await a.setConfig(SWITCH, 0, 'off', 'admin_1')

    expect(await b.getConfigValue(SWITCH)).toBe(0)
  })

  it('starts cloud sync again when another instance saves 1', async () => {
    db.state.rows.set(SWITCH, 0)
    const a = await instance()
    const b = await instance()
    expect((await b.checkCloudSyncAccess('user_1')).error_code).toBe('CLOUD_SYNC_DISABLED')

    await a.setConfig(SWITCH, 1, 'on', 'admin_1')

    expect(await b.getConfigValue(SWITCH)).toBe(1)
    expect((await b.checkCloudSyncAccess('user_1')).error_code).toBe('GITHUB_BINDING_REQUIRED')
  })

  it('reads the row on every lookup', async () => {
    const b = await instance()

    await b.getConfigValue(SWITCH)
    await b.getConfigValue(SWITCH)
    await b.getConfigValue(SWITCH)

    expect(db.state.selects).toEqual([SWITCH, SWITCH, SWITCH])
  })

  it('does not keep a value from a read that was in flight when the switch was turned off', async () => {
    const a = await instance()
    const b = await instance()

    db.state.holdNext = true
    const inFlight = b.getConfigValue(SWITCH)
    await a.setConfig(SWITCH, 0, 'off', 'admin_1')
    db.state.held!.release()
    // The read began before the save, so it saw the old state.
    expect(await inFlight).toBe(1)

    expect(await b.getConfigValue(SWITCH)).toBe(0)
  })

  describe('when site_config cannot be read', () => {
    it('fails the lookup instead of assuming the switch is on', async () => {
      const b = await instance()
      db.state.failing = true

      await expect(b.getConfigValue(SWITCH)).rejects.toThrow('connection refused')
      await expect(b.checkCloudSyncAccess('user_1')).rejects.toThrow('connection refused')
    })

    it('fails the lookup even when this instance read the switch on a moment ago', async () => {
      db.state.rows.set(SWITCH, 1)
      const b = await instance()
      expect(await b.getConfigValue(SWITCH)).toBe(1)

      db.state.failing = true
      vi.advanceTimersByTime(1)

      await expect(b.getConfigValue(SWITCH)).rejects.toThrow('connection refused')
      await expect(b.checkCloudSyncAccess('user_1')).rejects.toThrow('connection refused')
    })

    it('fails the lookup after this instance saved the switch on itself', async () => {
      const b = await instance()
      await b.setConfig(SWITCH, 1, 'on', 'admin_1')

      db.state.failing = true

      await expect(b.getConfigValue(SWITCH)).rejects.toThrow('connection refused')
    })

    it('recovers when the database is back', async () => {
      const b = await instance()
      db.state.failing = true
      await expect(b.getConfigValue(SWITCH)).rejects.toThrow()

      db.state.failing = false
      db.state.rows.set(SWITCH, 0)
      expect(await b.getConfigValue(SWITCH)).toBe(0)
    })
  })

  it('leaves the other settings cached', async () => {
    const a = await instance()
    const b = await instance()
    expect(await b.getConfigValue(b.CFG.UPLOAD_RATE_LIMIT)).toBe(30)

    await a.setConfig(b.CFG.UPLOAD_RATE_LIMIT, 5, 'limit', 'admin_1')

    // Another instance picks a cached setting up after the TTL, as before.
    expect(await b.getConfigValue(b.CFG.UPLOAD_RATE_LIMIT)).toBe(30)
    vi.advanceTimersByTime(60_000)
    expect(await b.getConfigValue(b.CFG.UPLOAD_RATE_LIMIT)).toBe(5)
    expect(db.state.selects.filter(k => k === b.CFG.UPLOAD_RATE_LIMIT)).toHaveLength(2)
  })
})
