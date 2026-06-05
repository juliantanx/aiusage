import { describe, it, expect } from 'vitest'
import { LeaderboardApiError } from '../../src/leaderboard/api.js'

describe('LeaderboardApiError', () => {
  it('has correct name', () => {
    const err = new LeaderboardApiError('test')
    expect(err.name).toBe('LeaderboardApiError')
  })

  it('stores message, code, and retryAfter', () => {
    const err = new LeaderboardApiError('rate limited', 'rate_limited', 30)
    expect(err.message).toBe('rate limited')
    expect(err.code).toBe('rate_limited')
    expect(err.retryAfter).toBe(30)
  })

  it('is instanceof Error', () => {
    const err = new LeaderboardApiError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(LeaderboardApiError)
  })

  it('works with optional parameters', () => {
    const err = new LeaderboardApiError('msg')
    expect(err.code).toBeUndefined()
    expect(err.retryAfter).toBeUndefined()
  })
})
