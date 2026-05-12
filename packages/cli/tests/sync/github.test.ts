import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitHubSyncBackend } from '../../src/sync/github.js'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('GitHubSyncBackend', () => {
  const backend = new GitHubSyncBackend({
    repo: 'username/aiusage-data',
    token: 'test-token',
  })

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('constructs correct API URLs', () => {
    const url = backend.getFileUrl('2026/05.ndjson')
    expect(url).toBe('https://api.github.com/repos/username/aiusage-data/contents/data/2026/05.ndjson')
  })

  it('sends authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: 'abc123', content: '' }),
    })
    await backend.readFile('2026/05.ndjson')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    )
  })

  it('handles 404 (file not found)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
    const result = await backend.readFile('2026/05.ndjson')
    expect(result).toBeNull()
  })

  it('throws on auth error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    await expect(backend.readFile('2026/05.ndjson')).rejects.toThrow()
  })
})
