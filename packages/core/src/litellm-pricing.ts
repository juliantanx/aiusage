import type { PriceEntry } from './pricing.js'

// Which price each model key gets from the LiteLLM price file
// (model_prices_and_context_window.json). Shared by the CLI's price sync
// (packages/cli/src/pricing-registry.ts) and the site's
// (packages/site/src/lib/server/admin/operations.ts), so that both price a
// model the same way.

/** One entry of the LiteLLM price file, as far as pricing reads it. */
export interface LitellmEntry {
  input_cost_per_token?: number
  output_cost_per_token?: number
  cache_read_input_token_cost?: number
  cache_creation_input_token_cost?: number
  input_cost_per_second?: number
  output_cost_per_second?: number
  litellm_provider?: string
  mode?: string
}

function normalizeProvider(provider: string | undefined): string {
  return (provider ?? '').trim().toLowerCase()
}

export function normalizeLitellmModelKey(sourceModelId: string): string {
  const trimmed = sourceModelId.trim()
  const slash = trimmed.indexOf('/')
  return slash > 0 ? trimmed.slice(slash + 1) : trimmed
}

/**
 * Who prices a model key that several LiteLLM entries reduce to when none of
 * them is listed under the key itself: the company that develops the model
 * first, in this order, because its rate is the reference the others mark up
 * or discount. The order only matters when two of them list the same key
 * (Alibaba's `dashscope` also hosts GLM, DeepSeek and Kimi models, so it sits
 * behind their developers).
 */
const LITELLM_DEVELOPER_PROVIDERS = [
  'openai', 'anthropic', 'gemini', 'xai', 'deepseek', 'mistral', 'moonshot', 'zai', 'minimax',
  'cohere_chat', 'cohere', 'meta', 'ai21', 'dashscope',
]

/**
 * Resellers that set their own rate on other providers' models: asked last.
 * aihubmix lists the first-party Claude models 10% above Anthropic's rate.
 */
const LITELLM_RESELLER_PROVIDERS = ['aihubmix']

function litellmProviderRank(provider: string): number {
  const developer = LITELLM_DEVELOPER_PROVIDERS.indexOf(provider)
  if (developer >= 0) return developer
  return LITELLM_DEVELOPER_PROVIDERS.length + (LITELLM_RESELLER_PROVIDERS.includes(provider) ? 1 : 0)
}

export interface LitellmCandidate {
  sourceModelId: string
  modelKey: string
  provider: string
  price: PriceEntry
}

/**
 * Picks the entry that prices `key`, independent of the order of the file:
 * an entry with a real price before one priced at zero (LiteLLM lists free
 * tiers and not-yet-known prices as 0), then the entry listed under the key
 * itself, then the provider order above, then an entry that prices cache
 * reads before one that does not (cached tokens would cost nothing), then
 * provider name and id.
 */
export function pickLitellmOwner(key: string, candidates: LitellmCandidate[]): LitellmCandidate {
  const order = (c: LitellmCandidate): [number, number, number, number, string, string] => [
    c.price.input === 0 && c.price.output === 0 ? 1 : 0,
    c.sourceModelId === key ? 0 : 1,
    litellmProviderRank(c.provider),
    c.price.cacheRead == null ? 1 : 0,
    c.provider,
    c.sourceModelId,
  ]
  let best = candidates[0]
  let bestOrder = order(best)
  for (const candidate of candidates.slice(1)) {
    const candidateOrder = order(candidate)
    const diff = candidateOrder.findIndex((value, index) => value !== bestOrder[index])
    if (diff >= 0 && candidateOrder[diff] < bestOrder[diff]) {
      best = candidate
      bestOrder = candidateOrder
    }
  }
  return best
}

export interface LitellmPricingPlan {
  prices: LitellmCandidate[]
  /** `datedShortcut` marks `claude-x` standing in for `claude-x-20250101`. */
  aliases: Array<{ alias: string; modelKey: string; provider: string; datedShortcut: boolean }>
  skipped: number
}

/**
 * Decides which price each registry key gets from a LiteLLM price file.
 *
 * `normalizeModelKey` reduces `aihubmix/claude-haiku-4-5`,
 * `vertex_ai/claude-haiku-4-5` and `claude-haiku-4-5` to one key. Writing
 * every entry to that key let the last one in the file win, so a reseller's
 * rate replaced the first-party one (issue #92). Here each key has one owner
 * (`pickLitellmOwner`) and only the owner's price is stored. The set of keys
 * is the same as before. Every other entry stays reachable by its full id as
 * an alias of the key, as it already was, so `aihubmix/claude-haiku-4-5` is
 * priced at the owner's rate; its own rate is not kept. Giving such entries
 * a price row of their own would put provider-prefixed keys into the prefix
 * matching of `resolvePriceFromRegistry`, where a longer prefixed key beats a
 * more specific un-prefixed one.
 *
 * A prefixed id can itself be the key other entries reduce to
 * (`deepseek/deepseek-r1` for `novita/deepseek/deepseek-r1`); it then owns
 * that key as the entry listed under it, and is aliased to that row.
 *
 * Aliases are resolved before exact keys, so every key that carries a price
 * is aliased to itself, and the dated Claude shortcut (`claude-x` for
 * `claude-x-20250101`) is planned only for a name the file does not price,
 * pointing at the newest snapshot. The sync still has to check the shortcut
 * against prices the file does not list (`datedShortcut`).
 *
 * Ids are compared after trimming; of two ids that trim to the same text the
 * first in code-unit order is used and the other is counted as skipped.
 */
export function planLitellmPricing(data: Record<string, LitellmEntry>): LitellmPricingPlan {
  const entries: LitellmCandidate[] = []
  let skipped = 0
  const byId = new Map<string, LitellmCandidate>()
  for (const rawModelId of Object.keys(data).sort()) {
    const parsed = litellmEntryToPrice(rawModelId, data[rawModelId])
    const sourceModelId = rawModelId.trim()
    if (!parsed || byId.has(sourceModelId)) { skipped++; continue }
    const entry = { ...parsed, sourceModelId }
    byId.set(sourceModelId, entry)
    entries.push(entry)
  }

  const byKey = new Map<string, LitellmCandidate[]>()
  for (const entry of entries) {
    const sameKey = byKey.get(entry.modelKey)
    if (sameKey) sameKey.push(entry)
    else byKey.set(entry.modelKey, [entry])
  }

  const owners = new Map<string, LitellmCandidate>()
  for (const [key, sameKey] of byKey) {
    // `deepseek/deepseek-r1` is listed under the key that
    // `novita/deepseek/deepseek-r1` reduces to, so it competes for it too.
    const listed = byId.get(key)
    owners.set(key, pickLitellmOwner(key, listed && !sameKey.includes(listed) ? [...sameKey, listed] : sameKey))
  }

  const aliases = new Map<string, { modelKey: string; provider: string; datedShortcut: boolean }>()
  for (const key of [...owners.keys()].sort()) {
    if (!key.startsWith('claude-')) continue
    const undated = key.replace(/-\d{8}$/, '')
    if (undated && undated !== key) aliases.set(undated, { modelKey: key, provider: owners.get(key)!.provider, datedShortcut: true })
  }
  for (const entry of entries) {
    if (!owners.has(entry.sourceModelId)) aliases.set(entry.sourceModelId, { modelKey: entry.modelKey, provider: entry.provider, datedShortcut: false })
  }
  for (const [key, owner] of owners) aliases.set(key, { modelKey: key, provider: owner.provider, datedShortcut: false })

  return {
    prices: [...owners].map(([modelKey, owner]) => ({ ...owner, modelKey })),
    aliases: [...aliases].map(([alias, target]) => ({ alias, ...target })),
    skipped,
  }
}

export function litellmEntryToPrice(sourceModelId: string, entry: LitellmEntry): { modelKey: string; provider: string; price: PriceEntry } | null {
  if (entry.mode && entry.mode !== 'chat' && entry.mode !== 'completion' && entry.mode !== 'responses') return null
  if (entry.input_cost_per_second != null || entry.output_cost_per_second != null) return null
  if (typeof entry.input_cost_per_token !== 'number' || typeof entry.output_cost_per_token !== 'number') return null

  const modelKey = normalizeLitellmModelKey(sourceModelId)
  if (!modelKey || modelKey.includes('*')) return null

  return {
    modelKey,
    provider: normalizeProvider(entry.litellm_provider),
    price: {
      input: entry.input_cost_per_token * 1_000_000,
      output: entry.output_cost_per_token * 1_000_000,
      cacheRead: typeof entry.cache_read_input_token_cost === 'number' ? entry.cache_read_input_token_cost * 1_000_000 : undefined,
      cacheWrite: typeof entry.cache_creation_input_token_cost === 'number' ? entry.cache_creation_input_token_cost * 1_000_000 : undefined,
      currency: 'USD',
    },
  }
}
