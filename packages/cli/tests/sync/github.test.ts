import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubSyncBackend } from '../../src/sync/github.js'

describe('GitHubSyncBackend', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('surfaces timeout errors with request context', async () => {
    const backend = new GitHubSyncBackend({ repo: 'user/repo', token: 'token' })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' })))

    await expect(backend.listFiles()).rejects.toThrow(/timed out.*api\.github\.com/)
  })
})
