import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchHomeSummary, fetchSummary } from '../src/lib/api.js'

// A local server whose totals grow as logs are parsed.
let serverTotal = 0
const fetchMock = vi.fn(async (_url: string) => ({
  ok: true,
  json: async () => ({ totalTokens: serverTotal }),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('summary data after a refresh or a poll (issue #108)', () => {
  it('Overview: the reload after a refresh returns the records the refresh parsed', async () => {
    serverTotal = 100
    expect((await fetchSummary({ range: 'day' })).totalTokens).toBe(100)

    // /api/refresh parses new logs and resolves a second later.
    serverTotal = 150
    vi.advanceTimersByTime(1_000)
    expect((await fetchSummary({ range: 'day' })).totalTokens).toBe(150)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('Home: each poll returns what the server has at that moment', async () => {
    serverTotal = 150
    expect((await fetchHomeSummary({ range: 'all' })).totalTokens).toBe(150)

    for (const total of [160, 170, 180]) {
      vi.advanceTimersByTime(30_000)
      serverTotal = total
      expect((await fetchHomeSummary({ range: 'all' })).totalTokens).toBe(total)
    }
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('Home: "refresh now" right after a load still asks the server', async () => {
    serverTotal = 200
    await fetchHomeSummary({ range: 'week' })
    serverTotal = 210
    expect((await fetchHomeSummary({ range: 'week' })).totalTokens).toBe(210)
  })

  it('calls made while a request is in flight share that request', async () => {
    serverTotal = 300
    const first = fetchSummary({ range: 'month' })
    const second = fetchSummary({ range: 'month' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await first).toEqual(await second)
  })
})
