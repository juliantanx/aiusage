import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsLockTimeoutError, withSettingsLock } from '../src/settings-lock.js'
import { ensureAiusageDir, getState, StateFileError, updateState } from '../src/init.js'

/** Another process that takes the lock the way withSettingsLock does and keeps it. */
async function holdLockInAnotherProcess(dir: string): Promise<ChildProcess> {
  const holder = spawn(process.execPath, ['-e', `
    const Database = require('better-sqlite3')
    const lock = new Database(process.argv[1], { timeout: 0 })
    lock.exec('BEGIN EXCLUSIVE')
    process.stdout.write('locked')
    setInterval(() => {}, 1000)
  `, join(dir, 'settings.lock')], { cwd: join(__dirname, '..'), stdio: ['ignore', 'pipe', 'inherit'] })
  await new Promise<void>((resolve, reject) => {
    holder.stdout!.once('data', () => resolve())
    holder.once('exit', code => reject(new Error(`lock holder exited early (${code})`)))
  })
  return holder
}

async function kill(child: ChildProcess): Promise<void> {
  const gone = new Promise(resolve => child.once('close', resolve))
  child.kill()
  await gone
}

describe('settings lock', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiusage-settings-lock-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })

  it('runs the function and returns its result, creating the directory', () => {
    const nested = join(dir, 'nested', '.aiusage')
    expect(withSettingsLock(nested, () => 42)).toBe(42)
    expect(existsSync(join(nested, 'settings.lock'))).toBe(true)
  })

  it('is re-entrant within a process', () => {
    const order: string[] = []
    withSettingsLock(dir, () => {
      order.push('outer')
      withSettingsLock(dir, () => { order.push('inner') })
      order.push('outer again')
    })
    expect(order).toEqual(['outer', 'inner', 'outer again'])
  })

  it('is released when the function throws', () => {
    expect(() => withSettingsLock(dir, () => { throw new Error('boom') })).toThrow('boom')
    expect(withSettingsLock(dir, () => 'free', 0)).toBe('free')
  })

  it('refuses an async function, whose work would run after the lock is gone', () => {
    expect(() => withSettingsLock(dir, (async () => 1) as unknown as () => number)).toThrow(TypeError)
    expect(withSettingsLock(dir, () => 'free', 0)).toBe('free')
  })

  it('waits for another process, gives up after the timeout without writing, and is free once that process is gone', async () => {
    ensureAiusageDir(dir)
    const before = readFileSync(join(dir, 'state.json'), 'utf-8')
    const holder = await holdLockInAnotherProcess(dir)
    try {
      const started = Date.now()
      expect(() => withSettingsLock(dir, () => 1, 300)).toThrow(SettingsLockTimeoutError)
      expect(Date.now() - started).toBeGreaterThanOrEqual(250)
      expect(readFileSync(join(dir, 'state.json'), 'utf-8')).toBe(before)
    } finally {
      // Killed without releasing anything, as a crashed process would be.
      await kill(holder)
    }
    expect(withSettingsLock(dir, () => 'free', 0)).toBe('free')
  }, 30_000)
})

describe('updateState', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiusage-update-state-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })

  it('creates state.json with a device identity when there is none, and keeps that identity', () => {
    const first = updateState(dir, s => ({ ...s, lastLeaderboardUploadAt: 1 }))
    const second = updateState(dir, s => ({ ...s, lastLeaderboardUploadAt: 2 }))
    expect(first.deviceInstanceId).toHaveLength(36)
    expect(second.deviceInstanceId).toBe(first.deviceInstanceId)
    expect(getState(dir)).toEqual(second)
  })

  it('writes nothing when the change is undefined', () => {
    ensureAiusageDir(dir)
    const before = readFileSync(join(dir, 'state.json'), 'utf-8')
    expect(updateState(dir, () => undefined)).toEqual(JSON.parse(before))
    expect(readFileSync(join(dir, 'state.json'), 'utf-8')).toBe(before)
  })

  it('does not call the change for a state.json that cannot be used', () => {
    writeFileSync(join(dir, 'state.json'), '{"deviceInstanceId": "abc"', 'utf-8')
    let called = false
    expect(() => updateState(dir, (s) => { called = true; return s })).toThrow(StateFileError)
    expect(called).toBe(false)
  })
})
