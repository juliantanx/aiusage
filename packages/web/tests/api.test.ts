import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchSummary, fetchHomeSummary, fetchTokens, fetchCost, refreshData } from '../src/lib/api.js'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches summary data', async () => {
    const mockData = { totalTokens: 1000, totalCost: 0.001 }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchSummary({ range: 'day' })
    expect(result).toEqual(mockData)
    expect(mockFetch).toHaveBeenCalledWith('/api/summary?range=day')
  })

  it('fetches the public home summary with only the range parameter', async () => {
    const mockData = { totalTokens: 1000, totalCost: 0.001 }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchHomeSummary({ range: 'week', device: 'other', tool: 'codex' } as any)
    expect(result).toEqual(mockData)
    expect(mockFetch).toHaveBeenCalledWith('/api/home-summary?range=week')
  })

  it('fetches tokens data', async () => {
    const mockData = { data: [{ date: '2026-05-12', tokens: 1000 }] }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchTokens({ range: 'week' })
    expect(result).toEqual(mockData)
  })

  it('refreshes data via POST', async () => {
    const mockData = { ok: true }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await refreshData()

    expect(result).toEqual(mockData)
    expect(mockFetch).toHaveBeenCalledWith('/api/refresh', { method: 'POST' })
  })

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { code: 'INVALID_RANGE', message: 'Invalid range' } }),
    })

    await expect(fetchSummary({ range: 'invalid' as any })).rejects.toThrow()
  })

  it('fetches dashboard auth status', async () => {
    const mockData = { enabled: true, authenticated: false }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const { fetchAuthStatus } = await import('../src/lib/api.js')
    const result = await fetchAuthStatus()

    expect(result).toEqual(mockData)
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/status')
  })

  it('logs in with dashboard password', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })

    const { login } = await import('../src/lib/api.js')
    const result = await login('secret')

    expect(result).toEqual({ ok: true })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'secret' }),
      })
    )
  })

  it('saves config via PUT', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })

    const { saveConfig } = await import('../src/lib/api.js')
    const result = await saveConfig({ weekStart: 1, device: 'my-mac' })
    expect(result).toEqual({ ok: true })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/config',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart: 1, device: 'my-mac' }),
      })
    )
  })

  it('fetches only configured state for a sync target', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ githubToken: true }) })
    const api = await import('../src/lib/api.js')
    expect(await api.fetchCredentialStatus({ backend: 'github', repo: 'owner/repo' })).toEqual({ githubToken: true })
    expect(mockFetch).toHaveBeenCalledWith('/api/config/credentials/status?backend=github&repo=owner%2Frepo')
    expect(api).not.toHaveProperty('fetchCredential')
  })
})
