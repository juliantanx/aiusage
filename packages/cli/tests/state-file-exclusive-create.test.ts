import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The files in `dir`, leaving out settings.lock, which the writers keep there (src/settings-lock.ts). */
const filesIn = (dir: string) => readdirSync(dir).filter(name => name !== 'settings.lock')

// linkSync is replaceable, to stand in for a file system without hard links
// and for another process that gets in between two steps.
const link = vi.hoisted(() => ({ impl: undefined as undefined | ((from: string, to: string) => void) }))
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    linkSync: (from: string, to: string) => (link.impl ?? actual.linkSync)(from, to),
  }
})

const { writeFileAtomic } = await import('../src/json-file.js')
const { ensureAiusageDir, getState, setState } = await import('../src/init.js')

const THEIRS = JSON.stringify({ deviceInstanceId: '11111111-2222-3333-4444-555555555555', lastSyncStatus: 'ok' })

function noHardLinks(): never {
  throw Object.assign(new Error('EPERM: operation not permitted, link'), { code: 'EPERM' })
}

describe('state.json is created by one process only (#104)', () => {
  let dir: string
  let statePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiusage-state-create-'))
    statePath = join(dir, 'state.json')
    link.impl = undefined
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  })

  it('an exclusive write creates the file and never replaces one', () => {
    expect(writeFileAtomic(statePath, 'first', { exclusive: true })).toBe(true)
    expect(writeFileAtomic(statePath, 'second', { exclusive: true })).toBe(false)
    expect(readFileSync(statePath, 'utf-8')).toBe('first')
    expect(filesIn(dir)).toEqual(['state.json'])
  })

  it('keeps the identity another process created between the check and the link', () => {
    link.impl = () => {
      writeFileSync(statePath, THEIRS, 'utf-8')
      throw Object.assign(new Error('EEXIST: file already exists, link'), { code: 'EEXIST' })
    }
    ensureAiusageDir(dir)
    expect(readFileSync(statePath, 'utf-8')).toBe(THEIRS)
    expect(filesIn(dir)).toEqual(['state.json'])
  })

  it('without hard links, still keeps the identity another process created in the meantime', () => {
    link.impl = () => {
      writeFileSync(statePath, THEIRS, 'utf-8')
      noHardLinks()
    }
    ensureAiusageDir(dir)
    expect(readFileSync(statePath, 'utf-8')).toBe(THEIRS)

    // A writer that found no file builds on the identity that won.
    rmSync(statePath)
    setState(dir, { lastSyncAt: 5 })
    expect(JSON.parse(readFileSync(statePath, 'utf-8'))).toEqual({ ...JSON.parse(THEIRS), lastSyncAt: 5 })
    expect(filesIn(dir)).toEqual(['state.json'])
  })

  it('without hard links, creates the file when no one else does', () => {
    link.impl = noHardLinks
    ensureAiusageDir(dir)
    expect(getState(dir)!.deviceInstanceId).toHaveLength(36)
    expect(filesIn(dir)).toEqual(['state.json'])
  })
})
