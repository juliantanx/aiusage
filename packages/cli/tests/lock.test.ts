import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { acquireLock, releaseLock, isLocked } from '../src/lock.js'

describe('PID Lock', () => {
  const testDir = join(tmpdir(), 'aiusage-lock-test')
  const lockPath = join(testDir, 'parse.lock')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('acquires lock when no lock exists', () => {
    const acquired = acquireLock(lockPath)
    expect(acquired).toBe(true)
    expect(existsSync(lockPath)).toBe(true)
  })

  it('writes PID to lock file', () => {
    acquireLock(lockPath)
    const content = readFileSync(lockPath, 'utf-8')
    expect(content).toBe(process.pid.toString())
  })

  it('releases lock', () => {
    acquireLock(lockPath)
    releaseLock(lockPath)
    expect(existsSync(lockPath)).toBe(false)
  })

  it('checks if locked', () => {
    expect(isLocked(lockPath)).toBe(false)
    acquireLock(lockPath)
    expect(isLocked(lockPath)).toBe(true)
    releaseLock(lockPath)
    expect(isLocked(lockPath)).toBe(false)
  })

  it('detects stale lock from dead process', () => {
    // Write a fake PID that doesn't exist
    const fakePid = 999999999
    require('node:fs').writeFileSync(lockPath, fakePid.toString())
    const acquired = acquireLock(lockPath)
    expect(acquired).toBe(true)
  })
})
