import { setRuntimePriceTable, type PriceEntry } from '../src/pricing.js'

export const TEST_PRICE_TABLE: Record<string, PriceEntry> = {
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'gpt-4o': { input: 2.5, output: 10 },
  'deepseek-v4-pro': { input: 3.13, output: 6.26, cacheRead: 0.026, currency: 'CNY' },
  'kimi-k2': { input: 4.3, output: 18, cacheRead: 1.08, currency: 'CNY' },
  'kimi-k2-turbo': { input: 8.3, output: 57.6, cacheRead: 1.08, currency: 'CNY' },
  'qoder-ultimate': { input: 1.6, output: 1.6, cacheRead: 1.6, cacheWrite: 1.6 },
}

setRuntimePriceTable(TEST_PRICE_TABLE)
