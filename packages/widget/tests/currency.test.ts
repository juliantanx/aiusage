import { describe, expect, it } from 'vitest'
import { EXCHANGE_RATE_SOURCES, fetchUsdCnyRate } from '../src/currency'

function fakeFetch(responses: Array<() => Response>) {
  const requested: string[] = []
  const fn = (async (url: string) => {
    requested.push(String(url))
    const next = responses.shift()
    if (!next) throw new Error('unexpected request')
    return next()
  }) as unknown as typeof fetch
  return { fn, requested }
}

describe('fetchUsdCnyRate', () => {
  it('uses the first source when it works', async () => {
    const { fn, requested } = fakeFetch([
      () => Response.json({ date: '2026-10-30', usd: { cny: 7.1 } }),
    ])

    await expect(fetchUsdCnyRate(fn)).resolves.toEqual({
      rate: 7.1,
      date: '2026-10-30',
      source: EXCHANGE_RATE_SOURCES[0],
    })
    expect(requested).toEqual([EXCHANGE_RATE_SOURCES[0]])
  })

  it('falls back through the sources in order', async () => {
    const { fn, requested } = fakeFetch([
      () => { throw new TypeError('fetch failed') },
      () => new Response('', { status: 503 }),
      () => Response.json({ date: '2026-10-30', usd: { cny: 6.65 } }),
    ])

    const result = await fetchUsdCnyRate(fn)

    expect(result.rate).toBe(6.65)
    expect(result.source).toBe(EXCHANGE_RATE_SOURCES[2])
    expect(requested).toEqual([...EXCHANGE_RATE_SOURCES])
  })

  it('treats a payload without CNY as a failure', async () => {
    const { fn } = fakeFetch([
      () => Response.json({ usd: { eur: 0.9 } }),
      () => Response.json({ usd: { cny: 0 } }),
      () => new Response('', { status: 404 }),
    ])

    await expect(fetchUsdCnyRate(fn)).rejects.toThrow('HTTP 404')
  })
})
