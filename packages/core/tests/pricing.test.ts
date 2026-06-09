import { describe, it, expect } from 'vitest'
import { PRICE_TABLE, calculateCost, resolvePrice } from '../src/pricing.js'
import { FALLBACK_RATE } from '../src/exchange-rate.js'
import { TEST_PRICE_TABLE } from './setup.js'

describe('PRICE_TABLE', () => {
  it('contains expected models', () => {
    expect(PRICE_TABLE).toEqual(TEST_PRICE_TABLE)
    expect(PRICE_TABLE).toHaveProperty('claude-opus-4-6')
    expect(PRICE_TABLE).toHaveProperty('claude-sonnet-4-6')
    expect(PRICE_TABLE).toHaveProperty('gpt-4o')
    expect(PRICE_TABLE).toHaveProperty('kimi-k2')
    expect(PRICE_TABLE).toHaveProperty('qoder-ultimate')
  })

  it('has correct price structure', () => {
    const model = PRICE_TABLE['claude-sonnet-4-6']
    expect(model).toHaveProperty('input')
    expect(model).toHaveProperty('output')
    expect(model).toHaveProperty('cacheRead')
    expect(model).toHaveProperty('cacheWrite')
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
    // (1000/1M * 5) + (500/1M * 25) + (1000/1M * 25) — thinking uses output price
    expect(cost).toBeCloseTo(0.005 + 0.0125 + 0.025, 6)
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

  it('calculates qoder tier cost estimates', () => {
    const cost = calculateCost('qoder-ultimate', {
      inputTokens: 1000000,
      outputTokens: 500000,
      cacheReadTokens: 250000,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
    expect(cost).toBeCloseTo(2.8, 6)
  })

  it('does not treat bare qoder tier names as global model aliases', () => {
    const cost = calculateCost('ultimate', {
      inputTokens: 1000000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
    expect(cost).toBe(0)
  })

  it('converts CNY model cost to USD using exchangeRate', () => {
    // deepseek-v4-pro has currency: 'CNY' with input: 3.13, output: 6.26
    // 1000 input tokens + 500 output tokens
    // CNY cost: (1000/1M * 3.13) + (500/1M * 6.26) = 0.00313 + 0.00313 = 0.00626 CNY
    // USD cost: 0.00626 * 0.14 = 0.0008764
    const cost = calculateCost('deepseek-v4-pro', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    }, 0.14)
    expect(cost).toBeCloseTo(0.0008764, 6)
  })

  it('uses FALLBACK_RATE when no exchangeRate provided for CNY model', () => {
    const cost = calculateCost('deepseek-v4-pro', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
    // CNY cost: 0.00626, USD cost: 0.00626 * FALLBACK_RATE
    expect(cost).toBeCloseTo(0.00626 * FALLBACK_RATE, 6)
  })

  it('does not convert USD model even when exchangeRate is provided', () => {
    const cost = calculateCost('claude-sonnet-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    }, 0.14)
    // Should still be plain USD: (1000/1M * 3) + (500/1M * 15) = 0.0105
    expect(cost).toBeCloseTo(0.0105, 6)
  })

  it('handles CNY model with cache tokens', () => {
    // deepseek-v4-pro: input: 3.13, output: 6.26, cacheRead: 0.026, currency: 'CNY'
    const cost = calculateCost('deepseek-v4-pro', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 2000,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    }, 0.14)
    // CNY: (1000/1M * 3.13) + (500/1M * 6.26) + (2000/1M * 0.026) = 0.00313 + 0.00313 + 0.000052 = 0.006312
    // USD: 0.006312 * 0.14 = 0.00088368
    expect(cost).toBeCloseTo(0.00088368, 6)
  })
})

describe('resolvePrice', () => {
  it('matches longest prefix — kimi-k2-something-unknown resolves to kimi-k2', () => {
    // kimi-k2-turbo is also a prefix candidate, but kimi-k2 is shorter;
    // the unknown suffix does NOT match kimi-k2-turbo exactly, so longest
    // actual prefix match is kimi-k2 (7 chars vs kimi-k2-turbo which is 13
    // chars and does NOT match "kimi-k2-something-unknown").
    const entry = resolvePrice('kimi-k2-something-unknown')
    expect(entry).toBeDefined()
    expect(entry).toEqual(PRICE_TABLE['kimi-k2'])
  })
})
