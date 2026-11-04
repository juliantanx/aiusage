import { afterEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    vi.useRealTimers()
  })

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

  it.each(['headers', 'body'])('aborts stalled %s and uses the next source', async (phase) => {
    vi.useFakeTimers()
    let stalledSignal: AbortSignal | undefined
    const fn = vi.fn<typeof fetch>().mockImplementationOnce(async (_url, init) => {
      stalledSignal = init!.signal as AbortSignal
      const pending = new Promise<Response>((_resolve, reject) => {
        stalledSignal!.addEventListener('abort', () => reject(stalledSignal!.reason), { once: true })
      })
      return phase === 'headers' ? pending : { ok: true, json: () => pending } as unknown as Response
    }).mockResolvedValueOnce(Response.json({ usd: { cny: 7.1 } }))

    const result = fetchUsdCnyRate(fn)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(stalledSignal!.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toEqual({ rate: 7.1, source: EXCHANGE_RATE_SOURCES[1] })
    expect(stalledSignal!.aborted).toBe(true)
    expect(fn.mock.calls.map(([url]) => url)).toEqual(EXCHANGE_RATE_SOURCES.slice(0, 2))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects after all sources time out', async () => {
    vi.useFakeTimers()
    const fn = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const signal = init!.signal!
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })

    const result = expect(fetchUsdCnyRate(fn)).rejects.toThrow('Exchange rate request timed out')
    await vi.advanceTimersByTimeAsync(15_000)
    await result
    expect(fn.mock.calls.map(([url]) => url)).toEqual([...EXCHANGE_RATE_SOURCES])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears timeout timers after immediate failures and success', async () => {
    vi.useFakeTimers()
    const { fn } = fakeFetch([
      () => { throw new TypeError('fetch failed') },
      () => new Response('', { status: 503 }),
      () => Response.json({ usd: { cny: 7.1 } }),
    ])

    await expect(fetchUsdCnyRate(fn)).resolves.toMatchObject({ rate: 7.1 })
    expect(vi.getTimerCount()).toBe(0)
  })
})
