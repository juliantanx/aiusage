import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({}),
}))

import { execFile } from 'node:child_process'
const mockExecFile = vi.mocked(execFile)

function gitResolves(stdout = '') {
  mockExecFile.mockImplementationOnce((...args: any[]) => {
    const cb = args[args.length - 1]
    if (typeof cb === 'function') cb(null, { stdout })
    return {} as any
  })
}

function gitRejects(message: string) {
  mockExecFile.mockImplementationOnce((...args: any[]) => {
    const cb = args[args.length - 1]
    if (typeof cb === 'function') cb(new Error(message), { stdout: '' })
    return {} as any
  })
}

describe('GitSyncBackend.flush', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retries push after pull --rebase when rejected', async () => {
    const { GitSyncBackend } = await import('../../src/sync/git.js')
    const backend = new GitSyncBackend({ repo: 'u/r', token: 't', cacheDir: '/tmp/s' })

    gitResolves('M data/x.ndjson') // status
    gitResolves()                    // add
    gitResolves()                    // commit
    gitRejects('rejected')           // push 1 → fail
    gitResolves()                    // pull --rebase
    gitResolves()                    // push 2 → ok

    const result = await backend.flush()
    expect(result).toBe(true)

    const pullCall = mockExecFile.mock.calls.find((c: any) =>
      Array.isArray(c[1]) && c[1].includes('pull') && c[1].includes('--rebase')
    )
    expect(pullCall).toBeTruthy()
  })

  it('throws after max retries', async () => {
    const { GitSyncBackend } = await import('../../src/sync/git.js')
    const backend = new GitSyncBackend({ repo: 'u/r', token: 't', cacheDir: '/tmp/s' })

    gitResolves('M data/x.ndjson') // status
    gitResolves()                    // add
    gitResolves()                    // commit
    gitRejects('rejected')           // push 1
    gitResolves()                    // pull --rebase 1
    gitRejects('rejected')           // push 2
    gitResolves()                    // pull --rebase 2
    gitRejects('rejected')           // push 3

    await expect(backend.flush()).rejects.toThrow('rejected')
  })

  it('pushes without retry on success', async () => {
    const { GitSyncBackend } = await import('../../src/sync/git.js')
    const backend = new GitSyncBackend({ repo: 'u/r', token: 't', cacheDir: '/tmp/s' })

    gitResolves('M data/x.ndjson') // status
    gitResolves()                    // add
    gitResolves()                    // commit
    gitResolves()                    // push → ok

    const result = await backend.flush()
    expect(result).toBe(true)
    // No pull --rebase called
    const pullCall = mockExecFile.mock.calls.find((c: any) =>
      Array.isArray(c[1]) && c[1].includes('pull')
    )
    expect(pullCall).toBeUndefined()
  })

  it('returns false when no changes', async () => {
    const { GitSyncBackend } = await import('../../src/sync/git.js')
    const backend = new GitSyncBackend({ repo: 'u/r', token: 't', cacheDir: '/tmp/s' })

    gitResolves('') // status → empty (no changes)

    const result = await backend.flush()
    expect(result).toBe(false)
  })
})
