import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveExchangeRate, fetchExchangeRate, convertToUSD, convertFromUSD, FALLBACK_RATE, CACHE_TTL_MS } from '../src/exchange-rate.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveExchangeRate', () => {
  it('returns manual override when set', () => {
    const rate = resolveExchangeRate({
      exchangeRate: 0.14,
      exchangeRateCache: { CNY_USD: 0.138, fetchedAt: Date.now() },
    })
    expect(rate).toBe(0.14)
  })

  it('returns cached rate when fresh', () => {
    const rate = resolveExchangeRate({
      exchangeRateCache: { CNY_USD: 0.138, fetchedAt: Date.now() - 1000 },
    })
    expect(rate).toBe(0.138)
  })

  it('returns fallback when cache expired', () => {
    const rate = resolveExchangeRate({
      exchangeRateCache: { CNY_USD: 0.138, fetchedAt: Date.now() - CACHE_TTL_MS - 1 },
    })
    expect(rate).toBe(FALLBACK_RATE)
  })

  it('returns fallback when no config', () => {
    const rate = resolveExchangeRate({})
    expect(rate).toBe(FALLBACK_RATE)
  })

  it('prefers manual override over expired cache', () => {
    const rate = resolveExchangeRate({
      exchangeRate: 0.15,
      exchangeRateCache: { CNY_USD: 0.138, fetchedAt: Date.now() - CACHE_TTL_MS - 1 },
    })
    expect(rate).toBe(0.15)
  })
})

describe('convertToUSD', () => {
  it('converts CNY to USD', () => {
    expect(convertToUSD(100, 0.14)).toBeCloseTo(14, 6)
  })
})

describe('convertFromUSD', () => {
  it('converts USD to CNY', () => {
    expect(convertFromUSD(14, 0.14)).toBeCloseTo(100, 6)
  })
})

describe('fetchExchangeRate', () => {
  it('returns rate on valid response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rates: { USD: 0.138 } }),
    }))
    const rate = await fetchExchangeRate()
    expect(rate).toBe(0.138)
  })

  it('returns null on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const rate = await fetchExchangeRate()
    expect(rate).toBeNull()
  })

  it('returns null on missing USD rate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rates: { EUR: 0.85 } }),
    }))
    const rate = await fetchExchangeRate()
    expect(rate).toBeNull()
  })

  it('returns null on zero rate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rates: { USD: 0 } }),
    }))
    const rate = await fetchExchangeRate()
    expect(rate).toBeNull()
  })

  it('returns null on negative rate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rates: { USD: -0.1 } }),
    }))
    const rate = await fetchExchangeRate()
    expect(rate).toBeNull()
  })

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const rate = await fetchExchangeRate()
    expect(rate).toBeNull()
  })

  it('returns null on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }))
    const rate = await fetchExchangeRate()
    expect(rate).toBeNull()
  })
})
