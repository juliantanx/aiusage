import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { ensureAiusageDir, getState, setState } from '../src/init.js'

describe('Directory Initialization', () => {
  const testDir = join(tmpdir(), 'aiusage-init-test')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('creates aiusage directory if not exists', () => {
    const aiusageDir = join(testDir, '.aiusage')
    ensureAiusageDir(aiusageDir)
    expect(existsSync(aiusageDir)).toBe(true)
  })

  it('generates deviceInstanceId on first run', () => {
    const aiusageDir = join(testDir, '.aiusage')
    ensureAiusageDir(aiusageDir)
    const state = getState(aiusageDir)
    expect(state).not.toBeNull()
    expect(state!.deviceInstanceId).toBeDefined()
    expect(state!.deviceInstanceId).toHaveLength(36) // UUID format
  })

  it('preserves existing deviceInstanceId', () => {
    const aiusageDir = join(testDir, '.aiusage')
    ensureAiusageDir(aiusageDir)
    const state1 = getState(aiusageDir)
    ensureAiusageDir(aiusageDir)
    const state2 = getState(aiusageDir)
    expect(state2!.deviceInstanceId).toBe(state1!.deviceInstanceId)
  })

  it('sets and gets state', () => {
    const aiusageDir = join(testDir, '.aiusage')
    ensureAiusageDir(aiusageDir)
    setState(aiusageDir, { lastSyncAt: 1776738085700 })
    const state = getState(aiusageDir)
    expect(state!.lastSyncAt).toBe(1776738085700)
  })

  it('creates state.json with correct structure', () => {
    const aiusageDir = join(testDir, '.aiusage')
    ensureAiusageDir(aiusageDir)
    const content = readFileSync(join(aiusageDir, 'state.json'), 'utf-8')
    const state = JSON.parse(content)
    expect(state).toHaveProperty('deviceInstanceId')
    expect(state).toHaveProperty('lastSyncStatus', 'ok')
  })
})
