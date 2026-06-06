import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchSummary, fetchTokens, fetchCost } from '../src/lib/api.js'

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

  it('fetches tokens data', async () => {
    const mockData = { data: [{ date: '2026-05-12', tokens: 1000 }] }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchTokens({ range: 'week' })
    expect(result).toEqual(mockData)
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
})
