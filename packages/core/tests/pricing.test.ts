import { describe, it, expect } from 'vitest'
import { PRICE_TABLE, calculateCost } from '../src/pricing.js'

describe('PRICE_TABLE', () => {
  it('contains expected models', () => {
    expect(PRICE_TABLE).toHaveProperty('claude-opus-4-6')
    expect(PRICE_TABLE).toHaveProperty('claude-sonnet-4-6')
    expect(PRICE_TABLE).toHaveProperty('claude-haiku-4-5')
    expect(PRICE_TABLE).toHaveProperty('gpt-4.1')
    expect(PRICE_TABLE).toHaveProperty('gpt-4o')
    expect(PRICE_TABLE).toHaveProperty('o4-mini')
  })

  it('has correct price structure', () => {
    const model = PRICE_TABLE['claude-sonnet-4-6']
    expect(model).toHaveProperty('input')
    expect(model).toHaveProperty('output')
    expect(model).toHaveProperty('cacheRead')
    expect(model).toHaveProperty('cacheWrite')
    expect(model).toHaveProperty('thinking')
  })
})

describe('calculateCost', () => {
  it('calculates cost for claude-sonnet-4-6', () => {
    // Input: 1000 tokens, Output: 500 tokens
    // Expected: (1000/1M * 3) + (500/1M * 15) = 0.003 + 0.0075 = 0.0105
    const cost = calculateCost('claude-sonnet-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
    expect(cost).toBeCloseTo(0.0105, 6)
  })

  it('calculates cost with cache read tokens', () => {
    const cost = calculateCost('claude-sonnet-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 2000,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
    // (1000/1M * 3) + (500/1M * 15) + (2000/1M * 0.3)
    expect(cost).toBeCloseTo(0.0105 + 0.0006, 6)
  })

  it('calculates cost with thinking tokens', () => {
    const cost = calculateCost('claude-opus-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 1000,
    })
    // (1000/1M * 15) + (500/1M * 75) + (1000/1M * 75)
    expect(cost).toBeCloseTo(0.015 + 0.0375 + 0.075, 6)
  })

  it('returns 0 for unknown model', () => {
    const cost = calculateCost('unknown-model', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
    expect(cost).toBe(0)
  })

  it('handles model without cache/thinking prices', () => {
    const cost = calculateCost('gpt-4o', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
    // (1000/1M * 2.5) + (500/1M * 10)
    expect(cost).toBeCloseTo(0.0025 + 0.005, 6)
  })

  it('uses output price for thinking when thinking price not set', () => {
    // gpt-4o doesn't have thinking price, should use output price
    const cost = calculateCost('gpt-4o', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 1000,
    })
    // (1000/1M * 10) - uses output price for thinking
    expect(cost).toBeCloseTo(0.01, 6)
  })
})
