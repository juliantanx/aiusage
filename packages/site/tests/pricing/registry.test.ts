import { describe, expect, it } from 'vitest'
import { calculateRegistryCost, resolvePriceFromRegistry, type PricingRegistry } from '../../src/lib/server/pricing/registry.js'

describe('pricing registry', () => {
  it('resolves exact aliases before falling back to model keys', () => {
    const registry: PricingRegistry = {
      priceTable: {
        'gpt-4o': { input: 2, output: 8 },
        'openai/gpt-4o': { input: 99, output: 99 },
      },
      aliases: new Map([
        ['openai/gpt-4o', { input: 1, output: 3 }],
      ]),
    }

    expect(resolvePriceFromRegistry('openai/gpt-4o', registry)).toEqual({ input: 1, output: 3 })
  })

  it('uses core fallback matching for non-aliased model ids', () => {
    const registry: PricingRegistry = {
      priceTable: {
        'claude-sonnet-4': { input: 3, output: 15 },
      },
      aliases: new Map(),
    }

    const price = resolvePriceFromRegistry('claude-sonnet-4-20250514', registry)
    expect(price).toEqual({ input: 3, output: 15 })
    expect(calculateRegistryCost(price!, {
      input_tokens: 1_000_000,
      output_tokens: 500_000,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      thinking_tokens: 0,
    })).toBe(10.5)
  })
})
