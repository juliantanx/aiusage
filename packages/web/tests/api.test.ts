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
})
