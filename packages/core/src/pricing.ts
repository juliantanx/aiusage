import { FALLBACK_RATE } from './exchange-rate.js'

export interface PriceEntry {
  input: number        // per 1M tokens (in currency unit)
  output: number       // per 1M tokens (in currency unit)
  cacheRead?: number   // per 1M tokens (in currency unit)
  cacheWrite?: number  // per 1M tokens (in currency unit)
  currency?: 'CNY' | 'USD'  // defaults to 'USD' if omitted
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
  'deepseek-v4-pro':       { input: 12.6,  output: 25.2, cacheRead: 0.105,  currency: 'CNY' },
  'deepseek-v4-flash':     { input: 1.0,   output: 2.0,  cacheRead: 0.02,   currency: 'CNY' },
  // Kimi (Moonshot AI) — https://platform.kimi.ai/docs/pricing/chat
  'kimi-k2.6':             { input: 6.9,   output: 29.0, cacheRead: 1.15,   currency: 'CNY' },
  'kimi-k2.5':             { input: 4.3,   output: 21.6, cacheRead: 0.72,   currency: 'CNY' },
  'kimi-k2-turbo':         { input: 8.3,   output: 57.6, cacheRead: 1.08,   currency: 'CNY' },
  'kimi-k2':               { input: 4.3,   output: 18.0, cacheRead: 1.08,   currency: 'CNY' },
  'moonshot-v1-128k':      { input: 14.4,  output: 36.0,                    currency: 'CNY' },
  'moonshot-v1-32k':       { input: 7.2,   output: 21.6,                    currency: 'CNY' },
  'moonshot-v1-8k':        { input: 1.44,  output: 14.4,                    currency: 'CNY' },
  // GLM (Z.ai / Zhipu AI) — https://docs.z.ai/guides/overview/pricing — TODO: verify against official pricing
  'glm-5.1':               { input: 10.0,  output: 32.0,                    currency: 'CNY' },
  'glm-5p1':               { input: 10.0,  output: 32.0,                    currency: 'CNY' },  // Fireworks alias (accounts/fireworks/models/glm-5p1)
  'glm-5-turbo':           { input: 8.5,   output: 29.0,                    currency: 'CNY' },
  'glm-5':                 { input: 7.0,   output: 23.0,                    currency: 'CNY' },
  'glm-4.7-flashx':        { input: 0.5,   output: 2.8,                     currency: 'CNY' },
  'glm-4.7':               { input: 4.0,   output: 16.0,                    currency: 'CNY' },
  'glm-4.6':               { input: 4.0,   output: 16.0,                    currency: 'CNY' },
  'glm-4.5-x':             { input: 16.0,  output: 64.0,                    currency: 'CNY' },
  'glm-4.5-airx':          { input: 8.0,   output: 32.0,                    currency: 'CNY' },
  'glm-4.5-air':           { input: 1.4,   output: 8.0,                     currency: 'CNY' },
  'glm-4.5':               { input: 4.0,   output: 16.0,                    currency: 'CNY' },
  // Qwen (Alibaba Cloud) — https://www.alibabacloud.com/help/en/model-studio/model-pricing
  'qwen3.6-plus':          { input: 2.0,   output: 12.0,                    currency: 'CNY' },
  'qwen3-235b':            { input: 5.0,   output: 20.0,                    currency: 'CNY' },
  'qwen3-32b':             { input: 1.12,  output: 4.48,                    currency: 'CNY' },
  'qwen3-30b':             { input: 1.4,   output: 5.6,                     currency: 'CNY' },
  'qwen-max':              { input: 11.5,  output: 46.0,                    currency: 'CNY' },
  'qwen-plus':             { input: 2.8,   output: 8.4,                     currency: 'CNY' },
  'qwen-turbo':            { input: 0.35,  output: 1.4,                     currency: 'CNY' },
  'qwen-long':             { input: 0.5,   output: 2.0,                     currency: 'CNY' },
  'qwen2.5-72b':           { input: 10.0,  output: 40.0,                    currency: 'CNY' },
  'qwen2.5-7b':            { input: 1.26,  output: 5.04,                    currency: 'CNY' },
  // MiniMax — https://platform.minimaxi.com/docs/guides/pricing-paygo
  'minimax-m2.7':          { input: 2.1,   output: 8.4,  cacheRead: 0.42,  cacheWrite: 2.6,  currency: 'CNY' },
  'minimax-m2.5':          { input: 2.1,   output: 8.4,  cacheRead: 0.21,  cacheWrite: 2.6,  currency: 'CNY' },
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
  'doubao-seed-2.0-pro':   { input: 3.7,   output: 18.5,                    currency: 'CNY' },
  'doubao-seed-2.0-code':  { input: 3.36,  output: 16.8,                    currency: 'CNY' },
  'doubao-seed-2.0-lite':  { input: 0.63,  output: 3.78,                    currency: 'CNY' },
  'doubao-seed-2.0-mini':  { input: 0.21,  output: 2.1,                     currency: 'CNY' },
  'doubao-seed-1.6-flash': { input: 0.16,  output: 1.58,                    currency: 'CNY' },
  'doubao-seed-1.6-lite':  { input: 0.32,  output: 2.52,                    currency: 'CNY' },
  'doubao-seed-1.6':       { input: 0.84,  output: 8.4,                     currency: 'CNY' },
  'doubao-1.5-pro':        { input: 0.84,  output: 2.1,                     currency: 'CNY' },
  'doubao-1.5-lite':       { input: 0.32,  output: 0.63,                    currency: 'CNY' },
  // Hunyuan (Tencent) — https://cloud.tencent.com/document/product/1729 — TODO: verify against official pricing
  'hunyuan-t1':            { input: 0.48,  output: 1.87,  cacheRead: 0.21,  currency: 'CNY' },
  'hunyuan-a13b':          { input: 1.0,   output: 4.1,                     currency: 'CNY' },
  // ERNIE (Baidu) — https://cloud.baidu.com/doc/WENXINWORKSHOP/s/Blfmc9dlf — TODO: verify against official pricing
  'ernie-4.5-300b':        { input: 2.0,   output: 6.5,                     currency: 'CNY' },
  'ernie-4.5-21b':         { input: 0.5,   output: 2.0,                     currency: 'CNY' },
  'ernie-x1':              { input: 2.0,   output: 8.0,                     currency: 'CNY' },
  // Qoder credits — https://docs.qoder.com/user-guide/chat/model-tier-selector
  // Qoder publishes credit multipliers and a $0.02 / credit pack price, but
  // not a full per-token tariff. Estimate 1.0x as 1 credit / 10K tokens.
  // Ultimate uses the current official limited-time 0.8x discount.
  'qoder-auto':            { input: 2.0,   output: 2.0,   cacheRead: 2.0,   cacheWrite: 2.0 },
  'qoder-ultimate':        { input: 1.6,   output: 1.6,   cacheRead: 1.6,   cacheWrite: 1.6 },
  'qoder-performance':     { input: 2.2,   output: 2.2,   cacheRead: 2.2,   cacheWrite: 2.2 },
  'qoder-efficient':       { input: 0.6,   output: 0.6,   cacheRead: 0.6,   cacheWrite: 0.6 },
  'qoder-lite':            { input: 0,     output: 0,     cacheRead: 0,     cacheWrite: 0 },
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
  },
  exchangeRate?: number
): number {
  const price = resolvePrice(model)
  if (!price) return 0

  const inputCost = (tokens.inputTokens / 1_000_000) * price.input
  const outputCost = (tokens.outputTokens / 1_000_000) * price.output
  const cacheReadCost = (tokens.cacheReadTokens / 1_000_000) * (price.cacheRead ?? 0)
  const cacheWriteCost = (tokens.cacheWriteTokens / 1_000_000) * (price.cacheWrite ?? 0)
  const thinkingCost = (tokens.thinkingTokens / 1_000_000) * price.output

  const rawCost = inputCost + outputCost + cacheReadCost + cacheWriteCost + thinkingCost

  if (price.currency === 'CNY') {
    return rawCost * (exchangeRate ?? FALLBACK_RATE)
  }
  return rawCost
}
