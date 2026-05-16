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

function gitRejects(message: string, stderr?: string) {
  mockExecFile.mockImplementationOnce((...args: any[]) => {
    const cb = args[args.length - 1]
    if (typeof cb === 'function') {
      const err = Object.assign(new Error(message), { stderr: stderr ?? message })
      cb(err, { stdout: '' })
    }
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

  it('strips token from error message and stderr when push fails after max retries', async () => {
    const { GitSyncBackend } = await import('../../src/sync/git.js')
    const backend = new GitSyncBackend({ repo: 'u/r', token: 'secret-token-abc', cacheDir: '/tmp/s' })
    const tokenUrl = 'https://x-access-token:secret-token-abc@github.com/u/r.git'

    gitResolves('M data/x.ndjson') // status
    gitResolves()                    // add
    gitResolves()                    // commit
    gitRejects(`fatal: ${tokenUrl}: access denied`, `fatal: ${tokenUrl}: access denied`)
    gitResolves()                    // pull --rebase 1
    gitRejects(`fatal: ${tokenUrl}: access denied`, `fatal: ${tokenUrl}: access denied`)
    gitResolves()                    // pull --rebase 2
    gitRejects(`fatal: ${tokenUrl}: access denied`, `fatal: ${tokenUrl}: access denied`)

    let thrown: unknown
    try {
      await backend.flush()
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(Error)
    const err = thrown as any
    expect(err.message).not.toContain('secret-token-abc')
    expect(err.stderr).not.toContain('secret-token-abc')
    expect(err.message).toContain('github.com')
  })

  it('uses custom branch name in push operations', async () => {
    const { GitSyncBackend } = await import('../../src/sync/git.js')
    const backend = new GitSyncBackend({ repo: 'u/r', token: 't', cacheDir: '/tmp/s', branch: 'master' })

    gitResolves('M data/x.ndjson') // status
    gitResolves()                    // add
    gitResolves()                    // commit
    gitResolves()                    // push → ok

    await backend.flush()

    const pushCalls = mockExecFile.mock.calls.filter((c: any) =>
      Array.isArray(c[1]) && c[1].includes('push')
    )
    expect(pushCalls.length).toBeGreaterThan(0)
    for (const call of pushCalls) {
      expect(call[1]).toContain('master')
      expect(call[1]).not.toContain('main')
    }
  })
})
