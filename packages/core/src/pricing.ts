export interface PriceEntry {
  input: number        // USD per 1M tokens
  output: number       // USD per 1M tokens
  cacheRead?: number   // USD per 1M tokens
  cacheWrite?: number  // USD per 1M tokens
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
  // Kimi (Moonshot AI) — https://platform.kimi.ai/docs/pricing/chat
  'kimi-k2.6':             { input: 0.95,  output: 4.0,  cacheRead: 0.16 },
  'kimi-k2.5':             { input: 0.6,   output: 3.0,  cacheRead: 0.1 },
  'kimi-k2-turbo':         { input: 1.15,  output: 8.0,  cacheRead: 0.15 },
  'kimi-k2':               { input: 0.6,   output: 2.5,  cacheRead: 0.15 },
  'moonshot-v1-128k':      { input: 2.0,   output: 5.0 },
  'moonshot-v1-32k':       { input: 1.0,   output: 3.0 },
  'moonshot-v1-8k':        { input: 0.2,   output: 2.0 },
  // GLM (Z.ai / Zhipu AI) — https://docs.z.ai/guides/overview/pricing
  'glm-5.1':               { input: 1.4,   output: 4.4 },
  'glm-5p1':               { input: 1.4,   output: 4.4 },  // Fireworks alias (accounts/fireworks/models/glm-5p1)
  'glm-5-turbo':           { input: 1.2,   output: 4.0 },
  'glm-5':                 { input: 1.0,   output: 3.2 },
  'glm-4.7-flashx':        { input: 0.07,  output: 0.4 },
  'glm-4.7':               { input: 0.6,   output: 2.2 },
  'glm-4.6':               { input: 0.6,   output: 2.2 },
  'glm-4.5-x':             { input: 2.2,   output: 8.9 },
  'glm-4.5-airx':          { input: 1.1,   output: 4.5 },
  'glm-4.5-air':           { input: 0.2,   output: 1.1 },
  'glm-4.5':               { input: 0.6,   output: 2.2 },
  // Qwen (Alibaba Cloud) — https://www.alibabacloud.com/help/en/model-studio/model-pricing
  'qwen3.6-plus':          { input: 0.28,  output: 1.66 },
  'qwen3-235b':            { input: 0.7,   output: 2.8 },
  'qwen3-32b':             { input: 0.16,  output: 0.64 },
  'qwen3-30b':             { input: 0.2,   output: 0.8 },
  'qwen-max':              { input: 1.6,   output: 6.4 },
  'qwen-plus':             { input: 0.4,   output: 1.2 },
  'qwen-turbo':            { input: 0.05,  output: 0.2 },
  'qwen-long':             { input: 0.072, output: 0.287 },
  'qwen2.5-72b':           { input: 1.4,   output: 5.6 },
  'qwen2.5-7b':            { input: 0.175, output: 0.7 },
  // MiniMax — https://platform.minimaxi.com/docs/guides/pricing-paygo
  'minimax-m2.7':          { input: 0.29,  output: 1.16, cacheRead: 0.058, cacheWrite: 0.362 },
  'minimax-m2.5':          { input: 0.29,  output: 1.16, cacheRead: 0.029, cacheWrite: 0.362 },
  // Mistral AI — https://mistral.ai/pricing
  'mistral-large':         { input: 0.5,   output: 1.5 },
  'mistral-medium':        { input: 0.4,   output: 2.0 },
  'mistral-small':         { input: 0.1,   output: 0.3 },
  'codestral':             { input: 0.3,   output: 0.9 },
  'open-mistral-nemo':     { input: 0.02,  output: 0.03 },
  'open-mixtral-8x22b':    { input: 1.2,   output: 1.2 },
  'ministral-8b':          { input: 0.1,   output: 0.1 },
  'ministral-3b':          { input: 0.04,  output: 0.04 },
  'pixtral-12b':           { input: 0.1,   output: 0.1 },
  // xAI Grok — https://docs.x.ai/developers/models
  'grok-4-1-fast':         { input: 0.2,   output: 0.5 },
  'grok-4':                { input: 1.25,  output: 2.5 },
  // Cohere — https://cohere.com/pricing
  'command-r-plus':        { input: 2.5,   output: 10.0 },
  'command-r':             { input: 0.15,  output: 0.6 },
  // Doubao (ByteDance) — https://www.volcengine.com/docs/82379/1544106
  'doubao-seed-2.0-pro':   { input: 0.514, output: 2.57 },
  'doubao-seed-2.0-code':  { input: 0.467, output: 2.34 },
  'doubao-seed-2.0-lite':  { input: 0.088, output: 0.526 },
  'doubao-seed-2.0-mini':  { input: 0.029, output: 0.292 },
  'doubao-seed-1.6-flash': { input: 0.022, output: 0.219 },
  'doubao-seed-1.6-lite':  { input: 0.044, output: 0.35 },
  'doubao-seed-1.6':       { input: 0.117, output: 1.168 },
  'doubao-1.5-pro':        { input: 0.117, output: 0.292 },
  'doubao-1.5-lite':       { input: 0.044, output: 0.088 },
  // Hunyuan (Tencent) — https://cloud.tencent.com/document/product/1729
  'hunyuan-t1':            { input: 0.066, output: 0.26,  cacheRead: 0.029 },
  'hunyuan-a13b':          { input: 0.14,  output: 0.57 },
  // ERNIE (Baidu) — https://cloud.baidu.com/doc/WENXINWORKSHOP/s/Blfmc9dlf
  'ernie-4.5-300b':        { input: 0.28,  output: 0.9 },
  'ernie-4.5-21b':         { input: 0.07,  output: 0.28 },
  'ernie-x1':              { input: 0.28,  output: 1.1 },
}

// Runtime-mutable price table (user overrides merge with defaults)
let userOverrides: Record<string, PriceEntry> = {}

export let PRICE_TABLE: Record<string, PriceEntry> = { ...DEFAULT_PRICE_TABLE }

export function getPriceTable(): Record<string, PriceEntry> {
  return { ...DEFAULT_PRICE_TABLE, ...userOverrides }
}

export function setPriceOverride(model: string, entry: PriceEntry): void {
  userOverrides = { ...userOverrides, [model]: entry }
  PRICE_TABLE = { ...DEFAULT_PRICE_TABLE, ...userOverrides }
}

export function removePriceOverride(model: string): void {
  const { [model]: _, ...rest } = userOverrides
  userOverrides = rest
  PRICE_TABLE = { ...DEFAULT_PRICE_TABLE, ...userOverrides }
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
  const thinkingCost = (tokens.thinkingTokens / 1_000_000) * price.output

  return inputCost + outputCost + cacheReadCost + cacheWriteCost + thinkingCost
}
