import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as init from '../src/init.js'

/** The files in `dir`, leaving out settings.lock, which the writers keep there (src/settings-lock.ts). */
const filesIn = (dir: string) => readdirSync(dir).filter(name => name !== 'settings.lock')

const { ensureAiusageDir, getState, setState, setSyncTargetState, setSyncConsent } = init

const DEVICE = '11111111-2222-3333-4444-555555555555'
const GOOD_STATE = {
  deviceInstanceId: DEVICE,
  lastSyncStatus: 'ok',
  syncConsents: { 'github:user/repo': { syncConsentAt: 1, syncConsentTarget: 'fp' } },
  syncTargets: { 'github:user/repo': { lastSyncAt: 1, lastSyncStatus: 'ok', lastSyncTarget: 'github:user/repo' } },
}
// What a reader sees when another process is half-way through a plain
// writeFileSync, and what a crash in the middle of one leaves behind.
const TRUNCATED = JSON.stringify(GOOD_STATE, null, 2).slice(0, 60)

const UNUSABLE: Array<[string, string]> = [
  ['truncated', TRUNCATED],
  ['empty', ''],
  ['not an object', '[]'],
  ['null', 'null'],
  ['without a deviceInstanceId', JSON.stringify({ lastSyncStatus: 'ok' })],
]

describe('state.json integrity (#104)', () => {
  let dir: string
  let statePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiusage-state-integrity-'))
    statePath = join(dir, 'state.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  })

  const writers: Array<[string, () => void]> = [
    ['setState', () => setState(dir, { lastSyncAt: 5 })],
    ['setSyncTargetState', () => setSyncTargetState(dir, 'cloud', { lastSyncStatus: 'failed' })],
    ['setSyncConsent', () => setSyncConsent(dir, 'cloud', { syncConsentAt: 2, syncConsentTarget: 'fp2' })],
  ]

  for (const [label, content] of UNUSABLE) {
    describe(`a state.json that is ${label}`, () => {
      beforeEach(() => writeFileSync(statePath, content, 'utf-8'))

      for (const [name, write] of writers) {
        it(`${name} refuses to write over it`, () => {
          expect(write).toThrow(init.StateFileError)
          expect(readFileSync(statePath, 'utf-8')).toBe(content)
          expect(filesIn(dir)).toEqual(['state.json'])
        })
      }

      it('ensureAiusageDir leaves it alone', () => {
        ensureAiusageDir(dir)
        expect(readFileSync(statePath, 'utf-8')).toBe(content)
      })

      it('is told apart from a missing file, and names the path, the problem and the way out', () => {
        const read = init.readStateFile(dir)
        expect(read.status).toBe('invalid')
        if (read.status !== 'invalid') return
        expect(read.error).toBeInstanceOf(init.StateFileError)
        expect(read.error.message).toContain(statePath)
        expect(read.error.message).toMatch(/left untouched/)
        expect(read.error.message).toMatch(/restore it from a backup/)
        // Readers that only display something keep working.
        expect(getState(dir)).toBeNull()
      })
    })
  }

  it('never replaces the device identity of an existing file', () => {
    writeFileSync(statePath, JSON.stringify(GOOD_STATE, null, 2), 'utf-8')
    ensureAiusageDir(dir)
    for (const [, write] of writers) write()
    const state = getState(dir)!
    expect(state.deviceInstanceId).toBe(DEVICE)
    expect(state.syncConsents?.['github:user/repo']).toEqual({ syncConsentAt: 1, syncConsentTarget: 'fp' })
    expect(state.syncConsents?.cloud).toEqual({ syncConsentAt: 2, syncConsentTarget: 'fp2' })
    expect(state.syncTargets?.cloud).toMatchObject({ lastSyncStatus: 'failed' })
    expect(state.syncTargets?.['github:user/repo']).toEqual(GOOD_STATE.syncTargets['github:user/repo'])
  })

  it('reports a missing file as missing', () => {
    expect(init.readStateFile(dir)).toEqual({ status: 'missing' })
    expect(getState(dir)).toBeNull()
  })

  for (const [name, write] of writers) {
    it(`${name} creates a missing file with one new identity and keeps it`, () => {
      write()
      const first = getState(dir)!.deviceInstanceId
      expect(first).toHaveLength(36)
      write()
      ensureAiusageDir(dir)
      expect(getState(dir)!.deviceInstanceId).toBe(first)
    })
  }

  it('creates the directory and the file at startup, once', () => {
    const nested = join(dir, '.aiusage')
    ensureAiusageDir(nested)
    const read = init.readStateFile(nested)
    expect(read.status).toBe('ok')
    const id = getState(nested)!.deviceInstanceId
    ensureAiusageDir(nested)
    expect(getState(nested)!.deviceInstanceId).toBe(id)
  })

  it('writes through a temporary file: nothing but state.json is left, and it is complete', () => {
    for (let i = 0; i < 25; i++) {
      setSyncTargetState(dir, 'cloud', { lastSyncAt: i, lastSyncError: 'x'.repeat(2000) })
      expect(JSON.parse(readFileSync(statePath, 'utf-8')).syncTargets.cloud.lastSyncAt).toBe(i)
    }
    expect(filesIn(dir)).toEqual(['state.json'])
    expect(existsSync(statePath)).toBe(true)
  })
})
