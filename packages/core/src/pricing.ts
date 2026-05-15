export interface PriceEntry {
  input: number        // USD per 1M tokens
  output: number       // USD per 1M tokens
  cacheRead?: number   // USD per 1M tokens
  cacheWrite?: number  // USD per 1M tokens
  thinking?: number    // USD per 1M tokens
}

export const DEFAULT_PRICE_TABLE: Record<string, PriceEntry> = {
  // Anthropic — https://platform.claude.com/docs/en/about-claude/pricing
  'claude-opus-4-7':       { input: 5,     output: 25,   cacheRead: 0.5,    cacheWrite: 6.25 },
  'claude-opus-4-6':       { input: 5,     output: 25,   cacheRead: 0.5,    cacheWrite: 6.25 },
  'claude-sonnet-4-6':     { input: 3,     output: 15,   cacheRead: 0.3,    cacheWrite: 3.75 },
  'claude-sonnet-4-5':     { input: 3,     output: 15,   cacheRead: 0.3,    cacheWrite: 3.75 },
  'claude-haiku-4-5':      { input: 1,     output: 5,    cacheRead: 0.1,    cacheWrite: 1.25 },
  // OpenAI — https://developers.openai.com/api/docs/pricing
  'gpt-5.5-pro':           { input: 30,    output: 180 },
  'gpt-5.5':               { input: 5,     output: 30 },
  'gpt-5.4-pro':           { input: 30,    output: 180 },
  'gpt-5.4-mini':          { input: 0.75,  output: 4.5 },
  'gpt-5.4-nano':          { input: 0.2,   output: 1.25 },
  'gpt-5.4':               { input: 2.5,   output: 15 },
  'gpt-5.3-codex':         { input: 1.75,  output: 14 },
  'gpt-4o-mini':           { input: 0.15,  output: 0.6 },
  'gpt-4o':                { input: 2.5,   output: 10 },
  'gpt-4.1':               { input: 2,     output: 8 },
  'o4-mini':               { input: 1.1,   output: 4.4 },
  'o3':                    { input: 2,     output: 8 },
  // Google Gemini — https://ai.google.dev/gemini-api/docs/pricing
  'gemini-3.1-pro':        { input: 2,     output: 12 },
  'gemini-3.1-flash-lite': { input: 0.25,  output: 1.5 },
  'gemini-3-flash':        { input: 0.5,   output: 3 },
  'gemini-2.5-pro':        { input: 1.25,  output: 10 },
  'gemini-2.5-flash-lite': { input: 0.1,   output: 0.4 },
  'gemini-2.5-flash':      { input: 0.3,   output: 2.5 },
  'gemini-2.0-flash':      { input: 0.1,   output: 0.4 },
  // DeepSeek — https://api-docs.deepseek.com/quick_start/pricing
  'deepseek-v4-pro':       { input: 1.74,  output: 3.48, cacheRead: 0.0145 },
  'deepseek-v4-flash':     { input: 0.14,  output: 0.28, cacheRead: 0.0028 },
}

// Runtime-mutable price table (user overrides merge with defaults)
let userOverrides: Record<string, PriceEntry> = {}

export const PRICE_TABLE: Record<string, PriceEntry> = { ...DEFAULT_PRICE_TABLE }

export function getPriceTable(): Record<string, PriceEntry> {
  return { ...DEFAULT_PRICE_TABLE, ...userOverrides }
}

export function setPriceOverride(model: string, entry: PriceEntry): void {
  userOverrides[model] = entry
  PRICE_TABLE[model] = entry
}

export function removePriceOverride(model: string): void {
  delete userOverrides[model]
  if (DEFAULT_PRICE_TABLE[model]) {
    PRICE_TABLE[model] = DEFAULT_PRICE_TABLE[model]
  } else {
    delete PRICE_TABLE[model]
  }
}

export function getUserOverrides(): Record<string, PriceEntry> {
  return { ...userOverrides }
}

const PROVIDER_PREFIXES = [
  'accounts/fireworks/models/',
  'moonshotai/',
  'z-ai/',
  'zai-org/',
  'frank/',
  'nvidia/',
]

/**
 * Resolve price for a model: exact match first, then prefix match.
 * Strips known provider prefixes before matching.
 * e.g. 'claude-haiku-4-5-20251001' matches 'claude-haiku-4-5'
 *      'z-ai/glm-5-20260211' matches 'glm-5'
 */
export function resolvePrice(model: string): PriceEntry | undefined {
  // Exact match
  if (PRICE_TABLE[model]) return PRICE_TABLE[model]

  // Strip provider prefix and try again
  let stripped = model
  for (const prefix of PROVIDER_PREFIXES) {
    if (stripped.startsWith(prefix)) {
      stripped = stripped.slice(prefix.length)
      break
    }
  }
  if (stripped !== model) {
    const lc = stripped.toLowerCase()
    if (PRICE_TABLE[lc]) return PRICE_TABLE[lc]
    if (PRICE_TABLE[stripped]) return PRICE_TABLE[stripped]
  }

  // Prefix match (longest prefix wins) — try original, stripped, and lowercase variants
  let bestPrefix = ''
  let bestEntry: PriceEntry | undefined
  const candidates = [model, stripped, stripped.toLowerCase()]
  for (const c of candidates) {
    for (const [prefix, entry] of Object.entries(PRICE_TABLE)) {
      if (c.startsWith(prefix) && prefix.length > bestPrefix.length) {
        bestPrefix = prefix
        bestEntry = entry
      }
    }
  }
  return bestEntry
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
  const price = resolvePrice(model)
  if (!price) return 0

  const inputCost = (tokens.inputTokens / 1_000_000) * price.input
  const outputCost = (tokens.outputTokens / 1_000_000) * price.output
  const cacheReadCost = (tokens.cacheReadTokens / 1_000_000) * (price.cacheRead ?? 0)
  const cacheWriteCost = (tokens.cacheWriteTokens / 1_000_000) * (price.cacheWrite ?? 0)
  const thinkingPrice = price.thinking ?? price.output  // Fallback to output price
  const thinkingCost = (tokens.thinkingTokens / 1_000_000) * thinkingPrice

  return inputCost + outputCost + cacheReadCost + cacheWriteCost + thinkingCost
}
