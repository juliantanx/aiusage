export interface PriceEntry {
  input: number        // USD per 1M tokens
  output: number       // USD per 1M tokens
  cacheRead?: number   // USD per 1M tokens
  cacheWrite?: number  // USD per 1M tokens
  thinking?: number    // USD per 1M tokens
}

export const PRICE_TABLE: Record<string, PriceEntry> = {
  'claude-opus-4-6':    { input: 15,   output: 75,  cacheRead: 1.5,  cacheWrite: 3.75, thinking: 75 },
  'claude-sonnet-4-6':  { input: 3,    output: 15,  cacheRead: 0.3,  cacheWrite: 0.375, thinking: 15 },
  'claude-haiku-4-5':   { input: 0.8,  output: 4,   cacheRead: 0.08, cacheWrite: 0.1, thinking: 4 },
  'gpt-4.1':            { input: 2,    output: 8 },
  'gpt-4o':             { input: 2.5,  output: 10 },
  'o4-mini':            { input: 1.1,  output: 4.4 },
}

export function calculateCost(
  model: string,
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    thinkingTokens: number
  }
): number {
  const price = PRICE_TABLE[model]
  if (!price) return 0

  const inputCost = (tokens.inputTokens / 1_000_000) * price.input
  const outputCost = (tokens.outputTokens / 1_000_000) * price.output
  const cacheReadCost = (tokens.cacheReadTokens / 1_000_000) * (price.cacheRead ?? 0)
  const cacheWriteCost = (tokens.cacheWriteTokens / 1_000_000) * (price.cacheWrite ?? 0)
  const thinkingPrice = price.thinking ?? price.output  // Fallback to output price
  const thinkingCost = (tokens.thinkingTokens / 1_000_000) * thinkingPrice

  return inputCost + outputCost + cacheReadCost + cacheWriteCost + thinkingCost
}
